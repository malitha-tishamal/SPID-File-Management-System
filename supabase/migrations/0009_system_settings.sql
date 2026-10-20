-- ===========================================================================
-- SPID File Management System — 0009: System Settings schema
-- Stores persistent global system configuration (e.g., file approval toggle)
-- ===========================================================================

create table if not exists public.system_settings (
  key text primary key,
  value jsonb not null default '{}'::jsonb,
  description text,
  updated_by uuid references auth.users (id) on delete set null,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

-- Seed default setting: Require Admin Approval for Staff File Submissions = true
insert into public.system_settings (key, value, description)
values (
  'require_staff_file_approval',
  '{"enabled": true}'::jsonb,
  'When enabled, staff file submissions require administrator approval before entering the active repository.'
)
on conflict (key) do nothing;

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
alter table public.system_settings enable row level security;

-- Read access for approved users
drop policy if exists "approved users can read settings" on public.system_settings;
create policy "approved users can read settings"
  on public.system_settings
  for select
  to authenticated
  using (public.is_approved());

-- Update access for administrators only
drop policy if exists "admins can update settings" on public.system_settings;
create policy "admins can update settings"
  on public.system_settings
  for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());
