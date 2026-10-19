'use client';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
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
} from 'react-icons/fi';
import { MdAdminPanelSettings } from 'react-icons/md';
import PageHeader from 'components/admin/PageHeader';
import StatCard from 'components/admin/StatCard';
import AccountTable, { PRIMARY_ADMIN_EMAIL } from 'components/admin/AccountTable';
import { useAccountActions, type AccountAction } from 'components/admin/useAccountActions';
import ActionFeedbackModal from 'components/modals/ActionFeedbackModal';
import ConfirmActionModal from 'components/modals/ConfirmActionModal';
import EditUserModal from 'components/modals/EditUserModal';
import RegisterUserModal from 'components/modals/RegisterUserModal';
import { useToast } from 'components/toast/ToastContext';
import type { AccountStatus, AdminUserRow } from 'types/auth';
import type { SectionRow } from 'models/SectionRepository';
import { getSupabaseBrowserClient } from 'config/supabase/client';

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

const CONFIRM_TEXT: Record<
  'disable' | 'reject' | 'delete',
  { title: string; description: (name: string) => string; confirmLabel: string }
> = {
  disable: {
    title: 'Disable Account?',
    description: (n) => `${n} will be signed out and blocked from the SPID system immediately.`,
    confirmLabel: 'Disable',
  },
  reject: {
    title: 'Reject Registration?',
    description: (n) => `${n} will be prevented from accessing the SPID system.`,
    confirmLabel: 'Reject',
  },
  delete: {
    title: 'Delete Account Permanently?',
    description: (n) =>
      `${n}'s credentials and records will be irrevocably removed. This action cannot be undone.`,
    confirmLabel: 'Delete Forever',
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

const COPY = {
  admin: {
    crumbs: ['Pages', 'System Management', 'Admin Management'],
    title: 'Admin Management',
    subtitle:
      'Manage system administrators, security clearance, approval workflows, and audit access.',
    registerLabel: 'Register New Administrator',
    tableTitle: 'Verified System Administrators',
    tableCaption: 'Security Clearance Level: Super-Tier / Level 4',
    searchPlaceholder: 'Search by Admin ID, Name, NIC, Email...',
    emptyMessage: 'No administrator accounts match your search/filter criteria.',
  },
  staff: {
    crumbs: ['Pages', 'System Management', 'User Management'],
    title: 'User Management',
    subtitle:
      'Manage registered staff members, field officers, departmental clerks, and institutional document access privileges across Southern Provincial Irrigation Department divisions.',
    registerLabel: 'Register New User / Staff',
    tableTitle: 'Staff & User Accounts',
    tableCaption: 'Registered Personnel Roster',
    searchPlaceholder: 'Search by User ID, Name, NIC, Mobile...',
    emptyMessage: 'No accounts match your search/filter criteria.',
  },
};

// Module-level in-memory cache to guarantee instantaneous navigation across routes
let memoryAccounts: AdminUserRow[] | null = null;
let memorySections: SectionRow[] | null = null;
let memoryMeId: string | null = null;
let memoryLastFetched = 0;
const CACHE_TTL_MS = 3_000; // 3s freshness; dynamic background revalidation

export function invalidateAccountDirectoryCache() {
  memoryAccounts = null;
  memorySections = null;
  memoryLastFetched = 0;
}

/**
 * Full directory page shared by Admin Management (variant "admin") and
 * User Management (variant "staff"): header, KPI cards, filters, table,
 * and every action wired to the reusable feedback / edit / confirm modals.
 */
export default function AccountDirectoryPage({ variant }: { variant: 'admin' | 'staff' }) {
  const copy = COPY[variant];
  const { showToast } = useToast();

  const [accounts, setAccounts] = useState<AdminUserRow[]>(() => memoryAccounts || []);
  const [sections, setSections] = useState<SectionRow[]>(() => memorySections || []);
  const [meId, setMeId] = useState<string | null>(() => memoryMeId);
  const [isAdmin, setIsAdmin] = useState(() => memoryAccounts !== null);
  const [listLoading, setListLoading] = useState(() => memoryAccounts === null);

  const [search, setSearch] = useState('');
  const [filterSection, setFilterSection] = useState<'all' | number>('all');
  const [filterStatus, setFilterStatus] = useState<'all' | AccountStatus>('all');

  const [editUser, setEditUser] = useState<AdminUserRow | null>(null);
  const [showRegisterModal, setShowRegisterModal] = useState(false);

  const loadAccounts = useCallback(async (force = false, silent = false) => {
    const isCached = memoryAccounts !== null;
    const isFresh = isCached && Date.now() - memoryLastFetched < CACHE_TTL_MS;

    if (!silent) {
      if (!isCached || force) {
        setListLoading(true);
      } else if (isFresh) {
        return;
      }
    }

    try {
      const ts = Date.now();
      const url = force ? `/api/admin/users?refresh=true&_t=${ts}` : `/api/admin/users?_t=${ts}`;
      
      // Parallelize: only fetch sections/me if not already in memory
      const promises: Promise<any>[] = [
        fetch(url, {
          cache: 'no-store',
          headers: { 'Cache-Control': 'no-cache, no-store, must-revalidate', Pragma: 'no-cache' },
        }),
      ];
      if (!memorySections) {
        promises.push(
          fetch(`/api/sections?_t=${ts}`, {
            cache: 'no-store',
            headers: { 'Cache-Control': 'no-cache, no-store, must-revalidate', Pragma: 'no-cache' },
          })
        );
      }
      if (!memoryMeId) {
        promises.push(fetch(`/api/auth/me?_t=${ts}`, { cache: 'no-store' }));
      }

      const results = await Promise.all(promises);
      const usersRes = results[0];
      const sectionsRes = !memorySections ? results[1] : null;
      const meRes = !memoryMeId ? (sectionsRes ? results[2] : results[1]) : null;

      const usersJson = await usersRes.json();
      if (usersRes.ok && usersJson.ok) {
        memoryAccounts = usersJson.data.users;
        memoryLastFetched = Date.now();
        setAccounts(usersJson.data.users);
        setIsAdmin(true);
      } else if (!silent) {
        setIsAdmin(false);
        if (usersRes.status !== 401) {
          showToast({
            type: 'error',
            title: 'Load Failed',
            message: usersJson.message || 'Could not load the personnel registry.',
          });
        }
      }
      if (sectionsRes && sectionsRes.ok) {
        const sectionsJson = await sectionsRes.json();
        if (sectionsJson.ok) {
          memorySections = sectionsJson.data.sections;
          setSections(sectionsJson.data.sections);
        }
      }
      if (meRes && meRes.ok) {
        const meJson = await meRes.json();
        if (meJson.ok) {
          memoryMeId = meJson.data.profile?.id ?? null;
          setMeId(memoryMeId);
        }
      }
    } catch {
      if (!isCached && !silent) {
        showToast({ type: 'error', title: 'Load Failed', message: 'Could not reach the server.' });
      }
    } finally {
      if (!silent) {
        setListLoading(false);
      }
    }
  }, [showToast]);

  const forceReload = useCallback(() => {
    broadcastAdminSync('ACCOUNTS_UPDATED');
    return loadAccounts(true);
  }, [loadAccounts]);

  // Optimistic UI updates: row updates immediately with 0ms delay!
  const handleOptimisticUpdate = useCallback((acc: AdminUserRow, action: AccountAction) => {
    const previous = [...accounts];
    if (action === 'delete') {
      setAccounts((prev) => prev.filter((u) => u.id !== acc.id));
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
    }
    return () => {
      setAccounts(previous);
    };
  }, [accounts]);

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
            void loadAccounts(true, true);
          }
        )
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'sections' },
          () => {
            void loadAccounts(true, true);
          }
        )
        .subscribe();
    } catch (err) {
      console.warn('Realtime channel error:', err);
    }

    // 2. Cross-tab sync via BroadcastChannel (0ms multi-tab sync)
    let bc: BroadcastChannel | null = null;
    try {
      bc = new BroadcastChannel('spid_admin_sync');
      bc.onmessage = (event) => {
        if (event.data?.type === 'ACCOUNTS_UPDATED' || event.data?.type === 'SECTIONS_UPDATED') {
          void loadAccounts(true, true);
        }
      };
    } catch {}

    // 3. Storage event sync for multi-window guarantee
    const onStorage = (e: StorageEvent) => {
      if (e.key === 'spid_admin_sync') {
        void loadAccounts(true, true);
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

    // 5. Intelligent background polling (every 20s only when page is active)
    const interval = setInterval(() => {
      if (typeof document !== 'undefined' && document.visibilityState === 'visible') {
        void loadAccounts(false, true);
      }
    }, 20000);

    return () => {
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
  }, [loadAccounts, variant]);

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

  const filtered = useMemo(
    () =>
      scoped.filter((acc) => {
        const q = search.toLowerCase();
        const matchSearch =
          acc.full_name.toLowerCase().includes(q) ||
          acc.email.toLowerCase().includes(q) ||
          (acc.section_name || '').toLowerCase().includes(q) ||
          (acc.nic || '').toLowerCase().includes(q);
        const matchSection = filterSection === 'all' || acc.section_id === filterSection;
        const matchStatus = filterStatus === 'all' || acc.account_status === filterStatus;
        return matchSearch && matchSection && matchStatus;
      }),
    [scoped, search, filterSection, filterStatus]
  );

  const stats = useMemo(() => {
    const total = scoped.length;
    const approved = scoped.filter((a) => a.account_status === 'approved').length;
    const pending = scoped.filter((a) => a.account_status === 'pending').length;
    const disabled = scoped.filter(
      (a) => a.account_status === 'disabled' || a.account_status === 'rejected'
    ).length;
    const pct = total === 0 ? '0%' : `${Math.round((approved / total) * 100)}%`;
    return { total, approved, pending, disabled, pct };
  }, [scoped]);

  const isProtectedRow = (acc: AdminUserRow) =>
    acc.email.toLowerCase() === PRIMARY_ADMIN_EMAIL && acc.role === 'Administrator';

  const handleEditSave = async (payload: {
    full_name: string;
    section_id: number | null;
    role?: string;
    status?: string;
  }) => {
    if (!editUser) return;
    const ok = await saveProfile(editUser, payload);
    if (ok) setEditUser(null);
  };

  const confirm = confirmTarget ? CONFIRM_TEXT[confirmTarget.action as 'disable' | 'reject' | 'delete'] : null;

  // Export to Excel (CSV with UTF-8 BOM)
  const handleExportExcel = () => {
    const list = isAdmin ? filtered : [];
    if (!list.length) {
      showToast({ type: 'error', title: 'Export Empty', message: 'No records to export.' });
      return;
    }

    const headers = [
      'Index',
      'User ID',
      'Full Name',
      'Role',
      'Email',
      'Mobile Phone',
      'Department / Section',
      'Account Status',
      'Last Login'
    ];

    const rows = list.map((u, i) => [
      i + 1,
      `"${u.id}"`,
      `"${(u.full_name || '').replace(/"/g, '""')}"`,
      `"${u.role}"`,
      `"${u.email}"`,
      `"${u.mobile_phone || ''}"`,
      `"${(u.section_name || 'Unassigned').replace(/"/g, '""')}"`,
      `"${u.account_status}"`,
      `"${u.last_login_at ? new Date(u.last_login_at).toLocaleString() : 'Never'}"`
    ]);

    const csvContent = '\uFEFF' + [headers.join(','), ...rows.map(r => r.join(','))].join('\r\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    const dateStr = new Date().toISOString().slice(0, 10);
    link.href = url;
    link.download = `SPID_${variant === 'admin' ? 'Administrators' : 'Staff_Directory'}_${dateStr}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    showToast({ type: 'success', title: 'Export Successful', message: 'Directory exported to Excel.' });
  };

  // Print to PDF (Opens print-ready window)
  const handlePrintPDF = () => {
    const list = isAdmin ? filtered : [];
    if (!list.length) {
      showToast({ type: 'error', title: 'Print Empty', message: 'No records to print.' });
      return;
    }

    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      showToast({ type: 'error', title: 'Popup Blocked', message: 'Please allow popups to print directory.' });
      return;
    }

    const titleText = variant === 'admin' ? 'SPID - Verified System Administrators Roster' : 'SPID - Staff & Personnel Directory';
    const dateStr = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });

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
              <div class="sub">Southern Provincial Irrigation Department • Official Personnel Record</div>
            </div>
            <div class="meta">
              <div>Total Records: <strong>${list.length}</strong></div>
              <div>Generated: ${dateStr}</div>
            </div>
          </div>
          <table>
            <thead>
              <tr>
                <th style="width: 30px;">#</th>
                <th>Full Name</th>
                <th>Role</th>
                <th>Email</th>
                <th>Phone</th>
                <th>Department / Section</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              ${list.map((u, i) => `
                <tr>
                  <td>${i + 1}</td>
                  <td><strong>${u.full_name}</strong></td>
                  <td>${u.role}</td>
                  <td>${u.email}</td>
                  <td>${u.mobile_phone || '—'}</td>
                  <td>${u.section_name || 'Unassigned'}</td>
                  <td class="status-${u.account_status}">${u.account_status.toUpperCase()}</td>
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
          { icon: MdAdminPanelSettings, tone: 'purple' as const, label: 'Total Administrators', value: stats.total, pill: 'Total', sub: undefined },
          { icon: FiCheckCircle, tone: 'green' as const, label: 'Approved & Active', value: stats.approved, pill: stats.pct, sub: 'Active & Operational' },
          { icon: FiUserCheck, tone: 'blue' as const, label: 'Pending Approve', value: stats.pending, pill: 'Action', sub: 'Requires Super-admin sign-off' },
          { icon: FiUserX, tone: 'red' as const, label: 'Disabled / Suspended', value: stats.disabled, pill: 'Alert', sub: 'Access revoking enforced' },
        ]
      : [
          { icon: FiShield, tone: 'purple' as const, label: 'Total Registered', value: stats.total, pill: 'Users', sub: 'All divisions' },
          { icon: FiCheckCircle, tone: 'green' as const, label: 'Approved Staff', value: stats.approved, pill: stats.pct, sub: 'Active' },
          { icon: FiUserCheck, tone: 'blue' as const, label: 'Pending Activation', value: stats.pending, pill: 'Action Req.', sub: 'Awaiting approval' },
          { icon: FiUserX, tone: 'red' as const, label: 'Disabled / Inactive', value: stats.disabled, pill: 'Restricted', sub: 'Sessions revoked' },
        ];

  return (
    <div className="mt-3 flex flex-col gap-5">
      <PageHeader
        crumbs={copy.crumbs}
        title={copy.title}
        subtitle={copy.subtitle}
        right={
          <>
            {variant === 'admin' && (
              <span className="flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1.5 text-[10px] font-bold text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400">
                <span className="relative flex h-2 w-2">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
                </span>
                AUDIT LOG SYNC: ACTIVE
              </span>
            )}
            <button
              type="button"
              onClick={() => setShowRegisterModal(true)}
              aria-label={copy.registerLabel}
              data-testid="add-admin-btn"
              className="flex items-center gap-2 rounded-xl bg-[#4318FF] px-4 py-2.5 text-xs font-bold text-white shadow-md shadow-[#4318FF]/25 transition-all hover:bg-brand-600 active:scale-95 cursor-pointer"
            >
              <FiUserPlus className="h-3.5 w-3.5" /> {copy.registerLabel}
            </button>
          </>
        }
      />

      {/* KPI Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {statCards.map(({ icon, tone, label, value, pill, sub }) => (
          <StatCard key={label} icon={icon} tone={tone} label={label} value={value} pill={pill} sub={sub} />
        ))}
      </div>

      {/* Filters & Search */}
      {isAdmin && (
        <div className="rounded-2xl bg-white p-4 shadow-md shadow-shadow-500 dark:bg-navy-700 dark:shadow-none">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
            <div className="flex h-10 w-full items-center gap-2 rounded-xl bg-[#f4f7fe] px-3 dark:bg-navy-900 lg:max-w-sm border border-slate-300 dark:border-navy-700">
              <FiSearch className="h-4 w-4 shrink-0 text-slate-700 dark:text-gray-300" />
              <input
                type="text"
                placeholder={copy.searchPlaceholder}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                style={{ backgroundColor: 'transparent' }}
                className="h-full w-full !bg-transparent text-xs font-bold text-slate-950 outline-none placeholder:text-slate-600 placeholder:font-medium dark:!bg-transparent dark:text-white dark:placeholder:text-gray-400"
              />
            </div>
            <div className="flex flex-1 flex-wrap items-center gap-2 lg:justify-end">
              <select
                value={filterSection === 'all' ? 'all' : String(filterSection)}
                onChange={(e) =>
                  setFilterSection(e.target.value === 'all' ? 'all' : Number(e.target.value))
                }
                className="h-9 rounded-xl bg-[#f4f7fe] px-3 text-xs font-extrabold text-slate-950 outline-none border border-slate-300 dark:border-navy-700 dark:bg-navy-900 dark:text-gray-200 cursor-pointer"
              >
                <option value="all">All Departments</option>
                {sections.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
              <select
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value as 'all' | AccountStatus)}
                className="h-9 rounded-xl bg-[#f4f7fe] px-3 text-xs font-extrabold text-slate-950 outline-none border border-slate-300 dark:border-navy-700 dark:bg-navy-900 dark:text-gray-200 cursor-pointer"
              >
                {STATUS_FILTERS.map((s) => (
                  <option key={s} value={s}>
                    {s === 'all' ? 'All Statuses' : s.charAt(0).toUpperCase() + s.slice(1)}
                  </option>
                ))}
              </select>
              {/* Export to Excel Button */}
              <button
                type="button"
                onClick={handleExportExcel}
                className="flex h-9 items-center gap-1.5 rounded-xl bg-[#f4f7fe] px-3 border border-slate-300 dark:border-navy-700 text-xs font-bold text-slate-800 transition-all hover:text-[#4318FF] hover:border-[#4318FF] dark:bg-navy-900 dark:text-gray-200 cursor-pointer shadow-sm active:scale-95"
                title="Export to Excel"
              >
                <FiDownload className="h-3.5 w-3.5 text-emerald-600" />
                <span className="hidden sm:inline">Export Excel</span>
              </button>

              {/* Print to PDF Button */}
              <button
                type="button"
                onClick={handlePrintPDF}
                className="flex h-9 items-center gap-1.5 rounded-xl bg-[#f4f7fe] px-3 border border-slate-300 dark:border-navy-700 text-xs font-bold text-slate-800 transition-all hover:text-[#4318FF] hover:border-[#4318FF] dark:bg-navy-900 dark:text-gray-200 cursor-pointer shadow-sm active:scale-95"
                title="Print to PDF"
              >
                <FiPrinter className="h-3.5 w-3.5 text-[#4318FF]" />
                <span className="hidden sm:inline">Print PDF</span>
              </button>

              <button
                onClick={() => loadAccounts(true)}
                className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#f4f7fe] border border-slate-300 dark:border-navy-700 text-slate-900 transition-colors hover:text-[#4318FF] hover:border-[#4318FF] dark:bg-navy-900 dark:text-gray-200 cursor-pointer"
                title="Refresh"
              >
                <FiRefreshCw className="h-3.5 w-3.5" />
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
            Only Administrators can view and manage the personnel registry.
          </p>
        </div>
      )}

      {/* Directory Table */}
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

      {/* Confirm (destructive actions) */}
      {confirmTarget && confirm && (
        <ConfirmActionModal
          title={confirm.title}
          description={confirm.description(confirmTarget.acc.full_name)}
          confirmLabel={confirm.confirmLabel}
          tone={confirmTarget.action === 'delete' ? 'danger' : 'primary'}
          loading={loadingId === confirmTarget.acc.id}
          onConfirm={() => run(confirmTarget.acc, confirmTarget.action as AccountAction)}
          onCancel={() => setConfirmTarget(null)}
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
              title: variant === 'admin' ? 'Administrator Registered' : 'Staff Member Registered',
              message: msg,
            });
            setFeedback({
              tone: 'success',
              icon: 'check',
              badge: variant === 'admin' ? 'Super-Tier Provisioned' : 'Personnel Activated',
              title: variant === 'admin' ? 'Administrator Created Successfully' : 'Account Created Successfully',
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
