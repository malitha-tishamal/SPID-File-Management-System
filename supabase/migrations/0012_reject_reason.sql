-- ===========================================================================
-- SPID File Management System — 0012: Persist rejection metadata
-- Adds: reject_reason, rejected_at, rejected_by_name columns to files table.
-- These columns surface the admin's recorded reason and rejection timestamp
-- in the new Rejected Files tab without touching any existing columns.
-- ===========================================================================

-- 1. reject_reason — free-text reason entered by the admin at rejection time
do $$ begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name   = 'files'
      and column_name  = 'reject_reason'
  ) then
    alter table public.files add column reject_reason text;
  end if;
end $$;

-- 2. rejected_at — timestamp when the rejection was recorded
do $$ begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name   = 'files'
      and column_name  = 'rejected_at'
  ) then
    alter table public.files add column rejected_at timestamptz;
    -- Back-fill: for existing REJECTED rows, use approved_at as a proxy
    update public.files
      set rejected_at = approved_at
    where status = 'REJECTED'
      and approved_at is not null
      and rejected_at is null;
  end if;
end $$;

-- 3. rejected_by_name — display name of the admin who rejected the submission
do $$ begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name   = 'files'
      and column_name  = 'rejected_by_name'
  ) then
    alter table public.files add column rejected_by_name text;
    -- Back-fill from approved_by_name for existing REJECTED rows
    update public.files
      set rejected_by_name = approved_by_name
    where status = 'REJECTED'
      and approved_by_name is not null
      and rejected_by_name is null;
  end if;
end $$;

-- Index for fast rejected-tab queries
create index if not exists idx_files_rejected_at on public.files (rejected_at desc);
