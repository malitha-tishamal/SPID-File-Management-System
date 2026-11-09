/**
 * The two decisions the admin filter bar makes, tested where they live.
 *
 * Search matching and the same-file grouping order are plain functions in `lib`,
 * not page code, so a wrong rule fails here instead of in the browser. The last
 * block is the one that matters most: ranking is always read off the FULL pending
 * list, so hiding the leader on screen must never promote the row behind it.
 */
import { describe, expect, it } from 'vitest';
import {
  compareCompetingRequests,
  getCompetingGroupKey,
  getCompetingInfo,
  getCompetingInfoFor,
  getCompetingRowClasses,
  sortByCompetingGroups,
  type CompetingRequestInput,
} from 'lib/competing-requests';
import { matchesRequestSearch, sanitizeRequestSearch } from 'lib/staffRequests';

type Row = CompetingRequestInput & {
  file_name?: string;
  requester_name?: string;
  requester_email?: string;
};

function request(overrides: Partial<Row> & { id: number }): Row {
  return {
    file_id: 5,
    file_no: 'DE-12',
    file_name: 'Annual Exp-2022',
    priority: 'NORMAL',
    status: 'PENDING',
    created_at: '2026-11-05T08:00:00+05:30',
    request_date: '2026-11-06',
    requester_name: 'Saumya Silva',
    requester_email: 'saumya@spid.gov.lk',
    ...overrides,
  };
}

function ids(rows: readonly Row[]): number[] {
  return rows.map((row) => Number(row.id));
}

describe('Search matching', () => {
  const row = request({ id: 81 });

  it('matches every field an admin reads, in any case', () => {
    expect(matchesRequestSearch(row, '')).toBe(true);
    expect(matchesRequestSearch(row, 'saumya')).toBe(true);
    expect(matchesRequestSearch(row, 'SAUMYA SILVA')).toBe(true);
    expect(matchesRequestSearch(row, 'de-12')).toBe(true);
    expect(matchesRequestSearch(row, 'annual exp')).toBe(true);
    expect(matchesRequestSearch(row, 'saumya@spid')).toBe(true);
    expect(matchesRequestSearch(row, 'gov.lk')).toBe(true);
  });

  it('finds a request by id with or without the #', () => {
    expect(matchesRequestSearch(row, '#81')).toBe(true);
    expect(matchesRequestSearch(row, '81')).toBe(true);
    expect(matchesRequestSearch(row, '#8')).toBe(true);
    expect(matchesRequestSearch(row, '#82')).toBe(false);
    expect(matchesRequestSearch(row, 'nothing')).toBe(false);
  });

  it('matches a request id inside a longer number', () => {
    expect(matchesRequestSearch(request({ id: 128 }), '28')).toBe(true);
    expect(matchesRequestSearch(request({ id: 128 }), '#1')).toBe(true);
  });

  it('survives a row whose optional fields are missing', () => {
    const sparse = { id: 7 } as Row;
    expect(matchesRequestSearch(sparse, 'saumya')).toBe(false);
    expect(matchesRequestSearch(sparse, '7')).toBe(true);
  });

  it('keeps # and dashes because the box sanitiser leaves them alone', () => {
    expect(sanitizeRequestSearch('#SPID/AD-2026 ')).toBe('#SPID/AD-2026');
  });
});

