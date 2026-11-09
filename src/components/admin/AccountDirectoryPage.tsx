'use client';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { useTranslation } from 'react-i18next';
import {
  FiUserPlus,
  FiShield,
  FiCheckCircle,
  FiUserCheck,
  FiUserX,
  FiSearch,
  FiRefreshCw,
  FiPrinter,
  FiDownload,
  FiAlertTriangle,
  FiLock,
  FiTrash2,
} from 'react-icons/fi';
import { MdAdminPanelSettings } from 'react-icons/md';
import PageHeader from 'components/admin/PageHeader';
import StatCard from 'components/admin/StatCard';
import AccountTable, { PRIMARY_ADMIN_EMAIL } from 'components/admin/AccountTable';
import LockedAccountsTable from 'components/admin/LockedAccountsTable';
import { useAccountActions, type AccountAction, type DeletePayload } from 'components/admin/useAccountActions';
import { attributedName, attributedNameText, isReservedDeletedEmail } from 'utils/userDisplay';

// Modals are only mounted on demand — keep them out of the route's initial JS.
const ActionFeedbackModal = dynamic(() => import('components/modals/ActionFeedbackModal'), {
  ssr: false,
});
const ConfirmActionModal = dynamic(() => import('components/modals/ConfirmActionModal'), {
  ssr: false,
});
const DeleteAccountModal = dynamic(() => import('components/admin/DeleteAccountModal'), {
  ssr: false,
});
const EditUserModal = dynamic(() => import('components/modals/EditUserModal'), { ssr: false });
const RegisterUserModal = dynamic(() => import('components/modals/RegisterUserModal'), {
  ssr: false,
});
import { useToast } from 'components/toast/ToastContext';
import { useProfile } from 'contexts/ProfileContext';
import type { AccountStatus, AdminUserRow } from 'types/auth';
import type { SectionRow } from 'models/SectionRepository';
import { getSupabaseBrowserClient } from 'config/supabase/client';
import { formatSriLankaDateTime, sriLankaTodayInput } from 'lib/datetime';
import { fetchClientSections } from 'lib/sectionsClient';

export function broadcastAdminSync(type: 'ACCOUNTS_UPDATED' | 'SECTIONS_UPDATED' = 'ACCOUNTS_UPDATED') {
  if (typeof window !== 'undefined') {
    if ('BroadcastChannel' in window) {
      try {
        const bc = new BroadcastChannel('spid_admin_sync');
        bc.postMessage({ type, timestamp: Date.now() });
        setTimeout(() => {
          try { bc.close(); } catch {}
        }, 1000);
      } catch {}
    }
    try {
      localStorage.setItem('spid_admin_sync', `${type}_${Date.now()}`);
    } catch {}
  }
}

const CONFIRM_KEYS: Record<
  'disable' | 'reject' | 'keep_locked',
  { title: string; description: string; confirmLabel: string }
> = {
  keep_locked: {
    title: 'modals.confirm.keepLockedTitle',
    description: 'modals.confirm.keepLockedDescription',
    confirmLabel: 'modals.confirm.keepLockedConfirm',
  },
  disable: {
    title: 'modals.confirm.disableTitle',
    description: 'modals.confirm.disableDescription',
    confirmLabel: 'modals.confirm.disableConfirm',
  },
  reject: {
    title: 'modals.confirm.rejectTitle',
    description: 'modals.confirm.rejectDescription',
    confirmLabel: 'modals.confirm.rejectConfirm',
  },
};

const STATUS_FILTERS: ('all' | AccountStatus)[] = [
  'all',
  'pending',
  'approved',
  'rejected',
  'disabled',
  'locked',
];

const STATUS_LABEL_KEYS: Record<'all' | AccountStatus, string> = {
  all: 'filters.allStatuses',
  pending: 'common:status.pending',
  approved: 'common:status.approved',
  rejected: 'common:status.rejected',
  disabled: 'status.disabled',
  locked: 'status.locked',
};

// Module-level in-memory cache so switching between the two directory routes is instant.
let memoryAccounts: AdminUserRow[] | null = null;
let memorySections: SectionRow[] | null = null;
let memoryMeId: string | null = null;
let memoryLastFetched = 0;
let memorySignature = '';
const loadedVariants = new Set<'admin' | 'staff'>();
const CACHE_TTL_MS = 30_000;

/** After this long the skeleton stops and the user is offered a retry. */
export const DIRECTORY_LOAD_TIMEOUT_MS = 30_000;
const DIRECTORY_LOAD_TIMEOUT_SECONDS = DIRECTORY_LOAD_TIMEOUT_MS / 1000;

/** Signature of every field the table renders, so identical background polls skip re-rendering. */
function accountsSignature(rows: AdminUserRow[]): string {
  let signature = '';
  for (const row of rows) {
    signature += `${row.id}\u0001${row.full_name}\u0001${row.email}\u0001${row.role}\u0001${
      row.account_status
    }\u0001${row.section_id ?? ''}\u0001${row.section_name ?? ''}\u0001${row.mobile_phone ?? ''}\u0001${
      row.nic ?? ''
    }\u0001${row.last_login_at ?? ''}\u0001${row.locked_until ?? ''}\u0001${
      row.failed_attempts
    }\u0001${row.avatar_url ?? ''}\u0002`;
  }
  return signature;
}

/** A lock can be permanent or still counting down; `account_status` stays "approved". */
function isAccountLocked(acc: AdminUserRow): boolean {
  return (
    acc.is_permanently_locked === true ||
    (!!acc.locked_until && new Date(acc.locked_until).getTime() > Date.now())
  );
}

function getInitialAccounts(): AdminUserRow[] {
  if (memoryAccounts && memoryAccounts.length > 0) return memoryAccounts;
  if (typeof window !== 'undefined') {
    try {
      const stored = sessionStorage.getItem('spid_cached_accounts');
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed) && parsed.length > 0) {
          memoryAccounts = parsed;
          return parsed;
        }
      }
    } catch {}
  }
  return [];
}

export function invalidateAccountDirectoryCache() {
  memoryAccounts = null;
  memorySections = null;
  memoryLastFetched = 0;
  memorySignature = '';
  loadedVariants.clear();
  if (typeof window !== 'undefined') {
    try {
      sessionStorage.removeItem('spid_cached_accounts');
    } catch {}
  }
}

