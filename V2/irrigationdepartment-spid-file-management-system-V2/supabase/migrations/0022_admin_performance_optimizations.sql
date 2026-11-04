-- Migration 0022: Admin Panel Performance Optimizations
-- Adds RPC for instant sum of page numbers and composite index for recent files.

-- 1. Fast calculation of total page numbers across files
create or replace function public.file_total_pages()
returns bigint
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(sum(page_numbers), 0)::bigint from public.files;
$$;

revoke all on function public.file_total_pages() from public;
revoke all on function public.file_total_pages() from anon;
revoke all on function public.file_total_pages() from authenticated;
grant execute on function public.file_total_pages() to service_role;

-- 2. Enhanced file_summary_counts returning totalPageNumbers in single round-trip
create or replace function public.file_summary_counts()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'totalArchives', count(*) filter (
      where status in ('APPROVED', 'active', 'archived', 'issued')
    ),
    'todayCount', count(*) filter (
      where created_at >= date_trunc('day', now() at time zone 'Asia/Colombo')
        at time zone 'Asia/Colombo'
    ),
    'allFilesCount', count(*),
    'pendingCount', count(*) filter (where status = 'PENDING'),
    'rejectedCount', count(*) filter (where status = 'REJECTED'),
    'totalPageNumbers', coalesce(sum(page_numbers), 0)::bigint
  )
  from public.files;
$$;

revoke all on function public.file_summary_counts() from public;
revoke all on function public.file_summary_counts() from anon;
revoke all on function public.file_summary_counts() from authenticated;
grant execute on function public.file_summary_counts() to service_role;

-- 3. Composite index for dashboard recent files query (created_at DESC with status)
create index if not exists idx_files_status_created_at
  on public.files (status, created_at desc);
