-- ===========================================================================
-- SPID File Management System — 0036: Soft-delete files, protect history
--
-- Soft-deletes file records in public.files so that historical staff requests,
-- checkouts, extensions, and audit trails remain completely intact.
--
-- Adds:
--   - is_deleted boolean not null default false
--   - deleted_at timestamptz
--   - deleted_by uuid references auth.users (id) on delete set null
--   - deletion_reason text
--
-- Updates:
--   - uq_files_file_no_live unique index to exclude soft-deleted rows
--   - file_summary_counts() function to include deletedCount and exclude
--     soft-deleted files from active buckets.
--
-- Idempotent: safe to run in Supabase SQL Editor.
-- ===========================================================================

-- 1. Soft delete fields on public.files
alter table public.files
  add column if not exists is_deleted boolean not null default false,
  add column if not exists deleted_at timestamptz,
  add column if not exists deleted_by uuid references auth.users (id) on delete set null,
  add column if not exists deletion_reason text;

create index if not exists idx_files_is_deleted
  on public.files (is_deleted, created_at desc);

comment on column public.files.is_deleted is
  'Soft delete marker. Deleted files retain all historical request and checkout logs; they are hidden from active lists and shown in Deleted Files.';

-- 2. Update unique index on file_no so soft-deleted files release their unique constraint
drop index if exists public.uq_files_file_no_live;

create unique index if not exists uq_files_file_no_live
  on public.files (lower(btrim(file_no)))
  where status <> 'REJECTED' and is_deleted = false;

-- 3. Fast calculation of total page numbers across active files
create or replace function public.file_total_pages()
returns bigint
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(sum(page_numbers), 0)::bigint
  from public.files
  where coalesce(is_deleted, false) = false
    and status <> 'REJECTED';
$$;

revoke all on function public.file_total_pages() from public;
revoke all on function public.file_total_pages() from anon;
revoke all on function public.file_total_pages() from authenticated;
grant execute on function public.file_total_pages() to service_role;

-- 4. Update summary counts RPC
create or replace function public.file_summary_counts()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'totalArchives', count(*) filter (
      where coalesce(is_deleted, false) = false
        and status in ('APPROVED', 'active', 'archived', 'issued')
    ),
    'todayCount', count(*) filter (
      where coalesce(is_deleted, false) = false
        and created_at >= date_trunc('day', now() at time zone 'Asia/Colombo')
          at time zone 'Asia/Colombo'
    ),
    'allFilesCount', count(*) filter (
      where coalesce(is_deleted, false) = false
        and status in ('APPROVED', 'active', 'archived', 'issued')
    ),
    'pendingCount', count(*) filter (
      where coalesce(is_deleted, false) = false
        and status = 'PENDING'
    ),
    'rejectedCount', count(*) filter (
      where coalesce(is_deleted, false) = false
        and status = 'REJECTED'
    ),
    'deletedCount', count(*) filter (
      where is_deleted = true
    ),
    'totalPageNumbers', coalesce(
      sum(page_numbers) filter (
        where coalesce(is_deleted, false) = false
          and status <> 'REJECTED'
      ),
      0
    )::bigint
  )
  from public.files;
$$;

revoke all on function public.file_summary_counts() from public;
revoke all on function public.file_summary_counts() from anon;
revoke all on function public.file_summary_counts() from authenticated;
grant execute on function public.file_summary_counts() to service_role;
