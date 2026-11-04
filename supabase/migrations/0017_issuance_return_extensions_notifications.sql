-- ===========================================================================
-- SPID File Management System — 0017: Issuance tracking, return-date
-- extensions, and persistent notifications.
--
-- 1. staff_file_requests gains the physical-issuance fields the approved
--    requests were missing (expected return date, issue/return timestamps).
-- 2. file_request_extensions records every extension — staff-requested or
--    admin-applied — with its own approval status, so the official return
--    date only moves when an administrator approves.
-- 3. notifications stores per-user messages with a dedupe key so a retried
--    action cannot enqueue the same message twice.
--
-- All statements are idempotent: safe to paste into the Supabase SQL Editor
-- and re-run.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 1. Issuance / return fields on staff_file_requests
-- ---------------------------------------------------------------------------
do $$ begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'staff_file_requests'
      and column_name = 'original_return_date'
  ) then
    alter table public.staff_file_requests
      add column original_return_date date;
  end if;
end $$;

do $$ begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'staff_file_requests'
      and column_name = 'expected_return_date'
  ) then
    alter table public.staff_file_requests
      add column expected_return_date date;
  end if;
end $$;

do $$ begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'staff_file_requests'
      and column_name = 'issued_at'
  ) then
    alter table public.staff_file_requests add column issued_at timestamptz;
  end if;
end $$;

do $$ begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'staff_file_requests'
      and column_name = 'returned_at'
  ) then
    alter table public.staff_file_requests add column returned_at timestamptz;
  end if;
end $$;

do $$ begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'staff_file_requests'
      and column_name = 'returned_by'
  ) then
    alter table public.staff_file_requests
      add column returned_by uuid references public.profiles (id) on delete set null;
  end if;
end $$;

-- Back-fill already-approved requests so the new columns are never null for
-- historical issuances.
update public.staff_file_requests
set original_return_date = coalesce(
      original_return_date,
      (request_date + make_interval(days => least(duration_days, 3650)::int))::date
    ),
    expected_return_date = coalesce(
      expected_return_date,
      original_return_date,
      (request_date + make_interval(days => least(duration_days, 3650)::int))::date
    ),
    issued_at = coalesce(issued_at, reviewed_at)
where status = 'APPROVED'
  and (original_return_date is null or expected_return_date is null or issued_at is null);

create index if not exists idx_staff_file_requests_return
  on public.staff_file_requests (status, expected_return_date);

-- ---------------------------------------------------------------------------
-- 2. Extension requests / history
-- ---------------------------------------------------------------------------
create table if not exists public.file_request_extensions (
  id bigint generated always as identity primary key,
  request_id bigint not null
    references public.staff_file_requests (id) on delete cascade,
  file_no text not null,
  file_name text not null,
  previous_return_date date not null,
  new_return_date date not null,
  reason text not null check (char_length(trim(reason)) > 0),
  status text not null default 'PENDING'
    check (status in ('PENDING', 'APPROVED', 'REJECTED')),
  requested_by uuid not null references public.profiles (id) on delete cascade,
  requested_by_name text,
  -- An admin applying an extension directly has no separate request row:
  -- requested_by and reviewed_by are then the same person.
  reviewed_by uuid references public.profiles (id) on delete set null,
  reviewed_by_name text,
  reviewed_at timestamptz,
  review_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint file_request_extensions_dates_valid
    check (new_return_date > previous_return_date)
);

create index if not exists idx_file_request_extensions_request
  on public.file_request_extensions (request_id, created_at desc);
create index if not exists idx_file_request_extensions_status
  on public.file_request_extensions (status, created_at desc);

-- One awaiting-decision extension per request; retried submissions reuse the
-- existing pending row instead of piling up duplicates.
create unique index if not exists uq_file_request_extensions_active
  on public.file_request_extensions (request_id)
  where status = 'PENDING';

alter table public.file_request_extensions enable row level security;

drop policy if exists "staff can read own extensions" on public.file_request_extensions;
create policy "staff can read own extensions"
  on public.file_request_extensions for select to authenticated
  using (requested_by = auth.uid() or public.is_admin());

drop policy if exists "staff can create own extensions" on public.file_request_extensions;
create policy "staff can create own extensions"
  on public.file_request_extensions for insert to authenticated
  with check (requested_by = auth.uid() and public.is_approved());

drop policy if exists "admins can review extensions" on public.file_request_extensions;
create policy "admins can review extensions"
  on public.file_request_extensions for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop trigger if exists trg_file_request_extensions_updated_at on public.file_request_extensions;
create trigger trg_file_request_extensions_updated_at
before update on public.file_request_extensions
for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- 3. Notifications
-- ---------------------------------------------------------------------------
create table if not exists public.notifications (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  title text not null,
  body text,
  type text not null default 'info'
    check (type in ('info', 'success', 'warning', 'error')),
  link text,
  -- Stable identifier for the triggering event: makes notification writes
  -- idempotent when an action is retried.
  dedupe_key text,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create unique index if not exists uq_notifications_dedupe
  on public.notifications (user_id, dedupe_key)
  where dedupe_key is not null;

create index if not exists idx_notifications_user_recent
  on public.notifications (user_id, created_at desc);
create index if not exists idx_notifications_user_unread
  on public.notifications (user_id)
  where read_at is null;

alter table public.notifications enable row level security;

drop policy if exists "users read own notifications" on public.notifications;
create policy "users read own notifications"
  on public.notifications for select to authenticated
  using (user_id = auth.uid());

drop policy if exists "users mark own notifications read" on public.notifications;
create policy "users mark own notifications read"
  on public.notifications for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());
