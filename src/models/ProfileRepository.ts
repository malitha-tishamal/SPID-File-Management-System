import type { SupabaseClient } from '@supabase/supabase-js';
import type { AccountStatus, AdminUserRow, ProfileDTO, UserRole } from 'types/auth';
import { getSupabaseAdminClient } from 'config/supabase/server';

const PROFILE_SELECT_BASE = `
  id, full_name, email, role, requested_role, section_id, nic, mobile_phone,
  account_status, approved_at, created_at, updated_at, sections(name)
`;

// last_login_at (0005) and avatar_url (0011) are optional in older deployments,
// so callers retry with the base projection when the full one is unavailable.
const PROFILE_SELECT_FULL = `${PROFILE_SELECT_BASE}, last_login_at, avatar_url`;

type RawProfile = {
  id: string;
  full_name: string;
  email: string;
  role: string;
  requested_role: string | null;
  section_id: number | null;
  nic: string | null;
  mobile_phone: string | null;
  account_status: string;
  approved_at: string | null;
  created_at: string;
  updated_at?: string | null;
  last_login_at?: string | null;
  avatar_url?: string | null;
  sections: { name: string } | { name: string }[] | null;
};

function mapProfile(raw: RawProfile): ProfileDTO {
  const sectionRaw = raw.sections as { name: string } | { name: string }[] | null;
  const sectionName = Array.isArray(sectionRaw) ? sectionRaw[0]?.name ?? null : sectionRaw?.name ?? null;
  return {
    id: raw.id,
    full_name: raw.full_name,
    email: raw.email,
    role: raw.role as UserRole,
    requested_role: (raw.requested_role as UserRole | null) ?? null,
    section_id: raw.section_id,
    section_name: sectionName,
    nic: raw.nic,
    mobile_phone: raw.mobile_phone,
    account_status: raw.account_status as AccountStatus,
    approved_at: raw.approved_at,
    created_at: raw.created_at,
    updated_at: raw.updated_at ?? null,
    avatar_url: raw.avatar_url ?? null,
    last_login_at: raw.last_login_at ?? null,
  };
}

let cachedProjectionIndex = 0;
let cachedAuthUsers: Array<{ id: string; last_sign_in_at?: string | null; user_metadata?: any }> | null = null;
let cachedAuthUsersTimestamp = 0;
const AUTH_USERS_CACHE_TTL_MS = 60_000;

export async function getCachedAuthUsers(): Promise<Array<{ id: string; last_sign_in_at?: string | null; user_metadata?: any }>> {
  const now = Date.now();
  if (cachedAuthUsers && now - cachedAuthUsersTimestamp < AUTH_USERS_CACHE_TTL_MS) {
    return cachedAuthUsers;
  }
  try {
    const res = await getSupabaseAdminClient().auth.admin.listUsers({ perPage: 1000 });
    const list = res.data?.users ?? [];
    if (list.length > 0) {
      cachedAuthUsers = list;
      cachedAuthUsersTimestamp = now;
    }
    return list;
  } catch (err) {
    console.warn('Could not query auth.admin.listUsers for last login:', err);
    return cachedAuthUsers ?? [];
  }
}


const PROFILE_PROJECTIONS = [
  { select: PROFILE_SELECT_FULL, hasAvatarColumn: true },
  { select: `${PROFILE_SELECT_BASE}, avatar_url`, hasAvatarColumn: true },
  { select: `${PROFILE_SELECT_BASE}, last_login_at`, hasAvatarColumn: false },
  { select: PROFILE_SELECT_BASE, hasAvatarColumn: false },
] as const;

type RawProfileResult = {
  raw: RawProfile;
  hasAvatarColumn: boolean;
};

/**
 * Model layer: all profile table access. Clients are injected so the same
 * repository serves both the user-context (anon+JWT) and service-role paths.
 */
export class ProfileRepository {
  constructor(private client: SupabaseClient) {}

  private async selectRawProfile(
    column: 'id' | 'email',
    value: string
  ): Promise<RawProfileResult | null> {
    for (const projection of PROFILE_PROJECTIONS) {
      const query = this.client.from('profiles').select(projection.select);
      const { data, error } =
        column === 'id'
          ? await query.eq('id', value).single()
          : await query.ilike('email', value.trim()).maybeSingle();
      if (!error) {
        return data
          ? { raw: data as unknown as RawProfile, hasAvatarColumn: projection.hasAvatarColumn }
          : null;
      }
    }
    return null;
  }

