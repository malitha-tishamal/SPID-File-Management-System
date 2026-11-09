-- ===========================================================================
-- 0029: Request-scoped notifications — resolution tracking, semantic kinds,
-- dedupe, and cleanup of already-handled / duplicate rows.
--
-- Adds to public.notifications:
--   kind            semantic event type (FILE_ADD_REQUESTED, FILE_ISSUE_*, ...)
--   ref_type/ref_id the request the notification is about ('file' |
--                   'staff_file_request')
--   status          ACTIVE | RESOLVED  (resolved = handled by an admin/staff)
--   resolution      APPROVED | REJECTED | CANCELLED
--   resolved_at / resolved_by / resolved_by_name
--
-- Backfills kind/ref from existing dedupe_key patterns, removes duplicate
-- (user, kind, ref) rows keeping the oldest, and marks notifications RESOLVED
-- for requests that are already APPROVED/REJECTED/CANCELLED.
-- Idempotent: safe to re-run.
-- ===========================================================================

do $$ begin
  if not exists (select 1 from information_schema.columns
    where table_schema='public' and table_name='notifications' and column_name='kind') then
    alter table public.notifications add column kind text;
  end if;
  if not exists (select 1 from information_schema.columns
    where table_schema='public' and table_name='notifications' and column_name='ref_type') then
    alter table public.notifications add column ref_type text;
  end if;
  if not exists (select 1 from information_schema.columns
    where table_schema='public' and table_name='notifications' and column_name='ref_id') then
    alter table public.notifications add column ref_id bigint;
  end if;
  if not exists (select 1 from information_schema.columns
    where table_schema='public' and table_name='notifications' and column_name='status') then
    alter table public.notifications add column status text not null default 'ACTIVE';
  end if;
  if not exists (select 1 from information_schema.columns
    where table_schema='public' and table_name='notifications' and column_name='resolution') then
    alter table public.notifications add column resolution text;
  end if;
  if not exists (select 1 from information_schema.columns
    where table_schema='public' and table_name='notifications' and column_name='resolved_at') then
    alter table public.notifications add column resolved_at timestamptz;
  end if;
  if not exists (select 1 from information_schema.columns
    where table_schema='public' and table_name='notifications' and column_name='resolved_by') then
    alter table public.notifications add column resolved_by uuid references public.profiles(id) on delete set null;
  end if;
  if not exists (select 1 from information_schema.columns
    where table_schema='public' and table_name='notifications' and column_name='resolved_by_name') then
    alter table public.notifications add column resolved_by_name text;
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_constraint where conname='notifications_status_check') then
    alter table public.notifications
      add constraint notifications_status_check check (status in ('ACTIVE','RESOLVED'));
  end if;
  if not exists (select 1 from pg_constraint where conname='notifications_resolution_check') then
    alter table public.notifications
      add constraint notifications_resolution_check
      check (resolution is null or resolution in ('APPROVED','REJECTED','CANCELLED'));
  end if;
end $$;

-- One notification per recipient per request per kind. Rows without a request
-- reference (return-due warnings, account events) are unaffected.
create unique index if not exists uq_notifications_request_kind
  on public.notifications (user_id, kind, ref_type, ref_id)
  where kind is not null and ref_id is not null;

create index if not exists idx_notifications_ref
  on public.notifications (ref_type, ref_id)
  where ref_id is not null;

-- Backfill kind/ref from the dedupe_key conventions already in use.
update public.notifications
set kind = case
      when dedupe_key ~ '^file-request:[0-9]+:submitted$' then 'FILE_ISSUE_REQUESTED'
      when dedupe_key ~ '^file-request:[0-9]+:approved$' then 'FILE_ISSUE_APPROVED'
      when dedupe_key ~ '^file-request:[0-9]+:rejected$' then 'FILE_ISSUE_REJECTED'
      else kind end,
    ref_type = case
      when dedupe_key ~ '^file-request:[0-9]+:(submitted|approved|rejected)$'
        then 'staff_file_request' else ref_type end,
    ref_id = case
      when dedupe_key ~ '^file-request:[0-9]+:(submitted|approved|rejected)$'
        then split_part(dedupe_key, ':', 2)::bigint else ref_id end
where kind is null and dedupe_key is not null;

-- Remove duplicates created before the unique index existed (same recipient,
-- same request, same kind). The oldest row survives; nothing else is deleted.
do $$
declare removed int;
begin
  delete from public.notifications a
  using public.notifications b
  where a.kind is not null
    and a.user_id = b.user_id
    and a.kind = b.kind
    and a.ref_type is not distinct from b.ref_type
    and a.ref_id = b.ref_id
    and a.id > b.id;
  get diagnostics removed = row_count;
  raise notice '0029: removed % duplicate notification rows', removed;
end $$;

-- Mark request notifications RESOLVED for requests already handled, so stale
-- "pending" items disappear from every admin's Active list.
do $$
declare resolved int;
begin
  update public.notifications n
  set status = 'RESOLVED',
      resolution = case r.status
        when 'APPROVED' then 'APPROVED'
        when 'REJECTED' then 'REJECTED'
        else 'CANCELLED' end,
      resolved_at = coalesce(n.resolved_at, r.reviewed_at, r.updated_at, r.created_at, now()),
      resolved_by = coalesce(n.resolved_by, r.reviewed_by),
      read_at = coalesce(n.read_at, now())
  from public.staff_file_requests r
  where n.ref_type = 'staff_file_request'
    and n.ref_id = r.id
    and n.status = 'ACTIVE'
    and n.kind in ('FILE_ADD_REQUESTED','FILE_ISSUE_REQUESTED')
    and r.status in ('APPROVED','REJECTED','CANCELLED');
  get diagnostics resolved = row_count;
  raise notice '0029: resolved % staff-file-request notifications', resolved;

  update public.notifications n
  set status = 'RESOLVED',
      resolution = case f.status
        when 'APPROVED' then 'APPROVED'
        when 'REJECTED' then 'REJECTED'
        else 'CANCELLED' end,
      resolved_at = coalesce(n.resolved_at, f.approved_at, f.updated_at, f.created_at, now()),
      resolved_by = coalesce(n.resolved_by, f.approved_by),
      resolved_by_name = coalesce(n.resolved_by_name, f.approved_by_name, f.rejected_by_name),
      read_at = coalesce(n.read_at, now())
  from public.files f
  where n.ref_type = 'file'
    and n.ref_id = f.id
    and n.status = 'ACTIVE'
    and n.kind = 'FILE_ADD_REQUESTED'
    and f.status in ('APPROVED','REJECTED');
  get diagnostics resolved = row_count;
  raise notice '0029: resolved % file-add notifications', resolved;
end $$;
