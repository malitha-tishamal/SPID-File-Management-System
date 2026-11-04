-- Section deletion checks profiles.section_id; PostgreSQL does not index FKs automatically.
create index if not exists idx_profiles_section_id
  on public.profiles (section_id);
