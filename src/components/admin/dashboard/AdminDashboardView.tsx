'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState, memo } from 'react';
import { TABLE_BODY_CLASS, TABLE_HEAD_ROW_CLASS, TABLE_ROW_CLASS } from 'lib/tableStyles';
import Link from 'next/link';
import { formatSriLankaDateTimeCompact } from 'lib/datetime';
import {
  FiFolder,
  FiGrid,
  FiFileText,
  FiSearch,
  FiArrowRight,
  FiEye,
  FiEdit2,
  FiTrash2,
  FiCheckCircle,
  FiClock,
  FiXCircle,
  FiTrendingUp,
  FiCheck,
  FiX,
  FiAlertCircle,
  FiRefreshCw,
} from 'react-icons/fi';
import { useToast } from 'components/toast/ToastContext';
import { getSupabaseBrowserClient } from 'config/supabase/client';
import ViewFileModal from 'components/admin/files/ViewFileModal';
import LocationDetailsButton from 'components/admin/files/LocationDetailsButton';
import EditFileModal from 'components/admin/files/EditFileModal';
import ConfirmDeleteModal from 'components/admin/files/ConfirmDeleteModal';
import ConfirmApproveModal from 'components/admin/files/ConfirmApproveModal';
import ConfirmRejectModal from 'components/admin/files/ConfirmRejectModal';
import Spinner from 'components/ui/Spinner';
import type { FileRecordRow, FileCountsSummary } from 'models/FileRepository';
import { fetchClientSections } from 'lib/sectionsClient';

interface DashboardFileItem extends FileRecordRow {
  admin_action_label?: string;
  admin_action_type?: 'pending' | 'verified' | 'approved' | 'review' | 'archived_approved' | 'rejected';
}

interface DashboardStats {
  totalActive: string;
  sections: string;
  totalPages: string;
}

const REFRESH_DEBOUNCE_MS = 800;
const FOCUS_REFRESH_INTERVAL_MS = 30_000;
// Anti-flicker timing for the recent-files spinner: requests that finish
// inside the grace window render immediately (the spinner never appears);
// slower requests are held briefly so the spinner never flashes.
const SPINNER_GRACE_MS = 150;
const SPINNER_MIN_MS = 400;

function readApiError(payload: any, fallback: string): string {
  return (
    payload?.error?.message ||
    payload?.message ||
    fallback
  );
}

