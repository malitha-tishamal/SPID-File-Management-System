'use client';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { formatSriLankaDate } from 'lib/datetime';
import {
  FiPlus,
  FiEdit3,
  FiTrash2,
  FiPower,
  FiSearch,
  FiRefreshCw,
  FiDatabase,
  FiFolder,
  FiClock,
  FiCheckCircle,
  FiX,
  FiAlertCircle,
  FiChevronLeft,
  FiChevronRight,
} from 'react-icons/fi';
import PageHeader from 'components/admin/PageHeader';
import StatCard from 'components/admin/StatCard';
import ConfirmActionModal from 'components/modals/ConfirmActionModal';
import Modal from 'components/ui/Modal';
import Button from 'components/ui/Button';
import Spinner from 'components/ui/Spinner';
import Skeleton from 'components/ui/Skeleton';
import { useToast } from 'components/toast/ToastContext';
import type { SectionRow, SectionStatus } from 'models/SectionRepository';
import { getSupabaseBrowserClient } from 'config/supabase/client';
import { broadcastAdminSync } from 'components/admin/AccountDirectoryPage';
import { invalidateClientSectionsCache } from 'lib/sectionsClient';
import {
  normalizeSectionName,
  SECTION_NAME_MAX_LENGTH,
  SECTION_NAME_MIN_LENGTH,
} from 'lib/sectionName';
import { useSectionNameCheck } from 'lib/useSectionNameCheck';
import SpellCheckedNameInput from 'components/ui/SpellCheckedNameInput';
import { useLocalizedFields } from 'lib/useLocalizedFields';

const PAGE_SIZE_OPTIONS = [10, 20, 50] as const;
const CLIENT_CACHE_TTL_MS = 15_000;
const FOCUS_REVALIDATE_MS = 20_000;
const POLL_REVALIDATE_MS = 30_000;
const POLL_INTERVAL_MS = 60_000;
const MUTATION_SETTLE_MS = 2_000;
const PUSH_DEBOUNCE_MS = 250;
const ADD_MODAL_LOADING_ID = -1;

// Shared across remounts so navigating away and back does not refetch needlessly.
let memorySections: SectionRow[] | null = null;
let memoryLastFetched = 0;
let inFlightSectionsPromise: Promise<{ sections: SectionRow[] | null; version: number }> | null = null;

type LoadOptions = {
  force?: boolean;
  silent?: boolean;
  minAgeMs?: number;
  bypassServerCache?: boolean;
};

function byId(a: SectionRow, b: SectionRow): number {
  return a.id - b.id;
}

function restoreRow(list: SectionRow[], row: SectionRow): SectionRow[] {
  if (list.some((item) => item.id === row.id)) return list;
  return [...list, row].sort(byId);
}

const ACTION_TONE: Record<'emerald' | 'blue' | 'amber' | 'red', string> = {
  emerald:
    'bg-emerald-50 text-emerald-600 hover:bg-emerald-100 dark:bg-emerald-900/30 dark:text-emerald-400 dark:hover:bg-emerald-900/50',
  blue: 'bg-blue-50 text-blue-600 hover:bg-blue-100 dark:bg-blue-900/30 dark:text-blue-400 dark:hover:bg-blue-900/50',
  amber:
    'bg-amber-50 text-amber-600 hover:bg-amber-100 dark:bg-amber-900/30 dark:text-amber-400 dark:hover:bg-amber-900/50',
  red: 'bg-red-50 text-red-600 hover:bg-red-100 dark:bg-red-900/30 dark:text-red-400 dark:hover:bg-red-900/50',
};

function RowAction({
  label,
  tone,
  disabled,
  onClick,
  children,
}: {
  label: string;
  tone: keyof typeof ACTION_TONE;
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={label}
      aria-label={label}
      className={`flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400/50 disabled:cursor-not-allowed disabled:opacity-50 ${ACTION_TONE[tone]}`}
    >
      {children}
    </button>
  );
}

