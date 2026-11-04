/**
 * Record targets for stored notifications.
 *
 * Producers write links that already name the record (`?request=12`). Rows
 * stored before that convention only carry the page, but every one of them has
 * a dedupe key that names the record, so the destination can be rebuilt from
 * data the row already holds instead of dropping the user on a generic page.
 */

const RECORD_PARAM = /[?&](?:request|extension|file)=/;

/** Key kinds whose leading id is the record the recipient should open. */
const targets: { pattern: RegExp; build: (id: string) => string }[] = [
  {
    pattern: /^file-request:(\d+):submitted/,
    build: (id) => `/admin/staff-file-request?tab=pending&request=${id}`,
  },
  {
    pattern: /^extension:(\d+):submitted/,
    build: (id) => `/admin/staff-file-request?tab=extensions&extension=${id}`,
  },
  {
    pattern: /^file-request:(\d+):(?:approved|rejected|returned|extended)/,
    build: (id) => `/staff/your-requests?request=${id}`,
  },
  {
    pattern: /^return-due:(\d+):/,
    build: (id) => `/staff/your-requests?request=${id}`,
  },
  {
    pattern: /^admin-overdue:(\d+):/,
    build: (id) => `/admin/issued-files?file=${id}`,
  },
];

export function withRecordTarget(
  link: string | null,
  dedupeKey: string | null,
): string | null {
  if (link && RECORD_PARAM.test(link)) return link;
  if (!dedupeKey) return link;
  for (const target of targets) {
    const match = dedupeKey.match(target.pattern);
    if (match) return target.build(match[1]);
  }
  return link;
}
