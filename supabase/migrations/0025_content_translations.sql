-- ===========================================================================
-- SPID File Management System — 0025: database content translations.
--
-- Officers record file names, section names, storage locations, notes and
-- rejection reasons in English. The portal can display either language, so
-- that officer-typed text needs a Sinhala rendering too — including for rows
-- created after this migration ships.
--
-- The cache below is the single store for those renderings. Its key is the
-- SHA-256 of "<target language>:<source text>", so identical text is translated
-- once no matter which table, row or page asks for it. Translating happens in
-- the application (`TranslationService`), never in the browser: the provider
-- key is server-only, and a cache hit costs one indexed lookup.
--
-- Notification rows switch to a key + params model: the message is worded at
-- read time, so one stored row renders correctly in English and in Sinhala.
-- The existing title/body columns stay as the English fallback and as the
-- record of what was actually sent.
--
-- Idempotent: safe to paste into the Supabase SQL Editor and re-run.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 1. Translation cache
-- ---------------------------------------------------------------------------
create table if not exists public.content_translations (
  id bigint generated always as identity primary key,
  -- sha256(target_lang + ':' + source_text); fixed width hex.
  source_hash text not null,
  source_lang text not null default 'en',
  target_lang text not null,
  source_text text not null,
  translated_text text not null,
  -- 'glossary' | 'manual' | provider name returned with the translation.
  provider text not null default 'glossary',
  -- Officer-approved wording. Auto-translation must never overwrite it.
  is_manual boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint content_translations_hash_lang_unique unique (source_hash, target_lang)
);

create index if not exists idx_content_translations_text
  on public.content_translations (target_lang, source_text);

drop trigger if exists trg_content_translations_updated_at on public.content_translations;
create trigger trg_content_translations_updated_at
before update on public.content_translations
for each row execute function public.set_updated_at();

alter table public.content_translations enable row level security;

-- No policies on purpose: this table is read and written only by the
-- service-role client in server code. Browser sessions have no access, which
-- also keeps provider output and any manual corrections out of the client.
revoke all on public.content_translations from public;
revoke all on public.content_translations from anon;
revoke all on public.content_translations from authenticated;
grant all on public.content_translations to service_role;
grant usage, select on sequence public.content_translations_id_seq to service_role;

-- ---------------------------------------------------------------------------
-- 2. Notifications: key + params alongside the English fallback
-- ---------------------------------------------------------------------------
alter table public.notifications add column if not exists title_key text;
alter table public.notifications add column if not exists body_key text;
alter table public.notifications add column if not exists params jsonb;

comment on column public.notifications.title_key is
  'Translation key resolved at read time (notifications namespace). Falls back to title.';
comment on column public.notifications.body_key is
  'Translation key resolved at read time (notifications namespace). Falls back to body.';
comment on column public.notifications.params is
  'Interpolation values for title_key/body_key. Keys ending in "Date" are formatted per locale.';

-- ---------------------------------------------------------------------------
-- 3. Return-due generator writes keys and params as well as the English text.
--    Dedupe keys are unchanged, so a re-run still inserts nothing new.
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
        when d.expected_return_date < p_today
          then 'content.returnDue.staffOverdueTitle'
        when d.expected_return_date = p_today
          then 'content.returnDue.staffDueTodayTitle'
        else 'content.returnDue.staffDueSoonTitle'
      end as title_key,
      case
        when d.expected_return_date < p_today
          then 'content.returnDue.staffOverdueBody'
        when d.expected_return_date = p_today
          then 'content.returnDue.staffDueTodayBody'
        else 'content.returnDue.staffDueSoonBody'
      end as body_key,
      jsonb_build_object(
        'fileNo', d.file_no,
        'fileName', d.file_name,
        'dueDate', to_char(d.expected_return_date, 'YYYY-MM-DD'),
        'days', case
          when d.expected_return_date < p_today then d.days_over
          else (d.expected_return_date - p_today)
        end
      ) as params,
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
  insert into public.notifications (
    user_id, title, body, type, link, dedupe_key, title_key, body_key, params
  )
  select
    m.user_id, m.title, m.body, m.type, m.link, m.dedupe_key,
    m.title_key, m.body_key, m.params
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
      'content.returnDue.adminOverdueTitle' as title_key,
      'content.returnDue.adminOverdueBody' as body_key,
      jsonb_build_object(
        'fileNo', o.file_no,
        'fileName', o.file_name,
        'dueDate', to_char(o.expected_return_date, 'YYYY-MM-DD')
      ) as params,
      'warning' as type,
      '/admin/issued-files?file=' || o.id as link,
      'admin-overdue:' || o.id || ':' || o.expected_return_date as dedupe_key
    from overdue o
    cross join admins a
  )
  insert into public.notifications (
    user_id, title, body, type, link, dedupe_key, title_key, body_key, params
  )
  select
    x.user_id, x.title, x.body, x.type, x.link, x.dedupe_key,
    x.title_key, x.body_key, x.params
  from alerts x
  on conflict (user_id, dedupe_key) where dedupe_key is not null do nothing;

  get diagnostics v_rows = row_count;
  v_inserted := v_inserted + v_rows;

  return v_inserted;
end;
$$;

revoke all on function public.generate_return_due_notifications(date) from public;
revoke all on function public.generate_return_due_notifications(date) from anon;
revoke all on function public.generate_return_due_notifications(date) from authenticated;
grant execute on function public.generate_return_due_notifications(date) to service_role;

comment on function public.generate_return_due_notifications(date) is
  'Creates deduped overdue / due-today / due-soon notifications for issued '
  'files and overdue alerts for administrators. Writes title/body keys and '
  'params so the same row renders in English or Sinhala. Safe to run repeatedly.';

-- Ask PostgREST to pick up the new columns and function signature.
notify pgrst, 'reload schema';
