-- ===========================================================================
-- 0032: Performance indexes for hot query paths.
-- Existing coverage (0001/0007/0008/0011/0013/0015/0016/0017/0021/0022) already
-- handles files search/list, profiles email/status/role/section, request
-- requester/status, notification user recency/unread, and audit created_at.
-- This migration adds the remaining gaps:
--   * audit_logs.action          — Security Logs page filters by action
--                                  (security.% / per-tab whitelists) and the
--                                  deletion RPC scans by action + deleted_at.
--   * notifications (user_id,status) and (ref_type,ref_id) — Active/History
--     tabs and per-request resolution lookups (0029 fields).
--   * staff_file_requests file_id/created_at/priority — issue lookups,
--     admin queue ordering and the competing-request rule.
--   * profiles active-only partial index — admin/staff user lists always
--     filter soft-deleted rows out.
-- ===========================================================================

-- Security Logs page: category tabs filter audit_logs by action.
create index if not exists idx_audit_logs_action
  on public.audit_logs (action);
create index if not exists idx_audit_logs_action_created
  on public.audit_logs (action, created_at desc);

-- Notification bell: Active vs History tabs filter by status per user;
-- request resolution looks up (ref_type, ref_id).
create index if not exists idx_notifications_user_status
  on public.notifications (user_id, status);
create index if not exists idx_notifications_ref
  on public.notifications (ref_type, ref_id);

-- Staff file requests: per-file lookup, queue ordering, priority rule.
create index if not exists idx_staff_file_requests_file_id
  on public.staff_file_requests (file_id);
create index if not exists idx_staff_file_requests_created
  on public.staff_file_requests (created_at desc);
create index if not exists idx_staff_file_requests_priority
  on public.staff_file_requests (priority);

-- User lists always exclude soft-deleted profiles.
create index if not exists idx_profiles_active_status
  on public.profiles (account_status)
  where coalesce(is_deleted, false) = false;
