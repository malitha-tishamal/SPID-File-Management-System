-- ===========================================================================
-- SPID File Management System — 0010: Add approved_by_name column to files table
-- Persists administrator display name for audit and attribution display.
-- ===========================================================================

do $$ begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'files'
      and column_name = 'approved_by_name'
  ) then
    alter table public.files add column approved_by_name text;
  end if;
end $$;

-- Back-fill approved_by_name from profiles if approved_by references an existing profile
update public.files f
set approved_by_name = p.full_name
from public.profiles p
where f.approved_by = p.id
  and f.approved_by_name is null
  and p.full_name is not null;
