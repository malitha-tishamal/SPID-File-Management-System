'use client';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  FiUserPlus,
  FiDownload,
  FiShield,
  FiCheckCircle,
  FiUserCheck,
  FiUserX,
  FiSearch,
  FiRefreshCw,
} from 'react-icons/fi';
import { MdAdminPanelSettings } from 'react-icons/md';
import PageHeader from 'components/admin/PageHeader';
import StatCard from 'components/admin/StatCard';
import AccountTable, { PRIMARY_ADMIN_EMAIL } from 'components/admin/AccountTable';
import { useAccountActions, type AccountAction } from 'components/admin/useAccountActions';
import ActionFeedbackModal from 'components/modals/ActionFeedbackModal';
import ConfirmActionModal from 'components/modals/ConfirmActionModal';
import EditUserModal from 'components/modals/EditUserModal';
import { useToast } from 'components/toast/ToastContext';
import type { AccountStatus, AdminUserRow } from 'types/auth';
import type { SectionRow } from 'models/SectionRepository';

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

/**
 * Full directory page shared by Admin Management (variant "admin") and
 * User Management (variant "staff"): header, KPI cards, filters, table,
 * and every action wired to the reusable feedback / edit / confirm modals.
 */
export default function AccountDirectoryPage({ variant }: { variant: 'admin' | 'staff' }) {
  const copy = COPY[variant];
  const { showToast } = useToast();

  const [accounts, setAccounts] = useState<AdminUserRow[]>([]);
  const [sections, setSections] = useState<SectionRow[]>([]);
  const [meId, setMeId] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [listLoading, setListLoading] = useState(true);

  const [search, setSearch] = useState('');
  const [filterSection, setFilterSection] = useState<'all' | number>('all');
  const [filterRole, setFilterRole] = useState<'all' | 'Staff' | 'Administrator'>('all');
  const [filterStatus, setFilterStatus] = useState<'all' | AccountStatus>('all');

  const [editUser, setEditUser] = useState<AdminUserRow | null>(null);

  const loadAccounts = useCallback(async () => {
    setListLoading(true);
    try {
      const [usersRes, sectionsRes] = await Promise.all([
        fetch('/api/admin/users'),
        fetch('/api/sections'),
      ]);
      const usersJson = await usersRes.json();
      if (usersRes.ok && usersJson.ok) {
        setAccounts(usersJson.data.users);
        setIsAdmin(true);
      } else {
        setIsAdmin(false);
        if (usersRes.status !== 401) {
          showToast({
            type: 'error',
            title: 'Load Failed',
            message: usersJson.message || 'Could not load the personnel registry.',
          });
        }
      }
      if (sectionsRes.ok) {
        const sectionsJson = await sectionsRes.json();
        if (sectionsJson.ok) setSections(sectionsJson.data.sections);
      }
      const meRes = await fetch('/api/auth/me');
      if (meRes.ok) {
        const meJson = await meRes.json();
        if (meJson.ok) setMeId(meJson.data.profile?.id ?? null);
      }
    } catch {
      showToast({ type: 'error', title: 'Load Failed', message: 'Could not reach the server.' });
    } finally {
      setListLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const { loadingId, feedback, setFeedback, request, confirmTarget, setConfirmTarget, run, saveProfile } =
    useAccountActions(loadAccounts);

  useEffect(() => {
    loadAccounts();
  }, [loadAccounts]);

  const scoped = useMemo(
    () => (variant === 'admin' ? accounts.filter((a) => a.role === 'Administrator') : accounts),
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
        const matchRole = variant === 'admin' || filterRole === 'all' || acc.role === filterRole;
        const matchStatus = filterStatus === 'all' || acc.account_status === filterStatus;
        return matchSearch && matchSection && matchRole && matchStatus;
      }),
    [scoped, search, filterSection, filterRole, filterStatus, variant]
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

  const handleExport = () => {
    const header = ['Name', 'Email', 'Role', 'NIC', 'Section', 'Phone', 'Status', 'Registered', 'Last Login'];
    const escape = (v: string) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const lines = filtered.map((a) =>
      [
        a.full_name,
        a.email,
        a.role,
        a.nic || '',
        a.section_name || '',
        a.mobile_phone || '',
        a.account_status,
        a.created_at,
        a.last_login_at || 'Never',
      ]
        .map(escape)
        .join(',')
    );
    const csv = [header.map(escape).join(','), ...lines].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'spid-staff-roster.csv';
    link.click();
    URL.revokeObjectURL(url);
  };

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
            {variant === 'staff' && (
              <button
                onClick={handleExport}
                className="flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-xs font-bold text-gray-600 transition-colors hover:bg-gray-50 dark:border-navy-600 dark:bg-navy-700 dark:text-gray-300"
              >
                <FiDownload className="h-3.5 w-3.5" /> Export Roster
              </button>
            )}
            <Link
              href="/auth/register"
              className="flex items-center gap-2 rounded-xl bg-[#4318FF] px-4 py-2.5 text-xs font-bold text-white shadow-md shadow-shadow-500 transition-colors hover:bg-brand-600"
            >
              <FiUserPlus className="h-3.5 w-3.5" /> {copy.registerLabel}
            </Link>
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
            <div className="flex h-10 w-full items-center gap-2 rounded-xl bg-[#f4f7fe] px-3 dark:bg-navy-900 lg:max-w-sm">
              <FiSearch className="h-4 w-4 shrink-0 text-gray-400" />
              <input
                type="text"
                placeholder={copy.searchPlaceholder}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="h-full w-full bg-transparent text-xs text-navy-700 outline-none placeholder:text-gray-400 dark:text-white"
              />
            </div>
            <div className="flex flex-1 flex-wrap items-center gap-2 lg:justify-end">
              <select
                value={filterSection === 'all' ? 'all' : String(filterSection)}
                onChange={(e) =>
                  setFilterSection(e.target.value === 'all' ? 'all' : Number(e.target.value))
                }
                className="h-9 rounded-xl bg-[#f4f7fe] px-3 text-xs font-semibold text-gray-600 outline-none dark:bg-navy-900 dark:text-gray-300"
              >
                <option value="all">All Departments</option>
                {sections.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
              {variant === 'staff' && (
                <select
                  value={filterRole}
                  onChange={(e) => setFilterRole(e.target.value as 'all' | 'Staff' | 'Administrator')}
                  className="h-9 rounded-xl bg-[#f4f7fe] px-3 text-xs font-semibold text-gray-600 outline-none dark:bg-navy-900 dark:text-gray-300"
                >
                  <option value="all">All Roles</option>
                  <option value="Staff">Staff</option>
                  <option value="Administrator">Administrator</option>
                </select>
              )}
              <select
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value as 'all' | AccountStatus)}
                className="h-9 rounded-xl bg-[#f4f7fe] px-3 text-xs font-semibold text-gray-600 outline-none dark:bg-navy-900 dark:text-gray-300"
              >
                {STATUS_FILTERS.map((s) => (
                  <option key={s} value={s}>
                    {s === 'all' ? 'All Statuses' : s.charAt(0).toUpperCase() + s.slice(1)}
                  </option>
                ))}
              </select>
              <button
                onClick={loadAccounts}
                className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#f4f7fe] text-gray-500 transition-colors hover:text-[#4318FF] dark:bg-navy-900 dark:text-gray-400"
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

      {/* Success / Failure Feedback */}
      <ActionFeedbackModal feedback={feedback} onClose={() => setFeedback(null)} />
    </div>
  );
}
