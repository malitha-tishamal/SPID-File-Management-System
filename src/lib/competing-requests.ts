/**
 * The one source of truth for "competing requests".
 *
 * Two or more PENDING requests for the same file compete for one physical
 * folder. Every view that lists or acts on requests — the admin queue, the
 * staff list, the staff submission notice — and the approve API rank that group
 * with these functions, so the screen can never disagree with the server.
 *
 * Grouping: one group per file id, PENDING rows only.
 * Ranking: priority weight (HIGH > NORMAL > LOW), then earliest submission
 * (FIFO), then earliest requested date, then id for determinism.
 */

import { STAFF_REQUEST_PRIORITY_WEIGHT } from 'lib/staffRequestPriority';
import { isStaffRequestPriority, type StaffRequestPriority } from 'lib/staffRequests';

/** The fields the ranking needs; any request row from the API satisfies them. */
export interface CompetingRequestInput {
  id: number;
  file_id?: number | null;
  file_no?: string | null;
  priority?: string | null;
  status?: string | null;
  created_at?: string | null;
  request_date?: string | null;
}

export interface CompetingInfo {
  /** More than one pending request exists for this file. */
  isCompeting: boolean;
  /** 0 = first in line. Only meaningful while `isCompeting`. */
  rank: number;
  isLeader: boolean;
  groupSize: number;
  /** Priority of the rank-0 request, so a later row can say "Same Priority". */
  leaderPriority: StaffRequestPriority | null;
  /** This row shares the leader's priority, so it lost on submission time. */
  samePriorityAsLeader: boolean;
  /** The leader is tied on priority with the request behind it. */
  isTie: boolean;
}

const SOLO: CompetingInfo = {
  isCompeting: false,
  rank: 0,
  isLeader: false,
  groupSize: 1,
  leaderPriority: null,
  samePriorityAsLeader: false,
  isTie: false,
};

function weightOf(priority: string | null | undefined): number {
  return isStaffRequestPriority(priority)
    ? STAFF_REQUEST_PRIORITY_WEIGHT[priority]
    : -1;
}

function normalizedPriority(
  priority: string | null | undefined,
): StaffRequestPriority | null {
  return isStaffRequestPriority(priority) ? priority : null;
}

/** A row with no status came from a query that already filtered to pending. */
function isPending(row: CompetingRequestInput): boolean {
  if (row.status === null || row.status === undefined) return true;
  return String(row.status).toUpperCase() === 'PENDING';
}

/**
 * The key that identifies "the same physical folder". Exported so a view that
 * groups rows per file (the admin "Group same-file requests" order) buckets on
 * exactly the rule the ranking uses, instead of inventing its own.
 */
export function getCompetingGroupKey(row: CompetingRequestInput): string {
  // File id is the grouping key; the number is only a fallback for rows that
  // predate the id being stored, and never mixes the two.
  return Number.isSafeInteger(row.file_id) && Number(row.file_id) > 0
    ? `file:${Number(row.file_id)}`
    : `no:${String(row.file_no ?? '').trim().toUpperCase()}`;
}

function submittedAt(row: CompetingRequestInput): number {
  const time = new Date(String(row.created_at ?? '')).getTime();
  return Number.isFinite(time) ? time : Number.MAX_SAFE_INTEGER;
}

/** Rank 0 first: highest priority, then whoever asked first. */
export function compareCompetingRequests(
  left: CompetingRequestInput,
  right: CompetingRequestInput,
): number {
  const weightDifference = weightOf(right.priority) - weightOf(left.priority);
  if (weightDifference !== 0) return weightDifference;

  const timeDifference = submittedAt(left) - submittedAt(right);
  if (timeDifference !== 0) return timeDifference;

  const dateDifference = String(left.request_date ?? '').localeCompare(
    String(right.request_date ?? ''),
  );
  if (dateDifference !== 0) return dateDifference;

  return Number(left.id) - Number(right.id);
}

/**
 * Rank every pending row against the others competing for the same file.
 * Returns one entry per request id; non-pending rows get `isCompeting: false`,
 * because a decided request no longer competes for the folder.
 */
export function getCompetingInfo(
  requests: readonly CompetingRequestInput[],
): Map<number, CompetingInfo> {
  const info = new Map<number, CompetingInfo>();

  const groups = new Map<string, CompetingRequestInput[]>();
  for (const row of requests) {
    if (!isPending(row)) continue;
    if (!Number.isSafeInteger(row.id)) continue;
    const key = getCompetingGroupKey(row);
    if (!key) continue;
    const bucket = groups.get(key);
    if (bucket) bucket.push(row);
    else groups.set(key, [row]);
  }

  groups.forEach((group) => {
    if (group.length < 2) return;
    const ordered = [...group].sort(compareCompetingRequests);
    const leader = ordered[0];
    const leaderPriority = normalizedPriority(leader.priority);
    const isTie = normalizedPriority(ordered[1].priority) === leaderPriority;

    ordered.forEach((row, rank) => {
      info.set(Number(row.id), {
        isCompeting: true,
        rank,
        isLeader: rank === 0,
        groupSize: ordered.length,
        leaderPriority,
        samePriorityAsLeader: normalizedPriority(row.priority) === leaderPriority,
        isTie,
      });
    });
  });

  return info;
}

/** Convenience for a single row plus the group it belongs to. */
export function getCompetingInfoFor(
  requests: readonly CompetingRequestInput[],
  request: CompetingRequestInput,
): CompetingInfo {
  return getCompetingInfo(requests).get(Number(request.id)) ?? SOLO;
}

/** The shape a non-competing row carries, for callers that need a default. */
export const SOLO_COMPETING_INFO = SOLO;