/** In-page loading banner. Owns its timer so the once-per-second tick re-renders only this card. */
function DirectoryLoadingBanner({ variant }: { variant: 'admin' | 'staff' }) {
  const { t } = useTranslation('accounts');
  const [seconds, setSeconds] = useState(0);

  useEffect(() => {
    const startedAt = Date.now();
    const timer = window.setInterval(() => {
      setSeconds(
        Math.min(DIRECTORY_LOAD_TIMEOUT_SECONDS, Math.floor((Date.now() - startedAt) / 1000))
      );
    }, 1000);
    return () => window.clearInterval(timer);
  }, []);

  const percent = Math.min(96, Math.round((seconds / DIRECTORY_LOAD_TIMEOUT_SECONDS) * 100));

  return (
    <div className="rounded-2xl border border-indigo-200 bg-indigo-50/70 p-4 dark:border-navy-600 dark:bg-navy-700">
      <div className="flex items-center gap-2 text-xs font-bold text-[#4318FF] dark:text-brand-300">
        <span
          aria-hidden="true"
          className="h-3.5 w-3.5 shrink-0 animate-spin rounded-full border-2 border-[#4318FF]/20 border-t-[#4318FF] dark:border-brand-300/20 dark:border-t-brand-300 motion-reduce:animate-none"
        />
        <span>
          {t(variant === 'admin' ? 'directory.loadingAdmin' : 'directory.loadingStaff')}
        </span>
        <span aria-hidden="true" className="ml-auto shrink-0 tabular-nums">
          {t('directory.elapsed', { seconds, total: DIRECTORY_LOAD_TIMEOUT_SECONDS })}
        </span>
      </div>
      <div
        role="progressbar"
        aria-label={t('directory.progressAria')}
        aria-valuemin={0}
        aria-valuemax={DIRECTORY_LOAD_TIMEOUT_SECONDS}
        aria-valuenow={Math.min(seconds, DIRECTORY_LOAD_TIMEOUT_SECONDS)}
        aria-valuetext={t('directory.progressValue', {
          seconds,
          total: DIRECTORY_LOAD_TIMEOUT_SECONDS,
        })}
        className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-indigo-100 dark:bg-navy-900"
      >
        <span
          aria-hidden="true"
          className="block h-full rounded-full bg-[#4318FF] shadow-[0_0_8px_rgba(67,24,255,0.35)] transition-[width] duration-500 ease-linear dark:bg-brand-300"
          style={{ width: `${percent}%` }}
        />
      </div>
      <p className="mt-2 text-[11px] font-medium text-slate-600 dark:text-gray-400">
        {t('directory.hint', { seconds: DIRECTORY_LOAD_TIMEOUT_SECONDS })}
      </p>
    </div>
  );
}

function LoadingStatusPill() {
  const { t } = useTranslation('accounts');
  return (
    <span
      role="status"
      className="flex items-center gap-1.5 rounded-full bg-indigo-50 dark:bg-navy-900 px-3 py-1.5 text-[10px] font-bold text-[#4318FF] dark:text-brand-300 border border-indigo-100 dark:border-navy-700 shadow-sm animate-pulse"
    >
      <span
        aria-hidden="true"
        className="h-2 w-2 animate-spin rounded-full border-2 border-[#4318FF]/20 border-t-[#4318FF] dark:border-brand-300/20 dark:border-t-brand-300 motion-reduce:animate-none"
      />
      {t('directory.loadingRegistry')}
    </span>
  );
}
/**
 * Full directory page shared by Admin Management (variant "admin") and
 * User Management (variant "staff"): header, KPI cards, filters, table,
 * and every action wired to the reusable feedback / edit / confirm modals.
 */
