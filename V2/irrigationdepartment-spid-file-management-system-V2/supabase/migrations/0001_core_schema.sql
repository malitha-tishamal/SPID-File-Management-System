-- ===========================================================================
-- SPID File Management System — 0001: Core schema
-- Tables: sections, profiles, login_security, audit_logs
-- Run order: 0001 -> 0002 -> 0003 -> 0004
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- Sections (departmental divisions)
-- ---------------------------------------------------------------------------
create table if not exists public.sections (
  id bigint generated always as identity primary key,
  name text not null unique,
  created_at timestamptz not null default now()
);

insert into public.sections (name) values
  ('Administration & Human Resources Division'),
  ('Irrigation Planning, Design & Feasibility'),
  ('Water Management, Operations & Hydrology'),
  ('Engineering Central Registry & Archive Records'),
  ('Land Acquisition & Field Surveys'),
  ('Finance, Accounts & Procurement'),
  ('Galle Regional Engineering Office'),
  ('Matara Regional Engineering Office'),
  ('Hambantota Regional Engineering Office')
on conflict (name) do nothing;

-- ---------------------------------------------------------------------------
-- Profiles — one row per auth.users id. NEVER stores passwords.
-- Public registration always creates role='Staff', account_status='pending'.
-- ---------------------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text not null,
  email text not null,
  role text not null default 'Staff'
    check (role in ('Staff', 'Administrator')),
  requested_role text
    check (requested_role in ('Staff', 'Administrator')),
  section_id bigint references public.sections (id),
  nic text,
  mobile_phone text,
  account_status text not null default 'pending'
    check (account_status in ('pending', 'approved', 'disabled', 'locked', 'rejected')),
  approved_by uuid references auth.users (id),
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_profiles_email on public.profiles (email);
create index if not exists idx_profiles_status on public.profiles (account_status);
create index if not exists idx_profiles_role on public.profiles (role);

-- ---------------------------------------------------------------------------
-- login_security — progressive lockout bookkeeping.
-- Server-only: no RLS policies are created; only the service-role key and
-- SECURITY DEFINER functions can touch this table.
-- ---------------------------------------------------------------------------
create table if not exists public.login_security (
  user_id uuid primary key references auth.users (id) on delete cascade,
  failed_attempts integer not null default 0,
  lockout_level integer not null default 0,
  locked_until timestamptz,
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- audit_logs — administrative and security event trail
-- ---------------------------------------------------------------------------
create table if not exists public.audit_logs (
  id bigint generated always as identity primary key,
  actor_id uuid references auth.users (id),
  target_user_id uuid references auth.users (id),
  action text not null,
  details jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_audit_logs_created on public.audit_logs (created_at desc);
create index if not exists idx_audit_logs_target on public.audit_logs (target_user_id);

-- ---------------------------------------------------------------------------
-- updated_at maintenance trigger
-- ---------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_profiles_updated_at on public.profiles;
create trigger trg_profiles_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();
