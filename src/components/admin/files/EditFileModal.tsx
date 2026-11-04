'use client';

import React, { useEffect, useId, useMemo, useState } from 'react';
import { FiEdit2, FiSave, FiChevronDown, FiAlertCircle } from 'react-icons/fi';
import type { FileRecordRow } from 'models/FileRepository';
import { fetchClientSections } from 'lib/sectionsClient';
import FileModalShell from './FileModalShell';
import Button from 'components/ui/Button';

interface SectionOption {
  id?: number | string;
  name: string;
  status?: string;
}

const FIELD_CLASS =
  'h-10 w-full rounded-xl border border-slate-200 bg-white px-3.5 text-xs font-medium text-slate-900 outline-none transition-colors focus:border-[#4318FF] focus:ring-2 focus:ring-[#4318FF]/15 dark:border-navy-700 dark:bg-navy-900 dark:text-white';
const LABEL_CLASS =
  'mb-1 block text-[11px] font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300';

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
  const formId = useId();
  const [fileName, setFileName] = useState('');
  const [section, setSection] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [lockerNo, setLockerNo] = useState('');
  const [shelfName, setShelfName] = useState('');
  const [shelfPosition, setShelfPosition] = useState<'Front' | 'Middle' | 'Back'>('Front');
  const [totalPages, setTotalPages] = useState('');
  const [minuteSheets, setMinuteSheets] = useState('');
  const [sectionsList, setSectionsList] = useState<SectionOption[]>([]);
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
    // Only Active sections are selectable, but the file's current section is
    // included so a record that sits in a now-disabled section keeps showing
    // its real value instead of silently changing.
    const currentSection = file?.section_name || '';
    fetchClientSections(false, {
      activeOnly: true,
      include: currentSection || undefined,
    })
      .then((sections) => {
        if (Array.isArray(sections)) setSectionsList(sections);
      })
      .catch(() => {});
  }, [file?.section_name]);

  const sectionOptions = useMemo(() => {
    if (!section) return sectionsList;
    return sectionsList.some((opt) => opt.name === section)
      ? sectionsList
      : [{ id: 'current', name: section }, ...sectionsList];
  }, [section, sectionsList]);

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
    <FileModalShell
      title="Edit File Record"
      subtitle={<span className="font-mono">{file.file_no}</span>}
      icon={<FiEdit2 className="h-5 w-5" />}
      iconTone="brand"
      onClose={onCancel}
      closeDisabled={loading}
      size="md"
      footer={
        <>
          <Button
            type="button"
            variant="cancel"
            size="sm"
            onClick={onCancel}
            disabled={loading}
            className="flex-1"
          >
            Cancel
          </Button>
          <button
            type="submit"
            form={formId}
            disabled={loading}
            className="flex flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-xl bg-[#4318FF] py-2.5 text-xs font-bold text-white shadow-md shadow-[#4318FF]/25 transition-all hover:bg-brand-600 hover:shadow-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-[#4318FF] focus-visible:ring-offset-2 active:scale-95 disabled:cursor-not-allowed disabled:opacity-60 dark:focus-visible:ring-offset-navy-800"
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
        </>
      }
    >
      {error && (
        <div
          role="alert"
          className="mb-3 flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 p-2.5 text-xs font-semibold text-rose-600 dark:border-rose-900/50 dark:bg-rose-950/30 dark:text-rose-300"
        >
          <FiAlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <form id={formId} onSubmit={handleSubmit} className="flex flex-col gap-3.5 text-xs">
        {/* File Name */}
        <div>
          <label htmlFor="edit-file-name" className={LABEL_CLASS}>
            File Name *
          </label>
          <input
            id="edit-file-name"
            type="text"
            value={fileName}
            autoFocus
            onChange={(e) => {
              setFileName(e.target.value);
              if (error) setError(null);
            }}
            className={FIELD_CLASS}
          />
        </div>

        {/* Section */}
        <div>
          <label htmlFor="edit-section" className={LABEL_CLASS}>
            Section *
          </label>
          <div className="relative">
            <select
              id="edit-section"
              value={section}
              onChange={(e) => setSection(e.target.value)}
              className={`${FIELD_CLASS} appearance-none pr-9`}
            >
              {sectionOptions.map((opt, i) => (
                <option key={opt.id ?? i} value={opt.name}>
                  {opt.status === 'disabled' ? `${opt.name} (Disabled)` : opt.name}
                </option>
              ))}
            </select>
            <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-3 text-slate-400">
              <FiChevronDown className="h-4 w-4" />
            </div>
          </div>
        </div>

        {/* Locker / Shelf / Position */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div>
            <label htmlFor="edit-locker" className={LABEL_CLASS}>
              Locker No
            </label>
            <input
              id="edit-locker"
              type="text"
              value={lockerNo}
              onChange={(e) => setLockerNo(e.target.value)}
              placeholder="Ex: L-101"
              className={`${FIELD_CLASS} px-3`}
            />
          </div>
          <div>
            <label htmlFor="edit-shelf" className={LABEL_CLASS}>
              Shelf Name
            </label>
            <input
              id="edit-shelf"
              type="text"
              value={shelfName}
              onChange={(e) => setShelfName(e.target.value)}
              placeholder="Ex: Shelf 2"
              className={`${FIELD_CLASS} px-3`}
            />
          </div>
          <div>
            <label htmlFor="edit-position" className={LABEL_CLASS}>
              Position
            </label>
            <select
              id="edit-position"
              value={shelfPosition}
              onChange={(e) => setShelfPosition(e.target.value as 'Front' | 'Middle' | 'Back')}
              className={`${FIELD_CLASS} px-3`}
            >
              <option value="Front">Front</option>
              <option value="Middle">Middle</option>
              <option value="Back">Back</option>
            </select>
          </div>
        </div>

        {/* Date Range */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label htmlFor="edit-start-date" className={LABEL_CLASS}>
              Start Date
            </label>
            <input
              id="edit-start-date"
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className={`${FIELD_CLASS} px-3`}
            />
          </div>
          <div>
            <label htmlFor="edit-end-date" className={LABEL_CLASS}>
              End Date
            </label>
            <input
              id="edit-end-date"
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className={`${FIELD_CLASS} px-3`}
            />
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label htmlFor="edit-page-numbers" className={LABEL_CLASS}>
              Page Numbers
            </label>
            <input
              id="edit-page-numbers"
              type="number"
              min="0"
              value={totalPages}
              onChange={(e) => setTotalPages(e.target.value)}
              className={`${FIELD_CLASS} px-3`}
            />
          </div>
          <div>
            <label htmlFor="edit-minute-sheets" className={LABEL_CLASS}>
              Minute Sheets Count
            </label>
            <input
              id="edit-minute-sheets"
              type="number"
              min="0"
              value={minuteSheets}
              onChange={(e) => setMinuteSheets(e.target.value)}
              className={`${FIELD_CLASS} px-3`}
            />
          </div>
        </div>
      </form>
    </FileModalShell>
  );
}
