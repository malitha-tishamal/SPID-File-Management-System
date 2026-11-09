-- ===========================================================================
-- 0031: Security-log deletion fixes.
--  1) Deletion audit records (SECURITY_LOG_DELETED / _RESTORED / _PURGED) live
--     in audit_logs — the admin audit trail — but are excluded from the
--     Security Logs page by the security.% action filter. They are never
--     deletion candidates.
--  2) restore_security_logs gains p_actions so "Restore all" can undo every
--     soft-deleted row matching a tab filter, not just explicit ids.
--  3) purge_security_logs permanently removes ONLY soft-deleted rows
--     (deleted_at IS NOT NULL). Active events are rejected.
-- ===========================================================================

-- Report existing deletion-record rows (they stay in audit_logs as trail;
-- the Security Logs page no longer queries them).
do $$
declare n int;
begin
  select count(*) into n from public.audit_logs
  where action in ('SECURITY_LOG_DELETED','SECURITY_LOG_RESTORED','SECURITY_LOG_PURGED');
  raise notice '0031: % deletion-record row(s) present in audit_logs (kept as audit trail, hidden from Security Logs)', n;
end $$;

-- delete_security_logs: same contract as 0030, minus protected-row reporting.
-- Audit-record actions are silently excluded from candidates.
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
  v_malware int := 0;
  v_deleted int := 0;
  v_audit_id bigint;
begin
  if p_ids is not null then
    if coalesce(array_length(p_ids, 1), 0) > 500 then
      return jsonb_build_object('error', 'TOO_MANY_IDS', 'deleted', 0);
    end if;
    select coalesce(array_agg(id), '{}'::bigint[]) into v_ids
    from public.audit_logs
    where id = any(p_ids)
      and deleted_at is null
      and action not in ('SECURITY_LOG_DELETED','SECURITY_LOG_RESTORED','SECURITY_LOG_PURGED');
  else
    create temporary table if not exists tmp_sec_log_candidates (id bigint) on commit drop;
    delete from tmp_sec_log_candidates;

    insert into tmp_sec_log_candidates (id)
    select id from public.audit_logs
    where deleted_at is null
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
  end if;

  if coalesce(array_length(v_ids, 1), 0) = 0 then
    return jsonb_build_object('deleted', 0, 'skippedMalware', v_malware, 'auditId', null);
  end if;

  update public.audit_logs
  set deleted_at = now(), deleted_by = p_actor_id
  where id = any(v_ids)
    and deleted_at is null
    and action not in ('SECURITY_LOG_DELETED','SECURITY_LOG_RESTORED','SECURITY_LOG_PURGED');

  get diagnostics v_deleted = row_count;

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
      'skipped', jsonb_build_object('malware', v_malware)
    )
  )
  returning id into v_audit_id;

  return jsonb_build_object(
    'deleted', v_deleted,
    'skippedMalware', v_malware,
    'auditId', v_audit_id
  );
end $fn$;

-- restore_security_logs: ids OR filter (p_actions), still capped at 500 ids.
drop function if exists public.restore_security_logs(bigint[], uuid, text);
create or replace function public.restore_security_logs(
  p_ids bigint[] default null,
  p_actions text[] default null,
  p_actor_id uuid default null,
  p_actor_name text default null
) returns jsonb
language plpgsql security definer set search_path = public as $fn$
declare
  v_restored int := 0;
  v_audit_id bigint;
begin
  if p_ids is not null and coalesce(array_length(p_ids, 1), 0) > 500 then
    return jsonb_build_object('restored', 0, 'error', 'TOO_MANY_IDS');
  end if;
  if p_ids is null and p_actions is null then
    return jsonb_build_object('restored', 0, 'error', 'NO_TARGET');
  end if;

  update public.audit_logs
  set deleted_at = null, deleted_by = null
  where deleted_at is not null
    and action not in ('SECURITY_LOG_DELETED','SECURITY_LOG_RESTORED','SECURITY_LOG_PURGED')
    and (p_ids is null or id = any(p_ids))
    and (p_actions is null or action = any(p_actions));

  get diagnostics v_restored = row_count;

  if v_restored > 0 then
    insert into public.audit_logs (actor_id, action, details)
    values (
      p_actor_id,
      'SECURITY_LOG_RESTORED',
      jsonb_build_object(
        'restored_count', v_restored,
        'actor_name', p_actor_name,
        'filter', jsonb_build_object('actions', to_jsonb(p_actions), 'explicit_ids', p_ids is not null),
        'ids', case when p_ids is not null and array_length(p_ids, 1) <= 10
          then to_jsonb(p_ids) else null end
      )
    )
    returning id into v_audit_id;
  end if;

  return jsonb_build_object('restored', v_restored, 'auditId', v_audit_id);
end $fn$;

-- purge_security_logs: permanent removal of soft-deleted rows only.
-- Explicit ids that are NOT soft-deleted are rejected (ACTIVE_OR_MISSING).
create or replace function public.purge_security_logs(
  p_ids bigint[] default null,
  p_actions text[] default null,
  p_actor_id uuid default null,
  p_actor_name text default null
) returns jsonb
language plpgsql security definer set search_path = public as $fn$
declare
  v_deleted int := 0;
  v_active int := 0;
  v_audit_id bigint;
begin
  if p_ids is not null then
    if coalesce(array_length(p_ids, 1), 0) > 500 then
      return jsonb_build_object('error', 'TOO_MANY_IDS', 'deleted', 0);
    end if;
    select count(*) into v_active
    from public.audit_logs
    where id = any(p_ids)
      and (deleted_at is null
           or action in ('SECURITY_LOG_DELETED','SECURITY_LOG_RESTORED','SECURITY_LOG_PURGED'));
    if v_active > 0 then
      return jsonb_build_object('error', 'ACTIVE_OR_MISSING', 'activeCount', v_active, 'deleted', 0);
    end if;
  elsif p_actions is null then
    return jsonb_build_object('error', 'NO_TARGET', 'deleted', 0);
  end if;

  delete from public.audit_logs
  where deleted_at is not null
    and action not in ('SECURITY_LOG_DELETED','SECURITY_LOG_RESTORED','SECURITY_LOG_PURGED')
    and (p_ids is null or id = any(p_ids))
    and (p_actions is null or action = any(p_actions));

  get diagnostics v_deleted = row_count;

  insert into public.audit_logs (actor_id, action, details)
  values (
    p_actor_id,
    'SECURITY_LOG_PURGED',
    jsonb_build_object(
      'purged_count', v_deleted,
      'actor_name', p_actor_name,
      'filter', jsonb_build_object('actions', to_jsonb(p_actions), 'explicit_ids', p_ids is not null),
      'ids', case when p_ids is not null and array_length(p_ids, 1) <= 10
        then to_jsonb(p_ids) else null end
    )
  )
  returning id into v_audit_id;

  return jsonb_build_object('deleted', v_deleted, 'auditId', v_audit_id);
end $fn$;

revoke all on function public.delete_security_logs(bigint[], text[], interval, boolean, boolean, uuid, text, text) from public, anon, authenticated;
revoke all on function public.restore_security_logs(bigint[], text[], uuid, text) from public, anon, authenticated;
revoke all on function public.purge_security_logs(bigint[], text[], uuid, text) from public, anon, authenticated;
grant execute on function public.delete_security_logs(bigint[], text[], interval, boolean, boolean, uuid, text, text) to service_role;
grant execute on function public.restore_security_logs(bigint[], text[], uuid, text) to service_role;
grant execute on function public.purge_security_logs(bigint[], text[], uuid, text) to service_role;
