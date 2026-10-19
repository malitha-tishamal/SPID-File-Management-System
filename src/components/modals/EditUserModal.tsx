'use client';
import React, { useState, useMemo } from 'react';
import {
  FiX,
  FiUser,
  FiMail,
  FiPhone,
  FiShield,
  FiCheck,
  FiLock,
  FiCheckCircle,
} from 'react-icons/fi';
import { MdAdminPanelSettings, MdSave } from 'react-icons/md';
import type { AccountStatus, AdminUserRow, UserRole } from 'types/auth';
import type { SectionRow } from 'models/SectionRepository';

function statusBadgeClass(status: AccountStatus): string {
  if (status === 'approved') return 'bg-emerald-600 text-white shadow-sm';
  if (status === 'disabled') return 'bg-orange-500 text-white shadow-sm';
  if (status === 'pending')  return 'bg-amber-400 text-slate-900 shadow-sm';
  if (status === 'rejected') return 'bg-red-600 text-white shadow-sm';
  return 'bg-red-600 text-white shadow-sm';
}

function statusDotClass(status: AccountStatus): string {
  if (status === 'pending') return 'bg-slate-900';
  return 'bg-white';
}

function statusLabel(status: AccountStatus): string {
  if (status === 'approved') return 'Active Account';
  if (status === 'disabled') return 'Suspended';
  if (status === 'pending') return 'Pending Verification';
  if (status === 'rejected') return 'Rejected';
  return 'Locked';
}

