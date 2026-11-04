/**
 * Single source of truth for the session lifecycle rules shared by the
 * middleware, API routes and the client watchdog.
 *
 * - The inactivity deadline is absolute: it is anchored to the last GENUINE
 *   user interaction, never to token refreshes, polls or background requests.
 * - Remember Me only controls how long the cookies may live across browser
 *   restarts; it never extends the inactivity deadline.
 */

export const SESSION_META_COOKIE = 'spid_session_auth';
export const INACTIVITY_TIMEOUT_MS = 2 * 60 * 60 * 1000; // 2 hours
export const REMEMBER_LIFETIME_SECONDS = 30 * 24 * 60 * 60; // 30 days

export const LAST_ACTIVITY_KEY = 'spid_last_activity_time';
export const AUTH_EVENT_KEY = 'spid_auth_event';

export interface SessionMeta {
  id: string;
  role: string;
  status: string;
  /** Epoch ms of the last genuine user interaction. */
  t: number;
  /** Whether the user asked to stay signed in across browser restarts. */
  remember?: boolean;
}

export interface SessionMetaCookieOptions {
  path: string;
  httpOnly: boolean;
  sameSite: 'lax';
  maxAge?: number;
}

export function parseSessionMeta(raw: string | null | undefined): SessionMeta | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (
      parsed &&
      typeof parsed.id === 'string' &&
      typeof parsed.role === 'string' &&
      typeof parsed.status === 'string' &&
      typeof parsed.t === 'number' &&
      Number.isFinite(parsed.t)
    ) {
      return {
        id: parsed.id,
        role: parsed.role,
        status: parsed.status,
        t: parsed.t,
        remember: parsed.remember === true,
      };
    }
  } catch {}
  return null;
}

export function isSessionExpired(
  meta: Pick<SessionMeta, 't'>,
  now: number = Date.now()
): boolean {
  return now - meta.t >= INACTIVITY_TIMEOUT_MS;
}

/**
 * Remember Me => persistent cookie with a 30-day ceiling.
 * Otherwise the cookie dies with the browser session, which is the intended
 * shorter-lived policy for non-remembered logins.
 */
export function sessionCookieOptions(remember: boolean): SessionMetaCookieOptions {
  return {
    path: '/',
    httpOnly: true,
    sameSite: 'lax',
    ...(remember ? { maxAge: REMEMBER_LIFETIME_SECONDS } : {}),
  };
}
