import type { SupabaseClient } from '@supabase/supabase-js';
import type { AccountStatus, AdminUserRow, ProfileDTO, UserRole } from 'types/auth';

const PROFILE_SELECT = `
  id, full_name, email, role, requested_role, section_id, nic, mobile_phone,
  account_status, approved_at, created_at, updated_at, sections(name)
`;

// Present only after migration 0005; fall back to PROFILE_SELECT until then.
const PROFILE_SELECT_FULL = `${PROFILE_SELECT}, last_login_at`;

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
    last_login_at: raw.last_login_at ?? null,
  };
}

/**
 * Model layer: all profile table access. Clients are injected so the same
 * repository serves both the user-context (anon+JWT) and service-role paths.
 */
export class ProfileRepository {
  constructor(private client: SupabaseClient) {}

  async findById(id: string): Promise<ProfileDTO | null> {
    const { data, error } = await this.client
      .from('profiles')
      .select(PROFILE_SELECT)
      .eq('id', id)
      .single();
    if (error || !data) return null;
    const profile = mapProfile(data as RawProfile);
    if (!profile.last_login_at && this.client.auth?.admin) {
      try {
        const { data: authUser } = await this.client.auth.admin.getUserById(id);
        if (authUser?.user) {
          profile.last_login_at =
            authUser.user.last_sign_in_at ||
            (authUser.user.user_metadata as any)?.last_login_at ||
            null;
        }
      } catch {}
    }
    return profile;
  }

  async findByEmail(email: string): Promise<ProfileDTO | null> {
    const { data, error } = await this.client
      .from('profiles')
      .select(PROFILE_SELECT)
      .ilike('email', email.trim())
      .maybeSingle();
    if (error || !data) return null;
    const profile = mapProfile(data as RawProfile);
    if (!profile.last_login_at && this.client.auth?.admin) {
      try {
        const { data: authUser } = await this.client.auth.admin.getUserById(profile.id);
        if (authUser?.user) {
          profile.last_login_at =
            authUser.user.last_sign_in_at ||
            (authUser.user.user_metadata as any)?.last_login_at ||
            null;
        }
      } catch {}
    }
    return profile;
  }

  /** Admin registry listing including lockout state and authoritative last login time (service-role only). */
  async listAllWithLockout(): Promise<AdminUserRow[]> {
    const { data, error } = await this.client
      .from('profiles')
      .select(PROFILE_SELECT)
      .order('created_at', { ascending: false });

    if (error || !data) {
      console.error('Failed to fetch profiles in listAllWithLockout:', error);
      return [];
    }

    const userIds = (data as any[]).map((r) => r.id).filter(Boolean);
    const secMap = new Map<string, { failed_attempts: number; locked_until: string | null }>();

    if (userIds.length > 0) {
      try {
        const { data: secData } = await this.client
          .from('login_security')
          .select('user_id, failed_attempts, locked_until')
          .in('user_id', userIds);

        if (secData) {
          for (const s of secData) {
            secMap.set(s.user_id, {
              failed_attempts: s.failed_attempts ?? 0,
              locked_until: s.locked_until ?? null,
            });
          }
        }
      } catch (err) {
        console.warn('Could not query login_security:', err);
      }
    }

    // Fetch auth users to get authoritative last_sign_in_at / last_login_at and avatar_url from Supabase Auth
    const authUserMap = new Map<string, { lastLogin: string | null; avatarUrl: string | null }>();
    try {
      if (this.client.auth?.admin) {
        const { data: authData } = await this.client.auth.admin.listUsers({ perPage: 1000 });
        if (authData?.users) {
          for (const u of authData.users) {
            const authTime =
              u.last_sign_in_at || (u.user_metadata as any)?.last_login_at || null;
            const avatar = (u.user_metadata as any)?.avatar_url || null;
            authUserMap.set(u.id, { lastLogin: authTime, avatarUrl: avatar });
          }
        }
      }
    } catch (err) {
      console.warn('Could not query auth.admin.listUsers for last login:', err);
    }

    return (data as any[]).map((row) => {
      const base = mapProfile(row);
      const sec = secMap.get(base.id);
      const authInfo = authUserMap.get(base.id);
      return {
        ...base,
        last_login_at: authInfo?.lastLogin || base.last_login_at || null,
        avatar_url: authInfo?.avatarUrl || null,
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

  /** Service-role admin edit: name + section only (role/status go through dedicated actions). */
  async updateDetails(
    id: string,
    patch: { full_name?: string; section_id?: number | null }
  ): Promise<void> {
    const { error } = await this.client.from('profiles').update(patch).eq('id', id);
    if (error) {
      throw new Error(`Failed to update profile: ${error.message}`);
    }
  }

  /** Stamp the last successful sign-in time (service-role only). */
  async touchLastLogin(id: string): Promise<void> {
    const now = new Date().toISOString();

    // 1. Persistently store in Supabase Auth user metadata
    try {
      if (this.client.auth?.admin) {
        await this.client.auth.admin.updateUserById(id, {
          user_metadata: { last_login_at: now },
        });
      }
    } catch (err) {
      console.warn('Could not update user_metadata.last_login_at:', err);
    }

    // 2. Also update profiles table (if last_login_at column exists in schema)
    try {
      await this.client
        .from('profiles')
        .update({ last_login_at: now })
        .eq('id', id);
    } catch {}
  }
}
