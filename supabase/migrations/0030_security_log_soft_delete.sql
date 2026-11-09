-- ===========================================================================
-- 0030: Security-log deletion — soft delete, atomic delete+audit RPC,
-- restore, and scheduled purge.
--
-- audit_logs gains deleted_at / deleted_by. Rows are hidden from the normal
-- list but kept for 30 days ("Recently deleted" tab, restorable). A
-- SECURITY DEFINER function performs soft-delete + the SECURITY_LOG_DELETED
-- audit record in ONE transaction, so a deletion can never happen without
-- its audit trail. Deletion records themselves are protected.
-- ===========================================================================

do $$ begin
  if not exists (select 1 from information_schema.columns
    where table_schema='public' and table_name='audit_logs' and column_name='deleted_at') then
    alter table public.audit_logs add column deleted_at timestamptz;
  end if;
  if not exists (select 1 from information_schema.columns
    where table_schema='public' and table_name='audit_logs' and column_name='deleted_by') then
    alter table public.audit_logs
      add column deleted_by uuid references public.profiles(id) on delete set null;
  end if;
end $$;

create index if not exists idx_audit_logs_deleted
  on public.audit_logs (deleted_at)
  where deleted_at is not null;

-- Realtime: admins' open Security Logs pages see rows disappear. RLS still
-- applies (only approved admins may SELECT audit_logs).
do $$
begin
  if to_regclass('public.audit_logs') is not null
     and not exists (
       select 1 from pg_publication_tables
       where pubname='supabase_realtime' and schemaname='public' and tablename='audit_logs'
     ) then
    alter publication supabase_realtime add table public.audit_logs;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- delete_security_logs: soft-delete + audit record, atomically.
--   p_ids        explicit row ids (single/bulk). Null => clear by filter.
--   p_actions    whitelist of actions for clear mode; null => all security.*
--   p_older_than clear mode only: interval; null => no age limit
--   p_include_malware  allow security.malware_detected in clear mode
--   p_include_recent   allow events newer than 24h in clear mode
--   p_actor_id / p_actor_name / p_reason  recorded on the audit row
-- SECURITY_LOG_DELETED rows are never candidates.
-- ---------------------------------------------------------------------------
create or replace function public.delete_security_logs(
  p_ids bigint[] default null,
  p_actions text[] default null,
  p_older_than interval default null,
  p_include_malware boolean default false,
  p_include_recent boolean default false,
  p_actor_id uuid default null,
  p_actor_name text default null,
  p_reason text default null
) returns jsonb
language plpgsql security definer set search_path = public as $fn$
declare
  v_ids bigint[];
  v_protected int := 0;
  v_malware int := 0;
  v_deleted int := 0;
  v_audit_id bigint;
  v_cand record;
