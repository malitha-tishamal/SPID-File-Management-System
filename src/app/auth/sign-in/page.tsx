'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { FiMail, FiLock, FiEye, FiEyeOff, FiArrowRight, FiShield } from 'react-icons/fi';
import { HiOutlineIdentification } from 'react-icons/hi';
import AuthBrandHeader from 'components/auth/AuthBrandHeader';
import AuthBrandFooter from 'components/auth/AuthBrandFooter';
import { loginUser, AuthError } from 'utils/auth';
import { useToast } from 'components/toast/ToastContext';

export default function SignInPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get('callbackUrl') || '/admin/default';
  const { showToast } = useToast();

  // Inputs are empty by default so placeholders appear like watermarks
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberDevice, setRememberDevice] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const [errorBanner, setErrorBanner] = useState<{ type: 'error' | 'warning'; text: string } | null>(null);

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorBanner(null);

    const inputEmail = email.trim();
    if (!inputEmail) {
      const msg = 'Please enter your official email address.';
      setErrorBanner({ type: 'error', text: msg });
      showToast({ type: 'error', title: 'Validation Error', message: msg });
      return;
    }

    if (!password) {
      const msg = 'Please enter your password.';
      setErrorBanner({ type: 'error', text: msg });
      showToast({ type: 'error', title: 'Validation Error', message: msg });
      return;
    }

    setIsLoading(true);

    try {
      const session = loginUser(inputEmail, password, rememberDevice);

      showToast({
        type: 'success',
        title: 'Authentication Successful',
        message: `Welcome, ${session.name} (${session.role}). Loading portal...`,
      });

      // Redirect to dashboard after brief delay for toast visibility
      setTimeout(() => {
        window.location.href = callbackUrl;
      }, 500);
    } catch (err: any) {
      setIsLoading(false);
      if (err instanceof AuthError && err.code === 'ACCOUNT_PENDING') {
        const msg = err.message;
        setErrorBanner({ type: 'warning', text: msg });
        showToast({
          type: 'warning',
          title: 'Account Status: PENDING',
          message: msg,
          duration: 6000,
        });
      } else {
        const msg = err?.message || 'Authentication failed. Please verify credentials.';
        setErrorBanner({ type: 'error', text: msg });
        showToast({
          type: 'error',
          title: 'Sign In Failed',
          message: msg,
        });
      }
    }
  };

  // Quick fill helper for testing
  const handleQuickFillDemo = () => {
    setEmail('officer@spid.gov.lk');
    setPassword('spid@admin2026');
    setErrorBanner(null);
    showToast({
      type: 'info',
      title: 'Demo Credentials Loaded',
      message: 'Officer Administrator credentials prefilled for testing.',
      duration: 3000,
    });
  };

  return (
    <div className="w-full flex flex-col items-center px-4 sm:px-6">
      {/* Brand Header */}
      <AuthBrandHeader variant="sign-in" />

      {/* Main Sign-In Card */}
      <div className="relative w-full max-w-[460px] rounded-3xl bg-white p-6 sm:p-10 shadow-xl shadow-slate-200/60 dark:bg-navy-800 dark:shadow-navy-950 border border-slate-100 dark:border-navy-700">
        {/* Subtle decorative curved background effect */}
        <div className="pointer-events-none absolute -top-12 -right-12 h-44 w-44 rounded-full bg-slate-50/80 dark:bg-navy-700/20 -z-0" />

        <div className="relative z-10">
          {/* Card Header */}
          <div className="mb-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-indigo-50 text-[#4318FF] dark:bg-navy-700">
                  <HiOutlineIdentification className="h-5 w-5" />
                </span>
                <h2 className="text-xl font-bold tracking-tight text-slate-900 dark:text-white">
                  Sign In
                </h2>
              </div>

              {/* Demo auto-fill chip */}
              <button
                type="button"
                onClick={handleQuickFillDemo}
                className="text-[10px] font-semibold text-[#4318FF] dark:text-brand-400 bg-indigo-50/70 dark:bg-navy-700/60 hover:bg-indigo-100 px-2.5 py-1 rounded-full transition"
                title="Click to fill official demo credentials"
              >
                Auto-fill Demo
              </button>
            </div>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              Enter your credentials to access the record room portal.
            </p>
          </div>

          {/* Inline alert banner if error occurs */}
          {errorBanner && (
            <div
              className={`mb-4 rounded-xl p-3 text-xs font-medium border ${
                errorBanner.type === 'warning'
                  ? 'bg-amber-50 text-amber-800 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800'
                  : 'bg-red-50 text-red-600 border-red-200 dark:bg-red-900/30 dark:text-red-300 dark:border-red-800'
              }`}
            >
              <div className="flex items-start gap-2">
                <span className="font-bold">
                  {errorBanner.type === 'warning' ? '⚠️ PENDING APPROVAL:' : '✕ ERROR:'}
                </span>
                <span>{errorBanner.text}</span>
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
                  Official Email Address
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
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="officer@spid.gov.lk"
                  className="w-full rounded-xl bg-[#f4f7fe] dark:bg-navy-900 py-3 pl-10 pr-4 text-sm text-slate-800 dark:text-white placeholder:text-slate-400/90 focus:placeholder-transparent border border-transparent focus:border-[#4318FF] focus:bg-white dark:focus:bg-navy-900 focus:outline-none transition duration-150"
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
                  Password
                </label>
                <span className="rounded-full bg-cyan-50 px-2.5 py-0.5 text-[10px] font-semibold text-cyan-700 dark:bg-cyan-950/40 dark:text-cyan-300 border border-cyan-200/60 dark:border-cyan-800">
                  Encrypted
                </span>
              </div>
              <div className="relative flex items-center">
                <FiLock className="absolute left-3.5 h-4 w-4 text-slate-400 pointer-events-none" />
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••••••"
                  className="w-full rounded-xl bg-[#f4f7fe] dark:bg-navy-900 py-3 pl-10 pr-10 text-sm text-slate-800 dark:text-white placeholder:text-slate-400/90 focus:placeholder-transparent border border-transparent focus:border-[#4318FF] focus:bg-white dark:focus:bg-navy-900 focus:outline-none transition duration-150"
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
                  Remember this device
                </span>
              </label>

              <Link
                href="/auth/forgot-password"
                className="text-xs font-semibold text-[#4318FF] hover:underline dark:text-brand-400"
              >
                Forgot Password?
              </Link>
            </div>

            {/* Sign In Button */}
            <button
              type="submit"
              disabled={isLoading}
              className="mt-6 flex w-full items-center justify-center gap-2 rounded-xl bg-[#4318FF] py-3.5 text-sm font-semibold text-white shadow-lg shadow-indigo-600/25 transition duration-150 hover:bg-[#3411db] active:scale-[0.99] disabled:opacity-70 cursor-pointer"
            >
              {isLoading ? (
                <span>Authenticating...</span>
              ) : (
                <>
                  <span>Sign In to Portal</span>
                  <FiArrowRight className="h-4 w-4" />
                </>
              )}
            </button>
          </form>

          {/* Registration link & Security badge */}
          <div className="mt-6 flex flex-col items-center text-center">
            <p className="text-xs text-slate-600 dark:text-slate-400">
              New staff member?{' '}
              <Link
                href="/auth/register"
                className="font-semibold text-[#4318FF] hover:underline dark:text-brand-400"
              >
                Register here
              </Link>
            </p>

            <div className="mt-4 flex items-center gap-1.5 rounded-full bg-slate-50 dark:bg-navy-900/60 px-3 py-1.5 text-[11px] font-medium text-slate-600 dark:text-slate-400 border border-slate-200/60 dark:border-navy-700">
              <FiShield className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
              <span>Official Government Record Portal • 256-Bit SSL Secured</span>
            </div>
          </div>
        </div>
      </div>

      {/* Brand Footer */}
      <AuthBrandFooter />
    </div>
  );
}
