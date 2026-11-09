'use client';

import React, { useEffect, useRef, useState, Suspense } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useTranslation } from 'react-i18next';
import { FiMail, FiLock, FiEye, FiEyeOff, FiArrowRight, FiShield, FiX } from 'react-icons/fi';
import { HiOutlineIdentification } from 'react-icons/hi';
import AuthBrandHeader from 'components/auth/AuthBrandHeader';
import AuthBrandFooter from 'components/auth/AuthBrandFooter';
import LanguageSwitcher from 'components/navbar/LanguageSwitcher';
import { useToast } from 'components/toast/ToastContext';
import { useProfile } from 'contexts/ProfileContext';
import { markActivityNow } from 'lib/authSync';
import { inactivityWindow } from 'lib/sessionPolicy';
import { isValidEmailFormat } from 'validators/authValidators';
import type { ApiErrorCode } from 'types/auth';
import { localiseMessage } from 'i18n/uiText';
import { formatLockoutCountdown } from 'lib/auth/lockout';

const LOCKOUT_STORAGE_KEY = 'spid_login_lockout';

/** A per-email lock notice that survives a refresh and ends on its own. */
type LockoutNotice = {
  kind: 'temp' | 'permanent';
  email: string;
  expiresAt: number | null;
};

function readStoredLockout(): LockoutNotice | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.sessionStorage.getItem(LOCKOUT_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<LockoutNotice> | null;
    if (!parsed || typeof parsed.email !== 'string') return null;
    if (parsed.kind === 'permanent') {
      return { kind: 'permanent', email: parsed.email, expiresAt: null };
    }
    if (parsed.kind === 'temp' && typeof parsed.expiresAt === 'number') {
      if (parsed.expiresAt <= Date.now()) {
        window.sessionStorage.removeItem(LOCKOUT_STORAGE_KEY);
        return null;
      }
      return { kind: 'temp', email: parsed.email, expiresAt: parsed.expiresAt };
    }
    return null;
  } catch {
    return null;
  }
}

const STATUS_BANNERS: Record<
  string,
  { type: 'error' | 'warning'; titleKey: string; textKey: string }
> = {
  pending: { type: 'warning', titleKey: 'banners.pendingTitle', textKey: 'banners.pendingText' },
  disabled: { type: 'error', titleKey: 'banners.disabledTitle', textKey: 'banners.disabledText' },
  locked: { type: 'error', titleKey: 'banners.lockedTitle', textKey: 'banners.lockedText' },
  inactivity: {
    type: 'warning',
    titleKey: 'banners.inactivityTitle',
    textKey: 'banners.inactivityText',
  },
  unknown: { type: 'warning', titleKey: 'banners.unknownTitle', textKey: 'banners.unknownText' },
  rejected: { type: 'error', titleKey: 'banners.rejectedTitle', textKey: 'banners.rejectedText' },
};

function SignInContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { t } = useTranslation('auth');
  const callbackUrl = searchParams.get('callbackUrl') || '';
  const { showToast } = useToast();
  const { applyProfile } = useProfile();

  // Inputs are empty by default so placeholders appear like watermarks
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberDevice, setRememberDevice] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const [lockout, setLockout] = useState<LockoutNotice | null>(null);
  const [clock, setClock] = useState(() => Date.now());
  const [errorBanner, setErrorBanner] = useState<{ type: 'error' | 'warning'; title: string; text: string } | null>(null);
  const errorBannerRef = useRef<HTMLDivElement>(null);

  const storeLockout = (notice: LockoutNotice | null) => {
    setLockout(notice);
    if (typeof window === 'undefined') return;
    try {
      if (notice) window.sessionStorage.setItem(LOCKOUT_STORAGE_KEY, JSON.stringify(notice));
      else window.sessionStorage.removeItem(LOCKOUT_STORAGE_KEY);
    } catch {}
  };

  // Move focus to the alert so keyboard and screen-reader users hear the
  // failure immediately instead of hunting for it further up the page.
  useEffect(() => {
    if (errorBanner) errorBannerRef.current?.focus();
  }, [errorBanner]);

  // Arriving from middleware/session watchdog with a status denial, or forwarding recovery links
  useEffect(() => {
    // Forward recovery links that land on sign-in (e.g. from email links or implicit hash tokens)
    if (typeof window !== 'undefined') {
      const search = new URLSearchParams(window.location.search);
      const hash = new URLSearchParams(window.location.hash.replace(/^#/, ''));
      const isRecoverySearch =
        search.has('code') ||
        search.get('type') === 'recovery' ||
        search.has('token_hash');
      const isRecoveryHash =
        hash.get('type') === 'recovery' ||
        (hash.has('access_token') && !hash.has('error') && window.location.hash.includes('type=recovery'));

      if (isRecoverySearch || isRecoveryHash) {
        window.location.replace(`/auth/reset-password${window.location.search}${window.location.hash}`);
        return;
      }
    }

    if (searchParams.get('reset') === 'success') {
      showToast({
        type: 'success',
        title: t('signIn.toasts.passwordUpdatedTitle'),
        message: t('signIn.toasts.passwordUpdatedMessage'),
        duration: 7000,
      });
    }

    const status = searchParams.get('status');
    if (status && STATUS_BANNERS[status]) {
      const banner = STATUS_BANNERS[status];
      const { count, unit } = inactivityWindow();
      const vars = { duration: t(`session.duration.${unit}`, { count }) };
      setErrorBanner({
        type: banner.type,
        title: t(banner.titleKey, vars),
        text: t(banner.textKey, vars),
      });

      if (status === 'inactivity') {
        // Persistent notice (never auto-dismissed). The query flag is removed
        // immediately so a later visit does not resurrect an old explanation.
        if (typeof window !== 'undefined') {
          const url = new URL(window.location.href);
          url.searchParams.delete('status');
          window.history.replaceState({}, '', url.toString());
        }
      } else {
        showToast({
          type: banner.type,
          title: t(banner.titleKey, vars).replace(':', ''),
          message: t(banner.textKey, vars),
          duration: 6000,
        });
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // A lock survives refresh: the server already told us when it ends, so the
  // client only counts down and never decides when the account may retry.
  useEffect(() => {
    const restored = readStoredLockout();
    if (!restored) return;
    setLockout(restored);
    setEmail((current) => current || restored.email);
  }, []);

  // One clock tick per second while a temporary lock is counting down.
  useEffect(() => {
    if (lockout?.kind !== 'temp') return;
    setClock(Date.now());
    const timer = window.setInterval(() => {
      const now = Date.now();
      setClock(now);
      if (lockout.expiresAt !== null && now >= lockout.expiresAt) {
        window.clearInterval(timer);
        setLockout(null);
        try {
          window.sessionStorage.removeItem(LOCKOUT_STORAGE_KEY);
        } catch {}
      }
    }, 1000);
    return () => window.clearInterval(timer);
  }, [lockout]);

  const isLockedForInput = !!lockout && lockout.email === email.trim().toLowerCase();
  const lockoutRemaining =
    lockout?.kind === 'temp' && lockout.expiresAt
      ? Math.max(0, Math.ceil((lockout.expiresAt - clock) / 1000))
      : 0;
  const lockoutActive = isLockedForInput && (lockout?.kind === 'permanent' || lockoutRemaining > 0);

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isLoading) return;
    setErrorBanner(null);

    const inputEmail = email.trim();
    if (!inputEmail) {
      const msg = t('signIn.errors.emailRequired');
      setErrorBanner({ type: 'error', title: t('banners.validationTitle'), text: msg });
      showToast({ type: 'error', title: t('signIn.toasts.validationTitle'), message: msg });
      return;
    }

    if (!isValidEmailFormat(inputEmail)) {
      const msg = t('signIn.errors.emailInvalid');
      setErrorBanner({ type: 'error', title: t('banners.validationTitle'), text: msg });
      showToast({ type: 'error', title: t('signIn.toasts.validationTitle'), message: msg });
      return;
    }

    if (!password) {
      const msg = t('signIn.errors.passwordRequired');
      setErrorBanner({ type: 'error', title: t('banners.validationTitle'), text: msg });
      showToast({ type: 'error', title: t('signIn.toasts.validationTitle'), message: msg });
      return;
    }

    if (lockoutActive) {
      const msg =
        lockout?.kind === 'permanent'
          ? t('lockedPermanent')
          : t('lockedTemp', { time: formatLockoutCountdown(lockoutRemaining) });
      showToast({ type: 'error', title: t('signIn.toasts.loginLockedTitle'), message: msg });
      return;
    }

    setIsLoading(true);

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: inputEmail, password, remember: rememberDevice }),
      });
      const json = await res.json();

      if (!res.ok || !json.ok) {
        setIsLoading(false);
        const code = json.code as ApiErrorCode;
        const lowerEmail = inputEmail.toLowerCase();
        // The server owns the lock: `retryAfterSec` is authoritative, the
        // countdown below only paints it.
        const serverRetry = Math.max(
          0,
          Math.ceil(Number(json.retryAfterSec ?? json.remaining_seconds ?? 0) || 0)
        );
        const isPermanentLock =
          code === 'ACCOUNT_LOCKED_PERMANENT' ||
          (code === 'LOGIN_LOCKED_OUT' && json.permanent === true);
        const isTempLock =
          code === 'ACCOUNT_LOCKED_TEMP' ||
          (code === 'LOGIN_LOCKED_OUT' && json.permanent !== true && serverRetry > 0);

        if (isPermanentLock) {
          storeLockout({ kind: 'permanent', email: lowerEmail, expiresAt: null });
          setClock(Date.now());
        } else if (isTempLock) {
          storeLockout({
            kind: 'temp',
            email: lowerEmail,
            expiresAt: Date.now() + Math.max(1, serverRetry) * 1000,
          });
          setClock(Date.now());
        }

        const isLock = isPermanentLock || isTempLock;
        const msg: string = localiseMessage(
          json.message || t('invalidCredentials'),
          {
            code,
            vars: isTempLock ? { time: formatLockoutCountdown(Math.max(1, serverRetry)) } : undefined,
          }
        );

        const isWarning = code === 'ACCOUNT_PENDING' || code === 'EMAIL_NOT_CONFIRMED';
        // Lock codes get the dedicated alert above the form instead of a
        // second, competing inline error.
        if (!isLock) {
          setErrorBanner({
            type: isWarning ? 'warning' : 'error',
            title: isWarning ? t('banners.noticeTitle') : t('banners.validationTitle'),
            text: msg,
          });
        }
        showToast({
          type: isWarning ? 'warning' : 'error',
          title: isWarning
            ? t('signIn.toasts.accountNoticeTitle')
            : isLock
            ? t('signIn.toasts.loginLockedTitle')
            : t('signIn.toasts.signInFailedTitle'),
          message: msg,
          duration: 6000,
        });
        return;
      }

      const profile = json.data.profile;
      const isStaff = profile.role === 'Staff';
      const defaultDest = isStaff ? '/staff/default' : '/admin/dashboard';

      // Honour callbackUrl only if it matches the user's allowed prefix
      const allowedPrefix = isStaff ? '/staff' : '/admin';
      const destination =
        callbackUrl && callbackUrl.startsWith(allowedPrefix) ? callbackUrl : defaultDest;

      // Start the inactivity clock at sign-in so the first heartbeat always
      // has a fresh anchor instead of a stale value from a previous session.
      markActivityNow();

      // Populate shared state immediately so the sidebar/navbar show the
      // authenticated user's own avatar without waiting for a page reload.
      applyProfile(profile);
      storeLockout(null);

      // Broadcast login event to other tabs so they can redirect if showing a different account
      try {
        const channel = new BroadcastChannel('spid_auth_sync');
        channel.postMessage({
          type: 'LOGIN_SUCCESS',
          userId: profile.id,
          timestamp: Date.now(),
        });
        channel.close();
      } catch (e) {
        // BroadcastChannel not supported, localStorage sync will handle it
        console.warn('[AuthSync] BroadcastChannel not available during login');
      }

      showToast({
        type: 'success',
        title: t('signIn.toasts.loginSuccessTitle'),
        message: t('signIn.toasts.welcome', {
          name: profile.full_name,
          role: localiseMessage(profile.role),
        }),
      });

      // Fast transition without full page cold reload
      router.prefetch(destination);
      router.replace(destination);
      // Fallback in case client router is stalled
      setTimeout(() => {
        if (window.location.pathname !== destination) {
          window.location.replace(destination);
        }
      }, 300);
    } catch {
      setIsLoading(false);
      const msg = t('signIn.errors.authUnreachable');
      setErrorBanner({ type: 'error', title: t('banners.validationTitle'), text: msg });
      showToast({ type: 'error', title: t('signIn.toasts.signInFailedTitle'), message: msg });
    }
  };

  return (
    <div className="w-full flex flex-col items-center px-4 sm:px-6">
      {/* Brand Header */}
      <AuthBrandHeader variant="sign-in" />

      {/* Main Sign-In Card */}
      <div className="relative w-full max-w-[460px] rounded-3xl bg-white p-6 sm:p-10 shadow-xl shadow-slate-200/60 dark:bg-navy-800 dark:shadow-navy-950 border border-slate-100 dark:border-navy-700">
        <div className="relative z-10">
          {/* Card Header */}
          <div className="mb-6 flex items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-indigo-50 text-[#4318FF] dark:bg-navy-700">
                  <HiOutlineIdentification className="h-5 w-5" />
                </span>
                <h2 className="text-xl font-bold tracking-tight text-slate-900 dark:text-white">
                  {t('signIn.title')}
                </h2>
              </div>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                {t('signIn.subtitle')}
              </p>
            </div>
            <LanguageSwitcher />
          </div>

          {/* Lockout takes precedence over any older banner (e.g. inactivity) */}
          {lockoutActive && lockout && (
            <div
              role="alert"
              aria-atomic="true"
              className={`mb-4 rounded-xl p-3 text-xs font-medium border ${
                lockout.kind === 'permanent'
                  ? 'bg-red-50 text-red-700 border-red-200 dark:bg-red-900/30 dark:text-red-300 dark:border-red-800'
                  : 'bg-amber-50 text-amber-900 border-amber-300 dark:bg-amber-950/40 dark:text-amber-200 dark:border-amber-800'
              }`}
            >
              <div className="flex flex-wrap items-start gap-x-2 gap-y-1">
                <span className="font-bold">
                  {lockout.kind === 'permanent'
                    ? t('banners.lockedPermanentTitle')
                    : t('banners.lockedTitle')}
                </span>
                <span className="min-w-0 flex-1 break-words">
                  {lockout.kind === 'permanent'
                    ? t('lockedPermanent')
                    : t('lockedTemp', { time: formatLockoutCountdown(lockoutRemaining) })}
                </span>
              </div>
            </div>
          )}

          {/* Inline alert banner if error occurs */}
          {errorBanner && (
            <div
              ref={errorBannerRef}
              id="sign-in-error"
              tabIndex={-1}
              role="alert"
              aria-atomic="true"
              className={`mb-4 rounded-xl p-3 text-xs font-medium border outline-none focus-visible:ring-2 focus-visible:ring-[#4318FF] focus-visible:ring-offset-2 ${
                errorBanner.type === 'warning'
                  ? 'bg-amber-50 text-amber-900 border-amber-300 dark:bg-amber-950/40 dark:text-amber-200 dark:border-amber-800'
                  : 'bg-red-50 text-red-700 border-red-200 dark:bg-red-900/30 dark:text-red-300 dark:border-red-800'
              }`}
            >
              <div className="flex items-start gap-2">
                <span className="font-bold">{errorBanner.title}</span>
                <span className="min-w-0 flex-1 break-words">{errorBanner.text}</span>
                <button
                  type="button"
                  onClick={() => setErrorBanner(null)}
                  aria-label={t('banners.close')}
                  className="ml-auto shrink-0 rounded-md p-0.5 opacity-70 transition hover:opacity-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#4318FF]"
                >
                  <FiX className="h-4 w-4" />
                </button>
              </div>
            </div>
          )}

          <form onSubmit={handleSignIn} className="space-y-4">
            {/* Official Email */}
            <div>
              <div className="mb-1.5 flex items-center justify-between">
                <label
                  htmlFor="email"
                  className="text-xs font-semibold text-slate-700 dark:text-slate-200"
                >
                  {t('signIn.officialEmail')}
                </label>
                <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                  GOV.LK
                </span>
              </div>
              <div className="relative flex items-center">
                <FiMail className="absolute left-3.5 h-4 w-4 text-slate-400 pointer-events-none" />
                <input
                  id="email"
                  type="email"
                  required
                  autoComplete="username"
                  inputMode="email"
                  autoCapitalize="none"
                  spellCheck={false}
                  aria-describedby={errorBanner ? 'sign-in-error' : undefined}
                  placeholder={t('signIn.emailPlaceholder')}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full rounded-xl bg-[#f4f7fe] dark:bg-navy-900 py-3 pl-10 pr-4 text-sm text-slate-800 dark:text-white placeholder:text-slate-500 dark:placeholder:text-slate-400 border border-transparent focus:border-[#4318FF] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#4318FF]/40 transition duration-150"
                />
              </div>
            </div>

            {/* Password */}
            <div>
              <div className="mb-1.5 flex items-center justify-between">
                <label
                  htmlFor="password"
                  className="text-xs font-semibold text-slate-700 dark:text-slate-200"
                >
                  {t('signIn.password')}
                </label>
                <span className="rounded-full bg-cyan-50 px-2.5 py-0.5 text-[10px] font-semibold text-cyan-700 dark:bg-cyan-950/40 dark:text-cyan-300 border border-cyan-200/60 dark:border-cyan-800">
                  {t('signIn.encrypted')}
                </span>
              </div>
              <div className="relative flex items-center">
                <FiLock className="absolute left-3.5 h-4 w-4 text-slate-400 pointer-events-none" />
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  required
                  autoComplete="current-password"
                  aria-describedby={errorBanner ? 'sign-in-error' : undefined}
                  placeholder={t('signIn.passwordPlaceholder')}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full rounded-xl bg-[#f4f7fe] dark:bg-navy-900 py-3 pl-10 pr-10 text-sm text-slate-800 dark:text-white placeholder:text-slate-500 dark:placeholder:text-slate-400 border border-transparent focus:border-[#4318FF] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#4318FF]/40 transition duration-150"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  aria-pressed={showPassword}
                  className="absolute right-3 rounded-md p-1 text-slate-400 hover:text-slate-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#4318FF] dark:hover:text-slate-200"
                  aria-label={t('signIn.togglePassword')}
                >
                  {showPassword ? <FiEyeOff className="h-4 w-4" /> : <FiEye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            {/* Remember me & Forgot Password */}
            <div className="flex items-center justify-between pt-1">
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={rememberDevice}
                  onChange={(e) => setRememberDevice(e.target.checked)}
                  className="h-4 w-4 rounded border-slate-300 text-[#4318FF] focus:ring-[#4318FF]"
                />
                <span className="text-xs font-medium text-slate-600 dark:text-slate-300">
                  {t('signIn.rememberDevice')}
                </span>
              </label>

              <Link
                href="/auth/forgot-password"
                className="text-xs font-semibold text-[#4318FF] hover:underline dark:text-brand-400"
              >
                {t('signIn.forgotPassword')}
              </Link>
            </div>

            {/* Sign In Button */}
            <button
              type="submit"
              disabled={isLoading || lockoutActive}
              aria-busy={isLoading}
              className="mt-6 flex w-full items-center justify-center gap-2 rounded-xl bg-[#4318FF] py-3.5 text-sm font-semibold text-white shadow-lg shadow-indigo-600/25 transition duration-150 hover:bg-[#3411db] active:scale-[0.99] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#4318FF] focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-70"
            >
              {isLoading ? (
                <span>{t('signIn.submitting')}</span>
              ) : lockoutActive ? (
                <span className="px-1 text-center">
                  {lockout?.kind === 'permanent'
                    ? t('signIn.lockedPermanentRetry')
                    : t('signIn.lockedRetry', {
                        time: formatLockoutCountdown(lockoutRemaining),
                      })}
                </span>
              ) : (
                <>
                  <span>{t('signIn.submit')}</span>
                  <FiArrowRight className="h-4 w-4" />
                </>
              )}
            </button>
            <p role="status" aria-live="polite" className="sr-only">
              {isLoading ? t('signIn.signingInAria') : ''}
            </p>
          </form>

          {/* Registration link & Security badge */}
          <div className="mt-6 flex flex-col items-center text-center">
            <p className="text-xs text-slate-600 dark:text-slate-400">
              {t('signIn.newStaff')}{' '}
              <Link
                href="/auth/register?role=Staff"
                className="font-semibold text-[#4318FF] hover:underline dark:text-brand-400"
              >
                {t('signIn.registerHere')}
              </Link>
            </p>
            <p className="mt-1 text-xs text-slate-600 dark:text-slate-400">
              {t('signIn.needAdmin')}{' '}
              <Link
                href="/auth/register?role=Administrator"
                className="font-semibold text-[#4318FF] hover:underline dark:text-brand-400"
              >
                {t('signIn.adminRegistration')}
              </Link>
            </p>

            <div className="mt-4 flex items-center gap-1.5 rounded-full bg-slate-50 dark:bg-navy-900/60 px-3 py-1.5 text-[11px] font-medium text-slate-600 dark:text-slate-400 border border-slate-200/60 dark:border-navy-700">
              <FiShield className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
              <span>{t('signIn.secured')}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Brand Footer */}
      <AuthBrandFooter />
    </div>
  );
}

export default function SignInPage() {
  const { t } = useTranslation('auth');
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center">{t('signIn.loading')}</div>}>
      <SignInContent />
    </Suspense>
  );
}
