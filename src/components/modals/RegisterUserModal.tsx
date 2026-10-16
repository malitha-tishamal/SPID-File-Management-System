'use client';
import React, { useState } from 'react';
import {
  FiX,
  FiUser,
  FiMail,
  FiLock,
  FiShield,
  FiPhone,
  FiUserPlus,
  FiEye,
  FiEyeOff,
  FiAlertCircle,
} from 'react-icons/fi';
import { MdAdminPanelSettings } from 'react-icons/md';
import type { UserRole } from 'types/auth';
import type { SectionRow } from 'models/SectionRepository';

export default function RegisterUserModal({
  variant,
  sections,
  onClose,
  onSuccess,
}: {
  variant: 'admin' | 'staff';
  sections: SectionRow[];
  onClose: () => void;
  onSuccess: (message: string) => void;
}) {
  const defaultRole: UserRole = variant === 'admin' ? 'Administrator' : 'Staff';

  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [role, setRole] = useState<UserRole>(defaultRole);
  const [sectionId, setSectionId] = useState<number | ''>(sections[0]?.id ?? '');
  const [mobilePhone, setMobilePhone] = useState('');

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!fullName.trim() || fullName.trim().length < 3) {
      setError('Full legal name must be at least 3 characters.');
      return;
    }
    if (!email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setError('Please provide a valid official email address.');
      return;
    }
    if (!password || password.length < 8) {
      setError('Password must be at least 8 characters long.');
      return;
    }

    setLoading(true);
    try {
      const res = await fetch('/api/admin/users/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          full_name: fullName.trim(),
          email: email.trim().toLowerCase(),
          password,
          role,
          section_id: sectionId === '' ? null : Number(sectionId),
          mobile_phone: mobilePhone.trim() || null,
        }),
      });

      const json = await res.json().catch(() => null);
      if (res.ok && json?.ok) {
        onSuccess(json?.data?.message || `${fullName} has been successfully registered.`);
        onClose();
      } else {
        setError(json?.message || 'Failed to create user account. Please check the details and try again.');
      }
    } catch {
      setError('Could not connect to the server. Please check your internet connection.');
    } finally {
      setLoading(false);
    }
  };

  const inputBase =
    'h-11 w-full rounded-xl border border-slate-200 bg-[#f4f7fe] px-3.5 text-xs font-bold text-slate-900 outline-none transition-all focus:border-[#4318FF] focus:bg-white focus:ring-2 focus:ring-[#4318FF]/20 dark:border-navy-600 dark:bg-navy-800 dark:text-white dark:focus:border-brand-400';

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-md animate-fadeIn"
      onClick={() => !loading && onClose()}
    >
      <div
        className="relative w-full max-w-lg overflow-hidden rounded-[28px] bg-white p-6 sm:p-7 shadow-2xl dark:bg-navy-700 border border-slate-100 dark:border-navy-600 max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between border-b border-gray-100 pb-4 dark:border-navy-600">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-b from-[#4318FF] to-brand-500 text-white shadow-md shadow-brand-500/25">
              <FiUserPlus className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-base font-extrabold text-slate-950 dark:text-white">
                {variant === 'admin' ? 'Register New Administrator' : 'Register New User / Staff'}
              </h3>
              <p className="text-[11px] font-semibold text-slate-500 dark:text-gray-400">
                {variant === 'admin'
                  ? 'Provision a verified administrator account with direct clearance without email verification.'
                  : 'Provision a verified account with direct system authorization.'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            className="flex h-8 w-8 items-center justify-center rounded-full text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-navy-600 cursor-pointer disabled:opacity-50"
            aria-label="Close"
          >
            <FiX className="h-4 w-4" />
          </button>
        </div>

        {/* Error notification banner */}
        {error && (
          <div className="mt-4 flex items-start gap-2.5 rounded-xl border border-red-200 bg-red-50 p-3 text-red-700 dark:border-red-800 dark:bg-red-900/30 dark:text-red-300">
            <FiAlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
            <p className="text-xs font-semibold leading-relaxed">{error}</p>
          </div>
        )}

        <form onSubmit={handleSubmit} aria-label="Add Admin Form" data-testid="add-admin-form" className="mt-4 space-y-4">
          {/* Full Name */}
          <div>
            <label className="mb-1.5 flex items-center gap-1.5 text-xs font-extrabold text-slate-800 dark:text-gray-200">
              <FiUser className="h-3.5 w-3.5 text-[#4318FF]" /> Full Legal Name *
            </label>
            <input
              type="text"
              required
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              className={inputBase}
              placeholder="e.g. Sunil Wickramasinghe"
              disabled={loading}
            />
          </div>

          {/* Email Address */}
          <div>
            <label className="mb-1.5 flex items-center gap-1.5 text-xs font-extrabold text-slate-800 dark:text-gray-200">
              <FiMail className="h-3.5 w-3.5 text-[#4318FF]" /> Official Work Email *
            </label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={inputBase}
              placeholder="e.g. officer@spid.gov.lk"
              disabled={loading}
            />
          </div>

          {/* Initial Password */}
          <div>
            <label className="mb-1.5 flex items-center gap-1.5 text-xs font-extrabold text-slate-800 dark:text-gray-200">
              <FiLock className="h-3.5 w-3.5 text-[#4318FF]" /> Initial Password (min. 8 characters) *
            </label>
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                required
                minLength={8}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className={`${inputBase} pr-10`}
                placeholder="Set secure password"
                disabled={loading}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                tabIndex={-1}
              >
                {showPassword ? <FiEyeOff className="h-4 w-4" /> : <FiEye className="h-4 w-4" />}
              </button>
            </div>
          </div>

          {/* Grid row: Role & Section */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {/* System Role */}
            <div>
              <label className="mb-1.5 flex items-center gap-1.5 text-xs font-extrabold text-slate-800 dark:text-gray-200">
                <MdAdminPanelSettings className="h-3.5 w-3.5 text-[#4318FF]" /> System Role *
              </label>
              {variant === 'admin' ? (
                <div className="flex h-11 w-full items-center rounded-xl border border-slate-200 bg-slate-50 px-3.5 text-xs font-bold text-slate-900 dark:border-navy-600 dark:bg-navy-800 dark:text-white select-none">
                  <span className="flex items-center gap-1.5 text-[#4318FF] dark:text-brand-300">
                    <MdAdminPanelSettings className="h-4 w-4" />
                    Administrator (Super-Tier)
                  </span>
                </div>
              ) : (
                <select
                  value={role}
                  onChange={(e) => setRole(e.target.value as UserRole)}
                  className={`${inputBase} cursor-pointer`}
                  disabled={loading}
                >
                  <option value="Staff">Staff Member (Operational)</option>
                  <option value="Administrator">Administrator (Super-Tier)</option>
                </select>
              )}
            </div>

            {/* Department / Division */}
            <div>
              <label className="mb-1.5 flex items-center gap-1.5 text-xs font-extrabold text-slate-800 dark:text-gray-200">
                <FiShield className="h-3.5 w-3.5 text-[#4318FF]" /> Department Division
              </label>
              <select
                value={sectionId}
                onChange={(e) => setSectionId(e.target.value === '' ? '' : Number(e.target.value))}
                className={`${inputBase} cursor-pointer`}
                disabled={loading}
              >
                <option value="">Select Department...</option>
                {sections.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Contact Mobile */}
          <div>
            <label className="mb-1.5 flex items-center gap-1.5 text-xs font-extrabold text-slate-800 dark:text-gray-200">
              <FiPhone className="h-3.5 w-3.5 text-[#4318FF]" /> Mobile Contact (Optional)
            </label>
            <input
              type="text"
              value={mobilePhone}
              onChange={(e) => setMobilePhone(e.target.value)}
              className={inputBase}
              placeholder="e.g. +94 77 987 6543"
              disabled={loading}
            />
          </div>

          {/* Actions */}
          <div className="mt-6 flex items-center justify-end gap-3 pt-3 border-t border-gray-100 dark:border-navy-600">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="rounded-xl border border-slate-200 px-4 py-2.5 text-xs font-bold text-slate-700 transition-colors hover:bg-slate-100 dark:border-navy-600 dark:text-gray-300 dark:hover:bg-navy-800 cursor-pointer disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex items-center gap-2 rounded-xl bg-[#4318FF] px-5 py-2.5 text-xs font-bold text-white shadow-md shadow-[#4318FF]/25 transition-all hover:bg-brand-600 active:scale-95 disabled:opacity-60 cursor-pointer"
            >
              {loading ? (
                <>
                  <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white border-t-transparent" />
                  Creating Account...
                </>
              ) : (
                <>
                  <FiUserPlus className="h-4 w-4" />
                  {variant === 'admin' ? 'Register & Activate Administrator' : 'Register & Activate'}
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
