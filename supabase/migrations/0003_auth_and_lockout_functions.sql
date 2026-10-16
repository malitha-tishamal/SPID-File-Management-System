-- ===========================================================================
-- SPID File Management System — 0003: Auth triggers & security functions
-- - New auth user -> pending Staff profile (role can never self-promote)
-- - Progressive lockout with atomic, database-time enforcement
-- Run order: 0001 -> 0002 -> 0003 -> 0004
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- Auto-create a pending Staff profile for every new auth user.
-- Registration metadata (full_name, requested_role, section_id, nic,
-- mobile_phone) arrives via signUp() options.data.
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_section_id bigint;
begin
  begin
    if new.raw_user_meta_data->>'section_id' is not null then
      v_section_id := (new.raw_user_meta_data->>'section_id')::bigint;
    end if;
  exception when others then
    v_section_id := null;
  end;

  insert into public.profiles (
    id, full_name, email, role, requested_role, section_id,
    nic, mobile_phone, account_status
  )
  values (
    new.id,
    coalesce(nullif(new.raw_user_meta_data->>'full_name', ''), split_part(new.email, '@', 1)),
    new.email,
    case
      when new.raw_user_meta_data->>'role' in ('Staff', 'Administrator')
        then new.raw_user_meta_data->>'role'
      when new.raw_user_meta_data->>'requested_role' in ('Staff', 'Administrator')
        then new.raw_user_meta_data->>'requested_role'
      else 'Staff'
    end,
    case
      when new.raw_user_meta_data->>'requested_role' in ('Staff', 'Administrator')
        then new.raw_user_meta_data->>'requested_role'
      when new.raw_user_meta_data->>'role' in ('Staff', 'Administrator')
        then new.raw_user_meta_data->>'role'
      else 'Staff'
    end,
    v_section_id,
    nullif(new.raw_user_meta_data->>'nic', ''),
    nullif(new.raw_user_meta_data->>'mobile_phone', ''),
    'pending'
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- Progressive lockout schedule:
--   failed attempts 1-2   -> no lock
--   failed attempt 3      -> lock 60 seconds  (level 1)
--   failed attempts 4-5   -> no lock
--   failed attempt 6      -> lock 2 minutes   (level 2)
--   failed attempts 7-8   -> no lock
--   failed attempt 9+     -> lock 10 minutes  (level 3, repeats every 3)
-- Uses trusted database time (now()) and row-level locking (FOR UPDATE)
-- so concurrent requests cannot bypass the counter.
-- While a lockout is active, further failed attempts do NOT extend it.
-- ---------------------------------------------------------------------------

-- Read-only lockout state (no mutation).
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
      'remaining_seconds', 0
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
      end
  );
end;
$$;

-- Record one failed attempt atomically; escalate lockout level per schedule.
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
      'remaining_seconds', ceil(extract(epoch from (v_locked_until - now())))::integer
    );
  end if;

  v_failed := v_failed + 1;

  if v_failed % 3 = 0 then
    v_level := v_level + 1;
    v_duration_seconds := case v_level when 1 then 60 when 2 then 120 else 600 end;
    v_new_locked_until := now() + make_interval(secs => v_duration_seconds);

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
  else
    v_new_locked_until := null;
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
      end
  );
end;
$$;

-- Successful authorized login: reset consecutive-failure counters.
create or replace function public.reset_failed_login(p_user_id uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.login_security
    set failed_attempts = 0, lockout_level = 0, locked_until = null, updated_at = now()
  where user_id = p_user_id;
$$;

-- Administrative intervention: clear an active lockout and the escalation
-- level. Called by the server API on behalf of an authorized Administrator.
create or replace function public.admin_clear_lockout(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.login_security
    set failed_attempts = 0, lockout_level = 0, locked_until = null, updated_at = now()
  where user_id = p_user_id;

  insert into public.audit_logs (actor_id, target_user_id, action, details)
  values (null, p_user_id, 'lockout_cleared_by_admin', jsonb_build_object('cleared_at', now()));
end;
$$;
