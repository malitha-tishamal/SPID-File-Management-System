-- ===========================================================================
-- SPID File Management System — 0002: Row Level Security policies
-- Principle: least privilege. No USING (true)/WITH CHECK (true) on
-- sensitive tables. Users can never change their own role, account status,
-- approval metadata, or security counters.
-- Run order: 0001 -> 0002 -> 0003 -> 0004
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- Security helper functions
-- ---------------------------------------------------------------------------

-- True when the JWT bearer is an approved Administrator.
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles
    where id = auth.uid()
      and role = 'Administrator'
      and account_status = 'approved'
  );
$$;

-- True when the JWT bearer holds an approved account.
create or replace function public.is_approved()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles
    where id = auth.uid()
      and account_status = 'approved'
  );
$$;

-- ---------------------------------------------------------------------------
-- sections — non-sensitive reference data, readable by anyone (the public
-- registration form needs the section list while unauthenticated)
-- ---------------------------------------------------------------------------
alter table public.sections enable row level security;

drop policy if exists "public can read sections" on public.sections;
create policy "public can read sections"
  on public.sections
  for select
  to anon, authenticated
  using (true);

-- ---------------------------------------------------------------------------
-- profiles
-- ---------------------------------------------------------------------------
alter table public.profiles enable row level security;

-- Read: own profile (any status — needed for server-side status gating)
--       or everything, if an approved Administrator.
drop policy if exists "read own or admin" on public.profiles;
create policy "read own or admin"
  on public.profiles
  for select
  to authenticated
  using (auth.uid() = id or public.is_admin());

-- Update own profile (approved users only). Privileged columns are guarded
-- by the trigger below; inserts are not permitted to end users.
drop policy if exists "approved users update own profile" on public.profiles;
create policy "approved users update own profile"
  on public.profiles
  for update
  to authenticated
  using (auth.uid() = id and account_status = 'approved')
  with check (auth.uid() = id);

-- Block JWT-authenticated users from changing privileged fields.
-- Service-role (API) updates carry no user JWT (auth.uid() is null) and pass.
create or replace function public.guard_profile_privileged_columns()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is not null then
    if new.id is distinct from old.id
      or lower(new.email) is distinct from lower(old.email)
      or new.role is distinct from old.role
      or new.requested_role is distinct from old.requested_role
      or new.section_id is distinct from old.section_id
      or new.account_status is distinct from old.account_status
      or new.approved_by is distinct from old.approved_by
      or new.approved_at is distinct from old.approved_at
    then
      raise exception 'PRIVILEGED_COLUMNS_READONLY: role, status and approval fields can only be changed by an administrator';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_profiles_guard_privileged on public.profiles;
create trigger trg_profiles_guard_privileged
before update on public.profiles
for each row execute function public.guard_profile_privileged_columns();

-- ---------------------------------------------------------------------------
-- login_security — NO policies: invisible to all JWT-authenticated clients.
-- Access happens exclusively through SECURITY DEFINER functions (0003)
-- or the service-role key on the server.
-- ---------------------------------------------------------------------------
alter table public.login_security enable row level security;

-- ---------------------------------------------------------------------------
-- audit_logs — readable only by approved Administrators; writes happen
-- through SECURITY DEFINER functions or the service-role key.
-- ---------------------------------------------------------------------------
alter table public.audit_logs enable row level security;

drop policy if exists "admins read audit logs" on public.audit_logs;
create policy "admins read audit logs"
  on public.audit_logs
  for select
  to authenticated
  using (public.is_admin());
