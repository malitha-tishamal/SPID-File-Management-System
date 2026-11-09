-- Shared realtime + data-integrity migration.
-- 1) Publish the tables the UI listens to on Supabase Realtime
--    (Postgres Changes). RLS SELECT policies still apply per role.
-- 2) Unique index protecting mobile_phone uniqueness on ACTIVE profiles.
--    Normalises stored formats (+94 77..., 077..., 9477...) to the 9-digit
--    subscriber number so duplicates across formats collide.
--    Soft-deleted rows are excluded (their numbers are freed on deletion).

-- Each add is guarded: the statement is skipped when the table does not
-- exist or is already published, so the migration never fails on schema
-- differences between environments.
do $$
declare
  t text;
  tables text[] := array[
    'profiles',
    'files',
    'sections',
    'notifications',
    'staff_file_requests',
    'file_requests',
    'login_security'
  ];
begin
  foreach t in array tables loop
    if to_regclass('public.' || t) is not null
       and not exists (
         select 1 from pg_publication_tables
         where pubname = 'supabase_realtime'
           and schemaname = 'public'
           and tablename = t
       ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;

-- Phone uniqueness: expression index on the normalised subscriber digits.
-- Skipped (with a notice) when legacy duplicate numbers exist — resolve them
-- first (see the duplicate report) and re-run, or add a partial index.
do $$
declare dup_count int;
begin
  select count(*) into dup_count from (
    select 1
    from public.profiles
    where mobile_phone is not null
      and coalesce(is_deleted, false) = false
    group by (
      case
        when regexp_replace(mobile_phone, '\D', '', 'g') ~ '^94[0-8]\d{8}$'
          then '0' || substr(regexp_replace(mobile_phone, '\D', '', 'g'), 3)
        when regexp_replace(mobile_phone, '\D', '', 'g') ~ '^0[0-8]\d{8}$'
          then substr(regexp_replace(mobile_phone, '\D', '', 'g'), 2)
        when regexp_replace(mobile_phone, '\D', '', 'g') ~ '^[0-8]\d{8}$'
          then '0' || regexp_replace(mobile_phone, '\D', '', 'g')
        else regexp_replace(mobile_phone, '\D', '', 'g')
      end
    )
    having count(*) > 1
  ) d;

  if dup_count > 0 then
    raise notice '0028: % duplicate mobile_phone group(s) found — unique index NOT created. Resolve duplicates and re-run.', dup_count;
  else
    create unique index if not exists profiles_mobile_phone_active_key
    on public.profiles (
      (case
        when mobile_phone is null then null
        else (
          case
            when regexp_replace(mobile_phone, '\D', '', 'g') ~ '^94[0-8]\d{8}$'
              then '0' || substr(regexp_replace(mobile_phone, '\D', '', 'g'), 3)
            when regexp_replace(mobile_phone, '\D', '', 'g') ~ '^0[0-8]\d{8}$'
              then substr(regexp_replace(mobile_phone, '\D', '', 'g'), 2)
            when regexp_replace(mobile_phone, '\D', '', 'g') ~ '^[0-8]\d{8}$'
              then '0' || regexp_replace(mobile_phone, '\D', '', 'g')
            else regexp_replace(mobile_phone, '\D', '', 'g')
          end
        )
      end)
    )
    where mobile_phone is not null
      and coalesce(is_deleted, false) = false;
  end if;
end $$;
