-- ===========================================================================
-- SPID File Management System — 0026: Login lockout hardening
--
-- Schedule (defined in ONE place in the app: src/lib/auth/lockout.ts):
--   failures 1-3 -> no lock
--   failure  4   -> 30 seconds  (level 1)
--   failure  5   -> 60 seconds  (level 2)
--   failure  6   -> 90 seconds  (level 3)
--   failure  7+  -> PERMANENT until an administrator unlocks the account
--
-- The server passes the schedule values into record_failed_login(), so the
-- SQL never owns a second copy of the numbers. Counters, timestamps and
-- remaining seconds all come from the database clock (now()).
--
-- Run in Supabase Dashboard -> SQL Editor after 0011 (or after 0025).
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 1. Lockout state columns
-- ---------------------------------------------------------------------------
alter table public.login_security
  add column if not exists is_permanently_locked boolean not null default false,
  add column if not exists locked_at timestamptz,
  add column if not exists last_failed_login_at timestamptz,
  add column if not exists last_failed_login_ip text,
  add column if not exists last_failed_login_user_agent text;

-- Existing permanent locks from 0011 are stored as level 4 with a 100-year
-- locked_until. Promote them to the explicit flag.
update public.login_security
  set is_permanently_locked = true,
      locked_at = coalesce(locked_at, updated_at, now())
  where lockout_level >= 4
    and locked_until is not null
    and locked_until > now();

update public.login_security
  set locked_at = coalesce(locked_at, updated_at)
  where locked_until is not null
    and locked_until > now()
    and locked_at is null;

-- ---------------------------------------------------------------------------
-- 2. Per-attempt audit log (no passwords, ever)
-- ---------------------------------------------------------------------------
create table if not exists public.login_attempts (
  id bigint generated always as identity primary key,
  user_id uuid references auth.users (id) on delete set null,
  email_attempted text not null,
  ip text,
  user_agent text,
  success boolean not null default false,
  reason text not null default 'INVALID_PASSWORD',
  created_at timestamptz not null default now(),
  constraint login_attempts_reason_check
    check (reason in ('INVALID_PASSWORD', 'LOCKED_TEMP', 'LOCKED_PERMANENT', 'SUCCESS'))
);

create index if not exists login_attempts_ip_failed_idx
  on public.login_attempts (ip, created_at) where success = false;
create index if not exists login_attempts_user_idx
  on public.login_attempts (user_id, created_at desc);
create index if not exists login_attempts_created_idx
  on public.login_attempts (created_at desc);

alter table public.login_attempts enable row level security;
revoke all on public.login_attempts from anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. Read-only lockout state
-- ---------------------------------------------------------------------------
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
  v_permanent boolean;
  v_locked_at timestamptz;
  v_last_failed_at timestamptz;
  v_last_ip text;
