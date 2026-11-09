import type { SupabaseClient } from '@supabase/supabase-js';
import { ProfileRepository } from 'models/ProfileRepository';
import { isReservedDeletedEmail } from 'utils/userDisplay';

/**
 * Helpers for the attribution joins every list performs.
 *
 * Accounts are soft-deleted, so a profile row is still joinable after deletion
 * and historical records keep their author. These helpers turn that join into
 * the flags the interface renders, and keep the reserved deletion address
 * (`deleted+<id>@deleted.invalid`) out of every screen and export.
 */
export type AttributionProfile = {
  id: string;
  full_name?: string | null;
  email?: string | null;
  is_deleted?: boolean | null;
};

/** True when the account behind `userId` was soft-deleted; false when unknown. */
export function isDeletedAuthor(
  profiles: Map<string, AttributionProfile>,
  userId?: string | null
): boolean {
  if (!userId) return false;
  return profiles.get(userId)?.is_deleted === true;
}

/**
 * The address stored on the joined profile, or null once the account retired
 * it. Records keep their own snapshot columns, so history still shows what was
 * used at the time.
 */
export function visibleAuthorEmail(
  profiles: Map<string, AttributionProfile>,
  userId?: string | null
): string | null {
  if (!userId) return null;
  const email = profiles.get(userId)?.email ?? null;
  return isReservedDeletedEmail(email) ? null : email;
}

/** One attribution column (or group of them) that a soft-deleted flag describes. */
export type AuthorLink = {
  /** Row fields that hold the account id behind the displayed name. */
  idFields: string[];
  /** Boolean field added to the row, e.g. `requester_is_deleted`. */
  flagField: string;
};

/**
 * Adds `*_is_deleted` flags to a page of records in a single profile query, so
 * every list marks deleted authors without forgetting the filter. Rows are
 * mutated and returned. When migration 0027 is not applied yet the rows are
 * left untouched, and names simply render without a marker.
 */
export async function annotateDeletedAuthors<T extends Record<string, any>>(
  admin: SupabaseClient,
  rows: T[],
  links: AuthorLink[]
): Promise<T[]> {
  if (rows.length === 0 || links.length === 0) return rows;

  const ids = rows.flatMap((row) =>
    links.flatMap((link) =>
      link.idFields
        .map((field) => row[field])
        .filter((value): value is string => typeof value === 'string' && value.length > 0)
    )
  );
  if (ids.length === 0) return rows;

  const deleted = await new ProfileRepository(admin).findDeletedIds(ids);
  if (deleted.size === 0) return rows;

  for (const row of rows) {
    const target = row as Record<string, any>;
    for (const link of links) {
      target[link.flagField] = link.idFields.some(
        (field) => typeof target[field] === 'string' && deleted.has(target[field])
      );
    }
  }
  return rows;
}