begin
  if p_ids is not null then
    if coalesce(array_length(p_ids, 1), 0) > 500 then
      return jsonb_build_object('error', 'TOO_MANY_IDS', 'deleted', 0);
    end if;
    select coalesce(array_agg(id), '{}'::bigint[]) into v_ids
    from public.audit_logs
    where id = any(p_ids)
      and deleted_at is null
      and action is distinct from 'SECURITY_LOG_DELETED';
    select count(*) into v_protected
    from public.audit_logs
    where id = any(p_ids)
      and (action = 'SECURITY_LOG_DELETED' or deleted_at is not null);
  else
    -- Clear mode: filter + optional age. The 24-hour guard always applies
    -- unless the caller explicitly confirmed including recent events.
    create temporary table if not exists tmp_sec_log_candidates (id bigint) on commit drop;
    delete from tmp_sec_log_candidates;

    insert into tmp_sec_log_candidates (id)
    select id from public.audit_logs
    where deleted_at is null
      and action is distinct from 'SECURITY_LOG_DELETED'
      and action like 'security.%'
      and (p_actions is null or action = any(p_actions))
      and (p_older_than is null or created_at < now() - p_older_than)
      and (p_include_recent or created_at < now() - interval '24 hours')
      and (p_include_malware or action <> 'security.malware_detected');

    select count(*) into v_malware
    from public.audit_logs
    where deleted_at is null
      and action = 'security.malware_detected'
      and action like 'security.%'
      and (p_actions is null or action = any(p_actions))
      and (p_older_than is null or created_at < now() - p_older_than)
      and (p_include_recent or created_at < now() - interval '24 hours');

    select coalesce(array_agg(id), '{}'::bigint[]) into v_ids
    from tmp_sec_log_candidates;

    select count(*) into v_protected
    from public.audit_logs
    where deleted_at is null
      and action = 'SECURITY_LOG_DELETED'
      and action like 'security.%'
      and (p_actions is null or p_actions && array['SECURITY_LOG_DELETED'])
      and (p_older_than is null or created_at < now() - p_older_than);
  end if;

  if coalesce(array_length(v_ids, 1), 0) = 0 then
    return jsonb_build_object(
      'deleted', 0,
      'skippedProtected', v_protected,
      'skippedMalware', v_malware,
      'auditId', null
    );
  end if;

  update public.audit_logs
  set deleted_at = now(), deleted_by = p_actor_id
  where id = any(v_ids)
    and deleted_at is null
    and action is distinct from 'SECURITY_LOG_DELETED';

  get diagnostics v_deleted = row_count;

  -- The deletion record itself: always written, never deletable from the UI.
  insert into public.audit_logs (actor_id, action, details)
  values (
    p_actor_id,
    'SECURITY_LOG_DELETED',
    jsonb_build_object(
      'deleted_count', v_deleted,
      'actor_name', p_actor_name,
      'reason', nullif(btrim(coalesce(p_reason, '')), ''),
      'filter', jsonb_build_object(
        'actions', to_jsonb(p_actions),
        'older_than', p_older_than::text,
        'include_malware', p_include_malware,
        'include_recent', p_include_recent,
        'explicit_ids', p_ids is not null
      ),
      'ids', case
        when p_ids is not null and array_length(p_ids, 1) <= 10
          then to_jsonb(p_ids)
        else null end,
      'skipped', jsonb_build_object(
        'protected', v_protected,
        'malware', v_malware
      )
    )
  )
  returning id into v_audit_id;

  return jsonb_build_object(
    'deleted', v_deleted,
    'skippedProtected', v_protected,
    'skippedMalware', v_malware,
    'auditId', v_audit_id
  );
end $fn$;

-- restore_security_logs: undo a soft delete within the retention window.
create or replace function public.restore_security_logs(
  p_ids bigint[],
  p_actor_id uuid default null,
  p_actor_name text default null
) returns jsonb
language plpgsql security definer set search_path = public as $fn$
declare
  v_restored int := 0;
  v_audit_id bigint;
begin
  if p_ids is null or coalesce(array_length(p_ids, 1), 0) = 0 then
    return jsonb_build_object('restored', 0, 'error', 'NO_IDS');
  end if;
  if array_length(p_ids, 1) > 500 then
    return jsonb_build_object('restored', 0, 'error', 'TOO_MANY_IDS');
  end if;

  update public.audit_logs
  set deleted_at = null, deleted_by = null
  where id = any(p_ids)
    and deleted_at is not null
    and action is distinct from 'SECURITY_LOG_DELETED';

  get diagnostics v_restored = row_count;

  if v_restored > 0 then
    insert into public.audit_logs (actor_id, action, details)
    values (
      p_actor_id,
      'SECURITY_LOG_RESTORED',
      jsonb_build_object(
        'restored_count', v_restored,
        'actor_name', p_actor_name,
        'ids', case when array_length(p_ids, 1) <= 10
          then to_jsonb(p_ids) else null end
      )
    )
    returning id into v_audit_id;
  end if;

  return jsonb_build_object('restored', v_restored, 'auditId', v_audit_id);
end $fn$;

-- purge_deleted_audit_logs: permanent removal after the retention window.
-- Schedule with pg_cron / Supabase scheduled functions, e.g. daily:
--   select public.purge_deleted_audit_logs(interval '30 days');
create or replace function public.purge_deleted_audit_logs(
  p_older_than interval default interval '30 days'
) returns int
language plpgsql security definer set search_path = public as $fn$
declare
  v_count int;
begin
  delete from public.audit_logs
  where deleted_at is not null
    and deleted_at < now() - p_older_than;
  get diagnostics v_count = row_count;
  return v_count;
end $fn$;

-- Only the service role (server API) may execute these.
revoke all on function public.delete_security_logs(bigint[], text[], interval, boolean, boolean, uuid, text, text) from public, anon, authenticated;
revoke all on function public.restore_security_logs(bigint[], uuid, text) from public, anon, authenticated;
revoke all on function public.purge_deleted_audit_logs(interval) from public, anon, authenticated;
grant execute on function public.delete_security_logs(bigint[], text[], interval, boolean, boolean, uuid, text, text) to service_role;
grant execute on function public.restore_security_logs(bigint[], uuid, text) to service_role;
grant execute on function public.purge_deleted_audit_logs(interval) to service_role;
