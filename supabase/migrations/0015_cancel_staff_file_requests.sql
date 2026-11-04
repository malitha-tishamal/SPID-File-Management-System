alter table public.staff_file_requests
  drop constraint if exists staff_file_requests_status_check;

alter table public.staff_file_requests
  add constraint staff_file_requests_status_check
  check (status in ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED'));
