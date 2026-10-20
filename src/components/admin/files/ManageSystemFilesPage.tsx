'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  FiFolder,
  FiFileText,
  FiPackage,
  FiSearch,
  FiChevronDown,
  FiCalendar,
  FiRefreshCw,
  FiShield,
  FiCheck,
  FiArrowLeft,
  FiClock,
  FiDownload,
} from 'react-icons/fi';
import { useToast } from 'components/toast/ToastContext';
import { exportToCsv, formatDateTimeForCsv } from 'lib/csvExport';
import FileRequestsTable from './FileRequestsTable';
import AllFilesTable from './AllFilesTable';
import ViewFileModal from './ViewFileModal';
import ConfirmApproveModal from './ConfirmApproveModal';
import ConfirmRejectModal from './ConfirmRejectModal';
import EditFileModal from './EditFileModal';
import ConfirmDeleteModal from './ConfirmDeleteModal';
import type { FileRecordRow, FileCountsSummary } from 'models/FileRepository';

interface SectionItem {
  id?: number | string;
  name: string;
}

export default function ManageSystemFilesPage() {
  const { showToast } = useToast();

  // Active Tab: 'requests' (File Requests) is active by default
  const [activeTab, setActiveTab] = useState<'requests' | 'all'>('requests');

  // Global Approval Toggle State
  const [requireApproval, setRequireApproval] = useState<boolean>(true);
  const [isTogglingApproval, setIsTogglingApproval] = useState<boolean>(false);

  // Data & Summary Counts
  const [files, setFiles] = useState<FileRecordRow[]>([]);
  const [counts, setCounts] = useState<FileCountsSummary>({
    totalArchives: 0,
    todayCount: 0,
    allFilesCount: 0,
    pendingCount: 0,
  });
  const [total, setTotal] = useState<number>(0);
  const [page, setPage] = useState<number>(1);
  /** Default page size: 15 records per page when no search/filter is active */
  const DEFAULT_LIMIT = 15;
  const [totalPages, setTotalPages] = useState<number>(1);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isExporting, setIsExporting] = useState<boolean>(false);

  // Search & Filter Controls
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [selectedSection, setSelectedSection] = useState<string>('all');
  const [selectedStorage, setSelectedStorage] = useState<string>('all');
  const [selectedOfficer, setSelectedOfficer] = useState<string>('all');
  const [selectedDate, setSelectedDate] = useState<string>('');
  const [sortBy, setSortBy] = useState<'newest' | 'oldest' | 'file_no' | 'file_name'>('newest');

  // Dynamic filter options from loaded data / backend
  const [sectionsList, setSectionsList] = useState<SectionItem[]>([]);

  // Modal States
  const [viewingFile, setViewingFile] = useState<FileRecordRow | null>(null);
  const [approvingFile, setApprovingFile] = useState<FileRecordRow | null>(null);
  const [isApproving, setIsApproving] = useState<boolean>(false);
  const [rejectingFile, setRejectingFile] = useState<FileRecordRow | null>(null);
  const [isRejecting, setIsRejecting] = useState<boolean>(false);
  const [editingFile, setEditingFile] = useState<FileRecordRow | null>(null);
  const [isSavingEdit, setIsSavingEdit] = useState<boolean>(false);
  const [deletingFile, setDeletingFile] = useState<FileRecordRow | null>(null);
  const [isDeleting, setIsDeleting] = useState<boolean>(false);

  // Fetch sections list once
  useEffect(() => {
    fetch('/api/sections')
      .then((res) => (res.ok ? res.json() : null))
      .then((json) => {
        if (json?.ok && Array.isArray(json.data?.sections)) {
          setSectionsList(json.data.sections);
        }
      })
      .catch(() => {});
  }, []);

  /**
   * True when at least one search term or filter is active.
   * When true, the table shows ALL matching records on one page (no pagination).
   */
  const isFiltered = useMemo(
    () =>
      searchTerm.trim() !== '' ||
      (selectedSection && selectedSection !== 'all') ||
      (selectedStorage && selectedStorage !== 'all') ||
      (selectedOfficer && selectedOfficer !== 'all') ||
      selectedDate.trim() !== '',
    [searchTerm, selectedSection, selectedStorage, selectedOfficer, selectedDate],
  );

  /** Build query-string params shared by both the regular load and the export */
  const buildFilterParams = useCallback(
    (overrideLimit?: number, overridePage?: number) => {
      const effectiveLimit = overrideLimit ?? (isFiltered ? 10000 : DEFAULT_LIMIT);
      const effectivePage = overridePage ?? (isFiltered ? 1 : page);

      const params = new URLSearchParams({
        tab: activeTab,
        page: String(effectivePage),
        limit: String(effectiveLimit),
        sort: sortBy,
      });

      if (searchTerm.trim()) params.set('search', searchTerm.trim());
      if (selectedSection && selectedSection !== 'all') params.set('section', selectedSection);
      if (selectedStorage && selectedStorage !== 'all') params.set('storage', selectedStorage);
      if (selectedOfficer && selectedOfficer !== 'all') params.set('officer', selectedOfficer);
      if (selectedDate.trim()) params.set('date', selectedDate.trim());

      return params;
    },
    [activeTab, isFiltered, page, sortBy, searchTerm, selectedSection, selectedStorage, selectedOfficer, selectedDate],
  );

  // Primary data loader
  const loadFiles = useCallback(async () => {
    setIsLoading(true);
    try {
      const params = buildFilterParams();
      const res = await fetch(`/api/admin/files?${params.toString()}`);
      const json = await res.json().catch(() => null);

      if (res.ok && json?.ok) {
        setFiles(json.data.files || []);
        setTotal(json.data.total ?? 0);
        setTotalPages(json.data.totalPages ?? 1);
        if (json.data.counts) {
          setCounts(json.data.counts);
        }
        if (typeof json.data.requireApproval === 'boolean') {
          setRequireApproval(json.data.requireApproval);
        }
      } else {
        showToast({
          type: 'error',
          title: 'Error loading files',
          message: json?.error?.message || 'Failed to fetch files from server.',
        });
      }
    } catch {
      showToast({
        type: 'error',
        title: 'Connection Error',
        message: 'Could not connect to the server to load file records.',
      });
    } finally {
      setIsLoading(false);
    }
  }, [buildFilterParams, showToast]);

  // Load when tab or filter criteria change
  useEffect(() => {
    loadFiles();
  }, [loadFiles]);

  // Reset to page 1 whenever search/filter criteria change
  const handleFilterChange = (setter: (v: any) => void, val: any) => {
    setter(val);
    setPage(1);
  };

  const handleResetFilters = () => {
    setSearchTerm('');
    setSelectedSection('all');
    setSelectedStorage('all');
    setSelectedOfficer('all');
    setSelectedDate('');
    setSortBy('newest');
    setPage(1);
  };

  // ── CSV Export Handler ─────────────────────────────────────────────────────
  const handleExportCsv = async () => {
    if (isExporting) return;
    setIsExporting(true);

    try {
      // Fetch ALL matching records (limit=10000, page=1) with current filters
      const params = buildFilterParams(10000, 1);
      const res = await fetch(`/api/admin/files?${params.toString()}`);
      const json = await res.json().catch(() => null);

      if (!res.ok || !json?.ok) {
        showToast({
          type: 'error',
          title: 'Export Failed',
          message: json?.error?.message || 'Could not retrieve records for export.',
        });
        return;
      }

      const exportFiles: FileRecordRow[] = json.data.files || [];

      if (exportFiles.length === 0) {
        showToast({
          type: 'info',
          title: 'No Records to Export',
          message: 'No matching records to export. Try adjusting your search or filters.',
        });
        return;
      }

      const today = new Date().toISOString().split('T')[0];

      if (activeTab === 'requests') {
        // ── File Requests CSV ──────────────────────────────────────────────
        const headers = [
          'File Number',
          'File Name',
          'Section',
          'File Location',
          'Submitted By',
          'Role',
          'Submitted Date & Time',
          'Request Status',
        ];
        const rows = exportFiles.map((f) => {
          const location =
            [f.locker_no, f.shelf_name, f.shelf_position].filter(Boolean).join(' / ') ||
            'Central Record Room';
          return [
            f.file_no,
            f.file_name,
            f.section_name,
            location,
            f.registrar_name || '',
            f.registrar_role === 'Administrator' ? 'Admin' : 'Staff',
            formatDateTimeForCsv(f.created_at),
            f.status || 'PENDING',
          ];
        });
        exportToCsv(headers, rows, `file-requests-${today}.csv`);
      } else {
        // ── All Files CSV ──────────────────────────────────────────────────
        const headers = [
          'File Number',
          'File Name',
          'Section',
          'File Location',
          'Added By',
          'Role',
          'Added Date & Time',
          'File Status',
          'Admin Action',
        ];
        const rows = exportFiles.map((f) => {
          const location =
            [f.locker_no, f.shelf_name, f.shelf_position].filter(Boolean).join(' / ') ||
            'Central Record Room';
          let adminAction = 'System Verified';
          if (f.approved_by || f.approved_at) {
            adminAction = f.approved_by
              ? `Approved by ${f.approved_by}`
              : 'Approved by Administrator';
          } else if (f.registrar_role === 'Administrator') {
            adminAction = 'Approved (Auto-Logged)';
          }
          return [
            f.file_no,
            f.file_name,
            f.section_name,
            location,
            f.registrar_name || '',
            f.registrar_role === 'Administrator' ? 'Admin' : 'Staff',
            formatDateTimeForCsv(f.created_at),
            f.status || '',
            adminAction,
          ];
        });
        exportToCsv(headers, rows, `all-files-${today}.csv`);
      }

      showToast({
        type: 'success',
        title: 'Export Complete',
        message: `Exported ${exportFiles.length} record${exportFiles.length !== 1 ? 's' : ''} to CSV.`,
      });
    } catch {
      showToast({
        type: 'error',
        title: 'Export Error',
        message: 'An unexpected error occurred while generating the CSV export.',
      });
    } finally {
      setIsExporting(false);
    }
  };


  // ── Approval Setting Toggle ────────────────────────────────────────────────
  const handleToggleApprovalSetting = async () => {
    if (isTogglingApproval) return;
    const previous = requireApproval;
    const next = !previous;

    // Optimistic UI update
    setRequireApproval(next);
    setIsTogglingApproval(true);

    try {
      const res = await fetch('/api/admin/files/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ require_approval: next }),
      });
      const json = await res.json().catch(() => null);

      if (res.ok && json?.ok) {
        showToast({
          type: 'success',
          title: 'System Setting Updated',
          message: json.data?.message || `File submission approval requirement ${next ? 'enabled' : 'disabled'}.`,
        });
      } else {
        // Rollback
        setRequireApproval(previous);
        showToast({
          type: 'error',
          title: 'Failed to Update Setting',
          message: json?.error?.message || 'Server rejected the setting update.',
        });
      }
    } catch {
      setRequireApproval(previous);
      showToast({
        type: 'error',
        title: 'Network Error',
        message: 'Could not update system setting due to network error.',
      });
    } finally {
      setIsTogglingApproval(false);
    }
  };

  // ── Approve File Action ────────────────────────────────────────────────────
  const handleApproveConfirm = async () => {
    if (!approvingFile || isApproving) return;
    setIsApproving(true);

    try {
      const res = await fetch(`/api/admin/files/${approvingFile.id}/approve`, {
        method: 'POST',
      });
      const json = await res.json().catch(() => null);

      if (res.ok && json?.ok) {
        showToast({
          type: 'success',
          title: 'Submission Approved',
          message: json.data?.message || `File ${approvingFile.file_name} has been approved.`,
        });
        setApprovingFile(null);
        loadFiles();
      } else {
        showToast({
          type: 'error',
          title: 'Approval Failed',
          message: json?.error?.message || 'Could not approve submission.',
        });
      }
    } catch {
      showToast({
        type: 'error',
        title: 'Connection Error',
        message: 'Failed to communicate with server to approve request.',
      });
    } finally {
      setIsApproving(false);
    }
  };

  // ── Reject File Action ─────────────────────────────────────────────────────
  const handleRejectConfirm = async (reason?: string) => {
    if (!rejectingFile || isRejecting) return;
    setIsRejecting(true);

    try {
      const res = await fetch(`/api/admin/files/${rejectingFile.id}/reject`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason }),
      });
      const json = await res.json().catch(() => null);

      if (res.ok && json?.ok) {
        showToast({
          type: 'info',
          title: 'Submission Declined',
          message: json.data?.message || `File request ${rejectingFile.file_no} has been rejected.`,
        });
        setRejectingFile(null);
        loadFiles();
      } else {
        showToast({
          type: 'error',
          title: 'Rejection Failed',
          message: json?.error?.message || 'Could not reject submission.',
        });
      }
    } catch {
      showToast({
        type: 'error',
        title: 'Connection Error',
        message: 'Failed to communicate with server to reject request.',
      });
    } finally {
      setIsRejecting(false);
    }
  };

  // ── Edit File Action ───────────────────────────────────────────────────────
  const handleEditSave = async (payload: Partial<FileRecordRow>) => {
    if (!editingFile || isSavingEdit) return;
    setIsSavingEdit(true);

    try {
      const res = await fetch(`/api/admin/files/${editingFile.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const json = await res.json().catch(() => null);

      if (res.ok && json?.ok) {
        showToast({
          type: 'success',
          title: 'File Updated',
          message: 'File details were updated successfully.',
        });
        setEditingFile(null);
        loadFiles();
      } else {
        showToast({
          type: 'error',
          title: 'Update Failed',
          message: json?.error?.message || 'Could not update file record.',
        });
      }
    } catch {
      showToast({
        type: 'error',
        title: 'Connection Error',
        message: 'Failed to communicate with server to update file.',
      });
    } finally {
      setIsSavingEdit(false);
    }
  };

  // ── Delete File Action ─────────────────────────────────────────────────────
  const handleDeleteConfirm = async () => {
    if (!deletingFile || isDeleting) return;
    setIsDeleting(true);

    try {
      const res = await fetch(`/api/admin/files/${deletingFile.id}`, {
        method: 'DELETE',
      });
      const json = await res.json().catch(() => null);

      if (res.ok && json?.ok) {
        showToast({
          type: 'success',
          title: 'File Deleted',
          message: 'File record has been permanently removed.',
        });
        setDeletingFile(null);
        loadFiles();
      } else {
        showToast({
          type: 'error',
          title: 'Delete Failed',
          message: json?.error?.message || 'Could not delete file record.',
        });
      }
    } catch {
      showToast({
        type: 'error',
        title: 'Connection Error',
        message: 'Failed to communicate with server to delete file.',
      });
    } finally {
      setIsDeleting(false);
    }
  };

  // Format 4-digit count (e.g. 0142)
  const format4Digit = (n: number) => String(n).padStart(4, '0');

  return (
    <div className="w-full pb-10 font-dm">
      {/* ── BREADCRUMBS & TOP BAR ── */}
      <div className="mb-4 flex flex-col md:flex-row md:items-center justify-between gap-2">
        <nav className="flex items-center gap-2 text-xs font-semibold text-slate-400 dark:text-gray-400">
          <Link href="/admin/default" className="hover:text-slate-600 dark:hover:text-white transition-colors">
            Pages
          </Link>
          <span>/</span>
          <span className="text-slate-500 dark:text-gray-300">Record Room</span>
          <span>/</span>
          <span className="text-[#1B254B] dark:text-white font-bold">All Files</span>
        </nav>

        <Link
          href="/admin/default"
          className="inline-flex items-center gap-1.5 text-xs font-bold text-[#4318FF] dark:text-brand-300 hover:underline"
        >
          <FiArrowLeft className="h-3.5 w-3.5" />
          <span>Back to Recordroom Dashboard</span>
        </Link>
      </div>

      {/* ── HEADING & TOP SUMMARY METRIC CARDS ── */}
      <div className="mb-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-black text-[#1B254B] dark:text-white tracking-tight">
            All Files
          </h1>
          <p className="mt-0.5 text-xs text-slate-400 dark:text-gray-400">
            All files in the Recordroom on 9 October 2026. Review incoming submissions and manage administrative approvals.
          </p>
        </div>

        {/* 3 Summary Cards */}
        <div className="flex flex-wrap sm:flex-nowrap items-center gap-3">
          {/* Card 1: System Total File Count */}
          <div className="flex items-center gap-3 rounded-2xl bg-white dark:bg-navy-800 p-3 sm:px-4 sm:py-3 shadow-xs border border-slate-100 dark:border-navy-700 min-w-[170px]">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#EFF6FF] text-[#3B82F6] dark:bg-blue-950/40 dark:text-blue-300">
              <FiFolder className="h-5 w-5" />
            </div>
            <div>
              <span className="block text-[9px] font-black uppercase tracking-wider text-slate-400">
                SYSTEM TOTAL FILE COUNT
              </span>
              <div className="flex items-baseline gap-1.5">
                <span className="font-mono text-base font-black text-[#1B254B] dark:text-white">
                  {format4Digit(counts.totalArchives)}
                </span>
                <span className="text-[11px] font-bold text-slate-400">Files</span>
              </div>
              <span className="inline-block text-[10px] font-semibold text-slate-400">
                Total Archives
              </span>
            </div>
          </div>

          {/* Card 2: Today Added File Count */}
          <div className="flex items-center gap-3 rounded-2xl bg-white dark:bg-navy-800 p-3 sm:px-4 sm:py-3 shadow-xs border border-slate-100 dark:border-navy-700 min-w-[170px]">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#EFF6FF] text-[#3B82F6] dark:bg-blue-950/40 dark:text-blue-300">
              <FiFileText className="h-5 w-5" />
            </div>
            <div>
              <span className="block text-[9px] font-black uppercase tracking-wider text-slate-400">
                TODAY ADDED FILE COUNT
              </span>
              <div className="flex items-baseline gap-1.5">
                <span className="font-mono text-base font-black text-[#1B254B] dark:text-white">
                  {format4Digit(counts.todayCount)}
                </span>
                <span className="text-[11px] font-bold text-slate-400">Files</span>
              </div>
              <span className="inline-block text-[10px] font-semibold text-slate-400">
                Today&apos;s Intake
              </span>
            </div>
          </div>

          {/* Card 3: All Files Added */}
          <div className="flex items-center gap-3 rounded-2xl bg-white dark:bg-navy-800 p-3 sm:px-4 sm:py-3 shadow-xs border border-slate-100 dark:border-navy-700 min-w-[170px]">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-[#F4F2FF] text-[#4318FF] dark:bg-brand-900/40 dark:text-brand-300">
              <FiPackage className="h-5 w-5" />
            </div>
            <div>
              <span className="block text-[9px] font-black uppercase tracking-wider text-slate-400">
                ALL FILES
              </span>
              <div className="flex items-baseline gap-1.5">
                <span className="font-mono text-base font-black text-[#1B254B] dark:text-white">
                  {counts.allFilesCount}
                </span>
                <span className="text-[11px] font-bold text-slate-400">Files added</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── SEARCH & FILTER CONTROLS BAR ── */}
      <div className="mb-4 rounded-2xl bg-white dark:bg-navy-800 p-3 shadow-xs border border-slate-100 dark:border-navy-700">
        <div className="flex flex-wrap lg:flex-nowrap items-center gap-2.5">
          {/* Search input */}
          <div className="relative flex-1 min-w-[240px]">
            <FiSearch className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 h-4 w-4" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => handleFilterChange(setSearchTerm, e.target.value)}
              placeholder="Search by file number, file name, or officer..."
              className="h-9 w-full rounded-xl bg-slate-50/70 dark:bg-navy-900/70 pl-9 pr-3 text-xs text-slate-800 dark:text-white placeholder:text-slate-400 outline-none border border-transparent focus:border-[#4318FF] transition-all"
            />
          </div>

          {/* Section filter */}
          <div className="relative min-w-[160px]">
            <select
              value={selectedSection}
              onChange={(e) => handleFilterChange(setSelectedSection, e.target.value)}
              className="h-9 w-full appearance-none rounded-xl bg-slate-50/70 dark:bg-navy-900/70 px-3 pr-8 text-xs font-semibold text-slate-700 dark:text-slate-200 outline-none border border-transparent focus:border-[#4318FF] cursor-pointer"
            >
              <option value="all">All Sections ({sectionsList.length || 12})</option>
              {sectionsList.map((s, idx) => (
                <option key={s.id ?? idx} value={s.name}>
                  {s.name}
                </option>
              ))}
            </select>
            <FiChevronDown className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 h-3.5 w-3.5" />
          </div>

          {/* Storage units filter */}
          <div className="relative min-w-[150px]">
            <select
              value={selectedStorage}
              onChange={(e) => handleFilterChange(setSelectedStorage, e.target.value)}
              className="h-9 w-full appearance-none rounded-xl bg-slate-50/70 dark:bg-navy-900/70 px-3 pr-8 text-xs font-semibold text-slate-700 dark:text-slate-200 outline-none border border-transparent focus:border-[#4318FF] cursor-pointer"
            >
              <option value="all">All Storage Units (35)</option>
              <option value="Rack A">Rack A-04</option>
              <option value="Vault B">Vault B</option>
              <option value="Wing C">Wing C</option>
              <option value="Archive Room 2">Archive Room 2</option>
              <option value="Locker L-102">Locker L-102</option>
            </select>
            <FiChevronDown className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 h-3.5 w-3.5" />
          </div>

          {/* Officers filter */}
          <div className="relative min-w-[130px]">
            <select
              value={selectedOfficer}
              onChange={(e) => handleFilterChange(setSelectedOfficer, e.target.value)}
              className="h-9 w-full appearance-none rounded-xl bg-slate-50/70 dark:bg-navy-900/70 px-3 pr-8 text-xs font-semibold text-slate-700 dark:text-slate-200 outline-none border border-transparent focus:border-[#4318FF] cursor-pointer"
            >
              <option value="all">All Officers</option>
              <option value="Elena Rostova">Elena Rostova</option>
              <option value="Marcus Grohs">Marcus Grohs</option>
              <option value="Malitha Tishamal">Malitha Tishamal</option>
              <option value="Sarah Jenkins">Sarah Jenkins</option>
              <option value="Omari Wise">Omari Wise</option>
              <option value="Amanda Ross">Amanda Ross</option>
            </select>
            <FiChevronDown className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 h-3.5 w-3.5" />
          </div>

          {/* Date Picker Button / Input */}
          <div className="relative">
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => handleFilterChange(setSelectedDate, e.target.value)}
              className="h-9 rounded-xl bg-slate-50/70 dark:bg-navy-900/70 px-3 text-xs font-semibold text-slate-700 dark:text-slate-200 outline-none border border-transparent focus:border-[#4318FF] cursor-pointer"
              title="Filter by intake date"
            />
          </div>

          {/* Reset Filters button */}
          <button
            type="button"
            onClick={handleResetFilters}
            className="flex h-9 shrink-0 items-center gap-1.5 rounded-xl border border-slate-200 dark:border-navy-700 bg-white dark:bg-navy-900 px-3 text-xs font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-50 transition-colors cursor-pointer"
          >
            <FiRefreshCw className="h-3.5 w-3.5" />
            <span>Reset Filters</span>
          </button>

          {/* Export CSV button */}
          <button
            type="button"
            onClick={handleExportCsv}
            disabled={isExporting}
            className={`flex h-9 shrink-0 items-center gap-1.5 rounded-xl px-3 text-xs font-bold transition-colors cursor-pointer ${
              isExporting
                ? 'bg-[#4318FF]/60 text-white cursor-not-allowed'
                : 'bg-[#4318FF] hover:bg-[#3311CC] text-white shadow-xs shadow-[#4318FF]/30'
            }`}
            title={`Export ${activeTab === 'requests' ? 'File Requests' : 'All Files'} as CSV`}
          >
            {isExporting ? (
              <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white border-t-transparent" />
            ) : (
              <FiDownload className="h-3.5 w-3.5" />
            )}
            <span>{isExporting ? 'Exporting…' : 'Export CSV'}</span>
          </button>
        </div>
      </div>

      {/* ── SECURE REPOSITORY BANNER ── */}
      <div className="mb-4 flex items-center justify-between rounded-xl bg-[#F4F7FE] dark:bg-navy-900/80 px-4 py-2 border border-slate-200/50 dark:border-navy-700">
        <div className="flex items-center gap-2 text-xs font-semibold text-slate-600 dark:text-slate-300">
          <FiShield className="h-4 w-4 text-[#4318FF] dark:text-brand-300" />
          <span>Secure repository • Access managed for your administrator</span>
        </div>
        <div className="flex items-center gap-1.5 rounded-full bg-[#EBF3FE] dark:bg-navy-800 px-2.5 py-0.5 text-[10px] font-bold text-[#4318FF] dark:text-brand-300">
          <span className="h-1.5 w-1.5 rounded-full bg-[#4318FF] dark:bg-brand-300 animate-pulse" />
          <span>ACTIVE</span>
        </div>
      </div>

      {/* ── TABS BAR & ADMIN APPROVAL TOGGLE SWITCH ── */}
      <div className="mb-4 flex flex-col md:flex-row md:items-center justify-between gap-3">
        {/* Left: Two Mutually Exclusive Tabs */}
        <div className="flex items-center gap-2">
          {/* Tab 1: File Requests (Active by default) */}
          <button
            type="button"
            onClick={() => {
              setActiveTab('requests');
              setPage(1);
            }}
            className={`flex items-center gap-2 rounded-full px-4 py-2 text-xs font-bold transition-all cursor-pointer ${
              activeTab === 'requests'
                ? 'bg-[#4318FF] text-white shadow-md shadow-[#4318FF]/25'
                : 'bg-white dark:bg-navy-800 text-slate-600 dark:text-slate-300 hover:bg-slate-50 border border-slate-200/60 dark:border-navy-700'
            }`}
          >
            <FiClock className="h-3.5 w-3.5" />
            <span>File Requests</span>
            <span
              className={`rounded-full px-2 py-0.5 text-[10px] font-black ${
                activeTab === 'requests'
                  ? 'bg-[#3311CC] text-white'
                  : 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300'
              }`}
            >
              {counts.pendingCount} Pending
            </span>
          </button>

          {/* Tab 2: All Files */}
          <button
            type="button"
            onClick={() => {
              setActiveTab('all');
              setPage(1);
            }}
            className={`flex items-center gap-2 rounded-full px-4 py-2 text-xs font-bold transition-all cursor-pointer ${
              activeTab === 'all'
                ? 'bg-[#4318FF] text-white shadow-md shadow-[#4318FF]/25'
                : 'bg-white dark:bg-navy-800 text-slate-600 dark:text-slate-300 hover:bg-slate-50 border border-slate-200/60 dark:border-navy-700'
            }`}
          >
            <FiFolder className="h-3.5 w-3.5" />
            <span>All Files</span>
            <span
              className={`rounded-full px-2 py-0.5 text-[10px] font-black ${
                activeTab === 'all'
                  ? 'bg-[#3311CC] text-white'
                  : 'bg-slate-100 text-slate-600 dark:bg-navy-700 dark:text-slate-300'
              }`}
            >
              {counts.allFilesCount} files
            </span>
          </button>
        </div>

        {/* Right: Global Approval Setting Switch */}
        <div className="flex items-center gap-3 self-end md:self-auto rounded-2xl bg-white dark:bg-navy-800 px-4 py-2 shadow-xs border border-slate-100 dark:border-navy-700">
          <div className="text-right">
            <div className="flex items-center justify-end gap-1.5">
              <span className="text-xs font-bold text-slate-800 dark:text-white">
                Require Admin Approval for Staff File Submissions
              </span>
              <span
                className={`rounded px-1.5 py-0.2 text-[9px] font-black tracking-wide ${
                  requireApproval
                    ? 'bg-emerald-50 text-emerald-600 border border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800'
                    : 'bg-slate-100 text-slate-500 border border-slate-200 dark:bg-navy-900 dark:text-slate-400'
                }`}
              >
                {requireApproval ? 'ENABLED' : 'DISABLED'}
              </span>
            </div>
            <p className="text-[10px] text-slate-400">
              {requireApproval
                ? 'Staff submissions require administrator approval.'
                : 'Staff submissions are added directly to the active archive repository.'}
            </p>
          </div>

          {/* Toggle Switch */}
          <button
            type="button"
            role="switch"
            aria-checked={requireApproval}
            disabled={isTogglingApproval}
            onClick={handleToggleApprovalSetting}
            className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
              requireApproval ? 'bg-[#4318FF]' : 'bg-slate-300 dark:bg-navy-600'
            } ${isTogglingApproval ? 'opacity-60 cursor-not-allowed' : ''}`}
          >
            <span
              className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-md ring-0 transition duration-200 ease-in-out ${
                requireApproval ? 'translate-x-5' : 'translate-x-0'
              }`}
            />
          </button>
        </div>
      </div>

      {/* ── SECTION HEADER BELOW TABS ── */}
      {activeTab === 'requests' ? (
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h2 className="text-xs font-black uppercase tracking-wider text-slate-700 dark:text-slate-200">
              PENDING STAFF FILE SUBMISSIONS (AWAITING APPROVAL)
            </h2>
            <span className="rounded-full bg-[#FFFBEB] text-[#D97706] border border-[#FDE68A] dark:bg-amber-950/40 dark:text-amber-300 px-2.5 py-0.5 text-[10px] font-bold">
              {counts.pendingCount} submissions pending review
            </span>
          </div>
          <span className="text-[11px] italic text-slate-400 hidden sm:inline">
            Actions taken here immediately update the system ledger.
          </span>
        </div>
      ) : (
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h2 className="text-xs font-black uppercase tracking-wider text-slate-700 dark:text-slate-200">
              TOTAL TODAY ADDED FILES
            </h2>
            <span className="rounded-full bg-slate-100 dark:bg-navy-700 text-slate-700 dark:text-slate-300 px-2.5 py-0.5 text-[10px] font-bold">
              {counts.allFilesCount} files
            </span>
          </div>

          <div className="flex items-center gap-1.5 text-xs text-slate-500">
            <span className="font-semibold text-slate-400">Sorted by:</span>
            <div className="relative">
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as any)}
                className="appearance-none rounded-lg bg-white dark:bg-navy-800 border border-slate-200 dark:border-navy-700 px-2.5 py-1 pr-6 font-bold text-slate-700 dark:text-white outline-none cursor-pointer text-xs"
              >
                <option value="newest">Newest added</option>
                <option value="oldest">Oldest added</option>
                <option value="file_no">File Number</option>
                <option value="file_name">File Name</option>
              </select>
              <FiChevronDown className="pointer-events-none absolute right-1.5 top-1/2 -translate-y-1/2 text-slate-400 h-3 w-3" />
            </div>
          </div>
        </div>
      )}

      {/* ── TAB CONTENT TABLE ── */}
      {activeTab === 'requests' ? (
        <FileRequestsTable
          files={files}
          loading={isLoading}
          total={total}
          page={page}
          limit={DEFAULT_LIMIT}
          totalPages={totalPages}
          isFiltered={isFiltered}
          onPageChange={(newPage) => setPage(newPage)}
          onApprove={(file) => setApprovingFile(file)}
          onReject={(file) => setRejectingFile(file)}
          onView={(file) => setViewingFile(file)}
        />
      ) : (
        <AllFilesTable
          files={files}
          total={total}
          page={page}
          limit={DEFAULT_LIMIT}
          totalPages={totalPages}
          isFiltered={isFiltered}
          loading={isLoading}
          onPageChange={(newPage) => setPage(newPage)}
          onView={(file) => setViewingFile(file)}
          onEdit={(file) => setEditingFile(file)}
          onDelete={(file) => setDeletingFile(file)}
        />
      )}

      {/* ── MODALS ── */}
      <ViewFileModal file={viewingFile} onClose={() => setViewingFile(null)} />

      <ConfirmApproveModal
        file={approvingFile}
        loading={isApproving}
        onConfirm={handleApproveConfirm}
        onCancel={() => setApprovingFile(null)}
      />

      <ConfirmRejectModal
        file={rejectingFile}
        loading={isRejecting}
        onConfirm={handleRejectConfirm}
        onCancel={() => setRejectingFile(null)}
      />

      <EditFileModal
        file={editingFile}
        loading={isSavingEdit}
        onSave={handleEditSave}
        onCancel={() => setEditingFile(null)}
      />

      <ConfirmDeleteModal
        file={deletingFile}
        loading={isDeleting}
        onConfirm={handleDeleteConfirm}
        onCancel={() => setDeletingFile(null)}
      />
    </div>
  );
}
