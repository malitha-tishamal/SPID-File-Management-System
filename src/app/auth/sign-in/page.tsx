'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { FiMail, FiLock, FiEye, FiEyeOff, FiArrowRight, FiShield } from 'react-icons/fi';
import { HiOutlineIdentification } from 'react-icons/hi';
import AuthBrandHeader from 'components/auth/AuthBrandHeader';
import AuthBrandFooter from 'components/auth/AuthBrandFooter';
import { loginUser } from 'utils/auth';

export default function SignInPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get('callbackUrl') || '/admin/default';

  const [email, setEmail] = useState('officer@spid.gov.lk');
  const [password, setPassword] = useState('spid@admin2026');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberDevice, setRememberDevice] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');

    if (!email.trim()) {
      setErrorMsg('Please enter your official email address.');
      return;
    }

    if (!password) {
      setErrorMsg('Please enter your password.');
      return;
    }

    setIsLoading(true);

    try {
      // Set persistent session (persists until explicit logout)
      loginUser(email, password, rememberDevice);

      // Force route navigation to admin default or callbackUrl
      window.location.href = callbackUrl;
    } catch (err: any) {
      setErrorMsg(err?.message || 'Authentication failed. Please verify credentials.');
      setIsLoading(false);
    }
  };

  return (
    <div className="w-full flex flex-col items-center">
      {/* Brand Header */}
      <AuthBrandHeader variant="sign-in" />

      {/* Main Sign-In Card */}
      <div className="relative w-full max-w-[460px] rounded-3xl bg-white p-8 sm:p-10 shadow-xl shadow-slate-200/60 dark:bg-navy-800 dark:shadow-navy-950 border border-slate-100 dark:border-navy-700">
        {/* Subtle decorative curved background effect */}
        <div className="pointer-events-none absolute -top-12 -right-12 h-44 w-44 rounded-full bg-slate-50/80 dark:bg-navy-700/20 -z-0" />

        <div className="relative z-10">
          {/* Card Header */}
          <div className="mb-6">
            <div className="flex items-center gap-2">
              <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-indigo-50 text-[#4318FF] dark:bg-navy-700">
                <HiOutlineIdentification className="h-5 w-5" />
              </span>
              <h2 className="text-xl font-bold tracking-tight text-slate-900 dark:text-white">
                Sign In
              </h2>
            </div>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              Enter your credentials to access the record room portal.
            </p>
          </div>

          {errorMsg && (
            <div className="mb-4 rounded-xl bg-red-50 p-3 text-xs font-medium text-red-600 dark:bg-red-900/30 dark:text-red-300 border border-red-200 dark:border-red-800">
              {errorMsg}
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
                  className="w-full rounded-xl bg-[#f4f7fe] dark:bg-navy-900 py-3 pl-10 pr-4 text-sm text-slate-800 dark:text-white placeholder-slate-400 border border-transparent focus:border-[#4318FF] focus:bg-white dark:focus:bg-navy-900 focus:outline-none transition duration-150"
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
                  className="w-full rounded-xl bg-[#f4f7fe] dark:bg-navy-900 py-3 pl-10 pr-10 text-sm text-slate-800 dark:text-white placeholder-slate-400 border border-transparent focus:border-[#4318FF] focus:bg-white dark:focus:bg-navy-900 focus:outline-none transition duration-150"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                >
                  {showPassword ? (
                    <FiEyeOff className="h-4 w-4" />
                  ) : (
                    <FiEye className="h-4 w-4" />
                  )}
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
              className="mt-6 flex w-full items-center justify-center gap-2 rounded-xl bg-[#4318FF] py-3.5 text-sm font-semibold text-white shadow-lg shadow-indigo-600/25 transition duration-150 hover:bg-[#3411db] active:scale-[0.99] disabled:opacity-70"
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
