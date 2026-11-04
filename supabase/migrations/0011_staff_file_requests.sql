-- Staff requests to retrieve registered physical archive files.
create table if not exists public.staff_file_requests (
  id bigint generated always as identity primary key,
  file_id bigint not null references public.files (id) on delete restrict,
  file_no text not null,
  file_name text not null,
  section_name text not null,
  storage_location text not null,
  requester_id uuid not null references public.profiles (id) on delete cascade,
  requester_name text not null,
  requester_email text not null,
  requester_role text not null,
  requester_section text,
  request_date date not null,
  duration_days integer not null check (duration_days between 1 and 14),
  status text not null default 'PENDING'
    check (status in ('PENDING', 'APPROVED', 'REJECTED')),
  admin_notes text,
  reviewed_by uuid references public.profiles (id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_staff_file_requests_requester
  on public.staff_file_requests (requester_id, created_at desc);
create index if not exists idx_staff_file_requests_status
  on public.staff_file_requests (status, created_at desc);

alter table public.staff_file_requests enable row level security;

drop policy if exists "staff can read own file requests" on public.staff_file_requests;
create policy "staff can read own file requests"
  on public.staff_file_requests for select to authenticated
  using (requester_id = auth.uid());

drop policy if exists "staff can create own file requests" on public.staff_file_requests;
create policy "staff can create own file requests"
  on public.staff_file_requests for insert to authenticated
  with check (requester_id = auth.uid() and public.is_approved());

drop policy if exists "admins can read file requests" on public.staff_file_requests;
create policy "admins can read file requests"
  on public.staff_file_requests for select to authenticated
  using (public.is_admin());

drop policy if exists "admins can review file requests" on public.staff_file_requests;
create policy "admins can review file requests"
  on public.staff_file_requests for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop trigger if exists trg_staff_file_requests_updated_at on public.staff_file_requests;
create trigger trg_staff_file_requests_updated_at
before update on public.staff_file_requests
for each row execute function public.set_updated_at();
