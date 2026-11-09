/**
 * The original competing-request scenarios, kept as fixtures but asserted
 * through `lib/competing-requests` — the ranking the admin queue, the staff
 * views and the approve API all share. The local re-implementation this file
 * used to carry has been removed; a test that ranks on its own can pass while
 * the app disagrees.
 */
import { describe, expect, it } from 'vitest';
import {
  getCompetingInfo,
  sortByCompetingRank,
  type CompetingRequestInput,
} from 'lib/competing-requests';

type RequestPriority = 'HIGH' | 'NORMAL' | 'LOW';

interface RequestItem extends CompetingRequestInput {
  id: number;
  file_no: string;
  file_name: string;
  requester_name: string;
  priority: RequestPriority;
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED';
  created_at: string;
  request_date: string;
}

/** The pending rows sharing a file, highest rank first. */
function competingGroup(requests: RequestItem[]): RequestItem[] {
  const info = getCompetingInfo(requests);
  return sortByCompetingRank(
    requests.filter((row) => info.get(row.id)?.isCompeting),
    info,
  );
}

describe('Staff File Requests — Priority & Competing Requests Logic', () => {
  it('correctly identifies when multiple staff request the same file', () => {
    const requests: RequestItem[] = [
      {
        id: 101,
        file_no: 'DE-12',
        file_name: 'Annual Exp-2022',
        requester_name: 'Kaweesha Kiwi',
        priority: 'NORMAL',
        status: 'PENDING',
        created_at: '2026-10-23T08:00:00Z',
        request_date: '2026-10-24',
      },
      {
        id: 102,
        file_no: 'DE-12',
        file_name: 'Annual Exp-2022',
        requester_name: 'Ashen Rashmika',
        priority: 'HIGH',
        status: 'PENDING',
        created_at: '2026-10-23T08:30:00Z',
        request_date: '2026-10-24',
      },
    ];

    const info = getCompetingInfo(requests);

    expect(info.get(101)?.groupSize).toBe(2);
    // Request 102 has HIGH priority, so it beats Request 101 (NORMAL) despite being submitted later
    expect(info.get(102)).toMatchObject({ rank: 0, isLeader: true, isTie: false });
    expect(info.get(101)?.rank).toBe(1);
    expect(competingGroup(requests).map((row) => row.id)).toEqual([102, 101]);
  });

  it('resolves ties using FIFO (First-In First-Out submission timestamp) when priorities are identical', () => {
    const requests: RequestItem[] = [
      {
        id: 201,
        file_no: 'FL-2026-0142',
        file_name: 'Municipal Planning Committee Minutes',
        requester_name: 'Staff Member 1',
        priority: 'HIGH',
        status: 'PENDING',
        created_at: '2026-10-23T09:00:00Z', // Submitted earlier
        request_date: '2026-10-25',
      },
      {
        id: 202,
        file_no: 'FL-2026-0142',
        file_name: 'Municipal Planning Committee Minutes',
        requester_name: 'Staff Member 2',
        priority: 'HIGH', // Same priority!
        status: 'PENDING',
        created_at: '2026-10-23T09:15:00Z', // Submitted 15 mins later
        request_date: '2026-10-25',
      },
    ];

    const info = getCompetingInfo(requests);

    // Staff Member 1 was earlier by 15 mins, so they take precedence as tie leader
    expect(info.get(201)).toMatchObject({ rank: 0, isLeader: true, isTie: true });
    expect(info.get(202)).toMatchObject({
      rank: 1,
      samePriorityAsLeader: true,
    });
    expect(competingGroup(requests).map((row) => row.id)).toEqual([201, 202]);
  });

  it('does not flag non-pending (already reviewed) requests as competing', () => {
    const requests: RequestItem[] = [
      {
        id: 301,
        file_no: 'DE-12',
        file_name: 'Annual Exp-2022',
        requester_name: 'Kaweesha Kiwi',
        priority: 'HIGH',
        status: 'APPROVED', // Already reviewed
        created_at: '2026-10-20T08:00:00Z',
        request_date: '2026-10-21',
      },
      {
        id: 302,
        file_no: 'DE-12',
        file_name: 'Annual Exp-2022',
        requester_name: 'Nethma Officer',
        priority: 'NORMAL',
        status: 'PENDING', // Only 1 pending
        created_at: '2026-10-23T10:00:00Z',
        request_date: '2026-10-24',
      },
    ];

    const info = getCompetingInfo(requests);

    expect(info.get(301)).toBeUndefined();
    expect(info.get(302)).toBeUndefined();
    expect(competingGroup(requests)).toEqual([]);
  });

  it('correctly ranks 3 competing requests across High, Normal, and Low priorities', () => {
    const requests: RequestItem[] = [
      {
        id: 401,
        file_no: 'AUD-99',
        file_name: 'Audit File 2026',
        requester_name: 'User Low',
        priority: 'LOW',
        status: 'PENDING',
        created_at: '2026-10-23T07:00:00Z',
        request_date: '2026-10-25',
      },
      {
        id: 402,
        file_no: 'AUD-99',
        file_name: 'Audit File 2026',
        requester_name: 'User Normal',
        priority: 'NORMAL',
        status: 'PENDING',
        created_at: '2026-10-23T08:00:00Z',
        request_date: '2026-10-25',
      },
      {
        id: 403,
        file_no: 'AUD-99',
        file_name: 'Audit File 2026',
        requester_name: 'User High',
        priority: 'HIGH',
        status: 'PENDING',
        created_at: '2026-10-23T09:00:00Z',
        request_date: '2026-10-25',
      },
    ];

    const info = getCompetingInfo(requests);

    expect(info.get(403)).toMatchObject({ rank: 0, isLeader: true, groupSize: 3 });
    expect(info.get(402)?.rank).toBe(1);
    expect(info.get(401)?.rank).toBe(2);
    expect(competingGroup(requests).map((row) => row.id)).toEqual([403, 402, 401]);
  });
});
