'use client';

import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import type { ProfileDTO } from 'types/auth';

interface ProfileContextType {
  profile: ProfileDTO | null;
  avatarUrl: string | null;
  loading: boolean;
  setAvatar: (url: string | null) => void;
  updateProfile: (patch: Partial<ProfileDTO>) => void;
  applyProfile: (next: ProfileDTO) => void;
  refreshProfile: () => Promise<ProfileDTO | null>;
  clearProfile: () => void;
}

const ProfileContext = createContext<ProfileContextType | null>(null);

function emitAvatarUpdate(userId: string | undefined, avatarUrl: string | null) {
  if (typeof window === 'undefined') return;
  try {
    window.dispatchEvent(
      new CustomEvent('spid_avatar_updated', { detail: { userId, avatarUrl } })
    );
    // Also broadcast via BroadcastChannel for cross-tab sync
    const channel = new BroadcastChannel('spid_auth_sync');
    channel.postMessage({
      type: 'AVATAR_UPDATE',
      userId,
      data: { avatarUrl },
      timestamp: Date.now(),
    });
    channel.close();
  } catch {}
}

export function ProfileProvider({ children }: { children: React.ReactNode }) {
  const [profile, setProfileState] = useState<ProfileDTO | null>(null);
  const [avatarUrl, setAvatarUrlState] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const profileRef = useRef<ProfileDTO | null>(null);
  // Incremented by every local mutation so an older in-flight GET cannot
  // replace a newer login or upload result.
  const versionRef = useRef(0);
  const refreshPromiseRef = useRef<Promise<ProfileDTO | null> | null>(null);

  const cacheProfile = useCallback((next: ProfileDTO | null, avatar: string | null) => {
    if (typeof window === 'undefined') return;
    try {
      if (!next) {
        localStorage.removeItem('spid_user');
        return;
      }
      localStorage.setItem('spid_user', JSON.stringify(next));
      if (next.id) {
        if (avatar) {
          localStorage.setItem(`spid_user_avatar_${next.id}`, avatar);
        } else {
          localStorage.removeItem(`spid_user_avatar_${next.id}`);
        }
      }
    } catch {}
  }, []);

  const applyProfile = useCallback(
    (next: ProfileDTO) => {
      const previousId = profileRef.current?.id;
      const nextAvatar = next.avatar_url ?? null;
      versionRef.current += 1;
      profileRef.current = next;
      setProfileState(next);
      setAvatarUrlState(nextAvatar);
      cacheProfile(next, nextAvatar);
      if (previousId && previousId !== next.id) {
        try {
          localStorage.removeItem(`spid_user_avatar_${previousId}`);
        } catch {}
      }
      emitAvatarUpdate(next.id, nextAvatar);
    },
    [cacheProfile]
  );

  const setAvatar = useCallback(
    (newUrl: string | null) => {
      versionRef.current += 1;
      setAvatarUrlState(newUrl);

      const current = profileRef.current;
      if (!current) {
        emitAvatarUpdate(undefined, newUrl);
        return;
      }

      const next: ProfileDTO = {
        ...current,
        avatar_url: newUrl,
        updated_at: new Date().toISOString(),
      };
      profileRef.current = next;
      setProfileState(next);
      cacheProfile(next, newUrl);
      emitAvatarUpdate(next.id, newUrl);
    },
    [cacheProfile]
  );

  const updateProfile = useCallback(
    (patch: Partial<ProfileDTO>) => {
      const current = profileRef.current;
      if (!current) return;

      const nextAvatar =
        patch.avatar_url !== undefined ? patch.avatar_url : current.avatar_url ?? null;
      const next: ProfileDTO = { ...current, ...patch, avatar_url: nextAvatar };

      versionRef.current += 1;
      profileRef.current = next;
      setProfileState(next);
      setAvatarUrlState(nextAvatar);
      cacheProfile(next, nextAvatar);
      if (patch.avatar_url !== undefined) {
        emitAvatarUpdate(next.id, nextAvatar);
      }
    },
    [cacheProfile]
  );

  const clearProfile = useCallback(() => {
    versionRef.current += 1;
    const current = profileRef.current;
    profileRef.current = null;
    setProfileState(null);
    setAvatarUrlState(null);
    if (typeof window !== 'undefined') {
      try {
        localStorage.removeItem('spid_user');
        localStorage.removeItem('spid_user_avatar');
        if (current?.id) {
          localStorage.removeItem(`spid_user_avatar_${current.id}`);
        }
      } catch {}
      emitAvatarUpdate(current?.id, null);
    }
  }, []);

  const refreshProfile = useCallback(async (): Promise<ProfileDTO | null> => {
    if (refreshPromiseRef.current) return refreshPromiseRef.current;

    const startedAtVersion = versionRef.current;
    const request = (async () => {
      try {
        const res = await fetch('/api/auth/me', { cache: 'no-store' });

        if (res.ok) {
          const json = await res.json().catch(() => null);
          const next = json?.data?.profile as ProfileDTO | undefined;
          if (json?.ok && next) {
            if (versionRef.current !== startedAtVersion) {
              return profileRef.current;
            }
            applyProfile(next);
            return next;
          }
        } else if (res.status === 401) {
          if (versionRef.current === startedAtVersion) {
            clearProfile();
            return null;
          }
          return profileRef.current;
        }
      } catch (e) {
        console.error('Failed to refresh profile:', e);
      } finally {
        setLoading(false);
      }
      return profileRef.current;
    })();

    refreshPromiseRef.current = request;
    try {
      return await request;
    } finally {
      refreshPromiseRef.current = null;
    }
  }, [applyProfile, clearProfile]);

  // Hydrate from cache for an instant first paint, then verify against /api/auth/me if signed in.
  useEffect(() => {
    let hasStoredSession = false;
    try {
      const stored = localStorage.getItem('spid_user');
      if (stored) {
        const parsed = JSON.parse(stored) as ProfileDTO;
        if (parsed?.id) {
          hasStoredSession = true;
          profileRef.current = parsed;
          setProfileState(parsed);
          setAvatarUrlState(
            localStorage.getItem(`spid_user_avatar_${parsed.id}`) || parsed.avatar_url || null
          );
        }
      }
    } catch {}

    // Avoid calling /api/auth/me on public auth routes (e.g. /auth/sign-in) or when completely unauthenticated
    if (typeof window !== 'undefined') {
      const isAuthRoute = window.location.pathname.startsWith('/auth');
      if (isAuthRoute && !hasStoredSession) {
        setLoading(false);
        return;
      }
    }

    refreshProfile();
  }, [refreshProfile]);

  // Keep tabs in sync when another tab updates the same user — and force a
  // reload when another tab signs in as a DIFFERENT user or signs out, since
  // the underlying cookie session was replaced or removed server-side.
  // Uses both BroadcastChannel (for real-time) and localStorage (for fallback).
  useEffect(() => {
    let channel: BroadcastChannel | null = null;
    let handleBroadcastMessage: ((event: MessageEvent) => void) | null = null;

    try {
      // BroadcastChannel for real-time cross-tab communication
      channel = new BroadcastChannel('spid_auth_sync');

      handleBroadcastMessage = (event: MessageEvent) => {
        const current = profileRef.current;
        if (!current?.id) return;

        const { type, userId, data } = event.data;

        if (type === 'LOGIN_SUCCESS') {
          // Another tab logged in with a different account
          if (userId && userId !== current.id) {
            // Different account signed in - redirect this tab to login
            console.log('[AuthSync] Different account logged in, redirecting to login');
            window.location.replace('/auth/sign-in');
          }
          // Same account - no action needed, cookie session is already shared
        } else if (type === 'LOGOUT') {
          // Another tab logged out - reload to clear session
          console.log('[AuthSync] Logout detected in another tab, reloading');
          window.location.reload();
        } else if (type === 'AVATAR_UPDATE' && userId === current.id) {
          // Avatar update for the same user
          const nextUrl = data?.avatarUrl || null;
          const next = { ...current, avatar_url: nextUrl };
          profileRef.current = next;
          setProfileState(next);
          setAvatarUrlState(nextUrl);
        }
      };

      channel.addEventListener('message', handleBroadcastMessage);
    } catch (e) {
      // BroadcastChannel not supported (e.g., in some private browsing modes)
      console.warn('[AuthSync] BroadcastChannel not available, falling back to localStorage only');
    }

    const handleStorageChange = (e: StorageEvent) => {
      const current = profileRef.current;
      if (!current?.id) return;

      try {
        if (e.key === `spid_user_avatar_${current.id}` || e.key === 'spid_user_avatar') {
          const nextUrl = e.newValue || null;
          const next = { ...current, avatar_url: nextUrl };
          profileRef.current = next;
          setProfileState(next);
          setAvatarUrlState(nextUrl);
        } else if (e.key === 'spid_user') {
          if (!e.newValue) {
            // Signed out in another tab — reload so the (now cookieless)
            // session is dropped everywhere and middleware redirects.
            window.location.reload();
            return;
          }
          const parsed = JSON.parse(e.newValue) as ProfileDTO;
          if (parsed.id === current.id) {
            profileRef.current = parsed;
            setProfileState(parsed);
            setAvatarUrlState(parsed.avatar_url || null);
          } else {
            // A different account signed in inside this browser: the server
            // has already replaced the cookie session, so this tab must not
            // keep showing the previous account. Redirect to login.
            window.location.replace('/auth/sign-in');
          }
        }
      } catch {}
    };

    window.addEventListener('storage', handleStorageChange);

    return () => {
      if (channel && handleBroadcastMessage) {
        try {
          channel.removeEventListener('message', handleBroadcastMessage);
          channel.close();
        } catch {}
      }
      window.removeEventListener('storage', handleStorageChange);
    };
  }, []);

  return (
    <ProfileContext.Provider
      value={{
        profile,
        avatarUrl,
        loading,
        setAvatar,
        updateProfile,
        applyProfile,
        refreshProfile,
        clearProfile,
      }}
    >
      {children}
    </ProfileContext.Provider>
  );
}

export function useProfile() {
  const context = useContext(ProfileContext);
  if (!context) {
    throw new Error('useProfile must be used within a ProfileProvider');
  }
  return context;
}
