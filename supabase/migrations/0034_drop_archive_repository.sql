-- ===========================================================================
-- SPID File Management System — 0034: drop files.archive_repository
--
-- The record room was only ever the implicit default; no screen captures it.
-- 0033 made it nullable — this removes the column itself and every remaining
-- code path that carried it.
--
-- Run the application code that accompanies this migration immediately after
-- applying it: older code selects the column and will error once it is gone.
--
-- Idempotent: safe to paste into the Supabase SQL Editor and re-run.
-- ===========================================================================

alter table public.files drop column if exists archive_repository;

-- Request snapshots built while the column existed still carry the fabricated
-- room as a prefix; keep only the real location parts.
update public.staff_file_requests
set storage_location = btrim(
  regexp_replace(
    storage_location,
    '^\s*Central Record Room( \(B-02\))?\s*—?\s*',
    ''
  )
)
where storage_location ~ '^\s*Central Record Room( \(B-02\))?';

-- ---------------------------------------------------------------------------
-- staff_submit_file_request: build the snapshot from real fields only
-- ---------------------------------------------------------------------------
create or replace function public.staff_submit_file_request(
  p_requester_id uuid,
  p_file_id bigint,
  p_request_date date,
  p_duration_days bigint,
  p_priority text,
  p_file_name text default null,
  p_replace_request_id bigint default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_file public.files%rowtype;
  v_profile public.profiles%rowtype;
  v_existing public.staff_file_requests%rowtype;
  v_new public.staff_file_requests%rowtype;
  v_requested_weight integer;
  v_existing_weight integer;
  v_cancelled_id bigint := null;
  v_upgraded boolean := false;
  v_rows integer := 0;
  v_conflict jsonb := null;
  v_storage_location text;
  v_section_name text;
begin
  v_requested_weight := case upper(coalesce(p_priority, ''))
    when 'HIGH' then 3
    when 'NORMAL' then 2
    when 'LOW' then 1
    else null
  end;

  if v_requested_weight is null then
    return jsonb_build_object('outcome', 'invalid_priority');
  end if;
  if p_duration_days is null or p_duration_days < 1 then
    return jsonb_build_object('outcome', 'invalid_duration');
  end if;
  if p_request_date is null then
    return jsonb_build_object('outcome', 'invalid_date');
  end if;

  select * into v_profile from public.profiles where id = p_requester_id;
  if not found then
    return jsonb_build_object('outcome', 'forbidden');
  end if;

  -- profiles has no section_name column; it stores section_id and the display
  -- name lives on the sections table (the TS DTO derives it the same way).
  if v_profile.section_id is not null then
    select s.name into v_section_name
    from public.sections as s
    where s.id = v_profile.section_id;
  end if;

  select * into v_file from public.files where id = p_file_id;
  if not found then
    return jsonb_build_object('outcome', 'file_not_found');
  end if;
  if v_file.status is null
     or v_file.status not in ('APPROVED', 'active', 'archived') then
    return jsonb_build_object('outcome', 'file_unavailable');
  end if;

  -- Serialize submissions for this (staff member, file) pair. Row locks alone
  -- cannot protect the "no pending request exists yet" case, so an advisory
  -- lock is taken before reading.
  perform pg_advisory_xact_lock(
    hashtextextended(p_requester_id::text || ':' || p_file_id::text, 0::bigint)
  );

  select * into v_existing
  from public.staff_file_requests
  where file_id = p_file_id
    and requester_id = p_requester_id
    and status in ('PENDING', 'APPROVED')
    and returned_at is null
  order by (status = 'PENDING') desc, created_at desc, id desc
  limit 1
  for update;

  if found then
    if v_existing.status = 'APPROVED' then
      return jsonb_build_object(
        'outcome', 'already_issued',
        'request', to_jsonb(v_existing)
      );
    end if;

    v_existing_weight := case v_existing.priority
      when 'HIGH' then 3
      when 'NORMAL' then 2
      when 'LOW' then 1
      else 0
    end;

    if v_existing_weight = v_requested_weight then
      return jsonb_build_object(
        'outcome', 'duplicate_same_priority',
        'request', to_jsonb(v_existing)
      );
    end if;

    if v_requested_weight < v_existing_weight then
      return jsonb_build_object(
        'outcome', 'blocked_lower_priority',
        'request', to_jsonb(v_existing)
      );
    end if;

    if p_replace_request_id is null or p_replace_request_id <> v_existing.id then
      return jsonb_build_object(
        'outcome', 'upgrade_required',
        'request', to_jsonb(v_existing)
      );
    end if;

    -- Same transaction as the insert below: if the insert fails, this
    -- cancellation is rolled back with it and the previous request stays
    -- pending.
    update public.staff_file_requests
    set status = 'CANCELLED',
        cancellation_reason = 'Replaced by higher-priority request'
    where id = v_existing.id
      and requester_id = p_requester_id
      and status = 'PENDING';
    get diagnostics v_rows = row_count;
    if v_rows = 0 then
      return jsonb_build_object(
        'outcome', 'upgrade_conflict',
        'request', to_jsonb(v_existing)
      );
    end if;

    v_cancelled_id := v_existing.id;
    v_upgraded := true;
  end if;

  v_storage_location := concat_ws(
    ' — ',
    case
      when nullif(trim(v_file.locker_no), '') is not null
        then 'Locker ' || v_file.locker_no
    end,
    case
      when nullif(trim(v_file.shelf_name), '') is not null
        then 'Shelf ' || v_file.shelf_name
    end,
    case
      when nullif(trim(v_file.shelf_position), '') is not null
        then v_file.shelf_position || ' position'
    end
  );

  insert into public.staff_file_requests (
    file_id,
    file_no,
    file_name,
    section_name,
    storage_location,
    requester_id,
    requester_name,
    requester_email,
    requester_role,
    requester_section,
    request_date,
    duration_days,
    priority
  ) values (
    v_file.id,
    v_file.file_no,
    coalesce(nullif(trim(p_file_name), ''), v_file.file_name),
    v_file.section_name,
    v_storage_location,
    v_profile.id,
    v_profile.full_name,
    v_profile.email,
    v_profile.role,
    v_section_name,
    p_request_date,
    p_duration_days,
    upper(p_priority)
  )
  returning * into v_new;

  return jsonb_build_object(
    'outcome', case when v_upgraded then 'upgraded' else 'created' end,
    'request', to_jsonb(v_new),
    'cancelled_request_id', v_cancelled_id
  );
exception
  when unique_violation then
    -- The partial unique index fired: another submission won the race. The
    -- whole block (including any cancellation above) is rolled back.
    select to_jsonb(pending) into v_conflict
    from public.staff_file_requests as pending
    where pending.file_id = p_file_id
      and pending.requester_id = p_requester_id
      and pending.status = 'PENDING'
    limit 1;
    return jsonb_build_object(
      'outcome', 'duplicate_same_priority',
      'request', v_conflict
    );
end;
$$;

-- Server-only callable: the function trusts p_requester_id, so browser roles
-- must never be able to invoke it.
revoke all on function public.staff_submit_file_request(
  uuid, bigint, date, bigint, text, text, bigint
) from public;
revoke all on function public.staff_submit_file_request(
  uuid, bigint, date, bigint, text, text, bigint
) from anon, authenticated;
grant execute on function public.staff_submit_file_request(
  uuid, bigint, date, bigint, text, text, bigint
) to service_role;
