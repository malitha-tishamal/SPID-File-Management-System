-- ===========================================================================
-- SPID File Management System — verification for migration 0035
--
-- Run this in the Supabase SQL Editor AFTER applying
-- 0035_delete_file_with_dependents.sql.
--
-- Everything runs inside one transaction that ends with ROLLBACK, so no live
-- row is kept. Each scenario raises an exception if its assertion fails; a
-- clean run ends with "0035 verification passed".
--
-- Scenarios
--   1. file with a staff request + extension request: all three rows removed,
--      counts returned, audit row written.
--   2. file with no dependents: deleted.
--   3. an unknown child table blocks the file delete: the function raises
--      23503 and the earlier deletes are rolled back (no partial deletion).
-- ===========================================================================

begin;

do $$
declare
  v_profile_id uuid;
  v_file_id bigint;
  v_request_id bigint;
  v_plain_file_id bigint;
  v_blocked_file_id bigint;
  v_blocked_request_id bigint;
  v_result jsonb;
  v_audit_id bigint;
begin
  select id into v_profile_id
  from public.profiles
  order by created_at
  limit 1;

  if v_profile_id is null then
    raise exception '0035 verification needs at least one profile row';
  end if;

  -- -------------------------------------------------------------------------
  -- 1. File with dependent rows
  -- -------------------------------------------------------------------------
  insert into public.files (file_no, file_name, section_name, status)
  values ('TEST/DELETE/0035-A', 'Delete test A', 'Test Section', 'APPROVED')
  returning id into v_file_id;

  insert into public.staff_file_requests (
    file_id, file_no, file_name, section_name, storage_location,
    requester_id, requester_name, requester_email, requester_role,
    request_date, duration_days, status
  ) values (
    v_file_id, 'TEST/DELETE/0035-A', 'Delete test A', 'Test Section', 'Locker T',
    v_profile_id, 'Test Requester', 'test@example.invalid', 'Staff',
    current_date, 1, 'APPROVED'
  )
  returning id into v_request_id;

  insert into public.file_request_extensions (
    request_id, file_no, file_name, previous_return_date, new_return_date,
    reason, requested_by, status
  ) values (
    v_request_id, 'TEST/DELETE/0035-A', 'Delete test A',
    current_date, current_date + 1, 'Verification extension',
    v_profile_id, 'APPROVED'
  );

  select public.delete_file_with_dependents(v_file_id, v_profile_id, 'SQL verification')
  into v_result;

  if (v_result->>'outcome') <> 'deleted' then
    raise exception 'expected deleted, got %', v_result;
  end if;
  if (v_result->>'deleted_file_requests')::bigint <> 1 then
    raise exception 'expected 1 deleted request, got %', v_result->>'deleted_file_requests';
  end if;
  if (v_result->>'deleted_file_request_extensions')::bigint <> 1 then
    raise exception 'expected 1 deleted extension, got %', v_result->>'deleted_file_request_extensions';
  end if;

  if exists (select 1 from public.files where id = v_file_id) then
    raise exception 'file row still exists after delete';
  end if;
  if exists (select 1 from public.staff_file_requests where file_id = v_file_id) then
    raise exception 'staff request rows still exist after delete';
  end if;
  if exists (select 1 from public.file_request_extensions where request_id = v_request_id) then
    raise exception 'extension rows still exist after delete';
  end if;

  v_audit_id := (v_result->>'audit_id')::bigint;
  if v_audit_id is null then
    raise exception 'function did not return an audit id';
  end if;
  if not exists (
    select 1 from public.audit_logs
    where id = v_audit_id
      and action = 'file.deleted'
      and details->>'file_no' = 'TEST/DELETE/0035-A'
      and details->>'deleted_file_requests' = '1'
      and details->>'deleted_file_request_extensions' = '1'
  ) then
    raise exception 'audit row is missing or incomplete';
  end if;

  -- -------------------------------------------------------------------------
  -- 2. File with no dependents
  -- -------------------------------------------------------------------------
  insert into public.files (file_no, file_name, section_name, status)
  values ('TEST/DELETE/0035-B', 'Delete test B', 'Test Section', 'APPROVED')
  returning id into v_plain_file_id;

  select public.delete_file_with_dependents(v_plain_file_id, v_profile_id, 'SQL verification')
  into v_result;

  if (v_result->>'deleted_file_requests')::bigint <> 0
     or (v_result->>'deleted_file_request_extensions')::bigint <> 0 then
    raise exception 'expected zero dependents, got %', v_result;
  end if;
  if exists (select 1 from public.files where id = v_plain_file_id) then
    raise exception 'plain file row still exists after delete';
  end if;

  -- -------------------------------------------------------------------------
  -- 3. Unknown child table forces 23503 after child rows were deleted:
  --    the whole function call must roll back.
  -- -------------------------------------------------------------------------
  create table public._delete_test_child (
    id bigint primary key,
    file_id bigint not null references public.files (id)
  );

  insert into public.files (file_no, file_name, section_name, status)
  values ('TEST/DELETE/0035-C', 'Delete test C', 'Test Section', 'APPROVED')
  returning id into v_blocked_file_id;

  insert into public.staff_file_requests (
    file_id, file_no, file_name, section_name, storage_location,
    requester_id, requester_name, requester_email, requester_role,
    request_date, duration_days, status
  ) values (
    v_blocked_file_id, 'TEST/DELETE/0035-C', 'Delete test C', 'Test Section', 'Locker T',
    v_profile_id, 'Test Requester', 'test@example.invalid', 'Staff',
    current_date, 1, 'PENDING'
  )
  returning id into v_blocked_request_id;

  insert into public._delete_test_child (id, file_id) values (1, v_blocked_file_id);

  begin
    perform public.delete_file_with_dependents(v_blocked_file_id, v_profile_id, 'SQL verification');
    raise exception 'expected a foreign key violation';
  exception
    when foreign_key_violation then
      null; -- expected: 23503 from the unknown child table
  end;

  if not exists (select 1 from public.files where id = v_blocked_file_id) then
    raise exception 'partial delete: file row was removed before the failure';
  end if;
  if not exists (select 1 from public.staff_file_requests where id = v_blocked_request_id) then
    raise exception 'partial delete: request row was removed before the failure';
  end if;

  raise notice '0035 verification passed';
end $$;

rollback;
