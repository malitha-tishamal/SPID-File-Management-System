-- ===========================================================================
-- SPID File Management — 0017 Part 1 of 3: issuance / return columns.
-- Paste into Supabase dashboard SQL Editor and Run. Idempotent: re-run safely.
-- Fixes "column staff_file_requests.original_return_date does not exist" and
-- the "Issuance tracking columns are missing" error on Issued Files.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 1. Issuance / return fields on staff_file_requests
-- ---------------------------------------------------------------------------
do $$ begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'staff_file_requests'
      and column_name = 'original_return_date'
  ) then
    alter table public.staff_file_requests
      add column original_return_date date;
  end if;
end $$;

do $$ begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'staff_file_requests'
      and column_name = 'expected_return_date'
  ) then
    alter table public.staff_file_requests
      add column expected_return_date date;
  end if;
end $$;

do $$ begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'staff_file_requests'
      and column_name = 'issued_at'
  ) then
    alter table public.staff_file_requests add column issued_at timestamptz;
  end if;
end $$;

do $$ begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'staff_file_requests'
      and column_name = 'returned_at'
  ) then
    alter table public.staff_file_requests add column returned_at timestamptz;
  end if;
end $$;

do $$ begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'staff_file_requests'
      and column_name = 'returned_by'
  ) then
    alter table public.staff_file_requests
      add column returned_by uuid references public.profiles (id) on delete set null;
  end if;
end $$;

-- Back-fill already-approved requests so the new columns are never null for
-- historical issuances.
update public.staff_file_requests
set original_return_date = coalesce(
      original_return_date,
      (request_date + make_interval(days => least(duration_days, 3650)::int))::date
    ),
    expected_return_date = coalesce(
      expected_return_date,
      original_return_date,
      (request_date + make_interval(days => least(duration_days, 3650)::int))::date
    ),
    issued_at = coalesce(issued_at, reviewed_at)
where status = 'APPROVED'
  and (original_return_date is null or expected_return_date is null or issued_at is null);

create index if not exists idx_staff_file_requests_return
  on public.staff_file_requests (status, expected_return_date);

-- Ask PostgREST to reload its schema cache so the app sees the new
-- columns/table without restarting the project.
notify pgrst, 'reload schema';
