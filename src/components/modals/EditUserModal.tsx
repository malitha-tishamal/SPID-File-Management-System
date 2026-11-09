'use client';
import React, { useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
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
import Button from 'components/ui/Button';

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

function statusLabel(status: AccountStatus, t: (key: string) => string): string {
  if (status === 'approved') return t('modals.edit.status.activeAccount');
  if (status === 'disabled') return t('modals.edit.status.suspended');
  if (status === 'pending') return t('modals.edit.status.pendingVerification');
  if (status === 'rejected') return t('common:status.rejected');
  return t('status.locked');
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
  const { t } = useTranslation('accounts');
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
              {t(isAdminVariant ? 'modals.edit.titleAdmin' : 'modals.edit.titleStaff')}
            </h3>
          </div>
          <button
            onClick={onClose}
            disabled={saving}
            className="flex h-8 w-8 items-center justify-center rounded-full text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-navy-600"
            aria-label={t('common:buttons.close')}
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
                    <FiLock className="h-2.5 w-2.5" /> {t('table.protected')}
                  </span>
                )}
              </p>
              <p className="truncate text-[11px] text-gray-500 dark:text-gray-400">{user.email}</p>
            </div>
          </div>
          <span className={`shrink-0 flex items-center gap-1.5 rounded-full px-3 py-1 text-[11px] font-bold ${statusBadgeClass(user.account_status)}`}>
            <span className={`h-1.5 w-1.5 rounded-full ${statusDotClass(user.account_status)}`} />
            {statusLabel(user.account_status, t)}
          </span>
        </div>

        {/* Form Fields (2 columns, matching image 4) */}
        <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
          {/* Full Name */}
          <div>
            <label className="mb-1.5 flex items-center gap-1.5 text-[11px] font-bold text-navy-700 dark:text-gray-300">
              <FiUser className="h-3.5 w-3.5 text-[#4318FF]" /> {t('modals.edit.fullName')}
            </label>
            <div className="relative">
              <input
                type="text"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                className={`${inputBase} pr-9 ${nameError ? 'border-red-400' : ''}`}
                placeholder={t('modals.edit.fullNamePlaceholder')}
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-emerald-500">
                <FiCheckCircle className="h-4 w-4" />
              </span>
            </div>
            {nameError && <p className="mt-1 text-[10px] text-red-500">{t('validation.nameMin', { count: 3 })}</p>}
          </div>

          {/* Official Email */}
          <div>
            <label className="mb-1.5 flex items-center gap-1.5 text-[11px] font-bold text-navy-700 dark:text-gray-300">
              <FiMail className="h-3.5 w-3.5 text-[#4318FF]" />
              {t(isAdminVariant ? 'modals.edit.emailAdmin' : 'modals.edit.emailStaff')}
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
              <FiPhone className="h-3.5 w-3.5 text-[#4318FF]" /> {t('modals.edit.mobile')}
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
                {t('validation.phoneDigits', { count: 9 })}
              </p>
            )}
          </div>

          {/* Departmental Allocation */}
          <div>
            <label className="mb-1.5 flex items-center gap-1.5 text-[11px] font-bold text-navy-700 dark:text-gray-300">
              <FiShield className="h-3.5 w-3.5 text-[#4318FF]" /> {t('modals.edit.section')}
            </label>
            <select
              value={sectionId ?? ''}
              onChange={(e) => setSectionId(e.target.value === '' ? null : Number(e.target.value))}
              className={`${inputBase} cursor-pointer`}
            >
              <option value="">{t('modals.edit.selectDepartment')}</option>
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
              {t(isAdminVariant ? 'modals.edit.roleAdmin' : 'modals.edit.roleStaff')}
            </label>
            <div className="relative">
              <select
                value={role}
                onChange={(e) => setRole(e.target.value as UserRole)}
                disabled={!canChangePrivileged}
                className={`${inputBase} pr-9 cursor-pointer disabled:cursor-not-allowed disabled:bg-slate-50`}
              >
                <option value="Administrator">{t('modals.edit.optionAdmin')}</option>
                <option value="Staff">{t('modals.edit.optionStaff')}</option>
              </select>
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none">
                <FiShield className="h-3.5 w-3.5" />
              </span>
            </div>
            {!canChangePrivileged && (
              <p className="mt-1 text-[10px] text-gray-400">
                {t(isSelf ? 'modals.edit.selfRoleNote' : 'modals.edit.protectedRoleNote')}
              </p>
            )}
          </div>
        </div>

        {/* Footer actions (matching image 4) */}
        <div className="mt-7 flex items-center justify-end gap-3 border-t border-gray-100 pt-4 dark:border-navy-600">
          <Button
            type="button"
            variant="cancel"
            size="sm"
            onClick={onClose}
            disabled={saving}
          >
            {t('common:buttons.cancel')}
          </Button>
          <button
            onClick={handleSave}
            disabled={saving || fullName.trim().length < 3 || phoneError}
            className="flex items-center gap-2 rounded-xl bg-[#4318FF] px-6 py-2.5 text-xs font-bold text-white shadow-md shadow-indigo-500/25 transition-colors hover:bg-brand-600 disabled:opacity-60 cursor-pointer"
          >
            {saving ? (
              <>
                <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/40 border-t-white" />
                {t('modals.saving')}
              </>
            ) : (
              <>
                <MdSave className="h-4 w-4" />
                {t(isAdminVariant ? 'modals.edit.saveAdmin' : 'modals.edit.saveStaff')}
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
