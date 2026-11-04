import { AUTH_EVENT_KEY, LAST_ACTIVITY_KEY } from 'lib/sessionPolicy';

export function clearLastActivity(): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.removeItem(LAST_ACTIVITY_KEY);
  } catch {}
}

export function markActivityNow(): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(LAST_ACTIVITY_KEY, String(Date.now()));
  } catch {}
}

/**
 * Tells every other tab that the session ended. BroadcastChannel is the fast
 * path; the localStorage key is the fallback where BroadcastChannel is not
 * available (and also survives across older tabs).
 */
export function broadcastLogout(): void {
  if (typeof window === 'undefined') return;
  try {
    const channel = new BroadcastChannel('spid_auth_sync');
    channel.postMessage({ type: 'LOGOUT', timestamp: Date.now() });
    channel.close();
  } catch {}
  try {
    localStorage.setItem(AUTH_EVENT_KEY, JSON.stringify({ type: 'LOGOUT', ts: Date.now() }));
  } catch {}
}
