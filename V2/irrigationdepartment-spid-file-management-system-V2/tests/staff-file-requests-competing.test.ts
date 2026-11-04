import { describe, expect, it } from 'vitest';

type RequestPriority = 'HIGH' | 'NORMAL' | 'LOW';

interface RequestItem {
  id: number;
  file_no: string;
  file_name: string;
  requester_name: string;
  priority: RequestPriority;
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED';
  created_at: string;
  request_date: string;
}

const priorityWeight: Record<RequestPriority, number> = {
  HIGH: 3,
  NORMAL: 2,
  LOW: 1,
};

function resolveCompetingRequests(requests: RequestItem[]) {
  const map = new Map<
    string,
    {
      count: number;
      leaderId: number;
      isTie: boolean;
      sortedRequests: RequestItem[];
    }
  >();

  const pending = requests.filter((r) => r.status === 'PENDING');

  pending.forEach((req) => {
    const existing = map.get(req.file_no);
    if (!existing) {
      map.set(req.file_no, {
        count: 1,
        leaderId: req.id,
        isTie: false,
        sortedRequests: [req],
      });
    } else {
      existing.count += 1;
      existing.sortedRequests.push(req);
    }
  });

  map.forEach((group) => {
    if (group.count > 1) {
      group.sortedRequests.sort((a, b) => {
        // 1. Priority weight (HIGH > NORMAL > LOW)
        const pDiff = priorityWeight[b.priority] - priorityWeight[a.priority];
        if (pDiff !== 0) return pDiff;

        // 2. FIFO Tie-breaker: Earliest submission wins!
        const timeA = new Date(a.created_at).getTime();
        const timeB = new Date(b.created_at).getTime();
        if (timeA !== timeB) return timeA - timeB;

        // 3. Earliest access date
        return a.request_date.localeCompare(b.request_date);
      });

      group.leaderId = group.sortedRequests[0].id;
      group.isTie =
        group.sortedRequests.length >= 2 &&
        group.sortedRequests[0].priority === group.sortedRequests[1].priority;
    }
  });

  return map;
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

    const map = resolveCompetingRequests(requests);
    const de12 = map.get('DE-12');

    expect(de12).toBeDefined();
    expect(de12?.count).toBe(2);
    // Request 102 has HIGH priority, so it beats Request 101 (NORMAL) despite being submitted later
    expect(de12?.leaderId).toBe(102);
    expect(de12?.isTie).toBe(false);
    expect(de12?.sortedRequests[0].id).toBe(102);
    expect(de12?.sortedRequests[1].id).toBe(101);
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

    const map = resolveCompetingRequests(requests);
    const flGroup = map.get('FL-2026-0142');

    expect(flGroup).toBeDefined();
    expect(flGroup?.count).toBe(2);
    expect(flGroup?.isTie).toBe(true);
    // Staff Member 1 was earlier by 15 mins, so they take precedence as tie leader
    expect(flGroup?.leaderId).toBe(201);
    expect(flGroup?.sortedRequests[0].id).toBe(201);
    expect(flGroup?.sortedRequests[1].id).toBe(202);
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

    const map = resolveCompetingRequests(requests);
    const group = map.get('DE-12');

    expect(group?.count).toBe(1);
    expect(group?.leaderId).toBe(302);
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

    const map = resolveCompetingRequests(requests);
    const group = map.get('AUD-99');

    expect(group?.count).toBe(3);
    expect(group?.leaderId).toBe(403); // HIGH wins
    expect(group?.sortedRequests.map((r) => r.id)).toEqual([403, 402, 401]);
  });
});
