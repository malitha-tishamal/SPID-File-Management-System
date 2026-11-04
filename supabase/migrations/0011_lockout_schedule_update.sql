-- ===========================================================================
-- SPID File Management System — 0011: Progressive lockout schedule update
-- New schedule (failed password attempts per account):
--   attempts 1-3  -> no lock
--   attempt  4    -> lock 30 seconds  (level 1)
--   attempt  5    -> lock 60 seconds  (level 2)
--   attempt  6    -> lock 90 seconds  (level 3)
--   attempt  7+   -> PERMANENT lock (level 4) until an administrator clears it
-- Uses trusted database time (now()) and row-level locking (FOR UPDATE).
-- While a lockout is active, further failed attempts do NOT extend it.
-- Run in Supabase Dashboard -> SQL Editor after 0001..0010.
-- ===========================================================================

-- Read-only lockout state (no mutation). Adds the "permanent" flag so the
-- server can distinguish a timed lock from an administrator-only unlock.
create or replace function public.check_lockout(p_user_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_failed integer;
  v_level integer;
  v_locked_until timestamptz;
begin
  select failed_attempts, lockout_level, locked_until
    into v_failed, v_level, v_locked_until
  from public.login_security
  where user_id = p_user_id;

  if v_failed is null then
    return jsonb_build_object(
      'locked', false,
      'failed_attempts', 0,
      'lockout_level', 0,
      'locked_until', null,
      'remaining_seconds', 0,
      'permanent', false
    );
  end if;

  return jsonb_build_object(
    'locked', v_locked_until is not null and v_locked_until > now(),
    'failed_attempts', v_failed,
    'lockout_level', v_level,
    'locked_until', v_locked_until,
    'remaining_seconds',
      case
        when v_locked_until is not null and v_locked_until > now()
          then ceil(extract(epoch from (v_locked_until - now())))::integer
        else 0
      end,
    'permanent', coalesce(v_level >= 4 and v_locked_until is not null and v_locked_until > now(), false)
  );
end;
$$;

-- Record one failed attempt atomically; escalate per the new schedule.
create or replace function public.record_failed_login(p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_failed integer;
  v_level integer;
  v_locked_until timestamptz;
  v_new_locked_until timestamptz;
  v_duration_seconds integer;
  v_permanent boolean;
begin
  select failed_attempts, lockout_level, locked_until
    into v_failed, v_level, v_locked_until
  from public.login_security
  where user_id = p_user_id
  for update;

  if v_failed is null then
    insert into public.login_security (user_id, failed_attempts, lockout_level, locked_until)
    values (p_user_id, 0, 0, null)
    on conflict (user_id) do nothing;
    v_failed := 0;
    v_level := 0;
    v_locked_until := null;
  end if;

  -- Already locked: reject without extending the lock.
  if v_locked_until is not null and v_locked_until > now() then
    return jsonb_build_object(
      'locked', true,
      'failed_attempts', v_failed,
      'lockout_level', v_level,
      'locked_until', v_locked_until,
      'remaining_seconds', ceil(extract(epoch from (v_locked_until - now())))::integer,
      'permanent', v_level >= 4
    );
  end if;

  v_failed := v_failed + 1;
  v_permanent := false;

  if v_failed <= 3 then
    -- Grace attempts: no lock.
    v_level := 0;
    v_duration_seconds := 0;
    v_new_locked_until := null;
  elsif v_failed = 4 then
    v_level := 1;
    v_duration_seconds := 30;
    v_new_locked_until := now() + make_interval(secs => v_duration_seconds);
  elsif v_failed = 5 then
    v_level := 2;
    v_duration_seconds := 60;
    v_new_locked_until := now() + make_interval(secs => v_duration_seconds);
  elsif v_failed = 6 then
    v_level := 3;
    v_duration_seconds := 90;
    v_new_locked_until := now() + make_interval(secs => v_duration_seconds);
  else
    -- Seventh consecutive failure: permanently locked until an administrator clears it.
    v_level := 4;
    v_duration_seconds := 0;
    v_permanent := true;
    v_new_locked_until := now() + interval '100 years';
  end if;

  if v_permanent then
    insert into public.audit_logs (actor_id, target_user_id, action, details)
    values (
      null, p_user_id, 'login_lockout_permanent',
      jsonb_build_object(
        'failed_attempts', v_failed,
        'lockout_level', v_level,
        'locked_until', v_new_locked_until
      )
    );
  elsif v_new_locked_until is not null then
    insert into public.audit_logs (actor_id, target_user_id, action, details)
    values (
      null, p_user_id, 'login_lockout',
      jsonb_build_object(
        'failed_attempts', v_failed,
        'lockout_level', v_level,
        'duration_seconds', v_duration_seconds,
        'locked_until', v_new_locked_until
      )
    );
  end if;

  update public.login_security
    set failed_attempts = v_failed,
        lockout_level = v_level,
        locked_until = v_new_locked_until,
        updated_at = now()
  where user_id = p_user_id;

  return jsonb_build_object(
    'locked', v_new_locked_until is not null,
    'failed_attempts', v_failed,
    'lockout_level', v_level,
    'locked_until', v_new_locked_until,
    'remaining_seconds',
      case
        when v_new_locked_until is not null
          then ceil(extract(epoch from (v_new_locked_until - now())))::integer
        else 0
      end,
    'permanent', v_permanent
  );
end;
$$;
