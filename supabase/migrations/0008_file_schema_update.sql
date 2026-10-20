-- ===========================================================================
-- SPID File Management System — 0008: File schema update
-- Changes:
--   1. Add UNIQUE constraint on files.file_name (business key)
--   2. Rename shelf_no → shelf_name
--   3. Drop year column; add start_date and end_date
--   4. Extend status enum to include APPROVED / PENDING / REJECTED states
--   5. Add created_by, approved_by, approved_at columns
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 1. Add UNIQUE constraint on file_name
--    (The column already has NOT NULL from the original DDL.)
-- ---------------------------------------------------------------------------
do $$ begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'uq_files_file_name' and conrelid = 'public.files'::regclass
  ) then
    alter table public.files
      add constraint uq_files_file_name unique (file_name);
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 2. Rename shelf_no → shelf_name
-- ---------------------------------------------------------------------------
do $$ begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'files'
      and column_name = 'shelf_no'
  ) then
    alter table public.files rename column shelf_no to shelf_name;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 3. Replace year with start_date and end_date
-- ---------------------------------------------------------------------------

-- Add start_date (copy year as Jan 1 of that year for existing rows)
do $$ begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'files'
      and column_name = 'start_date'
  ) then
    alter table public.files add column start_date date;
    -- Back-fill from existing year column if present
    if exists (
      select 1 from information_schema.columns
      where table_schema = 'public'
        and table_name = 'files'
        and column_name = 'year'
    ) then
      update public.files set start_date = make_date(year, 1, 1) where start_date is null;
    end if;
    alter table public.files alter column start_date set not null;
    alter table public.files alter column start_date set default current_date;
  end if;
end $$;

-- Add end_date
do $$ begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'files'
      and column_name = 'end_date'
  ) then
    alter table public.files add column end_date date;
    -- Back-fill: same as start_date for existing rows (year-end would be Dec 31)
    if exists (
      select 1 from information_schema.columns
      where table_schema = 'public'
        and table_name = 'files'
        and column_name = 'year'
    ) then
      update public.files set end_date = make_date(year, 12, 31) where end_date is null;
    end if;
    alter table public.files alter column end_date set not null;
    alter table public.files alter column end_date set default current_date;
  end if;
end $$;

-- Add check constraint: end_date >= start_date
do $$ begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'check_files_date_range' and conrelid = 'public.files'::regclass
  ) then
    alter table public.files
      add constraint check_files_date_range check (end_date >= start_date);
  end if;
end $$;

-- Drop old year column (data already migrated above)
do $$ begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'files'
      and column_name = 'year'
  ) then
    alter table public.files drop column year;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 4. Extend status to include APPROVED / PENDING / REJECTED
--    Drop and recreate check constraint to allow new values.
-- ---------------------------------------------------------------------------
alter table public.files
  drop constraint if exists files_status_check;

alter table public.files
  add constraint files_status_check
    check (status in ('PENDING', 'APPROVED', 'REJECTED', 'active', 'archived', 'issued', 'disposed'));

-- ---------------------------------------------------------------------------
-- 5. Add created_by, approved_by, approved_at if not present
-- ---------------------------------------------------------------------------
do $$ begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'files' and column_name = 'created_by'
  ) then
    alter table public.files
      add column created_by uuid references auth.users(id) on delete set null;
  end if;
end $$;

do $$ begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'files' and column_name = 'approved_by'
  ) then
    alter table public.files
      add column approved_by uuid references auth.users(id) on delete set null;
  end if;
end $$;

do $$ begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'files' and column_name = 'approved_at'
  ) then
    alter table public.files add column approved_at timestamptz;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 6. Add indexes for new columns
-- ---------------------------------------------------------------------------
create index if not exists idx_files_start_date on public.files (start_date);
create index if not exists idx_files_end_date on public.files (end_date);
create index if not exists idx_files_status on public.files (status);
create index if not exists idx_files_file_name on public.files (file_name);
