/**
 * The competing-request ranking rules, asserted in one place because the admin
 * queue, the staff list, the staff submission notice and the approve API all
 * read them from `lib/competing-requests`.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  getCompetingBadgeCopy,
  getCompetingInfo,
  getCompetingInfoFor,
  getCompetingRowClasses,
  getCompetingRowState,
  sortByCompetingRank,
  type CompetingRequestInput,
} from 'lib/competing-requests';

type Row = Partial<CompetingRequestInput> & { id: number };

function request(overrides: Row): CompetingRequestInput {
  return {
    file_id: 7,
    file_no: 'SPID/AD/2026/REGISTER',
    priority: 'NORMAL',
    status: 'PENDING',
    created_at: '2026-11-01T09:00:00+05:30',
    request_date: '2026-11-02',
    ...overrides,
  } as CompetingRequestInput;
}

describe('getCompetingInfo grouping', () => {
  it('leaves a lone pending request unranked', () => {
    const alone = request({ id: 1 });
    const info = getCompetingInfo([alone]);

    expect(info.size).toBe(0);
    expect(getCompetingInfoFor([alone], alone)).toMatchObject({
      isCompeting: false,
      rank: 0,
      isLeader: false,
      groupSize: 1,
    });
  });

  it('groups by file id, not by requester', () => {
    const rows = [
      request({ id: 1, file_id: 7, priority: 'LOW' }),
      request({ id: 2, file_id: 8, priority: 'HIGH' }),
    ];
    const info = getCompetingInfo(rows);

    expect(info.get(1)).toBeUndefined();
    expect(info.get(2)).toBeUndefined();
  });

  it('falls back to the file number only for rows without a file id', () => {
    const rows = [
      request({ id: 1, file_id: null, file_no: 'spid/ad/2026/register' }),
      request({ id: 2, file_id: null, file_no: 'SPID/AD/2026/REGISTER' }),
    ];
    const info = getCompetingInfo(rows);

    expect(info.get(1)?.groupSize).toBe(2);
    expect(info.get(2)?.groupSize).toBe(2);
  });

  it('counts only pending requests, so a decided row stops competing', () => {
    const rows = [
      request({ id: 1, priority: 'HIGH' }),
      request({ id: 2, priority: 'NORMAL' }),
      request({ id: 3, priority: 'LOW' }),
    ];

    expect(getCompetingInfo(rows).get(3)?.rank).toBe(2);

    // The leader is rejected: the next request inherits the top of the queue.
    const afterRejection = [
      request({ id: 1, priority: 'HIGH', status: 'REJECTED' }),
      request({ id: 2, priority: 'NORMAL' }),
      request({ id: 3, priority: 'LOW' }),
    ];
    const info = getCompetingInfo(afterRejection);

    expect(info.get(1)).toBeUndefined();
    expect(info.get(2)).toMatchObject({ rank: 0, isLeader: true, groupSize: 2 });
    expect(info.get(3)).toMatchObject({ rank: 1, isLeader: false });
  });
});

describe('getCompetingInfo ranking', () => {
  it('puts High ahead of Normal whatever the submission order', () => {
    const rows = [
      request({ id: 1, priority: 'NORMAL', created_at: '2026-11-01T08:00:00+05:30' }),
      request({ id: 2, priority: 'HIGH', created_at: '2026-11-01T10:00:00+05:30' }),
    ];
    const info = getCompetingInfo(rows);

    expect(info.get(2)).toMatchObject({ rank: 0, isLeader: true, isTie: false });
    expect(info.get(1)).toMatchObject({ rank: 1, isLeader: false });
    expect(getCompetingBadgeCopy(info.get(1))?.label).toBe('⚠️ Lower Priority');
    expect(getCompetingBadgeCopy(info.get(2))?.label).toBe('⚡ Highest Priority');
  });

  it('breaks a same-priority tie by first submission', () => {
    const rows = [
      request({ id: 1, priority: 'HIGH', created_at: '2026-11-01T10:00:00+05:30' }),
      request({ id: 2, priority: 'HIGH', created_at: '2026-11-01T09:00:00+05:30' }),
    ];
    const info = getCompetingInfo(rows);

    expect(info.get(2)).toMatchObject({ rank: 0, isLeader: true, isTie: true });
    expect(info.get(1)).toMatchObject({ rank: 1, samePriorityAsLeader: true });
    expect(getCompetingBadgeCopy(info.get(2))?.label).toBe('★ Tie Leader (FIFO)');
    expect(getCompetingBadgeCopy(info.get(1))?.label).toBe('⚠️ Same Priority (Later)');
  });

  it('ranks three competing requests from sharpest to softest', () => {
    const rows = [
      request({ id: 1, priority: 'LOW', created_at: '2026-11-01T07:00:00+05:30' }),
      request({ id: 2, priority: 'NORMAL', created_at: '2026-11-01T08:00:00+05:30' }),
      request({ id: 3, priority: 'HIGH', created_at: '2026-11-01T09:00:00+05:30' }),
    ];
    const info = getCompetingInfo(rows);

    expect(info.get(3)?.rank).toBe(0);
    expect(info.get(2)?.rank).toBe(1);
    expect(info.get(1)?.rank).toBe(2);
    expect(info.get(1)?.groupSize).toBe(3);
    expect(sortByCompetingRank(rows, info).map((row) => row.id)).toEqual([3, 2, 1]);
  });

  it('ignores a row whose priority is not one of the three values', () => {
    const rows = [
      request({ id: 1, priority: 'URGENT!!' }),
      request({ id: 2, priority: 'LOW' }),
    ];
    const info = getCompetingInfo(rows);

    // An unreadable priority cannot outrank a real one.
    expect(info.get(2)?.rank).toBe(0);
    expect(info.get(1)?.rank).toBe(1);
  });
});

describe('getCompetingRowClasses', () => {
  const rows = [
    request({ id: 1, priority: 'LOW', created_at: '2026-11-01T07:00:00+05:30' }),
    request({ id: 2, priority: 'NORMAL', created_at: '2026-11-01T08:00:00+05:30' }),
    request({ id: 3, priority: 'HIGH', created_at: '2026-11-01T09:00:00+05:30' }),
    request({ id: 4, priority: 'HIGH', created_at: '2026-11-01T10:00:00+05:30' }),
  ];
  const info = getCompetingInfo(rows);

  it('gives rank 0 the red row and nothing to a lone request', () => {
    // Ranks here: 3 = HIGH first in, 4 = HIGH second, 2 = NORMAL, 1 = LOW.
    expect(info.get(3)?.rank).toBe(0);
    expect(info.get(4)?.rank).toBe(1);
    expect(info.get(2)?.rank).toBe(2);
    expect(info.get(1)?.rank).toBe(3);

    expect(getCompetingRowClasses(info.get(3))).toContain('border-l-4 border-red-500');
    expect(getCompetingRowClasses(info.get(3))).toContain('bg-red-50');
    expect(getCompetingRowClasses(info.get(3))).not.toContain('opacity');
    expect(getCompetingRowState(info.get(3))).toBe('leader');
    expect(getCompetingRowClasses(undefined)).toBe('');
    expect(getCompetingInfoFor(rows, request({ id: 99 }))).toBeDefined();
    expect(getCompetingRowClasses(getCompetingInfoFor(rows, request({ id: 99 })))).toBe('');
    expect(getCompetingRowState(undefined)).toBeUndefined();
  });

  it('gives rank 1 and every deeper rank progressively softer tints', () => {
    expect(getCompetingRowClasses(info.get(4))).toContain('border-l-4 border-orange-300');
    expect(getCompetingRowClasses(info.get(4))).toContain('bg-orange-50');
    expect(getCompetingRowClasses(info.get(4))).not.toContain('opacity');
    expect(getCompetingRowState(info.get(4))).toBe('next');

    // Rank 2 and deeper share the amber tint; nothing is faded.
    expect(getCompetingRowClasses(info.get(2))).toContain('border-l-4 border-amber-200');
    expect(getCompetingRowClasses(info.get(2))).toContain('bg-amber-50');
    expect(getCompetingRowClasses(info.get(2))).not.toContain('opacity');
    expect(getCompetingRowState(info.get(2))).toBe('queued');

    expect(getCompetingRowClasses(info.get(1))).toContain('bg-amber-50');
    expect(getCompetingRowClasses(info.get(1))).not.toContain('opacity');
    expect(getCompetingRowState(info.get(1))).toBe('queued');
  });

  it('describes the group size in the count badge', () => {
    expect(getCompetingBadgeCopy(info.get(2), 'count')?.label).toBe(
      'Competing: 4 requests for this file',
    );
  });
});

/**
 * The ranking is only a single source of truth while every view keeps reading
 * it, so the wiring is asserted here rather than left to review.
 */