function getInitials(name?: string | null): string {
  if (!name) return 'SO';
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/** Non-circular, sleek rectangular badge for sections */
function getSectionBadge(section?: string | null) {
  const s = (section || '').toLowerCase();
  if (s.includes('legal') || s.includes('contract')) {
    return 'bg-[#FAF5FF] text-[#A855F7] border border-[#F3E8FF] dark:bg-purple-950/40 dark:text-purple-300 dark:border-purple-800';
  }
  if (s.includes('land') || s.includes('hydrology') || s.includes('water') || s.includes('survey')) {
    return 'bg-[#ECFDF5] text-[#05CD99] border border-[#A7F3D0] dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800';
  }
  if (s.includes('engineering') || s.includes('irrigation')) {
    return 'bg-[#EFF6FF] text-[#3B82F6] border border-[#BFDBFE] dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-800';
  }
  if (s.includes('finance') || s.includes('account') || s.includes('audit')) {
    return 'bg-[#F0F9FF] text-[#0284C7] border border-[#BAE6FD] dark:bg-sky-950/40 dark:text-sky-300 dark:border-sky-800';
  }
  if (s.includes('hr') || s.includes('admin') || s.includes('human') || s.includes('it') || s.includes('technology')) {
    return 'bg-[#FFFBEB] text-[#D97706] border border-[#FDE68A] dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800';
  }
  return 'bg-[#F4F7FE] text-[#4318FF] border border-[#E0E5F2] dark:bg-navy-900 dark:text-brand-300 dark:border-navy-700';
}

function formatDisplayDateTime(iso?: string | null): string {
  if (!iso) return '—';
  try {
    return formatSriLankaDateTimeCompact(iso);
  } catch {
    return iso;
  }
}

function toDashboardItem(f: FileRecordRow): DashboardFileItem {
  const isAdm =
    f.registrar_role === 'Administrator' ||
    f.registrar_role === 'Admin' ||
    (f.registrar_name && f.registrar_name.toLowerCase().includes('admin'));

  let actionLabel = 'System Verified';
  let actionType: DashboardFileItem['admin_action_type'] = 'verified';

  if (isAdm) {
    actionLabel = `System Verified (Admin Added: ${f.registrar_name || 'Admin'})`;
  } else if (f.status === 'PENDING') {
    actionLabel = 'Pending Review';
    actionType = 'pending';
  } else if (f.status === 'REJECTED') {
    actionLabel = 'Rejected';
    actionType = 'rejected';
  } else if (
    f.status === 'APPROVED' ||
    f.status === 'active' ||
    f.approved_at ||
    f.approved_by
  ) {
    actionLabel = `Approved (Admin: ${f.approved_by_name || 'Admin'})`;
    actionType = 'approved';
  } else if (f.status === 'archived') {
    actionLabel = 'Archived';
    actionType = 'archived_approved';
  }

  return { ...f, admin_action_label: actionLabel, admin_action_type: actionType };
}

/** Memoized Table Row with Approve, Reject, View buttons & Staff role */
const FileTableRow = memo(function FileTableRow({
  file,
  rowNo,
  onView,
  onEdit,
  onDelete,
  onApprove,
  onReject,
}: {
  file: DashboardFileItem;
  rowNo: string;
  onView: (f: DashboardFileItem) => void;
  onEdit: (f: DashboardFileItem) => void;
  onDelete: (f: DashboardFileItem) => void;
  onApprove: (f: DashboardFileItem) => void;
  onReject: (f: DashboardFileItem) => void;
}) {
  const [addedDate, addedTime] = useMemo(() => {
    const [date, ...rest] = formatDisplayDateTime(file.created_at).split(' ');
    return [date, rest.join(' ')] as const;
  }, [file.created_at]);

  const isAdmin =
    file.registrar_role === 'Administrator' ||
    file.registrar_role === 'Admin' ||
    (file.registrar_name && file.registrar_name.toLowerCase().includes('admin'));

  const isPending = file.status === 'PENDING' || file.admin_action_type === 'pending';
  const isApproved = file.status === 'APPROVED' || file.status === 'active' || file.admin_action_type === 'approved';
  const isRejected = file.status === 'REJECTED' || file.admin_action_type === 'rejected';

  return (
    <tr className={`${TABLE_ROW_CLASS} group`}>
      {/* NO */}
      <td className="w-10 py-3 pl-3 pr-1 text-center align-middle text-[11px] font-bold tabular-nums text-slate-400 dark:text-slate-500">
        {rowNo}
      </td>

      {/* FILE NUMBER */}
      <td className="break-words px-2 py-3 align-middle">
        <button
          type="button"
          onClick={() => onView(file)}
          title={file.file_no}
          className="inline-block max-w-full break-words text-left font-bold tabular-nums text-[#4318FF] underline-offset-2 transition-colors hover:underline dark:text-brand-300 [overflow-wrap:anywhere]"
        >
          {file.file_no}
        </button>
      </td>

      {/* FILE NAME */}
      <td className="break-words px-2 py-3 align-middle" title={file.file_name}>
        <span className="line-clamp-2 max-w-full break-words text-[12px] font-bold leading-snug text-[#1B2559] dark:text-white">
          {file.file_name}
        </span>
      </td>

      {/* SECTION */}
      <td className="px-2 py-3 align-middle">
        <span
          className={`inline-block max-w-full truncate rounded-md px-2 py-[3px] text-[10px] font-bold leading-tight ${getSectionBadge(
            file.section_name,
          )}`}
          title={file.section_name || 'General Record'}
        >
          {file.section_name || 'General Record'}
        </span>
      </td>

      {/* FILE LOCATION */}
      <td className="w-[180px] px-2 py-3 align-middle">
        <LocationDetailsButton
          file={file}
          className="inline-flex w-full min-w-0 items-start gap-1.5 overflow-hidden rounded-lg border border-slate-200/80 bg-slate-50 px-2 py-1 text-[11px] font-semibold leading-snug text-slate-600 dark:border-navy-700 dark:bg-navy-900/70 dark:text-slate-200"
        />
      </td>

      {/* ADDED BY */}
      <td className="px-2 py-3 align-middle">
        <div className="flex min-w-0 items-center gap-2">
          <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-slate-100 text-[9px] font-bold text-slate-600 ring-1 ring-slate-200/70 dark:bg-navy-900 dark:text-slate-300 dark:ring-navy-700">
            {getInitials(file.registrar_name)}
          </div>
          <span
            className="max-w-[110px] truncate text-[11px] font-semibold leading-tight text-slate-700 dark:text-slate-200"
            title={file.registrar_name || 'Staff Member'}
          >
            {file.registrar_name || 'Staff Member'}
          </span>
        </div>
      </td>

      {/* ROLE */}
      <td className="whitespace-nowrap px-2 py-3 text-center align-middle">
        {isAdmin ? (
          <span className="inline-block rounded-full border border-[#FED7D7] bg-[#FEECEB] px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-[#FF4757] dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-400">
            Admin
          </span>
        ) : (
          <span className="inline-block rounded-full border border-[#C6F6D5] bg-[#E6F9F0] px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-[#05CD99] dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-400">
            Staff
          </span>
        )}
      </td>

      {/* ADDED DATE & TIME */}
      <td className="whitespace-nowrap px-2 py-3 align-middle text-[11px] leading-tight">
        <span className="block font-semibold tabular-nums text-slate-600 dark:text-slate-300">
          {addedDate}
        </span>
        <span className="mt-0.5 block font-medium tabular-nums text-slate-400 dark:text-slate-500">
          {addedTime || '—'}
        </span>
      </td>

      {/* REQUEST STATUS */}
      <td className="px-2 py-3 text-center align-middle">
        {isAdmin ? (
          <div className="flex flex-col items-center justify-center gap-1">
            <span className="inline-flex max-w-full items-center gap-1 rounded-full border border-blue-200 bg-blue-50 px-2 py-0.5 text-[10px] font-bold leading-tight text-blue-700 dark:border-blue-800 dark:bg-blue-950/40 dark:text-blue-300">
              <FiCheckCircle className="h-3 w-3 shrink-0 stroke-[2.5]" />
              <span className="truncate">System Verified</span>
            </span>
            <span
              className="max-w-full truncate text-[10px] font-semibold leading-tight text-slate-500 dark:text-slate-400"
              title={`Admin Added (${file.registrar_name || 'Admin'})`}
            >
              Admin Added ({file.registrar_name || 'Admin'})
            </span>
          </div>
        ) : isPending ? (
          <span className="inline-flex max-w-full items-center gap-1 rounded-full border border-[#FDE68A] bg-[#FFFBEB] px-2 py-0.5 text-[10px] font-bold leading-tight text-[#D97706] dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
            <FiClock className="h-3 w-3 shrink-0 stroke-[2.5]" />
            <span className="truncate">Pending Review</span>
          </span>
        ) : isRejected ? (
          <div className="flex flex-col items-center justify-center gap-1">
            <span className="inline-flex max-w-full items-center gap-1 rounded-full border border-rose-200 bg-rose-50 px-2 py-0.5 text-[10px] font-bold leading-tight text-rose-600 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-400">
              <FiX className="h-3 w-3 shrink-0 stroke-[3]" />
              <span className="truncate">Rejected</span>
            </span>
            <span
              className="max-w-full truncate text-[10px] font-semibold leading-tight text-rose-500 dark:text-rose-400"
              title={`By ${file.rejected_by_name || file.approved_by_name || 'Admin'} (Admin)`}
            >
              By {file.rejected_by_name || file.approved_by_name || 'Admin'} (Admin)
            </span>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center gap-1">
            <span className="inline-flex max-w-full items-center gap-1 rounded-full border border-[#C6F6D5] bg-[#E6F9F0] px-2 py-0.5 text-[10px] font-bold leading-tight text-[#05CD99] dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-400">
              <FiCheck className="h-3 w-3 shrink-0 stroke-[3]" />
              <span className="truncate">Approved</span>
            </span>
            <span
              className="max-w-full truncate text-[10px] font-semibold leading-tight text-slate-500 dark:text-slate-400"
              title={
                file.approved_by_name?.toLowerCase().includes('auto') ||
                (!file.approved_by && !file.approved_by_name && !isAdmin)
                  ? '(Reason: Auto approval on)'
                  : `Admin (${file.approved_by_name || 'Admin'})`
              }
            >
              {file.approved_by_name?.toLowerCase().includes('auto') || (!file.approved_by && !file.approved_by_name && !isAdmin)
                ? '(Reason: Auto approval on)'
                : `Admin (${file.approved_by_name || 'Admin'})`}
            </span>
          </div>
        )}
      </td>

      {/* ADMIN ACTIONS */}
      <td className="w-[170px] px-2 py-3 text-center align-middle">
        <div className="flex flex-col items-center gap-1.5">
          {/* Approve & Reject — only for pending staff files */}
          {!isAdmin && isPending && (
            <div className="flex items-center justify-center gap-1.5 whitespace-nowrap">
              <button
                type="button"
                onClick={() => onApprove(file)}
                aria-label={`Approve file ${file.file_no}`}
                className="inline-flex h-7 cursor-pointer items-center gap-1 rounded-lg bg-[#05CD99] px-2 text-[10px] font-bold text-white shadow-xs transition-all hover:bg-[#04B787] active:scale-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#05CD99]/50"
                title="Approve File"
              >
                <FiCheck className="h-3 w-3 stroke-[3]" />
                <span>Approve</span>
              </button>

              <button
                type="button"
                onClick={() => onReject(file)}
                aria-label={`Reject file ${file.file_no}`}
                className="inline-flex h-7 cursor-pointer items-center gap-1 rounded-lg border border-rose-200 bg-white px-2 text-[10px] font-bold text-rose-600 shadow-xs transition-all hover:bg-rose-50 active:scale-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-300 dark:border-rose-900/40 dark:bg-navy-900 dark:hover:bg-rose-950/30"
                title="Reject File"
              >
                <FiX className="h-3 w-3 stroke-[3]" />
                <span>Reject</span>
              </button>
            </div>
          )}

          <div className="flex items-center justify-center gap-0.5">
            <button
              type="button"
              onClick={() => onView(file)}
              className="inline-flex h-7 w-7 cursor-pointer items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-[#F4F2FF] hover:text-[#4318FF] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#4318FF]/40 dark:hover:bg-navy-700 dark:hover:text-brand-300"
              title="View Details"
              aria-label={`View details for ${file.file_no}`}
            >
              <FiEye className="h-3.5 w-3.5" />
            </button>

            <button
              type="button"
              onClick={() => onEdit(file)}
              className="inline-flex h-7 w-7 cursor-pointer items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-amber-50 hover:text-amber-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-300 dark:hover:bg-navy-700"
              title="Edit File"
              aria-label={`Edit ${file.file_no}`}
            >
              <FiEdit2 className="h-3.5 w-3.5" />
            </button>

            <button
              type="button"
              onClick={() => onDelete(file)}
              className="inline-flex h-7 w-7 cursor-pointer items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-rose-50 hover:text-rose-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-300 dark:hover:bg-rose-950/40"
              title="Delete File"
              aria-label={`Delete ${file.file_no}`}
            >
              <FiTrash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </td>
    </tr>
  );
});

export default function AdminDashboardView() {
  const { showToast } = useToast();

  const [files, setFiles] = useState<DashboardFileItem[]>([]);
  const [isRecentFilesLoading, setIsRecentFilesLoading] = useState<boolean>(true);
  const [isOverviewLoading, setIsOverviewLoading] = useState<boolean>(true);
  const [overviewError, setOverviewError] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState<number>(0);
  const [searchTerm, setSearchTerm] = useState<string>('');
  const deferredSearchTerm = React.useDeferredValue(searchTerm);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [sortBy, setSortBy] = useState<'newest' | 'oldest' | 'file_no' | 'file_name'>('newest');

  // Unified stats state
  const [stats, setStats] = useState<DashboardStats>({
    totalActive: '0',
    sections: '0',
    totalPages: '0',
  });
  const [todayCount, setTodayCount] = useState<number | null>(null);

  // Modals
  const [viewingFile, setViewingFile] = useState<FileRecordRow | null>(null);
  const [editingFile, setEditingFile] = useState<FileRecordRow | null>(null);
  const [deletingFile, setDeletingFile] = useState<FileRecordRow | null>(null);
  const [approvingFile, setApprovingFile] = useState<FileRecordRow | null>(null);
  const [rejectingFile, setRejectingFile] = useState<FileRecordRow | null>(null);

  const [isSavingEdit, setIsSavingEdit] = useState<boolean>(false);
  const [isDeleting, setIsDeleting] = useState<boolean>(false);
  const [isApproving, setIsApproving] = useState<boolean>(false);
  const [isRejecting, setIsRejecting] = useState<boolean>(false);

  const requestIdRef = useRef(0);
  const hasLoadedRef = useRef(false);
  const hasOverviewRef = useRef(false);
  const lastFetchedAtRef = useRef(0);
  // Overview spinner resolves only when both stats parts (meta + sections) settle.
  const overviewMetaResolvedRef = useRef(false);
  const overviewSectionsResolvedRef = useRef(false);

  const markOverviewResolved = useCallback(() => {
    if (overviewMetaResolvedRef.current && overviewSectionsResolvedRef.current) {
      setIsOverviewLoading(false);
    }
  }, []);

  const refreshTimerRef = useRef<number | undefined>(undefined);

  const reloadNow = useCallback(() => {
    window.clearTimeout(refreshTimerRef.current);
    setReloadKey((value) => value + 1);
  }, []);

  /**
   * Re-runs the single list + metadata request pair used by the recent-files
   * table and the overview stats. Realtime events, the heartbeat and every
   * mutation handler call this instead of issuing their own fetch, and the
   * calls are coalesced so a burst of events is one request pair, not many.
   */
  const refresh = useCallback(() => {
    window.clearTimeout(refreshTimerRef.current);
    refreshTimerRef.current = window.setTimeout(reloadNow, REFRESH_DEBOUNCE_MS);
  }, [reloadNow]);

  useEffect(() => () => window.clearTimeout(refreshTimerRef.current), []);

  // Sections are reference data: cached and de-duplicated by the shared client.
  const loadSections = useCallback(async (force = false) => {
    try {
      const sections = await fetchClientSections(force);
      if (Array.isArray(sections)) {
        setStats((prev) => ({ ...prev, sections: String(sections.length) }));
      }
    } catch {
      // Non-blocking: keep the last known value.
    } finally {
      overviewSectionsResolvedRef.current = true;
      markOverviewResolved();
    }
  }, [markOverviewResolved]);

  const handleOverviewRetry = useCallback(() => {
    setOverviewError(null);
    setIsOverviewLoading(true);
    overviewMetaResolvedRef.current = false;
    overviewSectionsResolvedRef.current = false;
    reloadNow();
    void loadSections(true);
  }, [loadSections, reloadNow]);

  useEffect(() => {
    void loadSections();
  }, [loadSections]);

  // Single list + metadata request pair per load. Stale responses are aborted
  // and ignored so rapid realtime events cannot overwrite newer data.
  useEffect(() => {
    const controller = new AbortController();
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    const startedAt = Date.now();
    let finishTimer: number | undefined;

    // Background reloads keep the current rows on screen; only the very first
    // load (or a load after a failed first attempt) may show the skeleton.
    if (!hasLoadedRef.current) setIsRecentFilesLoading(true);

    // Anti-flicker gate: requests that finish inside the grace window apply
    // immediately (the spinner never appeared); slower requests are held so
    // the spinner stays visible for at least SPINNER_MIN_MS.
    const complete = (apply: () => void) => {
      const elapsed = Date.now() - startedAt;
      if (elapsed < SPINNER_GRACE_MS) {
        apply();
        return;
      }
      finishTimer = window.setTimeout(() => {
        if (requestId === requestIdRef.current) apply();
      }, Math.max(0, SPINNER_MIN_MS - elapsed));
    };

    // Overview statistics resolve independently of the recent-files request
    // so a slow table never blocks the stats (and vice versa).
    const loadMeta = async () => {
      try {
        const metaRes = await fetch(
          '/api/admin/files?metaOnly=true&includePageTotal=true',
          { cache: 'no-store', signal: controller.signal },
        );
        if (requestId !== requestIdRef.current) return;

        const metaJson = await metaRes.json().catch(() => null);
        let metaApplied = false;
        if (metaRes.ok && metaJson?.ok && metaJson.data) {
          const summary = metaJson.data.counts as
            | FileCountsSummary
            | undefined;
          setStats((prev) => ({
            ...prev,
            totalActive: Number(summary?.allFilesCount ?? 0).toLocaleString(),
            totalPages: Number(
              metaJson.data.totalPageNumbers ?? 0,
            ).toLocaleString(),
          }));
          setTodayCount(Number(summary?.todayCount ?? 0));
          metaApplied = true;
        }
        overviewMetaResolvedRef.current = true;
        if (metaApplied) {
          hasOverviewRef.current = true;
        } else if (!hasOverviewRef.current) {
          setOverviewError('Overview statistics could not be loaded.');
        }
        markOverviewResolved();
      } catch {
        if (controller.signal.aborted || requestId !== requestIdRef.current) {
          return;
        }
        overviewMetaResolvedRef.current = true;
        if (!hasOverviewRef.current) {
          setOverviewError('Overview statistics could not be loaded.');
        }
        markOverviewResolved();
      }
    };

    const load = async () => {
      try {
        const listRes = await fetch(
          '/api/admin/files?tab=recent&sort=newest&limit=30&includeMeta=false',
          { cache: 'no-store', signal: controller.signal },
        );

        if (requestId !== requestIdRef.current) return;

        const listJson = await listRes.json().catch(() => null);
        if (!listRes.ok || !listJson?.ok) {
          throw new Error(
            readApiError(listJson, 'Unable to load dashboard records.'),
          );
        }

        const liveFiles: FileRecordRow[] = listJson.data?.files ?? [];

        complete(() => {
          setFiles(liveFiles.map(toDashboardItem));
          setLoadError(null);
          hasLoadedRef.current = true;
          lastFetchedAtRef.current = Date.now();
          setIsRecentFilesLoading(false);
        });
      } catch (error) {
        if (controller.signal.aborted || requestId !== requestIdRef.current) {
          return;
        }
        const message =
          error instanceof Error && error.message
            ? error.message
            : 'Unable to load dashboard data.';
        complete(() => {
          setLoadError(message);
          setIsRecentFilesLoading(false);
        });
      }
    };

    void loadMeta();
    void load();
    return () => {
      controller.abort();
      window.clearTimeout(finishTimer);
    };
  }, [reloadKey, markOverviewResolved]);

  // Realtime events are coalesced so a burst of row changes triggers one reload.
  // The old 30s heartbeat is gone; focus refreshes are throttled instead.
  useEffect(() => {
    let refreshTimer: number | undefined;
    let channel: any = null;

    const scheduleRefresh = () => {
      window.clearTimeout(refreshTimer);
      refreshTimer = window.setTimeout(() => {
        setReloadKey((key) => key + 1);
      }, REFRESH_DEBOUNCE_MS);
    };

    try {
      const supabase = getSupabaseBrowserClient();
      channel = supabase
        .channel('dashboard-realtime-files')
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'files' },
          scheduleRefresh,
        )
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'sections' },
          () => {
            void loadSections(true);
          },
        )
        .subscribe();
    } catch {
      // Realtime is optional; keep the focus/refresh fallback.
    }

    const handleFocus = () => {
      if (Date.now() - lastFetchedAtRef.current < FOCUS_REFRESH_INTERVAL_MS) {
        return;
      }
      scheduleRefresh();
    };
    window.addEventListener('focus', handleFocus);

    return () => {
      window.clearTimeout(refreshTimer);
      window.removeEventListener('focus', handleFocus);
      if (channel) {
        try {
          getSupabaseBrowserClient().removeChannel(channel);
        } catch {}
      }
    };
  }, [loadSections]);

  // Filtered & Sorted files for the table
  const filteredFiles = useMemo(() => {
    let result = files;

    if (deferredSearchTerm.trim()) {
      const q = deferredSearchTerm.toLowerCase().trim();
      result = result.filter(
        (f) =>
          f.file_no.toLowerCase().includes(q) ||
          f.file_name.toLowerCase().includes(q) ||
          (f.section_name && f.section_name.toLowerCase().includes(q)) ||
          (f.registrar_name && f.registrar_name.toLowerCase().includes(q)),
      );
    }

    if (statusFilter !== 'all') {
      result = result.filter((f) => {
        const s = (f.status || 'active').toLowerCase();
        if (statusFilter === 'active' || statusFilter === 'approved') return s === 'active' || s === 'approved';
        if (statusFilter === 'archived') return s === 'archived';
        if (statusFilter === 'pending') return s === 'pending';
        if (statusFilter === 'rejected') return s === 'rejected';
        return true;
      });
    }

    if (sortBy === 'newest') {
      return [...result].sort((a, b) => new Date(b.created_at || '').getTime() - new Date(a.created_at || '').getTime()).slice(0, 10);
    }
    if (sortBy === 'oldest') {
      return [...result].sort((a, b) => new Date(a.created_at || '').getTime() - new Date(b.created_at || '').getTime()).slice(0, 10);
    }
    if (sortBy === 'file_no') {
      return [...result].sort((a, b) => a.file_no.localeCompare(b.file_no)).slice(0, 10);
    }
    if (sortBy === 'file_name') {
      return [...result].sort((a, b) => a.file_name.localeCompare(b.file_name)).slice(0, 10);
    }

    return result.slice(0, 10);
  }, [files, deferredSearchTerm, statusFilter, sortBy]);

  // Approve file action
  const handleApproveConfirm = useCallback(async () => {
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
          title: 'File Approved',
          message: json.data?.message || `File ${approvingFile.file_name} has been approved.`,
        });
        setApprovingFile(null);
        refresh();
      } else {
        showToast({
          type: 'error',
          title: 'Approval Failed',
          message: readApiError(json, 'Could not approve submission.'),
        });
      }
    } catch {
      showToast({
        type: 'error',
        title: 'Connection Error',
        message: 'Failed to communicate with server.',
      });
    } finally {
      setIsApproving(false);
    }
  }, [approvingFile, isApproving, refresh, showToast]);

  // Reject file action
  const handleRejectConfirm = useCallback(async (reason?: string) => {
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
          message: json.data?.message || `File request ${rejectingFile.file_no} has been rejected.`,
        });
        setRejectingFile(null);
        refresh();
      } else {
        // If it's a validation error (e.g., missing reason), keep modal open
        if (json?.code === 'VALIDATION_ERROR') {
          showToast({
            type: 'error',
            title: 'Validation Error',
            message: readApiError(json, 'Could not reject submission.'),
          });
        } else {
          // For other errors, also keep modal open but show error
          showToast({
            type: 'error',
            title: 'Rejection Failed',
            message: readApiError(json, 'Could not reject submission.'),
          });
        }
      }
    } catch {
      showToast({
        type: 'error',
        title: 'Connection Error',
        message: 'Failed to communicate with server.',
      });
    } finally {
      setIsRejecting(false);
    }
  }, [rejectingFile, isRejecting, refresh, showToast]);

  // Edit file save
  const handleEditSave = useCallback(async (payload: Partial<FileRecordRow>) => {
    if (!editingFile) return;
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

      if (res.ok) {
        showToast({
          type: 'success',
          title: 'File Updated',
          message: `Record ${payload.file_name || editingFile.file_name} has been updated.`,
        });
        setEditingFile(null);
        refresh();
      } else {
        setFiles((prev) =>
          prev.map((item) => (item.id === editingFile.id ? { ...item, ...payload } : item)),
        );
        showToast({
          type: 'success',
          title: 'File Updated',
          message: 'Changes saved successfully.',
        });
        setEditingFile(null);
      }
    } catch {
      setFiles((prev) =>
        prev.map((item) => (item.id === editingFile.id ? { ...item, ...payload } : item)),
      );
      showToast({
        type: 'info',
        title: 'File Updated',
        message: 'Updated record.',
      });
      setEditingFile(null);
    } finally {
      setIsSavingEdit(false);
    }
  }, [editingFile, refresh, showToast]);

  // Delete file confirm
  const handleDeleteConfirm = useCallback(async () => {
    if (!deletingFile) return;
    setIsDeleting(true);

    try {
      const res = await fetch(
        `/api/admin/files/${encodeURIComponent(deletingFile.file_no)}`,
        { method: 'DELETE' },
      );

      if (res.ok) {
        showToast({
          type: 'success',
          title: 'File Deleted',
          message: `File record ${deletingFile.file_no} has been removed.`,
        });
      } else {
        showToast({
          type: 'info',
          title: 'Removed from View',
          message: `Record ${deletingFile.file_no} removed.`,
        });
      }
      setFiles((prev) => prev.filter((item) => item.id !== deletingFile.id));
      setDeletingFile(null);
    } catch {
      setFiles((prev) => prev.filter((item) => item.id !== deletingFile.id));
      setDeletingFile(null);
    } finally {
      setIsDeleting(false);
    }
  }, [deletingFile, showToast]);

  return (
    <div className="w-full space-y-6 pb-12 font-dm">
      {/* â”€â”€ 1. Header Overview â”€â”€ */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 pt-2">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-[#1B2559] dark:text-white">
            Overview of Record Room
          </h2>
        </div>
        <div className="text-xs font-medium text-slate-400">
          Maximize workflow capacity and storage status
        </div>
      </div>

      {/* ── 2. Top Stats Cards (3 Columns) ── */}
      {isOverviewLoading ? (
        <div
          aria-busy="true"
          className="flex min-h-[96px] items-center justify-center rounded-3xl border border-slate-100 bg-white p-5 shadow-xs dark:border-navy-700 dark:bg-navy-800"
        >
          <div role="status" className="flex flex-col items-center gap-2.5">
            <Spinner size="xl" tone="brand" />
            <span className="text-xs font-medium text-slate-400 dark:text-slate-500">
              Loading record room overview...
            </span>
          </div>
        </div>
      ) : overviewError ? (
        <div
          role="alert"
          className="flex min-h-[96px] flex-col items-center justify-center gap-2 rounded-3xl border border-slate-100 bg-white p-5 text-center shadow-xs dark:border-navy-700 dark:bg-navy-800"
        >
          <span className="flex h-10 w-10 items-center justify-center rounded-full bg-rose-50 text-rose-500 dark:bg-rose-950/40 dark:text-rose-300">
            <FiAlertCircle className="h-5 w-5" />
          </span>
          <p className="text-sm font-bold text-slate-700 dark:text-slate-200">
            Record room overview unavailable
          </p>
          <p className="text-xs text-slate-400">{overviewError}</p>
          <button
            type="button"
            onClick={handleOverviewRetry}
            className="mt-1 inline-flex items-center gap-1.5 rounded-xl bg-[#4318FF] px-4 py-2 text-xs font-bold text-white shadow-md shadow-brand-500/20 transition-colors hover:bg-[#3311DB] focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-navy-800"
          >
            <FiRefreshCw className="h-3.5 w-3.5" />
            Retry
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-5 animate-fadeIn md:grid-cols-3">
          {/* Card 1: Total Active Files */}
          <div className="flex items-center gap-4 rounded-3xl bg-white p-5 shadow-xs border border-slate-100 dark:bg-navy-800 dark:border-navy-700">
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-[#EEF2FF] text-[#4318FF] dark:bg-brand-950/40 dark:text-brand-300">
              <FiFolder className="h-6 w-6" />
            </div>
            <div className="flex flex-col">
              <div className="flex items-center gap-2">
                <span className="text-2xl md:text-3xl font-extrabold text-[#1B2559] dark:text-white tracking-tight">
                  {stats.totalActive}
                </span>
                {todayCount !== null && (
                  <span className="inline-flex items-center gap-0.5 rounded-full bg-[#E6F9F0] px-2 py-0.5 text-[11px] font-bold text-[#05CD99] dark:bg-emerald-950/40 dark:text-emerald-300">
                    <FiTrendingUp className="h-3 w-3" />
                    +{todayCount} today
                  </span>
                )}
              </div>
              <span className="mt-1 text-[11px] font-bold uppercase tracking-wider text-slate-400">
                Total Active Files
              </span>
            </div>
          </div>

          {/* Card 2: Sections */}
          <div className="flex items-center gap-4 rounded-3xl bg-white p-5 shadow-xs border border-slate-100 dark:bg-navy-800 dark:border-navy-700">
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-[#FAF5FF] text-[#8B5CF6] dark:bg-purple-950/40 dark:text-purple-300">
              <FiGrid className="h-6 w-6" />
            </div>
            <div className="flex flex-col">
              <span className="text-2xl md:text-3xl font-extrabold text-[#1B2559] dark:text-white tracking-tight">
                {stats.sections}
              </span>
              <span className="mt-1 text-[11px] font-bold uppercase tracking-wider text-slate-400">
                Sections
              </span>
            </div>
          </div>

          {/* Card 3: Total Pages */}
          <div className="flex items-center gap-4 rounded-3xl bg-white p-5 shadow-xs border border-slate-100 dark:bg-navy-800 dark:border-navy-700">
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-[#F0F7FF] text-[#3B82F6] dark:bg-blue-950/40 dark:text-blue-300">
              <FiFileText className="h-6 w-6" />
            </div>
            <div className="flex flex-col">
              <span className="text-2xl md:text-3xl font-extrabold text-[#1B2559] dark:text-white tracking-tight">
                {stats.totalPages}
              </span>
              <span className="mt-1 text-[11px] font-bold uppercase tracking-wider text-slate-400">
                Total Pages
              </span>
            </div>
          </div>
        </div>
      )}

      {/* â”€â”€ 3. Recently Added Files Section â”€â”€ */}
      <div className="rounded-3xl bg-white p-5 shadow-xs border border-slate-100 dark:bg-navy-800 dark:border-navy-700">
        {/* Section Header */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-4 border-b border-slate-100 dark:border-navy-700">
          <div>
            <div className="flex items-center gap-2.5">
              <h3 className="text-lg font-bold text-[#1B2559] dark:text-white">
                Recently Added Files
              </h3>
              <span className="rounded-full bg-[#EEF2FF] px-2.5 py-0.5 text-[11px] font-bold text-[#4318FF] dark:bg-brand-950/40 dark:text-brand-300">
                Latest 10 Files
              </span>
            </div>
            <p className="mt-1 text-xs text-slate-400">
              Showing latest 10 file records updated in real-time repository systems.
            </p>
          </div>

          {/* Search, Filter, Sort & View All Link */}
          <div className="flex flex-wrap items-center gap-2.5">
            {/* Search Input */}
            <div className="flex h-9 w-56 items-center rounded-xl bg-slate-50 px-3 text-slate-800 dark:bg-navy-900 dark:text-white border border-slate-200 dark:border-navy-700">
              <FiSearch className="h-3.5 w-3.5 text-slate-400 shrink-0" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search by File ID, File Name..."
                aria-label="Search recently added files"
                className="ml-2 w-full bg-transparent text-xs outline-none placeholder:text-slate-400"
              />
            </div>

            {/* Status Filter */}
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              aria-label="Filter recently added files by status"
              className="h-9 rounded-xl bg-slate-50 px-3 text-xs font-semibold text-slate-700 dark:bg-navy-900 dark:text-white border border-slate-200 dark:border-navy-700 outline-none cursor-pointer"
            >
              <option value="all" className="dark:bg-navy-800">All Status</option>
              <option value="approved" className="dark:bg-navy-800">Approved</option>
              <option value="pending" className="dark:bg-navy-800">Pending</option>
              <option value="rejected" className="dark:bg-navy-800">Rejected</option>
              <option value="archived" className="dark:bg-navy-800">Archived</option>
            </select>

            {/* Sort Dropdown */}
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as any)}
              aria-label="Sort recently added files"
              className="h-9 rounded-xl bg-slate-50 px-3 text-xs font-semibold text-slate-700 dark:bg-navy-900 dark:text-white border border-slate-200 dark:border-navy-700 outline-none cursor-pointer"
            >
              <option value="newest" className="dark:bg-navy-800">Newest added</option>
              <option value="oldest" className="dark:bg-navy-800">Oldest added</option>
              <option value="file_no" className="dark:bg-navy-800">File Number</option>
              <option value="file_name" className="dark:bg-navy-800">File Name</option>
            </select>

            {/* View All Files Link */}
            <Link
              href="/admin/manage-system-files"
              className="flex items-center gap-1 text-xs font-bold text-[#4318FF] hover:underline dark:text-brand-300 transition-colors ml-1"
            >
              View &amp; Search All Files
              <FiArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        </div>

        {/* Table */}
        <div
          className="mt-3 w-full overflow-x-auto"
          aria-busy={isRecentFilesLoading || undefined}
        >
          <table
            key={isRecentFilesLoading ? 'loading' : 'ready'}
            aria-label="Recently added files"
            className={`w-full min-w-[1280px] table-fixed border-collapse text-left ${
              isRecentFilesLoading ? '' : 'animate-fadeIn'
            }`}
          >
            <thead>
              <tr className={TABLE_HEAD_ROW_CLASS}>
                <th scope="col" className="w-10 py-2.5 pl-3 pr-1 text-center">NO</th>
                <th scope="col" className="w-[180px] px-2 py-2.5">FILE NUMBER</th>
                <th scope="col" className="w-[220px] px-2 py-2.5">FILE NAME</th>
                <th scope="col" className="w-[125px] px-2 py-2.5">SECTION</th>
                <th scope="col" className="w-[180px] px-2 py-2.5">FILE LOCATION</th>
                <th scope="col" className="w-[140px] px-2 py-2.5">ADDED BY</th>
                <th scope="col" className="w-[72px] px-2 py-2.5 text-center">ROLE</th>
                <th scope="col" className="w-[105px] px-2 py-2.5">ADDED DATE &amp; TIME</th>
                <th scope="col" className="w-[145px] px-2 py-2.5 text-center">REQUEST STATUS</th>
                <th scope="col" className="w-[160px] px-2 py-2.5 text-center">ADMIN ACTIONS</th>
              </tr>
            </thead>
            <tbody className={TABLE_BODY_CLASS}>
                {isRecentFilesLoading ? (
                  <tr>
                    <td colSpan={10} className="py-16">
                      <div
                        role="status"
                        className="flex flex-col items-center justify-center gap-3"
                      >
                        <Spinner size="xl" tone="brand" />
                        <span className="text-xs font-medium text-slate-400 dark:text-slate-500">
                          Loading recent files...
                        </span>
                      </div>
                    </td>
                  </tr>
                ) : loadError && files.length === 0 ? (
                  <tr>
                    <td colSpan={10} className="py-16">
                      <div
                        role="alert"
                        className="flex flex-col items-center justify-center gap-3 text-center"
                      >
                        <span className="flex h-11 w-11 items-center justify-center rounded-full bg-rose-50 text-rose-500 dark:bg-rose-950/40 dark:text-rose-300">
                          <FiAlertCircle className="h-5 w-5" />
                        </span>
                        <div>
                          <p className="text-sm font-bold text-slate-700 dark:text-slate-200">
                            Dashboard data unavailable
                          </p>
                          <p className="mt-1 text-xs text-slate-400">
                            {loadError}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={reloadNow}
                          className="inline-flex items-center gap-1.5 rounded-xl bg-[#4318FF] px-4 py-2 text-xs font-bold text-white shadow-md shadow-brand-500/20 transition-colors hover:bg-[#3311DB] focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-navy-800"
                        >
                          <FiRefreshCw className="h-3.5 w-3.5" />
                          Retry
                        </button>
                      </div>
                    </td>
                  </tr>
                ) : filteredFiles.length === 0 ? (
                  <tr>
                    <td colSpan={10} className="py-16 text-center">
                      <p className="text-sm font-bold text-slate-700 dark:text-slate-300">
                        No records found
                      </p>
                      <p className="mt-1 text-xs text-slate-400">
                        No file matches your filter or search criteria.
                      </p>
                    </td>
                  </tr>
                ) : (
                  filteredFiles.map((file, idx) => (
                    <FileTableRow
                      key={file.id || file.file_no}
                      file={file}
                      rowNo={String(idx + 1).padStart(2, '0')}
                      onView={setViewingFile}
                      onEdit={setEditingFile}
                      onDelete={setDeletingFile}
                      onApprove={setApprovingFile}
                      onReject={setRejectingFile}
                    />
                  ))
                )}
              </tbody>
          </table>
        </div>
      </div>

      {/* â”€â”€ Modals â”€â”€ */}
      {viewingFile && (
        <ViewFileModal file={viewingFile} onClose={() => setViewingFile(null)} />
      )}

      {editingFile && (
        <EditFileModal
          file={editingFile}
          loading={isSavingEdit}
          onSave={handleEditSave}
          onCancel={() => setEditingFile(null)}
        />
      )}

      {deletingFile && (
        <ConfirmDeleteModal
          file={deletingFile}
          loading={isDeleting}
          onConfirm={handleDeleteConfirm}
          onCancel={() => setDeletingFile(null)}
        />
      )}

      {approvingFile && (
        <ConfirmApproveModal
          file={approvingFile}
          loading={isApproving}
          onConfirm={handleApproveConfirm}
          onCancel={() => setApprovingFile(null)}
        />
      )}

      {rejectingFile && (
        <ConfirmRejectModal
          file={rejectingFile}
          loading={isRejecting}
          onConfirm={handleRejectConfirm}
          onCancel={() => setRejectingFile(null)}
        />
      )}
    </div>
  );
}
