'use client';
import React, { useState } from 'react';
import {
  FiEdit2,
  FiX,
  FiUser,
  FiMail,
  FiGrid,
  FiShield,
  FiCheck,
  FiLock,
} from 'react-icons/fi';
import type { AccountStatus, AdminUserRow, UserRole } from 'types/auth';
import type { SectionRow } from 'models/SectionRepository';

type StatusOption = { value: AccountStatus; label: string };

const STATUS_OPTIONS: StatusOption[] = [
  { value: 'approved', label: 'Active' },
  { value: 'disabled', label: 'Suspended' },
  { value: 'pending', label: 'Pending Verification' },
];

function statusLabel(status: AccountStatus): string {
  if (status === 'approved') return 'Active Account';
  if (status === 'disabled') return 'Suspended';
  if (status === 'pending') return 'Pending Verification';
  if (status === 'rejected') return 'Rejected';
  return 'Locked';
}

/**
 * Reusable profile editor for both directories.
 * variant 'admin' renders the Admin Management wording, 'staff' the User
 * Management wording. Role/status are disabled for self and protected admin.
 */
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
    role?: UserRole;
    status?: AccountStatus;
  }) => void;
}) {
  const [fullName, setFullName] = useState(user.full_name);
  const [sectionId, setSectionId] = useState<number | null>(user.section_id);
  const [role, setRole] = useState<UserRole>(user.role);
  const [status, setStatus] = useState<AccountStatus | null>(
    user.account_status === 'approved' || user.account_status === 'disabled' || user.account_status === 'pending'
      ? user.account_status
      : null
  );

  const canChangePrivileged = !isSelf && !isProtected;
  const isAdminVariant = variant === 'admin';
  const nameError = fullName.trim().length > 0 && fullName.trim().length < 3;

  const handleSave = () => {
    const payload: {
      full_name: string;
      section_id: number | null;
      role?: UserRole;
      status?: AccountStatus;
    } = { full_name: fullName.trim(), section_id: sectionId };
    if (canChangePrivileged && role !== user.role) payload.role = role;
    if (canChangePrivileged && status !== null && status !== user.account_status) payload.status = status;
    onSave(payload);
  };

  const inputBase =
    'h-10 w-full rounded-xl border bg-[#f4f7fe] pl-9 pr-3 text-xs font-medium text-navy-700 outline-none transition-colors placeholder:text-gray-400 focus:border-[#4318FF] dark:bg-navy-900 dark:text-white';

  return (
    <div
      className="fixed inset-0 z-[95] flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-md"
      onClick={() => !saving && onClose()}
    >
      <div
        className="max-h-[92vh] w-full max-w-xl overflow-y-auto rounded-[24px] bg-white p-6 shadow-2xl dark:bg-navy-700"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-b from-[#4318FF] to-brand-500 text-white shadow-md">
              <FiEdit2 className="h-5 w-5" />
            </div>
            <h3 className="text-lg font-bold text-navy-700 dark:text-white">
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

        {/* Identity */}
        <div className="mt-5 flex items-center justify-between gap-3 rounded-2xl bg-[#f4f7fe] p-3.5 dark:bg-navy-900">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-b from-[#4318FF] to-brand-500 text-sm font-bold text-white">
              {user.full_name.slice(0, 2).toUpperCase()}
            </div>
            <div>
              <p className="text-sm font-bold text-navy-700 dark:text-white">
                {user.full_name}
                {isProtected && (
                  <span className="ml-1.5 inline-flex items-center gap-0.5 rounded bg-purple-100 px-1 py-0.5 text-[9px] font-bold text-purple-600 dark:bg-purple-900/30 dark:text-purple-400">
                    <FiLock className="h-2.5 w-2.5" /> PROTECTED
                  </span>
                )}
              </p>
              <p className="text-[11px] text-gray-500 dark:text-gray-400">{user.email}</p>
            </div>
          </div>
          <span className="shrink-0 rounded-full bg-emerald-50 px-2.5 py-1 text-[10px] font-bold text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400">
            {statusLabel(user.account_status)}
          </span>
        </div>

        {/* Form */}
        <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1.5 flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">
              <FiUser className="h-3 w-3" /> Full Name
            </label>
            <div className="relative">
              <FiUser className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                className={`${inputBase} ${nameError ? 'border-red-400' : 'border-transparent'}`}
              />
            </div>
            {nameError && <p className="mt-1 text-[10px] text-red-500">Name must be at least 3 characters.</p>}
          </div>

          <div>
            <label className="mb-1.5 flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">
              <FiMail className="h-3 w-3" />
              {isAdminVariant ? 'Official Government Email' : 'Official Staff Email'}
            </label>
            <div className="relative" title="Email changes require re-verification and are managed by Supabase Auth — contact the system owner.">
              <FiMail className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" />
              <input
                type="email"
                value={user.email}
                disabled
                className={`${inputBase} cursor-not-allowed border-transparent opacity-60`}
              />
            </div>
          </div>

          <div className="sm:col-span-2">
            <label className="mb-1.5 flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">
              <FiGrid className="h-3 w-3" /> Assigned Section / Division
            </label>
            <select
              value={sectionId ?? ''}
              onChange={(e) => setSectionId(e.target.value === '' ? null : Number(e.target.value))}
              className="h-10 w-full rounded-xl border border-transparent bg-[#f4f7fe] px-3 text-xs font-medium text-navy-700 outline-none transition-colors focus:border-[#4318FF] dark:bg-navy-900 dark:text-white"
            >
              <option value="">— No Section —</option>
              {sections.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>

          <div className="sm:col-span-2">
            <label className="mb-1.5 flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">
              <FiShield className="h-3 w-3" />
              {isAdminVariant ? 'Admin Security Role / Clearance' : 'User Access Role & Permissions'}
            </label>
            <div className="relative">
              <FiShield className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" />
              <select
                value={role}
                onChange={(e) => setRole(e.target.value as UserRole)}
                disabled={!canChangePrivileged}
                className={`${inputBase} border-transparent disabled:cursor-not-allowed disabled:opacity-60`}
              >
                <option value="Staff">
                  {isAdminVariant ? 'Administrator (Section Level)' : 'Staff Officer (Record Room Ingest & File Checkout)'}
                </option>
                <option value="Administrator">
                  {isAdminVariant ? 'Super Admin (Level 1 Root Clearance)' : 'Administrator (Full System Clearance)'}
                </option>
              </select>
            </div>
            {!canChangePrivileged && (
              <p className="mt-1 text-[10px] text-gray-400">
                {isSelf
                  ? 'You cannot change your own role or status.'
                  : 'The primary administrator role and status are protected.'}
              </p>
            )}
          </div>

          <div className="sm:col-span-2">
            <label className="mb-1.5 flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">
              Account Status
            </label>
            <div className="flex flex-wrap items-center gap-2">
              {STATUS_OPTIONS.map((opt) => {
                const active = status === opt.value;
                const currentButUnselectable =
                  !canChangePrivileged && user.account_status === opt.value;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    disabled={saving}
                    onClick={() => canChangePrivileged && setStatus(opt.value)}
                    className={`flex items-center gap-1.5 rounded-full px-3.5 py-2 text-[11px] font-bold transition-all ${
                      active
                        ? 'bg-emerald-600 text-white shadow-md'
                        : 'bg-[#f4f7fe] text-gray-500 hover:bg-gray-100 dark:bg-navy-900 dark:text-gray-400'
                    } ${!canChangePrivileged ? 'cursor-not-allowed opacity-70' : ''}`}
                  >
                    {active && <FiCheck className="h-3 w-3" />}
                    {opt.label}
                    {currentButUnselectable && <FiLock className="h-3 w-3" />}
                  </button>
                );
              })}
              {(user.account_status === 'rejected' || user.account_status === 'locked') && (
                <span className="rounded-full bg-[#f4f7fe] px-3.5 py-2 text-[11px] font-bold text-gray-400 dark:bg-navy-900">
                  Current: {statusLabel(user.account_status)}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="mt-7 flex items-center justify-end gap-3">
          <button
            onClick={onClose}
            disabled={saving}
            className="rounded-xl px-5 py-2.5 text-sm font-semibold text-gray-500 transition-colors hover:bg-gray-50 disabled:opacity-50 dark:text-gray-400 dark:hover:bg-navy-600"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving || fullName.trim().length < 3}
            className="flex items-center gap-2 rounded-xl bg-[#4318FF] px-5 py-2.5 text-sm font-bold text-white shadow-md shadow-shadow-500 transition-colors hover:bg-brand-600 disabled:opacity-60"
          >
            {saving ? (
              <>
                <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/40 border-t-white" />
                Saving...
              </>
            ) : (
              <>
                <FiCheck className="h-4 w-4" />
                {isAdminVariant ? 'Save Admin Changes' : 'Save User Changes'}
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
