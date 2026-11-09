'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  FiSearch,
  FiEye,
  FiMapPin,
  FiCheckCircle,
  FiClock,
  FiXCircle,
  FiCheck,
  FiX,
  FiRefreshCw,
  FiFileText,
  FiChevronLeft,
  FiChevronRight,
  FiArchive,
  FiCalendar,
  FiFilter,
  FiLayers,
  FiPlusCircle,
  FiFolder,
  FiSend,
} from 'react-icons/fi';
import { Trans, useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import ViewFileModal from 'components/admin/files/ViewFileModal';
import { useToast } from 'components/toast/ToastContext';
import { useProfile } from 'contexts/ProfileContext';
import { TABLE_BODY_CLASS } from 'lib/tableStyles';
import { formatSriLankaDate, formatSriLankaTime } from 'lib/datetime';
import type { FileRecordRow } from 'models/FileRepository';
import { fetchClientSections } from 'lib/sectionsClient';
import { localizeField, useLocalizedFields } from 'lib/useLocalizedFields';

function getInitials(name?: string | null): string {
  if (!name) return 'SO';
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function getSectionBadge(section?: string | null) {
  const s = (section || '').toLowerCase();
  if (s.includes('legal') || s.includes('contract')) {
    return 'bg-purple-50 text-purple-700 border-purple-200/90 dark:bg-purple-950/40 dark:text-purple-300 dark:border-purple-800';
  }
  if (s.includes('land') || s.includes('hydrology') || s.includes('water') || s.includes('survey')) {
    return 'bg-emerald-50 text-emerald-700 border-emerald-200/90 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800';
  }
  if (s.includes('engineering') || s.includes('irrigation')) {
    return 'bg-blue-50 text-blue-700 border-blue-200/90 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-800';
  }
  if (s.includes('finance') || s.includes('account') || s.includes('audit')) {
    return 'bg-sky-50 text-sky-700 border-sky-200/90 dark:bg-sky-950/40 dark:text-sky-300 dark:border-sky-800';
  }
  if (s.includes('it') || s.includes('tech') || s.includes('information')) {
    return 'bg-indigo-50 text-indigo-700 border-indigo-200/90 dark:bg-indigo-950/40 dark:text-indigo-300 dark:border-indigo-800';
  }
  if (s.includes('admin') || s.includes('hr')) {
    return 'bg-amber-50 text-amber-700 border-amber-200/90 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800';
  }
  return 'bg-slate-50 text-slate-700 border-slate-200 dark:bg-navy-900 dark:text-slate-300 dark:border-navy-700';
}

function getCompactLocation(file: FileRecordRow, t: TFunction) {
  const shelfName = localizeField(file.shelf_name);
  const shelfPosition = localizeField(file.shelf_position);
  const repository = localizeField(file.archive_repository);

  let primary = '';
  if (file.locker_no && shelfName) {
    primary = t('staff.locationBoth', { locker: file.locker_no, shelf: shelfName });
  } else if (file.locker_no) {
    primary = t('staff.locationLocker', { locker: file.locker_no });
  } else if (shelfName) {
    primary = t('staff.locationShelf', { shelf: shelfName });
  } else {
    primary = repository || t('detail.centralRecordRoom');
  }

  const secondaryParts = [];
  if (shelfPosition) {
    secondaryParts.push(t('detail.positionLabel', { value: shelfPosition }));
  }
  if (repository && (file.locker_no || shelfName)) {
    secondaryParts.push(repository);
  }

  return {
    primary,
    secondary: secondaryParts.join(' • ') || t('staff.mainRepository'),
  };
}

export default function StaffFilesPage() {
  const { t } = useTranslation('files');
  const { profile } = useProfile();
  const router = useRouter();
  const { showToast } = useToast();

  const [activeTab, setActiveTab] = useState<'all' | 'mine'>('all');
  const [files, setFiles] = useState<FileRecordRow[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [debouncedSearchTerm, setDebouncedSearchTerm] = useState<string>('');
  const [selectedSection, setSelectedSection] = useState<string>('all');
  const [dateFrom, setDateFrom] = useState<string>('');
  const [dateTo, setDateTo] = useState<string>('');
  const [sectionsList, setSectionsList] = useState<{ id?: number | string; name: string }[]>([]);
  const [page, setPage] = useState<number>(1);
  const [total, setTotal] = useState<number>(0);
  const [totalPages, setTotalPages] = useState<number>(1);
  const [refreshKey, setRefreshKey] = useState(0);
  const [requestingFileId, setRequestingFileId] = useState<number | null>(null);
  const LIMIT = 15;

  const [viewingFile, setViewingFile] = useState<FileRecordRow | null>(null);
  const [locationFile, setLocationFile] = useState<FileRecordRow | null>(null);

  useLocalizedFields([
    ...files.flatMap((file) => [
      file.file_name,
      file.section_name,
      file.shelf_name,
      file.shelf_position,
      file.archive_repository,
    ]),
    ...sectionsList.map((section) => section.name),
  ]);

  // Debounce search term
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearchTerm(searchTerm);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  // Check if any filter is active
  const hasActiveFilters = Boolean(
    debouncedSearchTerm.trim() ||
    (selectedSection && selectedSection !== 'all') ||
    dateFrom ||
    dateTo
  );

  const handleResetFilters = () => {
    setSearchTerm('');
    setDebouncedSearchTerm('');
    setSelectedSection('all');
    setDateFrom('');
    setDateTo('');
    setPage(1);
  };

  // Load sections
  useEffect(() => {
    fetchClientSections()
      .then((secs) => {
        if (Array.isArray(secs)) setSectionsList(secs);
      })
      .catch(() => {});
  }, []);

  // Fetch files
  const loadFiles = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        tab: activeTab === 'mine' ? 'recent' : 'all',
        page: String(page),
        limit: String(LIMIT),
        sort: 'newest',
        // Staff list shows files only — no summary badges or approval setting.
        includeMeta: 'false',
      });

      if (debouncedSearchTerm.trim()) params.set('search', debouncedSearchTerm.trim());
      if (selectedSection && selectedSection !== 'all') params.set('section', selectedSection);
      if (dateFrom) params.set('dateFrom', dateFrom);
      if (dateTo) params.set('dateTo', dateTo);
      if (activeTab === 'mine' && profile?.id) {
        params.set('registered_by', profile.id);
      }

      const res = await fetch(`/api/admin/files?${params.toString()}`);
      if (res.ok) {
        const json = await res.json();
        if (json?.ok && json.data) {
          setFiles(json.data.files || []);
          setTotal(json.data.total || 0);
          setTotalPages(json.data.totalPages || 1);
        }
      }
    } catch {
      // Fallback
    } finally {
      setLoading(false);
    }
  }, [activeTab, page, debouncedSearchTerm, selectedSection, dateFrom, dateTo, profile?.id]);

  useEffect(() => {
    loadFiles();
  }, [loadFiles, refreshKey]);

  return (
    <div className="w-full space-y-5 pb-12 font-dm">
      {/* ── Page Header ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pt-2">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-2xl font-black tracking-tight text-[#1B2559] dark:text-white">
              {t('staff.title')}
            </h1>
            <span className="inline-flex items-center rounded-full bg-indigo-50 dark:bg-brand-900/40 border border-indigo-100 dark:border-brand-800/60 px-2.5 py-0.5 text-xs font-bold text-[#4318FF] dark:text-brand-300">
              {t('staff.fileCount', { count: total })}
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-0.5">
            {t('staff.subtitle')}
          </p>
        </div>

        {/* Quick action buttons */}
        <div className="flex flex-wrap items-center gap-2.5">
          <Link
            href="/staff/request-file"
            className="inline-flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-[#4318FF] to-[#3B82F6] px-3.5 py-2 text-xs font-bold text-white shadow-xs shadow-indigo-500/20 hover:from-[#3510db] hover:to-[#2563EB] transition cursor-pointer"
          >
            <FiSend className="h-3.5 w-3.5" />
            <span>{t('staff.requestFile')}</span>
          </Link>
          <Link
            href="/staff/add-new-file"
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-bold text-slate-700 shadow-xs hover:bg-slate-50 dark:border-navy-700 dark:bg-navy-800 dark:text-slate-200 dark:hover:bg-navy-700 transition cursor-pointer"
          >
            <FiPlusCircle className="h-3.5 w-3.5 text-[#4318FF]" />
            <span>{t('addFile.title')}</span>
          </Link>
          <button
            type="button"
            onClick={() => setRefreshKey((key) => key + 1)}
            disabled={loading}
            aria-busy={loading}
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700 shadow-xs hover:bg-slate-50 dark:border-navy-700 dark:bg-navy-800 dark:text-slate-200 dark:hover:bg-navy-700 transition cursor-pointer"
            title={t('staff.refreshTitle')}
          >
            <FiRefreshCw className={`h-3.5 w-3.5 text-slate-500 ${loading ? 'animate-spin' : ''}`} />
            <span className="hidden sm:inline">{t('common:buttons.refresh')}</span>
          </button>
        </div>
      </div>

      {/* ── Main Table Card Container ── */}
      <div className="rounded-3xl bg-white p-5 shadow-sm border border-slate-100 dark:bg-navy-800 dark:border-navy-700">
        {/* Filters Header Bar */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-4 border-b border-slate-100 dark:border-navy-700">
          <div className="flex flex-wrap items-center gap-2.5 flex-1">
            {/* Search Input */}
            <div className="relative flex h-10 w-full sm:w-72 items-center rounded-xl border border-slate-200 bg-slate-50/80 px-3.5 text-slate-800 focus-within:border-[#4318FF] focus-within:bg-white focus-within:ring-2 focus-within:ring-[#4318FF]/15 transition-all dark:border-navy-700 dark:bg-navy-900 dark:text-white dark:focus-within:bg-navy-900">
              <FiSearch className="h-4 w-4 shrink-0 text-slate-400" />
              <input
                type="text"
                value={searchTerm}
                onChange={(event) => {
                  setSearchTerm(event.target.value);
                  setPage(1);
                }}
                placeholder={t('staff.searchPlaceholder')}
                aria-label={t('filters.searchAria')}
                className="ml-2.5 w-full bg-transparent text-xs font-semibold outline-none placeholder:text-slate-400 dark:placeholder:text-slate-500"
              />
              {searchTerm && (
                <button
                  type="button"
                  onClick={() => setSearchTerm('')}
                  className="rounded-full p-1 text-slate-400 hover:text-slate-600 dark:hover:text-white transition cursor-pointer"
                  title={t('staff.clearSearch')}
                >
                  <FiX className="h-3.5 w-3.5" />
                </button>
              )}
            </div>

            {/* Section Filter Dropdown */}
            <div className="relative flex h-10 items-center rounded-xl border border-slate-200 bg-slate-50/80 px-3 text-slate-700 dark:border-navy-700 dark:bg-navy-900 dark:text-white">
              <FiFolder className="h-3.5 w-3.5 text-slate-400 shrink-0 mr-2" />
              <select
                value={selectedSection}
                onChange={(e) => {
                  setSelectedSection(e.target.value);
                  setPage(1);
                }}
                className="bg-transparent text-xs font-semibold outline-none cursor-pointer pr-2 truncate max-w-[170px]"
                aria-label={t('filters.sectionAria')}
              >
                <option value="all" className="dark:bg-navy-800">{t('staff.allSections')}</option>
                {sectionsList.map((sec) => (
                  <option key={sec.id || sec.name} value={sec.name} className="dark:bg-navy-800">
                    {localizeField(sec.name)}
                  </option>
                ))}
              </select>
            </div>

            {/* Date Range - From */}
            <label className="flex h-10 items-center gap-2 rounded-xl border border-slate-200 bg-slate-50/80 px-3 text-[11px] font-semibold text-slate-500 dark:border-navy-700 dark:bg-navy-900 dark:text-slate-300">
              <FiCalendar className="h-3.5 w-3.5 text-slate-400" />
              <span className="text-slate-400 font-medium">{t('staff.from')}</span>
              <input
                type="date"
                aria-label={t('staff.fromAria')}
                value={dateFrom}
                max={dateTo || undefined}
                onChange={(event) => {
                  setDateFrom(event.target.value);
                  setPage(1);
                }}
                className="w-[115px] bg-transparent text-xs font-semibold text-slate-700 outline-none dark:text-white cursor-pointer"
              />
            </label>

            {/* Date Range - To */}
            <label className="flex h-10 items-center gap-2 rounded-xl border border-slate-200 bg-slate-50/80 px-3 text-[11px] font-semibold text-slate-500 dark:border-navy-700 dark:bg-navy-900 dark:text-slate-300">
              <FiCalendar className="h-3.5 w-3.5 text-slate-400" />
              <span className="text-slate-400 font-medium">{t('staff.to')}</span>
              <input
                type="date"
                aria-label={t('staff.toAria')}
                value={dateTo}
                min={dateFrom || undefined}
                onChange={(event) => {
                  setDateTo(event.target.value);
                  setPage(1);
                }}
                className="w-[115px] bg-transparent text-xs font-semibold text-slate-700 outline-none dark:text-white cursor-pointer"
              />
            </label>

            {/* Reset Filters Button */}
            {hasActiveFilters && (
              <button
                type="button"
                onClick={handleResetFilters}
                className="inline-flex h-10 items-center gap-1.5 rounded-xl border border-rose-200 bg-rose-50/70 px-3 text-xs font-bold text-rose-600 hover:bg-rose-100 dark:border-rose-900/60 dark:bg-rose-950/40 dark:text-rose-300 transition cursor-pointer"
                title={t('staff.resetTitle')}
              >
                <FiX className="h-3.5 w-3.5" />
                <span>{t('staff.reset')}</span>
              </button>
            )}
          </div>

          {/* Results count text */}
          <div className="text-xs font-medium text-slate-400 text-right self-center shrink-0">
            {loading ? (
              <span className="inline-flex items-center gap-1.5 text-indigo-600 dark:text-indigo-400">
                <FiRefreshCw className="h-3 w-3 animate-spin" />
                {t('staff.searching')}
              </span>
            ) : (
              <span>
                <Trans
                  ns="files"
                  i18nKey="staff.showingCount"
                  values={{ shown: files.length, total }}
                  components={{ strong: <strong /> }}
                />
              </span>
            )}
          </div>
        </div>

        {/* ── Table View ── */}
        <div className="relative mt-4 w-full overflow-x-auto" aria-busy={loading}>
          {loading && files.length === 0 ? (
            /* Skeleton Loading State */
            <div role="status" aria-label={t('table.loadingFilesAria')} className="space-y-3 py-4">
              <div className="flex items-center gap-2 text-xs font-bold text-slate-400">
                <FiRefreshCw className="h-3.5 w-3.5 animate-spin text-[#4318FF]" />
                <span>{t('staff.loadingArchive')}</span>
              </div>
              {Array.from({ length: 6 }, (_, index) => (
                <div
                  key={index}
                  className="flex items-center gap-4 rounded-xl bg-slate-50/60 dark:bg-navy-900/40 p-3.5 animate-pulse"
                >
                  <span className="h-4 w-7 rounded bg-slate-200 dark:bg-navy-700" />
                  <span className="h-6 w-28 rounded-lg bg-slate-200 dark:bg-navy-700" />
                  <span className="h-5 flex-1 rounded bg-slate-200 dark:bg-navy-700" />
                  <span className="h-5 w-28 rounded-full bg-slate-200 dark:bg-navy-700" />
                  <span className="h-8 w-32 rounded bg-slate-200 dark:bg-navy-700" />
                  <span className="h-7 w-40 rounded-xl bg-slate-200 dark:bg-navy-700" />
                  <span className="h-5 w-24 rounded bg-slate-200 dark:bg-navy-700" />
                  <span className="h-7 w-32 rounded-xl bg-slate-200 dark:bg-navy-700" />
                </div>
              ))}
            </div>
          ) : files.length === 0 ? (
            /* Empty State */
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-indigo-50 text-[#4318FF] dark:bg-navy-900 dark:text-brand-300 mb-3 shadow-xs">
                <FiFileText className="h-8 w-8" />
              </div>
              <p className="text-base font-bold text-slate-800 dark:text-white">{t('staff.noFilesTitle')}</p>
              <p className="mt-1 text-xs text-slate-400 max-w-sm">
                {hasActiveFilters
                  ? t('staff.noFilesFilteredHint')
                  : t('staff.noFilesHint')}
              </p>
              {hasActiveFilters && (
                <button
                  type="button"
                  onClick={handleResetFilters}
                  className="mt-4 inline-flex items-center gap-1.5 rounded-xl bg-[#4318FF] px-4 py-2 text-xs font-bold text-white shadow-xs hover:bg-[#3510db] transition cursor-pointer"
                >
                  <FiX className="h-3.5 w-3.5" />
                  <span>{t('staff.clearAllFilters')}</span>
                </button>
              )}
            </div>
          ) : (
            /* Data Table */
            <table aria-label={t('table.staffAria')} className="w-full text-left border-collapse table-auto min-w-[1040px]">
              <thead>
                <tr className="border-b border-slate-100 dark:border-navy-700 bg-slate-50/70 dark:bg-navy-900/50 text-[10px] font-black uppercase tracking-wider text-slate-400 dark:text-slate-400">
                  <th scope="col" className="py-3 px-3 w-12 text-center">{t('table.colNo')}</th>
                  <th scope="col" className="py-3 px-3 whitespace-nowrap min-w-[130px]">{t('table.colFileNumber')}</th>
                  <th scope="col" className="py-3 px-3 min-w-[220px]">{t('table.colFileName')}</th>
                  <th scope="col" className="py-3 px-3 min-w-[140px]">{t('table.colSection')}</th>
                  <th scope="col" className="py-3 px-3 whitespace-nowrap min-w-[180px]">{t('table.colStartEndDate')}</th>
                  <th scope="col" className="py-3 px-3 min-w-[210px]">{t('table.colFileLocation')}</th>
                  <th scope="col" className="py-3 px-3 whitespace-nowrap min-w-[140px]">{t('table.colLastUpdated')}</th>
                  <th scope="col" className="py-3 px-3 text-center whitespace-nowrap min-w-[170px]">{t('table.colAction')}</th>
                </tr>
              </thead>
              <tbody className={TABLE_BODY_CLASS}>
                {files.map((file, idx) => {
                  const location = getCompactLocation(file, t);
                  const rowNo = String((page - 1) * LIMIT + idx + 1).padStart(2, '0');
                  const updatedDate = file.updated_at || file.created_at;
                  const dateFormatted = updatedDate ? formatSriLankaDate(updatedDate) : '—';
                  const timeFormatted = updatedDate ? formatSriLankaTime(updatedDate) : '';

                  return (
                    <tr
                      key={file.id ?? idx}
                      className="group/row hover:bg-indigo-50/30 dark:hover:bg-navy-700/50 transition-colors"
                    >
                      {/* NO */}
                      <td className="py-3 px-3 text-center font-bold text-slate-400 whitespace-nowrap">
                        <span className="inline-block rounded-md bg-slate-100 dark:bg-navy-900 px-2 py-0.5 text-[11px] font-mono text-slate-500 dark:text-slate-400">
                          {rowNo}
                        </span>
                      </td>

                      {/* FILE NUMBER */}
                      <td className="py-3 px-3 break-words [overflow-wrap:anywhere]">
                        <button
                          type="button"
                          onClick={() => setViewingFile(file)}
                          className="inline-flex max-w-full items-center gap-1.5 rounded-lg bg-indigo-50/80 hover:bg-indigo-100 dark:bg-brand-900/30 dark:hover:bg-brand-900/60 px-2.5 py-1 text-left text-xs font-bold text-[#4318FF] dark:text-brand-300 border border-indigo-100/80 dark:border-brand-800/50 transition-all cursor-pointer font-mono tracking-tight break-words [overflow-wrap:anywhere]"
                          title={file.file_no || t('staff.viewHint')}
                        >
                          <span className="min-w-0">{file.file_no}</span>
                        </button>
                      </td>

                      {/* FILE NAME */}
                      <td className="py-3 px-3">
                        <div
                          className="font-bold text-slate-800 dark:text-white leading-snug line-clamp-2 text-xs hover:text-[#4318FF] dark:hover:text-brand-300 transition-colors cursor-pointer"
                          onClick={() => setViewingFile(file)}
                          title={file.file_name}
                        >
                          {localizeField(file.file_name)}
                        </div>
                        <div className="flex items-center gap-2 mt-0.5 text-[10px] text-muted">
                          {file.page_numbers ? (
                            <span>{t('staff.pages', { count: file.page_numbers })}</span>
                          ) : null}
                        </div>
                      </td>

                      {/* SECTION */}
                      <td className="py-3 px-3">
                        <span
                          className={`inline-flex max-w-full items-center gap-1.5 whitespace-normal break-words rounded-full px-2.5 py-1 text-[11px] font-bold border leading-snug shadow-2xs ${getSectionBadge(
                            file.section_name,
                          )}`}
                          title={localizeField(file.section_name) || t('staff.generalRecord')}
                        >
                          <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-current opacity-70" />
                          <span className="min-w-0">
                            {localizeField(file.section_name) || t('staff.generalRecord')}
                          </span>
                        </span>
                      </td>

                      {/* START / END DATE */}
                      <td className="py-3 px-3 whitespace-nowrap">
                        <div className="flex items-center gap-2">
                          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-slate-100 dark:bg-navy-900 text-slate-400 shrink-0">
                            <FiCalendar className="h-3.5 w-3.5" />
                          </div>
                          <div className="leading-tight">
                            <p className="font-bold text-slate-700 dark:text-slate-200 text-xs">
                              {file.start_date ? formatSriLankaDate(file.start_date) : '—'}
                            </p>
                            <p className="text-[10px] text-muted font-medium mt-0.5">
                              {t('staff.dateRangeTo', { date: file.end_date ? formatSriLankaDate(file.end_date) : '—' })}
                            </p>
                          </div>
                        </div>
                      </td>

                      {/* FILE LOCATION */}
                      <td className="py-3 px-3">
                        <button
                          type="button"
                          onClick={() => setLocationFile(file)}
                          className="group/loc inline-flex items-center gap-2 rounded-xl bg-slate-50 hover:bg-indigo-50/60 dark:bg-navy-900/60 dark:hover:bg-navy-900 border border-slate-200/80 hover:border-indigo-300/80 dark:border-navy-700 px-3 py-1.5 text-left transition-all cursor-pointer max-w-full min-w-0"
                          title={t('staff.locationHint')}
                        >
                          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-indigo-500/10 text-[#4318FF] dark:bg-brand-900/40 dark:text-brand-300 group-hover/loc:bg-[#4318FF] group-hover/loc:text-white transition-all">
                            <FiMapPin className="h-3.5 w-3.5" />
                          </div>
                          <div className="min-w-0 flex-1 leading-tight">
                            <p className="font-bold text-slate-800 dark:text-white text-xs whitespace-normal break-words">
                              {location.primary}
                            </p>
                            <p className="text-[10px] font-medium text-slate-400 dark:text-slate-400 whitespace-normal break-words mt-0.5">
                              {location.secondary}
                            </p>
                          </div>
                        </button>
                      </td>

                      {/* LAST UPDATED DATE */}
                      <td className="py-3 px-3 whitespace-nowrap">
                        <div className="flex items-center gap-2">
                          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-slate-100 dark:bg-navy-900 text-slate-400 shrink-0">
                            <FiCalendar className="h-3.5 w-3.5" />
                          </div>
                          <div className="leading-tight">
                            <p className="font-bold text-slate-700 dark:text-slate-200 text-xs">
                              {dateFormatted}
                            </p>
                            {timeFormatted ? (
                              <p className="text-[10px] text-muted font-medium mt-0.5">
                                {timeFormatted}
                              </p>
                            ) : null}
                          </div>
                        </div>
                      </td>

                      {/* ACTION: View & Request Buttons */}
                      <td className="min-w-0 py-3 px-3 text-center align-top">
                        <div className="flex flex-wrap items-center justify-center gap-2">
                          {/* View Button */}
                          <button
                            type="button"
                            onClick={() => setViewingFile(file)}
                            className="inline-flex min-w-fit items-center gap-1.5 whitespace-nowrap rounded-xl border border-slate-200 bg-white hover:bg-slate-50 hover:border-[#4318FF]/50 hover:text-[#4318FF] dark:border-navy-600 dark:bg-navy-800 dark:text-slate-200 dark:hover:bg-navy-700 px-3 py-1.5 text-xs font-bold text-slate-700 shadow-2xs transition-all cursor-pointer active:scale-95"
                            title={t('staff.viewTitle')}
                          >
                            <FiEye className="h-3.5 w-3.5 text-[#4318FF] dark:text-brand-300" />
                            <span>{t('common:buttons.view')}</span>
                          </button>

                          {/* Request Button */}
                          <button
                            type="button"
                            disabled={!file.id || requestingFileId !== null}
                            onClick={() => {
                              if (!file.id) return;
                              setRequestingFileId(file.id);
                              router.push(`/staff/request-file?file_no=${encodeURIComponent(file.file_no)}`);
                            }}
                            aria-busy={requestingFileId === file.id}
                            className="inline-flex min-w-fit items-center gap-1.5 whitespace-nowrap rounded-xl bg-gradient-to-r from-[#4318FF] to-[#3B82F6] hover:from-[#3510db] hover:to-[#2563EB] px-3.5 py-1.5 text-xs font-bold text-white shadow-xs shadow-indigo-500/20 transition-all active:scale-95 disabled:cursor-not-allowed disabled:opacity-60 cursor-pointer"
                            title={t('staff.requestAccessTitle')}
                          >
                            {requestingFileId === file.id ? (
                              <FiRefreshCw className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <FiSend className="h-3.5 w-3.5" />
                            )}
                            <span>{requestingFileId === file.id ? t('staff.opening') : t('staff.request')}</span>
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* ── Pagination Footer ── */}
        {totalPages > 1 && (
          <div className="flex flex-col sm:flex-row items-center justify-between border-t border-slate-100 dark:border-navy-700 pt-4 mt-4 gap-3 text-xs text-slate-500">
            <div>
              <Trans
                ns="files"
                i18nKey="pagination.staffRange"
                values={{
                  from: (page - 1) * LIMIT + 1,
                  to: Math.min(page * LIMIT, total),
                  total,
                }}
                components={{ b: <span className="font-bold text-slate-700 dark:text-white" /> }}
              />
            </div>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
                className="inline-flex h-8 items-center gap-1 rounded-lg border border-slate-200 dark:border-navy-700 bg-white dark:bg-navy-800 px-2.5 text-xs font-semibold disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-50 transition cursor-pointer"
              >
                <FiChevronLeft className="h-3.5 w-3.5" />
                <span>{t('pagination.prev')}</span>
              </button>
              <div className="flex items-center px-2 font-bold text-slate-700 dark:text-slate-200">
                {t('common:table.pageOf', { page, totalPages })}
              </div>
              <button
                type="button"
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
                className="inline-flex h-8 items-center gap-1 rounded-lg border border-slate-200 dark:border-navy-700 bg-white dark:bg-navy-800 px-2.5 text-xs font-semibold disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-50 transition cursor-pointer"
              >
                <span>{t('common:buttons.next')}</span>
                <FiChevronRight className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ── View File Modal ── */}
      {viewingFile && (
        <ViewFileModal file={viewingFile} onClose={() => setViewingFile(null)} isStaffView={true} />
      )}

      {/* ── Visual Location Coordinates Modal ── */}
      {locationFile && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-xs animate-fadeIn"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setLocationFile(null);
          }}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="file-location-title"
            className="w-full max-w-md rounded-3xl border border-slate-100 bg-white p-6 shadow-2xl dark:border-navy-700 dark:bg-navy-800"
          >
            {/* Modal Header */}
            <div className="mb-5 flex items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-indigo-500/10 text-[#4318FF] dark:bg-brand-900/40 dark:text-brand-300 shrink-0">
                  <FiMapPin className="h-6 w-6" />
                </div>
                <div>
                  <h2 id="file-location-title" className="text-base font-bold text-[#1B2559] dark:text-white">
                    {t('staff.locationModalTitle')}
                  </h2>
                  <p className="text-xs font-semibold text-indigo-600 dark:text-brand-300 mt-0.5">
                    {locationFile.file_no}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setLocationFile(null)}
                aria-label={t('staff.closeLocation')}
                className="rounded-xl p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:text-slate-400 dark:hover:bg-navy-700 dark:hover:text-white transition cursor-pointer"
              >
                <FiX className="h-4 w-4" />
              </button>
            </div>

            {/* File Name Banner */}
            <div className="mb-4 rounded-xl bg-slate-50 dark:bg-navy-900/60 border border-slate-100 dark:border-navy-700 p-3 text-xs">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">{t('staff.fileLabel')}</span>
              <span className="font-bold text-slate-800 dark:text-white mt-0.5 block">
                {localizeField(locationFile.file_name)}
              </span>
            </div>

            {/* Coordinate Grid */}
            <dl className="grid grid-cols-2 gap-2.5">
              {[
                { label: t('staff.archiveRepository'), value: localizeField(locationFile.archive_repository) || t('detail.centralRecordRoom'), colSpan: 'col-span-2' },
                { label: t('staff.lockerNumber'), value: locationFile.locker_no || '—', colSpan: 'col-span-1' },
                { label: t('staff.shelfNameNo'), value: localizeField(locationFile.shelf_name) || '—', colSpan: 'col-span-1' },
                { label: t('staff.shelfPosition'), value: localizeField(locationFile.shelf_position) || '—', colSpan: 'col-span-2' },
              ].map((item, idx) => (
                <div
                  key={idx}
                  className={`rounded-2xl border border-slate-100 bg-slate-50/70 p-3.5 dark:border-navy-700 dark:bg-navy-900/50 ${item.colSpan}`}
                >
                  <dt className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                    {item.label}
                  </dt>
                  <dd className="mt-1 text-sm font-black text-slate-800 dark:text-slate-100">
                    {item.value}
                  </dd>
                </div>
              ))}
            </dl>

            {/* Actions in Modal */}
            <div className="mt-5 flex items-center justify-end gap-2.5 pt-3 border-t border-slate-100 dark:border-navy-700">
              <button
                type="button"
                onClick={() => setLocationFile(null)}
                className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 dark:border-navy-600 dark:bg-navy-700 dark:text-slate-200 transition cursor-pointer"
              >
                {t('common:buttons.close')}
              </button>
              <button
                type="button"
                onClick={() => {
                  const targetFileNo = locationFile.file_no;
                  setLocationFile(null);
                  router.push(`/staff/request-file?file_no=${encodeURIComponent(targetFileNo)}`);
                }}
                className="inline-flex items-center gap-1.5 rounded-xl bg-[#4318FF] px-4 py-2 text-xs font-bold text-white shadow-xs hover:bg-[#3510db] transition cursor-pointer"
              >
                <FiSend className="h-3.5 w-3.5" />
                <span>{t('staff.requestThisFile')}</span>
              </button>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
