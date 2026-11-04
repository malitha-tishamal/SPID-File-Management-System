-- Single-round-trip summary counts for dashboard cards and tab badges.
-- Replaces five separate `count: exact` requests (one per status/bucket) with
-- one aggregate call, without changing the numbers themselves.
--
-- Status buckets match FileRepository.getSummaryCounts():
--   totalArchives  -> APPROVED / active / archived / issued
--   todayCount     -> created_at on or after today's Sri Lanka midnight
--   allFilesCount  -> every row
--   pendingCount   -> PENDING
--   rejectedCount  -> REJECTED

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
    'rejectedCount', count(*) filter (where status = 'REJECTED')
  )
  from public.files;
$$;

-- Only the server (service role) calls this; it bypasses RLS via security definer.
revoke all on function public.file_summary_counts() from public;
revoke all on function public.file_summary_counts() from anon;
revoke all on function public.file_summary_counts() from authenticated;
grant execute on function public.file_summary_counts() to service_role;
