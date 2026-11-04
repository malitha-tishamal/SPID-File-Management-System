import { describe, expect, it } from 'vitest';
import { withRecordTarget } from 'lib/notification-link';

describe('notification record destinations', () => {
  it('rebuilds the record link that an older generic row is missing', () => {
    expect(
      withRecordTarget('/admin/staff-file-request', 'file-request:12:submitted'),
    ).toBe('/admin/staff-file-request?tab=pending&request=12');

    expect(
      withRecordTarget('/admin/staff-file-request', 'extension:41:submitted'),
    ).toBe('/admin/staff-file-request?tab=extensions&extension=41');

    expect(
      withRecordTarget('/staff/your-requests', 'file-request:8:approved'),
    ).toBe('/staff/your-requests?request=8');

    expect(
      withRecordTarget('/staff/your-requests', 'file-request:8:returned'),
    ).toBe('/staff/your-requests?request=8');

    expect(
      withRecordTarget('/staff/your-requests', 'return-due:9:2026-11-02:due_today'),
    ).toBe('/staff/your-requests?request=9');

    expect(
      withRecordTarget('/admin/issued-files', 'admin-overdue:23:2026-10-01'),
    ).toBe('/admin/issued-files?file=23');
  });

  it('keeps a per-user dedupe suffix out of the rebuilt link', () => {
    expect(
      withRecordTarget(
        '/staff/your-requests',
        'file-request:8:rejected:11111111-2222-3333-4444-555555555555',
      ),
    ).toBe('/staff/your-requests?request=8');
  });

  it('leaves a link that already names its record untouched', () => {
    expect(
      withRecordTarget(
        '/staff/your-requests?request=8',
        'file-request:99:approved',
      ),
    ).toBe('/staff/your-requests?request=8');
  });

  it('leaves links untouched when the key cannot identify a record', () => {
    expect(withRecordTarget('/admin/users', 'staff-welcome:abc')).toBe(
      '/admin/users',
    );
    expect(withRecordTarget('/staff/your-requests', null)).toBe(
      '/staff/your-requests',
    );
    expect(withRecordTarget(null, null)).toBeNull();
  });

  it('does not guess a request id from an extension decision key', () => {
    // extension:<id> names the extension row, not the request the staff page opens.
    expect(
      withRecordTarget('/staff/your-requests', 'extension:41:approved'),
    ).toBe('/staff/your-requests');
  });
});
