'use client';

import React, { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FiAlertTriangle, FiClock, FiLogOut, FiShield } from 'react-icons/fi';

// Importing the config guarantees the dictionaries exist even when this
// component is rendered in isolation (tests) instead of under the provider.
import 'i18n/config';
import {
  ACTIVITY_THROTTLE_MS,
  AUTH_EVENT_KEY,
  AUTH_SYNC_CHANNEL,
  INACTIVITY_TIMEOUT_MS,
  KEEPALIVE_INTERVAL_MS,
  LAST_ACTIVITY_KEY,
  SESSION_EXPIRED_INACTIVITY_CODE,
  inactivityWindow,
  isSessionExpired,
} from 'lib/sessionPolicy';
import { broadcastActivity, broadcastLogout, clearLastActivity } from 'lib/authSync';

/**
 * Session watchdog for authenticated dashboard layouts.
 *
 *  1. Inactivity policy: signs the user out after the configured idle window
 *     (one hour by default) without a GENUINE interaction (mouse, click,
 *     keyboard, scroll, touch, wheel). Heartbeats, token refreshes, polls and
 *     tab focus never reset the deadline.
 *  2. Proactive status verification: POST /api/auth/me reports activity (and
 *     only then rolls the server-side deadline) while watching for
 *     administrative status changes.
 *  3. Reactive denial interception: a 403 ACCOUNT_* response, or a 401
 *     SESSION_EXPIRED_INACTIVITY response, ends the session.
 *  4. Cross-tab sync: activity is shared through localStorage and
 *     BroadcastChannel, and logout is broadcast to every tab.
 */

const LOCAL_CHECK_INTERVAL_MS = 15_000;
const WARNING_WINDOW_MS = 60_000;
const STATUS_CHECK_THROTTLE_MS = 60_000;
const REDIRECT_DELAY_MS = 4_000;

const DENIAL_CODES = new Set([
  'ACCOUNT_DISABLED',
  'ACCOUNT_LOCKED',
  'ACCOUNT_PENDING',
  'ACCOUNT_REJECTED',
]);

interface ForcedLogoutCopy {
  titleKey: string;
  messageKey: string;
  status: string;
}

const STATUS_COPY: Record<string, ForcedLogoutCopy> = {
  ACCOUNT_DISABLED: {
    titleKey: 'session.disabled.title',
    messageKey: 'session.disabled.message',
    status: 'disabled',
  },
  ACCOUNT_LOCKED: {
    titleKey: 'session.locked.title',
    messageKey: 'session.locked.message',
    status: 'locked',
  },
  ACCOUNT_PENDING: {
    titleKey: 'session.pending.title',
    messageKey: 'session.pending.message',
    status: 'pending',
  },
  ACCOUNT_REJECTED: {
    titleKey: 'session.rejected.title',
    messageKey: 'session.rejected.message',
    status: 'rejected',
  },
  SESSION_EXPIRED: {
    titleKey: 'session.expiredTitle',
    messageKey: 'session.expired',
    status: 'inactivity',
  },
  INACTIVITY_TIMEOUT: {
    titleKey: 'session.expiredTitle',
    messageKey: 'session.expiredInactivity',
    status: 'inactivity',
  },
};

let handling = false;

