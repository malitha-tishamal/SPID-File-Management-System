'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import {
  FiShield,
  FiFolder,
  FiFileText,
  FiUser,
  FiKey,
  FiSave,
  FiCopy,
  FiPlus,
  FiAlertCircle,
  FiCalendar,
  FiUploadCloud,
} from 'react-icons/fi';
import { useTranslation } from 'react-i18next';
import GlassNotification, { GlassNotificationType } from 'components/notifications/GlassNotification';
import SectionCombobox from 'components/admin/SectionCombobox';
import AddSectionModal from 'components/modals/AddSectionModal';
// xlsx (~1 MB) only loads when the import modal is actually opened.
const BulkImportModal = dynamic(() => import('components/modals/BulkImportModal'), {
  ssr: false,
  loading: () => null,
});
import LimitedFileField from 'components/admin/files/LimitedFileField';
import { useProfile } from 'contexts/ProfileContext';
import { fetchClientSections } from 'lib/sectionsClient';
import { FILE_FIELD_MAX_LENGTH, validateFileFieldLength } from 'lib/constants';

interface SectionOption {
  id?: number | string;
  name: string;
}

export default function StaffAddNewFilePage() {
  const { t } = useTranslation('files');

  // Session & User State
  const [registrarName, setRegistrarName] = useState<string>('Staff Officer');
  const [registrarRole, setRegistrarRole] = useState<string>('Staff');

  // Form Fields
  const [fileNo, setFileNo] = useState('');
  const [fileName, setFileName] = useState('');
  const [section, setSection] = useState('');
  // Start Date & End Date (replaces Year)
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [totalPages, setTotalPages] = useState('');
  const [minuteSheets, setMinuteSheets] = useState('');

  // Sections List
  const [sectionsList, setSectionsList] = useState<SectionOption[]>([]);

  // Form Validation & Submission State
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Glassmorphism Notification State
  const [notification, setNotification] = useState<{
    isOpen: boolean;
    type: GlassNotificationType;
    title?: string;
    message?: string;
  }>({
    isOpen: false,
    type: 'success',
  });

  // Bulk Import & Add Section Modals State
  const [isBulkImportOpen, setIsBulkImportOpen] = useState(false);
  const [isAddSectionOpen, setIsAddSectionOpen] = useState(false);

  const handleSectionCreated = (newSec: SectionOption) => {
    setSectionsList((prev) => {
      const exists = prev.some(
        (s) => s.name.toLowerCase() === newSec.name.toLowerCase(),
      );
      if (exists) return prev;
      return [...prev, newSec].sort((a, b) => a.name.localeCompare(b.name));
    });
    setSection(newSec.name);
    // Re-read the authoritative Active list so the dropdown reflects the new row.
    fetchClientSections(true, { activeOnly: true })
      .then((sections) => {
        if (Array.isArray(sections) && sections.length > 0) {
          setSectionsList(sections as SectionOption[]);
        }
      })
      .catch(() => {});
    if (errors.section) {
      setErrors((prev) => ({ ...prev, section: '' }));
    }
    setNotification({
      isOpen: true,
      type: 'success',
      title: t('addFile.sectionCreatedTitle'),
      message: t('addFile.sectionCreatedMessage', { name: newSec.name }),
    });
  };

  const handleBulkImportSuccess = async (count: number) => {
    // Reflect the admin-configured approval setting in the confirmation dialog
    let requireApproval = true;
    try {
      const res = await fetch('/api/admin/files/settings');
      const json = await res.json().catch(() => null);
      if (res.ok && typeof json?.data?.require_approval === 'boolean') {
        requireApproval = json.data.require_approval;
      }
    } catch {}
    setNotification({
      isOpen: true,
      type: 'success',
      title: t('addFile.bulkImportSuccessTitle'),
      message: requireApproval
        ? t('addFile.bulkImportSubmittedMessage', { count })
        : t('addFile.bulkImportSuccessMessage', { count }),
    });
  };

  const { profile } = useProfile();

  useEffect(() => {
    if (profile) {
      const displayName = profile.full_name || 'Staff Officer';
      const accountTag = profile.email ? profile.email.split('@')[0] : 'staff';
      setRegistrarName(`${displayName} (${accountTag})`);
      setRegistrarRole(profile.role || 'Staff');
    }
  }, [profile]);

  // Fetch Active sections on load using the deduplicated client
  useEffect(() => {
    let mounted = true;
    fetchClientSections(false, { activeOnly: true })
      .then((sections) => {
        if (!mounted) return;
        if (Array.isArray(sections)) {
          setSectionsList(sections);
        }
      })
      .catch(() => {});

    return () => {
      mounted = false;
    };
  }, []);

  // ── Validation ──────────────────────────────────────────────────────────────
  const validate = (): boolean => {
    const errs: Record<string, string> = {};

    if (!fileNo.trim()) {
      errs.fileNo = t('validation.fileNoRequired');
    } else if (validateFileFieldLength('fileNo', fileNo)) {
      errs.fileNo = t('validation.fileNoMax', { max: FILE_FIELD_MAX_LENGTH });
    }
    if (!fileName.trim()) {
      errs.fileName = t('validation.fileNameRequiredUpper');
    } else if (validateFileFieldLength('fileName', fileName)) {
      errs.fileName = t('validation.fileNameMax', { max: FILE_FIELD_MAX_LENGTH });
    }
    if (!section.trim()) {
      errs.section = t('validation.sectionRequired');
    }
    if (!startDate) {
      errs.startDate = t('validation.startDateRequired');
    }
    if (!endDate) {
      errs.endDate = t('validation.endDateRequired');
    }
    if (startDate && endDate && endDate < startDate) {
      errs.endDate = t('validation.endBeforeStartLong');
    }

    if (totalPages && (isNaN(Number(totalPages)) || Number(totalPages) < 0)) {
      errs.totalPages = t('validation.totalPagesInvalid');
    }
    if (minuteSheets && (isNaN(Number(minuteSheets)) || Number(minuteSheets) < 0)) {
      errs.minuteSheets = t('validation.minuteSheetsInvalid');
    }

    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  // ── Reset helpers ────────────────────────────────────────────────────────────
  const resetForm = () => {
    setFileNo('');
    setFileName('');
    setSection('');
    setStartDate('');
    setEndDate('');
    setTotalPages('');
    setMinuteSheets('');
    setErrors({});
  };

  // Handle Cancel
  const handleCancel = () => {
    if (fileNo || fileName || section || totalPages || minuteSheets) {
      if (window.confirm(t('addFile.discardConfirm'))) {
        resetForm();
      }
    } else {
      setErrors({});
    }
  };

  // ── Handle Submit ────────────────────────────────────────────────────────────
  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();

    // Prevent double-clicks: set loading immediately
    if (isSubmitting) return;

    if (!validate()) {
      return;
    }

    setIsSubmitting(true);

    try {
      const payload = {
        file_no: fileNo.trim(),
        file_name: fileName.trim(),
        section: section.trim(),
        start_date: startDate,
        end_date: endDate,
        page_numbers: totalPages ? parseInt(totalPages, 10) : 0,
        minute_sheets_count: minuteSheets ? parseInt(minuteSheets, 10) : 0,
      };

      const res = await fetch('/api/admin/files', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const json = await res.json().catch(() => null);

      if (res.ok && json?.ok) {
        // ── Success (approval setting enforced server-side) ──────────────────
        const isPending = json.data?.pending === true || json.data?.file?.status === 'PENDING';
        const successMsg =
          json.data?.message ||
          (isPending
            ? t('addFile.submittedMessage')
            : t('addFile.addedMessage'));
        setNotification({
          isOpen: true,
          type: 'success',
          title: isPending ? t('addFile.submittedTitle') : t('addFile.addedTitle'),
          message: successMsg,
        });
        resetForm();
      } else {
        // ── Server-side failure ──────────────────────────────────────────────
        // API errors come back flat as { ok:false, code, message } (see lib/apiResponse)
        if (json?.code === 'FIELD_TOO_LONG') {
          const max = Number(json.max) || FILE_FIELD_MAX_LENGTH;
          const field = json.field === 'fileName' ? 'fileName' : 'fileNo';
          setErrors((prev) => ({
            ...prev,
            [field]: t(
              field === 'fileName' ? 'validation.fileNameMax' : 'validation.fileNoMax',
              { max },
            ),
          }));
          return;
        }

        const serverMsg: string = json?.message || json?.error?.message || '';
        let errorMsg: string;

        if (res.status === 409) {
          errorMsg = serverMsg || t('addFile.duplicateFileNo');
        } else if (res.status === 400) {
          if (serverMsg.toLowerCase().includes('end date')) {
            errorMsg = t('validation.endBeforeStartLong');
          } else {
            errorMsg = serverMsg || t('addFile.saveFailed');
          }
        } else {
          errorMsg = serverMsg || t('addFile.saveFailed');
        }

        setNotification({
          isOpen: true,
          type: 'failure',
          title: t('addFile.addedFailedTitle'),
          message: errorMsg,
        });
      }
    } catch {
      // Network or connection failure
      setNotification({
        isOpen: true,
        type: 'failure',
        title: t('addFile.addedFailedTitle'),
        message: t('addFile.networkFailed'),
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  // ── Shared input class builder ───────────────────────────────────────────────
  const inputClass = (errorKey: string) =>
    `h-10 w-full rounded-xl bg-white dark:bg-navy-900 px-3.5 text-xs font-medium text-slate-900 dark:text-white outline-none border transition-all placeholder:text-slate-400 ${
      errors[errorKey]
        ? 'border-red-500 ring-2 ring-red-500/10'
        : 'border-slate-200 dark:border-navy-700 focus:border-[#4318FF] dark:focus:border-brand-400'
    }`;

  return (
    <div className="w-full pb-8 font-dm">
      {/* ── BREADCRUMBS & PAGE HEADER ── */}
      <div className="mb-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        {/* Left: Breadcrumbs & Title */}
        <div className="flex flex-col gap-2">
          {/* Breadcrumb Trail */}
          <nav className="flex items-center gap-2 text-xs font-semibold text-slate-400 dark:text-gray-400">
            <Link href="/staff/default" className="hover:text-slate-600 dark:hover:text-white transition-colors">
              {t('page.breadcrumbPages')}
            </Link>
            <span>/</span>
            <span className="text-slate-500 dark:text-gray-300">{t('addFile.breadcrumbStaffPortal')}</span>
            <span>/</span>
            <span className="text-[#4318FF] font-bold dark:text-brand-300">{t('addFile.title')}</span>
          </nav>

          {/* Page Title & Subtitle */}
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-[#F4F2FF] text-[#4318FF] dark:bg-brand-900/40 dark:text-brand-300 shadow-xs">
              <FiPlus className="h-4 w-4 stroke-[3]" />
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl font-black text-[#1B254B] dark:text-white leading-tight">
                {t('addFile.title')}
              </h1>
              <p className="text-xs font-medium text-slate-400 dark:text-gray-400">
                {t('addFile.subtitle')}
              </p>
            </div>
          </div>
        </div>

        {/* Right (R1): Bulk Import (CSV) Button */}
        <div className="flex items-center gap-2 self-start sm:self-auto">
          <button
            type="button"
            onClick={() => setIsBulkImportOpen(true)}
            className="flex h-10 items-center gap-2 rounded-xl bg-white dark:bg-navy-800 px-4 text-xs font-bold text-[#1B254B] dark:text-white border border-slate-200 dark:border-navy-700 shadow-xs hover:bg-[#F4F2FF] dark:hover:bg-navy-700 hover:border-[#4318FF]/30 hover:text-[#4318FF] dark:hover:text-brand-300 active:scale-[0.98] transition-all cursor-pointer"
            title={t('addFile.bulkImportTitle')}
            aria-label={t('addFile.bulkImport')}
          >
            <FiUploadCloud className="h-4 w-4 text-[#4318FF] dark:text-brand-300 stroke-[2.5]" />
            <span>{t('addFile.bulkImport')}</span>
          </button>
        </div>
      </div>

      {/* ── FORM CONTAINER ── */}
      <form onSubmit={handleSave} className="flex flex-col gap-3.5">
        {/* ─────────────────────────────────────────────────────────────
            CARD 1: SESSION & REGISTRAR IDENTIFICATION
        ────────────────────────────────────────────────────────────── */}
        <div className="rounded-2xl bg-white dark:bg-navy-800 p-4 sm:p-5 shadow-xs border border-slate-100 dark:border-navy-700">
          <div className="mb-3 flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="flex h-6 w-6 items-center justify-center rounded-md text-[#4318FF] dark:text-brand-300">
                <FiShield className="h-4.5 w-4.5" strokeWidth={2.5} />
              </div>
              <h3 className="text-sm sm:text-base font-bold text-navy-800 dark:text-white">
                {t('addFile.sessionHeading')}
              </h3>
            </div>

            {/* Auto-Verified Badge */}
            <div className="flex items-center gap-1.5 rounded-full bg-[#ECFDF5] dark:bg-emerald-950/50 px-2.5 py-0.5 border border-emerald-100 dark:border-emerald-800/40 text-emerald-600 dark:text-emerald-300 text-[11px] font-bold shadow-xs">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
              <span>{t('addFile.autoVerified')}</span>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
            {/* Field 1: User / Registrar Name (Read-Only) */}
            <div>
              <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 mb-1.5">
                {t('addFile.registrarNameLabel')}
              </label>
              <div className="flex h-10 w-full items-center justify-between rounded-xl bg-[#F4F7FE] dark:bg-navy-900/60 px-3.5 text-xs font-semibold text-slate-800 dark:text-slate-200 border border-slate-200/50 dark:border-navy-700 select-none cursor-not-allowed">
                <span className="truncate">{registrarName}</span>
                <FiUser className="h-4 w-4 shrink-0 text-slate-400" />
              </div>
            </div>

            {/* Field 2: User Role / Designation (Read-Only) */}
            <div>
              <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 mb-1.5">
                {t('addFile.registrarRoleLabel')}
              </label>
              <div className="flex h-10 w-full items-center justify-between rounded-xl bg-[#F4F7FE] dark:bg-navy-900/60 px-3.5 text-xs font-semibold text-slate-800 dark:text-slate-200 border border-slate-200/50 dark:border-navy-700 select-none cursor-not-allowed">
                <span className="truncate">{registrarRole}</span>
                <FiKey className="h-4 w-4 shrink-0 text-slate-400" />
              </div>
            </div>
          </div>
        </div>

        {/* ─────────────────────────────────────────────────────────────
            CARD 2: BASIC INFORMATION
            Fields: File No, File Name, Section, Start Date, End Date
        ────────────────────────────────────────────────────────────── */}
        <div className="rounded-2xl bg-white dark:bg-navy-800 p-4 sm:p-5 shadow-xs border border-slate-100 dark:border-navy-700">
          <div className="mb-3 flex items-center gap-2.5">
            <div className="flex h-6 w-6 items-center justify-center rounded-md text-[#4318FF] dark:text-brand-300">
              <FiFolder className="h-4.5 w-4.5" strokeWidth={2.5} />
            </div>
            <h3 className="text-sm sm:text-base font-bold text-navy-800 dark:text-white">
              {t('addFile.basicHeading')}
            </h3>
          </div>

          {/* Row 1: File No, File Name, Section */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-12 gap-3.5 mb-3.5">
            {/* File No */}
            <div className="sm:col-span-1 lg:col-span-3">
              <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 mb-1.5">
                {t('addFile.fileNoLabel')} <span className="text-red-500 font-bold">*</span>
              </label>
              <LimitedFileField
                field="fileNo"
                value={fileNo}
                onChange={(value) => {
                  setFileNo(value);
                  if (errors.fileNo) setErrors((prev) => ({ ...prev, fileNo: '' }));
                }}
                error={errors.fileNo}
                placeholder={t('addFile.fileNoPlaceholder')}
                inputClassName={inputClass('fileNo')}
              />
            </div>

            {/* File Name */}
            <div className="sm:col-span-1 lg:col-span-4">
              <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 mb-1.5">
                {t('addFile.fileNameLabel')} <span className="text-red-500 font-bold">*</span>
              </label>
              <LimitedFileField
                field="fileName"
                value={fileName}
                onChange={(value) => {
                  setFileName(value);
                  if (errors.fileName) setErrors((prev) => ({ ...prev, fileName: '' }));
                }}
                error={errors.fileName}
                placeholder={t('addFile.fileNamePlaceholder')}
                inputClassName={inputClass('fileName')}
              />
            </div>

            {/* Section (R2) */}
            <div className="sm:col-span-2 lg:col-span-5">
              <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 mb-1.5">
                {t('addFile.sectionLabel')} <span className="text-red-500 font-bold">*</span>
              </label>
              <SectionCombobox
                sections={sectionsList}
                value={section}
                onChange={(val) => {
                  setSection(val);
                  if (errors.section) setErrors((prev) => ({ ...prev, section: '' }));
                }}
                onOpenAddSection={() => setIsAddSectionOpen(true)}
                error={errors.section}
              />
              {errors.section && (
                <p className="mt-1 flex items-center gap-1 text-[11px] font-semibold text-red-500">
                  <FiAlertCircle className="h-3.5 w-3.5" />
                  {errors.section}
                </p>
              )}
            </div>
          </div>

          {/* Row 2: Start Date, End Date */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            {/* Start Date */}
            <div>
              <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 mb-1.5">
                {t('addFile.startDateLabel')} <span className="text-red-500 font-bold">*</span>
              </label>
              <div className="relative">
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => {
                    setStartDate(e.target.value);
                    if (errors.startDate) setErrors((prev) => ({ ...prev, startDate: '' }));
                    // Re-validate end date if already set
                    if (endDate && e.target.value && endDate < e.target.value) {
                      setErrors((prev) => ({
                        ...prev,
                        endDate: t('validation.endBeforeStartLong'),
                      }));
                    } else if (errors.endDate) {
                      setErrors((prev) => ({ ...prev, endDate: '' }));
                    }
                  }}
                  className={`${inputClass('startDate')} pr-9`}
                />
                <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-3 text-slate-400">
                  <FiCalendar className="h-4 w-4" />
                </div>
              </div>
              {errors.startDate && (
                <p className="mt-1 flex items-center gap-1 text-[11px] font-semibold text-red-500">
                  <FiAlertCircle className="h-3.5 w-3.5" />
                  {errors.startDate}
                </p>
              )}
            </div>

            {/* End Date */}
            <div>
              <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 mb-1.5">
                {t('addFile.endDateLabel')} <span className="text-red-500 font-bold">*</span>
              </label>
              <div className="relative">
                <input
                  type="date"
                  value={endDate}
                  min={startDate || undefined}
                  onChange={(e) => {
                    setEndDate(e.target.value);
                    if (errors.endDate) setErrors((prev) => ({ ...prev, endDate: '' }));
                  }}
                  className={`${inputClass('endDate')} pr-9`}
                />
                <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-3 text-slate-400">
                  <FiCalendar className="h-4 w-4" />
                </div>
              </div>
              {errors.endDate && (
                <p className="mt-1 flex items-center gap-1 text-[11px] font-semibold text-red-500">
                  <FiAlertCircle className="h-3.5 w-3.5" />
                  {errors.endDate}
                </p>
              )}
            </div>
          </div>
        </div>

        {/* ─────────────────────────────────────────────────────────────
            CARD 3: FILE DETAILS
        ────────────────────────────────────────────────────────────── */}
        <div className="rounded-2xl bg-white dark:bg-navy-800 p-4 sm:p-5 shadow-xs border border-slate-100 dark:border-navy-700">
          <div className="mb-3 flex items-center gap-2.5">
            <div className="flex h-6 w-6 items-center justify-center rounded-md text-purple-600 dark:text-purple-400">
              <FiFileText className="h-4.5 w-4.5" strokeWidth={2.5} />
            </div>
            <h3 className="text-sm sm:text-base font-bold text-navy-800 dark:text-white">
              {t('addFile.fileDetailsHeading')}
            </h3>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
            {/* Total Pages */}
            <div>
              <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 mb-1.5">
                {t('addFile.pageNumbersLabel')}
              </label>
              <input
                type="number"
                min="0"
                value={totalPages}
                onChange={(e) => {
                  setTotalPages(e.target.value);
                  if (errors.totalPages) setErrors((prev) => ({ ...prev, totalPages: '' }));
                }}
                placeholder={t('addFile.pageNumbersPlaceholder')}
                className={inputClass('totalPages')}
              />
              {errors.totalPages && (
                <p className="mt-1 flex items-center gap-1 text-[11px] font-semibold text-red-500">
                  <FiAlertCircle className="h-3.5 w-3.5" />
                  {errors.totalPages}
                </p>
              )}
            </div>

            {/* Minutes Sheets */}
            <div>
              <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 mb-1.5">
                {t('addFile.minuteSheetsLabel')}
              </label>
              <div className="relative">
                <input
                  type="number"
                  min="0"
                  value={minuteSheets}
                  onChange={(e) => {
                    setMinuteSheets(e.target.value);
                    if (errors.minuteSheets) setErrors((prev) => ({ ...prev, minuteSheets: '' }));
                  }}
                  placeholder={t('addFile.minuteSheetsPlaceholder')}
                  className={`${inputClass('minuteSheets')} pr-9`}
                />
                <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-3.5 text-slate-400">
                  <FiCopy className="h-4 w-4" />
                </div>
              </div>
              {errors.minuteSheets && (
                <p className="mt-1 flex items-center gap-1 text-[11px] font-semibold text-red-500">
                  <FiAlertCircle className="h-3.5 w-3.5" />
                  {errors.minuteSheets}
                </p>
              )}
            </div>
          </div>
        </div>

        {/* ─────────────────────────────────────────────────────────────
            FORM ACTION BUTTONS
        ────────────────────────────────────────────────────────────── */}
        <div className="mt-1 flex items-center justify-end gap-3">
          {/* Cancel Button */}
          <button
            type="button"
            onClick={handleCancel}
            disabled={isSubmitting}
            className="flex h-10 items-center justify-center rounded-xl bg-white dark:bg-navy-800 px-6 text-xs font-bold text-[#1B254B] dark:text-white border border-slate-200 dark:border-navy-700 shadow-xs hover:bg-slate-50 dark:hover:bg-navy-700 active:scale-[0.98] transition-all disabled:opacity-50 cursor-pointer"
          >
            {t('common:buttons.cancel')}
          </button>

          {/* Save File Button */}
          <button
            type="submit"
            disabled={isSubmitting}
            aria-busy={isSubmitting}
            className="flex h-10 items-center justify-center gap-2 rounded-xl bg-[#05CD99] hover:bg-[#04B787] px-6 text-xs font-bold text-white shadow-md shadow-[#05CD99]/25 hover:shadow-lg active:scale-[0.98] transition-all disabled:opacity-60 disabled:cursor-not-allowed cursor-pointer"
          >
            {isSubmitting ? (
              <>
                <svg
                  className="h-3.5 w-3.5 animate-spin text-white"
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                >
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                <span>{t('addFile.saving')}</span>
              </>
            ) : (
              <>
                <FiSave className="h-3.5 w-3.5" />
                <span>{t('addFile.save')}</span>
              </>
            )}
          </button>
        </div>
      </form>

      {/* ── ADD NEW SECTION MODAL (R2) ── */}
      <AddSectionModal
        isOpen={isAddSectionOpen}
        onClose={() => setIsAddSectionOpen(false)}
        onCreated={handleSectionCreated}
      />

      {/* ── BULK IMPORT MODAL (R1) ── */}
      <BulkImportModal
        isOpen={isBulkImportOpen}
        onClose={() => setIsBulkImportOpen(false)}
        onSuccess={handleBulkImportSuccess}
        activeSections={sectionsList}
        includeLocationFields={false}
      />

      {/* ── GLASSMORPHISM SUCCESS / FAILURE NOTIFICATION MODAL ── */}
      <GlassNotification
        isOpen={notification.isOpen}
        type={notification.type}
        title={notification.title}
        message={notification.message}
        onClose={() => setNotification((prev) => ({ ...prev, isOpen: false }))}
      />
    </div>
  );
}
