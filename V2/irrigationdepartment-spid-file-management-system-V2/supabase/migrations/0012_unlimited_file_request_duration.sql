alter table public.staff_file_requests
  drop constraint if exists staff_file_requests_duration_days_check;

alter table public.staff_file_requests
  alter column duration_days type bigint
  using duration_days::bigint;

alter table public.staff_file_requests
  add constraint staff_file_requests_duration_days_check
  check (duration_days > 0);
