/**
 * Single source of truth for a file's storage-location status.
 *
 * A file is "assigned" once locker, shelf and position are recorded. The
 * record room no longer exists: the column was dropped, so locations are
 * built only from fields that were actually entered.
 */

export type LocationStatus = 'ASSIGNED' | 'PARTIAL' | 'UNASSIGNED';

export interface LocationFields {
  locker_no?: string | null;
  shelf_name?: string | null;
  shelf_position?: string | null;
}

export interface LocationStatusResult {
  status: LocationStatus;
  /** Machine names of the missing parts (locker, shelf, position). */
  missing: string[];
}

const PARTS = ['locker', 'shelf', 'position'] as const;

function partValue(file: LocationFields, part: (typeof PARTS)[number]): string | null {
  const v =
    part === 'locker'
      ? file.locker_no
      : part === 'shelf'
        ? file.shelf_name
        : file.shelf_position;
  return typeof v === 'string' && v.trim() !== '' ? v.trim() : null;
}

export function getLocationStatus(file: LocationFields): LocationStatusResult {
  const missing = PARTS.filter((p) => partValue(file, p) === null);
  if (missing.length === 0) return { status: 'ASSIGNED', missing };
  if (partValue(file, 'locker') === null && partValue(file, 'shelf') === null) {
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
  return parts.join(' / ');
}

export function needsLocationAssignment(file: LocationFields): boolean {
  return getLocationStatus(file).status !== 'ASSIGNED';
}