/** The visual state a competing row carries (also mirrored onto `data-state`). */
export type CompetingRowState = 'leader' | 'next' | 'queued';

export function getCompetingRowState(
  info: CompetingInfo | null | undefined,
): CompetingRowState | undefined {
  if (!info || !info.isCompeting) return undefined;
  if (info.rank === 0) return 'leader';
  if (info.rank === 1) return 'next';
  return 'queued';
}

/**
 * Rank-driven row styling: a light red tint for the request first in line,
 * then progressively softer orange/amber. A row outside a competing group gets
 * nothing, so the normal table styling stays untouched.
 *
 * The tints are deliberately pale and the text colours are left to the shared
 * `--row-text-primary` / `--row-text-secondary` tokens, so every cell stays
 * readable in both themes. Nothing here uses opacity or blur.
 */
export function getCompetingRowClasses(
  info: CompetingInfo | null | undefined,
): string {
  const state = getCompetingRowState(info);
  if (state === 'leader') {
    return 'border-l-4 border-red-500 bg-red-50 hover:bg-red-100 dark:border-red-500 dark:bg-red-950/30 dark:hover:bg-red-950/40';
  }
  if (state === 'next') {
    return 'border-l-4 border-orange-300 bg-orange-50 hover:bg-orange-100 dark:border-orange-400 dark:bg-orange-950/25 dark:hover:bg-orange-950/35';
  }
  if (state === 'queued') {
    return 'border-l-4 border-amber-200 bg-amber-50 hover:bg-amber-100 dark:border-amber-300 dark:bg-amber-950/20 dark:hover:bg-amber-950/30';
  }
  return '';
}

export type CompetingBadgeVariant = 'rank' | 'count';

export interface CompetingBadgeCopy {
  label: string;
  title: string;
  className: string;
}

/**
 * The badge wording, kept here so the admin queue, the staff list and the staff
 * submission notice describe a rank in exactly the same words.
 */
export function getCompetingBadgeCopy(
  info: CompetingInfo | null | undefined,
  variant: CompetingBadgeVariant = 'rank',
): CompetingBadgeCopy | null {
  if (!info || !info.isCompeting) return null;

  if (variant === 'count') {
    return {
      label: `Competing: ${info.groupSize} requests for this file`,
      title: 'Other staff members are waiting for the same folder',
      className:
        'bg-amber-50 text-amber-900 border border-amber-300 dark:bg-amber-900 dark:text-amber-50 dark:border-amber-700',
    };
  }

  if (info.isLeader) {
    return info.isTie
      ? {
          label: '★ Tie Leader (FIFO)',
          title: 'Equal priority, granted precedence because it was submitted earlier (FIFO)',
          className:
            'bg-amber-50 text-amber-900 border border-amber-300 dark:bg-amber-900 dark:text-amber-50 dark:border-amber-700',
        }
      : {
          label: '⚡ Highest Priority',
          title: 'Highest priority among competing requests',
          className:
            'bg-red-50 text-red-800 border border-red-300 dark:bg-red-900 dark:text-red-50 dark:border-red-700',
        };
  }

  return info.samePriorityAsLeader
    ? {
        label: '⚠️ Same Priority (Later)',
        title: 'Same priority as the leader, but submitted later',
        className:
          'bg-slate-100 text-slate-800 border border-slate-300 dark:bg-slate-700 dark:text-slate-50 dark:border-slate-500',
      }
    : {
        label: '⚠️ Lower Priority',
        title: 'A competing request exists with higher priority',
        className:
          'bg-slate-100 text-slate-800 border border-slate-300 dark:bg-slate-700 dark:text-slate-50 dark:border-slate-500',
      };
}

/** Requests in rank order, so a list renders the same sequence as the badges. */
export function sortByCompetingRank<T extends CompetingRequestInput>(
  requests: readonly T[],
  info: Map<number, CompetingInfo>,
): T[] {
  return [...requests].sort((left, right) => {
    const leftRank = info.get(Number(left.id))?.rank ?? Number.MAX_SAFE_INTEGER;
    const rightRank = info.get(Number(right.id))?.rank ?? Number.MAX_SAFE_INTEGER;
    if (leftRank !== rightRank) return leftRank - rightRank;
    return compareCompetingRequests(left, right);
  });
}

/**
 * Every pending request competing for the same file as `request`, highest rank
 * first. Used by the allocation notice and by the auto-reject loop, so the set
 * the admin acts on is the set the badges describe.
 */
export function getCompetingGroup<T extends CompetingRequestInput>(
  requests: readonly T[],
  request: T,
): T[] {
  const key = getCompetingGroupKey(request);
  return requests
    .filter((row) => isPending(row) && getCompetingGroupKey(row) === key)
    .sort(compareCompetingRequests);
}

/**
 * Rows arranged as same-file groups, one group after another: inside a group by
 * the shared comparator (priority, then whoever asked first), and the groups
 * themselves ordered by their leader. A file with a single request is a group of
 * one, so it slots into the same sequence rather than moving to the end.
 *
 * The ordering rules all come from `compareCompetingRequests`, so a grouped
 * queue reads in exactly the order the approve API enforces.
 */
export function sortByCompetingGroups<T extends CompetingRequestInput>(
  rows: readonly T[],
): T[] {
  const buckets = new Map<string, T[]>();
  rows.forEach((row) => {
    const key = getCompetingGroupKey(row);
    const bucket = buckets.get(key);
    if (bucket) bucket.push(row);
    else buckets.set(key, [row]);
  });

  const groups = [...buckets.values()]
    .map((bucket) => [...bucket].sort(compareCompetingRequests))
    .sort((left, right) => compareCompetingRequests(left[0], right[0]));

  const ordered: T[] = [];
  groups.forEach((group) => ordered.push(...group));
  return ordered;
}
