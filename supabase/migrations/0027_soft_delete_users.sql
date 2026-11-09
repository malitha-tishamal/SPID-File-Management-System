-- ===========================================================================
-- SPID File Management System — 0027: Soft-delete users, protect history
--
-- Deleting an account must never remove or damage departmental records.
-- Accounts are now soft-deleted: the profile row (and the auth user) stay in
-- place so every file, request, checkout, approval, notification and log keeps
-- its author. Only the sign-in identity and the email address are retired.
--
-- This migration:
--   1. adds the soft-delete fields to public.profiles,
--   2. turns every user-referencing foreign key that could cascade (or null
--      out history) into ON DELETE RESTRICT.
--
-- The auth user is kept but banned by the application; keeping it is what lets
-- audit_logs/files/requests keep a valid author reference. A hard delete of a
-- user who still owns records now fails inside Postgres, even when issued
-- directly from the SQL editor.
--
-- Idempotent: safe to re-run in the Supabase SQL Editor.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 1. Soft-delete state
-- ---------------------------------------------------------------------------
alter table public.profiles
  add column if not exists is_deleted boolean not null default false,
  add column if not exists deleted_at timestamptz,
  add column if not exists deleted_by uuid references auth.users (id) on delete set null,
  add column if not exists deletion_reason text,
  -- The address the account used before deletion. profiles.email is replaced
  -- with a reserved deleted+<id>@deleted.invalid address so the original can be
  -- registered again without losing the historical link.
  add column if not exists original_email text;

create index if not exists idx_profiles_is_deleted
  on public.profiles (is_deleted, created_at desc);

comment on column public.profiles.is_deleted is
  'Soft delete marker. Deleted accounts keep all historical records; they cannot sign in and are hidden from active lists.';
comment on column public.profiles.original_email is
  'Email before soft deletion. profiles.email becomes deleted+<id>@deleted.invalid.';

-- ---------------------------------------------------------------------------
-- 2. Foreign keys must never cascade or null out history
--
-- Recreate each constraint explicitly so the rule is visible in the schema.
-- ---------------------------------------------------------------------------

-- Files: who registered / created / approved the record.
alter table public.files drop constraint if exists files_registered_by_fkey;
alter table public.files
  add constraint files_registered_by_fkey
  foreign key (registered_by) references auth.users (id) on delete restrict;

alter table public.files drop constraint if exists files_created_by_fkey;
alter table public.files
  add constraint files_created_by_fkey
  foreign key (created_by) references auth.users (id) on delete restrict;

alter table public.files drop constraint if exists files_approved_by_fkey;
alter table public.files
  add constraint files_approved_by_fkey
  foreign key (approved_by) references auth.users (id) on delete restrict;

-- Staff requests: the requester is NOT NULL and the row is history.
alter table public.staff_file_requests drop constraint if exists staff_file_requests_requester_id_fkey;
alter table public.staff_file_requests
  add constraint staff_file_requests_requester_id_fkey
  foreign key (requester_id) references public.profiles (id) on delete restrict;

alter table public.staff_file_requests drop constraint if exists staff_file_requests_reviewed_by_fkey;
alter table public.staff_file_requests
  add constraint staff_file_requests_reviewed_by_fkey
  foreign key (reviewed_by) references public.profiles (id) on delete restrict;

alter table public.staff_file_requests drop constraint if exists staff_file_requests_returned_by_fkey;
alter table public.staff_file_requests
  add constraint staff_file_requests_returned_by_fkey
  foreign key (returned_by) references public.profiles (id) on delete restrict;

-- Extension history: requester and reviewer attribution.
alter table public.file_request_extensions drop constraint if exists file_request_extensions_requested_by_fkey;
alter table public.file_request_extensions
  add constraint file_request_extensions_requested_by_fkey
  foreign key (requested_by) references public.profiles (id) on delete restrict;

alter table public.file_request_extensions drop constraint if exists file_request_extensions_reviewed_by_fkey;
alter table public.file_request_extensions
  add constraint file_request_extensions_reviewed_by_fkey
  foreign key (reviewed_by) references public.profiles (id) on delete restrict;

-- Notifications are part of the delivered history.
alter table public.notifications drop constraint if exists notifications_user_id_fkey;
alter table public.notifications
  add constraint notifications_user_id_fkey
  foreign key (user_id) references public.profiles (id) on delete restrict;

-- Audit trail: actor and target attribution must survive.
alter table public.audit_logs drop constraint if exists audit_logs_actor_id_fkey;
alter table public.audit_logs
  add constraint audit_logs_actor_id_fkey
  foreign key (actor_id) references auth.users (id) on delete restrict;

alter table public.audit_logs drop constraint if exists audit_logs_target_user_id_fkey;
alter table public.audit_logs
  add constraint audit_logs_target_user_id_fkey
  foreign key (target_user_id) references auth.users (id) on delete restrict;

alter table public.profiles drop constraint if exists profiles_approved_by_fkey;
alter table public.profiles
  add constraint profiles_approved_by_fkey
  foreign key (approved_by) references auth.users (id) on delete restrict;

-- Sign-in attempt log (security history).
alter table public.login_attempts drop constraint if exists login_attempts_user_id_fkey;
alter table public.login_attempts
  add constraint login_attempts_user_id_fkey
  foreign key (user_id) references auth.users (id) on delete restrict;

-- Last editor of system settings.
do $$ begin
  if to_regclass('public.system_settings') is not null then
    alter table public.system_settings drop constraint if exists system_settings_updated_by_fkey;
    alter table public.system_settings
      add constraint system_settings_updated_by_fkey
      foreign key (updated_by) references auth.users (id) on delete restrict;
  end if;
end $$;

-- Note: profiles.id -> auth.users stays ON DELETE CASCADE on purpose. A hard
-- delete with zero related records may still remove an unused identity; as soon
-- as the account owns a file, request, notification, audit row or login attempt,
-- one of the RESTRICT constraints above aborts the whole delete.
