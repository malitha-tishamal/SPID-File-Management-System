import { describe, expect, it } from 'vitest';
import {
  STAFF_REQUEST_TABS,
  buildStaffRequestsQuery,
  getStaffRequestTabMeta,
  isStaffRequestTab,
  normalizeRequestDate,
  parsePriorityFilter,
  requestTabOf,
  sanitizeRequestSearch,
  validateRequestDateRange,
} from 'lib/staffRequests';

describe('staff request tab grouping', () => {
  it('puts every stored status in exactly one tab', () => {
    expect(requestTabOf('PENDING')).toBe('pending');
    expect(requestTabOf('APPROVED', null)).toBe('ongoing');
    expect(requestTabOf('APPROVED', '2026-10-24T05:00:00Z')).toBe('closed');
    expect(requestTabOf('REJECTED')).toBe('cancelled');
    expect(requestTabOf('CANCELLED')).toBe('cancelled');
  });

  it('never treats an approved request that is still out as closed', () => {
    expect(requestTabOf('APPROVED')).toBe('ongoing');
    expect(requestTabOf('APPROVED', undefined)).toBe('ongoing');
  });

  it('keeps rejected rows distinct from cancelled ones', () => {
    // Same tab, different stored status — the badge still shows the original.
    expect(requestTabOf('REJECTED')).toBe(requestTabOf('CANCELLED'));
    expect(requestTabOf('REJECTED')).not.toBe(requestTabOf('PENDING'));
  });

  it('exposes four tabs with Ongoing first', () => {
    expect(STAFF_REQUEST_TABS.map((tab) => tab.id)).toEqual([
      'ongoing',
      'pending',
      'closed',
      'cancelled',
    ]);
    expect(STAFF_REQUEST_TABS[0].label).toBe('Ongoing');
  });

  it('recognises valid tab names and rejects everything else', () => {
    expect(isStaffRequestTab('closed')).toBe(true);
    expect(isStaffRequestTab('pending')).toBe(true);
    expect(isStaffRequestTab('APPROVED')).toBe(false);
    expect(isStaffRequestTab(null)).toBe(false);
  });

  it('falls back to the first tab metadata for unknown tabs', () => {
    expect(getStaffRequestTabMeta('nope' as any).id).toBe('ongoing');
  });
});

describe('staff request search sanitising', () => {
  it('trims, collapses whitespace and keeps normal file-number characters', () => {
    expect(sanitizeRequestSearch('  FL-2026/0142  ')).toBe('FL-2026/0142');
    expect(sanitizeRequestSearch('Annual   report')).toBe('Annual report');
  });

  it('strips PostgREST filter punctuation and LIKE wildcards', () => {
    expect(sanitizeRequestSearch('a,b(c)*d%e_f')).toBe('a b c d e f');
  });

  it('caps very long input', () => {
    expect(sanitizeRequestSearch('x'.repeat(200)).length).toBe(80);
  });

  it('returns an empty string for nullish input', () => {
    expect(sanitizeRequestSearch(null)).toBe('');
    expect(sanitizeRequestSearch(undefined)).toBe('');
  });
});

describe('staff request date range', () => {
  it('accepts valid YYYY-MM-DD values only', () => {
    expect(normalizeRequestDate('2026-10-01')).toBe('2026-10-01');
    expect(normalizeRequestDate('2026-13-01')).toBe('');
    expect(normalizeRequestDate('01/10/2026')).toBe('');
    expect(normalizeRequestDate('')).toBe('');
  });

  it('rejects a start date after the end date', () => {
    expect(validateRequestDateRange('2026-10-30', '2026-10-01')).toBe(
      'The start date cannot be later than the end date.',
    );
  });

  it('accepts equal boundaries and open-ended ranges', () => {
    expect(validateRequestDateRange('2026-10-01', '2026-10-01')).toBe('');
    expect(validateRequestDateRange('2026-10-01', '')).toBe('');
    expect(validateRequestDateRange('', '')).toBe('');
  });
});

describe('staff request priority parsing', () => {
  it('parses known priorities case-insensitively', () => {
    expect(parsePriorityFilter('high')).toBe('HIGH');
    expect(parsePriorityFilter('NORMAL')).toBe('NORMAL');
    expect(parsePriorityFilter('low')).toBe('LOW');
  });

  it('defaults to ALL for unknown or missing values', () => {
    expect(parsePriorityFilter(null)).toBe('ALL');
    expect(parsePriorityFilter('urgent')).toBe('ALL');
  });
});

describe('staff request query builder', () => {
  it('always includes the tab, page and limit', () => {
    const query = new URLSearchParams(
      buildStaffRequestsQuery({ tab: 'ongoing', page: 1, limit: 10 }),
    );
    expect(query.get('tab')).toBe('ongoing');
    expect(query.get('page')).toBe('1');
    expect(query.get('limit')).toBe('10');
    expect(query.get('search')).toBeNull();
    expect(query.get('priority')).toBeNull();
  });

  it('omits the default priority and sanitises the search term', () => {
    const query = new URLSearchParams(
      buildStaffRequestsQuery({
        tab: 'pending',
        priority: 'ALL',
        search: '  FL-01, (x) ',
        page: 2,
        limit: 10,
      }),
    );
    expect(query.get('priority')).toBeNull();
    expect(query.get('search')).toBe('FL-01 x');
    expect(query.get('page')).toBe('2');
  });

  it('carries explicit filters through', () => {
    const query = new URLSearchParams(
      buildStaffRequestsQuery({
        tab: 'cancelled',
        priority: 'HIGH',
        dateFrom: '2026-10-01',
        dateTo: '2026-10-30',
        page: 1,
        limit: 10,
      }),
    );
    expect(query.get('priority')).toBe('HIGH');
    expect(query.get('date_from')).toBe('2026-10-01');
    expect(query.get('date_to')).toBe('2026-10-30');
  });
});
