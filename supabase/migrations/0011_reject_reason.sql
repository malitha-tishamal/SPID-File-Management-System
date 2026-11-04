-- ===========================================================================
-- SPID File Management System — 0011: Add reject_reason column to files table
-- Stores the administrator's optional reason when rejecting a file submission.
-- ===========================================================================

do $$ begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'files'
      and column_name = 'reject_reason'
  ) then
    alter table public.files add column reject_reason text;
  end if;
end $$;
