'use client';

import React, { useEffect, useState } from 'react';
import {
  FiEdit2,
  FiX,
  FiFolder,
  FiMapPin,
  FiCalendar,
  FiSave,
  FiChevronDown,
} from 'react-icons/fi';
import type { FileRecordRow } from 'models/FileRepository';

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

export default function EditFileModal({
  file,
  loading = false,
  onSave,
  onCancel,
}: {
  file: FileRecordRow | null;
  loading?: boolean;
  onSave: (payload: Partial<FileRecordRow>) => void;
  onCancel: () => void;
}) {
  const [fileName, setFileName] = useState('');
  const [section, setSection] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [lockerNo, setLockerNo] = useState('');
  const [shelfName, setShelfName] = useState('');
  const [shelfPosition, setShelfPosition] = useState<'Front' | 'Middle' | 'Back'>('Front');
  const [totalPages, setTotalPages] = useState('');
  const [minuteSheets, setMinuteSheets] = useState('');
  const [sectionsList, setSectionsList] = useState<SectionOption[]>(DEFAULT_SECTIONS);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (file) {
      setFileName(file.file_name || '');
      setSection(file.section_name || '');
      setStartDate(file.start_date || '');
      setEndDate(file.end_date || '');
      setLockerNo(file.locker_no || '');
      setShelfName(file.shelf_name || '');
      setShelfPosition(file.shelf_position || 'Front');
      setTotalPages(file.page_numbers ? String(file.page_numbers) : '0');
      setMinuteSheets(file.minute_sheets_count ? String(file.minute_sheets_count) : '0');
      setError(null);
    }
  }, [file]);

  useEffect(() => {
    fetch('/api/sections')
      .then((res) => (res.ok ? res.json() : null))
      .then((json) => {
        if (json?.ok && Array.isArray(json.data?.sections) && json.data.sections.length > 0) {
          setSectionsList(json.data.sections);
        }
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !loading) onCancel();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [loading, onCancel]);

  if (!file) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!fileName.trim()) {
      setError('File name is required.');
      return;
    }
    if (!section.trim()) {
      setError('Section is required.');
      return;
    }
    if (startDate && endDate && endDate < startDate) {
      setError('End date must be on or after start date.');
      return;
    }

    onSave({
      file_name: fileName.trim(),
      section_name: section.trim(),
      start_date: startDate || file.start_date,
      end_date: endDate || file.end_date,
      locker_no: lockerNo.trim() || null,
      shelf_name: shelfName.trim() || null,
      shelf_position: shelfPosition,
      page_numbers: parseInt(totalPages, 10) || 0,
      minute_sheets_count: parseInt(minuteSheets, 10) || 0,
    });
  };

  return (
    <div
      className="fixed inset-0 z-[90] flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-sm"
      onClick={() => !loading && onCancel()}
    >
      <div
        className="w-full max-w-xl rounded-3xl bg-white p-6 shadow-2xl dark:bg-navy-800 border border-slate-100 dark:border-navy-700 animate-in fade-in zoom-in-95 duration-150 max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-slate-100 dark:border-navy-700 pb-3">
          <div className="flex items-center gap-2.5">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-[#F4F2FF] text-[#4318FF] dark:bg-brand-900/40 dark:text-brand-300">
              <FiEdit2 className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-navy-800 dark:text-white">
                Edit File Record
              </h3>
              <p className="font-mono text-xs text-slate-400">{file.file_no}</p>
            </div>
          </div>
          <button
            onClick={onCancel}
            disabled={loading}
            className="rounded-xl p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-navy-700 dark:hover:text-white transition-colors cursor-pointer"
          >
            <FiX className="h-5 w-5" />
          </button>
        </div>

        {error && (
          <div className="mt-3 rounded-xl bg-rose-50 p-2.5 text-xs font-semibold text-rose-600 border border-rose-200">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="mt-4 flex flex-col gap-3.5 text-xs">
          {/* File Name */}
          <div>
            <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 mb-1">
              File Name *
            </label>
            <input
              type="text"
              value={fileName}
              onChange={(e) => {
                setFileName(e.target.value);
                if (error) setError(null);
              }}
              className="h-10 w-full rounded-xl bg-white dark:bg-navy-900 px-3.5 text-xs font-medium text-slate-900 dark:text-white outline-none border border-slate-200 dark:border-navy-700 focus:border-[#4318FF]"
            />
          </div>

          {/* Section */}
          <div>
            <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 mb-1">
              Section *
            </label>
            <div className="relative">
              <select
                value={section}
                onChange={(e) => setSection(e.target.value)}
                className="h-10 w-full appearance-none rounded-xl bg-white dark:bg-navy-900 px-3.5 pr-9 text-xs font-medium text-slate-900 dark:text-white outline-none border border-slate-200 dark:border-navy-700 focus:border-[#4318FF]"
              >
                {sectionsList.map((s, idx) => (
                  <option key={s.id ?? idx} value={s.name}>
                    {s.name}
                  </option>
                ))}
              </select>
              <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-3 text-slate-400">
                <FiChevronDown className="h-4 w-4" />
              </div>
            </div>
          </div>

          {/* Storage Unit Fields */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 mb-1">
                Locker No
              </label>
              <input
                type="text"
                value={lockerNo}
                onChange={(e) => setLockerNo(e.target.value)}
                placeholder="Ex: L-101"
                className="h-10 w-full rounded-xl bg-white dark:bg-navy-900 px-3 text-xs border border-slate-200 dark:border-navy-700 outline-none focus:border-[#4318FF]"
              />
            </div>
            <div>
              <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 mb-1">
                Shelf Name
              </label>
              <input
                type="text"
                value={shelfName}
                onChange={(e) => setShelfName(e.target.value)}
                placeholder="Ex: Shelf 2"
                className="h-10 w-full rounded-xl bg-white dark:bg-navy-900 px-3 text-xs border border-slate-200 dark:border-navy-700 outline-none focus:border-[#4318FF]"
              />
            </div>
            <div>
              <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 mb-1">
                Position
              </label>
              <select
                value={shelfPosition}
                onChange={(e) => setShelfPosition(e.target.value as any)}
                className="h-10 w-full rounded-xl bg-white dark:bg-navy-900 px-3 text-xs border border-slate-200 dark:border-navy-700 outline-none focus:border-[#4318FF]"
              >
                <option value="Front">Front</option>
                <option value="Middle">Middle</option>
                <option value="Back">Back</option>
              </select>
            </div>
          </div>

          {/* Dates */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 mb-1">
                Start Date
              </label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="h-10 w-full rounded-xl bg-white dark:bg-navy-900 px-3 text-xs border border-slate-200 dark:border-navy-700 outline-none focus:border-[#4318FF]"
              />
            </div>
            <div>
              <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 mb-1">
                End Date
              </label>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="h-10 w-full rounded-xl bg-white dark:bg-navy-900 px-3 text-xs border border-slate-200 dark:border-navy-700 outline-none focus:border-[#4318FF]"
              />
            </div>
          </div>

          {/* Metrics */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 mb-1">
                Total Pages
              </label>
              <input
                type="number"
                min="0"
                value={totalPages}
                onChange={(e) => setTotalPages(e.target.value)}
                className="h-10 w-full rounded-xl bg-white dark:bg-navy-900 px-3 text-xs border border-slate-200 dark:border-navy-700 outline-none focus:border-[#4318FF]"
              />
            </div>
            <div>
              <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 mb-1">
                Minute Sheets Count
              </label>
              <input
                type="number"
                min="0"
                value={minuteSheets}
                onChange={(e) => setMinuteSheets(e.target.value)}
                className="h-10 w-full rounded-xl bg-white dark:bg-navy-900 px-3 text-xs border border-slate-200 dark:border-navy-700 outline-none focus:border-[#4318FF]"
              />
            </div>
          </div>

          <div className="mt-4 flex gap-3 border-t border-slate-100 dark:border-navy-700 pt-3">
            <button
              type="button"
              onClick={onCancel}
              disabled={loading}
              className="flex-1 rounded-xl border border-slate-200 bg-white py-2.5 text-xs font-bold text-slate-600 hover:bg-slate-50 dark:border-navy-600 dark:bg-navy-700 dark:text-slate-300 transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 rounded-xl bg-[#4318FF] hover:bg-brand-600 py-2.5 text-xs font-bold text-white shadow-md shadow-[#4318FF]/25 hover:shadow-lg active:scale-95 transition-all disabled:opacity-60 cursor-pointer flex items-center justify-center gap-1.5"
            >
              {loading ? (
                <>
                  <span className="h-3 w-3 animate-spin rounded-full border-2 border-white border-t-transparent" />
                  <span>Saving...</span>
                </>
              ) : (
                <>
                  <FiSave className="h-4 w-4" />
                  <span>Save Changes</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
