-- ===========================================================================
-- SPID File Management System — 0024: One active issuance per file
--
-- Approving a staff request IS the issuance event: the row becomes
-- status = 'APPROVED' with returned_at still null, and it stops being an
-- issuance the moment the file is returned. Two administrators approving
-- different requests for the same physical file must therefore never both
-- succeed, and no application-level check can close that race on its own.
--
-- This partial unique index makes the database the arbiter. The approval
-- path (StaffFileRequestController.review) maps the resulting 23505 into the
-- same "File Currently Issued" response it produces from its own pre-check.
--
-- Nothing here rejects or cancels a request. If the live database already
-- contains overlapping issuances, the migration stops with a report instead
-- of silently picking a winner — resolve them by returning or rejecting the
-- extra copies, then re-run.
--
-- Idempotent: safe to paste into the Supabase SQL Editor and re-run.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 1. Refuse to index over existing overlapping issuances.
--    Raising leaves the data untouched and tells the operator exactly what
--    to fix.
-- ---------------------------------------------------------------------------
do $$
declare
  conflicting_files integer;
begin
  select count(*)
    into conflicting_files
    from (
      select file_id
      from public.staff_file_requests
      where status = 'APPROVED'
        and returned_at is null
      group by file_id
      having count(*) > 1
    ) conflicts;

  if conflicting_files > 0 then
    raise exception
      'Migration 0024 aborted: % file(s) have more than one approved, unreturned request. Run the duplicate report in this file, return or reject the extra requests, then re-run the migration.',
      conflicting_files;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 2. At most one approved-and-unreturned request per file.
--    Rows leave the index as soon as they are returned, rejected or
--    cancelled, so history is never constrained.
-- ---------------------------------------------------------------------------
create unique index if not exists uq_staff_file_requests_active_issuance
  on public.staff_file_requests (file_id)
  where status = 'APPROVED' and returned_at is null;

-- ---------------------------------------------------------------------------
-- 3. Supporting index: the availability lookup filters file_id + status and
--    tests returned_at, which the partial index above already covers.
--
--    Duplicate report (read-only) — run this first if step 1 aborts:
--
--      select r.id, r.file_id, r.file_no, r.requester_name,
--             r.issued_at, r.expected_return_date
--        from public.staff_file_requests r
--        join (
--          select file_id
--            from public.staff_file_requests
--           where status = 'APPROVED' and returned_at is null
--           group by file_id
--          having count(*) > 1
--        ) d on d.file_id = r.file_id
--       where r.status = 'APPROVED' and r.returned_at is null
--       order by r.file_id, r.issued_at;
-- ---------------------------------------------------------------------------
