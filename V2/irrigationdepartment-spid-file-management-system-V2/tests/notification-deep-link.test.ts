// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { clearQueryParam, parseRecordId, readQueryParam } from 'lib/deep-link';

describe('notification deep links', () => {
  beforeEach(() => {
    window.history.replaceState({}, '', '/staff/your-requests?request=12');
  });

  afterEach(() => {
    window.history.replaceState({}, '', '/');
  });

  it('reads the record id parameter the notification producer wrote', () => {
    expect(readQueryParam('request')).toBe('12');
    expect(parseRecordId(readQueryParam('request'))).toBe(12);
  });

  it('rejects ids that could belong to another record', () => {
    expect(parseRecordId(null)).toBeNull();
    expect(parseRecordId('')).toBeNull();
    expect(parseRecordId('abc')).toBeNull();
    expect(parseRecordId('12abc')).toBeNull();
    expect(parseRecordId('-7')).toBeNull();
    expect(parseRecordId('0')).toBeNull();
    expect(parseRecordId('1.5')).toBeNull();
  });

  it('supports the compound admin link (tab + record) together', () => {
    window.history.replaceState(
      {},
      '',
      '/admin/staff-file-request?tab=extensions&extension=41',
    );
    expect(readQueryParam('tab')).toBe('extensions');
    expect(parseRecordId(readQueryParam('extension'))).toBe(41);
  });

  it('drops a consumed parameter without losing the rest of the address', () => {
    window.history.replaceState({}, '', '/admin/issued-files?file=7&view=ledger');
    clearQueryParam('file');
    expect(window.location.pathname).toBe('/admin/issued-files');
    expect(readQueryParam('view')).toBe('ledger');
    expect(readQueryParam('file')).toBeNull();
  });

  it('ignores a parameter that is not present', () => {
    window.history.replaceState({}, '', '/staff/your-requests');
    expect(() => clearQueryParam('request')).not.toThrow();
    expect(window.location.pathname).toBe('/staff/your-requests');
  });
});