export default function AccountDirectoryPage({ variant }: { variant: 'admin' | 'staff' }) {
  const { t } = useTranslation('accounts');
  const copy = useMemo(
    () =>
      variant === 'admin'
        ? {
            crumbs: [
              t('page.crumbs.pages'),
              t('page.crumbs.systemManagement'),
              t('nav:menu.admin-management'),
            ],
            title: t('nav:menu.admin-management'),
            subtitle: t('page.admin.subtitle'),
            registerLabel: t('page.admin.registerLabel'),
            tableTitle: t('page.admin.tableTitle'),
            tableCaption: t('page.admin.tableCaption'),
            searchPlaceholder: t('page.admin.searchPlaceholder'),
            emptyMessage: t('page.admin.emptyMessage'),
            searchAria: t('page.admin.searchAria'),
          }
        : {
            crumbs: [
              t('page.crumbs.pages'),
              t('page.crumbs.systemManagement'),
              t('nav:menu.users'),
            ],
            title: t('nav:menu.users'),
            subtitle: t('page.staff.subtitle'),
            registerLabel: t('page.staff.registerLabel'),
            tableTitle: t('page.staff.tableTitle'),
            tableCaption: t('page.staff.tableCaption'),
            searchPlaceholder: t('page.staff.searchPlaceholder'),
            emptyMessage: t('page.staff.emptyMessage'),
            searchAria: t('page.staff.searchAria'),
          },
    [t, variant]
  );
  const { showToast } = useToast();
  const { profile } = useProfile();

  const [accounts, setAccounts] = useState<AdminUserRow[]>(getInitialAccounts);
  const [sections, setSections] = useState<SectionRow[]>(() => memorySections || []);
  const [meId, setMeId] = useState<string | null>(() => profile?.id ?? memoryMeId);
  const [isAdmin, setIsAdmin] = useState(() => profile?.role === 'Administrator' || memoryAccounts !== null);
  const hasCachedData = memoryAccounts !== null && memoryAccounts.length > 0;
  const isFirstMountForVariant = !loadedVariants.has(variant);
  const [listLoading, setListLoading] = useState(() => isFirstMountForVariant || !hasCachedData);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [loadTimedOut, setLoadTimedOut] = useState(false);
  const requestIdRef = useRef(0);
  const inFlightRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (profile?.id) {
      setMeId(profile.id);
      memoryMeId = profile.id;
    }
  }, [profile]);

  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [filterSection, setFilterSection] = useState<'all' | number>('all');
  const [filterStatus, setFilterStatus] = useState<'all' | AccountStatus | 'deleted' | 'locked'>(() => {
    // Notification deep links land on the locked tab directly.
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      if (params.get('locked') === '1' || params.get('locked') === 'true') return 'locked';
      // ?deleted=1 deep-links the deleted-accounts tab (restore flow).
      if (params.get('deleted') === '1' || params.get('deleted') === 'true') return 'deleted';
    }
    return 'all';
  });

  // Debounced so typing re-filters the table at most every 250ms instead of per keystroke.
  useEffect(() => {
    const timer = window.setTimeout(() => setSearch(searchInput.trim().toLowerCase()), 250);
    return () => window.clearTimeout(timer);
  }, [searchInput]);

  const [editUser, setEditUser] = useState<AdminUserRow | null>(null);
  const [showRegisterModal, setShowRegisterModal] = useState(false);

  const loadAccounts = useCallback(async (force = false, silent = false) => {
    const isCached = memoryAccounts !== null && memoryAccounts.length > 0;
    const isFresh = isCached && Date.now() - memoryLastFetched < CACHE_TTL_MS;

    // Background revalidation reuses a fresh cache and never overlaps a live
    // request. Forced syncs (realtime pushes, mutations) must always bypass it.
    if (silent && isFresh && !force) return;
    if (inFlightRef.current && !inFlightRef.current.signal.aborted && !force) return;

    if (!silent) {
      if (!isCached) {
        setListLoading(true);
        setLoadTimedOut(false);
      } else if (force) {
        setIsRefreshing(true);
      } else if (isFresh) {
        // Cached and fresh: paint immediately, no artificial skeleton flash.
        loadedVariants.add(variant);
        setListLoading(false);
        return;
      }
    }

    const requestId = ++requestIdRef.current;
    inFlightRef.current?.abort();
    const controller = new AbortController();
    inFlightRef.current = controller;
    let timedOut = false;
    const timeoutId = window.setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, DIRECTORY_LOAD_TIMEOUT_MS);

    try {
      const url = force ? '/api/admin/users?refresh=true' : '/api/admin/users';
      // Sections are reference data — they must never hold the user list hostage.
      const sectionsPromise = fetchClientSections(false).catch(() => [] as SectionRow[]);

      const usersRes = await fetch(url, {
        headers: { Accept: 'application/json' },
        signal: controller.signal,
      });
      const usersJson = await usersRes.json();
      if (requestId !== requestIdRef.current) return;

      if (usersRes.ok && usersJson.ok) {
        const nextUsers = usersJson.data.users as AdminUserRow[];
        const nextSignature = accountsSignature(nextUsers);
        const dataChanged = nextSignature !== memorySignature;

        memoryAccounts = nextUsers;
        memoryLastFetched = Date.now();
        memorySignature = nextSignature;
        // Background polls that return identical data must not re-render the table.
        if (dataChanged || !silent) {
          setAccounts(nextUsers);
        }
        setIsAdmin(true);
        setLoadTimedOut(false);
        loadedVariants.add(variant);

        // Persist only on user-visible loads; background polls skip the serialization cost.
        if (!silent && typeof window !== 'undefined') {
          try {
            sessionStorage.setItem('spid_cached_accounts', JSON.stringify(nextUsers));
          } catch {}
        }
      } else if (!silent) {
        if (usersRes.status === 401 || usersRes.status === 403) {
          setIsAdmin(false);
        } else {
          showToast({
            type: 'error',
            title: t('feedback.loadFailedTitle'),
            message: usersJson.message || t('feedback.loadRegistryFailed'),
          });
        }
      }

      const secList = await sectionsPromise;
      if (requestId === requestIdRef.current && Array.isArray(secList) && secList.length > 0) {
        const nextSections = secList as unknown as SectionRow[];
        const sectionsChanged =
          !memorySections ||
          memorySections.length !== nextSections.length ||
          nextSections.some(
            (section, index) =>
              memorySections![index]?.id !== section.id || memorySections![index]?.name !== section.name
          );
        memorySections = nextSections;
        if (sectionsChanged) setSections(nextSections);
      }
    } catch (error) {
      if (requestId !== requestIdRef.current) return;
      if (timedOut) {
        setLoadTimedOut(true);
        showToast({
          type: 'error',
          title: t('feedback.timeoutTitle'),
          message: t('feedback.timeoutMessage', { seconds: DIRECTORY_LOAD_TIMEOUT_SECONDS }),
        });
      } else if ((error as { name?: string })?.name !== 'AbortError' && !isCached && !silent) {
        showToast({
          type: 'error',
          title: t('feedback.loadFailedTitle'),
          message: t('feedback.serverUnreachable'),
        });
      }
    } finally {
      window.clearTimeout(timeoutId);
      if (requestId === requestIdRef.current) {
        inFlightRef.current = null;
        setListLoading(false);
        setIsRefreshing(false);
      }
    }
  }, [showToast, t, variant]);

  const forceReload = useCallback(() => {
    broadcastAdminSync('ACCOUNTS_UPDATED');
    return loadAccounts(true);
  }, [loadAccounts]);

  const retryLoad = useCallback(() => {
    setLoadTimedOut(false);
    return loadAccounts(true);
  }, [loadAccounts]);

  // Realtime/broadcast events arrive in bursts (bulk imports, multi-tab edits).
  // Collapse a burst into one forced reload instead of one request per event.
  const syncTimerRef = useRef<number | null>(null);
  const realtimeActiveRef = useRef(false);

  const scheduleSyncReload = useCallback(() => {
    if (syncTimerRef.current !== null) return;
    syncTimerRef.current = window.setTimeout(() => {
      syncTimerRef.current = null;
      void loadAccounts(true, true);
    }, 400);
  }, [loadAccounts]);

  // Release the socket if the page unmounts mid-flight.
  useEffect(() => () => inFlightRef.current?.abort(), []);

  useEffect(
    () => () => {
      if (syncTimerRef.current !== null) window.clearTimeout(syncTimerRef.current);
    },
    []
  );

  // Latest rows kept in a ref so optimistic rollback does not force the action
  // pipeline (and therefore the memoized table) to re-create its callbacks.
  const accountsRef = useRef(accounts);
  useEffect(() => {
    accountsRef.current = accounts;
  }, [accounts]);

  // Optimistic UI updates: row updates immediately with 0ms delay!
  const handleOptimisticUpdate = useCallback((acc: AdminUserRow, action: AccountAction) => {
    const previous = accountsRef.current;
    if (action === 'delete') {
      // Soft delete: the row stays in the directory (Deleted tab) with its
      // records untouched — it only leaves the active lists.
      setAccounts((prev) =>
        prev.map((u) =>
          u.id === acc.id
            ? { ...u, is_deleted: true, deleted_at: new Date().toISOString(), account_status: 'disabled' }
            : u
        )
      );
    } else if (action === 'restore') {
      setAccounts((prev) =>
        prev.map((u) =>
          u.id === acc.id
            ? { ...u, is_deleted: false, deleted_at: null, account_status: 'pending' }
            : u
        )
      );
    } else if (action === 'approve' || action === 'enable') {
      setAccounts((prev) =>
        prev.map((u) => (u.id === acc.id ? { ...u, account_status: 'approved' } : u))
      );
    } else if (action === 'disable') {
      setAccounts((prev) =>
        prev.map((u) => (u.id === acc.id ? { ...u, account_status: 'disabled' } : u))
      );
    } else if (action === 'reject') {
      setAccounts((prev) =>
        prev.map((u) => (u.id === acc.id ? { ...u, account_status: 'rejected' } : u))
      );
    } else if (action === 'clear_lockout') {
      setAccounts((prev) =>
        prev.map((u) => (u.id === acc.id ? { ...u, locked_until: null, failed_attempts: 0 } : u))
      );
    } else if (action === 'approve_unlock') {
      setAccounts((prev) =>
        prev.map((u) =>
          u.id === acc.id
            ? {
                ...u,
                account_status: 'approved',
                locked_until: null,
                failed_attempts: 0,
                lockout_level: 0,
                is_permanently_locked: false,
                locked_at: null,
              }
            : u
        )
      );
    } else if (action === 'keep_locked') {
      setAccounts((prev) =>
        prev.map((u) => (u.id === acc.id ? { ...u, account_status: 'disabled' } : u))
      );
    }
    return () => {
      setAccounts(previous);
    };
  }, []);

  const { loadingId, feedback, setFeedback, request, confirmTarget, setConfirmTarget, run, saveProfile } =
    useAccountActions(forceReload, handleOptimisticUpdate);

  useEffect(() => {
    loadAccounts(false);

    // 1. Supabase Realtime Channel for live database changes (0ms instant push)
    let channel: any = null;
    try {
      const supabase = getSupabaseBrowserClient();
      channel = supabase
        .channel(`realtime:admin-directory-${variant}`)
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'profiles' },
          () => {
            scheduleSyncReload();
          }
        )
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'sections' },
          () => {
            scheduleSyncReload();
          }
        )
        .subscribe((status: string) => {
          realtimeActiveRef.current = status === 'SUBSCRIBED';
        });
    } catch (err) {
      console.warn('Realtime channel error:', err);
    }

    // 2. Cross-tab sync via BroadcastChannel (0ms multi-tab sync)
    let bc: BroadcastChannel | null = null;
    try {
      bc = new BroadcastChannel('spid_admin_sync');
      bc.onmessage = (event) => {
        if (event.data?.type === 'ACCOUNTS_UPDATED' || event.data?.type === 'SECTIONS_UPDATED') {
          scheduleSyncReload();
        }
      };
    } catch {}

    // 3. Storage event sync for multi-window guarantee
    const onStorage = (e: StorageEvent) => {
      if (e.key === 'spid_admin_sync') {
        scheduleSyncReload();
      }
    };
    window.addEventListener('storage', onStorage);

    // 4. Window focus and visibility revalidation
    const onFocus = () => void loadAccounts(false, true);
    const onVisibility = () => {
      if (document.visibilityState === 'visible') {
        void loadAccounts(false, true);
      }
    };
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVisibility);

    // 5. Background polling while the page is visible. Realtime already pushes
    // changes instantly, so when the socket is joined polling drops to once a
    // minute and only acts as a missed-event safety net.
    let tick = 0;
    const interval = setInterval(() => {
      if (typeof document !== 'undefined' && document.visibilityState === 'visible') {
        tick += 1;
        if (realtimeActiveRef.current && tick % 3 !== 0) return;
        void loadAccounts(false, true);
      }
    }, 20000);

    return () => {
      realtimeActiveRef.current = false;
      if (channel) {
        try {
          const supabase = getSupabaseBrowserClient();
          supabase.removeChannel(channel);
        } catch {}
      }
      if (bc) {
        try { bc.close(); } catch {}
      }
      window.removeEventListener('storage', onStorage);
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onVisibility);
      clearInterval(interval);
    };
  }, [loadAccounts, variant, scheduleSyncReload]);

  const scoped = useMemo(
    () => {
      if (variant === 'admin') {
        return accounts.filter(
          (a) => a.role === 'Administrator' || (a.account_status === 'pending' && a.requested_role === 'Administrator')
        );
      } else {
        return accounts.filter(
          (a) => a.role === 'Staff' && !(a.account_status === 'pending' && a.requested_role === 'Administrator')
        );
      }
    },
    [accounts, variant]
  );

  // One lowercase haystack per row, rebuilt only when the scoped list changes,
  // so each keystroke costs O(n) substring checks instead of lower-casing four fields.
  const searchIndex = useMemo(() => {
    if (!search) return null;
    const index = new Map<string, string>();
    for (const acc of scoped) {
      // The retired address is kept searchable so a deleted account is still
      // found by the email it used.
      index.set(
        acc.id,
        `${acc.full_name}\n${acc.email}\n${acc.original_email ?? ''}\n${acc.section_name ?? ''}\n${acc.nic ?? ''}`.toLowerCase()
      );
    }
    return index;
  }, [scoped, search]);

  const lockedCount = useMemo(
    () => scoped.filter((acc) => isAccountLocked(acc)).length,
    [scoped]
  );

  const deletedCount = useMemo(
    () => scoped.filter((acc) => acc.is_deleted === true).length,
    [scoped]
  );

  const filtered = useMemo(
    () =>
      scoped.filter((acc) => {
        const matchSearch = !searchIndex || (searchIndex.get(acc.id) ?? '').includes(search);
        const matchSection = filterSection === 'all' || acc.section_id === filterSection;
        const isDeleted = acc.is_deleted === true;
        // Deleted accounts are their own tab: they never appear among the
        // active rows, and every other status filter hides them.
        if (filterStatus === 'deleted') {
          return matchSearch && matchSection && isDeleted;
        }
        if (isDeleted) return false;
        // A lockout is orthogonal to account_status (a locked account is still
        // "approved"), so the locked tab keys off the lock fields themselves.
        const matchStatus =
          filterStatus === 'all' ||
          (filterStatus === 'locked'
            ? isAccountLocked(acc)
            : acc.account_status === filterStatus);
        return matchSearch && matchSection && matchStatus;
      }),
    [scoped, searchIndex, search, filterSection, filterStatus]
  );

  const stats = useMemo(() => {
    let approved = 0;
    let pending = 0;
    let disabled = 0;
    for (const account of scoped) {
      // Deleted accounts are excluded from every active count.
      if (account.is_deleted === true) continue;
      if (account.account_status === 'approved') approved += 1;
      else if (account.account_status === 'pending') pending += 1;
      else if (account.account_status === 'disabled' || account.account_status === 'rejected') disabled += 1;
    }
    const total = scoped.filter((account) => account.is_deleted !== true).length;
    const pct = total === 0 ? '0%' : `${Math.round((approved / total) * 100)}%`;
    return { total, approved, pending, disabled, pct };
  }, [scoped]);

  // Section options are re-mapped on every parent render otherwise (e.g. each keystroke).
  const sectionOptions = useMemo(
    () => sections.map((section) => ({ id: section.id, name: section.name })),
    [sections]
  );

  // Pending requests may only move to an active, approved staff member.
  const reassignCandidates = useMemo(
    () =>
      accounts.filter(
        (acc) =>
          acc.is_deleted !== true &&
          acc.account_status === 'approved' &&
          (acc.role === 'Staff' || acc.role === 'Administrator')
      ),
    [accounts]
  );

  const isProtectedRow = (acc: AdminUserRow) =>
    attributedName(acc.email).toLowerCase() === PRIMARY_ADMIN_EMAIL &&
    acc.role === 'Administrator';

  const handleEditSave = async (payload: {
    full_name: string;
    section_id: number | null;
    mobile_phone?: string;
    role?: string;
    status?: string;
  }) => {
    if (!editUser) return;
    const ok = await saveProfile(editUser, payload);
    if (ok) setEditUser(null);
  };

  // Deleting an account uses its own dialog: it previews what is kept and asks
  // what should happen to pending requests before the account is retired.
  const confirm =
    confirmTarget && confirmTarget.action !== 'delete'
      ? CONFIRM_KEYS[confirmTarget.action as 'disable' | 'reject' | 'keep_locked']
      : null;

  // Export to Excel (CSV with UTF-8 BOM)
  const handleExportExcel = () => {
    const list = isAdmin ? filtered : [];
    if (!list.length) {
      showToast({
        type: 'error',
        title: t('feedback.exportEmptyTitle'),
        message: t('feedback.exportEmptyMessage'),
      });
      return;
    }

    const headers = [
      t('table.columns.index'),
      t('table.columns.userId'),
      t('table.columns.fullName'),
      t('table.columns.role'),
      t('table.columns.email'),
      t('table.columns.mobilePhone'),
      t('table.columns.departmentSection'),
      t('table.columns.accountStatus'),
      t('table.columns.lastLogin')
    ];

    const rows = list.map((u, i) => [
      i + 1,
      `"${u.id}"`,
      `"${attributedNameText(u.full_name, {
        deleted: u.is_deleted === true,
        label: t('common:deletedUser'),
      }).replace(/"/g, '""')}"`,
      `"${u.role}"`,
      `"${isReservedDeletedEmail(u.email) ? u.original_email ?? '' : u.email}"`,
      `"${u.mobile_phone || ''}"`,
      `"${(u.section_name || t('table.unassigned')).replace(/"/g, '""')}"`,
      `"${u.is_deleted === true ? 'deleted' : u.account_status}"`,
      `"${u.last_login_at ? formatSriLankaDateTime(u.last_login_at) : t('table.never')}"`
    ]);

    const csvContent = '\uFEFF' + [headers.join(','), ...rows.map(r => r.join(','))].join('\r\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    const dateStr = sriLankaTodayInput();
    link.href = url;
    link.download = `SPID_${variant === 'admin' ? 'Administrators' : 'Staff_Directory'}_${dateStr}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    showToast({
      type: 'success',
      title: t('feedback.exportSuccessTitle'),
      message: t('feedback.exportSuccessMessage'),
    });
  };

  // Print to PDF (Opens print-ready window)
  const handlePrintPDF = () => {
    const list = isAdmin ? filtered : [];
    if (!list.length) {
      showToast({
        type: 'error',
        title: t('feedback.printEmptyTitle'),
        message: t('feedback.printEmptyMessage'),
      });
      return;
    }

    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      showToast({
        type: 'error',
        title: t('feedback.popupBlockedTitle'),
        message: t('feedback.popupBlockedMessage'),
      });
      return;
    }

    const titleText =
      variant === 'admin' ? t('directory.printRosterTitle') : t('directory.printDirectoryTitle');
    const dateStr = formatSriLankaDateTime(new Date());

    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <title>${titleText}</title>
          <style>
            body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; padding: 24px; color: #1e293b; }
            .header { display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #4318FF; padding-bottom: 12px; margin-bottom: 20px; }
            .logo-title { font-size: 20px; font-weight: 800; color: #1e293b; }
            .sub { font-size: 11px; color: #64748b; font-weight: 600; text-transform: uppercase; }
            .meta { font-size: 11px; color: #64748b; text-align: right; }
            table { width: 100%; border-collapse: collapse; font-size: 11px; margin-top: 10px; }
            th { background: #f1f5f9; text-align: left; padding: 8px 10px; border-bottom: 1px solid #cbd5e1; font-weight: 700; color: #0f172a; text-transform: uppercase; font-size: 10px; }
            td { padding: 8px 10px; border-bottom: 1px solid #e2e8f0; }
            .status-approved { color: #15803d; font-weight: 700; }
            .status-disabled { color: #c2410c; font-weight: 700; }
            .status-pending { color: #b45309; font-weight: 700; }
            @media print {
              body { padding: 0; }
              @page { size: landscape; margin: 12mm; }
            }
          </style>
        </head>
        <body>
          <div class="header">
            <div>
              <div class="logo-title">${titleText}</div>
              <div class="sub">${t('directory.printSubtitle')}</div>
            </div>
            <div class="meta">
              <div>${t('directory.printTotal', { total: `<strong>${list.length}</strong>` })}</div>
              <div>${t('directory.printGenerated', { date: dateStr })}</div>
            </div>
          </div>
          <table>
            <thead>
              <tr>
                <th style="width: 30px;">#</th>
                <th>${t('table.columns.fullName')}</th>
                <th>${t('table.columns.role')}</th>
                <th>${t('table.columns.email')}</th>
                <th>${t('table.columns.phone')}</th>
                <th>${t('table.columns.departmentSection')}</th>
                <th>${t('common:labels.status')}</th>
              </tr>
            </thead>
            <tbody>
              ${list.map((u, i) => `
                <tr>
                  <td>${i + 1}</td>
                  <td><strong>${attributedNameText(u.full_name, { deleted: u.is_deleted === true, label: t('common:deletedUser') })}</strong></td>
                  <td>${u.role}</td>
                  <td>${isReservedDeletedEmail(u.email) ? u.original_email ?? '—' : u.email}</td>
                  <td>${u.mobile_phone || '—'}</td>
                  <td>${u.section_name || t('table.unassigned')}</td>
                  <td class="status-${u.is_deleted === true ? 'deleted' : u.account_status}">${(u.is_deleted === true ? 'deleted' : u.account_status).toUpperCase()}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
          <script>
            window.onload = function() {
              window.print();
            };
          </script>
        </body>
      </html>
    `;

    printWindow.document.open();
    printWindow.document.write(html);
    printWindow.document.close();
  };

  const statCards =
    variant === 'admin'
      ? [
          { icon: MdAdminPanelSettings, tone: 'purple' as const, label: t('users.stats.totalAdmins'), value: stats.total, pill: t('users.stats.totalAdminsPill'), sub: undefined },
          { icon: FiCheckCircle, tone: 'green' as const, label: t('users.stats.approvedActive'), value: stats.approved, pill: stats.pct, sub: t('users.stats.approvedActiveSub') },
          { icon: FiUserCheck, tone: 'blue' as const, label: t('users.stats.pendingApprove'), value: stats.pending, pill: t('users.stats.pendingApprovePill'), sub: t('users.stats.pendingApproveSub') },
          { icon: FiUserX, tone: 'red' as const, label: t('users.stats.disabledSuspended'), value: stats.disabled, pill: t('users.stats.disabledSuspendedPill'), sub: t('users.stats.disabledSuspendedSub') },
        ]
      : [
          { icon: FiShield, tone: 'purple' as const, label: t('users.stats.totalRegistered'), value: stats.total, pill: t('users.stats.totalRegisteredPill'), sub: t('users.stats.totalRegisteredSub') },
          { icon: FiCheckCircle, tone: 'green' as const, label: t('users.stats.approvedStaff'), value: stats.approved, pill: stats.pct, sub: t('users.stats.approvedStaffSub') },
          { icon: FiUserCheck, tone: 'blue' as const, label: t('users.stats.pendingActivation'), value: stats.pending, pill: t('users.stats.pendingActivationPill'), sub: t('users.stats.pendingActivationSub') },
          { icon: FiUserX, tone: 'red' as const, label: t('users.stats.disabledInactive'), value: stats.disabled, pill: t('users.stats.disabledInactivePill'), sub: t('users.stats.disabledInactiveSub') },
        ];

  return (
    <div className="mt-3 flex flex-col gap-5" aria-busy={listLoading}>
      <p className="sr-only" role="status" aria-live="polite">
        {listLoading
          ? t(
              variant === 'admin'
                ? 'directory.srLoadingAdmin'
                : 'directory.srLoadingStaff'
            )
          : loadTimedOut
          ? t('directory.srTimedOut')
          : t('directory.srLoaded', { count: scoped.length })}
      </p>
      <PageHeader
        crumbs={copy.crumbs}
        title={copy.title}
        subtitle={copy.subtitle}
        right={
          <>
            {listLoading ? (
              <LoadingStatusPill />
            ) : isRefreshing ? (
              <span
                role="status"
                className="flex items-center gap-1.5 rounded-full bg-amber-50 dark:bg-amber-900/30 px-3 py-1.5 text-[10px] font-bold text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800 shadow-sm"
              >
                <span
                  aria-hidden="true"
                  className="h-2 w-2 animate-spin rounded-full border-2 border-amber-500/20 border-t-amber-600 motion-reduce:animate-none"
                />
                {t('directory.syncing')}
              </span>
            ) : variant === 'admin' ? (
              <span className="flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1.5 text-[10px] font-bold text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400">
                <span aria-hidden="true" className="relative flex h-2 w-2">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60 motion-reduce:animate-none" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
                </span>
                {t('directory.auditActive')}
              </span>
            ) : null}
            <button
              type="button"
              onClick={() => setShowRegisterModal(true)}
              aria-label={copy.registerLabel}
              data-testid="add-admin-btn"
              className="flex items-center gap-2 rounded-xl bg-[#4318FF] px-4 py-2.5 text-xs font-bold text-white shadow-md shadow-[#4318FF]/25 transition-all hover:bg-brand-600 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4318FF] focus-visible:ring-offset-2 cursor-pointer"
            >
              <FiUserPlus aria-hidden="true" className="h-3.5 w-3.5" /> {copy.registerLabel}
            </button>
          </>
        }
      />

      {/* 30s Loading Indicator Banner */}
      {(listLoading || isRefreshing) && (
        <DirectoryLoadingBanner variant={variant} />
      )}

      {/* KPI Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {statCards.map(({ icon, tone, label, value, pill, sub }) => (
          <StatCard key={label} icon={icon} tone={tone} label={label} value={value} pill={pill} sub={sub} loading={listLoading} />
        ))}
      </div>

      {/* Account / Locked / Deleted tabs with live badges */}
      {isAdmin && (
        <div
          role="tablist"
          aria-label={t('lockedPanel.tabsAria')}
          className="flex flex-wrap items-center gap-2"
        >
          <button
            type="button"
            role="tab"
            aria-selected={filterStatus !== 'locked' && filterStatus !== 'deleted'}
            onClick={() => setFilterStatus('all')}
            className={`rounded-xl px-4 py-2 text-xs font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4318FF] ${
              filterStatus !== 'locked' && filterStatus !== 'deleted'
                ? 'bg-[#4318FF] text-white shadow-md shadow-[#4318FF]/25'
                : 'border border-slate-300 bg-white text-slate-700 hover:border-[#4318FF] hover:text-[#4318FF] dark:border-navy-600 dark:bg-navy-800 dark:text-gray-200'
            }`}
          >
            {t('lockedPanel.allAccounts')}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={filterStatus === 'locked'}
            onClick={() => setFilterStatus('locked')}
            className={`flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-600 ${
              filterStatus === 'locked'
                ? 'bg-red-600 text-white shadow-md shadow-red-600/25'
                : 'border border-red-200 bg-white text-red-700 hover:border-red-400 hover:bg-red-50 dark:border-red-900 dark:bg-navy-800 dark:text-red-300'
            }`}
          >
            <FiLock aria-hidden="true" className="h-3.5 w-3.5" />
            <span className="break-words">{t('lockedPanel.tabLabel')}</span>
            <span
              className={`inline-flex min-w-[1.5rem] justify-center rounded-full px-1.5 py-0.5 text-[10px] font-extrabold ${
                filterStatus === 'locked'
                  ? 'bg-white/20 text-white'
                  : 'bg-red-100 text-red-700 dark:bg-red-950/50 dark:text-red-300'
              }`}
              aria-label={t('lockedPanel.badgeAria', { count: lockedCount })}
            >
              {lockedCount}
            </span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={filterStatus === 'deleted'}
            onClick={() => setFilterStatus('deleted')}
            className={`flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-500 ${
              filterStatus === 'deleted'
                ? 'bg-slate-700 text-white shadow-md shadow-slate-700/25'
                : 'border border-slate-300 bg-white text-slate-700 hover:border-slate-500 dark:border-navy-600 dark:bg-navy-800 dark:text-gray-200'
            }`}
          >
            <FiTrash2 aria-hidden="true" className="h-3.5 w-3.5" />
            <span className="break-words">{t('filters.deletedTab')}</span>
            <span
              className={`inline-flex min-w-[1.5rem] justify-center rounded-full px-1.5 py-0.5 text-[10px] font-extrabold ${
                filterStatus === 'deleted'
                  ? 'bg-white/20 text-white'
                  : 'bg-slate-100 text-slate-700 dark:bg-navy-900 dark:text-gray-300'
              }`}
              aria-label={t('filters.deletedCount', { count: deletedCount })}
            >
              {deletedCount}
            </span>
          </button>
        </div>
      )}

      {/* Filters & Search */}
      {isAdmin && (
        <div className="rounded-2xl bg-white p-4 shadow-md shadow-shadow-500 dark:bg-navy-700 dark:shadow-none">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
            <div className="flex h-10 w-full items-center gap-2 rounded-xl bg-[#f4f7fe] px-3 dark:bg-navy-900 lg:max-w-sm border border-slate-300 dark:border-navy-700">
              <FiSearch className="h-4 w-4 shrink-0 text-slate-700 dark:text-gray-300" aria-hidden="true" />
              <input
                type="search"
                id="directory-search"
                aria-label={copy.searchAria}
                placeholder={copy.searchPlaceholder}
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                style={{ backgroundColor: 'transparent' }}
                className="h-full w-full !bg-transparent text-xs font-bold text-slate-950 outline-none placeholder:text-slate-600 placeholder:font-medium focus-visible:ring-2 focus-visible:ring-[#4318FF]/40 rounded dark:!bg-transparent dark:text-white dark:placeholder:text-gray-400"
              />
            </div>
            <div className="flex flex-1 flex-wrap items-center gap-2 lg:justify-end">
              <select
                value={filterSection === 'all' ? 'all' : String(filterSection)}
                onChange={(e) =>
                  setFilterSection(e.target.value === 'all' ? 'all' : Number(e.target.value))
                }
                aria-label={t('filters.departmentAria')}
                className="h-9 rounded-xl bg-[#f4f7fe] px-3 text-xs font-extrabold text-slate-950 outline-none border border-slate-300 dark:border-navy-700 dark:bg-navy-900 dark:text-gray-200 cursor-pointer focus-visible:ring-2 focus-visible:ring-[#4318FF]/40"
              >
                <option value="all">{t('filters.allDepartments')}</option>
                {sectionOptions.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
              <select
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value as 'all' | AccountStatus)}
                aria-label={t('filters.statusAria')}
                className="h-9 rounded-xl bg-[#f4f7fe] px-3 text-xs font-extrabold text-slate-950 outline-none border border-slate-300 dark:border-navy-700 dark:bg-navy-900 dark:text-gray-200 cursor-pointer focus-visible:ring-2 focus-visible:ring-[#4318FF]/40"
              >
                {STATUS_FILTERS.map((s) => (
                  <option key={s} value={s}>
                    {t(STATUS_LABEL_KEYS[s])}
                  </option>
                ))}
              </select>
              {/* Export to Excel Button */}
              <button
                type="button"
                onClick={handleExportExcel}
                className="flex h-9 items-center gap-1.5 rounded-xl bg-[#f4f7fe] px-3 border border-slate-300 dark:border-navy-700 text-xs font-bold text-slate-800 transition-all hover:text-[#4318FF] hover:border-[#4318FF] dark:bg-navy-900 dark:text-gray-200 cursor-pointer shadow-sm active:scale-95"
                title={t('directory.exportTitle')} aria-label={t('directory.exportAria')}
              >
                <FiDownload className="h-3.5 w-3.5 text-emerald-600" />
                <span className="hidden sm:inline">{t('directory.exportLabel')}</span>
              </button>

              {/* Print to PDF Button */}
              <button
                type="button"
                onClick={handlePrintPDF}
                className="flex h-9 items-center gap-1.5 rounded-xl bg-[#f4f7fe] px-3 border border-slate-300 dark:border-navy-700 text-xs font-bold text-slate-800 transition-all hover:text-[#4318FF] hover:border-[#4318FF] dark:bg-navy-900 dark:text-gray-200 cursor-pointer shadow-sm active:scale-95"
                title={t('directory.printTitle')} aria-label={t('directory.printAria')}
              >
                <FiPrinter className="h-3.5 w-3.5 text-[#4318FF]" />
                <span className="hidden sm:inline">{t('directory.printLabel')}</span>
              </button>

              <button
                type="button"
                onClick={() => loadAccounts(true)}
                disabled={listLoading || isRefreshing}
                aria-label={t('directory.refreshAria')}
                aria-busy={listLoading || isRefreshing}
                className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#f4f7fe] border border-slate-300 dark:border-navy-700 text-slate-900 transition-colors hover:text-[#4318FF] hover:border-[#4318FF] dark:bg-navy-900 dark:text-gray-200 cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4318FF] focus-visible:ring-offset-1"
                title={
                  listLoading || isRefreshing
                    ? t('directory.refreshing')
                    : t('common:buttons.refresh')
                }
              >
                <FiRefreshCw
                  aria-hidden="true"
                  className={`h-3.5 w-3.5 ${
                    listLoading || isRefreshing ? 'animate-spin text-[#4318FF] motion-reduce:animate-none' : ''
                  }`}
                />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Permission notice for non-admins */}
      {!isAdmin && !listLoading && (
        <div className="flex items-center gap-2 rounded-xl border border-amber-300 bg-amber-50 p-3 dark:border-amber-700 dark:bg-amber-900/20">
          <MdAdminPanelSettings className="h-5 w-5 shrink-0 text-amber-600 dark:text-amber-400" />
          <p className="text-xs text-amber-700 dark:text-amber-400">
            {t('directory.adminOnly')}
          </p>
        </div>
      )}

      {/* Timed-out load: keep whatever is on screen and offer an explicit retry */}
      {loadTimedOut && (
        <div
          role="alert"
          className="flex flex-col gap-3 rounded-2xl border border-red-300 bg-red-50 p-4 dark:border-red-800 dark:bg-red-950/30 sm:flex-row sm:items-center sm:justify-between"
        >
          <div className="flex items-start gap-3">
            <FiAlertTriangle
              aria-hidden="true"
              className="mt-0.5 h-5 w-5 shrink-0 text-red-600 dark:text-red-400"
            />
            <div>
              <p className="text-sm font-bold text-red-800 dark:text-red-300">
                {t('directory.timeoutTitle')}
              </p>
              <p className="mt-0.5 text-xs font-medium text-red-700 dark:text-red-400">
                {t('directory.timeoutMessage', { seconds: DIRECTORY_LOAD_TIMEOUT_SECONDS })}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={retryLoad}
            className="flex shrink-0 items-center justify-center gap-1.5 rounded-xl bg-red-600 px-4 py-2 text-xs font-bold text-white shadow-sm transition-all hover:bg-red-700 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-600 focus-visible:ring-offset-2 cursor-pointer"
          >
            <FiRefreshCw aria-hidden="true" className="h-3.5 w-3.5" /> {t('directory.retry')}
          </button>
        </div>
      )}

      {/* Directory Table — the locked tab swaps in its own columns */}
      {isAdmin && filterStatus === 'locked' ? (
        <LockedAccountsTable
          rows={filtered}
          listLoading={listLoading}
          loadingId={loadingId}
          currentUserId={meId}
          onUnlock={(acc) => request(acc, 'approve_unlock')}
          onKeepLocked={(acc) => request(acc, 'keep_locked')}
        />
      ) : (
        <AccountTable
          rows={isAdmin ? filtered : []}
          listLoading={listLoading}
          loadingId={loadingId}
          title={copy.tableTitle}
          caption={copy.tableCaption}
          emptyMessage={copy.emptyMessage}
          variant={variant}
          currentUserId={meId}
          onAction={request}
          onEdit={setEditUser}
        />
      )}

      {/* Confirm (destructive actions) */}
      {confirmTarget && confirm && (
        <ConfirmActionModal
          title={t(confirm.title)}
          description={t(confirm.description, { name: attributedName(confirmTarget.acc.full_name) })}
          confirmLabel={t(confirm.confirmLabel)}
          tone="primary"
          loading={loadingId === confirmTarget.acc.id}
          onConfirm={() => run(confirmTarget.acc, confirmTarget.action as AccountAction)}
          onCancel={() => setConfirmTarget(null)}
        />
      )}

      {/* Soft delete: previews the records that are kept and the pending requests */}
      {confirmTarget?.action === 'delete' && (
        <DeleteAccountModal
          key={confirmTarget.acc.id}
          acc={confirmTarget.acc}
          reassignCandidates={reassignCandidates}
          loading={loadingId === confirmTarget.acc.id}
          onClose={() => setConfirmTarget(null)}
          onConfirm={(payload: DeletePayload) => run(confirmTarget.acc, 'delete', payload)}
        />
      )}

      {/* Edit Profile */}
      {editUser && (
        <EditUserModal
          key={editUser.id}
          user={editUser}
          variant={variant}
          sections={sections}
          saving={loadingId === editUser.id}
          isSelf={editUser.id === meId}
          isProtected={isProtectedRow(editUser)}
          onClose={() => setEditUser(null)}
          onSave={handleEditSave}
        />
      )}

      {/* Register New User / Admin Modal */}
      {showRegisterModal && (
        <RegisterUserModal
          variant={variant}
          sections={sections}
          onClose={() => setShowRegisterModal(false)}
          onSuccess={(msg) => {
            showToast({
              type: 'success',
              title:
                variant === 'admin'
                  ? t('feedback.adminRegisteredTitle')
                  : t('feedback.staffRegisteredTitle'),
              message: msg,
            });
            setFeedback({
              tone: 'success',
              icon: 'check',
              badge:
                variant === 'admin'
                  ? t('feedback.superTierBadge')
                  : t('feedback.personnelBadge'),
              title:
                variant === 'admin'
                  ? t('feedback.adminCreatedTitle')
                  : t('feedback.accountCreatedTitle'),
              description: msg,
            });
            broadcastAdminSync('ACCOUNTS_UPDATED');
            loadAccounts(true);
          }}
        />
      )}

      {/* Success / Failure Feedback */}
      <ActionFeedbackModal feedback={feedback} onClose={() => setFeedback(null)} />
    </div>
  );
}