begin
  select failed_attempts, lockout_level, locked_until,
         coalesce(is_permanently_locked, false), locked_at,
         last_failed_login_at, last_failed_login_ip
    into v_failed, v_level, v_locked_until, v_permanent,
         v_locked_at, v_last_failed_at, v_last_ip
  from public.login_security
  where user_id = p_user_id;

  if v_failed is null then
    return jsonb_build_object(
      'locked', false,
      'failed_attempts', 0,
      'lockout_level', 0,
      'locked_until', null,
      'remaining_seconds', 0,
      'permanent', false,
      'is_permanently_locked', false,
      'locked_at', null,
      'last_failed_login_at', null,
      'last_failed_login_ip', null
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
             and not coalesce(v_permanent, false)
          then least(
            ceil(extract(epoch from (v_locked_until - now())))::bigint,
            2147483647
          )::integer
        else 0
      end,
    'permanent', coalesce(v_permanent and v_locked_until is not null and v_locked_until > now(), false),
    'is_permanently_locked', coalesce(v_permanent, false),
    'locked_at', v_locked_at,
    'last_failed_login_at', v_last_failed_at,
    'last_failed_login_ip', v_last_ip
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. Atomic failure recording, driven by the shared app schedule
-- ---------------------------------------------------------------------------
drop function if exists public.record_failed_login(uuid);

create or replace function public.record_failed_login(
  p_user_id uuid,
  p_free_attempts integer default 3,
  p_lock_durations integer[] default array[30, 60, 90],
  p_permanent_after boolean default true
)
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
  v_levels integer;
  v_next_level integer;
  v_locked_at timestamptz;
begin
  select failed_attempts, lockout_level, locked_until, locked_at
    into v_failed, v_level, v_locked_until, v_locked_at
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
    v_locked_at := null;
  end if;

  -- Already locked: do not verify, do not extend, just report the live lock.
  if v_locked_until is not null and v_locked_until > now() then
    return jsonb_build_object(
      'locked', true,
      'failed_attempts', v_failed,
      'lockout_level', v_level,
      'locked_until', v_locked_until,
      -- A permanent lock carries a far-future timestamp: never convert it to
      -- seconds, that overflows int4. The client uses the flag, not a timer.
      'remaining_seconds',
        case
          when v_level > coalesce(array_length(p_lock_durations, 1), 0) then 0
          else least(
            ceil(extract(epoch from (v_locked_until - now())))::bigint,
            2147483647
          )::integer
        end,
      'permanent', v_level > coalesce(array_length(p_lock_durations, 1), 0),
      'is_permanently_locked', v_level > coalesce(array_length(p_lock_durations, 1), 0),
      'locked_at', v_locked_at
    );
  end if;

  v_failed := v_failed + 1;
  v_levels := coalesce(array_length(p_lock_durations, 1), 0);
  v_permanent := false;
  v_next_level := v_failed - greatest(p_free_attempts, 0);

  if v_next_level <= 0 then
    v_level := 0;
    v_duration_seconds := 0;
    v_new_locked_until := null;
    v_locked_at := null;
  elsif v_next_level <= v_levels then
    v_level := v_next_level;
    v_duration_seconds := p_lock_durations[v_next_level];
    v_new_locked_until := now() + make_interval(secs => v_duration_seconds);
    v_locked_at := now();
  elsif p_permanent_after then
    v_level := v_levels + 1;
    v_duration_seconds := 0;
    v_permanent := true;
    v_new_locked_until := now() + interval '100 years';
    v_locked_at := now();
  else
    -- No permanent stage configured: repeat the strongest timed lock.
    v_level := v_levels;
    v_duration_seconds := p_lock_durations[v_levels];
    v_new_locked_until := now() + make_interval(secs => v_duration_seconds);
    v_locked_at := now();
  end if;

  if v_permanent then
    insert into public.audit_logs (actor_id, target_user_id, action, details)
    values (
      null, p_user_id, 'login_lockout_permanent',
      jsonb_build_object(
        'failed_attempts', v_failed,
        'lockout_level', v_level,
        'locked_until', v_new_locked_until,
        'locked_at', v_locked_at
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
        is_permanently_locked = v_permanent,
        locked_at = v_locked_at,
        last_failed_login_at = now(),
        updated_at = now()
  where user_id = p_user_id;

  return jsonb_build_object(
    'locked', v_new_locked_until is not null,
    'failed_attempts', v_failed,
    'lockout_level', v_level,
    'locked_until', v_new_locked_until,
    'remaining_seconds',
      case
        when v_permanent then 0
        when v_new_locked_until is not null
          then least(
            ceil(extract(epoch from (v_new_locked_until - now())))::bigint,
            2147483647
          )::integer
        else 0
      end,
    'permanent', v_permanent,
    'is_permanently_locked', v_permanent,
    'locked_at', v_locked_at
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- 5. Successful sign-in / administrator unlock
-- ---------------------------------------------------------------------------
create or replace function public.reset_failed_login(p_user_id uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.login_security
    set failed_attempts = 0,
        lockout_level = 0,
        locked_until = null,
        is_permanently_locked = false,
        locked_at = null,
        updated_at = now()
  where user_id = p_user_id;
$$;

create or replace function public.admin_clear_lockout(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.login_security
    set failed_attempts = 0,
        lockout_level = 0,
        locked_until = null,
        is_permanently_locked = false,
        locked_at = null,
        updated_at = now()
  where user_id = p_user_id;

  insert into public.audit_logs (actor_id, target_user_id, action, details)
  values (null, p_user_id, 'lockout_cleared_by_admin', jsonb_build_object('cleared_at', now()));
end;
$$;

-- ---------------------------------------------------------------------------
-- 6. Attempt audit + basic per-IP rate limiting (database clock)
-- ---------------------------------------------------------------------------
create or replace function public.record_login_attempt(
  p_user_id uuid,
  p_email text,
  p_ip text,
  p_user_agent text,
  p_success boolean,
  p_reason text,
  p_window_minutes integer default 15
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_reason text;
  v_failed integer;
begin
  v_reason := case
    when p_reason in ('INVALID_PASSWORD', 'LOCKED_TEMP', 'LOCKED_PERMANENT', 'SUCCESS')
      then p_reason
    else 'INVALID_PASSWORD'
  end;

  insert into public.login_attempts (
    user_id, email_attempted, ip, user_agent, success, reason
  )
  values (
    p_user_id,
    left(lower(coalesce(p_email, '')), 320),
    nullif(left(coalesce(p_ip, ''), 64), ''),
    nullif(left(coalesce(p_user_agent, ''), 512), ''),
    coalesce(p_success, false),
    v_reason
  );

  if p_ip is null or p_ip = '' then
    return jsonb_build_object('failed_in_window', 0);
  end if;

  select count(*)
    into v_failed
  from public.login_attempts
  where success = false
    and ip = left(p_ip, 64)
    and created_at > now() - make_interval(mins => greatest(p_window_minutes, 1));

  return jsonb_build_object('failed_in_window', v_failed);
end;
$$;

create or replace function public.check_ip_rate_limit(
  p_ip text,
  p_window_minutes integer default 15,
  p_max_failed integer default 20
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_failed integer;
  v_oldest timestamptz;
  v_retry integer;
begin
  if p_ip is null or p_ip = '' then
    return jsonb_build_object(
      'limited', false, 'failed_in_window', 0, 'retry_after_seconds', 0
    );
  end if;

  select count(*), min(created_at)
    into v_failed, v_oldest
  from public.login_attempts
  where success = false
    and ip = left(p_ip, 64)
    and created_at > now() - make_interval(mins => greatest(p_window_minutes, 1));

  if v_failed >= greatest(p_max_failed, 1) and v_oldest is not null then
    v_retry := greatest(
      1,
      ceil(extract(epoch from (
        v_oldest + make_interval(mins => greatest(p_window_minutes, 1)) - now()
      )))::integer
    );
    return jsonb_build_object(
      'limited', true,
      'failed_in_window', v_failed,
      'retry_after_seconds', v_retry
    );
  end if;

  return jsonb_build_object(
    'limited', false,
    'failed_in_window', coalesce(v_failed, 0),
    'retry_after_seconds', 0
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- 7. Make the service role the only caller
-- ---------------------------------------------------------------------------
revoke all on function public.record_login_attempt(uuid, text, text, text, boolean, text, integer) from public;
revoke all on function public.check_ip_rate_limit(text, integer, integer) from public;
