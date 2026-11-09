/**
 * Shared rules for showing the person behind a historical record.
 *
 * Names on files, requests, approvals and logs are snapshots captured when the
 * action happened, so a deleted account still shows the name it used. These
 * helpers attach the muted "(Deleted user)" marker where the record also knows
 * the actor's id, keep the reserved deletion address out of the interface, and
 * give every caller the same "Unknown user" fallback instead of a blank cell.
 */

/** Domain used by UserDeletionService when it retires an address (migration 0027). */
export const DELETED_EMAIL_DOMAIN = 'deleted.invalid';

const RESERVED_DELETED_EMAIL = new RegExp(`^deleted\\+[^@]+@${DELETED_EMAIL_DOMAIN}$`, 'i');

/** True for the anonymised `deleted+<id>@deleted.invalid` address, never a real one. */
export function isReservedDeletedEmail(email?: string | null): boolean {
  return RESERVED_DELETED_EMAIL.test((email ?? '').trim());
}

/** A stored display name with a safe fallback — a record must never render empty. */
export function attributedName(name?: string | null, fallback = ''): string {
  const value = typeof name === 'string' ? name.trim() : '';
  return value || fallback;
}

/**
 * Plain-text attribution for CSV/print exports and aria labels, where a React
 * element cannot be used. `label` is the translated `common:deletedUser` copy.
 */
export function attributedNameText(
  name?: string | null,
  options: { deleted?: boolean; label?: string; fallback?: string } = {}
): string {
  const base = attributedName(name, options.fallback ?? '');
  if (!base) return '';
  return options.deleted && options.label ? `${base} ${options.label}` : base;
}
