-- ===========================================================================
-- SPID File Management System — 0019: File No. is the unique business key
--
-- No two live file records may share a file number. A rejected submission
-- releases its number, so a rejected entry can be corrected and resubmitted
-- under the same File No.
--
-- Existing duplicates are resolved without deleting any data: the oldest
-- record keeps the number and every later duplicate is moved to the Rejected
-- tab with an audit note.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 1. Retire the old composite identity (file_no + file_name).
--    File name is no longer part of the identifying key.
-- ---------------------------------------------------------------------------
alter table public.files
  drop constraint if exists uq_files_file_identity,
  drop constraint if exists uq_files_file_name,
  drop constraint if exists files_file_no_key;

-- ---------------------------------------------------------------------------
-- 2. Resolve existing duplicate file numbers.
--    Older record (lowest id) wins; later duplicates become REJECTED so they
--    no longer occupy the number and remain visible in the Rejected tab.
-- ---------------------------------------------------------------------------
with ranked as (
  select
    id,
    row_number() over (
      partition by lower(btrim(file_no))
      order by id
    ) as rn
  from public.files
  where status <> 'REJECTED'
)
update public.files as f
set
  status = 'REJECTED',
  reject_reason = coalesce(
    f.reject_reason,
    'Duplicate file number — auto-resolved by migration 0019. The oldest record was kept.'
  ),
  rejected_at = coalesce(f.rejected_at, now()),
  rejected_by_name = coalesce(f.rejected_by_name, 'System migration'),
  updated_at = now()
from ranked r
where f.id = r.id
  and r.rn > 1;

-- ---------------------------------------------------------------------------
-- 3. One live record per file number.
--    Case-insensitive and whitespace-trimmed, matching the app's lookups.
--    Partial: REJECTED rows are excluded, so a rejected number can be reused.
-- ---------------------------------------------------------------------------
create unique index if not exists uq_files_file_no_live
  on public.files (lower(btrim(file_no)))
  where status <> 'REJECTED';
