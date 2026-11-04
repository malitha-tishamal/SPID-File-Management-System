-- Migration 0023: Full System Performance Indexes
-- Adds targeted composite indexes for Staff requests, file issuance queries,
-- profile lookups, and user-specific file/notification retrieval.

-- 1. Staff file requests: fast lookups for competing requests and active issuance
create index if not exists idx_staff_file_requests_file_status
  on public.staff_file_requests (file_id, status);

create index if not exists idx_staff_file_requests_status_returned
  on public.staff_file_requests (status, returned_at);

create index if not exists idx_staff_file_requests_requester_status
  on public.staff_file_requests (requester_id, status, created_at desc);

-- 2. Profiles: fast role and account status checking for auth and admin listings
create index if not exists idx_profiles_role_status
  on public.profiles (role, account_status);

-- 3. Files: user-scoped lookups for staff dashboard counters & staff files tab
create index if not exists idx_files_created_by
  on public.files (created_by, created_at desc);

create index if not exists idx_files_registered_by
  on public.files (registered_by, created_at desc);

create index if not exists idx_files_status_file_no
  on public.files (status, file_no);

-- 4. Notifications: fast lookup for unread notifications sorted newest-first
create index if not exists idx_notifications_user_unread_created
  on public.notifications (user_id, created_at desc)
  where read_at is null;
