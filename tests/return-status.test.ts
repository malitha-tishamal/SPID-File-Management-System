import { describe, expect, it } from 'vitest';
import {
  addDaysToDate,
  getReturnStatus,
  isReturnDateExtended,
} from '../src/lib/returnStatus';
import { formatSriLankaDate } from '../src/lib/datetime';

const Colombo = '2026-10-26T09:00:00+05:30';

describe('getReturnStatus', () => {
  it('counts whole days remaining before the due date', () => {
    const result = getReturnStatus('2026-11-02', null, new Date(Colombo));
    expect(result.status).toBe('active');
    expect(result.daysRemaining).toBe(7);
    expect(result.label).toBe('7 days remaining');
    expect(result.isOverdue).toBe(false);
  });

  it('uses singular wording for one day remaining', () => {
    expect(getReturnStatus('2026-10-27', null, new Date(Colombo)).label).toBe(
      '1 day remaining',
    );
  });

  it('reports due today without a negative count', () => {
    const result = getReturnStatus('2026-10-26', null, new Date(Colombo));
    expect(result.status).toBe('due_today');
    expect(result.daysRemaining).toBe(0);
    expect(result.label).toBe('Due today');
  });

  it('flags the final day as due soon', () => {
    expect(
      getReturnStatus('2026-10-28', null, new Date(Colombo)).status,
    ).toBe('due_soon');
  });

  it('reports overdue days as a positive magnitude', () => {
    const result = getReturnStatus('2026-10-23', null, new Date(Colombo));
    expect(result.status).toBe('overdue');
    expect(result.isOverdue).toBe(true);
    expect(result.label).toBe('Overdue by 3 days');
    expect(result.label).not.toMatch(/-3/);
  });

  it('never shows a returned file as overdue', () => {
    const result = getReturnStatus(
      '2026-10-20',
      '2026-10-25T04:00:00Z',
      new Date(Colombo),
    );
    expect(result.status).toBe('returned');
    expect(result.isOverdue).toBe(false);
    expect(result.label).toBe('Returned');
    expect(result.daysRemaining).toBeNull();
  });

  it('tolerates a missing due date', () => {
    expect(getReturnStatus(null, null, new Date(Colombo)).status).toBe('active');
  });
});

describe('extension detection', () => {
  it('detects a moved official return date', () => {
    expect(isReturnDateExtended('2026-10-30', '2026-11-06')).toBe(true);
    expect(isReturnDateExtended('2026-10-30', '2026-10-30')).toBe(false);
    expect(isReturnDateExtended(null, '2026-10-30')).toBe(false);
  });

  it('adds days on a YYYY-MM-DD basis', () => {
    expect(addDaysToDate('2026-10-26', 7)).toBe('2026-11-02');
    expect(addDaysToDate('2026-02-27', 3)).toBe('2026-03-02');
  });

  it('formats a date-only value in Sri Lanka time', () => {
    expect(formatSriLankaDate('2026-04-13T00:00:00Z')).toBe('13 Apr 2026');
  });
});
