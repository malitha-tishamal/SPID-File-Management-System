-- Composite indexes for Manage System Files list queries (status filter + created_at sort)
create index if not exists idx_files_status_created_at
  on public.files (status, created_at desc);

create index if not exists idx_files_registrar_name
  on public.files (registrar_name);
