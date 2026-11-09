'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useTranslation } from 'react-i18next';
import { FiLock, FiEye, FiEyeOff, FiCheckCircle, FiAlertCircle } from 'react-icons/fi';
import { RiRestartLine } from 'react-icons/ri';
import AuthBrandHeader from 'components/auth/AuthBrandHeader';
import AuthBrandFooter from 'components/auth/AuthBrandFooter';
import { getSupabaseBrowserClient } from 'config/supabase/client';
import { useToast } from 'components/toast/ToastContext';
import {
  getPasswordStrength,
  validateStrongPasswordPair,
  PASSWORD_SPECIAL_CHARS,
} from 'validators/authValidators';
import { parseJwtPayload, isRecoverySession } from 'lib/session';
import { localiseMessage } from 'i18n/uiText';

type PageState = 'checking' | 'form' | 'invalid' | 'done';

interface RecoveryLinkSession {
  accessToken?: string;
  email: string;
}

const RESET_SCREEN = '/auth/reset-password';
const SESSION_POLL_ATTEMPTS = 24;
const SESSION_POLL_INTERVAL_MS = 250;
const EXPIRED_REASON = 'resetPassword.reasons.expired';
const COULD_NOT_VERIFY_REASON = 'resetPassword.reasons.couldNotVerify';
const SIGNED_IN_REASON = 'resetPassword.reasons.signedIn';
const CODE_UNUSABLE_REASON = 'resetPassword.reasons.codeUnusable';

const STRENGTH_KEY: Record<number, string> = {
  0: 'notEntered',
  1: 'weak',
  2: 'fair',
  3: 'good',
  4: 'strong',
};

