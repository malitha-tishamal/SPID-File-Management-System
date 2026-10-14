'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { FiLock, FiEye, FiEyeOff, FiCheckCircle } from 'react-icons/fi';
import { RiRestartLine } from 'react-icons/ri';
import AuthBrandHeader from 'components/auth/AuthBrandHeader';
import AuthBrandFooter from 'components/auth/AuthBrandFooter';
import { getSupabaseBrowserClient } from 'config/supabase/client';
import { useToast } from 'components/toast/ToastContext';
import { validatePasswordPair } from 'validators/authValidators';

type PageState = 'checking' | 'form' | 'invalid' | 'done';

export default function ResetPasswordPage() {
  const { showToast } = useToast();

  const [state, setState] = useState<PageState>('checking');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  // Verify the recovery session created by the reset link.
  useEffect(() => {
    let cancelled = false;
    getSupabaseBrowserClient()
      .auth.getUser()
      .then(({ data }) => {
        if (!cancelled) setState(data?.user ? 'form' : 'invalid');
      })
      .catch(() => {
        if (!cancelled) setState('invalid');
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const handleReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');

    const passwordError = validatePasswordPair(password, confirmPassword);
    if (passwordError) {
      setErrorMsg(passwordError);
      showToast({ type: 'error', title: 'Validation Error', message: passwordError });
      return;
    }

    setIsLoading(true);
    try {
      const res = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password, confirmPassword }),
      });
      const json = await res.json();

      if (!res.ok || !json.ok) {
        setIsLoading(false);
        const msg = json.message || 'Failed to update the password.';
        setErrorMsg(msg);
        showToast({
          type: 'error',
          title: 'Reset Failed',
          message: msg,
        });
        return;
      }

      setIsLoading(false);
      setState('done');
      showToast({ type: 'success', title: 'Password Updated', message: 'You can now sign in with your new password.' });
      setTimeout(() => {
        window.location.href = '/auth/sign-in';
      }, 1500);
    } catch {
      setIsLoading(false);
      const msg = 'Could not reach the password reset service. Please try again.';
      setErrorMsg(msg);
      showToast({ type: 'error', title: 'Reset Failed', message: msg });
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
              Set a New Password
            </h2>
            <p className="mt-2 text-xs text-slate-500 dark:text-slate-400 px-2 sm:px-4 leading-relaxed">
              Choose a strong new password for your SPID account.
            </p>
          </div>

          {state === 'checking' && (
            <p className="py-6 text-center text-xs text-slate-400">
              Verifying your reset link...
            </p>
          )}

          {state === 'invalid' && (
            <div className="space-y-5 text-center">
              <div className="rounded-xl bg-red-50 p-3 text-xs font-medium text-red-600 dark:bg-red-900/30 dark:text-red-300 border border-red-200 dark:border-red-800">
                This password reset link is invalid or has expired.
              </div>
              <Link
                href="/auth/forgot-password"
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#4318FF] py-3.5 text-sm font-semibold text-white shadow-lg shadow-indigo-600/25 transition duration-150 hover:bg-[#3411db] cursor-pointer"
              >
                Request a New Reset Link
              </Link>
            </div>
          )}

          {state === 'done' && (
            <div className="space-y-5 text-center">
              <div className="rounded-2xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 p-4 text-left">
                <div className="flex items-center gap-2">
                  <FiCheckCircle className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                  <p className="text-xs font-bold text-emerald-800 dark:text-emerald-300">
                    Password Updated Successfully!
                  </p>
                </div>
                <p className="mt-1.5 text-xs text-emerald-700 dark:text-emerald-400 leading-relaxed">
                  Redirecting you to the sign-in portal...
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
                    New Password <span className="text-red-500">*</span>
                  </label>
                  <div className="relative flex items-center">
                    <FiLock className="absolute left-3.5 h-4 w-4 text-slate-400 pointer-events-none" />
                    <input
                      id="reset-password"
                      type={showPassword ? 'text' : 'password'}
                      required
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="••••••••••••"
                      className="w-full rounded-xl bg-[#f4f7fe] dark:bg-navy-900 py-3 pl-10 pr-10 text-sm text-slate-800 dark:text-white placeholder:text-slate-400/90 dark:placeholder:text-slate-500 focus:placeholder-transparent border border-transparent focus:border-[#4318FF] focus:outline-none transition duration-150"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                      aria-label="Toggle password visibility"
                    >
                      {showPassword ? <FiEyeOff className="h-4 w-4" /> : <FiEye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>

                {/* Confirm Password */}
                <div>
                  <label
                    htmlFor="reset-confirm-password"
                    className="mb-1.5 block text-xs font-semibold text-slate-700 dark:text-slate-200"
                  >
                    Confirm New Password <span className="text-red-500">*</span>
                  </label>
                  <div className="relative flex items-center">
                    <FiLock className="absolute left-3.5 h-4 w-4 text-slate-400 pointer-events-none" />
                    <input
                      id="reset-confirm-password"
                      type={showPassword ? 'text' : 'password'}
                      required
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder="••••••••••••"
                      className="w-full rounded-xl bg-[#f4f7fe] dark:bg-navy-900 py-3 pl-10 pr-4 text-sm text-slate-800 dark:text-white placeholder:text-slate-400/90 dark:placeholder:text-slate-500 focus:placeholder-transparent border border-transparent focus:border-[#4318FF] focus:outline-none transition duration-150"
                    />
                  </div>
                </div>

                {/* Action Button */}
                <button
                  type="submit"
                  disabled={isLoading}
                  className="mt-6 flex w-full items-center justify-center gap-2 rounded-xl bg-[#4318FF] py-3.5 text-sm font-semibold text-white shadow-lg shadow-indigo-600/25 transition duration-150 hover:bg-[#3411db] active:scale-[0.99] disabled:opacity-70 cursor-pointer"
                >
                  {isLoading ? <span>Updating Password...</span> : <span>Update Password</span>}
                </button>

                {/* Back to Sign In Link */}
                <div className="pt-2 text-center">
                  <Link
                    href="/auth/sign-in"
                    className="inline-flex items-center justify-center text-xs font-semibold text-[#4318FF] hover:underline dark:text-brand-400"
                  >
                    ← Back to Sign In
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
