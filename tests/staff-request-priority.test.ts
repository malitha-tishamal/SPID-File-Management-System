import { describe, expect, it } from 'vitest';
import {
  classifyPendingPriority,
  compareStaffRequestPriority,
  isPriorityUpgrade,
} from 'lib/staffRequestPriority';

/**
 * The staff form uses these helpers to decide which dialog to open. The
 * database repeats the same comparison inside the submission transaction.
 */
describe('staff request priority rules', () => {
  it('ranks High above Normal above Low', () => {
    expect(compareStaffRequestPriority('HIGH', 'NORMAL')).toBeGreaterThan(0);
    expect(compareStaffRequestPriority('NORMAL', 'LOW')).toBeGreaterThan(0);
    expect(compareStaffRequestPriority('HIGH', 'LOW')).toBeGreaterThan(0);
    expect(compareStaffRequestPriority('LOW', 'HIGH')).toBeLessThan(0);
    expect(compareStaffRequestPriority('NORMAL', 'NORMAL')).toBe(0);
  });

  it.each([
    ['HIGH', 'HIGH'],
    ['NORMAL', 'NORMAL'],
    ['LOW', 'LOW'],
  ] as const)('blocks %s → %s as an identical pending request', (existing, requested) => {
    expect(classifyPendingPriority(existing, requested)).toBe('duplicate');
  });

  it.each([
    ['LOW', 'NORMAL'],
    ['LOW', 'HIGH'],
    ['NORMAL', 'HIGH'],
  ] as const)('allows %s → %s as a priority upgrade', (existing, requested) => {
    expect(classifyPendingPriority(existing, requested)).toBe('upgrade');
    expect(isPriorityUpgrade(existing, requested)).toBe(true);
  });

  it.each([
    ['HIGH', 'NORMAL'],
    ['HIGH', 'LOW'],
    ['NORMAL', 'LOW'],
  ] as const)('blocks %s → %s as a lower priority', (existing, requested) => {
    expect(classifyPendingPriority(existing, requested)).toBe('blocked');
    expect(isPriorityUpgrade(existing, requested)).toBe(false);
  });
});
