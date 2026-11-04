'use client';

import React, { useEffect, useRef, useState } from 'react';
import { FiAlertTriangle, FiShield, FiLogOut } from 'react-icons/fi';
import {
  AUTH_EVENT_KEY,
  INACTIVITY_TIMEOUT_MS,
  LAST_ACTIVITY_KEY,
  isSessionExpired,
} from 'lib/sessionPolicy';
import { broadcastLogout, clearLastActivity } from 'lib/authSync';

/**
 * Session watchdog for authenticated dashboard layouts.
 *
 *  1. Inactivity policy: signs the user out after 2 hours without a GENUINE
 *     interaction (mouse, click, keyboard, scroll, touch). Heartbeats, token
 *     refreshes, polls and tab focus never reset the deadline.
 *  2. Proactive status verification: POST /api/auth/me reports activity (and
 *     only then rolls the server-side deadline) while watching for
 *     administrative status changes.
 *  3. Reactive denial interception: a 403 ACCOUNT_* response ends the session.
 *  4. Cross-tab sync: activity is shared through localStorage and logout is
 *     broadcast to every tab.
 */

const HEARTBEAT_INTERVAL_MS = 120_000; // 2 minutes
const ACTIVITY_THROTTLE_MS = 5_000;
const CLICK_CHECK_THROTTLE_MS = 60_000;
const REDIRECT_DELAY_MS = 4_000;

const DENIAL_CODES = new Set([
  'ACCOUNT_DISABLED',
  'ACCOUNT_LOCKED',
  'ACCOUNT_PENDING',
  'ACCOUNT_REJECTED',
]);

const STATUS_COPY: Record<string, { title: string; message: string; status: string }> = {
  ACCOUNT_DISABLED: {
    title: 'Account Disabled',
    message:
      'Your account has been disabled by an administrator. You have been signed out of this device. Please contact the system administrator.',
    status: 'disabled',
  },
  ACCOUNT_LOCKED: {
    title: 'Account Locked',
    message:
      'Your account is temporarily locked due to security restrictions. You have been signed out of this device.',
    status: 'locked',
  },
  ACCOUNT_PENDING: {
    title: 'Approval Required',
    message:
      'Your account is awaiting administrator approval. You have been signed out of this device.',
    status: 'pending',
  },
  ACCOUNT_REJECTED: {
    title: 'Registration Declined',
    message:
      'Your account registration was declined by an administrator. You have been signed out of this device.',
    status: 'rejected',
  },
  SESSION_EXPIRED: {
    title: 'Session Expired',
    message: 'Your session has expired due to 2 hours of inactivity. Please log in again to continue.',
    status: 'inactivity',
  },
  INACTIVITY_TIMEOUT: {
    title: 'Session Expired',
    message: 'Your session has expired due to 2 hours of inactivity. Please log in again to continue.',
    status: 'inactivity',
  },
};

interface ForcedLogout {
  title: string;
  message: string;
  status: string;
}

let handling = false;