function SectionStatusBadge({ status }: { status?: SectionStatus }) {
  const { t } = useTranslation('accounts');
  if (!status) return null;

  const config: Record<SectionStatus, { label: string; className: string; dot: string }> = {
    approved: {
      label: 'common:status.active',
      className:
        'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300',
      dot: 'bg-emerald-500',
    },
    pending: {
      label: 'common:status.pending',
      className: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300',
      dot: 'bg-amber-500',
    },
    disabled: {
      label: 'status.disabled',
      className: 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300',
      dot: 'bg-red-500',
    },
  };

  const badge = config[status];
  if (!badge) return null;

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[10px] font-bold ${badge.className}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${badge.dot}`} />
      {t(badge.label)}
    </span>
  );
}

type SectionRowItemProps = {
  section: SectionRow;
  busy: boolean;
  onEdit: (section: SectionRow) => void;
  onActivate: (section: SectionRow) => void;
  onDisable: (section: SectionRow) => void;
  onDelete: (section: SectionRow) => void;
};

const SectionRowItem = React.memo(function SectionRowItem({
  section,
  busy,
  onEdit,
  onActivate,
  onDisable,
  onDelete,
}: SectionRowItemProps) {
  const { t } = useTranslation('accounts');
  const [localizedName] = useLocalizedFields([section.name]);
  const status = section.status ?? 'approved';

  return (
    <tr className="border-b border-slate-300 transition-colors hover:bg-gray-50 dark:border-navy-600 dark:hover:bg-navy-800/50">
      <td className="min-w-0 px-4 py-4 md:px-6">
        <div className="break-words text-sm font-bold leading-snug text-slate-900 dark:text-white">{localizedName}</div>
      </td>
      <td className="min-w-0 px-4 py-4 md:px-6">
        <div className="flex flex-wrap items-center gap-2">
          <SectionStatusBadge status={section.status} />
          {busy && (
            <Spinner
              size="xs"
              label={t('sections.updating')}
              className="text-slate-500 dark:text-slate-300"
            />
          )}
        </div>
      </td>
      <td className="min-w-0 px-4 py-4 md:px-6">
        <div className="break-words text-sm text-slate-700 dark:text-gray-300">
          {section.section_lead?.trim() || '—'}
        </div>
      </td>
      <td className="min-w-0 px-4 py-4 md:px-6">
        <div className="text-xs text-slate-500 dark:text-gray-400">
          {section.created_at ? formatSriLankaDate(section.created_at) : '—'}
        </div>
      </td>
      <td className="min-w-0 px-4 py-4 text-right md:px-6">
        <div className="flex flex-wrap items-center justify-end gap-2">
          {status !== 'approved' && (
            <RowAction
              label={t('sections.activate')}
              tone="emerald"
              disabled={busy}
              onClick={() => onActivate(section)}
            >
              <FiCheckCircle className="h-3.5 w-3.5" />
            </RowAction>
          )}
          <RowAction
            label={t('sections.edit')}
            tone="blue"
            disabled={busy}
            onClick={() => onEdit(section)}
          >
            <FiEdit3 className="h-3.5 w-3.5" />
          </RowAction>
          {status !== 'disabled' && (
            <RowAction
              label={t('sections.disable')}
              tone="amber"
              disabled={busy}
              onClick={() => onDisable(section)}
            >
              <FiPower className="h-3.5 w-3.5" />
            </RowAction>
          )}
          <RowAction
            label={t('sections.delete')}
            tone="red"
            disabled={busy}
            onClick={() => onDelete(section)}
          >
            <FiTrash2 className="h-3.5 w-3.5" />
          </RowAction>
        </div>
      </td>
    </tr>
  );
});

export default function SectionManagementPage() {
  const { t } = useTranslation('accounts');
  const { showToast } = useToast();

  const [sections, setSections] = useState<SectionRow[]>(() => memorySections ?? []);
  const [initialLoading, setInitialLoading] = useState(() => memorySections === null);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState(false);

  const [searchInput, setSearchInput] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState<'all' | SectionStatus>('all');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<number>(10);

  const [editSection, setEditSection] = useState<SectionRow | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<SectionRow | null>(null);
  const [disableTarget, setDisableTarget] = useState<SectionRow | null>(null);
  const [loadingId, setLoadingId] = useState<number | null>(null);

  const sectionsRef = useRef<SectionRow[]>(memorySections ?? []);
  const mountedRef = useRef(true);
  const mutationVersionRef = useRef(0);
  const activeMutationsRef = useRef(0);
  const lastMutationAtRef = useRef(0);
  const pendingRefreshRef = useRef(false);
  const pushTimerRef = useRef<number | null>(null);

  const commitSections = useCallback((next: SectionRow[]) => {
    sectionsRef.current = next;
    memorySections = next;
    memoryLastFetched = Date.now();
    if (mountedRef.current) setSections(next);
  }, []);

  const loadSections = useCallback(
    async ({
      force = false,
      silent = false,
      minAgeMs = 0,
      bypassServerCache = false,
    }: LoadOptions = {}) => {
      if (activeMutationsRef.current > 0) {
        pendingRefreshRef.current = true;
        return;
      }

      const age = Date.now() - memoryLastFetched;
      if (!force && memorySections !== null && age < minAgeMs) return;
      if (!force && memorySections !== null && age < CLIENT_CACHE_TTL_MS && !silent) return;

      if (inFlightSectionsPromise) {
        const result = await inFlightSectionsPromise;
        if (result.sections && result.version === mutationVersionRef.current) {
          commitSections(result.sections);
          if (mountedRef.current) setLoadError(false);
        }
        if (!silent && mountedRef.current) {
          setInitialLoading(false);
          setRefreshing(false);
        }
        if (force && mountedRef.current) {
          await loadSections({ force: true, silent, bypassServerCache: true });
        }
        return;
      }

      const hadCache = memorySections !== null;
      const requestVersion = mutationVersionRef.current;

      if (!silent) {
        if (hadCache) setRefreshing(true);
        else setInitialLoading(true);
        setLoadError(false);
      }

      const request = (async () => {
        try {
          const url =
            force || bypassServerCache
              ? '/api/admin/sections?refresh=true'
              : '/api/admin/sections';
          const res = await fetch(url, {
            cache: 'no-store',
            headers: { Accept: 'application/json' },
          });
          const json = await res.json().catch(() => null);
          if (!res.ok || !json?.ok || !Array.isArray(json?.data?.sections)) {
            return { sections: null, version: requestVersion };
          }
          return { sections: json.data.sections as SectionRow[], version: requestVersion };
        } catch {
          return { sections: null, version: requestVersion };
        } finally {
          inFlightSectionsPromise = null;
        }
      })();

      inFlightSectionsPromise = request;
      const result = await request;
      const isMounted = mountedRef.current;

      if (!silent && isMounted) {
        setInitialLoading(false);
        setRefreshing(false);
      }

      const stale = result.version !== mutationVersionRef.current;
      if (result.sections && !stale) {
        commitSections(result.sections);
        if (isMounted) setLoadError(false);
        return;
      }

      if (!isMounted || silent) return;

      if (!hadCache) {
        setLoadError(true);
        showToast({
          type: 'error',
          title: t('feedback.loadFailedTitle'),
          message: t('sections.errors.loadFailed'),
        });
      } else if (force) {
        showToast({
          type: 'error',
          title: t('feedback.refreshFailedTitle'),
          message: t('sections.errors.refreshFailed'),
        });
      }
    },
    [commitSections, showToast, t]
  );

  const beginMutation = useCallback(() => {
    activeMutationsRef.current += 1;
    mutationVersionRef.current += 1;
    lastMutationAtRef.current = Date.now();
    if (inFlightSectionsPromise) pendingRefreshRef.current = true;
  }, []);

  const endMutation = useCallback(() => {
    activeMutationsRef.current = Math.max(0, activeMutationsRef.current - 1);
    lastMutationAtRef.current = Date.now();
    if (activeMutationsRef.current === 0 && pendingRefreshRef.current) {
      pendingRefreshRef.current = false;
      void loadSections({ silent: true, bypassServerCache: true });
    }
  }, [loadSections]);

  const schedulePushRefresh = useCallback(() => {
    if (Date.now() - lastMutationAtRef.current < MUTATION_SETTLE_MS) return;
    if (pushTimerRef.current !== null) return;

    pushTimerRef.current = window.setTimeout(() => {
      pushTimerRef.current = null;
      if (Date.now() - lastMutationAtRef.current < MUTATION_SETTLE_MS) return;
      void loadSections({ silent: true, bypassServerCache: true });
    }, PUSH_DEBOUNCE_MS);
  }, [loadSections]);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedSearch(searchInput), 250);
    return () => window.clearTimeout(timer);
  }, [searchInput]);

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, filterStatus, pageSize]);

  useEffect(() => {
    mountedRef.current = true;
    void loadSections({
      silent: memorySections !== null,
      minAgeMs: CLIENT_CACHE_TTL_MS,
    });

    let channel: any = null;
    try {
      const supabase = getSupabaseBrowserClient();
      channel = supabase
        .channel('realtime:admin-sections')
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'sections' },
          schedulePushRefresh
        )
        .subscribe();
    } catch (err) {
      console.warn('Realtime channel error:', err);
    }

    let bc: BroadcastChannel | null = null;
    try {
      bc = new BroadcastChannel('spid_admin_sync');
      bc.onmessage = (event) => {
        if (event.data?.type === 'SECTIONS_UPDATED') schedulePushRefresh();
      };
    } catch {}

    const onStorage = (event: StorageEvent) => {
      if (event.key === 'spid_admin_sync') schedulePushRefresh();
    };
    const onFocus = () => {
      void loadSections({ silent: true, minAgeMs: FOCUS_REVALIDATE_MS });
    };
    const onVisibility = () => {
      if (document.visibilityState === 'visible') {
        void loadSections({ silent: true, minAgeMs: FOCUS_REVALIDATE_MS });
      }
    };

    window.addEventListener('storage', onStorage);
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVisibility);

    const interval = window.setInterval(() => {
      if (document.visibilityState === 'visible') {
        void loadSections({ silent: true, minAgeMs: POLL_REVALIDATE_MS });
      }
    }, POLL_INTERVAL_MS);

    return () => {
      mountedRef.current = false;
      if (channel) {
        try {
          const supabase = getSupabaseBrowserClient();
          supabase.removeChannel(channel);
        } catch {}
      }
      if (bc) {
        try {
          bc.close();
        } catch {}
      }
      if (pushTimerRef.current !== null) {
        window.clearTimeout(pushTimerRef.current);
        pushTimerRef.current = null;
      }
      window.removeEventListener('storage', onStorage);
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onVisibility);
      window.clearInterval(interval);
    };
  }, [loadSections, schedulePushRefresh]);

  const stats = useMemo(
    () =>
      sections.reduce(
        (acc, section) => {
          acc.total += 1;
          if (section.status === 'approved') acc.approved += 1;
          else if (section.status === 'pending') acc.pending += 1;
          else if (section.status === 'disabled') acc.disabled += 1;
          return acc;
        },
        { total: 0, approved: 0, pending: 0, disabled: 0 }
      ),
    [sections]
  );

  const normalizedQuery = debouncedSearch.trim().toLowerCase();

  const filtered = useMemo(() => {
    if (!normalizedQuery && filterStatus === 'all') return sections;
    return sections.filter((section) => {
      if (filterStatus !== 'all' && section.status !== filterStatus) return false;
      if (!normalizedQuery) return true;
      return (
        section.name.toLowerCase().includes(normalizedQuery) ||
        (section.section_lead ?? '').toLowerCase().includes(normalizedQuery)
      );
    });
  }, [sections, normalizedQuery, filterStatus]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const currentPage = Math.min(page, pageCount);
  const pageItems = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filtered.slice(start, start + pageSize);
  }, [filtered, currentPage, pageSize]);

  const rangeStart = filtered.length === 0 ? 0 : (currentPage - 1) * pageSize + 1;
  const rangeEnd = Math.min(currentPage * pageSize, filtered.length);

  useEffect(() => {
    if (page !== currentPage) setPage(currentPage);
  }, [page, currentPage]);

  const clearFilters = useCallback(() => {
    setSearchInput('');
    setDebouncedSearch('');
    setFilterStatus('all');
    setPage(1);
  }, []);

  const handleRefresh = useCallback(() => {
    void loadSections({ force: true });
  }, [loadSections]);

  const openEdit = useCallback((section: SectionRow) => setEditSection(section), []);
  const openDisable = useCallback((section: SectionRow) => setDisableTarget(section), []);
  const requestDelete = useCallback((section: SectionRow) => setDeleteTarget(section), []);

  const handleStatusChange = useCallback(
    async (section: SectionRow, nextStatus: SectionStatus) => {
      const previousStatus = section.status ?? 'approved';
      if (previousStatus === nextStatus) return;
      const disabling = nextStatus === 'disabled';

      beginMutation();
      setLoadingId(section.id);
      commitSections(
        sectionsRef.current.map((item) =>
          item.id === section.id ? { ...item, status: nextStatus } : item
        )
      );

      try {
        const res = await fetch(`/api/admin/sections/${section.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: nextStatus }),
        });
        const json = await res.json().catch(() => null);

        if (res.ok && json?.ok) {
          const updated = json.data?.section as SectionRow | undefined;
          if (updated) {
            commitSections(
              sectionsRef.current.map((item) =>
                item.id === section.id ? { ...item, ...updated } : item
              )
            );
          }
          showToast({
            type: 'success',
            title: t(disabling ? 'sections.toasts.disabledTitle' : 'sections.toasts.activatedTitle'),
            message:
              json.message ||
              t(disabling ? 'sections.toasts.disabledMessage' : 'sections.toasts.activatedMessage'),
          });
          invalidateClientSectionsCache();
          broadcastAdminSync('SECTIONS_UPDATED');
        } else {
          commitSections(
            sectionsRef.current.map((item) =>
              item.id === section.id ? { ...item, status: previousStatus } : item
            )
          );
          showToast({
            type: 'error',
            title: t(disabling ? 'sections.toasts.disableFailedTitle' : 'sections.toasts.activationFailedTitle'),
            message:
              json?.message ||
              t(disabling ? 'sections.errors.disableFailed' : 'sections.errors.activateFailed'),
          });
        }
      } catch {
        commitSections(
          sectionsRef.current.map((item) =>
            item.id === section.id ? { ...item, status: previousStatus } : item
          )
        );
        showToast({
          type: 'error',
          title: t(disabling ? 'sections.toasts.disableFailedTitle' : 'sections.toasts.activationFailedTitle'),
          message: t('feedback.serverUnreachable'),
        });
      } finally {
        setLoadingId(null);
        setDisableTarget((current) => (current?.id === section.id ? null : current));
        endMutation();
      }
    },
    [beginMutation, commitSections, endMutation, showToast, t]
  );

  const handleDelete = useCallback(async () => {
    const target = deleteTarget;
    if (!target) return;

    beginMutation();
    setLoadingId(target.id);
    commitSections(sectionsRef.current.filter((item) => item.id !== target.id));

    try {
      const res = await fetch(`/api/admin/sections/${target.id}`, { method: 'DELETE' });
      const json = await res.json().catch(() => null);

      if (res.ok && json?.ok) {
        showToast({
          type: 'success',
          title: t('sections.toasts.deletedTitle'),
          message: json.message || t('sections.toasts.deletedMessage', { name: target.name }),
        });
        invalidateClientSectionsCache();
        broadcastAdminSync('SECTIONS_UPDATED');
      } else {
        commitSections(restoreRow(sectionsRef.current, target));
        showToast({
          type: 'error',
          title: t('sections.toasts.deleteFailedTitle'),
          message: json?.message || t('sections.errors.deleteFailed'),
        });
      }
    } catch {
      commitSections(restoreRow(sectionsRef.current, target));
      showToast({
        type: 'error',
        title: t('sections.toasts.deleteFailedTitle'),
        message: t('feedback.serverUnreachable'),
      });
    } finally {
      setDeleteTarget(null);
      setLoadingId(null);
      endMutation();
    }
  }, [beginMutation, commitSections, deleteTarget, endMutation, showToast, t]);

  const handleDisable = useCallback(() => {
    if (!disableTarget) return;
    void handleStatusChange(disableTarget, 'disabled');
  }, [disableTarget, handleStatusChange]);

  const handleActivate = useCallback(
    (section: SectionRow) => {
      void handleStatusChange(section, 'approved');
    },
    [handleStatusChange]
  );

  const handleEditSave = useCallback(
    async (payload: { name: string; section_lead?: string | null }) => {
      const target = editSection;
      if (!target) return;

      beginMutation();
      setLoadingId(target.id);

      try {
        const res = await fetch(`/api/admin/sections/${target.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        const json = await res.json().catch(() => null);

        if (res.ok && json?.ok) {
          const updated = json.data?.section as SectionRow | undefined;
          if (updated) {
            commitSections(
              sectionsRef.current.map((item) =>
                item.id === target.id ? { ...item, ...updated } : item
              )
            );
          }
          showToast({
            type: 'success',
            title: t('sections.toasts.updatedTitle'),
            message: json.message || t('sections.toasts.updatedMessage'),
          });
          invalidateClientSectionsCache();
          broadcastAdminSync('SECTIONS_UPDATED');
          setEditSection(null);
        } else {
          showToast({
            type: 'error',
            title: t('sections.toasts.updateFailedTitle'),
            message: json?.message || t('sections.errors.updateFailed'),
          });
        }
      } catch {
        showToast({
          type: 'error',
          title: t('sections.toasts.updateFailedTitle'),
          message: t('feedback.serverUnreachable'),
        });
      } finally {
        setLoadingId(null);
        endMutation();
      }
    },
    [beginMutation, commitSections, editSection, endMutation, showToast, t]
  );

  const handleAddSave = useCallback(
    async (payload: { name: string; section_lead?: string }) => {
      beginMutation();
      setLoadingId(ADD_MODAL_LOADING_ID);

      try {
        const res = await fetch('/api/admin/sections', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        const json = await res.json().catch(() => null);

        if (res.ok && json?.ok) {
          const created = json.data?.section as SectionRow | undefined;
          if (created && !sectionsRef.current.some((item) => item.id === created.id)) {
            commitSections([...sectionsRef.current, created].sort(byId));
          }
          showToast({
            type: 'success',
            title: t('sections.toasts.createdTitle'),
            message: json.message || t('sections.toasts.createdMessage'),
          });
          invalidateClientSectionsCache();
          broadcastAdminSync('SECTIONS_UPDATED');
          setShowAddModal(false);
        } else {
          showToast({
            type: 'error',
            title: t('sections.toasts.createFailedTitle'),
            message: json?.message || t('sections.errors.createFailed'),
          });
        }
      } catch {
        showToast({
          type: 'error',
          title: t('sections.toasts.createFailedTitle'),
          message: t('feedback.serverUnreachable'),
        });
      } finally {
        setLoadingId(null);
        endMutation();
      }
    },
    [beginMutation, commitSections, endMutation, showToast, t]
  );

  const closeFormModal = useCallback(() => {
    setShowAddModal(false);
    setEditSection(null);
  }, []);

  const activePercent = stats.total > 0 ? Math.round((stats.approved / stats.total) * 100) : 0;
  const hasActiveFilters = normalizedQuery.length > 0 || filterStatus !== 'all';
  const isRefreshBusy = refreshing || initialLoading;

  return (
    <div className="mt-3 flex flex-col gap-5">
      <PageHeader
        crumbs={[t('page.crumbs.pages'), t('page.crumbs.systemManagement'), t('nav:menu.section-management')]}
        title={t('nav:menu.section-management')}
        subtitle={t('sections.subtitle')}
        right={
          <button
            type="button"
            onClick={() => setShowAddModal(true)}
            className="flex cursor-pointer items-center gap-2 rounded-xl bg-[#4318FF] px-4 py-2.5 text-xs font-bold text-white shadow-md shadow-[#4318FF]/25 transition-all hover:bg-brand-600 active:scale-95"
          >
            <FiPlus className="h-3.5 w-3.5" /> {t('sections.addNew')}
          </button>
        }
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          icon={FiDatabase}
          tone="purple"
          label={t('sections.stats.total')}
          value={stats.total}
          loading={initialLoading}
          pill={t('sections.stats.totalPill')}
          sub={t('sections.stats.totalSub')}
        />
        <StatCard
          icon={FiFolder}
          tone="green"
          label={t('sections.stats.active')}
          value={stats.approved}
          loading={initialLoading}
          pill={initialLoading ? undefined : `${activePercent}%`}
          sub={t('sections.stats.activeSub')}
        />
        <StatCard
          icon={FiClock}
          tone="blue"
          label={t('sections.stats.pending')}
          value={stats.pending}
          loading={initialLoading}
          pill={t('sections.stats.pendingPill')}
          sub={t('sections.stats.pendingSub')}
        />
        <StatCard
          icon={FiPower}
          tone="red"
          label={t('sections.stats.disabled')}
          value={stats.disabled}
          loading={initialLoading}
          pill={t('sections.stats.disabledPill')}
          sub={t('sections.stats.disabledSub')}
        />
      </div>

      <div className="rounded-2xl bg-white p-4 shadow-md shadow-shadow-500 dark:bg-navy-700 dark:shadow-none">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
          <div className="flex h-10 w-full items-center gap-2 rounded-xl border border-slate-300 bg-[#f4f7fe] px-3 dark:border-navy-700 dark:bg-navy-900 lg:max-w-sm">
            <FiSearch className="h-4 w-4 shrink-0 text-slate-700 dark:text-gray-300" />
            <input
              type="text"
              placeholder={t('sections.searchPlaceholder')}
              value={searchInput}
              onChange={(event) => setSearchInput(event.target.value)}
              style={{ backgroundColor: 'transparent' }}
              className="h-full w-full !bg-transparent text-xs font-bold text-slate-950 outline-none placeholder:font-medium placeholder:text-slate-600 dark:!bg-transparent dark:text-white dark:placeholder:text-gray-400"
              aria-label={t('sections.searchAria')}
              maxLength={120}
            />
            {searchInput && (
              <button
                type="button"
                onClick={() => {
                  setSearchInput('');
                  setDebouncedSearch('');
                }}
                aria-label={t('sections.clearSearch')}
                className="flex h-6 w-6 shrink-0 cursor-pointer items-center justify-center rounded-full text-slate-500 transition-colors hover:bg-slate-200 hover:text-slate-700 dark:text-gray-400 dark:hover:bg-navy-700 dark:hover:text-white"
              >
                <FiX className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
          <div className="flex flex-1 flex-wrap items-center gap-2 lg:justify-end">
            <select
              value={filterStatus}
              onChange={(event) => setFilterStatus(event.target.value as 'all' | SectionStatus)}
              aria-label={t('sections.filterAria')}
              className="h-9 cursor-pointer rounded-xl border border-slate-300 bg-[#f4f7fe] px-3 text-xs font-extrabold text-slate-950 outline-none dark:border-navy-700 dark:bg-navy-900 dark:text-gray-200"
            >
              <option value="all">{t('filters.allStatuses')}</option>
              <option value="approved">{t('common:status.active')}</option>
              <option value="pending">{t('common:status.pending')}</option>
              <option value="disabled">{t('status.disabled')}</option>
            </select>
            <button
              type="button"
              onClick={handleRefresh}
              disabled={isRefreshBusy}
              aria-label={t('sections.refreshAria')}
              aria-busy={isRefreshBusy || undefined}
              title={t('sections.refreshAria')}
              className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-xl border border-slate-300 bg-[#f4f7fe] text-slate-900 transition-colors hover:border-[#4318FF] hover:text-[#4318FF] disabled:cursor-not-allowed disabled:opacity-60 dark:border-navy-700 dark:bg-navy-900 dark:text-gray-200"
            >
              {isRefreshBusy ? (
                <Spinner size="xs" className="text-[#4318FF]" />
              ) : (
                <FiRefreshCw className="h-3.5 w-3.5" />
              )}
            </button>
          </div>
        </div>
        {hasActiveFilters && (
          <div className="mt-2.5 flex flex-wrap items-center gap-2 text-[11px] font-medium text-slate-600 dark:text-gray-400">
            <span>
              {t('sections.filterMatch', { shown: filtered.length, total: sections.length })}
            </span>
            <button
              type="button"
              onClick={clearFilters}
              className="cursor-pointer font-bold text-[#4318FF] hover:underline dark:text-brand-300"
            >
              {t('common:buttons.clearFilters')}
            </button>
          </div>
        )}
      </div>

      <div className="overflow-hidden rounded-2xl bg-white shadow-md shadow-shadow-500 dark:bg-navy-700 dark:shadow-none">
        <div
          className="overflow-x-auto"
          aria-busy={initialLoading || refreshing || undefined}
        >
          {initialLoading && (
            <span className="sr-only" role="status">
              {t('sections.loading')}
            </span>
          )}
          <table aria-label={t('sections.tableAria')} className="w-full min-w-[720px] table-auto text-left">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50 dark:border-navy-600 dark:bg-navy-800">
                <th scope="col" className="px-6 py-4 text-[11px] font-bold uppercase tracking-wider text-slate-700 dark:text-gray-300">
                  {t('sections.table.name')}
                </th>
                <th scope="col" className="px-6 py-4 text-[11px] font-bold uppercase tracking-wider text-slate-700 dark:text-gray-300">
                  {t('common:labels.status')}
                </th>
                <th scope="col" className="px-6 py-4 text-[11px] font-bold uppercase tracking-wider text-slate-700 dark:text-gray-300">
                  {t('sections.table.lead')}
                </th>
                <th scope="col" className="px-6 py-4 text-[11px] font-bold uppercase tracking-wider text-slate-700 dark:text-gray-300">
                  {t('common:labels.created')}
                </th>
                <th scope="col" className="px-6 py-4 text-right text-[11px] font-bold uppercase tracking-wider text-slate-700 dark:text-gray-300">
                  {t('common:labels.actions')}
                </th>
              </tr>
            </thead>
            <tbody>
              {initialLoading ? (
                Array.from({ length: 5 }).map((_, index) => (
                  <tr
                    key={`skeleton-${index}`}
                    className="border-b border-slate-300 dark:border-navy-600"
                    aria-hidden="true"
                  >
                    <td className="px-6 py-4">
                      <Skeleton className="h-4 w-[70%]" />
                    </td>
                    <td className="px-6 py-4">
                      <Skeleton className="h-5 w-16" rounded="full" />
                    </td>
                    <td className="px-6 py-4">
                      <Skeleton className="h-4 w-[55%]" />
                    </td>
                    <td className="px-6 py-4">
                      <Skeleton className="h-4 w-20" />
                    </td>
                    <td className="px-6 py-4">
                      <div className="ml-auto flex justify-end gap-2">
                        {[0, 1, 2].map((action) => (
                          <Skeleton key={action} className="h-8 w-8" />
                        ))}
                      </div>
                    </td>
                  </tr>
                ))
              ) : loadError ? (
                <tr>
                  <td colSpan={5} className="px-6 py-12 text-center">
                    <div className="mx-auto flex max-w-sm flex-col items-center gap-3">
                      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-red-50 text-red-500 dark:bg-red-900/30 dark:text-red-400">
                        <FiAlertCircle className="h-6 w-6" />
                      </div>
                      <div>
                        <p className="text-sm font-bold text-slate-900 dark:text-white">
                          {t('empty.loadErrorTitle')}
                        </p>
                        <p className="mt-1 text-xs text-slate-500 dark:text-gray-400">
                          {t('empty.loadErrorBody')}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={handleRefresh}
                        className="cursor-pointer rounded-xl bg-[#4318FF] px-4 py-2 text-xs font-bold text-white transition-colors hover:bg-brand-600"
                      >
                        {t('common:buttons.retry')}
                      </button>
                    </div>
                  </td>
                </tr>
              ) : pageItems.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-12 text-center">
                    <div className="mx-auto flex max-w-sm flex-col items-center gap-3">
                      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-slate-500 dark:bg-navy-800 dark:text-gray-400">
                        <FiFolder className="h-6 w-6" />
                      </div>
                      <div>
                        <p className="text-sm font-bold text-slate-900 dark:text-white">
                          {sections.length === 0
                            ? t('empty.sectionsTitle')
                            : t('empty.noMatchTitle')}
                        </p>
                        <p className="mt-1 text-xs text-slate-500 dark:text-gray-400">
                          {sections.length === 0
                            ? t('empty.sectionsBody')
                            : t('empty.noMatchBody')}
                        </p>
                      </div>
                      {sections.length === 0 ? (
                        <button
                          type="button"
                          onClick={() => setShowAddModal(true)}
                          className="cursor-pointer rounded-xl bg-[#4318FF] px-4 py-2 text-xs font-bold text-white transition-colors hover:bg-brand-600"
                        >
                          {t('sections.addNew')}
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={clearFilters}
                          className="cursor-pointer rounded-xl border border-slate-300 px-4 py-2 text-xs font-bold text-slate-700 transition-colors hover:bg-slate-50 dark:border-navy-600 dark:text-gray-200 dark:hover:bg-navy-800"
                        >
                          {t('common:buttons.clearFilters')}
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ) : (
                pageItems.map((section) => (
                  <SectionRowItem
                    key={section.id}
                    section={section}
                    busy={loadingId === section.id}
                    onEdit={openEdit}
                    onActivate={handleActivate}
                    onDisable={openDisable}
                    onDelete={requestDelete}
                  />
                ))
              )}
            </tbody>
          </table>
        </div>

        {!initialLoading && !loadError && filtered.length > 0 && (
          <div className="flex flex-col gap-3 border-t border-gray-100 px-4 py-3 dark:border-navy-600 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-[11px] font-medium text-slate-500 dark:text-gray-400">
              {t('common:table.showing', { from: rangeStart, to: rangeEnd, total: filtered.length })}
              {filtered.length !== sections.length && (
                <span> {t('sections.filteredFrom', { total: sections.length })}</span>
              )}
            </p>
            <div className="flex flex-wrap items-center gap-3">
              <label className="flex items-center gap-1.5 text-[11px] font-medium text-slate-500 dark:text-gray-400">
                {t('sections.rows')}
                <select
                  value={pageSize}
                  onChange={(event) => setPageSize(Number(event.target.value))}
                  aria-label={t('sections.rowsPerPage')}
                  className="h-8 cursor-pointer rounded-lg border border-slate-300 bg-white px-2 text-[11px] font-bold text-slate-700 outline-none dark:border-navy-600 dark:bg-navy-800 dark:text-gray-200"
                >
                  {PAGE_SIZE_OPTIONS.map((size) => (
                    <option key={size} value={size}>
                      {size}
                    </option>
                  ))}
                </select>
              </label>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setPage((current) => Math.max(1, current - 1))}
                  disabled={currentPage <= 1}
                  aria-label={t('table.previousPage')}
                  className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg border border-slate-300 bg-white text-slate-600 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-navy-600 dark:bg-navy-800 dark:text-gray-300 dark:hover:bg-navy-700"
                >
                  <FiChevronLeft className="h-4 w-4" />
                </button>
                <span className="min-w-[76px] text-center text-[11px] font-bold text-slate-600 dark:text-gray-300">
                  {t('common:table.pageOf', { page: currentPage, totalPages: pageCount })}
                </span>
                <button
                  type="button"
                  onClick={() => setPage((current) => Math.min(pageCount, current + 1))}
                  disabled={currentPage >= pageCount}
                  aria-label={t('table.nextPage')}
                  className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg border border-slate-300 bg-white text-slate-600 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-navy-600 dark:bg-navy-800 dark:text-gray-300 dark:hover:bg-navy-700"
                >
                  <FiChevronRight className="h-4 w-4" />
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {deleteTarget && (
        <ConfirmActionModal
          title={t('sections.confirm.deleteTitle')}
          description={t('sections.confirm.deleteDescription', { name: deleteTarget.name })}
          confirmLabel={t('sections.confirm.deleteConfirm')}
          tone="danger"
          loading={loadingId === deleteTarget.id}
          onConfirm={handleDelete}
          onCancel={() => setDeleteTarget(null)}
        />
      )}

      {disableTarget && (
        <ConfirmActionModal
          title={t('sections.confirm.disableTitle')}
          description={t('sections.confirm.disableDescription', { name: disableTarget.name })}
          confirmLabel={t('sections.confirm.disableConfirm')}
          tone="warning"
          loading={loadingId === disableTarget.id}
          onConfirm={handleDisable}
          onCancel={() => setDisableTarget(null)}
        />
      )}

      {(showAddModal || editSection) && (
        <SectionFormModal
          section={editSection}
          existingSections={sections}
          saving={
            editSection ? loadingId === editSection.id : loadingId === ADD_MODAL_LOADING_ID
          }
          onClose={closeFormModal}
          onSave={editSection ? handleEditSave : handleAddSave}
        />
      )}
    </div>
  );
}

function SectionFormModal({
  section,
  existingSections = [],
  saving,
  onClose,
  onSave,
}: {
  section: SectionRow | null;
  existingSections?: SectionRow[];
  saving: boolean;
  onClose: () => void;
  onSave: (payload: { name: string; section_lead?: string | null }) => Promise<void>;
}) {
  const { t } = useTranslation('accounts');
  const [name, setName] = useState(section?.name || '');
  const [sectionLead, setSectionLead] = useState(section?.section_lead || '');
  const isEdit = !!section;
  const normalizedName = normalizeSectionName(name);
  const duplicateCheck = useSectionNameCheck({
    name,
    sections: existingSections,
    ignoreId: section?.id ?? null,
  });
  const duplicateMessage = duplicateCheck.message;
  const canSubmit =
    normalizedName.length >= SECTION_NAME_MIN_LENGTH &&
    normalizedName.length <= SECTION_NAME_MAX_LENGTH &&
    !duplicateMessage &&
    !saving;

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!canSubmit || saving) return;
    await onSave({
      name: normalizedName,
      section_lead: sectionLead.trim() || null,
    });
  };

  return (
    <Modal
      open
      onClose={onClose}
      busy={saving}
      labelledBy="section-form-title"
      panelClassName="w-full max-w-md max-h-[90vh] overflow-y-auto rounded-3xl bg-white p-6 shadow-2xl dark:bg-navy-700"
    >
        <div className="mb-5 flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#4318FF]/10 text-[#4318FF] dark:bg-[#4318FF]/20 dark:text-brand-300">
              <FiFolder className="h-5 w-5" />
            </div>
            <div>
              <h3
                id="section-form-title"
                className="text-lg font-bold text-navy-700 dark:text-white"
              >
                {t(isEdit ? 'sections.form.editTitle' : 'sections.form.addTitle')}
              </h3>
              <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
                {t(isEdit ? 'sections.form.editSubtitle' : 'sections.form.addSubtitle')}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            aria-label={t('common:buttons.close')}
            className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-full text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600 disabled:cursor-not-allowed disabled:opacity-50 dark:hover:bg-navy-800 dark:hover:text-white"
          >
            <FiX className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label
              htmlFor="section-name"
              className="mb-1.5 block text-xs font-semibold text-slate-700 dark:text-slate-200"
            >
              {t('sections.form.nameLabel')} <span className="text-red-500">*</span>
            </label>
            <SpellCheckedNameInput
              id="section-name"
              value={name}
              onChange={setName}
              sections={existingSections}
              extraDictionaryText={sectionLead}
              placeholder={t('sections.form.namePlaceholder')}
              maxLength={SECTION_NAME_MAX_LENGTH}
              autoFocus
              disabled={saving}
              invalid={Boolean(duplicateMessage)}
              ariaDescribedBy="section-name-hint"
              fieldClassName="w-full rounded-xl border border-transparent bg-[#f4f7fe] text-sm transition-colors focus-within:border-[#4318FF] dark:bg-navy-900"
              paddingClassName="px-4 py-3"
            />
            <div
              id="section-name-hint"
              className={`mt-1.5 flex items-center justify-between text-[11px] font-medium ${
                duplicateMessage
                  ? 'text-red-600 dark:text-red-400'
                  : 'text-slate-500 dark:text-gray-400'
              }`}
              aria-live="polite"
            >
              <span>
                {duplicateMessage ??
                  t('sections.form.nameHint', { count: SECTION_NAME_MIN_LENGTH })}
              </span>
              <span>
                {name.length}/{SECTION_NAME_MAX_LENGTH}
              </span>
            </div>
          </div>
          <div>
            <label
              htmlFor="section-lead"
              className="mb-1.5 block text-xs font-semibold text-slate-700 dark:text-slate-200"
            >
              {t('sections.form.leadLabel')}{' '}
              <span className="font-normal text-slate-400 dark:text-slate-500">{t('sections.form.optional')}</span>
            </label>
            <input
              id="section-lead"
              type="text"
              value={sectionLead}
              onChange={(event) => setSectionLead(event.target.value)}
              placeholder={t('sections.form.leadPlaceholder')}
              disabled={saving}
              spellCheck={false}
              autoCorrect="off"
              className="w-full rounded-xl border border-transparent bg-[#f4f7fe] px-4 py-3 text-sm text-slate-800 transition-colors focus:border-[#4318FF] focus:outline-none disabled:opacity-60 dark:bg-navy-900 dark:text-white"
            />
          </div>
          <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row">
            <Button
              type="button"
              variant="cancel"
              onClick={onClose}
              disabled={saving}
              className="flex-1"
            >
              {t('common:buttons.cancel')}
            </Button>
            <Button
              type="submit"
              variant="primary"
              loading={saving}
              loadingText={t('modals.saving')}
              disabled={!canSubmit}
              className="flex-1"
            >
              {t(isEdit ? 'sections.form.update' : 'sections.form.create')}
            </Button>
          </div>
        </form>
    </Modal>
  );
}
