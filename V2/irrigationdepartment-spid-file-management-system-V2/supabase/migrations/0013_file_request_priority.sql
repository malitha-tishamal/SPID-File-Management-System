alter table public.staff_file_requests
  add column if not exists priority text not null default 'NORMAL'
  check (priority in ('HIGH', 'NORMAL', 'LOW'));
