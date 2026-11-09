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
  FiBell,
} from 'react-icons/fi';
import { useTranslation } from 'react-i18next';
import { useToast } from 'components/toast/ToastContext';
import { exportToCsv, formatDateTimeForCsv } from 'lib/csvExport';
import { fetchClientSections } from 'lib/sectionsClient';
import { FILE_FIELD_MAX_LENGTH } from 'lib/constants';
import { getSupabaseBrowserClient } from 'config/supabase/client';
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
import { localizeField, useLocalizedFields } from 'lib/useLocalizedFields';
import { attributedNameText } from 'utils/userDisplay';
import type { FileRecordRow, FileCountsSummary } from 'models/FileRepository';

interface SectionItem {
  id?: number | string;
  name: string;
}

type TabKey = 'requests' | 'all' | 'rejected';
type SortKey = 'newest' | 'oldest' | 'file_no' | 'file_name';

const DEFAULT_LIMIT = 15;
const SEARCH_DEBOUNCE_MS = 300;
const REALTIME_REFRESH_DEBOUNCE_MS = 1000;

const EMPTY_COUNTS: FileCountsSummary = {
  totalArchives: 0,
  todayCount: 0,
  allFilesCount: 0,
  pendingCount: 0,
  rejectedCount: 0,
};

export default function ManageSystemFilesPage() {
  const { showToast } = useToast();
  const { t } = useTranslation('files');

  const [activeTab, setActiveTab] = useState<TabKey>('requests');

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
  useLocalizedFields(sectionsList.map((section) => section.name));

  const [viewingFile, setViewingFile] = useState<FileRecordRow | null>(null);
  const [approvingFile, setApprovingFile] = useState<FileRecordRow | null>(null);
  const [isApproving, setIsApproving] = useState<boolean>(false);
  const [rejectingFile, setRejectingFile] = useState<FileRecordRow | null>(null);
  const [isRejecting, setIsRejecting] = useState<boolean>(false);
  const [editingFile, setEditingFile] = useState<FileRecordRow | null>(null);
  const [isSavingEdit, setIsSavingEdit] = useState<boolean>(false);
  const [deletingFile, setDeletingFile] = useState<FileRecordRow | null>(null);
  const [isDeleting, setIsDeleting] = useState<boolean>(false);

  // Realtime notification state
  const [newFileNotification, setNewFileNotification] = useState<{
    fileNo: string;
    fileName: string;
    timestamp: number;
  } | null>(null);

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
      return t('filters.invalidDates');
    }
    if (startDate && endDate && startDate > endDate) {
      return t('filters.invalidRange');
    }
    return null;
  }, [startDate, endDate, t]);

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
          const message = json?.message || t('feedback.loadFailedMessage');
          setLoadError(message);
          setLoadedTab(activeTab);
          setHasLoadedTableOnce(true);
          showToast({
            type: 'error',
            title: t('feedback.errorLoadingTitle'),
            message,
          });
        }
      } catch (error) {
        if (signal.aborted || requestId !== requestIdRef.current) return;
        const message = t('feedback.connectionLoadMessage');
        setLoadError(message);
        setLoadedTab(activeTab);
        setHasLoadedTableOnce(true);
        showToast({
          type: 'error',
          title: t('feedback.connectionErrorTitle'),
          message,
        });
      } finally {
        if (requestId === requestIdRef.current) setIsTableLoading(false);
      }
    },
    [activeTab, buildFilterParams, showToast, t],
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

  // ── Realtime Subscription for Files Table ───────────────────────────────────
  useEffect(() => {
    let refreshTimer: number | undefined;
    let channel: any = null;

    const scheduleRefresh = () => {
      window.clearTimeout(refreshTimer);
      refreshTimer = window.setTimeout(() => {
        setReloadKey((key) => key + 1);
        void loadMeta();
      }, REALTIME_REFRESH_DEBOUNCE_MS);
    };

    const handleFileChange = (payload: any) => {
      const { eventType, new: newRecord, old: oldRecord } = payload;

      // Show notification for new file insertions
      if (eventType === 'INSERT' && newRecord) {
        const isStaffSubmission = newRecord.registrar_role !== 'Administrator' &&
                                newRecord.registrar_role !== 'Admin';
        
        if (isStaffSubmission) {
          setNewFileNotification({
            fileNo: newRecord.file_no,
            fileName: newRecord.file_name,
            timestamp: Date.now(),
          });

          // Auto-dismiss notification after 5 seconds
          window.setTimeout(() => {
            setNewFileNotification(null);
          }, 5000);
        }
      }

      // Always refresh on any change to keep UI in sync
      scheduleRefresh();
    };

    try {
      const supabase = getSupabaseBrowserClient();
      channel = supabase
        .channel('manage-system-files-realtime')
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'files' },
          handleFileChange,
        )
        .subscribe((status) => {
          if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
            console.error('Realtime subscription error for files table:', status);
          }
        });
    } catch (error) {
      console.error('Failed to setup realtime subscription:', error);
      // Realtime is optional; keep the manual refresh fallback
    }

    return () => {
      window.clearTimeout(refreshTimer);
      if (channel) {
        try {
          getSupabaseBrowserClient().removeChannel(channel);
        } catch (error) {
          console.error('Error removing realtime channel:', error);
        }
      }
    };
  }, [loadMeta]);

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
        title: t('feedback.invalidDateRangeTitle'),
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
          title: t('feedback.exportFailedTitle'),
          message: json?.message || t('feedback.exportFetchFailed'),
        });
        return;
      }

      const exportFiles: FileRecordRow[] = json.data.files || [];

      if (exportFiles.length === 0) {
        showToast({
          type: 'info',
          title: t('feedback.noRecordsToExportTitle'),
          message: t('feedback.noRecordsToExportMessage'),
        });
        return;
      }

      const today = sriLankaTodayInput();
      const deletedLabel = t('common:deletedUser');

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
            attributedNameText(f.registrar_name, {
              deleted: f.registrar_is_deleted,
              label: deletedLabel,
            }),
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

          // adminName resolves the approved_by actor, which carries the deleted flag.
          const adminNameText = attributedNameText(adminName, {
            deleted: f.approver_is_deleted,
            label: deletedLabel,
          });

          let adminAction = 'System Verified';
          if (f.status === 'PENDING') {
            adminAction = 'Pending Review';
          } else if (f.status === 'disabled' || f.status === 'disposed') {
            adminAction = adminName ? `Disabled by ${adminNameText}` : 'Disabled';
          } else if (f.status === 'REJECTED') {
            adminAction = adminName ? `Rejected by ${adminNameText}` : 'Rejected';
          } else if (adminName) {
            adminAction = `Approved by ${adminNameText}`;
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
            attributedNameText(f.registrar_name, {
              deleted: f.registrar_is_deleted,
              label: deletedLabel,
            }),
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
        title: t('feedback.exportCompleteTitle'),
        message: t('feedback.exportCompleteMessage', {
          count: exportFiles.length,
        }),
      });
    } catch {
      showToast({
        type: 'error',
        title: t('feedback.exportErrorTitle'),
        message: t('feedback.exportErrorMessage'),
      });
    } finally {
      setIsExporting(false);
    }
  };

  // ── Approve File Action ────────────────────────────────────────────────────
  const handleApproveConfirm = async (storageData: { locker_no: string | null; shelf_name: string | null; shelf_position: string | null }) => {
    if (!approvingFile || isApproving) return;
    setIsApproving(true);

    try {
      const res = await fetch(
        `/api/admin/files/${encodeURIComponent(approvingFile.file_no)}/approve`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(storageData),
        },
      );
      const json = await res.json().catch(() => null);

      if (res.ok && json?.ok) {
        showToast({
          type: 'success',
          title: t('feedback.approveSuccessTitle'),
          message:
            json.data?.message ||
            t('feedback.approveSuccessMessage', {
              fileName: approvingFile.file_name,
            }),
        });
        setApprovingFile(null);
        refreshFilesView();
      } else {
        showToast({
          type: 'error',
          title: t('feedback.approvalFailedTitle'),
          message: json?.message || t('feedback.couldNotApprove'),
        });
      }
    } catch {
      showToast({
        type: 'error',
        title: t('feedback.connectionErrorTitle'),
        message: t('feedback.approveConnectionMessage'),
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
          title: t('feedback.rejectSuccessTitle'),
          message:
            json.data?.message ||
            t('feedback.rejectSuccessMessage', {
              fileNo: rejectingFile.file_no,
            }),
        });
        setRejectingFile(null);
        refreshFilesView();
      } else {
        // If it's a validation error (e.g., missing reason), keep modal open
        if (json?.code === 'VALIDATION_ERROR') {
          showToast({
            type: 'error',
            title: t('feedback.validationErrorTitle'),
            message: json?.message || t('feedback.couldNotReject'),
          });
        } else {
          // For other errors, also keep modal open but show error
          showToast({
            type: 'error',
            title: t('feedback.rejectionFailedTitle'),
            message: json?.message || t('feedback.couldNotReject'),
          });
        }
      }
    } catch {
      showToast({
        type: 'error',
        title: t('feedback.connectionErrorTitle'),
        message: t('feedback.rejectConnectionMessage'),
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
          title: t('feedback.updatedTitle'),
          message: t('feedback.updatedMessage'),
        });
        setEditingFile(null);
        refreshFilesView();
      } else if (json?.code === 'FIELD_TOO_LONG') {
        // Surface the server's verdict on the field itself, not as a toast.
        return t('validation.fileNameMax', {
          max: Number(json.max) || FILE_FIELD_MAX_LENGTH,
        });
      } else {
        showToast({
          type: 'error',
          title: t('feedback.updateFailedTitle'),
          message: json?.message || t('feedback.couldNotUpdate'),
        });
      }
    } catch {
      showToast({
        type: 'error',
        title: t('feedback.connectionErrorTitle'),
        message: t('feedback.updateConnectionMessage'),
      });
    } finally {
      setIsSavingEdit(false);
    }
    return null;
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
          title: t('feedback.deletedTitle'),
          message: t('feedback.deletedMessage'),
        });
        setDeletingFile(null);
        refreshFilesView();
      } else {
        showToast({
          type: 'error',
          title: t('feedback.deleteFailedTitle'),
          message: json?.message || t('feedback.couldNotDelete'),
        });
      }
    } catch {
      showToast({
        type: 'error',
        title: t('feedback.connectionErrorTitle'),
        message: t('feedback.deleteConnectionMessage'),
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
            {t('page.breadcrumbPages')}
          </Link>
          <span>/</span>
          <span className="text-slate-500 dark:text-gray-300">
            {t('page.breadcrumbRecordRoom')}
          </span>
          <span>/</span>
          <span className="font-bold text-[#1B254B] dark:text-white">
            {t('page.breadcrumbAllFiles')}
          </span>
        </nav>

        <Link
          href="/admin/dashboard"
          className="inline-flex items-center gap-1.5 text-xs font-bold text-[#4318FF] hover:underline dark:text-brand-300"
        >
          <FiArrowLeft className="h-3.5 w-3.5" />
          <span>{t('page.backToDashboard')}</span>
        </Link>
      </div>

      {/* ── HEADING & TOP SUMMARY METRIC CARDS ── */}
      <div className="mb-5 flex flex-col justify-between gap-4 lg:flex-row lg:items-center">
        <div>
          <h1 className="text-2xl font-black tracking-tight text-[#1B254B] dark:text-white sm:text-3xl">
            {t('page.title')}
          </h1>
          <p className="mt-0.5 text-xs text-slate-400 dark:text-gray-400">
            {t('page.subtitle', { date: todayLabel })}
          </p>
        </div>

        {/* ── NEW FILE NOTIFICATION BANNER ── */}
        {newFileNotification && (
          <div className="flex items-center gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 dark:border-emerald-800/40 dark:bg-emerald-950/30 animate-in slide-in-from-top fade-in duration-300">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-600 dark:bg-emerald-900/50 dark:text-emerald-400">
              <FiBell className="h-4 w-4" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-bold text-emerald-800 dark:text-emerald-300">
                {t('page.newFileRequest')}
              </p>
              <p className="mt-0.5 truncate text-[11px] font-medium text-emerald-700 dark:text-emerald-400">
                {newFileNotification.fileNo} - {newFileNotification.fileName}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setNewFileNotification(null)}
              className="shrink-0 rounded-lg p-1 text-emerald-600 hover:bg-emerald-100 dark:text-emerald-400 dark:hover:bg-emerald-900/50 transition-colors"
              aria-label={t('page.dismissNotification')}
            >
              <FiX className="h-4 w-4" />
            </button>
          </div>
        )}

        <div className="flex flex-wrap items-center gap-3 sm:flex-nowrap">
          <div className="shadow-xs flex min-w-[170px] items-center gap-3 rounded-2xl border border-slate-100 bg-white p-3 dark:border-navy-700 dark:bg-navy-800 sm:px-4 sm:py-3">
            <div className="dark:bg-blue-950/40 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#EFF6FF] text-[#3B82F6] dark:text-blue-300">
              <FiFolder className="h-5 w-5" />
            </div>
            <div>
              <span className="block text-[9px] font-black uppercase tracking-wider text-slate-400">
                {t('page.statTotalLabel')}
              </span>
              <div className="flex items-baseline gap-1.5">
                <span className="font-mono text-base font-black text-[#1B254B] dark:text-white">
                  {format4Digit(counts.totalArchives)}
                </span>
                <span className="text-[11px] font-bold text-slate-400">
                  {t('page.statUnit')}
                </span>
              </div>
              <span className="inline-block text-[10px] font-semibold text-slate-400">
                {t('page.statTotalHint')}
              </span>
            </div>
          </div>

          <div className="shadow-xs flex min-w-[170px] items-center gap-3 rounded-2xl border border-slate-100 bg-white p-3 dark:border-navy-700 dark:bg-navy-800 sm:px-4 sm:py-3">
            <div className="dark:bg-blue-950/40 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#EFF6FF] text-[#3B82F6] dark:text-blue-300">
              <FiFileText className="h-5 w-5" />
            </div>
            <div>
              <span className="block text-[9px] font-black uppercase tracking-wider text-slate-400">
                {t('page.statTodayLabel')}
              </span>
              <div className="flex items-baseline gap-1.5">
                <span className="font-mono text-base font-black text-[#1B254B] dark:text-white">
                  {format4Digit(counts.todayCount)}
                </span>
                <span className="text-[11px] font-bold text-slate-400">
                  {t('page.statUnit')}
                </span>
              </div>
              <span className="inline-block text-[10px] font-semibold text-slate-400">
                {t('page.statTodayHint')}
              </span>
            </div>
          </div>

          <div className="shadow-xs flex min-w-[170px] items-center gap-3 rounded-2xl border border-slate-100 bg-white p-3 dark:border-navy-700 dark:bg-navy-800 sm:px-4 sm:py-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-[#F4F2FF] text-[#4318FF] dark:bg-brand-900/40 dark:text-brand-300">
              <FiPackage className="h-5 w-5" />
            </div>
            <div>
              <span className="block text-[9px] font-black uppercase tracking-wider text-slate-400">
                {t('page.statAllLabel')}
              </span>
              <div className="flex items-baseline gap-1.5">
                <span className="font-mono text-base font-black text-[#1B254B] dark:text-white">
                  {counts.allFilesCount}
                </span>
                <span className="text-[11px] font-bold text-slate-400">
                  {t('page.statAllUnit')}
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
              placeholder={t('filters.searchPlaceholder')}
              aria-label={t('filters.searchAria')}
              className="h-9 w-full rounded-xl border border-transparent bg-slate-50/70 pl-9 pr-3 text-xs text-slate-800 outline-none transition-all placeholder:text-slate-400 focus:border-[#4318FF] focus:ring-2 focus:ring-[#4318FF]/15 dark:bg-navy-900/70 dark:text-white"
            />
          </div>

          <div className="relative min-w-[155px]">
            <select
              value={selectedSection}
              onChange={(event) =>
                applyFilter(() => setSelectedSection(event.target.value))
              }
              aria-label={t('filters.sectionAria')}
              className="h-9 w-full cursor-pointer appearance-none rounded-xl border border-transparent bg-slate-50/70 px-3 pr-8 text-xs font-semibold text-slate-700 outline-none focus:border-[#4318FF] focus:ring-2 focus:ring-[#4318FF]/15 dark:bg-navy-900/70 dark:text-slate-200"
            >
              <option value="all">
                {t('filters.allSections', {
                  count: sectionsList.length || 12,
                })}
              </option>
              {sectionsList.map((section, index) => (
                <option key={section.id ?? index} value={section.name}>
                  {localizeField(section.name)}
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
              aria-label={t('filters.storageAria')}
              className="h-9 w-full cursor-pointer appearance-none rounded-xl border border-transparent bg-slate-50/70 px-3 pr-8 text-xs font-semibold text-slate-700 outline-none focus:border-[#4318FF] focus:ring-2 focus:ring-[#4318FF]/15 dark:bg-navy-900/70 dark:text-slate-200"
            >
              <option value="all">{t('filters.allStorage')}</option>
              <option value="Rack A">{t('filters.storageRackA')}</option>
              <option value="Vault B">{t('filters.storageVaultB')}</option>
              <option value="Wing C">{t('filters.storageWingC')}</option>
              <option value="Archive Room 2">
                {t('filters.storageArchiveRoom2')}
              </option>
              <option value="Locker L-102">
                {t('filters.storageLockerL102')}
              </option>
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
                aria-label={t('filters.startDate')}
                title={t('filters.startDate')}
                aria-invalid={Boolean(dateRangeError)}
                className={`h-9 w-[148px] cursor-pointer rounded-xl border bg-slate-50/70 pl-8 pr-2 text-xs font-semibold text-slate-700 outline-none focus:border-[#4318FF] focus:ring-2 focus:ring-[#4318FF]/15 dark:bg-navy-900/70 dark:text-slate-200 ${
                  dateRangeError
                    ? 'border-rose-400 dark:border-rose-500'
                    : 'border-transparent'
                }`}
              />
            </div>
            <span className="text-[10px] font-bold uppercase text-slate-400">
              {t('filters.rangeTo')}
            </span>
            <div className="relative">
              <FiCalendar className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
              <input
                type="date"
                value={endDate}
                min={startDate || undefined}
                onChange={(event) =>
                  applyFilter(() => setEndDate(event.target.value))
                }
                aria-label={t('filters.endDate')}
                title={t('filters.endDate')}
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
                aria-label={t('filters.clearDates')}
                title={t('filters.clearDates')}
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
            <span>{t('filters.reset')}</span>
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
            title={t('filters.exportTooltip', {
              target:
                activeTab === 'requests'
                  ? t('page.tabRequests')
                  : t('page.tabAll'),
            })}
          >
            {isExporting ? (
              <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white border-t-transparent" />
            ) : (
              <FiDownload className="h-3.5 w-3.5" />
            )}
            <span>
              {isExporting ? t('filters.exporting') : t('filters.exportCsv')}
            </span>
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
          <span>{t('page.secureRepository')}</span>
        </div>
        <div className="flex items-center gap-1.5 rounded-full bg-[#EBF3FE] px-2.5 py-0.5 text-[10px] font-bold text-[#4318FF] dark:bg-navy-800 dark:text-brand-300">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#4318FF] dark:bg-brand-300" />
          <span>{t('page.activeBadge')}</span>
        </div>
      </div>

      {/* ── TABS BAR & ADMIN APPROVAL TOGGLE SWITCH ── */}
      <div className="mb-4 flex flex-col justify-between gap-3 md:flex-row md:items-center">
        <div role="tablist" aria-label={t('page.tabsAria')} className="flex flex-wrap items-center gap-2">
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
            <span>{t('page.tabRequests')}</span>
            <span
              className={`rounded-full px-2 py-0.5 text-[10px] font-black ${
                activeTab === 'requests'
                  ? 'bg-[#3311CC] text-white'
                  : 'dark:bg-amber-950/60 bg-amber-100 text-amber-800 dark:text-amber-300'
              }`}
            >
              {t('page.tabRequestsCount', { count: counts.pendingCount })}
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
            <span>{t('page.tabAll')}</span>
            <span
              className={`rounded-full px-2 py-0.5 text-[10px] font-black ${
                activeTab === 'all'
                  ? 'bg-[#3311CC] text-white'
                  : 'bg-slate-100 text-slate-600 dark:bg-navy-700 dark:text-slate-300'
              }`}
            >
              {t('page.tabAllCount', { count: counts.allFilesCount })}
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
            <span>{t('page.tabRejected')}</span>
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
      </div>

      {/* ── SECTION HEADER BELOW TABS ── */}
      {activeTab === 'requests' ? (
        <div className="mb-3 flex items-center justify-between">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-xs font-black uppercase tracking-wider text-slate-700 dark:text-slate-200">
              {t('page.pendingHeading')}
            </h2>
            <span className="dark:bg-amber-950/40 rounded-full border border-[#FDE68A] bg-[#FFFBEB] px-2.5 py-0.5 text-[10px] font-bold text-[#D97706] dark:text-amber-300">
              {t('page.pendingBadge', { count: counts.pendingCount })}
            </span>
          </div>
          <span className="hidden text-[11px] italic text-slate-400 sm:inline">
            {t('page.pendingHint')}
          </span>
        </div>
      ) : activeTab === 'rejected' ? (
        <div className="mb-3 flex items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-xs font-black uppercase tracking-wider text-slate-700 dark:text-slate-200">
              {t('page.rejectedHeading')}
            </h2>
            <span className="rounded-full bg-rose-50 text-rose-600 border border-rose-200 dark:bg-rose-950/40 dark:text-rose-300 px-2.5 py-0.5 text-[10px] font-bold">
              {t('page.rejectedBadge', { count: counts.rejectedCount ?? 0 })}
            </span>
          </div>

          <div className="flex items-center gap-1.5 text-xs text-slate-500">
            <span className="font-semibold text-slate-400">
              {t('page.sortedBy')}
            </span>
            <div className="relative">
              <select
                value={sortBy}
                onChange={(event) => handleSortChange(event.target.value as SortKey)}
                aria-label={t('page.sortAriaRejected')}
                className="appearance-none rounded-lg bg-white dark:bg-navy-800 border border-slate-200 dark:border-navy-700 px-2.5 py-1 pr-6 font-bold text-slate-700 dark:text-white outline-none cursor-pointer text-xs"
              >
                <option value="newest">{t('sort.newest')}</option>
                <option value="oldest">{t('sort.oldest')}</option>
                <option value="file_no">{t('sort.fileNumber')}</option>
                <option value="file_name">{t('sort.fileName')}</option>
              </select>
              <FiChevronDown className="pointer-events-none absolute right-1.5 top-1/2 -translate-y-1/2 text-slate-400 h-3 w-3" />
            </div>
          </div>
        </div>
      ) : (
        <div className="mb-3 flex items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-xs font-black uppercase tracking-wider text-slate-700 dark:text-slate-200">
              {t('page.allHeading')}
            </h2>
            <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-[10px] font-bold text-slate-700 dark:bg-navy-700 dark:text-slate-300">
              {t('page.allBadge', { count: counts.allFilesCount })}
            </span>
          </div>

          <div className="flex items-center gap-1.5 text-xs text-slate-500">
            <span className="font-semibold text-slate-400">
              {t('page.sortedBy')}
            </span>
            <div className="relative">
              <select
                value={sortBy}
                onChange={(event) => handleSortChange(event.target.value as SortKey)}
                aria-label={t('page.sortAriaAll')}
                className="cursor-pointer appearance-none rounded-lg border border-slate-200 bg-white px-2.5 py-1 pr-6 text-xs font-bold text-slate-700 outline-none dark:border-navy-700 dark:bg-navy-800 dark:text-white"
              >
                <option value="newest">{t('sort.newest')}</option>
                <option value="oldest">{t('sort.oldest')}</option>
                <option value="file_no">{t('sort.fileNumber')}</option>
                <option value="file_name">{t('sort.fileName')}</option>
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
            ? t('page.refreshRequests')
            : activeTab === 'rejected'
              ? t('page.refreshRejected')
              : t('page.refreshAll')
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
            {t('page.retry')}
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