export default function SessionWatchdog() {
  const { t } = useTranslation('auth');
  const [forcedLogout, setForcedLogout] = useState<ForcedLogoutCopy | null>(null);
  const [warningSeconds, setWarningSeconds] = useState<number | null>(null);
  const lastActiveRef = useRef<number>(Date.now());
  const lastMeCheck = useRef<number>(0);
  const consecutiveAuthErrors = useRef<number>(0);
  const inFlightCheck = useRef<boolean>(false);
  const hadActivityRef = useRef<boolean>(false);
  const evaluateRef = useRef<() => boolean>(() => false);

  const inactivityDuration = (): string => {
    const { count, unit } = inactivityWindow();
    return t(`session.duration.${unit}`, { count });
  };

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

    const beginForcedLogout = async (info: ForcedLogoutCopy) => {
      if (handling) return;
      handling = true;
      setWarningSeconds(null);
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

    // Only genuine input resets the deadline, and at most once a second.
    const recordUserActivity = () => {
      hadActivityRef.current = true;
      const now = Date.now();
      if (now - lastActiveRef.current < ACTIVITY_THROTTLE_MS) return;
      lastActiveRef.current = now;
      setWarningSeconds(null);
      broadcastActivity(now);
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

    /** Local-only deadline check; returns true when the session is over. */
    const evaluateDeadline = (): boolean => {
      const now = Date.now();
      const remaining = INACTIVITY_TIMEOUT_MS - (now - getLatestActivityTime());
      if (remaining <= 0) {
        void beginForcedLogout(STATUS_COPY.INACTIVITY_TIMEOUT);
        return true;
      }
      if (remaining <= WARNING_WINDOW_MS) {
        setWarningSeconds(Math.max(1, Math.ceil(remaining / 1000)));
      } else {
        setWarningSeconds(null);
      }
      return false;
    };
    evaluateRef.current = evaluateDeadline;

    const checkSession = async (forceCheck = false) => {
      if (handling || inFlightCheck.current) return;
      if (evaluateDeadline()) return;

      const now = Date.now();
      if (!forceCheck && now - lastMeCheck.current < STATUS_CHECK_THROTTLE_MS) {
        return;
      }
      lastMeCheck.current = now;
      inFlightCheck.current = true;
      const reportActivity = hadActivityRef.current;
      hadActivityRef.current = false;

      // Activity-only heartbeat: the server preserves the deadline when no
      // genuine interaction happened, so this call cannot extend an idle
      // session. Background polling therefore never keeps the session alive.
      try {
        const res = await fetch('/api/auth/me', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ active: reportActivity }),
          cache: 'no-store',
        });

        if (res.status === 401) {
          const json = await res.clone().json().catch(() => null);
          if (json?.code === SESSION_EXPIRED_INACTIVITY_CODE) {
            await beginForcedLogout(STATUS_COPY.INACTIVITY_TIMEOUT);
            return;
          }
          consecutiveAuthErrors.current += 1;
          if (consecutiveAuthErrors.current < 2) {
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
        // Transient network hiccup — the next heartbeat will retry.
      } finally {
        inFlightCheck.current = false;
      }
    };

    // Genuine interaction events only; focus/visibility merely re-check the
    // absolute deadline below.
    const activityEvents = [
      'mousemove',
      'mousedown',
      'pointerdown',
      'keydown',
      'scroll',
      'touchstart',
      'touchmove',
      'wheel',
      'click',
    ];
    activityEvents.forEach((ev) => {
      document.addEventListener(ev, recordUserActivity, { passive: true });
    });

    const localCheck = window.setInterval(() => {
      evaluateDeadline();
    }, LOCAL_CHECK_INTERVAL_MS);

    const keepAlive = window.setInterval(() => {
      if (document.visibilityState === 'visible') {
        void checkSession(true);
      } else {
        // Background tabs may throttle timers; this still catches a fully
        // expired deadline, and visibility/focus below catch the rest.
        evaluateDeadline();
      }
    }, KEEPALIVE_INTERVAL_MS);

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

    const acceptRemoteActivity = (timestamp: number) => {
      if (timestamp > lastActiveRef.current) {
        lastActiveRef.current = timestamp;
        setWarningSeconds(null);
      }
    };

    // Cross-tab activity + logout synchronization.
    const onStorage = (e: StorageEvent) => {
      if (e.key === LAST_ACTIVITY_KEY && e.newValue) {
        const ts = parseInt(e.newValue, 10);
        if (!isNaN(ts)) acceptRemoteActivity(ts);
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

    let syncChannel: BroadcastChannel | null = null;
    try {
      syncChannel = new BroadcastChannel(AUTH_SYNC_CHANNEL);
      syncChannel.onmessage = (event) => {
        const data = event.data;
        if (!data) return;
        if (data.type === 'ACTIVITY' && typeof data.ts === 'number') {
          acceptRemoteActivity(data.ts);
        }
        if (data.type === 'LOGOUT' && !handling) {
          handling = true;
          clearLastActivity();
          window.location.href = '/auth/sign-in';
        }
      };
    } catch {}

    const originalFetch = window.fetch.bind(window);
    window.fetch = async (input: any, init?: RequestInit) => {
      const res = await originalFetch(input, init);
      try {
        const url = typeof input === 'string' ? input : input?.url ?? '';
        if (
          !handling &&
          !String(url).includes('/api/auth/me') &&
          !String(url).includes('/api/auth/logout')
        ) {
          if (res.status === 403) {
            const clone = res.clone();
            const json = await clone.json().catch(() => null);
            const code = json?.code;
            if (code && DENIAL_CODES.has(code)) {
              void beginForcedLogout(STATUS_COPY[code]);
            }
          } else if (res.status === 401) {
            const clone = res.clone();
            const json = await clone.json().catch(() => null);
            if (json?.code === SESSION_EXPIRED_INACTIVITY_CODE) {
              void beginForcedLogout(STATUS_COPY.INACTIVITY_TIMEOUT);
            }
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
    } else {
      evaluateDeadline();
    }

    return () => {
      activityEvents.forEach((ev) => {
        document.removeEventListener(ev, recordUserActivity);
      });
      window.clearInterval(localCheck);
      window.clearInterval(keepAlive);
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('storage', onStorage);
      try {
        syncChannel?.close();
      } catch {}
      window.fetch = originalFetch;
    };
  }, []);

  // Live one-second countdown while the warning is visible.
  const warningActive = warningSeconds !== null && !forcedLogout;
  useEffect(() => {
    if (!warningActive) return;
    const id = window.setInterval(() => {
      evaluateRef.current();
    }, 1000);
    return () => window.clearInterval(id);
  }, [warningActive]);

  const staySignedIn = () => {
    const now = Date.now();
    lastActiveRef.current = now;
    broadcastActivity(now);
    setWarningSeconds(null);
    void fetch('/api/auth/me', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ active: true }),
      cache: 'no-store',
    }).catch(() => {});
  };

  const durationText = inactivityDuration();

  if (!forcedLogout) {
    if (!warningActive) return null;
    return (
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="session-warning-title"
        className="fixed inset-0 z-[9998] flex items-center justify-center bg-navy-900/60 p-4"
      >
        <div className="w-full max-w-md rounded-3xl bg-white p-8 text-center shadow-2xl dark:bg-navy-800">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-amber-50 text-amber-500 dark:bg-amber-900/30">
            <FiClock className="h-7 w-7" />
          </div>
          <h2
            id="session-warning-title"
            className="text-lg font-bold text-navy-700 dark:text-white"
          >
            {t('session.warningTitle')}
          </h2>
          <p className="mt-2 text-sm font-medium leading-relaxed text-slate-600 dark:text-slate-300">
            {t('session.warningMessage', { count: warningSeconds ?? 0 })}
          </p>
          <button
            type="button"
            onClick={staySignedIn}
            className="mt-5 inline-flex min-w-fit items-center justify-center gap-2 rounded-xl bg-[#4318FF] px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-indigo-600/25 transition hover:bg-[#3411db] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#4318FF] focus-visible:ring-offset-2"
          >
            {t('session.staySignedIn')}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-navy-900/70 p-4 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-3xl bg-white p-8 text-center shadow-2xl dark:bg-navy-800">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-red-50 text-red-500 dark:bg-red-900/30">
          <FiAlertTriangle className="h-7 w-7" />
        </div>
        <h2 className="text-lg font-bold text-navy-700 dark:text-white">
          {t(forcedLogout.titleKey)}
        </h2>
        <p className="mt-2 text-xs font-medium leading-relaxed text-slate-500 dark:text-slate-400">
          {t(forcedLogout.messageKey, { duration: durationText })}
        </p>
        <div className="mt-5 flex items-center justify-center gap-1.5 rounded-xl bg-[#f4f7fe] px-3 py-2 text-[11px] font-bold text-[#4318FF] dark:bg-navy-900">
          <FiShield className="h-3.5 w-3.5" />
          {t('session.securityPolicy')}
        </div>
        <p className="mt-4 flex items-center justify-center gap-1.5 text-[11px] font-semibold text-slate-500 dark:text-slate-400">
          <FiLogOut className="h-3.5 w-3.5" />
          {t('session.redirecting')}
        </p>
      </div>
    </div>
  );
}