  private async getAuthUserInfo(
    id: string
  ): Promise<{ metadata: Record<string, any>; lastSignInAt: string | null } | null> {
    try {
      const { data, error } = await getSupabaseAdminClient().auth.admin.getUserById(id);
      if (error || !data?.user) return null;
      return {
        metadata: (data.user.user_metadata as Record<string, any>) ?? {},
        lastSignInAt: data.user.last_sign_in_at ?? null,
      };
    } catch {
      return null;
    }
  }

  private async hydrateProfile(
    profile: ProfileDTO,
    hasAvatarColumn: boolean
  ): Promise<ProfileDTO> {
    if (profile.last_login_at && (profile.avatar_url || hasAvatarColumn)) {
      return profile;
    }

    const authInfo = await this.getAuthUserInfo(profile.id);
    if (!authInfo) return profile;

    if (!profile.last_login_at) {
      profile.last_login_at =
        authInfo.lastSignInAt || authInfo.metadata.last_login_at || null;
    }

    // profiles.avatar_url is authoritative once the column exists. Auth metadata
    // is only a fallback for deployments that have not applied migration 0011.
    if (!hasAvatarColumn && !profile.avatar_url) {
      const metaAvatar = authInfo.metadata.avatar_url;
      if (typeof metaAvatar === 'string' && metaAvatar) {
        profile.avatar_url = metaAvatar;
      }
    }

    return profile;
  }

  async findById(id: string): Promise<ProfileDTO | null> {
    const result = await this.selectRawProfile('id', id);
    if (!result) return null;
    return this.hydrateProfile(mapProfile(result.raw), result.hasAvatarColumn);
  }

  async findByEmail(email: string): Promise<ProfileDTO | null> {
    const result = await this.selectRawProfile('email', email);
    if (!result) return null;
    return this.hydrateProfile(mapProfile(result.raw), result.hasAvatarColumn);
  }

  /** Admin registry listing including lockout state and authoritative last login time (service-role only). */
  async listAllWithLockout(): Promise<AdminUserRow[]> {
    let data: any[] | null = null;
    let hasAvatarColumn = false;

    const projection = PROFILE_PROJECTIONS[cachedProjectionIndex];

    // Fire profiles, login_security, and auth.admin queries concurrently in parallel
    const [profilesRes, secResult, authResult] = await Promise.all([
      this.client
        .from('profiles')
        .select(projection.select)
        .order('created_at', { ascending: false }),
      (async () => {
        try {
          const res = await this.client
            .from('login_security')
            .select('user_id, failed_attempts, locked_until');
          return res.data ?? [];
        } catch (err) {
          console.warn('Could not query login_security:', err);
          return [];
        }
      })(),
      getCachedAuthUsers(),
    ]);

    if (!profilesRes.error) {
      data = (profilesRes.data as any[]) ?? [];
      hasAvatarColumn = projection.hasAvatarColumn;
    } else {
      // Fallback projections if schema differs from cached projection
      for (let i = 0; i < PROFILE_PROJECTIONS.length; i++) {
        if (i === cachedProjectionIndex) continue;
        const fallback = PROFILE_PROJECTIONS[i];
        const res = await this.client
          .from('profiles')
          .select(fallback.select)
          .order('created_at', { ascending: false });
        if (!res.error) {
          data = (res.data as any[]) ?? [];
          hasAvatarColumn = fallback.hasAvatarColumn;
          cachedProjectionIndex = i;
          break;
        }
      }
    }

    if (!data) {
      console.error('Failed to fetch profiles in listAllWithLockout.');
      return [];
    }

    const secMap = new Map<string, { failed_attempts: number; locked_until: string | null }>();
    const authUserMap = new Map<string, { lastLogin: string | null; avatarUrl: string | null }>();

    if (Array.isArray(secResult)) {
      for (const s of secResult) {
        secMap.set(s.user_id, {
          failed_attempts: s.failed_attempts ?? 0,
          locked_until: s.locked_until ?? null,
        });
      }
    }

    if (Array.isArray(authResult)) {
      for (const u of authResult) {
        const authTime = u.last_sign_in_at || (u.user_metadata as any)?.last_login_at || null;
        const avatar = (u.user_metadata as any)?.avatar_url || null;
        authUserMap.set(u.id, { lastLogin: authTime, avatarUrl: avatar });
      }
    }

    return (data as any[]).map((row) => {
      const base = mapProfile(row);
      const sec = secMap.get(base.id);
      const authInfo = authUserMap.get(base.id);
      return {
        ...base,
        last_login_at: authInfo?.lastLogin || base.last_login_at || null,
        avatar_url: hasAvatarColumn
          ? base.avatar_url || null
          : base.avatar_url || authInfo?.avatarUrl || null,
        failed_attempts: sec?.failed_attempts ?? 0,
        locked_until: sec?.locked_until ?? null,
      };
    });
  }

