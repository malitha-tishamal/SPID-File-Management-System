'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
  FiArrowLeft,
  FiClock,
  FiDownload,
  FiXCircle,
  FiX,
  FiAlertCircle,
} from 'react-icons/fi';
import { useToast } from 'components/toast/ToastContext';
import { exportToCsv, formatDateTimeForCsv } from 'lib/csvExport';
import { fetchClientSections } from 'lib/sectionsClient';
import {
  formatSriLankaDate,
  isValidYmd,
  sriLankaTodayInput,
} from 'lib/datetime';
import FileRequestsTable from './FileRequestsTable';
import RejectedFilesTable from './RejectedFilesTable';
import AllFilesTable from './AllFilesTable';
import ViewFileModal from './ViewFileModal';
import ConfirmApproveModal from './ConfirmApproveModal';
import ConfirmRejectModal from './ConfirmRejectModal';
import EditFileModal from './EditFileModal';
import ConfirmDeleteModal from './ConfirmDeleteModal';
import TableLoadingProgressBar from './TableLoadingProgressBar';
import type { FileRecordRow, FileCountsSummary } from 'models/FileRepository';

interface SectionItem {
  id?: number | string;
  name: string;
}

type TabKey = 'requests' | 'all' | 'rejected';
type SortKey = 'newest' | 'oldest' | 'file_no' | 'file_name';

const DEFAULT_LIMIT = 15;
const SEARCH_DEBOUNCE_MS = 300;

const EMPTY_COUNTS: FileCountsSummary = {
  totalArchives: 0,
  todayCount: 0,
  allFilesCount: 0,
  pendingCount: 0,
  rejectedCount: 0,
};

