set search_path = public, extensions;

create extension if not exists pg_trgm;

create index if not exists files_file_no_trgm_idx
  on public.files using gin (file_no gin_trgm_ops);

create index if not exists files_file_name_trgm_idx
  on public.files using gin (file_name gin_trgm_ops);

create index if not exists files_registrar_name_trgm_idx
  on public.files using gin (registrar_name gin_trgm_ops);