describe('Every view reads the same ranking', () => {
  function source(...relative: string[]): string {
    return readFileSync(join(...relative), 'utf8').replace(/\\/g, '/');
  }

  const SHARED_IMPORT = "from 'lib/competing-requests'";
  const BADGE_IMPORT = "from 'components/requests/CompetingBadge'";

  it('the admin queue styles, badges and blocks with the shared rank', () => {
    const page = source('src', 'app', 'admin', 'staff-file-request', 'page.tsx');

    expect(page).toContain(SHARED_IMPORT);
    expect(page).toContain(BADGE_IMPORT);
    expect(page).toContain('getCompetingRowClasses');
    expect(page).toContain('getCompetingGroup');
    // A non-leader cannot start the approval from the queue either.
    expect(page).toContain('conflictTargetIsLeader');
    expect(page).toContain('not_highest_priority');
    // No local ranking survived the consolidation.
    expect(page).not.toContain('const priorityWeight');
    expect(page).not.toContain('competingRankById');
    expect(page).not.toContain('Approve This Only');
  });

  it('the staff list renders the same row classes and badges', () => {
    const table = source(
      'src',
      'components',
      'staff',
      'requests',
      'RequestsTable.tsx',
    );

    expect(table).toContain(SHARED_IMPORT);
    expect(table).toContain(BADGE_IMPORT);
    expect(table).toContain('getCompetingRowClasses(request.competing)');
    expect(table).toContain('<CompetingBadge info={request.competing}');
  });

  it('the staff submission notice uses the same badge wording', () => {
    const form = source('src', 'app', 'staff', 'request-file', 'page.tsx');

    expect(form).toContain(SHARED_IMPORT);
    expect(form).toContain(BADGE_IMPORT);
    expect(form).toContain('<CompetingBadge info={cr.competing}');
  });

  it('the approve API enforces the rank the screens show', () => {
    const controller = source('src', 'controllers', 'StaffFileRequestController.ts');

    expect(controller).toContain(SHARED_IMPORT);
    expect(controller).toContain('findPendingGroup');
    expect(controller).toContain("'not_highest_priority'");
    // Availability is checked before the queue position.
    expect(controller).toContain('fileIssuedConflict(holder)');
  });
});
