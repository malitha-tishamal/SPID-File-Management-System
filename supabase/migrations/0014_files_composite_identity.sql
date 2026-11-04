alter table public.files
  drop constraint if exists files_file_no_key,
  drop constraint if exists uq_files_file_name,
  drop constraint if exists uq_files_file_identity;

alter table public.files
  add constraint uq_files_file_identity unique (file_no, file_name);
