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
  FiCheck,
  FiArrowLeft,
  FiClock,
  FiDownload,
  FiXCircle,
} from 'react-icons/fi';
import { useToast } from 'components/toast/ToastContext';
import { exportToCsv, formatDateTimeForCsv } from 'lib/csvExport';
import { fetchClientSections } from 'lib/sectionsClient';
import { sriLankaTodayInput } from 'lib/datetime';
import FileRequestsTable from './FileRequestsTable';
import RejectedFilesTable from './RejectedFilesTable';
import AllFilesTable from './AllFilesTable';
import ViewFileModal from './ViewFileModal';
import ConfirmApproveModal from './ConfirmApproveModal';
import ConfirmRejectModal from './ConfirmRejectModal';
import EditFileModal from './EditFileModal';
import ConfirmDeleteModal from './ConfirmDeleteModal';
import type { FileRecordRow, FileCountsSummary } from 'models/FileRepository';
import TableLoadingProgressBar from './TableLoadingProgressBar';

interface SectionItem {
  id?: number | string;
  name: string;
}

export default function ManageSystemFilesPage() {
  const { showToast } = useToast();

  // Active Tab: 'requests' (File Requests) is active by default
  const [activeTab, setActiveTab] = useState<'requests' | 'all' | 'rejected'>('requests');

  // Global Auto Approval Toggle State (default: false / Auto approval off)
  const [autoApproval, setAutoApproval] = useState<boolean>(false);
  const [isTogglingApproval, setIsTogglingApproval] = useState<boolean>(false);

  // Data & Summary Counts
  const [files, setFiles] = useState<FileRecordRow[]>([]);
  const [counts, setCounts] = useState<FileCountsSummary>({
    totalArchives: 0,
    todayCount: 0,
    allFilesCount: 0,
    pendingCount: 0,
    rejectedCount: 0,
  });
  const [total, setTotal] = useState<number>(0);
  const [page, setPage] = useState<number>(1);
  /** Keep result pages small for responsive search and navigation. */
  const DEFAULT_LIMIT = 15;
  const [totalPages, setTotalPages] = useState<number>(1);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isTableLoading, setIsTableLoading] = useState<boolean>(true);
  const [hasLoadedTableOnce, setHasLoadedTableOnce] = useState<boolean>(false);
  /** Which tab the current `files` rows belong to (avoids showing the wrong tab during fetches). */
  const [tableDataTab, setTableDataTab] = useState<'requests' | 'all' | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isExporting, setIsExporting] = useState<boolean>(false);
  const fetchGenerationRef = useRef(0);
  const tableAbortRef = useRef<AbortController | null>(null);

  // Search & Filter Controls
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [debouncedSearch, setDebouncedSearch] = useState<string>('');
  const [selectedSection, setSelectedSection] = useState<string>('all');
  const [selectedStorage, setSelectedStorage] = useState<string>('all');
  const [selectedOfficer, setSelectedOfficer] = useState<string>('all');
  const [selectedDate, setSelectedDate] = useState<string>('');
  const [sortBy, setSortBy] = useState<
    'newest' | 'oldest' | 'file_no' | 'file_name'
  >('newest');

  // Dynamic filter options from loaded data / backend
  const [sectionsList, setSectionsList] = useState<SectionItem[]>([]);

  // Modal States
  const [viewingFile, setViewingFile] = useState<FileRecordRow | null>(null);
  const [approvingFile, setApprovingFile] = useState<FileRecordRow | null>(
    null,
  );
  const [isApproving, setIsApproving] = useState<boolean>(false);
  const [rejectingFile, setRejectingFile] = useState<FileRecordRow | null>(
    null,
  );
  const [isRejecting, setIsRejecting] = useState<boolean>(false);
  const [editingFile, setEditingFile] = useState<FileRecordRow | null>(null);
  const [isSavingEdit, setIsSavingEdit] = useState<boolean>(false);
  const [deletingFile, setDeletingFile] = useState<FileRecordRow | null>(null);
  const [isDeleting, setIsDeleting] = useState<boolean>(false);

  // Fetch sections list once via deduplicated client cache
  useEffect(() => {
    fetchClientSections()
      .then((sections) => {
        if (Array.isArray(sections)) {
          setSectionsList(sections);
        }
      })
      .catch(() => {});
  }, []);

  /** Build query-string params shared by both the regular load and the export */
  const buildFilterParams = useCallback(
    (overrideLimit?: number, overridePage?: number) => {
      const effectiveLimit = overrideLimit ?? DEFAULT_LIMIT;
      const effectivePage = overridePage ?? page;

      const params = new URLSearchParams({
        tab: activeTab,
        page: String(effectivePage),
        limit: String(effectiveLimit),
        sort: sortBy,
      });

      if (searchTerm.trim()) params.set('search', searchTerm.trim());
      if (selectedSection && selectedSection !== 'all')
        params.set('section', selectedSection);
      if (selectedStorage && selectedStorage !== 'all')
        params.set('storage', selectedStorage);
      if (selectedOfficer && selectedOfficer !== 'all')
        params.set('officer', selectedOfficer);
      if (selectedDate.trim()) params.set('date', selectedDate.trim());
      if (
        searchTerm.trim() ||
        (selectedSection && selectedSection !== 'all') ||
        (selectedStorage && selectedStorage !== 'all') ||
        (selectedOfficer && selectedOfficer !== 'all') ||
        selectedDate.trim()
      ) {
        params.set('includeMeta', 'false');
      }

      return params;
    },
    [
      activeTab,
      page,
      sortBy,
      searchTerm,
      selectedSection,
      selectedStorage,
      selectedOfficer,
      selectedDate,
    ],
  );

  // Primary data loader
  const loadFiles = useCallback(
    async (signal?: AbortSignal) => {
      setIsLoading(true);
      try {
        const params = buildFilterParams();
        const res = await fetch(`/api/admin/files?${params.toString()}`, {
          signal,
        });
        const json = await res.json().catch(() => null);

        if (res.ok && json?.ok) {
          setFiles(json.data.files || []);
          setTotal(json.data.total ?? 0);
          setTotalPages(json.data.totalPages ?? 1);
          if (json.data.counts) {
            setCounts(json.data.counts);
          }
          if (typeof json.data.auto_approval === 'boolean') {
            setAutoApproval(json.data.auto_approval);
          } else if (typeof json.data.requireApproval === 'boolean') {
            setAutoApproval(!json.data.requireApproval);
          }
        } else {
          showToast({
            type: 'error',
            title: 'Error loading files',
            message: json?.message || 'Failed to fetch files from server.',
          });
        }
      } catch (error) {
        if (error instanceof Error && error.name === 'AbortError') return;
        showToast({
          type: 'error',
          title: 'Connection Error',
          message: 'Could not connect to the server to load file records.',
        });
      } finally {
        if (!signal?.aborted) setIsLoading(false);
      }
    },
    [buildFilterParams, showToast],
  );

  const refreshFilesView = useCallback(() => {
    void loadFiles();
  }, [loadFiles]);

  // Debounce typing and cancel stale requests so old results cannot replace new ones.
  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      void loadFiles(controller.signal);
    }, 250);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
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

  // Ã¢â€â‚¬Ã¢â€â‚¬ CSV Export Handler Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
  const handleExportCsv = async () => {
    if (isExporting) return;
    setIsExporting(true);

    try {
      // Fetch all matching records for CSV export.
      const params = buildFilterParams(10000, 1);
      params.set('includeCounts', 'false');
      params.set('includeSettings', 'false');
      const res = await fetch(`/api/admin/files?${params.toString()}`);
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
        // Ã¢â€â‚¬Ã¢â€â‚¬ File Requests CSV Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
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
        // Ã¢â€â‚¬Ã¢â€â‚¬ All Files CSV Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
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

  // Ã¢â€â‚¬Ã¢â€â‚¬ Approval Setting Toggle Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
  const handleToggleApprovalSetting = async () => {
    if (isTogglingApproval) return;
    const previous = autoApproval;
    const next = !previous;

    // Optimistic UI update
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
        // Rollback
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

  // Ã¢â€â‚¬Ã¢â€â‚¬ Approve File Action Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
  const handleApproveConfirm = async () => {
    if (!approvingFile || isApproving) return;
    setIsApproving(true);

    try {
      const res = await fetch(
        `/api/admin/files/${encodeURIComponent(approvingFile.file_no)}/approve`,
        {
          method: 'POST',
        },
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

  // Ã¢â€â‚¬Ã¢â€â‚¬ Reject File Action Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
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
        showToast({
          type: 'error',
          title: 'Rejection Failed',
          message: json?.message || 'Could not reject submission.',
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

  // Ã¢â€â‚¬Ã¢â€â‚¬ Edit File Action Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
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

  // Ã¢â€â‚¬Ã¢â€â‚¬ Delete File Action Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
  const handleDeleteConfirm = async () => {
    if (!deletingFile || isDeleting) return;
    setIsDeleting(true);

    try {
      const res = await fetch(
        `/api/admin/files/${encodeURIComponent(deletingFile.file_no)}`,
        {
          method: 'DELETE',
        },
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

  // Format 4-digit count (e.g. 0142)
  const format4Digit = (n: number) => String(n).padStart(4, '0');

  const isFiltered = Boolean(
    searchTerm.trim() ||
    selectedSection !== 'all' ||
    selectedStorage !== 'all' ||
    selectedOfficer !== 'all' ||
    selectedDate
  );

  const tabDataStale = tableDataTab !== activeTab;
  const showInitialTableLoad = isTableLoading && (!hasLoadedTableOnce || tabDataStale);
  const showTableRefresh = isTableLoading && hasLoadedTableOnce && !tabDataStale;

  return (
    <div className="w-full pb-10 font-dm">
      {/* Ã¢â€â‚¬Ã¢â€â‚¬ BREADCRUMBS & TOP BAR Ã¢â€â‚¬Ã¢â€â‚¬ */}
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

      {/* Ã¢â€â‚¬Ã¢â€â‚¬ HEADING & TOP SUMMARY METRIC CARDS Ã¢â€â‚¬Ã¢â€â‚¬ */}
      <div className="mb-5 flex flex-col justify-between gap-4 lg:flex-row lg:items-center">
        <div>
          <h1 className="text-2xl font-black tracking-tight text-[#1B254B] dark:text-white sm:text-3xl">
            All Files
          </h1>
          <p className="mt-0.5 text-xs text-slate-400 dark:text-gray-400">
            All files in the Recordroom on 9 October 2026. Review incoming
            submissions and manage administrative approvals.
          </p>
        </div>

        {/* 3 Summary Cards */}
        <div className="flex flex-wrap items-center gap-3 sm:flex-nowrap">
          {/* Card 1: System Total File Count */}
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

          {/* Card 2: Today Added File Count */}
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

          {/* Card 3: All Files Added */}
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

      {/* Ã¢â€â‚¬Ã¢â€â‚¬ SEARCH & FILTER CONTROLS BAR Ã¢â€â‚¬Ã¢â€â‚¬ */}
      <div className="shadow-xs mb-4 rounded-2xl border border-slate-100 bg-white p-3 dark:border-navy-700 dark:bg-navy-800">
        <div className="flex flex-wrap items-center gap-2.5 lg:flex-nowrap">
          {/* Search input */}
          <div className="relative min-w-[240px] flex-1">
            <FiSearch className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) =>
                handleFilterChange(setSearchTerm, e.target.value)
              }
              placeholder="Search by file number, file name, or officer..."
              className="border-transparent h-9 w-full rounded-xl border bg-slate-50/70 pl-9 pr-3 text-xs text-slate-800 outline-none transition-all placeholder:text-slate-400 focus:border-[#4318FF] dark:bg-navy-900/70 dark:text-white"
            />
          </div>

          {/* Section filter */}
          <div className="relative min-w-[160px]">
            <select
              value={selectedSection}
              onChange={(e) =>
                handleFilterChange(setSelectedSection, e.target.value)
              }
              className="border-transparent h-9 w-full cursor-pointer appearance-none rounded-xl border bg-slate-50/70 px-3 pr-8 text-xs font-semibold text-slate-700 outline-none focus:border-[#4318FF] dark:bg-navy-900/70 dark:text-slate-200"
            >
              <option value="all">
                All Sections ({sectionsList.length || 12})
              </option>
              {sectionsList.map((s, idx) => (
                <option key={s.id ?? idx} value={s.name}>
                  {s.name}
                </option>
              ))}
            </select>
            <FiChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
          </div>

          {/* Storage units filter */}
          <div className="relative min-w-[150px]">
            <select
              value={selectedStorage}
              onChange={(e) =>
                handleFilterChange(setSelectedStorage, e.target.value)
              }
              className="border-transparent h-9 w-full cursor-pointer appearance-none rounded-xl border bg-slate-50/70 px-3 pr-8 text-xs font-semibold text-slate-700 outline-none focus:border-[#4318FF] dark:bg-navy-900/70 dark:text-slate-200"
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

          {/* Officers filter */}
          <div className="relative min-w-[130px]">
            <select
              value={selectedOfficer}
              onChange={(e) =>
                handleFilterChange(setSelectedOfficer, e.target.value)
              }
              className="border-transparent h-9 w-full cursor-pointer appearance-none rounded-xl border bg-slate-50/70 px-3 pr-8 text-xs font-semibold text-slate-700 outline-none focus:border-[#4318FF] dark:bg-navy-900/70 dark:text-slate-200"
            >
              <option value="all">All Officers</option>
              <option value="Elena Rostova">Elena Rostova</option>
              <option value="Marcus Grohs">Marcus Grohs</option>
              <option value="Malitha Tishamal">Malitha Tishamal</option>
              <option value="Sarah Jenkins">Sarah Jenkins</option>
              <option value="Omari Wise">Omari Wise</option>
              <option value="Amanda Ross">Amanda Ross</option>
            </select>
            <FiChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
          </div>

          {/* Date Picker Button / Input */}
          <div className="relative">
            <input
              type="date"
              value={selectedDate}
              onChange={(e) =>
                handleFilterChange(setSelectedDate, e.target.value)
              }
              className="border-transparent h-9 cursor-pointer rounded-xl border bg-slate-50/70 px-3 text-xs font-semibold text-slate-700 outline-none focus:border-[#4318FF] dark:bg-navy-900/70 dark:text-slate-200"
              title="Filter by intake date"
            />
          </div>

          {/* Reset Filters button */}
          <button
            type="button"
            onClick={handleResetFilters}
            className="flex h-9 shrink-0 cursor-pointer items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 text-xs font-bold text-slate-600 transition-colors hover:bg-slate-50 dark:border-navy-700 dark:bg-navy-900 dark:text-slate-300"
          >
            <FiRefreshCw className="h-3.5 w-3.5" />
            <span>Reset Filters</span>
          </button>

          {/* Export CSV button */}
          <button
            type="button"
            onClick={handleExportCsv}
            disabled={isExporting}
            className={`flex h-9 shrink-0 cursor-pointer items-center gap-1.5 rounded-xl px-3 text-xs font-bold transition-colors ${
              isExporting
                ? 'cursor-not-allowed bg-[#4318FF]/60 text-white'
                : 'shadow-xs bg-[#4318FF] text-white shadow-[#4318FF]/30 hover:bg-[#3311CC]'
            }`}
            title={`Export ${
              activeTab === 'requests' ? 'File Requests' : 'All Files'
            } as CSV`}
          >
            {isExporting ? (
              <span className="border-t-transparent h-3.5 w-3.5 animate-spin rounded-full border-2 border-white" />
            ) : (
              <FiDownload className="h-3.5 w-3.5" />
            )}
            <span>{isExporting ? 'ExportingÃ¢â‚¬Â¦' : 'Export CSV'}</span>
          </button>
        </div>
      </div>

      {/* Ã¢â€â‚¬Ã¢â€â‚¬ SECURE REPOSITORY BANNER Ã¢â€â‚¬Ã¢â€â‚¬ */}
      <div className="mb-4 flex items-center justify-between rounded-xl border border-slate-200/50 bg-[#F4F7FE] px-4 py-2 dark:border-navy-700 dark:bg-navy-900/80">
        <div className="flex items-center gap-2 text-xs font-semibold text-slate-600 dark:text-slate-300">
          <FiShield className="h-4 w-4 text-[#4318FF] dark:text-brand-300" />
          <span>Secure repository Ã¢â‚¬Â¢ Access managed for your administrator</span>
        </div>
        <div className="flex items-center gap-1.5 rounded-full bg-[#EBF3FE] px-2.5 py-0.5 text-[10px] font-bold text-[#4318FF] dark:bg-navy-800 dark:text-brand-300">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#4318FF] dark:bg-brand-300" />
          <span>ACTIVE</span>
        </div>
      </div>

      {/* Ã¢â€â‚¬Ã¢â€â‚¬ TABS BAR & ADMIN APPROVAL TOGGLE SWITCH Ã¢â€â‚¬Ã¢â€â‚¬ */}
      <div className="mb-4 flex flex-col justify-between gap-3 md:flex-row md:items-center">
        {/* Left: Two Mutually Exclusive Tabs */}
        <div className="flex items-center gap-2">
          {/* Tab 1: File Requests (Active by default) */}
          <button
            type="button"
            onClick={() => {
              setActiveTab('requests');
              setPage(1);
            }}
            className={`flex cursor-pointer items-center gap-2 rounded-full px-4 py-2 text-xs font-bold transition-all ${
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

          {/* Tab 2: All Files */}
          <button
            type="button"
            onClick={() => {
              setActiveTab('all');
              setPage(1);
            }}
            className={`flex cursor-pointer items-center gap-2 rounded-full px-4 py-2 text-xs font-bold transition-all ${
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

          {/* Tab 3: Rejected Files */}
          <button
            type="button"
            onClick={() => {
              setActiveTab('rejected');
              setPage(1);
            }}
            className={`flex items-center gap-2 rounded-full px-4 py-2 text-xs font-bold transition-all cursor-pointer ${
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

        {/* Right: Global Auto-Approval Setting Switch */}
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

          {/* Toggle Switch */}
          <button
            type="button"
            role="switch"
            aria-checked={autoApproval}
            disabled={isTogglingApproval}
            onClick={handleToggleApprovalSetting}
            className={`border-transparent relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 transition-colors duration-200 ease-in-out focus:outline-none ${
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

      {/* Ã¢â€â‚¬Ã¢â€â‚¬ SECTION HEADER BELOW TABS Ã¢â€â‚¬Ã¢â€â‚¬ */}
      {activeTab === 'requests' ? (
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
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
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h2 className="text-xs font-black uppercase tracking-wider text-slate-700 dark:text-slate-200">
              REJECTED FILE SUBMISSIONS
            </h2>
            <span className="rounded-full bg-rose-50 text-rose-600 border border-rose-200 dark:bg-rose-950/40 dark:text-rose-300 px-2.5 py-0.5 text-[10px] font-bold">
              {counts.rejectedCount ?? total} rejected submissions
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
      ) : (
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
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
                onChange={(e) => setSortBy(e.target.value as any)}
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

      {/* Ã¢â€â‚¬Ã¢â€â‚¬ TAB CONTENT TABLE Ã¢â€â‚¬Ã¢â€â‚¬ */}
      {activeTab === 'requests' ? (
        <FileRequestsTable
          files={files}
          loading={isLoading}
          total={total}
          page={page}
          limit={DEFAULT_LIMIT}
          totalPages={totalPages}
          isFiltered={false}
          onPageChange={(newPage) => setPage(newPage)}
          onApprove={(file) => setApprovingFile(file)}
          onReject={(file) => setRejectingFile(file)}
          onView={(file) => setViewingFile(file)}
        />
      ) : activeTab === 'rejected' ? (
        <RejectedFilesTable
          files={files}
          loading={isLoading}
          total={total}
          page={page}
          limit={DEFAULT_LIMIT}
          totalPages={totalPages}
          isFiltered={isFiltered}
          onPageChange={(newPage) => setPage(newPage)}
          onView={(file) => setViewingFile(file)}
        />
      ) : (
        <AllFilesTable
          files={files}
          total={total}
          page={page}
          limit={DEFAULT_LIMIT}
          totalPages={totalPages}
          isFiltered={false}
          loading={isLoading}
          onPageChange={(newPage) => setPage(newPage)}
          onView={(file) => setViewingFile(file)}
          onEdit={(file) => setEditingFile(file)}
          onDelete={(file) => setDeletingFile(file)}
          onApprove={(file) => setApprovingFile(file)}
          onReject={(file) => setRejectingFile(file)}
        />
      )}

      {/* Ã¢â€â‚¬Ã¢â€â‚¬ MODALS Ã¢â€â‚¬Ã¢â€â‚¬ */}
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
