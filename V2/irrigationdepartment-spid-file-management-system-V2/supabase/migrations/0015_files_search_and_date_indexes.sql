-- Indexes backing the Manage System Files date range and free-text search.
-- PostgreSQL cannot use btree indexes for ILIKE '%term%', so trigram GIN
-- indexes are used for the searchable columns.

create index if not exists idx_files_created_at
  on public.files (created_at desc);

create extension if not exists pg_trgm;

create index if not exists idx_files_file_no_trgm
  on public.files using gin (file_no gin_trgm_ops);

create index if not exists idx_files_file_name_trgm
  on public.files using gin (file_name gin_trgm_ops);

create index if not exists idx_files_section_name_trgm
  on public.files using gin (section_name gin_trgm_ops);

create index if not exists idx_files_registrar_name_trgm
  on public.files using gin (registrar_name gin_trgm_ops);

create index if not exists idx_files_locker_no_trgm
  on public.files using gin (locker_no gin_trgm_ops);

create index if not exists idx_files_shelf_name_trgm
  on public.files using gin (shelf_name gin_trgm_ops);
