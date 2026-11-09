'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState, memo } from 'react';
import { useTranslation } from 'react-i18next';
import { TABLE_BODY_CLASS, TABLE_HEAD_ROW_CLASS, TABLE_ROW_CLASS } from 'lib/tableStyles';
import { FILE_FIELD_MAX_LENGTH } from 'lib/constants';
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
import AttributedUser from 'components/ui/AttributedUser';
import { attributedNameText } from 'utils/userDisplay';
import { useLocalizedFields } from 'lib/useLocalizedFields';
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
  const { t } = useTranslation();
  const deletedLabel = t('common:deletedUser');
  const [localizedName, localizedSection] = useLocalizedFields([
    file.file_name,
    file.section_name,
  ]);

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

  // rejected_by_name is snapshot-only (no id, no deleted flag); when it is
  // absent the label falls back to the approver's name, which does carry one.
  const rejectedByName = attributedNameText(
    file.rejected_by_name || file.approved_by_name,
    {
      deleted:
        !file.rejected_by_name &&
        !!file.approved_by_name &&
        file.approver_is_deleted === true,
      label: deletedLabel,
      fallback: t('dashboard:roles.admin'),
    }
  );
  const approvedByName = attributedNameText(file.approved_by_name, {
    deleted: file.approver_is_deleted,
    label: deletedLabel,
    fallback: t('dashboard:roles.admin'),
  });

  return (
    <tr className={`${TABLE_ROW_CLASS} group`}>
      {/* NO */}
      <td className="min-w-0 py-3 pl-3 pr-1 text-center align-middle text-[11px] font-bold tabular-nums text-muted">
        {rowNo}
      </td>

      {/* FILE NUMBER */}
      <td className="min-w-0 break-words px-3 py-3 align-middle">
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
      <td
        className="min-w-0 break-words px-3 py-3 align-middle"
        title={localizedName || file.file_name}
      >
        <span className="line-clamp-2 max-w-full break-words text-[12px] font-bold leading-snug text-[#1B2559] dark:text-white [overflow-wrap:anywhere]">
          {localizedName || file.file_name}
        </span>
      </td>

      {/* SECTION */}
      <td className="min-w-0 px-3 py-3 align-middle">
        <span
          className={`inline-block max-w-full whitespace-normal break-words rounded-md px-2 py-[3px] text-[10px] font-bold leading-snug ${getSectionBadge(
            file.section_name,
          )}`}
          title={localizedSection || file.section_name || t('dashboard:rows.generalRecord')}
        >
          {localizedSection || file.section_name || t('dashboard:rows.generalRecord')}
        </span>
      </td>

      {/* FILE LOCATION */}
      <td className="min-w-0 px-3 py-3 align-middle">
        <LocationDetailsButton
          file={file}
          className="inline-flex w-full min-w-0 items-start gap-1.5 overflow-hidden rounded-lg border border-slate-200/80 bg-slate-50 px-2 py-1 text-[11px] font-semibold leading-snug text-slate-700 dark:border-navy-700 dark:bg-navy-900/70 dark:text-slate-200"
        />
      </td>

      {/* ADDED BY */}
      <td className="min-w-0 px-3 py-3 align-middle">
        <div className="flex min-w-0 items-center gap-2">
          <div
            className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[9px] font-bold ring-1 ${
              file.registrar_is_deleted
                ? 'bg-slate-100 text-slate-400 ring-slate-200/70 dark:bg-navy-900 dark:text-slate-500 dark:ring-navy-700'
                : 'bg-slate-100 text-slate-600 ring-slate-200/70 dark:bg-navy-900 dark:text-slate-300 dark:ring-navy-700'
            }`}
          >
            {file.registrar_is_deleted && !file.registrar_name
              ? '—'
              : getInitials(file.registrar_name)}
          </div>
          <span
            className="min-w-0 max-w-full break-words text-[11px] font-semibold leading-snug text-slate-700 dark:text-slate-200"
            title={attributedNameText(file.registrar_name, {
              deleted: file.registrar_is_deleted,
              label: deletedLabel,
              fallback: t('common:roles.STAFF'),
            })}
          >
            <AttributedUser
              name={file.registrar_name}
              deleted={file.registrar_is_deleted}
              fallback={t('common:roles.STAFF')}
            />
          </span>
        </div>
      </td>

      {/* ROLE */}
      <td className="min-w-0 px-2 py-3 text-center align-middle">
        {isAdmin ? (
          <span className="inline-flex max-w-full items-center justify-center whitespace-normal break-words rounded-full border border-[#FED7D7] bg-[#FEECEB] px-2.5 py-1 text-[10px] font-bold uppercase leading-snug tracking-wide text-[#B42318] dark:border-rose-800 dark:bg-rose-900 dark:text-rose-50">
            {t('dashboard:roles.admin')}
          </span>
        ) : (
          <span className="inline-flex max-w-full items-center justify-center whitespace-normal break-words rounded-full border border-[#C6F6D5] bg-[#E6F9F0] px-2.5 py-1 text-[10px] font-bold uppercase leading-snug tracking-wide text-[#027A48] dark:border-emerald-800 dark:bg-emerald-900 dark:text-emerald-50">
            {t('dashboard:roles.staff')}
          </span>
        )}
      </td>

      {/* ADDED DATE & TIME */}
      <td className="min-w-0 px-2 py-3 align-middle text-[11px] leading-tight">
        <span className="block whitespace-nowrap font-semibold tabular-nums text-slate-700 dark:text-slate-200">
          {addedDate}
        </span>
        <span className="mt-0.5 block whitespace-nowrap font-medium tabular-nums text-muted">
          {addedTime || '—'}
        </span>
      </td>

      {/* REQUEST STATUS */}
      <td className="min-w-0 px-2 py-3 text-center align-middle">
        {isAdmin ? (
          <div className="flex min-w-0 flex-col items-center justify-center gap-1">
            <span className="inline-flex max-w-full items-center gap-1 whitespace-normal break-words rounded-full border border-blue-200 bg-blue-50 px-2.5 py-1 text-[10px] font-bold leading-snug text-blue-800 dark:border-blue-800 dark:bg-blue-900 dark:text-blue-50">
              <FiCheckCircle className="h-3 w-3 shrink-0 stroke-[2.5]" />
              <span className="min-w-0">{t('dashboard:rows.systemVerified')}</span>
            </span>
            <span
              className="max-w-full whitespace-normal break-words text-[10px] font-semibold leading-snug text-muted"
              title={t('dashboard:rows.adminAdded', {
                name: attributedNameText(file.registrar_name, {
                  deleted: file.registrar_is_deleted,
                  label: deletedLabel,
                  fallback: t('dashboard:roles.admin'),
                }),
              })}
            >
              {t('dashboard:rows.adminAdded', {
                name: attributedNameText(file.registrar_name, {
                  deleted: file.registrar_is_deleted,
                  label: deletedLabel,
                  fallback: t('dashboard:roles.admin'),
                }),
              })}
            </span>
          </div>
        ) : isPending ? (
          <span className="inline-flex max-w-full items-center gap-1 whitespace-normal break-words rounded-full border border-[#FDE68A] bg-[#FFFBEB] px-2.5 py-1 text-[10px] font-bold leading-snug text-[#B45309] dark:border-amber-700 dark:bg-amber-900 dark:text-amber-50">
            <FiClock className="h-3 w-3 shrink-0 stroke-[2.5]" />
            <span className="min-w-0">{t('dashboard:rows.pendingReview')}</span>
          </span>
        ) : isRejected ? (
          <div className="flex min-w-0 flex-col items-center justify-center gap-1">
            <span className="inline-flex max-w-full items-center gap-1 whitespace-normal break-words rounded-full border border-rose-300 bg-rose-50 px-2.5 py-1 text-[10px] font-bold leading-snug text-rose-800 dark:border-rose-800 dark:bg-rose-900 dark:text-rose-50">
              <FiX className="h-3 w-3 shrink-0 stroke-[3]" />
              <span className="min-w-0">{t('common:status.rejected')}</span>
            </span>
            <span
              className="max-w-full whitespace-normal break-words text-[10px] font-semibold leading-snug text-rose-700 dark:text-rose-300"
              title={t('dashboard:rows.rejectedBy', {
                name: rejectedByName,
                role: t('dashboard:roles.admin'),
              })}
            >
              {t('dashboard:rows.rejectedBy', {
                name: rejectedByName,
                role: t('dashboard:roles.admin'),
              })}
            </span>
          </div>
        ) : (
          <div className="flex min-w-0 flex-col items-center justify-center gap-1">
            <span className="inline-flex max-w-full items-center gap-1 whitespace-normal break-words rounded-full border border-[#A7F3D0] bg-[#E6F9F0] px-2.5 py-1 text-[10px] font-bold leading-snug text-[#027A48] dark:border-emerald-800 dark:bg-emerald-900 dark:text-emerald-50">
              <FiCheck className="h-3 w-3 shrink-0 stroke-[3]" />
              <span className="min-w-0">{t('common:status.approved')}</span>
            </span>
            <span
              className="max-w-full whitespace-normal break-words text-[10px] font-semibold leading-snug text-muted"
              title={
                file.approved_by_name?.toLowerCase().includes('auto') ||
                (!file.approved_by && !file.approved_by_name && !isAdmin)
                  ? t('dashboard:rows.autoApprovalReason')
                  : t('dashboard:rows.approvedByAdmin', {
                      name: approvedByName,
                    })
              }
            >
              {file.approved_by_name?.toLowerCase().includes('auto') || (!file.approved_by && !file.approved_by_name && !isAdmin)
                ? t('dashboard:rows.autoApprovalReason')
                : t('dashboard:rows.approvedByAdmin', {
                    name: approvedByName,
                  })}
            </span>
          </div>
        )}
      </td>

      {/* ADMIN ACTIONS */}
      <td className="min-w-0 px-2 py-3 text-center align-middle">
        <div className="flex min-w-0 flex-col items-center gap-1.5">
          {/* Approve & Reject — only for pending staff files */}
          {!isAdmin && isPending && (
            <div className="flex flex-wrap items-center justify-center gap-1.5">
              <button
                type="button"
                onClick={() => onApprove(file)}
                aria-label={t('dashboard:actions.approveAria', { fileNo: file.file_no })}
                className="inline-flex min-w-fit cursor-pointer items-center gap-1 whitespace-nowrap rounded-lg bg-[#05CD99] px-2.5 py-1.5 text-[10px] font-bold text-white shadow-xs transition-all hover:bg-[#04B787] active:scale-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#05CD99]/50"
                title={t('dashboard:actions.approveTitle')}
              >
                <FiCheck className="h-3 w-3 shrink-0 stroke-[3]" />
                <span>{t('common:buttons.approve')}</span>
              </button>

              <button
                type="button"
                onClick={() => onReject(file)}
                aria-label={t('dashboard:actions.rejectAria', { fileNo: file.file_no })}
                className="inline-flex min-w-fit cursor-pointer items-center gap-1 whitespace-nowrap rounded-lg border border-rose-200 bg-white px-2.5 py-1.5 text-[10px] font-bold text-rose-700 shadow-xs transition-all hover:bg-rose-50 active:scale-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-300 dark:border-rose-900/40 dark:bg-navy-900 dark:text-rose-300 dark:hover:bg-rose-950/30"
                title={t('dashboard:actions.rejectTitle')}
              >
                <FiX className="h-3 w-3 shrink-0 stroke-[3]" />
                <span>{t('common:buttons.reject')}</span>
              </button>
            </div>
          )}

          <div className="flex flex-wrap items-center justify-center gap-0.5">
            <button
              type="button"
              onClick={() => onView(file)}
              className="inline-flex h-7 w-7 cursor-pointer items-center justify-center rounded-lg text-slate-500 transition-colors hover:bg-[#F4F2FF] hover:text-[#4318FF] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#4318FF]/40 dark:text-slate-300 dark:hover:bg-navy-700 dark:hover:text-brand-300"
              title={t('common:buttons.viewDetails')}
              aria-label={t('dashboard:actions.viewAria', { fileNo: file.file_no })}
            >
              <FiEye className="h-3.5 w-3.5" />
            </button>

            <button
              type="button"
              onClick={() => onEdit(file)}
              className="inline-flex h-7 w-7 cursor-pointer items-center justify-center rounded-lg text-slate-500 transition-colors hover:bg-amber-50 hover:text-amber-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-300 dark:text-slate-300 dark:hover:bg-navy-700"
              title={t('dashboard:actions.editTitle')}
              aria-label={t('dashboard:actions.editAria', { fileNo: file.file_no })}
            >
              <FiEdit2 className="h-3.5 w-3.5" />
            </button>

            <button
              type="button"
              onClick={() => onDelete(file)}
              className="inline-flex h-7 w-7 cursor-pointer items-center justify-center rounded-lg text-slate-500 transition-colors hover:bg-rose-50 hover:text-rose-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-300 dark:text-slate-300 dark:hover:bg-rose-950/40"
              title={t('dashboard:actions.deleteTitle')}
              aria-label={t('dashboard:actions.deleteAria', { fileNo: file.file_no })}
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
  const { t } = useTranslation();
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
          setOverviewError(t('dashboard:states.overviewError'));
        }
        markOverviewResolved();
      } catch {
        if (controller.signal.aborted || requestId !== requestIdRef.current) {
          return;
        }
        overviewMetaResolvedRef.current = true;
        if (!hasOverviewRef.current) {
          setOverviewError(t('dashboard:states.overviewError'));
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
            readApiError(listJson, t('dashboard:states.loadRecordsError')),
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
            : t('dashboard:states.loadDataError');
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
          title: t('dashboard:feedback.approveSuccessTitle'),
          message:
            json.data?.message ||
            t('dashboard:feedback.approveSuccessMessage', {
              fileName: approvingFile.file_name,
            }),
        });
        setApprovingFile(null);
        refresh();
      } else {
        showToast({
          type: 'error',
          title: t('dashboard:feedback.approveFailedTitle'),
          message: readApiError(json, t('dashboard:feedback.approveFailedMessage')),
        });
      }
    } catch {
      showToast({
        type: 'error',
        title: t('dashboard:feedback.connectionErrorTitle'),
        message: t('dashboard:feedback.connectionErrorMessage'),
      });
    } finally {
      setIsApproving(false);
    }
  }, [approvingFile, isApproving, refresh, showToast, t]);

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
          title: t('dashboard:feedback.rejectSuccessTitle'),
          message:
            json.data?.message ||
            t('dashboard:feedback.rejectSuccessMessage', { fileNo: rejectingFile.file_no }),
        });
        setRejectingFile(null);
        refresh();
      } else {
        // If it's a validation error (e.g., missing reason), keep modal open
        if (json?.code === 'VALIDATION_ERROR') {
          showToast({
            type: 'error',
            title: t('dashboard:feedback.validationErrorTitle'),
            message: readApiError(json, t('dashboard:feedback.rejectFailedMessage')),
          });
        } else {
          // For other errors, also keep modal open but show error
          showToast({
            type: 'error',
            title: t('dashboard:feedback.rejectFailedTitle'),
            message: readApiError(json, t('dashboard:feedback.rejectFailedMessage')),
          });
        }
      }
    } catch {
      showToast({
        type: 'error',
        title: t('dashboard:feedback.connectionErrorTitle'),
        message: t('dashboard:feedback.connectionErrorMessage'),
      });
    } finally {
      setIsRejecting(false);
    }
  }, [rejectingFile, isRejecting, refresh, showToast, t]);

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
      const json = await res.json().catch(() => null);

      if (res.ok) {
        showToast({
          type: 'success',
          title: t('dashboard:feedback.fileUpdatedTitle'),
          message: t('dashboard:feedback.fileUpdatedMessage', {
            fileName: payload.file_name || editingFile.file_name,
          }),
        });
        setEditingFile(null);
        refresh();
      } else if (json?.code === 'FIELD_TOO_LONG') {
        return t('files:validation.fileNameMax', {
          max: Number(json.max) || FILE_FIELD_MAX_LENGTH,
        });
      } else {
        setFiles((prev) =>
          prev.map((item) => (item.id === editingFile.id ? { ...item, ...payload } : item)),
        );
        showToast({
          type: 'success',
          title: t('dashboard:feedback.fileUpdatedTitle'),
          message: t('dashboard:feedback.changesSaved'),
        });
        setEditingFile(null);
      }
    } catch {
      setFiles((prev) =>
        prev.map((item) => (item.id === editingFile.id ? { ...item, ...payload } : item)),
      );
      showToast({
        type: 'info',
        title: t('dashboard:feedback.fileUpdatedTitle'),
        message: t('dashboard:feedback.updatedRecord'),
      });
      setEditingFile(null);
    } finally {
      setIsSavingEdit(false);
    }
    return null;
  }, [editingFile, refresh, showToast, t]);

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
          title: t('dashboard:feedback.fileDeletedTitle'),
          message: t('dashboard:feedback.fileDeletedMessage', { fileNo: deletingFile.file_no }),
        });
      } else {
        showToast({
          type: 'info',
          title: t('dashboard:feedback.removedFromViewTitle'),
          message: t('dashboard:feedback.removedFromViewMessage', { fileNo: deletingFile.file_no }),
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
  }, [deletingFile, showToast, t]);

  return (
    <div className="w-full space-y-6 pb-12 font-dm">
      {/* â”€â”€ 1. Header Overview â”€â”€ */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 pt-2">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-[#1B2559] dark:text-white">
            {t('dashboard:headings.overview')}
          </h2>
        </div>
        <div className="text-xs font-medium text-slate-400">
          {t('dashboard:headings.overviewSubtitle')}
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
              {t('dashboard:states.loadingOverview')}
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
            {t('dashboard:states.overviewUnavailable')}
          </p>
          <p className="text-xs text-slate-400">{overviewError}</p>
          <button
            type="button"
            onClick={handleOverviewRetry}
            className="mt-1 inline-flex items-center gap-1.5 rounded-xl bg-[#4318FF] px-4 py-2 text-xs font-bold text-white shadow-md shadow-brand-500/20 transition-colors hover:bg-[#3311DB] focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-navy-800"
          >
            <FiRefreshCw className="h-3.5 w-3.5" />
            {t('dashboard:buttons.retry')}
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-5 animate-fadeIn md:grid-cols-3">
          {/* Card 1: Total Active Files */}
          <div className="flex items-center gap-4 rounded-3xl bg-white p-5 shadow-xs border border-slate-100 dark:bg-navy-800 dark:border-navy-700">
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-[#EEF2FF] text-[#4318FF] dark:bg-brand-950/40 dark:text-brand-300">
              <FiFolder className="h-6 w-6" />
            </div>
            <div className="flex min-w-0 flex-col">
              <div className="flex items-center gap-2">
                <span className="text-2xl md:text-3xl font-extrabold text-[#1B2559] dark:text-white tracking-tight">
                  {stats.totalActive}
                </span>
                {todayCount !== null && (
                  <span className="inline-flex items-center gap-0.5 rounded-full bg-[#E6F9F0] px-2 py-0.5 text-[11px] font-bold text-[#05CD99] dark:bg-emerald-950/40 dark:text-emerald-300">
                    <FiTrendingUp className="h-3 w-3" />
                    {t('dashboard:stats.todayDelta', { count: todayCount })}
                  </span>
                )}
              </div>
              <span className="mt-1 text-[11px] font-bold uppercase leading-snug tracking-wider text-muted">
                {t('dashboard:stats.totalActiveFiles')}
              </span>
            </div>
          </div>

          {/* Card 2: Sections */}
          <div className="flex items-center gap-4 rounded-3xl bg-white p-5 shadow-xs border border-slate-100 dark:bg-navy-800 dark:border-navy-700">
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-[#FAF5FF] text-[#8B5CF6] dark:bg-purple-950/40 dark:text-purple-300">
              <FiGrid className="h-6 w-6" />
            </div>
            <div className="flex min-w-0 flex-col">
              <span className="text-2xl md:text-3xl font-extrabold text-[#1B2559] dark:text-white tracking-tight">
                {stats.sections}
              </span>
              <span className="mt-1 text-[11px] font-bold uppercase leading-snug tracking-wider text-muted">
                {t('dashboard:stats.sections')}
              </span>
            </div>
          </div>

          {/* Card 3: Total Pages */}
          <div className="flex items-center gap-4 rounded-3xl bg-white p-5 shadow-xs border border-slate-100 dark:bg-navy-800 dark:border-navy-700">
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-[#F0F7FF] text-[#3B82F6] dark:bg-blue-950/40 dark:text-blue-300">
              <FiFileText className="h-6 w-6" />
            </div>
            <div className="flex min-w-0 flex-col">
              <span className="text-2xl md:text-3xl font-extrabold text-[#1B2559] dark:text-white tracking-tight">
                {stats.totalPages}
              </span>
              <span className="mt-1 text-[11px] font-bold uppercase leading-snug tracking-wider text-muted">
                {t('dashboard:stats.totalPages')}
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
                {t('dashboard:headings.recentlyAdded')}
              </h3>
              <span className="rounded-full bg-[#EEF2FF] px-2.5 py-0.5 text-[11px] font-bold text-[#4318FF] dark:bg-brand-950/40 dark:text-brand-300">
                {t('dashboard:headings.latestBadge')}
              </span>
            </div>
            <p className="mt-1 text-xs text-slate-400">
              {t('dashboard:headings.recentlyAddedHint')}
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
                placeholder={t('dashboard:cards.searchPlaceholder')}
                aria-label={t('dashboard:cards.searchAria')}
                className="ml-2 w-full bg-transparent text-xs outline-none placeholder:text-slate-400"
              />
            </div>

            {/* Status Filter */}
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              aria-label={t('dashboard:cards.filterStatusAria')}
              className="h-9 rounded-xl bg-slate-50 px-3 text-xs font-semibold text-slate-700 dark:bg-navy-900 dark:text-white border border-slate-200 dark:border-navy-700 outline-none cursor-pointer"
            >
              <option value="all" className="dark:bg-navy-800">{t('dashboard:filters.allStatus')}</option>
              <option value="approved" className="dark:bg-navy-800">{t('common:status.approved')}</option>
              <option value="pending" className="dark:bg-navy-800">{t('common:status.pending')}</option>
              <option value="rejected" className="dark:bg-navy-800">{t('common:status.rejected')}</option>
              <option value="archived" className="dark:bg-navy-800">{t('dashboard:filters.archived')}</option>
            </select>

            {/* Sort Dropdown */}
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as any)}
              aria-label={t('dashboard:cards.sortAria')}
              className="h-9 rounded-xl bg-slate-50 px-3 text-xs font-semibold text-slate-700 dark:bg-navy-900 dark:text-white border border-slate-200 dark:border-navy-700 outline-none cursor-pointer"
            >
              <option value="newest" className="dark:bg-navy-800">{t('dashboard:filters.newest')}</option>
              <option value="oldest" className="dark:bg-navy-800">{t('dashboard:filters.oldest')}</option>
              <option value="file_no" className="dark:bg-navy-800">{t('dashboard:filters.fileNumber')}</option>
              <option value="file_name" className="dark:bg-navy-800">{t('dashboard:filters.fileName')}</option>
            </select>

            {/* View All Files Link */}
            <Link
              href="/admin/manage-system-files"
              className="flex items-center gap-1 text-xs font-bold text-[#4318FF] hover:underline dark:text-brand-300 transition-colors ml-1"
            >
              {t('dashboard:cards.viewAllFiles')}
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
            aria-label={t('dashboard:cards.tableAria')}
            className={`w-full min-w-[1280px] table-auto border-collapse text-left ${
              isRecentFilesLoading ? '' : 'animate-fadeIn'
            }`}
          >
            <thead>
              <tr className={TABLE_HEAD_ROW_CLASS}>
                <th scope="col" className="w-10 py-2.5 pl-3 pr-1 text-center">{t('dashboard:columns.no')}</th>
                <th scope="col" className="min-w-[150px] px-3 py-2.5">{t('dashboard:columns.fileNumber')}</th>
                <th scope="col" className="min-w-[200px] px-3 py-2.5">{t('dashboard:columns.fileName')}</th>
                <th scope="col" className="min-w-[130px] px-3 py-2.5">{t('dashboard:columns.section')}</th>
                <th scope="col" className="min-w-[150px] px-3 py-2.5">{t('dashboard:columns.fileLocation')}</th>
                <th scope="col" className="min-w-[130px] px-3 py-2.5">{t('dashboard:columns.addedBy')}</th>
                <th scope="col" className="min-w-[90px] px-3 py-2.5 text-center">{t('dashboard:columns.role')}</th>
                <th scope="col" className="min-w-[120px] px-3 py-2.5">{t('dashboard:columns.addedDateTime')}</th>
                <th scope="col" className="min-w-[140px] px-3 py-2.5 text-center">{t('dashboard:columns.requestStatus')}</th>
                <th scope="col" className="min-w-[150px] px-3 py-2.5 text-center">{t('dashboard:columns.adminActions')}</th>
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
                          {t('dashboard:states.loadingRecentFiles')}
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
                            {t('dashboard:states.dataUnavailable')}
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
                          {t('dashboard:buttons.retry')}
                        </button>
                      </div>
                    </td>
                  </tr>
                ) : filteredFiles.length === 0 ? (
                  <tr>
                    <td colSpan={10} className="py-16 text-center">
                      <p className="text-sm font-bold text-slate-700 dark:text-slate-300">
                        {t('dashboard:states.noRecords')}
                      </p>
                      <p className="mt-1 text-xs text-slate-400">
                        {t('dashboard:states.noRecordsHint')}
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
