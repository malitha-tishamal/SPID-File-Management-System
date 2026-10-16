-- ===========================================================================
-- SPID File Management System — 0007: Files & Archive Records schema
-- Tables: files
-- ===========================================================================

create table if not exists public.files (
  id bigint generated always as identity primary key,
  file_no text not null unique,
  file_name text not null,
  section_name text not null,
  year integer not null,
  locker_no text,
  shelf_no text,
  shelf_position text check (shelf_position in ('Front', 'Middle', 'Back') or shelf_position is null),
  page_numbers integer default 0,
  minute_sheets_count integer default 0,
  registrar_name text,
  registrar_role text,
  registered_by uuid references auth.users (id) on delete set null,
  archive_repository text not null default 'Central Record Room (B-02)',
  status text not null default 'active' check (status in ('active', 'archived', 'issued', 'disposed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_files_file_no on public.files (file_no);
create index if not exists idx_files_section_name on public.files (section_name);
create index if not exists idx_files_year on public.files (year);
create index if not exists idx_files_created_at on public.files (created_at desc);

-- ---------------------------------------------------------------------------
-- Row Level Security policies
-- ---------------------------------------------------------------------------
alter table public.files enable row level security;

-- Read access for approved users
drop policy if exists "approved users can read files" on public.files;
create policy "approved users can read files"
  on public.files
  for select
  to authenticated
  using (public.is_approved());

-- Insert access for approved users
drop policy if exists "approved users can create files" on public.files;
create policy "approved users can create files"
  on public.files
  for insert
  to authenticated
  with check (public.is_approved());

-- Admins can update/delete files
drop policy if exists "admins can update files" on public.files;
create policy "admins can update files"
  on public.files
  for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists "admins can delete files" on public.files;
create policy "admins can delete files"
  on public.files
  for delete
  to authenticated
  using (public.is_admin());

-- Trigger for updated_at
drop trigger if exists trg_files_updated_at on public.files;
create trigger trg_files_updated_at
before update on public.files
for each row execute function public.set_updated_at();
