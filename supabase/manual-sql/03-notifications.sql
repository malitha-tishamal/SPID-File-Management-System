-- ===========================================================================
-- SPID File Management — 0017 Part 3 of 3: notifications table + RLS.
-- Run AFTER 01-issuance-columns.sql. Idempotent.
-- ===========================================================================

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


-- Ask PostgREST to reload its schema cache so the app sees the new
-- columns/table without restarting the project.
notify pgrst, 'reload schema';