export default function SessionWatchdog() {
  const [forcedLogout, setForcedLogout] = useState<ForcedLogout | null>(null);
  const lastActiveRef = useRef<number>(Date.now());
  const lastMeCheck = useRef<number>(0);
  const consecutiveAuthErrors = useRef<number>(0);
  const inFlightCheck = useRef<boolean>(false);
  const hadActivityRef = useRef<boolean>(false);

  useEffect(() => {
    handling = false;

    // Seed the deadline from the shared activity clock. A timestamp older than
    // the policy window is treated as expired immediately.
    try {
      const stored = localStorage.getItem(LAST_ACTIVITY_KEY);
      const parsed = stored ? parseInt(stored, 10) : NaN;
      if (!isNaN(parsed) && parsed > 0 && parsed <= Date.now()) {
        lastActiveRef.current = parsed;
      } else {
        lastActiveRef.current = Date.now();
        localStorage.setItem(LAST_ACTIVITY_KEY, String(lastActiveRef.current));
      }
    } catch {}

    const beginForcedLogout = async (info: ForcedLogout) => {
      if (handling) return;
      handling = true;
      setForcedLogout(info);

      try {
        localStorage.removeItem('spid_user');
        localStorage.removeItem('spid_user_avatar');
      } catch {}
      clearLastActivity();
      broadcastLogout();

      try {
        await fetch('/api/auth/logout', { method: 'POST' });
      } catch {}

      window.setTimeout(() => {
        window.location.href = `/auth/sign-in?status=${encodeURIComponent(info.status)}`;
      }, REDIRECT_DELAY_MS);
    };

    // Only genuine input resets the deadline.
    const recordUserActivity = () => {
      const now = Date.now();
      if (now - lastActiveRef.current < ACTIVITY_THROTTLE_MS) {
        hadActivityRef.current = true;
        return;
      }
      lastActiveRef.current = now;
      hadActivityRef.current = true;
      try {
        localStorage.setItem(LAST_ACTIVITY_KEY, String(now));
      } catch {}
    };

    const getLatestActivityTime = (): number => {
      try {
        const stored = localStorage.getItem(LAST_ACTIVITY_KEY);
        if (stored) {
          const parsed = parseInt(stored, 10);
          if (!isNaN(parsed) && parsed > lastActiveRef.current) {
            lastActiveRef.current = parsed;
          }
        }
      } catch {}
      return lastActiveRef.current;
    };

    const checkSession = async (forceCheck = false) => {
      if (handling || inFlightCheck.current) return;
      const now = Date.now();
      const idleTime = now - getLatestActivityTime();

      if (isSessionExpired({ t: now - idleTime }, now)) {
        await beginForcedLogout(STATUS_COPY.INACTIVITY_TIMEOUT);
        return;
      }

      if (!forceCheck && now - lastMeCheck.current < CLICK_CHECK_THROTTLE_MS) {
        return;
      }
      lastMeCheck.current = now;
      inFlightCheck.current = true;
      const reportActivity = hadActivityRef.current;
      hadActivityRef.current = false;

      // Activity-only heartbeat: the server preserves the deadline when no
      // genuine interaction happened, so this call cannot extend an idle session.
      try {
        const res = await fetch('/api/auth/me', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ active: reportActivity }),
          cache: 'no-store',
        });

        if (res.status === 401) {
          consecutiveAuthErrors.current += 1;
          if (idleTime < INACTIVITY_TIMEOUT_MS && consecutiveAuthErrors.current < 2) {
            return;
          }
          await beginForcedLogout(STATUS_COPY.SESSION_EXPIRED);
          return;
        }

        if (!res.ok) return;

        consecutiveAuthErrors.current = 0;

        const json = await res.json().catch(() => null);
        const status = json?.data?.profile?.account_status;
        if (status && status !== 'approved') {
          const info =
            STATUS_COPY[`ACCOUNT_${String(status).toUpperCase()}`] ?? STATUS_COPY.SESSION_EXPIRED;
          await beginForcedLogout(info);
        }
      } catch {
        // Transient network hiccup — next heartbeat will retry
      } finally {
        inFlightCheck.current = false;
      }
    };

    // Genuine interaction events only.
    const activityEvents = ['mousemove', 'mousedown', 'keydown', 'scroll', 'touchstart', 'click'];
    activityEvents.forEach((ev) => {
      window.addEventListener(ev, recordUserActivity, { passive: true });
    });

    const interval = window.setInterval(() => {
      if (document.visibilityState === 'visible') {
        void checkSession(false);
      } else {
        // Background tabs may throttle timers; this still catches a fully
        // expired deadline, and visibility/focus below catch the rest.
        const idleTime = Date.now() - getLatestActivityTime();
        if (idleTime >= INACTIVITY_TIMEOUT_MS) {
          void beginForcedLogout(STATUS_COPY.INACTIVITY_TIMEOUT);
        }
      }
    }, HEARTBEAT_INTERVAL_MS);

    // Focus/visibility do NOT count as activity; they only re-check the
    // absolute deadline so background throttling cannot bypass expiration.
    const onFocus = () => {
      void checkSession(false);
    };
    const onVisibility = () => {
      if (document.visibilityState === 'visible') {
        void checkSession(false);
      }
    };
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVisibility);

    // Cross-tab activity + logout synchronization.
    const onStorage = (e: StorageEvent) => {
      if (e.key === LAST_ACTIVITY_KEY && e.newValue) {
        const ts = parseInt(e.newValue, 10);
        if (!isNaN(ts) && ts > lastActiveRef.current) {
          lastActiveRef.current = ts;
        }
        return;
      }
      if (e.key === AUTH_EVENT_KEY && e.newValue) {
        try {
          const event = JSON.parse(e.newValue);
          if (event?.type === 'LOGOUT' && !handling) {
            handling = true;
            clearLastActivity();
            window.location.href = '/auth/sign-in';
          }
        } catch {}
      }
    };
    window.addEventListener('storage', onStorage);

    const originalFetch = window.fetch.bind(window);
    window.fetch = async (input: any, init?: RequestInit) => {
      const res = await originalFetch(input, init);
      try {
        const url = typeof input === 'string' ? input : input?.url ?? '';
        if (
          !handling &&
          res.status === 403 &&
          !String(url).includes('/api/auth/me') &&
          !String(url).includes('/api/auth/logout')
        ) {
          const clone = res.clone();
          const json = await clone.json().catch(() => null);
          const code = json?.code;
          if (code && DENIAL_CODES.has(code)) {
            void beginForcedLogout(STATUS_COPY[code]);
          }
        }
      } catch {
        // Never break the original request flow.
      }
      return res;
    };

    // Catch an already-expired restored session immediately instead of
    // waiting for the first heartbeat.
    if (Date.now() - lastActiveRef.current >= INACTIVITY_TIMEOUT_MS) {
      void beginForcedLogout(STATUS_COPY.INACTIVITY_TIMEOUT);
    }

    return () => {
      activityEvents.forEach((ev) => {
        window.removeEventListener(ev, recordUserActivity);
      });
      window.clearInterval(interval);
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('storage', onStorage);
      window.fetch = originalFetch;
    };
  }, []);

  if (!forcedLogout) return null;

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-navy-900/70 p-4 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-3xl bg-white p-8 text-center shadow-2xl dark:bg-navy-800">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-red-50 text-red-500 dark:bg-red-900/30">
          <FiAlertTriangle className="h-7 w-7" />
        </div>
        <h2 className="text-lg font-bold text-navy-700 dark:text-white">{forcedLogout.title}</h2>
        <p className="mt-2 text-xs font-medium leading-relaxed text-slate-500 dark:text-slate-400">
          {forcedLogout.message}
        </p>
        <div className="mt-5 flex items-center justify-center gap-1.5 rounded-xl bg-[#f4f7fe] px-3 py-2 text-[11px] font-bold text-[#4318FF] dark:bg-navy-900">
          <FiShield className="h-3.5 w-3.5" />
          SPID Security Policy Enforced
        </div>
        <p className="mt-4 flex items-center justify-center gap-1.5 text-[11px] font-semibold text-slate-400">
          <FiLogOut className="h-3.5 w-3.5" />
          Redirecting to sign-in...
        </p>
      </div>
    </div>
  );
}