export default function ResetPasswordPage() {
  const { showToast } = useToast();
  const { t } = useTranslation('auth');

  const [state, setState] = useState<PageState>('checking');
  const [invalidReason, setInvalidReason] = useState(EXPIRED_REASON);
  const [accountEmail, setAccountEmail] = useState('');
  const [recoverySession, setRecoverySession] = useState<RecoveryLinkSession | null>(null);
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const passwordStrength = useMemo(() => getPasswordStrength(password), [password]);

  const requirements = useMemo(
    () => [
      { key: 'atLeast8', met: password.length >= 8 },
      {
        key: 'upperLower',
        met: /[a-z]/.test(password) && /[A-Z]/.test(password),
      },
      { key: 'oneNumber', met: /\d/.test(password) },
      { key: 'oneSpecial', met: PASSWORD_SPECIAL_CHARS.test(password) },
    ],
    [password]
  );

  // Resolve the recovery session created by the reset link. Supabase may send
  // implicit tokens in the hash, a PKCE `?code`, or a `?token_hash`. The SSR
  // client is PKCE-only, so hash tokens are verified server-side.
  useEffect(() => {
    let cancelled = false;

    const acquireRecoverySession = async (): Promise<
      RecoveryLinkSession | { reason: string }
    > => {
      const search = new URLSearchParams(window.location.search);
      const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ''));

      // Supabase reports link failures in the fragment (implicit) or the query (PKCE).
      const linkError = [search, hashParams].some(
        (params) => params.get('error') || params.get('error_description') || params.get('error_code')
      );
      if (linkError) return { reason: EXPIRED_REASON };

      const hashToken = hashParams.get('access_token');
      const hashType = hashParams.get('type');
      if (hashToken) {
        if (hashType !== 'recovery' && !isRecoverySession(hashToken)) return { reason: SIGNED_IN_REASON };
        const payload = parseJwtPayload(hashToken);
        return { accessToken: hashToken, email: String(payload?.email ?? '') };
      }

      let supabase: ReturnType<typeof getSupabaseBrowserClient>;
      try {
        supabase = getSupabaseBrowserClient();
      } catch (err) {
        console.error('[reset-password] could not create Supabase client:', err);
        return { reason: COULD_NOT_VERIFY_REASON };
      }

      const tokenHash = search.get('token_hash');
      if (tokenHash) {
        if (search.get('type') !== 'recovery') return { reason: EXPIRED_REASON };
        const { data, error } = await supabase.auth.verifyOtp({
          type: 'recovery',
          token_hash: tokenHash,
        });
        if (error || !data.session) return { reason: EXPIRED_REASON };
        if (!isRecoverySession(data.session.access_token)) return { reason: SIGNED_IN_REASON };
        return { email: data.session.user?.email ?? '' };
      }

      const code = search.get('code');
      if (code) {
        // Ignore failures: the token may already have been exchanged on init.
        await supabase.auth.exchangeCodeForSession(code).catch(() => null);
      }

      for (let attempt = 0; attempt < SESSION_POLL_ATTEMPTS; attempt += 1) {
        if (cancelled) return { reason: EXPIRED_REASON };

        let session = null;
        try {
          const { data, error } = await supabase.auth.getSession();
          if (error) console.error('[reset-password] getSession error:', error);
          session = data.session;
        } catch (err) {
          console.error('[reset-password] getSession threw:', err);
        }

        if (session) {
          if (!isRecoverySession(session.access_token)) {
            // A stored normal session must not be mistaken for a usable link.
            return { reason: code ? CODE_UNUSABLE_REASON : SIGNED_IN_REASON };
          }
          return { email: session.user?.email ?? '' };
        }

        await new Promise((resolve) => setTimeout(resolve, SESSION_POLL_INTERVAL_MS));
      }

      return { reason: code ? CODE_UNUSABLE_REASON : EXPIRED_REASON };
    };

    acquireRecoverySession()
      .then((result) => {
        if (cancelled) return;
        if ('reason' in result) {
          setInvalidReason(result.reason);
          setState('invalid');
          return;
        }

        window.history.replaceState(null, '', RESET_SCREEN);
        setRecoverySession(result);
        setAccountEmail(result.email);
        setState('form');
      })
      .catch((err) => {
        console.error('[reset-password] recovery verification failed:', err);
        if (!cancelled) {
          setInvalidReason(COULD_NOT_VERIFY_REASON);
          setState('invalid');
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const handleReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');

    const passwordError = validateStrongPasswordPair(password, confirmPassword);
    if (passwordError) {
      const message = localiseMessage(passwordError);
      setErrorMsg(message);
      showToast({
        type: 'error',
        title:
          password.length > 0 && passwordStrength.score < 4
            ? t('resetPassword.weakPasswordTitle')
            : t('resetPassword.validationTitle'),
        message,
      });
      return;
    }

    setIsLoading(true);
    try {
      const res = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          password,
          confirmPassword,
          accessToken: recoverySession?.accessToken,
        }),
      });
      const json = await res.json();

      if (!res.ok || !json.ok) {
        setIsLoading(false);
        const msg = localiseMessage(json.message || t('resetPassword.updateFailed'));
        setErrorMsg(msg);
        showToast({
          type: 'error',
          title: t('resetPassword.notUpdatedTitle'),
          message: msg,
          duration: 6000,
        });
        return;
      }

      setIsLoading(false);
      setState('done');
      showToast({
        type: 'success',
        title: t('resetPassword.updatedTitle'),
        message: t('resetPassword.updatedMessage'),
        duration: 5000,
      });

      // Clear the recovery session so the sign-in page is not skipped by the
      // middleware's "already signed in" redirect.
      await Promise.allSettled([
        Promise.resolve().then(() => getSupabaseBrowserClient().auth.signOut()),
        fetch('/api/auth/logout', { method: 'POST' }),
      ]);

      setTimeout(() => {
        window.location.replace('/auth/sign-in?reset=success');
      }, 1500);
    } catch {
      setIsLoading(false);
      const msg = t('resetPassword.unreachable');
      setErrorMsg(msg);
      showToast({ type: 'error', title: t('resetPassword.notUpdatedTitle'), message: msg });
    }
  };

  return (
    <div className="w-full flex flex-col items-center px-4 sm:px-6">
      {/* Brand Header */}
      <AuthBrandHeader variant="forgot-password" />

      {/* Main Card */}
      <div className="relative w-full max-w-[460px] rounded-3xl bg-white p-6 sm:p-10 shadow-xl shadow-slate-200/60 dark:bg-navy-800 dark:shadow-navy-950 border border-slate-100 dark:border-navy-700">
        <div className="relative z-10">
          {/* Circular Reset Icon */}
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-sky-100 text-sky-600 dark:bg-sky-950/50 dark:text-sky-300 shadow-sm">
            <RiRestartLine className="h-6 w-6" />
          </div>

          {/* Heading */}
          <div className="text-center mb-6">
            <h2 className="text-xl font-bold tracking-tight text-slate-900 dark:text-white">
              {t('resetPassword.title')}
            </h2>
            <p className="mt-2 text-xs text-slate-500 dark:text-slate-400 px-2 sm:px-4 leading-relaxed">
              {state === 'form' && accountEmail
                ? t('resetPassword.subtitleFor', { email: accountEmail })
                : t('resetPassword.subtitle')}
            </p>
          </div>

          {state === 'checking' && (
            <p className="py-6 text-center text-xs text-slate-400">
              {t('resetPassword.checking')}
            </p>
          )}

          {state === 'invalid' && (
            <div className="space-y-5 text-center">
              <div className="rounded-xl bg-red-50 p-3 text-xs font-medium text-red-600 dark:bg-red-900/30 dark:text-red-300 border border-red-200 dark:border-red-800">
                {t(invalidReason)}
              </div>
              <Link
                href="/auth/forgot-password"
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#4318FF] py-3.5 text-sm font-semibold text-white shadow-lg shadow-indigo-600/25 transition duration-150 hover:bg-[#3411db] cursor-pointer"
              >
                {t('resetPassword.requestNewLink')}
              </Link>
            </div>
          )}

          {state === 'done' && (
            <div className="space-y-5 text-center">
              <div className="rounded-2xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 p-4 text-left">
                <div className="flex items-center gap-2">
                  <FiCheckCircle className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                  <p className="text-xs font-bold text-emerald-800 dark:text-emerald-300">
                    {t('resetPassword.doneTitle')}
                  </p>
                </div>
                <p className="mt-1.5 text-xs text-emerald-700 dark:text-emerald-400 leading-relaxed">
                  {t('resetPassword.redirecting')}
                </p>
              </div>
            </div>
          )}

          {state === 'form' && (
            <>
              {errorMsg && (
                <div className="mb-4 rounded-xl bg-red-50 p-3 text-xs font-medium text-red-600 dark:bg-red-900/30 dark:text-red-300 border border-red-200 dark:border-red-800">
                  {errorMsg}
                </div>
              )}

              <form onSubmit={handleReset} className="space-y-4">
                {/* New Password */}
                <div>
                  <label
                    htmlFor="reset-password"
                    className="mb-1.5 block text-xs font-semibold text-slate-700 dark:text-slate-200"
                  >
                    {t('resetPassword.newPassword')} <span className="text-red-500">*</span>
                  </label>
                  <div className="relative flex items-center">
                    <FiLock className="absolute left-3.5 h-4 w-4 text-slate-400 pointer-events-none" />
                    <input
                      id="reset-password"
                      type={showPassword ? 'text' : 'password'}
                      required
                      autoComplete="new-password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="••••••••••••"
                      className="w-full rounded-xl bg-[#f4f7fe] dark:bg-navy-900 py-3 pl-10 pr-10 text-sm text-slate-800 dark:text-white placeholder:text-slate-400/90 dark:placeholder:text-slate-500 focus:placeholder-transparent border border-transparent focus:border-[#4318FF] focus:outline-none transition duration-150"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                      aria-label={t('resetPassword.togglePassword')}
                    >
                      {showPassword ? <FiEyeOff className="h-4 w-4" /> : <FiEye className="h-4 w-4" />}
                    </button>
                  </div>

                  {/* Password Strength Colored Progress Bar */}
                  {password && (
                    <div className="mt-2 space-y-1.5">
                      <div className="h-1.5 w-full bg-slate-200 dark:bg-navy-700 rounded-full overflow-hidden">
                        <div
                          className={`h-full transition-all duration-300 ${passwordStrength.color}`}
                          style={{ width: passwordStrength.width }}
                        />
                      </div>
                      <div className="flex items-center justify-between text-[10px]">
                        <span className={`font-semibold ${passwordStrength.text}`}>
                          {t(`passwordStrength.${STRENGTH_KEY[passwordStrength.score]}`)}
                        </span>
                        <span className="text-slate-400">{t('register.archivalStandard')}</span>
                      </div>
                      <ul className="grid grid-cols-1 gap-1 pt-0.5">
                        {requirements.map((requirement) => (
                          <li
                            key={requirement.key}
                            className={`flex items-center gap-1.5 text-[10px] ${
                              requirement.met
                                ? 'text-emerald-600 dark:text-emerald-400 font-medium'
                                : 'text-slate-400 dark:text-slate-500'
                            }`}
                          >
                            {requirement.met ? (
                              <FiCheckCircle className="h-3 w-3 shrink-0" />
                            ) : (
                              <FiAlertCircle className="h-3 w-3 shrink-0" />
                            )}
                            <span>{t(`resetPassword.requirements.${requirement.key}`)}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>

                {/* Confirm Password */}
                <div>
                  <label
                    htmlFor="reset-confirm-password"
                    className="mb-1.5 block text-xs font-semibold text-slate-700 dark:text-slate-200"
                  >
                    {t('resetPassword.confirmNewPassword')} <span className="text-red-500">*</span>
                  </label>
                  <div className="relative flex items-center">
                    <FiLock className="absolute left-3.5 h-4 w-4 text-slate-400 pointer-events-none" />
                    <input
                      id="reset-confirm-password"
                      type={showConfirmPassword ? 'text' : 'password'}
                      required
                      autoComplete="new-password"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder="••••••••••••"
                      className="w-full rounded-xl bg-[#f4f7fe] dark:bg-navy-900 py-3 pl-10 pr-10 text-sm text-slate-800 dark:text-white placeholder:text-slate-400/90 dark:placeholder:text-slate-500 focus:placeholder-transparent border border-transparent focus:border-[#4318FF] focus:outline-none transition duration-150"
                    />
                    <button
                      type="button"
                      onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                      className="absolute right-3 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                      aria-label={t('resetPassword.toggleConfirmPassword')}
                    >
                      {showConfirmPassword ? <FiEyeOff className="h-4 w-4" /> : <FiEye className="h-4 w-4" />}
                    </button>
                  </div>
                  {confirmPassword && password !== confirmPassword && (
                    <p className="mt-1 text-[11px] text-red-500 flex items-center gap-1">
                      <FiAlertCircle className="h-3 w-3" />
                      {t('resetPassword.passwordsDoNotMatch')}
                    </p>
                  )}
                </div>

                {/* Action Button */}
                <button
                  type="submit"
                  disabled={isLoading}
                  className="mt-6 flex w-full items-center justify-center gap-2 rounded-xl bg-[#4318FF] py-3.5 text-sm font-semibold text-white shadow-lg shadow-indigo-600/25 transition duration-150 hover:bg-[#3411db] active:scale-[0.99] disabled:opacity-70 cursor-pointer"
                >
                  {isLoading ? <span>{t('resetPassword.updating')}</span> : <span>{t('resetPassword.update')}</span>}
                </button>

                {/* Back to Sign In Link */}
                <div className="pt-2 text-center">
                  <Link
                    href="/auth/sign-in"
                    className="inline-flex items-center justify-center text-xs font-semibold text-[#4318FF] hover:underline dark:text-brand-400"
                  >
                    ← {t('resetPassword.backToSignIn')}
                  </Link>
                </div>
              </form>
            </>
          )}
        </div>
      </div>

      {/* Brand Footer */}
      <AuthBrandFooter />
    </div>
  );
}
