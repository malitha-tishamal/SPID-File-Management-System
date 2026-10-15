-- 0005: Admin Management support.
-- Additive + referential repairs so account deletion cannot strand history.

-- Last login stamp, updated by the service-role client after each successful sign-in.
alter table public.profiles add column if not exists last_login_at timestamptz;

-- Historical references must never block deleting an auth user:
-- keep the rows, release the reference.
alter table public.audit_logs
  drop constraint if exists audit_logs_actor_id_fkey;
alter table public.audit_logs
  add constraint audit_logs_actor_id_fkey
  foreign key (actor_id) references auth.users (id) on delete set null;

alter table public.audit_logs
  drop constraint if exists audit_logs_target_user_id_fkey;
alter table public.audit_logs
  add constraint audit_logs_target_user_id_fkey
  foreign key (target_user_id) references auth.users (id) on delete set null;

alter table public.profiles
  drop constraint if exists profiles_approved_by_fkey;
alter table public.profiles
  add constraint profiles_approved_by_fkey
  foreign key (approved_by) references auth.users (id) on delete set null;