  /** Service-role privileged status update (approval workflow). */
  async updateStatus(id: string, status: AccountStatus, actorId: string | null): Promise<void> {
    const patch: Record<string, unknown> = { account_status: status };
    if (status === 'approved') {
      patch.approved_by = actorId;
      patch.approved_at = new Date().toISOString();
    }
    const { error } = await this.client.from('profiles').update(patch).eq('id', id);
    if (error) {
      throw new Error(`Failed to update account status: ${error.message}`);
    }
  }

  /** Service-role privileged role change. */
  async updateRole(id: string, role: UserRole): Promise<void> {
    const { error } = await this.client.from('profiles').update({ role }).eq('id', id);
    if (error) {
      throw new Error(`Failed to update role: ${error.message}`);
    }
  }

  /** Self-service profile edit — protected by RLS + privileged-column trigger. */
  async updateOwn(
    id: string,
    patch: { full_name?: string; nic?: string; mobile_phone?: string; section_id?: number | null }
  ): Promise<ProfileDTO | null> {
    const { error } = await this.client.from('profiles').update(patch).eq('id', id);
    if (error) {
      throw new Error(`Failed to update profile: ${error.message}`);
    }
    return this.findById(id);
  }

  /**
   * Persists the avatar in profiles.avatar_url (authoritative) and keeps auth
   * metadata in sync for older deployments. Metadata is merged, never replaced.
   */
  async updateAvatar(id: string, avatarUrl: string | null): Promise<ProfileDTO | null> {
    const admin = getSupabaseAdminClient();
    const nowIso = new Date().toISOString();

    const { error: dbError } = await admin
      .from('profiles')
      .update({ avatar_url: avatarUrl, updated_at: nowIso })
      .eq('id', id);

    let metadataSaved = false;
    const authInfo = await this.getAuthUserInfo(id);
    if (authInfo) {
      try {
        await admin.auth.admin.updateUserById(id, {
          user_metadata: { ...authInfo.metadata, avatar_url: avatarUrl },
        });
        metadataSaved = true;
      } catch (e) {
        console.warn('Could not update user_metadata.avatar_url:', e);
      }
    }

    if (dbError && !metadataSaved) {
      throw new Error(`Failed to update profile picture: ${dbError.message}`);
    }
    if (dbError) {
      console.warn('profiles.avatar_url is unavailable; using auth metadata storage.', dbError.message);
    }

    const updated = await this.findById(id);
    if (updated) {
      updated.avatar_url = avatarUrl;
      updated.updated_at = nowIso;
    }
    return updated;
  }

  /** Service-role admin edit: name + section + mobile_phone only (role/status go through dedicated actions). */
  async updateDetails(
    id: string,
    patch: { full_name?: string; section_id?: number | null; mobile_phone?: string | null }
  ): Promise<void> {
    const { error } = await this.client.from('profiles').update(patch).eq('id', id);
    if (error) {
      throw new Error(`Failed to update profile: ${error.message}`);
    }
  }

  /** Stamp the last successful sign-in time (service-role only). */
  async touchLastLogin(id: string): Promise<void> {
    const now = new Date().toISOString();
    const admin = getSupabaseAdminClient();

    // Merge metadata so avatar_url and any other keys survive the login stamp.
    const authInfo = await this.getAuthUserInfo(id);
    if (authInfo) {
      try {
        await admin.auth.admin.updateUserById(id, {
          user_metadata: { ...authInfo.metadata, last_login_at: now },
        });
      } catch (err) {
        console.warn('Could not update user_metadata.last_login_at:', err);
      }
    }

    try {
      await admin.from('profiles').update({ last_login_at: now }).eq('id', id);
    } catch {}
  }
}
