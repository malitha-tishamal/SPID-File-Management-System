'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  FiShield,
  FiFolder,
  FiMapPin,
  FiFileText,
  FiUser,
  FiKey,
  FiSave,
  FiChevronDown,
  FiCopy,
  FiPlus,
  FiAlertCircle,
  FiCalendar,
} from 'react-icons/fi';
import GlassNotification, { GlassNotificationType } from 'components/notifications/GlassNotification';

interface SectionOption {
  id?: number | string;
  name: string;
}

const DEFAULT_SECTIONS: SectionOption[] = [
  { id: 1, name: 'Administration & Human Resources Division' },
  { id: 2, name: 'Irrigation Planning, Design & Feasibility' },
  { id: 3, name: 'Water Management, Operations & Hydrology' },
  { id: 4, name: 'Engineering Central Registry & Archive Records' },
  { id: 5, name: 'Land Acquisition & Field Surveys' },
  { id: 6, name: 'Finance, Accounts & Procurement' },
  { id: 7, name: 'Galle Regional Engineering Office' },
  { id: 8, name: 'Matara Regional Engineering Office' },
  { id: 9, name: 'Hambantota Regional Engineering Office' },
];

export default function StaffAddNewFilePage() {
  // Session & User State
  const [registrarName, setRegistrarName] = useState<string>('Staff Officer');
  const [registrarRole, setRegistrarRole] = useState<string>('Staff');

  // Form Fields
  const [fileNo, setFileNo] = useState('');
  const [fileName, setFileName] = useState('');
  const [section, setSection] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [lockerNo, setLockerNo] = useState('');
  const [shelfName, setShelfName] = useState('');
  const [shelfPosition, setShelfPosition] = useState<'Front' | 'Middle' | 'Back'>('Front');
  const [totalPages, setTotalPages] = useState('');
  const [minuteSheets, setMinuteSheets] = useState('');

  // Sections List
  const [sectionsList, setSectionsList] = useState<SectionOption[]>(DEFAULT_SECTIONS);

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

  // Fetch session & sections on load
  useEffect(() => {
    let mounted = true;

    // Fetch session data
    fetch('/api/auth/me')
      .then((res) => (res.ok ? res.json() : null))
      .then((json) => {
        if (!mounted || !json?.ok || !json.data?.profile) {
          try {
            const stored = localStorage.getItem('spid_user');
            if (stored) {
              const u = JSON.parse(stored);
              const name = u.full_name || u.name || 'Staff Member';
              const email = u.email ? u.email.split('@')[0] : 'staff';
              setRegistrarName(`${name} (${email})`);
              const role = u.role || 'Staff';
              setRegistrarRole(role);
            }
          } catch {}
          return;
        }

        const p = json.data.profile;
        const displayName = p.full_name || 'Staff Member';
        const accountTag = p.email ? p.email.split('@')[0] : 'staff';
        setRegistrarName(`${displayName} (${accountTag})`);
        const userRole = p.role || 'Staff';
        setRegistrarRole(userRole);
      })
      .catch(() => {});

    // Fetch Sections
    fetch('/api/sections')
      .then((res) => (res.ok ? res.json() : null))
      .then((json) => {
        if (!mounted) return;
        if (json?.ok && Array.isArray(json.data?.sections) && json.data.sections.length > 0) {
          setSectionsList(json.data.sections);
        }
      })
      .catch(() => {});

    return () => {
      mounted = false;
    };
  }, []);

  const validate = (): boolean => {
    const errs: Record<string, string> = {};

    if (!fileNo.trim()) {
      errs.fileNo = 'File No is required.';
    }
    if (!fileName.trim()) {
      errs.fileName = 'File Name is required.';
    }
    if (!section.trim()) {
      errs.section = 'Section is required.';
    }
    if (!startDate) {
      errs.startDate = 'Start Date is required.';
    }
    if (!endDate) {
      errs.endDate = 'End Date is required.';
    }
    if (startDate && endDate && endDate < startDate) {
      errs.endDate = 'End date must be on or after the start date.';
    }

    if (totalPages && (isNaN(Number(totalPages)) || Number(totalPages) < 0)) {
      errs.totalPages = 'Total pages must be a non-negative number.';
    }
    if (minuteSheets && (isNaN(Number(minuteSheets)) || Number(minuteSheets) < 0)) {
      errs.minuteSheets = 'Minute sheets count must be a non-negative number.';
    }

    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const resetForm = () => {
    setFileNo('');
    setFileName('');
    setSection('');
    setStartDate('');
    setEndDate('');
    setLockerNo('');
    setShelfName('');
    setShelfPosition('Front');
    setTotalPages('');
    setMinuteSheets('');
    setErrors({});
  };

  const handleCancel = () => {
    if (fileNo || fileName || section || lockerNo || shelfName || totalPages || minuteSheets) {
      if (window.confirm('Are you sure you want to discard your changes?')) {
        resetForm();
      }
    } else {
      setErrors({});
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();

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
        locker_no: lockerNo.trim() || null,
        shelf_name: shelfName.trim() || null,
        shelf_position: shelfPosition,
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
        const successMsg = json.data?.message || 'File submitted successfully.';
        setNotification({
          isOpen: true,
          type: 'success',
          title: 'File Submitted',
          message: successMsg,
        });
        resetForm();
      } else {
        let errorMsg: string;
        if (res.status === 409) {
          errorMsg = json?.error?.message || 'File name or number already exists.';
        } else if (res.status === 400) {
          errorMsg = json?.error?.message || 'Failed to submit file. Please check form values.';
        } else {
          errorMsg = json?.error?.message || 'Failed to submit file. Please try again.';
        }

        setNotification({
          isOpen: true,
          type: 'failure',
          title: 'Submission Failed',
          message: errorMsg,
        });
      }
    } catch {
      setNotification({
        isOpen: true,
        type: 'failure',
        title: 'Submission Failed',
        message: 'Network connection failed or server is unreachable. Please try again.',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const inputClass = (errorKey: string) =>
    `h-10 w-full rounded-xl bg-white dark:bg-navy-900 px-3.5 text-xs font-medium text-slate-900 dark:text-white outline-none border transition-all placeholder:text-slate-400 ${
      errors[errorKey]
        ? 'border-red-500 ring-2 ring-red-500/10'
        : 'border-slate-200 dark:border-navy-700 focus:border-[#4318FF] dark:focus:border-brand-400'
    }`;

  return (
    <div className="w-full pb-8 font-dm">
      <div className="mb-4 flex flex-col gap-2">
        <nav className="flex items-center gap-2 text-xs font-semibold text-slate-400 dark:text-gray-400">
          <Link href="/staff/default" className="hover:text-slate-600 dark:hover:text-white transition-colors">
            Pages
          </Link>
          <span>/</span>
          <span className="text-slate-500 dark:text-gray-300">Staff Portal</span>
          <span>/</span>
          <span className="text-[#4318FF] font-bold dark:text-brand-300">Add New File</span>
        </nav>

        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-[#F4F2FF] text-[#4318FF] dark:bg-brand-900/40 dark:text-brand-300 shadow-xs">
            <FiPlus className="h-4 w-4 stroke-[3]" />
          </div>
          <div>
            <h1 className="text-xl sm:text-2xl font-black text-[#1B254B] dark:text-white leading-tight">
              Submit New File
            </h1>
            <p className="text-xs font-medium text-slate-400 dark:text-gray-400">
              Submit a new record for archive registration and review
            </p>
          </div>
        </div>
      </div>

      <form onSubmit={handleSave} className="flex flex-col gap-3.5">
        {/* CARD 1: SESSION & IDENTIFICATION */}
        <div className="rounded-2xl bg-white dark:bg-navy-800 p-4 sm:p-5 shadow-xs border border-slate-100 dark:border-navy-700">
          <div className="mb-3 flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="flex h-6 w-6 items-center justify-center rounded-md text-[#4318FF] dark:text-brand-300">
                <FiShield className="h-4.5 w-4.5" strokeWidth={2.5} />
              </div>
              <h3 className="text-sm sm:text-base font-bold text-navy-800 dark:text-white">
                Submitting Officer Identification
              </h3>
            </div>
            <div className="flex items-center gap-1.5 rounded-full bg-[#ECFDF5] dark:bg-emerald-950/50 px-2.5 py-0.5 border border-emerald-100 dark:border-emerald-800/40 text-emerald-600 dark:text-emerald-300 text-[11px] font-bold shadow-xs">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
              <span>Verified Session</span>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
            <div>
              <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 mb-1.5">
                SUBMITTED BY
              </label>
              <div className="flex h-10 w-full items-center justify-between rounded-xl bg-[#F4F7FE] dark:bg-navy-900/60 px-3.5 text-xs font-semibold text-slate-800 dark:text-slate-200 border border-slate-200/50 dark:border-navy-700 select-none cursor-not-allowed">
                <span className="truncate">{registrarName}</span>
                <FiUser className="h-4 w-4 shrink-0 text-slate-400" />
              </div>
            </div>

            <div>
              <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 mb-1.5">
                ROLE / DESIGNATION
              </label>
              <div className="flex h-10 w-full items-center justify-between rounded-xl bg-[#F4F7FE] dark:bg-navy-900/60 px-3.5 text-xs font-semibold text-slate-800 dark:text-slate-200 border border-slate-200/50 dark:border-navy-700 select-none cursor-not-allowed">
                <span className="truncate">{registrarRole}</span>
                <FiKey className="h-4 w-4 shrink-0 text-slate-400" />
              </div>
            </div>
          </div>
        </div>

        {/* CARD 2: BASIC INFORMATION */}
        <div className="rounded-2xl bg-white dark:bg-navy-800 p-4 sm:p-5 shadow-xs border border-slate-100 dark:border-navy-700">
          <div className="mb-3 flex items-center gap-2.5">
            <div className="flex h-6 w-6 items-center justify-center rounded-md text-[#4318FF] dark:text-brand-300">
              <FiFolder className="h-4.5 w-4.5" strokeWidth={2.5} />
            </div>
            <h3 className="text-sm sm:text-base font-bold text-navy-800 dark:text-white">
              Basic Information
            </h3>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-12 gap-3.5 mb-3.5">
            <div className="sm:col-span-1 lg:col-span-3">
              <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 mb-1.5">
                FILE NO <span className="text-red-500 font-bold">*</span>
              </label>
              <input
                type="text"
                value={fileNo}
                onChange={(e) => {
                  setFileNo(e.target.value);
                  if (errors.fileNo) setErrors((prev) => ({ ...prev, fileNo: '' }));
                }}
                placeholder="Ex: FL-2026-0150"
                className={inputClass('fileNo')}
              />
              {errors.fileNo && (
                <p className="mt-1 flex items-center gap-1 text-[11px] font-semibold text-red-500">
                  <FiAlertCircle className="h-3.5 w-3.5" />
                  {errors.fileNo}
                </p>
              )}
            </div>

            <div className="sm:col-span-1 lg:col-span-4">
              <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 mb-1.5">
                FILE NAME <span className="text-red-500 font-bold">*</span>
              </label>
              <input
                type="text"
                value={fileName}
                onChange={(e) => {
                  setFileName(e.target.value);
                  if (errors.fileName) setErrors((prev) => ({ ...prev, fileName: '' }));
                }}
                placeholder="Enter File Name"
                className={inputClass('fileName')}
              />
              {errors.fileName && (
                <p className="mt-1 flex items-center gap-1 text-[11px] font-semibold text-red-500">
                  <FiAlertCircle className="h-3.5 w-3.5" />
                  {errors.fileName}
                </p>
              )}
            </div>

            <div className="sm:col-span-2 lg:col-span-5">
              <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 mb-1.5">
                SECTION <span className="text-red-500 font-bold">*</span>
              </label>
              <div className="relative">
                <select
                  value={section}
                  onChange={(e) => {
                    setSection(e.target.value);
                    if (errors.section) setErrors((prev) => ({ ...prev, section: '' }));
                  }}
                  className={`h-10 w-full appearance-none rounded-xl bg-white dark:bg-navy-900 px-3.5 pr-9 text-xs font-medium text-slate-900 dark:text-white outline-none border transition-all ${
                    errors.section
                      ? 'border-red-500 ring-2 ring-red-500/10'
                      : 'border-slate-200 dark:border-navy-700 focus:border-[#4318FF] dark:focus:border-brand-400'
                  } ${!section ? 'text-slate-400' : ''}`}
                >
                  <option value="" disabled>
                    Select department / section
                  </option>
                  {sectionsList.map((s, idx) => (
                    <option key={s.id ?? idx} value={s.name} className="text-slate-800 dark:text-white">
                      {s.name}
                    </option>
                  ))}
                </select>
                <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-3 text-slate-400">
                  <FiChevronDown className="h-4 w-4" />
                </div>
              </div>
              {errors.section && (
                <p className="mt-1 flex items-center gap-1 text-[11px] font-semibold text-red-500">
                  <FiAlertCircle className="h-3.5 w-3.5" />
                  {errors.section}
                </p>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <div>
              <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 mb-1.5">
                START DATE <span className="text-red-500 font-bold">*</span>
              </label>
              <div className="relative">
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => {
                    setStartDate(e.target.value);
                    if (errors.startDate) setErrors((prev) => ({ ...prev, startDate: '' }));
                    if (endDate && e.target.value && endDate < e.target.value) {
                      setErrors((prev) => ({
                        ...prev,
                        endDate: 'End date must be on or after the start date.',
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

            <div>
              <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 mb-1.5">
                END DATE <span className="text-red-500 font-bold">*</span>
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

        {/* CARD 3: STORAGE LOCATION */}
        <div className="rounded-2xl bg-white dark:bg-navy-800 p-4 sm:p-5 shadow-xs border border-slate-100 dark:border-navy-700">
          <div className="mb-3 flex items-center gap-2.5">
            <div className="flex h-6 w-6 items-center justify-center rounded-md text-[#FF5B5B] dark:text-rose-400">
              <FiMapPin className="h-4.5 w-4.5" strokeWidth={2.5} />
            </div>
            <h3 className="text-sm sm:text-base font-bold text-navy-800 dark:text-white">
              Storage Location
            </h3>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5">
            <div>
              <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 mb-1.5">
                LOCKER NO
              </label>
              <input
                type="text"
                value={lockerNo}
                onChange={(e) => setLockerNo(e.target.value)}
                placeholder="Ex: L-101"
                className="h-10 w-full rounded-xl bg-white dark:bg-navy-900 px-3.5 text-xs font-medium text-slate-900 dark:text-white outline-none border border-slate-200 dark:border-navy-700 focus:border-[#4318FF] dark:focus:border-brand-400 transition-all placeholder:text-slate-400"
              />
            </div>

            <div>
              <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 mb-1.5">
                SHELF NAME
              </label>
              <input
                type="text"
                value={shelfName}
                onChange={(e) => setShelfName(e.target.value)}
                placeholder="Enter Shelf Name"
                className="h-10 w-full rounded-xl bg-white dark:bg-navy-900 px-3.5 text-xs font-medium text-slate-900 dark:text-white outline-none border border-slate-200 dark:border-navy-700 focus:border-[#4318FF] dark:focus:border-brand-400 transition-all placeholder:text-slate-400"
              />
            </div>

            <div>
              <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 mb-1.5">
                SHELF POSITION
              </label>
              <div className="relative">
                <select
                  value={shelfPosition}
                  onChange={(e) => setShelfPosition(e.target.value as 'Front' | 'Middle' | 'Back')}
                  className="h-10 w-full appearance-none rounded-xl bg-white dark:bg-navy-900 px-3.5 pr-9 text-xs font-medium text-slate-900 dark:text-white outline-none border border-slate-200 dark:border-navy-700 focus:border-[#4318FF] dark:focus:border-brand-400 transition-all"
                >
                  <option value="Front">Front</option>
                  <option value="Middle">Middle</option>
                  <option value="Back">Back</option>
                </select>
                <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-3 text-slate-400">
                  <FiChevronDown className="h-4 w-4" />
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* CARD 4: FILE DETAILS */}
        <div className="rounded-2xl bg-white dark:bg-navy-800 p-4 sm:p-5 shadow-xs border border-slate-100 dark:border-navy-700">
          <div className="mb-3 flex items-center gap-2.5">
            <div className="flex h-6 w-6 items-center justify-center rounded-md text-purple-600 dark:text-purple-400">
              <FiFileText className="h-4.5 w-4.5" strokeWidth={2.5} />
            </div>
            <h3 className="text-sm sm:text-base font-bold text-navy-800 dark:text-white">
              File Details
            </h3>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
            <div>
              <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 mb-1.5">
                PAGE NUMBERS / TOTAL PAGES
              </label>
              <input
                type="number"
                min="0"
                value={totalPages}
                onChange={(e) => {
                  setTotalPages(e.target.value);
                  if (errors.totalPages) setErrors((prev) => ({ ...prev, totalPages: '' }));
                }}
                placeholder="Total pages"
                className={inputClass('totalPages')}
              />
              {errors.totalPages && (
                <p className="mt-1 flex items-center gap-1 text-[11px] font-semibold text-red-500">
                  <FiAlertCircle className="h-3.5 w-3.5" />
                  {errors.totalPages}
                </p>
              )}
            </div>

            <div>
              <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 mb-1.5">
                NUMBER OF MINUTES SHEETS
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
                  placeholder="Minutes sheets count"
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

        {/* ACTION BUTTONS */}
        <div className="mt-1 flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={handleCancel}
            disabled={isSubmitting}
            className="flex h-10 items-center justify-center rounded-xl bg-white dark:bg-navy-800 px-6 text-xs font-bold text-[#1B254B] dark:text-white border border-slate-200 dark:border-navy-700 shadow-xs hover:bg-slate-50 dark:hover:bg-navy-700 active:scale-[0.98] transition-all disabled:opacity-50 cursor-pointer"
          >
            Cancel
          </button>

          <button
            type="submit"
            disabled={isSubmitting}
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
                  <circle className="opacity-25" cx="12" cy="12" r="10" strokeWidth="4" stroke="currentColor" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                <span>Submitting...</span>
              </>
            ) : (
              <>
                <FiSave className="h-3.5 w-3.5" />
                <span>Submit File</span>
              </>
            )}
          </button>
        </div>
      </form>

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
