/**
 * Single source of truth for the session lifecycle rules shared by the
 * middleware, API routes and the client watchdog.
 *
 * - The inactivity deadline is absolute: it is anchored to the last GENUINE
 *   user interaction, never to token refreshes, polls or background requests.
 * - Remember Me only controls how long the cookies may live across browser
 *   restarts; it never extends the inactivity deadline.
 *
 * The timeout defaults to ONE HOUR. Override it with the
 * `NEXT_PUBLIC_SESSION_INACTIVITY_TIMEOUT_MS` environment variable (both the
 * browser bundle and the server read this same compiled value).
 */

const DEFAULT_INACTIVITY_TIMEOUT_MS = 60 * 60 * 1000; // 1 hour

function resolveInactivityTimeoutMs(): number {
  const configured = Number(process.env.NEXT_PUBLIC_SESSION_INACTIVITY_TIMEOUT_MS);
  return Number.isFinite(configured) && configured > 0
    ? configured
    : DEFAULT_INACTIVITY_TIMEOUT_MS;
}

/** Absolute idle deadline shared by every layer. */
export const INACTIVITY_TIMEOUT_MS = resolveInactivityTimeoutMs();

/** Machine-readable reason returned on a 401 caused by idling out. */
export const SESSION_EXPIRED_INACTIVITY_CODE = 'SESSION_EXPIRED_INACTIVITY' as const;

/** Genuine interactions may reset the clock at most once per second. */
export const ACTIVITY_THROTTLE_MS = 1_000;

/** Client keep-alive cadence while the user is actually active. */
export const KEEPALIVE_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

/** Server-side slide throttle so activity cannot hammer the session cookie. */
export const SESSION_TOUCH_THROTTLE_MS = 60 * 1000; // 1 minute

export const SESSION_META_COOKIE = 'spid_session_auth';
export const REMEMBER_LIFETIME_SECONDS = 30 * 24 * 60 * 60; // 30 days

export const LAST_ACTIVITY_KEY = 'spid_last_activity_time';
export const AUTH_EVENT_KEY = 'spid_auth_event';
export const AUTH_SYNC_CHANNEL = 'spid_auth_sync';

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
 * The configured window expressed in the largest exact unit, so the login
 * notice reads "1 hour" by default and still reads sensibly when the value is
 * overridden (e.g. 30 seconds in a test environment).
 */
export function inactivityWindow(): {
  count: number;
  unit: 'hour' | 'minute' | 'second';
} {
  const ms = INACTIVITY_TIMEOUT_MS;
  if (ms % 3_600_000 === 0) return { count: ms / 3_600_000, unit: 'hour' };
  if (ms % 60_000 === 0) return { count: ms / 60_000, unit: 'minute' };
  return { count: Math.round(ms / 1000), unit: 'second' };
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
