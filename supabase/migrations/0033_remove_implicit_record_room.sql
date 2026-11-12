-- ===========================================================================
-- SPID File Management System — 0033: remove the implicit record room
--
-- SUPERSEDED BY 0034, which drops files.archive_repository entirely and
-- replaces staff_submit_file_request.
--
-- This file is intentionally reduced to the one step that is safe regardless
-- of whether the column still exists: cleaning the fabricated room out of
-- stored request snapshots. It no longer references files.archive_repository,
-- so running it after 0034 (when the column is already gone) cannot fail with
-- "column archive_repository does not exist".
--
-- Apply 0034 to remove the column and rebuild the submission function.
-- Idempotent: safe to paste into the Supabase SQL Editor and re-run.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- Request snapshots: drop the fabricated leading room, keep real parts
-- ---------------------------------------------------------------------------
update public.staff_file_requests
set storage_location = btrim(
  regexp_replace(
    storage_location,
    '^\s*Central Record Room( \(B-02\))?\s*—?\s*',
    ''
  )
)
where storage_location ~ '^\s*Central Record Room( \(B-02\))?';
