-- ===========================================================================
-- SPID File Management System — 0018: scheduled return-due notifications.
--
-- Notifications created by an action (approval, extension decision, return)
-- are written by the application. Overdue / due-today / due-soon warnings are
-- different: time itself is the trigger, and nobody performs an action when a
-- deadline passes. This migration puts that generator in the database so it
-- can run whether or not anyone has the portal open, and so the rule lives in
-- exactly one place.
--
-- The app calls the same function when a user opens their notification list,
-- which keeps the panel correct even on projects where pg_cron is unavailable.
-- Dedupe is handled by the partial unique index on
-- notifications (user_id, dedupe_key): re-running the function for the same
-- file, same deadline and same bucket inserts nothing.
--
-- Idempotent: safe to paste into the Supabase SQL Editor and re-run.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- Generator function
-- ---------------------------------------------------------------------------
create or replace function public.generate_return_due_notifications(
  p_today date default ((now() at time zone 'Asia/Colombo')::date)
) returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_inserted integer := 0;
  v_rows integer := 0;
begin
  -- Staff: one message per (file, deadline, urgency bucket).
  with due_files as (
    select
      r.id,
      r.requester_id,
      r.file_no,
      r.file_name,
      r.expected_return_date,
      (p_today - r.expected_return_date) as days_over
    from public.staff_file_requests r
    where r.status = 'APPROVED'
      and r.returned_at is null
      and r.expected_return_date is not null
      and r.expected_return_date <= (p_today + 3)
  ),
  messages as (
    select
      d.requester_id as user_id,
      case
        when d.expected_return_date < p_today
          then 'File overdue: ' || d.file_no
        when d.expected_return_date = p_today
          then 'File due today: ' || d.file_no
        else 'File due soon: ' || d.file_no
      end as title,
      case
        when d.expected_return_date < p_today then
          d.file_name || ' was due back on '
          || to_char(d.expected_return_date, 'DD Mon YYYY') || ' and is '
          || d.days_over || ' day(s) overdue. Return it to the Record Room or '
          || 'request a return-date extension.'
        when d.expected_return_date = p_today then
          d.file_name || ' must be returned today ('
          || to_char(d.expected_return_date, 'DD Mon YYYY') || ').'
        else
          d.file_name || ' is due back on '
          || to_char(d.expected_return_date, 'DD Mon YYYY') || ' ('
          || (d.expected_return_date - p_today) || ' day(s) remaining).'
      end as body,
      case
        when d.expected_return_date < p_today then 'error'
        when d.expected_return_date = p_today then 'warning'
        else 'info'
      end as type,
      '/staff/your-requests?request=' || d.id as link,
      'return-due:' || d.id || ':' || d.expected_return_date || ':' ||
        case
          when d.expected_return_date < p_today then 'overdue'
          when d.expected_return_date = p_today then 'due-today'
          else 'due-soon'
        end as dedupe_key
    from due_files d
    where d.requester_id is not null
  )
  insert into public.notifications (user_id, title, body, type, link, dedupe_key)
  select m.user_id, m.title, m.body, m.type, m.link, m.dedupe_key
  from messages m
  on conflict (user_id, dedupe_key) where dedupe_key is not null do nothing;

  get diagnostics v_rows = row_count;
  v_inserted := v_inserted + v_rows;

  -- Administrators: one overdue alert per (file, deadline).
  with overdue as (
    select r.id, r.file_no, r.file_name, r.expected_return_date
    from public.staff_file_requests r
    where r.status = 'APPROVED'
      and r.returned_at is null
      and r.expected_return_date is not null
      and r.expected_return_date < p_today
  ),
  admins as (
    select p.id
    from public.profiles p
    where p.role = 'Administrator'
      and p.account_status = 'approved'
  ),
  alerts as (
    select
      a.id as user_id,
      'Overdue issued file: ' || o.file_no as title,
      o.file_name || ' (issued to staff) was due on '
      || to_char(o.expected_return_date, 'DD Mon YYYY') || ' and has not been '
      || 'returned. Record the return or extend the due date.' as body,
      'warning' as type,
      '/admin/issued-files?file=' || o.id as link,
      'admin-overdue:' || o.id || ':' || o.expected_return_date as dedupe_key
    from overdue o
    cross join admins a
  )
  insert into public.notifications (user_id, title, body, type, link, dedupe_key)
  select x.user_id, x.title, x.body, x.type, x.link, x.dedupe_key
  from alerts x
  on conflict (user_id, dedupe_key) where dedupe_key is not null do nothing;

  get diagnostics v_rows = row_count;
  v_inserted := v_inserted + v_rows;

  return v_inserted;
end;
$$;

-- Only the service role may run it: the API calls it with the admin client,
-- and no browser session should be able to enqueue rows directly.
revoke all on function public.generate_return_due_notifications(date) from public;
revoke all on function public.generate_return_due_notifications(date) from anon;
revoke all on function public.generate_return_due_notifications(date) from authenticated;
grant execute on function public.generate_return_due_notifications(date) to service_role;

comment on function public.generate_return_due_notifications(date) is
  'Creates deduped overdue / due-today / due-soon notifications for issued '
  'files and overdue alerts for administrators. Safe to run repeatedly.';

-- ---------------------------------------------------------------------------
-- Optional daily schedule. Skipped silently when pg_cron is not installed.
-- 02:30 UTC = 08:00 Asia/Colombo, so staff see the alert at the start of the
-- working day without anyone having to open the portal.
-- ---------------------------------------------------------------------------
do $$ begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    if not exists (
      select 1 from cron.job where jobname = 'spid-return-due-notifications'
    ) then
      perform cron.schedule(
        'spid-return-due-notifications',
        '30 2 * * *',
        $job$select public.generate_return_due_notifications()$job$
      );
    end if;
  end if;
end $$;

-- Ask PostgREST to pick up the new function.
notify pgrst, 'reload schema';
