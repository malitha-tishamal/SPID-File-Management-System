'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { FiMail, FiSend } from 'react-icons/fi';
import { RiRestartLine } from 'react-icons/ri';
import AuthBrandHeader from 'components/auth/AuthBrandHeader';
import AuthBrandFooter from 'components/auth/AuthBrandFooter';
import { useToast } from 'components/toast/ToastContext';

export default function ForgotPasswordPage() {
  const { showToast } = useToast();

  // Inputs empty by default so placeholders appear like watermarks
  const [email, setEmail] = useState('');
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const handleResetRequest = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');

    const cleanEmail = email.trim();

    if (!cleanEmail) {
      const msg = 'Please provide your registered official email.';
      setErrorMsg(msg);
      showToast({ type: 'error', title: 'Validation Error', message: msg });
      return;
    }

    setIsLoading(true);

    setTimeout(() => {
      setIsLoading(false);
      setIsSubmitted(true);

      showToast({
        type: 'success',
        title: 'Reset Link Dispatched',
        message: `A secure password reset link has been sent to ${cleanEmail}.`,
        duration: 6000,
      });
    }, 600);
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
              Forgot Your Password?
            </h2>
            <p className="mt-2 text-xs text-slate-500 dark:text-slate-400 px-2 sm:px-4 leading-relaxed">
              Enter your registered official email to receive password reset instructions.
            </p>
          </div>

          {errorMsg && (
            <div className="mb-4 rounded-xl bg-red-50 p-3 text-xs font-medium text-red-600 dark:bg-red-900/30 dark:text-red-300 border border-red-200 dark:border-red-800">
              {errorMsg}
            </div>
          )}

          {isSubmitted ? (
            <div className="space-y-5 text-center">
              <div className="rounded-2xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 p-4 text-left">
                <p className="text-xs font-bold text-emerald-800 dark:text-emerald-300">
                  Password Reset Link Dispatched!
                </p>
                <p className="mt-1.5 text-xs text-emerald-700 dark:text-emerald-400 leading-relaxed">
                  A secure password reset link has been dispatched to{' '}
                  <span className="font-semibold underline">{email}</span>. Please check your inbox and complete password reset within 15 minutes.
                </p>
              </div>

              <Link
                href="/auth/sign-in"
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#4318FF] py-3.5 text-sm font-semibold text-white shadow-lg shadow-indigo-600/25 transition duration-150 hover:bg-[#3411db] cursor-pointer"
              >
                ← Return to Sign In
              </Link>
            </div>
          ) : (
            <form onSubmit={handleResetRequest} className="space-y-4">
              {/* Official Email */}
              <div>
                <label
                  htmlFor="reset-email"
                  className="mb-1.5 block text-xs font-semibold text-slate-700 dark:text-slate-200"
                >
                  Official Email Address <span className="text-red-500">*</span>
                </label>
                <div className="relative flex items-center">
                  <FiMail className="absolute left-3.5 h-4 w-4 text-slate-400 pointer-events-none" />
                  <input
                    id="reset-email"
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="officer@spid.gov.lk"
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
                {isLoading ? (
                  <span>Sending Instructions...</span>
                ) : (
                  <>
                    <span>Send Reset Instructions</span>
                    <FiSend className="h-4 w-4" />
                  </>
                )}
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
          )}
        </div>
      </div>

      {/* Brand Footer */}
      <AuthBrandFooter />
    </div>
  );
}