export default function ManageSystemFilesPage() {
  const { showToast } = useToast();

  const [activeTab, setActiveTab] = useState<TabKey>('requests');

  const [autoApproval, setAutoApproval] = useState<boolean>(false);
  const [isTogglingApproval, setIsTogglingApproval] = useState<boolean>(false);

  const [files, setFiles] = useState<FileRecordRow[]>([]);
  const [counts, setCounts] = useState<FileCountsSummary>(EMPTY_COUNTS);
  const [total, setTotal] = useState<number>(0);
  const [page, setPage] = useState<number>(1);
  const [totalPages, setTotalPages] = useState<number>(1);

  const [isTableLoading, setIsTableLoading] = useState<boolean>(true);
  const [hasLoadedTableOnce, setHasLoadedTableOnce] = useState<boolean>(false);
  const [loadedTab, setLoadedTab] = useState<TabKey | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState<number>(0);

  const requestIdRef = useRef(0);

  const [isExporting, setIsExporting] = useState<boolean>(false);

  const [searchTerm, setSearchTerm] = useState<string>('');
  const [debouncedSearch, setDebouncedSearch] = useState<string>('');
  const [selectedSection, setSelectedSection] = useState<string>('all');
  const [selectedStorage, setSelectedStorage] = useState<string>('all');
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');
  const [sortBy, setSortBy] = useState<SortKey>('newest');

  const [sectionsList, setSectionsList] = useState<SectionItem[]>([]);

  const [viewingFile, setViewingFile] = useState<FileRecordRow | null>(null);
  const [approvingFile, setApprovingFile] = useState<FileRecordRow | null>(null);
  const [isApproving, setIsApproving] = useState<boolean>(false);
  const [rejectingFile, setRejectingFile] = useState<FileRecordRow | null>(null);
  const [isRejecting, setIsRejecting] = useState<boolean>(false);
  const [editingFile, setEditingFile] = useState<FileRecordRow | null>(null);
  const [isSavingEdit, setIsSavingEdit] = useState<boolean>(false);
  const [deletingFile, setDeletingFile] = useState<FileRecordRow | null>(null);
  const [isDeleting, setIsDeleting] = useState<boolean>(false);

  // Reference data is cached and de-duplicated by the shared client helper.
  useEffect(() => {
    fetchClientSections()
      .then((sections) => {
        if (Array.isArray(sections)) setSectionsList(sections);
      })
      .catch(() => {});
  }, []);

  // Debounce only free-text search; dropdowns/dates apply immediately.
  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedSearch(searchTerm.trim());
      setPage(1);
    }, SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [searchTerm]);

  const dateRangeError = useMemo(() => {
    if ((startDate && !isValidYmd(startDate)) || (endDate && !isValidYmd(endDate))) {
      return 'Select valid start and end dates.';
    }
    if (startDate && endDate && startDate > endDate) {
      return 'Start date cannot be later than the end date.';
    }
    return null;
  }, [startDate, endDate]);

  const buildFilterParams = useCallback(
    (overrideLimit?: number, overridePage?: number, overrideSearch?: string) => {
      const effectiveLimit = overrideLimit ?? DEFAULT_LIMIT;
      const effectivePage = overridePage ?? page;
      const effectiveSearch =
        overrideSearch !== undefined ? overrideSearch.trim() : debouncedSearch;

      const params = new URLSearchParams({
        tab: activeTab,
        page: String(effectivePage),
        limit: String(effectiveLimit),
        sort: sortBy,
        includeMeta: 'false',
      });

      if (effectiveSearch) params.set('search', effectiveSearch);
      if (selectedSection && selectedSection !== 'all')
        params.set('section', selectedSection);
      if (selectedStorage && selectedStorage !== 'all')
        params.set('storage', selectedStorage);
      if (startDate) params.set('dateFrom', startDate);
      if (endDate) params.set('dateTo', endDate);

      return params;
    },
    [
      activeTab,
      page,
      sortBy,
      debouncedSearch,
      selectedSection,
      selectedStorage,
      startDate,
      endDate,
    ],
  );

  const loadMeta = useCallback(async (signal?: AbortSignal) => {
    try {
      const res = await fetch('/api/admin/files?metaOnly=true', {
        signal,
        cache: 'no-store',
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) return;
      if (json.data?.counts) setCounts(json.data.counts);
      if (typeof json.data?.auto_approval === 'boolean') {
        setAutoApproval(json.data.auto_approval);
      } else if (typeof json.data?.requireApproval === 'boolean') {
        setAutoApproval(!json.data.requireApproval);
      }
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') return;
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void loadMeta(controller.signal);
    return () => controller.abort();
  }, [loadMeta]);

  const loadFiles = useCallback(
    async (signal: AbortSignal, requestId: number) => {
      setIsTableLoading(true);
      setLoadError(null);
      try {
        const params = buildFilterParams();
        const res = await fetch(`/api/admin/files?${params.toString()}`, {
          signal,
          cache: 'no-store',
        });
        const json = await res.json().catch(() => null);

        if (requestId !== requestIdRef.current) return;

        if (res.ok && json?.ok) {
          setFiles(json.data.files || []);
          setTotal(json.data.total ?? 0);
          setTotalPages(json.data.totalPages ?? 1);
          setLoadedTab(activeTab);
          setHasLoadedTableOnce(true);
          setLoadError(null);
        } else {
          const message = json?.message || 'Failed to fetch files from server.';
          setLoadError(message);
          setLoadedTab(activeTab);
          setHasLoadedTableOnce(true);
          showToast({
            type: 'error',
            title: 'Error loading files',
            message,
          });
        }
      } catch (error) {
        if (signal.aborted || requestId !== requestIdRef.current) return;
        const message = 'Could not connect to the server to load file records.';
        setLoadError(message);
        setLoadedTab(activeTab);
        setHasLoadedTableOnce(true);
        showToast({
          type: 'error',
          title: 'Connection Error',
          message,
        });
      } finally {
        if (requestId === requestIdRef.current) setIsTableLoading(false);
      }
    },
    [activeTab, buildFilterParams, showToast],
  );

  useEffect(() => {
    if (dateRangeError) {
      requestIdRef.current += 1;
      setIsTableLoading(false);
      return;
    }

    const controller = new AbortController();
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    void loadFiles(controller.signal, requestId);

    return () => controller.abort();
  }, [loadFiles, dateRangeError, reloadKey]);

  const refreshFilesView = useCallback(() => {
    setReloadKey((value) => value + 1);
    void loadMeta();
  }, [loadMeta]);

  const applyFilter = useCallback((apply: () => void) => {
    apply();
    setPage(1);
  }, []);

  const handleSortChange = useCallback((value: SortKey) => {
    setSortBy(value);
    setPage(1);
  }, []);

  const handleResetFilters = useCallback(() => {
    setSearchTerm('');
    setDebouncedSearch('');
    setSelectedSection('all');
    setSelectedStorage('all');
    setStartDate('');
    setEndDate('');
    setSortBy('newest');
    setPage(1);
  }, []);

  const handleClearDates = useCallback(() => {
    setStartDate('');
    setEndDate('');
    setPage(1);
  }, []);

  const handleTabChange = useCallback((tab: TabKey) => {
    setActiveTab(tab);
    setPage(1);
  }, []);

  // ── Row actions ────────────────────────────────────────────────────────────
  const handlePageChange = useCallback((newPage: number) => {
    setPage(newPage);
    if (typeof window !== 'undefined') window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  const handleView = useCallback((file: FileRecordRow) => {
    setViewingFile(file);
  }, []);

  const handleEdit = useCallback((file: FileRecordRow) => {
    setEditingFile(file);
  }, []);

  const handleDeleteRequest = useCallback((file: FileRecordRow) => {
    setDeletingFile(file);
  }, []);

  const handleApproveRequest = useCallback((file: FileRecordRow) => {
    setApprovingFile(file);
  }, []);

  const handleRejectRequest = useCallback((file: FileRecordRow) => {
    setRejectingFile(file);
  }, []);

  // ── CSV Export Handler ─────────────────────────────────────────────────────
  const handleExportCsv = async () => {
    if (isExporting) return;
    if (dateRangeError) {
      showToast({
        type: 'error',
        title: 'Invalid Date Range',
        message: dateRangeError,
      });
      return;
    }
    setIsExporting(true);

    try {
      const params = buildFilterParams(10000, 1, searchTerm);
      params.set('includeCounts', 'false');
      params.set('includeSettings', 'false');
      const res = await fetch(`/api/admin/files?${params.toString()}`, {
        cache: 'no-store',
      });
      const json = await res.json().catch(() => null);

      if (!res.ok || !json?.ok) {
        showToast({
          type: 'error',
          title: 'Export Failed',
          message: json?.message || 'Could not retrieve records for export.',
        });
        return;
      }

      const exportFiles: FileRecordRow[] = json.data.files || [];

      if (exportFiles.length === 0) {
        showToast({
          type: 'info',
          title: 'No Records to Export',
          message:
            'No matching records to export. Try adjusting your search or filters.',
        });
        return;
      }

      const today = sriLankaTodayInput();

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
            [
              f.locker_no,
              f.shelf_name,
              f.shelf_position ? `Position: ${f.shelf_position}` : null,
              !f.locker_no && !f.shelf_name ? f.archive_repository : null,
            ]
              .filter(Boolean)
              .join(' / ') || 'Central Record Room';
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
            [
              f.locker_no,
              f.shelf_name,
              f.shelf_position ? `Position: ${f.shelf_position}` : null,
              !f.locker_no && !f.shelf_name ? f.archive_repository : null,
            ]
              .filter(Boolean)
              .join(' / ') || 'Central Record Room';

          const adminName =
            f.approved_by_name ||
            (f.approved_by && !f.approved_by.includes('-')
              ? f.approved_by
              : null);

          let adminAction = 'System Verified';
          if (f.status === 'PENDING') {
            adminAction = 'Pending Review';
          } else if (f.status === 'disabled' || f.status === 'disposed') {
            adminAction = adminName ? `Disabled by ${adminName}` : 'Disabled';
          } else if (f.status === 'REJECTED') {
            adminAction = adminName ? `Rejected by ${adminName}` : 'Rejected';
          } else if (adminName) {
            adminAction = `Approved by ${adminName}`;
          } else if (f.registrar_role === 'Administrator' || !f.approved_by) {
            adminAction = 'Approved (Auto-Logged)';
          } else if (f.approved_by || f.approved_at) {
            adminAction = 'Approved by Administrator';
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
        message: `Exported ${exportFiles.length} record${
          exportFiles.length !== 1 ? 's' : ''
        } to CSV.`,
      });
    } catch {
      showToast({
        type: 'error',
        title: 'Export Error',
        message:
          'An unexpected error occurred while generating the CSV export.',
      });
    } finally {
      setIsExporting(false);
    }
  };

  // ── Approval Setting Toggle ────────────────────────────────────────────────
  const handleToggleApprovalSetting = async () => {
    if (isTogglingApproval) return;
    const previous = autoApproval;
    const next = !previous;

    setAutoApproval(next);
    setIsTogglingApproval(true);

    try {
      const res = await fetch('/api/admin/files/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ auto_approval: next, require_approval: !next }),
      });
      const json = await res.json().catch(() => null);

      if (res.ok && json?.ok) {
        const serverAuto =
          typeof json.data?.auto_approval === 'boolean'
            ? json.data.auto_approval
            : typeof json.data?.require_approval === 'boolean'
              ? !json.data.require_approval
              : next;
        setAutoApproval(serverAuto);
        showToast({
          type: 'success',
          title: 'System Setting Updated',
          message: serverAuto
            ? 'Auto approval enabled. Staff file submissions will be approved automatically.'
            : 'Auto approval disabled. Staff file submissions now require administrator review.',
        });
      } else {
        setAutoApproval(previous);
        showToast({
          type: 'error',
          title: 'Failed to Update Setting',
          message: json?.message || 'Server rejected the setting update.',
        });
      }
    } catch {
      setAutoApproval(previous);
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
      const res = await fetch(
        `/api/admin/files/${encodeURIComponent(approvingFile.file_no)}/approve`,
        { method: 'POST' },
      );
      const json = await res.json().catch(() => null);

      if (res.ok && json?.ok) {
        showToast({
          type: 'success',
          title: 'Submission Approved',
          message:
            json.data?.message ||
            `File ${approvingFile.file_name} has been approved.`,
        });
        setApprovingFile(null);
        refreshFilesView();
      } else {
        showToast({
          type: 'error',
          title: 'Approval Failed',
          message: json?.message || 'Could not approve submission.',
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
      const res = await fetch(
        `/api/admin/files/${encodeURIComponent(rejectingFile.file_no)}/reject`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ reason }),
        },
      );
      const json = await res.json().catch(() => null);

      if (res.ok && json?.ok) {
        showToast({
          type: 'info',
          title: 'Submission Declined',
          message:
            json.data?.message ||
            `File request ${rejectingFile.file_no} has been rejected.`,
        });
        setRejectingFile(null);
        refreshFilesView();
      } else {
        // If it's a validation error (e.g., missing reason), keep modal open
        if (json?.code === 'VALIDATION_ERROR') {
          showToast({
            type: 'error',
            title: 'Validation Error',
            message: json?.message || 'Could not reject submission.',
          });
        } else {
          // For other errors, also keep modal open but show error
          showToast({
            type: 'error',
            title: 'Rejection Failed',
            message: json?.message || 'Could not reject submission.',
          });
        }
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
      const res = await fetch(
        `/api/admin/files/${encodeURIComponent(editingFile.file_no)}`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        },
      );
      const json = await res.json().catch(() => null);

      if (res.ok && json?.ok) {
        showToast({
          type: 'success',
          title: 'File Updated',
          message: 'File details were updated successfully.',
        });
        setEditingFile(null);
        refreshFilesView();
      } else {
        showToast({
          type: 'error',
          title: 'Update Failed',
          message: json?.message || 'Could not update file record.',
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
      const res = await fetch(
        `/api/admin/files/${encodeURIComponent(deletingFile.file_no)}`,
        { method: 'DELETE' },
      );
      const json = await res.json().catch(() => null);

      if (res.ok && json?.ok) {
        showToast({
          type: 'success',
          title: 'File Deleted',
          message: 'File record has been permanently removed.',
        });
        setDeletingFile(null);
        refreshFilesView();
      } else {
        showToast({
          type: 'error',
          title: 'Delete Failed',
          message: json?.message || 'Could not delete file record.',
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

  const format4Digit = (n: number) => String(n).padStart(4, '0');

  const isFiltered = Boolean(
    debouncedSearch ||
      (selectedSection && selectedSection !== 'all') ||
      (selectedStorage && selectedStorage !== 'all') ||
      startDate ||
      endDate,
  );

  // Never show rows from the previous tab while the new tab is loading.
  const tabDataStale = loadedTab !== activeTab;
  const showSkeleton =
    !hasLoadedTableOnce ||
    tabDataStale ||
    (isTableLoading && files.length === 0 && !loadError);
  const isBusy = isTableLoading || showSkeleton;
  const showRefresh = isTableLoading && !showSkeleton;
  const todayLabel = formatSriLankaDate(new Date());

  return (
    <div className="w-full pb-10 font-dm">
      {/* ── BREADCRUMBS & TOP BAR ── */}
      <div className="mb-4 flex flex-col justify-between gap-2 md:flex-row md:items-center">
        <nav className="flex items-center gap-2 text-xs font-semibold text-slate-400 dark:text-gray-400">
          <Link
            href="/admin/dashboard"
            className="transition-colors hover:text-slate-600 dark:hover:text-white"
          >
            Pages
          </Link>
          <span>/</span>
          <span className="text-slate-500 dark:text-gray-300">Record Room</span>
          <span>/</span>
          <span className="font-bold text-[#1B254B] dark:text-white">
            All Files
          </span>
        </nav>

        <Link
          href="/admin/dashboard"
          className="inline-flex items-center gap-1.5 text-xs font-bold text-[#4318FF] hover:underline dark:text-brand-300"
        >
          <FiArrowLeft className="h-3.5 w-3.5" />
          <span>Back to Recordroom Dashboard</span>
        </Link>
      </div>

      {/* ── HEADING & TOP SUMMARY METRIC CARDS ── */}
      <div className="mb-5 flex flex-col justify-between gap-4 lg:flex-row lg:items-center">
        <div>
          <h1 className="text-2xl font-black tracking-tight text-[#1B254B] dark:text-white sm:text-3xl">
            All Files
          </h1>
          <p className="mt-0.5 text-xs text-slate-400 dark:text-gray-400">
            All files in the Recordroom as of {todayLabel}. Review incoming
            submissions and manage administrative approvals.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3 sm:flex-nowrap">
          <div className="shadow-xs flex min-w-[170px] items-center gap-3 rounded-2xl border border-slate-100 bg-white p-3 dark:border-navy-700 dark:bg-navy-800 sm:px-4 sm:py-3">
            <div className="dark:bg-blue-950/40 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#EFF6FF] text-[#3B82F6] dark:text-blue-300">
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
                <span className="text-[11px] font-bold text-slate-400">
                  Files
                </span>
              </div>
              <span className="inline-block text-[10px] font-semibold text-slate-400">
                Total Archives
              </span>
            </div>
          </div>

          <div className="shadow-xs flex min-w-[170px] items-center gap-3 rounded-2xl border border-slate-100 bg-white p-3 dark:border-navy-700 dark:bg-navy-800 sm:px-4 sm:py-3">
            <div className="dark:bg-blue-950/40 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#EFF6FF] text-[#3B82F6] dark:text-blue-300">
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
                <span className="text-[11px] font-bold text-slate-400">
                  Files
                </span>
              </div>
              <span className="inline-block text-[10px] font-semibold text-slate-400">
                Today&apos;s Intake
              </span>
            </div>
          </div>

          <div className="shadow-xs flex min-w-[170px] items-center gap-3 rounded-2xl border border-slate-100 bg-white p-3 dark:border-navy-700 dark:bg-navy-800 sm:px-4 sm:py-3">
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
                <span className="text-[11px] font-bold text-slate-400">
                  Files added
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── SEARCH & FILTER CONTROLS BAR ── */}
      <div className="shadow-xs mb-4 rounded-2xl border border-slate-100 bg-white p-3 dark:border-navy-700 dark:bg-navy-800">
        <div className="flex flex-wrap items-center gap-2.5">
          <div className="relative min-w-[220px] flex-1">
            <FiSearch className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              placeholder="Search by file number, file name, or officer..."
              aria-label="Search files"
              className="h-9 w-full rounded-xl border border-transparent bg-slate-50/70 pl-9 pr-3 text-xs text-slate-800 outline-none transition-all placeholder:text-slate-400 focus:border-[#4318FF] focus:ring-2 focus:ring-[#4318FF]/15 dark:bg-navy-900/70 dark:text-white"
            />
          </div>

          <div className="relative min-w-[155px]">
            <select
              value={selectedSection}
              onChange={(event) =>
                applyFilter(() => setSelectedSection(event.target.value))
              }
              aria-label="Filter by section"
              className="h-9 w-full cursor-pointer appearance-none rounded-xl border border-transparent bg-slate-50/70 px-3 pr-8 text-xs font-semibold text-slate-700 outline-none focus:border-[#4318FF] focus:ring-2 focus:ring-[#4318FF]/15 dark:bg-navy-900/70 dark:text-slate-200"
            >
              <option value="all">
                All Sections ({sectionsList.length || 12})
              </option>
              {sectionsList.map((section, index) => (
                <option key={section.id ?? index} value={section.name}>
                  {section.name}
                </option>
              ))}
            </select>
            <FiChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
          </div>

          <div className="relative min-w-[145px]">
            <select
              value={selectedStorage}
              onChange={(event) =>
                applyFilter(() => setSelectedStorage(event.target.value))
              }
              aria-label="Filter by storage unit"
              className="h-9 w-full cursor-pointer appearance-none rounded-xl border border-transparent bg-slate-50/70 px-3 pr-8 text-xs font-semibold text-slate-700 outline-none focus:border-[#4318FF] focus:ring-2 focus:ring-[#4318FF]/15 dark:bg-navy-900/70 dark:text-slate-200"
            >
              <option value="all">All Storage Units</option>
              <option value="Rack A">Rack A-04</option>
              <option value="Vault B">Vault B</option>
              <option value="Wing C">Wing C</option>
              <option value="Archive Room 2">Archive Room 2</option>
              <option value="Locker L-102">Locker L-102</option>
            </select>
            <FiChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
          </div>

          <div className="flex items-center gap-1.5">
            <div className="relative">
              <FiCalendar className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
              <input
                type="date"
                value={startDate}
                max={endDate || undefined}
                onChange={(event) =>
                  applyFilter(() => setStartDate(event.target.value))
                }
                aria-label="Start date"
                title="Start date"
                aria-invalid={Boolean(dateRangeError)}
                className={`h-9 w-[148px] cursor-pointer rounded-xl border bg-slate-50/70 pl-8 pr-2 text-xs font-semibold text-slate-700 outline-none focus:border-[#4318FF] focus:ring-2 focus:ring-[#4318FF]/15 dark:bg-navy-900/70 dark:text-slate-200 ${
                  dateRangeError
                    ? 'border-rose-400 dark:border-rose-500'
                    : 'border-transparent'
                }`}
              />
            </div>
            <span className="text-[10px] font-bold uppercase text-slate-400">to</span>
            <div className="relative">
              <FiCalendar className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
              <input
                type="date"
                value={endDate}
                min={startDate || undefined}
                onChange={(event) =>
                  applyFilter(() => setEndDate(event.target.value))
                }
                aria-label="End date"
                title="End date"
                aria-invalid={Boolean(dateRangeError)}
                className={`h-9 w-[148px] cursor-pointer rounded-xl border bg-slate-50/70 pl-8 pr-2 text-xs font-semibold text-slate-700 outline-none focus:border-[#4318FF] focus:ring-2 focus:ring-[#4318FF]/15 dark:bg-navy-900/70 dark:text-slate-200 ${
                  dateRangeError
                    ? 'border-rose-400 dark:border-rose-500'
                    : 'border-transparent'
                }`}
              />
            </div>
            {(startDate || endDate) && (
              <button
                type="button"
                onClick={handleClearDates}
                aria-label="Clear date range"
                title="Clear date range"
                className="flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-500 transition-colors hover:bg-slate-50 hover:text-rose-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#4318FF] dark:border-navy-700 dark:bg-navy-900 dark:text-slate-300"
              >
                <FiX className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          <button
            type="button"
            onClick={handleResetFilters}
            className="flex h-9 shrink-0 cursor-pointer items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 text-xs font-bold text-slate-600 transition-colors hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#4318FF] dark:border-navy-700 dark:bg-navy-900 dark:text-slate-300"
          >
            <FiRefreshCw className="h-3.5 w-3.5" />
            <span>Reset Filters</span>
          </button>

          <button
            type="button"
            onClick={handleExportCsv}
            disabled={isExporting}
            className={`flex h-9 shrink-0 cursor-pointer items-center gap-1.5 rounded-xl px-3 text-xs font-bold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#4318FF] focus-visible:ring-offset-2 ${
              isExporting
                ? 'cursor-not-allowed bg-[#4318FF]/60 text-white'
                : 'shadow-xs bg-[#4318FF] text-white shadow-[#4318FF]/30 hover:bg-[#3311CC]'
            }`}
            title={`Export ${
              activeTab === 'requests' ? 'File Requests' : 'All Files'
            } as CSV`}
          >
            {isExporting ? (
              <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white border-t-transparent" />
            ) : (
              <FiDownload className="h-3.5 w-3.5" />
            )}
            <span>{isExporting ? 'Exporting…' : 'Export CSV'}</span>
          </button>
        </div>

        {dateRangeError && (
          <p
            role="alert"
            className="mt-2 flex items-center gap-1.5 text-[11px] font-semibold text-rose-600 dark:text-rose-400"
          >
            <FiAlertCircle className="h-3.5 w-3.5 shrink-0" />
            {dateRangeError}
          </p>
        )}
      </div>

      {/* ── SECURE REPOSITORY BANNER ── */}
      <div className="mb-4 flex items-center justify-between rounded-xl border border-slate-200/50 bg-[#F4F7FE] px-4 py-2 dark:border-navy-700 dark:bg-navy-900/80">
        <div className="flex items-center gap-2 text-xs font-semibold text-slate-600 dark:text-slate-300">
          <FiShield className="h-4 w-4 text-[#4318FF] dark:text-brand-300" />
          <span>Secure repository • Access managed for your administrator</span>
        </div>
        <div className="flex items-center gap-1.5 rounded-full bg-[#EBF3FE] px-2.5 py-0.5 text-[10px] font-bold text-[#4318FF] dark:bg-navy-800 dark:text-brand-300">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#4318FF] dark:bg-brand-300" />
          <span>ACTIVE</span>
        </div>
      </div>

      {/* ── TABS BAR & ADMIN APPROVAL TOGGLE SWITCH ── */}
      <div className="mb-4 flex flex-col justify-between gap-3 md:flex-row md:items-center">
        <div role="tablist" aria-label="File categories" className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            role="tab"
            id="files-tab-requests"
            aria-selected={activeTab === 'requests'}
            aria-controls="files-tab-panel"
            onClick={() => handleTabChange('requests')}
            className={`flex cursor-pointer items-center gap-2 rounded-full px-4 py-2 text-xs font-bold transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-[#4318FF]/60 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-navy-900 ${
              activeTab === 'requests'
                ? 'bg-[#4318FF] text-white shadow-md shadow-[#4318FF]/25'
                : 'border border-slate-200/60 bg-white text-slate-600 hover:bg-slate-50 dark:border-navy-700 dark:bg-navy-800 dark:text-slate-300'
            }`}
          >
            <FiClock className="h-3.5 w-3.5" />
            <span>File Requests</span>
            <span
              className={`rounded-full px-2 py-0.5 text-[10px] font-black ${
                activeTab === 'requests'
                  ? 'bg-[#3311CC] text-white'
                  : 'dark:bg-amber-950/60 bg-amber-100 text-amber-800 dark:text-amber-300'
              }`}
            >
              {counts.pendingCount} Pending
            </span>
          </button>

          <button
            type="button"
            role="tab"
            id="files-tab-all"
            aria-selected={activeTab === 'all'}
            aria-controls="files-tab-panel"
            onClick={() => handleTabChange('all')}
            className={`flex cursor-pointer items-center gap-2 rounded-full px-4 py-2 text-xs font-bold transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-[#4318FF]/60 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-navy-900 ${
              activeTab === 'all'
                ? 'bg-[#4318FF] text-white shadow-md shadow-[#4318FF]/25'
                : 'border border-slate-200/60 bg-white text-slate-600 hover:bg-slate-50 dark:border-navy-700 dark:bg-navy-800 dark:text-slate-300'
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

          <button
            type="button"
            role="tab"
            id="files-tab-rejected"
            aria-selected={activeTab === 'rejected'}
            aria-controls="files-tab-panel"
            onClick={() => handleTabChange('rejected')}
            className={`flex cursor-pointer items-center gap-2 rounded-full px-4 py-2 text-xs font-bold transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-[#4318FF]/60 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-navy-900 ${
              activeTab === 'rejected'
                ? 'bg-[#4318FF] text-white shadow-md shadow-[#4318FF]/25'
                : 'bg-white dark:bg-navy-800 text-slate-600 dark:text-slate-300 hover:bg-slate-50 border border-slate-200/60 dark:border-navy-700'
            }`}
          >
            <FiXCircle className="h-3.5 w-3.5" />
            <span>Rejected Files</span>
            <span
              className={`rounded-full px-2 py-0.5 text-[10px] font-black ${
                activeTab === 'rejected'
                  ? 'bg-[#3311CC] text-white'
                  : 'bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300'
              }`}
            >
              {counts.rejectedCount ?? 0}
            </span>
          </button>
        </div>

        <div className="shadow-xs flex items-center gap-3 self-end rounded-2xl border border-slate-100 bg-white px-4 py-2 dark:border-navy-700 dark:bg-navy-800 md:self-auto">
          <div className="text-right">
            <div className="flex items-center justify-end gap-1.5">
              <span className="text-xs font-bold text-slate-800 dark:text-white">
                Auto Approval for Staff File Submissions
              </span>
              <span
                className={`py-0.2 rounded px-1.5 text-[9px] font-black tracking-wide ${
                  autoApproval
                    ? 'border border-emerald-200 bg-emerald-50 text-emerald-600 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300'
                    : 'border border-slate-200 bg-slate-100 text-slate-500 dark:bg-navy-900 dark:text-slate-400'
                }`}
              >
                {autoApproval ? 'AUTO APPROVAL ON' : 'AUTO APPROVAL OFF'}
              </span>
            </div>
            <p className="text-[10px] text-slate-400">
              {autoApproval
                ? 'Staff file requests are automatically approved upon submission.'
                : 'Staff submissions require administrator review and approval.'}
            </p>
          </div>

          <button
            type="button"
            role="switch"
            aria-checked={autoApproval}
            aria-label="Toggle auto approval for staff file submissions"
            disabled={isTogglingApproval}
            onClick={handleToggleApprovalSetting}
            className={`border-transparent relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 transition-colors duration-200 ease-in-out focus:outline-none focus-visible:ring-2 focus-visible:ring-[#05CD99] focus-visible:ring-offset-2 ${
              autoApproval ? 'bg-[#05CD99]' : 'bg-slate-300 dark:bg-navy-600'
            } ${isTogglingApproval ? 'cursor-not-allowed opacity-60' : ''}`}
            title={autoApproval ? 'Auto approval is ON' : 'Auto approval is OFF'}
          >
            <span
              className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-md ring-0 transition duration-200 ease-in-out ${
                autoApproval ? 'translate-x-5' : 'translate-x-0'
              }`}
            />
          </button>
        </div>
      </div>

      {/* ── SECTION HEADER BELOW TABS ── */}
      {activeTab === 'requests' ? (
        <div className="mb-3 flex items-center justify-between">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-xs font-black uppercase tracking-wider text-slate-700 dark:text-slate-200">
              PENDING STAFF FILE SUBMISSIONS (AWAITING APPROVAL)
            </h2>
            <span className="dark:bg-amber-950/40 rounded-full border border-[#FDE68A] bg-[#FFFBEB] px-2.5 py-0.5 text-[10px] font-bold text-[#D97706] dark:text-amber-300">
              {counts.pendingCount} submissions pending review
            </span>
          </div>
          <span className="hidden text-[11px] italic text-slate-400 sm:inline">
            Actions taken here immediately update the system ledger.
          </span>
        </div>
      ) : activeTab === 'rejected' ? (
        <div className="mb-3 flex items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-xs font-black uppercase tracking-wider text-slate-700 dark:text-slate-200">
              REJECTED FILE SUBMISSIONS
            </h2>
            <span className="rounded-full bg-rose-50 text-rose-600 border border-rose-200 dark:bg-rose-950/40 dark:text-rose-300 px-2.5 py-0.5 text-[10px] font-bold">
              {counts.rejectedCount ?? 0} rejected submissions
            </span>
          </div>

          <div className="flex items-center gap-1.5 text-xs text-slate-500">
            <span className="font-semibold text-slate-400">Sorted by:</span>
            <div className="relative">
              <select
                value={sortBy}
                onChange={(event) => handleSortChange(event.target.value as SortKey)}
                aria-label="Sort rejected submissions"
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
      ) : (
        <div className="mb-3 flex items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-xs font-black uppercase tracking-wider text-slate-700 dark:text-slate-200">
              TOTAL TODAY ADDED FILES
            </h2>
            <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-[10px] font-bold text-slate-700 dark:bg-navy-700 dark:text-slate-300">
              {counts.allFilesCount} files
            </span>
          </div>

          <div className="flex items-center gap-1.5 text-xs text-slate-500">
            <span className="font-semibold text-slate-400">Sorted by:</span>
            <div className="relative">
              <select
                value={sortBy}
                onChange={(event) => handleSortChange(event.target.value as SortKey)}
                aria-label="Sort files"
                className="cursor-pointer appearance-none rounded-lg border border-slate-200 bg-white px-2.5 py-1 pr-6 text-xs font-bold text-slate-700 outline-none dark:border-navy-700 dark:bg-navy-800 dark:text-white"
              >
                <option value="newest">Newest added</option>
                <option value="oldest">Oldest added</option>
                <option value="file_no">File Number</option>
                <option value="file_name">File Name</option>
              </select>
              <FiChevronDown className="pointer-events-none absolute right-1.5 top-1/2 h-3 w-3 -translate-y-1/2 text-slate-400" />
            </div>
          </div>
        </div>
      )}

      {/* ── LOADING PROGRESS BAR — visible during background refreshes (not skeleton loads) ── */}
      <div
        role="tabpanel"
        id="files-tab-panel"
        aria-labelledby={`files-tab-${activeTab}`}
      >
      <TableLoadingProgressBar
        active={showRefresh}
        label={
          activeTab === 'requests'
            ? 'Refreshing file requests'
            : activeTab === 'rejected'
              ? 'Refreshing rejected files'
              : 'Refreshing all files'
        }
      />

      {/* Inline refresh failure: keep the last successful rows visible. */}
      {loadError && files.length > 0 && (
        <div
          role="alert"
          className="mb-3 flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-[11px] font-semibold text-rose-700 dark:border-rose-900/50 dark:bg-rose-950/40 dark:text-rose-300"
        >
          <FiAlertCircle className="h-3.5 w-3.5 shrink-0" />
          <span className="flex-1">{loadError}</span>
          <button
            type="button"
            onClick={refreshFilesView}
            className="inline-flex items-center gap-1 rounded-lg px-2 py-1 font-bold text-rose-700 transition-colors hover:bg-rose-100 dark:text-rose-200 dark:hover:bg-rose-900/40"
          >
            <FiRefreshCw className="h-3 w-3" />
            Retry
          </button>
        </div>
      )}

      {/* ── TAB CONTENT TABLE ── */}
      {activeTab === 'requests' ? (
        <FileRequestsTable
          files={files}
          loading={showSkeleton}
          refreshing={showRefresh}
          error={loadError}
          total={total}
          page={page}
          limit={DEFAULT_LIMIT}
          totalPages={totalPages}
          isFiltered={isFiltered}
          onPageChange={setPage}
          onApprove={setApprovingFile}
          onReject={setRejectingFile}
          onView={setViewingFile}
          onRetry={refreshFilesView}
        />
      ) : activeTab === 'rejected' ? (
        <RejectedFilesTable
          files={files}
          loading={showSkeleton}
          refreshing={showRefresh}
          error={loadError}
          total={total}
          page={page}
          limit={DEFAULT_LIMIT}
          totalPages={totalPages}
          isFiltered={isFiltered}
          onPageChange={setPage}
          onView={setViewingFile}
          onRetry={refreshFilesView}
        />
      ) : (
        <AllFilesTable
          files={files}
          total={total}
          page={page}
          limit={DEFAULT_LIMIT}
          totalPages={totalPages}
          isFiltered={isFiltered}
          loading={showSkeleton}
          refreshing={showRefresh}
          error={loadError}
          onPageChange={setPage}
          onView={setViewingFile}
          onEdit={setEditingFile}
          onDelete={setDeletingFile}
          onApprove={setApprovingFile}
          onReject={setRejectingFile}
          onRetry={refreshFilesView}
        />
      )}
      </div>

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