export default function EditUserModal({
  user,
  variant,
  sections,
  saving,
  isSelf,
  isProtected,
  onClose,
  onSave,
}: {
  user: AdminUserRow;
  variant: 'admin' | 'staff';
  sections: SectionRow[];
  saving: boolean;
  isSelf: boolean;
  isProtected: boolean;
  onClose: () => void;
  onSave: (payload: {
    full_name: string;
    section_id: number | null;
    mobile_phone?: string;
    role?: UserRole;
    status?: AccountStatus;
  }) => void;
}) {
  const [fullName, setFullName] = useState(user.full_name);
  const [sectionId, setSectionId] = useState<number | null>(user.section_id);
  const [role, setRole] = useState<UserRole>(user.role);

  // Strip non-digits and leading 94 or 0
  const initialPhoneDigits = (user.mobile_phone || '')
    .replace(/\D/g, '')
    .replace(/^94/, '')
    .replace(/^0/, '');
  const [phoneDigits, setPhoneDigits] = useState(initialPhoneDigits);

  const formattedPhoneDisplay = useMemo(() => {
    if (!phoneDigits) return '';
    if (phoneDigits.length <= 2) return phoneDigits;
    if (phoneDigits.length <= 5) return `${phoneDigits.slice(0, 2)} ${phoneDigits.slice(2)}`;
    return `${phoneDigits.slice(0, 2)} ${phoneDigits.slice(2, 5)} ${phoneDigits.slice(5, 9)}`;
  }, [phoneDigits]);

  const handlePhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let raw = e.target.value.replace(/\D/g, '');
    if (raw.startsWith('94') && raw.length > 9) raw = raw.slice(2);
    if (raw.startsWith('0')) raw = raw.slice(1);
    if (raw.length > 9) raw = raw.slice(0, 9);
    setPhoneDigits(raw);
  };

  const canChangePrivileged = !isSelf && !isProtected;
  const isAdminVariant = variant === 'admin';
  const nameError = fullName.trim().length > 0 && fullName.trim().length < 3;
  const phoneError = phoneDigits.length > 0 && phoneDigits.length < 9;

  const handleSave = () => {
    const formattedPhone = phoneDigits
      ? `+94 ${phoneDigits.slice(0, 2)} ${phoneDigits.slice(2, 5)} ${phoneDigits.slice(5, 9)}`
      : '';
    const payload: {
      full_name: string;
      section_id: number | null;
      mobile_phone?: string;
      role?: UserRole;
    } = {
      full_name: fullName.trim(),
      section_id: sectionId,
      mobile_phone: formattedPhone,
    };
    if (canChangePrivileged && role !== user.role) payload.role = role;
    onSave(payload);
  };

  const inputBase =
    'h-11 w-full rounded-xl border border-slate-200/80 bg-white px-4 text-xs font-semibold text-navy-700 outline-none transition-all placeholder:text-gray-400 focus:border-[#4318FF] focus:ring-2 focus:ring-[#4318FF]/10 dark:border-navy-600 dark:bg-navy-900 dark:text-white';

  return (
    <div
      className="fixed inset-0 z-[95] flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-md animate-fadeIn"
      onClick={() => !saving && onClose()}
    >
      <div
        className="max-h-[92vh] w-full max-w-xl overflow-y-auto rounded-[24px] bg-white p-6 sm:p-7 shadow-2xl dark:bg-navy-700 border border-slate-100 dark:border-navy-600"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header (matching image 4) */}
        <div className="flex items-center justify-between pb-2">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-50 text-[#4318FF] dark:bg-navy-800 dark:text-brand-300">
              <MdAdminPanelSettings className="h-6 w-6" />
            </div>
            <h3 className="text-base font-bold text-navy-700 dark:text-white">
              {isAdminVariant ? 'Edit Admin Profile' : 'Edit Staff User Profile'}
            </h3>
          </div>
          <button
            onClick={onClose}
            disabled={saving}
            className="flex h-8 w-8 items-center justify-center rounded-full text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-navy-600"
            aria-label="Close"
          >
            <FiX className="h-4 w-4" />
          </button>
        </div>

        {/* Identity card (matching image 4) */}
        <div className="mt-4 flex items-center justify-between gap-3 rounded-2xl bg-gradient-to-r from-indigo-50/50 to-slate-50 p-4 dark:from-navy-800 dark:to-navy-900 border border-indigo-100/40 dark:border-navy-700">
          <div className="flex items-center gap-3 min-w-0">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-b from-[#4318FF] to-brand-500 text-sm font-bold text-white shadow-sm">
              {user.full_name.slice(0, 2).toUpperCase()}
            </div>
            <div className="min-w-0">
              <p className="truncate text-sm font-bold text-navy-700 dark:text-white">
                {user.full_name}
                {isProtected && (
                  <span className="ml-1.5 inline-flex items-center gap-0.5 rounded bg-purple-100 px-1 py-0.5 text-[8px] font-bold text-purple-600 dark:bg-purple-900/30 dark:text-purple-400">
                    <FiLock className="h-2.5 w-2.5" /> PROTECTED
                  </span>
                )}
              </p>
              <p className="truncate text-[11px] text-gray-500 dark:text-gray-400">{user.email}</p>
            </div>
          </div>
          <span className={`shrink-0 flex items-center gap-1.5 rounded-full px-3 py-1 text-[11px] font-bold ${statusBadgeClass(user.account_status)}`}>
            <span className={`h-1.5 w-1.5 rounded-full ${statusDotClass(user.account_status)}`} />
            {statusLabel(user.account_status)}
          </span>
        </div>

        {/* Form Fields (2 columns, matching image 4) */}
        <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
          {/* Full Name */}
          <div>
            <label className="mb-1.5 flex items-center gap-1.5 text-[11px] font-bold text-navy-700 dark:text-gray-300">
              <FiUser className="h-3.5 w-3.5 text-[#4318FF]" /> Full Name
            </label>
            <div className="relative">
              <input
                type="text"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                className={`${inputBase} pr-9 ${nameError ? 'border-red-400' : ''}`}
                placeholder="Enter full name"
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-emerald-500">
                <FiCheckCircle className="h-4 w-4" />
              </span>
            </div>
            {nameError && <p className="mt-1 text-[10px] text-red-500">Name must be at least 3 characters.</p>}
          </div>

          {/* Official Email */}
          <div>
            <label className="mb-1.5 flex items-center gap-1.5 text-[11px] font-bold text-navy-700 dark:text-gray-300">
              <FiMail className="h-3.5 w-3.5 text-[#4318FF]" />
              {isAdminVariant ? 'Official Government Email' : 'Official Staff Email'}
            </label>
            <div className="relative">
              <input
                type="email"
                value={user.email}
                disabled
                className={`${inputBase} pr-9 cursor-not-allowed bg-slate-50 text-gray-400 dark:bg-navy-950`}
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400">
                <FiMail className="h-4 w-4" />
              </span>
            </div>
          </div>

          {/* Mobile Phone Number */}
          <div>
            <label className="mb-1.5 flex items-center gap-1.5 text-[11px] font-bold text-navy-700 dark:text-gray-300">
              <FiPhone className="h-3.5 w-3.5 text-[#4318FF]" /> Mobile Phone Number
            </label>
            <div
              className={`flex items-center rounded-xl border ${
                phoneError ? 'border-red-400' : 'border-slate-200/80 dark:border-navy-600'
              } bg-white dark:bg-navy-900 overflow-hidden focus-within:border-[#4318FF] focus-within:ring-2 focus-within:ring-[#4318FF]/10 transition-all`}
            >
              <div className="flex items-center gap-1 bg-slate-100 dark:bg-navy-800 px-3 py-3 text-xs font-bold text-slate-700 dark:text-slate-200 border-r border-slate-200 dark:border-navy-700 select-none shrink-0">
                <span>🇱🇰</span>
                <span>+94</span>
              </div>
              <div className="relative flex w-full items-center">
                <input
                  type="tel"
                  value={formattedPhoneDisplay}
                  onChange={handlePhoneChange}
                  placeholder="77 123 4567"
                  maxLength={11}
                  className="h-11 w-full bg-transparent pl-3 pr-9 text-xs font-semibold text-navy-700 dark:text-white outline-none placeholder:text-gray-400"
                />
                <FiPhone className="absolute right-3.5 top-1/2 -translate-y-1/2 text-gray-400 h-4 w-4 pointer-events-none" />
              </div>
            </div>
            {phoneError && (
              <p className="mt-1 text-[10px] text-red-500">
                Please enter a valid 9-digit mobile number.
              </p>
            )}
          </div>

          {/* Departmental Allocation */}
          <div>
            <label className="mb-1.5 flex items-center gap-1.5 text-[11px] font-bold text-navy-700 dark:text-gray-300">
              <FiShield className="h-3.5 w-3.5 text-[#4318FF]" /> Departmental Allocation
            </label>
            <select
              value={sectionId ?? ''}
              onChange={(e) => setSectionId(e.target.value === '' ? null : Number(e.target.value))}
              className={`${inputBase} cursor-pointer`}
            >
              <option value="">— Select Department —</option>
              {sections.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>

          {/* Admin Security Role / Clearance */}
          <div className="sm:col-span-2">
            <label className="mb-1.5 flex items-center gap-1.5 text-[11px] font-bold text-navy-700 dark:text-gray-300">
              <FiShield className="h-3.5 w-3.5 text-[#4318FF]" />
              {isAdminVariant ? 'Admin Security Role / Clearance' : 'User Access Role & Permissions'}
            </label>
            <div className="relative">
              <select
                value={role}
                onChange={(e) => setRole(e.target.value as UserRole)}
                disabled={!canChangePrivileged}
                className={`${inputBase} pr-9 cursor-pointer disabled:cursor-not-allowed disabled:bg-slate-50`}
              >
                <option value="Administrator">Administrator (Super-Tier)</option>
                <option value="Staff">Staff Member (Operational)</option>
              </select>
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none">
                <FiShield className="h-3.5 w-3.5" />
              </span>
            </div>
            {!canChangePrivileged && (
              <p className="mt-1 text-[10px] text-gray-400">
                {isSelf
                  ? 'You cannot change your own role.'
                  : 'The primary administrator role is protected.'}
              </p>
            )}
          </div>
        </div>

        {/* Footer actions (matching image 4) */}
        <div className="mt-7 flex items-center justify-end gap-3 border-t border-gray-100 pt-4 dark:border-navy-600">
          <button
            onClick={onClose}
            disabled={saving}
            className="rounded-xl px-5 py-2.5 text-xs font-semibold text-gray-500 transition-colors hover:bg-slate-100 hover:text-gray-700 dark:text-gray-400 dark:hover:bg-navy-800 cursor-pointer"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving || fullName.trim().length < 3 || phoneError}
            className="flex items-center gap-2 rounded-xl bg-[#4318FF] px-6 py-2.5 text-xs font-bold text-white shadow-md shadow-indigo-500/25 transition-colors hover:bg-brand-600 disabled:opacity-60 cursor-pointer"
          >
            {saving ? (
              <>
                <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/40 border-t-white" />
                Saving...
              </>
            ) : (
              <>
                <MdSave className="h-4 w-4" />
                {isAdminVariant ? 'Save Admin Changes' : 'Save User Changes'}
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
