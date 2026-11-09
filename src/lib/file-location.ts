/**
 * Single source of truth for a file's storage-location status.
 * A file is only "assigned" when the record room AND locker AND shelf AND
 * position are all set — a record room alone is NOT an assignment.
 */

export type LocationStatus = 'ASSIGNED' | 'PARTIAL' | 'UNASSIGNED';

export interface LocationFields {
  archive_repository?: string | null;
  locker_no?: string | null;
  shelf_name?: string | null;
  shelf_position?: string | null;
}

export interface LocationStatusResult {
  status: LocationStatus;
  /** Machine names of the missing parts (recordRoom, locker, shelf, position). */
  missing: string[];
}

const PARTS = ['recordRoom', 'locker', 'shelf', 'position'] as const;

function partValue(file: LocationFields, part: (typeof PARTS)[number]): string | null {
  const v =
    part === 'recordRoom'
      ? file.archive_repository
      : part === 'locker'
        ? file.locker_no
        : part === 'shelf'
          ? file.shelf_name
          : file.shelf_position;
  return typeof v === 'string' && v.trim() !== '' ? v.trim() : null;
}

export function getLocationStatus(file: LocationFields): LocationStatusResult {
  const missing = PARTS.filter((p) => partValue(file, p) === null);
  if (missing.length === 0) return { status: 'ASSIGNED', missing };
  const setCount = PARTS.length - missing.length;
  // Only a record room (or nothing) means the file was never really placed.
  if (setCount <= 1 && partValue(file, 'locker') === null && partValue(file, 'shelf') === null) {
    return { status: 'UNASSIGNED', missing };
  }
  return { status: 'PARTIAL', missing };
}

/** Readable location text built ONLY from real fields — never invents a room. */
export function formatLocation(file: LocationFields): string {
  const parts = [
    partValue(file, 'locker'),
    partValue(file, 'shelf'),
    partValue(file, 'position'),
  ].filter(Boolean) as string[];
  const room = partValue(file, 'recordRoom');
  if (parts.length === 0) return room ?? '';
  return parts.join(' / ');
}

export function needsLocationAssignment(file: LocationFields): boolean {
  return getLocationStatus(file).status !== 'ASSIGNED';
}
