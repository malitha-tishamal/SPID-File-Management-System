-- ===========================================================================
-- SPID File Management — 0017 Part 2 of 3: file_request_extensions table.
-- Run AFTER 01-issuance-columns.sql. Idempotent.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 2. Extension requests / history
-- ---------------------------------------------------------------------------
create table if not exists public.file_request_extensions (
  id bigint generated always as identity primary key,
  request_id bigint not null
    references public.staff_file_requests (id) on delete cascade,
  file_no text not null,
  file_name text not null,
  previous_return_date date not null,
  new_return_date date not null,
  reason text not null check (char_length(trim(reason)) > 0),
  status text not null default 'PENDING'
    check (status in ('PENDING', 'APPROVED', 'REJECTED')),
  requested_by uuid not null references public.profiles (id) on delete cascade,
  requested_by_name text,
  -- An admin applying an extension directly has no separate request row:
  -- requested_by and reviewed_by are then the same person.
  reviewed_by uuid references public.profiles (id) on delete set null,
  reviewed_by_name text,
  reviewed_at timestamptz,
  review_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint file_request_extensions_dates_valid
    check (new_return_date > previous_return_date)
);

create index if not exists idx_file_request_extensions_request
  on public.file_request_extensions (request_id, created_at desc);
create index if not exists idx_file_request_extensions_status
  on public.file_request_extensions (status, created_at desc);

-- One awaiting-decision extension per request; retried submissions reuse the
-- existing pending row instead of piling up duplicates.
create unique index if not exists uq_file_request_extensions_active
  on public.file_request_extensions (request_id)
  where status = 'PENDING';

alter table public.file_request_extensions enable row level security;

drop policy if exists "staff can read own extensions" on public.file_request_extensions;
create policy "staff can read own extensions"
  on public.file_request_extensions for select to authenticated
  using (requested_by = auth.uid() or public.is_admin());

drop policy if exists "staff can create own extensions" on public.file_request_extensions;
create policy "staff can create own extensions"
  on public.file_request_extensions for insert to authenticated
  with check (requested_by = auth.uid() and public.is_approved());

drop policy if exists "admins can review extensions" on public.file_request_extensions;
create policy "admins can review extensions"
  on public.file_request_extensions for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop trigger if exists trg_file_request_extensions_updated_at on public.file_request_extensions;
create trigger trg_file_request_extensions_updated_at
before update on public.file_request_extensions
for each row execute function public.set_updated_at();

-- Ask PostgREST to reload its schema cache so the app sees the new
-- columns/table without restarting the project.
notify pgrst, 'reload schema';