describe('Same-file grouping order', () => {
  /**
   * The acceptance fixture: file 1 has a HIGH request (#81) asked after a NORMAL
   * one (#79), file 3 is a same-priority pair decided on submission time, and
   * file 2 is a single LOW request.
   */
  const rows: Row[] = [
    request({ id: 79, file_id: 1, file_no: 'DE-01', priority: 'NORMAL', created_at: '2026-11-01T08:00:00+05:30' }),
    request({ id: 83, file_id: 2, file_no: 'DE-02', priority: 'LOW', created_at: '2026-11-01T07:00:00+05:30' }),
    request({ id: 81, file_id: 1, file_no: 'DE-01', priority: 'HIGH', created_at: '2026-11-01T09:00:00+05:30' }),
    request({ id: 86, file_id: 3, file_no: 'DE-03', priority: 'NORMAL', created_at: '2026-11-01T08:30:00+05:30' }),
    request({ id: 85, file_id: 3, file_no: 'DE-03', priority: 'NORMAL', created_at: '2026-11-01T07:30:00+05:30' }),
  ];

  it('puts every file together, leader first, groups ordered by their leader', () => {
    // HIGH leader 81 with 79 behind it, then the NORMAL group decided FIFO, then LOW.
    expect(ids(sortByCompetingGroups(rows))).toEqual([81, 79, 85, 86, 83]);
  });

  it('leaves a single-request file in the same sequence rather than at the end', () => {
    const ordered = sortByCompetingGroups(rows);
    expect(ordered[ordered.length - 1].id).toBe(83);
    expect(ids(ordered)).toContain(83);
  });

  it('groups on the file id, and only falls back to the number without one', () => {
    expect(getCompetingGroupKey(request({ id: 1, file_id: 9, file_no: 'DE-09' }))).toBe('file:9');
    expect(getCompetingGroupKey(request({ id: 2, file_id: null, file_no: ' de-09 ' }))).toBe('no:DE-09');
    // Two folders sharing a number are still separate groups.
    expect(getCompetingGroupKey(request({ id: 3, file_id: 4, file_no: 'DE-09' }))).toBe('file:4');

    const fallback = sortByCompetingGroups([
      request({ id: 91, file_id: null, file_no: 'DE-09', priority: 'NORMAL', created_at: '2026-11-02T08:00:00+05:30' }),
      request({ id: 92, file_id: null, file_no: 'de-09', priority: 'HIGH', created_at: '2026-11-02T09:00:00+05:30' }),
      request({ id: 93, file_id: null, file_no: 'DE-10', priority: 'LOW' }),
    ]);
    expect(ids(fallback)).toEqual([92, 91, 93]);
  });

  it('orders the groups exactly the way the comparator ranks their leaders', () => {
    const ordered = sortByCompetingGroups(rows);
    const seen = new Set<string>();
    const leaders: Row[] = [];
    ordered.forEach((row) => {
      const key = getCompetingGroupKey(row);
      if (seen.has(key)) return;
      seen.add(key);
      leaders.push(row);
    });

    const expected = [...leaders].sort(compareCompetingRequests).map((row) => row.id);
    expect(ids(leaders)).toEqual(expected);
  });

  it('leaves the caller array alone', () => {
    const original = [...rows];
    sortByCompetingGroups(rows);
    expect(ids(rows)).toEqual(ids(original));
  });
});

describe('Filtering never changes who leads', () => {
  const high = request({ id: 90, file_id: 7, file_no: 'DE-07', priority: 'HIGH', created_at: '2026-11-01T08:00:00+05:30' });
  const low = request({ id: 91, file_id: 7, file_no: 'DE-07', priority: 'LOW', created_at: '2026-11-01T09:00:00+05:30' });
  const full = [high, low];

  it('keeps the row behind a hidden leader faded and non-leading', () => {
    const ranking = getCompetingInfo(full);
    const visible = sortByCompetingGroups(full.filter((row) => row.priority === 'LOW'));

    expect(ids(visible)).toEqual([91]);
    expect(ranking.get(91)?.isLeader).toBe(false);
    expect(ranking.get(91)?.rank).toBe(1);
    expect(getCompetingRowClasses(ranking.get(91))).toContain('border-l-4 border-orange-300');
    expect(getCompetingRowClasses(ranking.get(91))).not.toContain('rose');
  });

  it('would have promoted it if the ranking were rebuilt from the filtered rows', () => {
    // Documents why the page reads `requests` rather than the visible subset:
    // alone in the group, the follower stops competing and loses its shading.
    const rebuilt = getCompetingInfoFor([low], low);
    expect(rebuilt.isCompeting).toBe(false);
    expect(getCompetingRowClasses(rebuilt)).toBe('');
  });
});
