'use client';
import React, { useEffect, useState, useCallback } from 'react';
import {
  MdPersonAdd,
  MdCheckCircle,
  MdCancel,
  MdPending,
  MdSearch,
  MdRefresh,
  MdAdminPanelSettings,
  MdBadge,
  MdPhone,
  MdEmail,
  MdVerifiedUser,
  MdBlock,
  MdLockReset,
  MdLock,
} from 'react-icons/md';
import { FiFilter } from 'react-icons/fi';
import { useToast } from 'components/toast/ToastContext';
import type { AccountStatus, AdminUserRow, UserRole } from 'types/auth';

const STATUS_CONFIG: Record<AccountStatus, {
  label: string;
  bg: string;
  text: string;
  dot: string;
  icon: any;
}> = {
  approved: {
    label: 'Approved',
    bg: 'bg-green-100 dark:bg-green-900/30',
    text: 'text-green-700 dark:text-green-400',
    dot: 'bg-green-500',
    icon: MdCheckCircle,
  },
  pending: {
    label: 'Pending',
    bg: 'bg-amber-100 dark:bg-amber-900/30',
    text: 'text-amber-700 dark:text-amber-400',
    dot: 'bg-amber-500',
    icon: MdPending,
  },
  rejected: {
    label: 'Rejected',
    bg: 'bg-red-100 dark:bg-red-900/30',
    text: 'text-red-700 dark:text-red-400',
    dot: 'bg-red-500',
    icon: MdCancel,
  },
  disabled: {
    label: 'Disabled',
    bg: 'bg-gray-200 dark:bg-gray-900/40',
    text: 'text-gray-700 dark:text-gray-400',
    dot: 'bg-gray-500',
    icon: MdBlock,
  },
  locked: {
    label: 'Locked',
    bg: 'bg-orange-100 dark:bg-orange-900/30',
    text: 'text-orange-700 dark:text-orange-400',
    dot: 'bg-orange-500',
    icon: MdLock,
  },
};

const ROLE_CONFIG = {
  Administrator: {
    bg: 'bg-purple-100 dark:bg-purple-900/30',
    text: 'text-purple-700 dark:text-purple-400',
  },
  Staff: {
    bg: 'bg-blue-100 dark:bg-blue-900/30',
    text: 'text-blue-700 dark:text-blue-400',
  },
};

const FILTER_STATUSES: ('all' | AccountStatus)[] = [
  'all',
  'pending',
  'approved',
  'rejected',
  'disabled',
  'locked',
];

const PRIMARY_ADMIN_EMAIL = 'officer@spid.gov.lk';

export default function UserManagementPage() {
  const { showToast } = useToast();
  const [accounts, setAccounts] = useState<AdminUserRow[]>([]);
  const [isAdmin, setIsAdmin] = useState(false);
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState<'all' | AccountStatus>('all');
  const [loading, setLoading] = useState<string | null>(null);
  const [listLoading, setListLoading] = useState(true);
  const [confirmAction, setConfirmAction] = useState<{
    id: string;
    name: string;
    action: 'approve' | 'reject' | 'disable' | 'enable' | 'clear_lockout';
  } | null>(null);

  const loadAccounts = useCallback(async () => {
    setListLoading(true);
    try {
      const res = await fetch('/api/admin/users');
      const json = await res.json();
      if (res.ok && json.ok) {
        setAccounts(json.data.users);
        setIsAdmin(true);
      } else {
        setIsAdmin(false);
        if (res.status !== 401) {
          showToast({
            type: 'error',
            title: 'Load Failed',
            message: json.message || 'Could not load the personnel registry.',
          });
        }
      }
    } catch {
      showToast({ type: 'error', title: 'Load Failed', message: 'Could not reach the server.' });
    } finally {
      setListLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    loadAccounts();
  }, [loadAccounts]);

  const filtered = accounts.filter((acc) => {
    const q = search.toLowerCase();
    const matchSearch =
      acc.full_name.toLowerCase().includes(q) ||
      acc.email.toLowerCase().includes(q) ||
      (acc.section_name || '').toLowerCase().includes(q) ||
      (acc.nic || '').toLowerCase().includes(q);
    const matchStatus = filterStatus === 'all' || acc.account_status === filterStatus;
    return matchSearch && matchStatus;
  });

  const stats = {
    total: accounts.length,
    approved: accounts.filter((a) => a.account_status === 'approved').length,
    pending: accounts.filter((a) => a.account_status === 'pending').length,
    rejected: accounts.filter((a) => a.account_status === 'rejected').length,
    disabled: accounts.filter((a) => a.account_status === 'disabled').length,
    locked: accounts.filter((a) => a.account_status === 'locked').length,
  };

  const isLockActive = (acc: AdminUserRow) =>
    !!acc.locked_until && new Date(acc.locked_until).getTime() > Date.now();

  const requestAction = (
    acc: AdminUserRow,
    action: 'approve' | 'reject' | 'disable' | 'enable' | 'clear_lockout'
  ) => {
    if (!isAdmin) {
      showToast({ type: 'error', title: 'Access Denied', message: 'Only Administrators can manage user accounts.' });
      return;
    }
    setConfirmAction({ id: acc.id, name: acc.full_name, action });
  };

  const executeAction = async () => {
    if (!confirmAction) return;
    const { id, name, action } = confirmAction;
    setLoading(id);
    setConfirmAction(null);

    try {
      const res = await fetch(`/api/admin/users/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      });
      const json = await res.json();

      if (res.ok && json.ok) {
        loadAccounts();
        const titles: Record<string, [string, 'success' | 'error' | 'warning']> = {
          approve: ['Account Approved', 'success'],
          reject: ['Account Rejected', 'warning'],
          disable: ['Account Disabled', 'warning'],
          enable: ['Account Enabled', 'success'],
          clear_lockout: ['Lockout Cleared', 'success'],
        };
        const [title, type] = titles[action];
        showToast({ type, title, message: json.message || `${name} updated.` });
      } else {
        showToast({
          type: 'error',
          title: 'Action Failed',
          message: json.message || 'Could not update the account. Please try again.',
        });
      }
    } catch {
      showToast({ type: 'error', title: 'Action Failed', message: 'Could not reach the server.' });
    } finally {
      setLoading(null);
    }
  };

  const handleRoleChange = async (acc: AdminUserRow, role: UserRole) => {
    if (role === acc.role) return;
    setLoading(acc.id);
    try {
      const res = await fetch(`/api/admin/users/${acc.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'set_role', role }),
      });
      const json = await res.json();
      if (res.ok && json.ok) {
        loadAccounts();
        showToast({ type: 'success', title: 'Role Updated', message: json.message });
      } else {
        showToast({
          type: 'error',
          title: 'Role Change Failed',
          message: json.message || 'Could not update the role.',
        });
      }
    } catch {
      showToast({ type: 'error', title: 'Role Change Failed', message: 'Could not reach the server.' });
    } finally {
      setLoading(null);
    }
  };

  const formatDate = (iso: string) => {
    try {
      return new Date(iso).toLocaleDateString('en-GB', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
      });
    } catch {
      return '—';
    }
  };

  const renderActionButtons = (acc: AdminUserRow) => (
    <div className="flex items-center gap-1.5 flex-wrap">
      {acc.account_status !== 'approved' && (
        <button
          onClick={() => requestAction(acc, 'approve')}
          className="flex items-center gap-1 rounded-lg bg-green-100 dark:bg-green-900/30 px-2.5 py-1 text-[11px] font-semibold text-green-700 dark:text-green-400 hover:bg-green-200 dark:hover:bg-green-900/50 transition-colors"
        >
          <MdCheckCircle className="h-3.5 w-3.5" />
          Approve
        </button>
      )}
      {acc.account_status !== 'rejected' && (
        <button
          onClick={() => requestAction(acc, 'reject')}
          className="flex items-center gap-1 rounded-lg bg-red-100 dark:bg-red-900/30 px-2.5 py-1 text-[11px] font-semibold text-red-600 dark:text-red-400 hover:bg-red-200 dark:hover:bg-red-900/50 transition-colors"
        >
          <MdBlock className="h-3.5 w-3.5" />
          Reject
        </button>
      )}
      {acc.account_status === 'approved' && (
        <button
          onClick={() => requestAction(acc, 'disable')}
          className="flex items-center gap-1 rounded-lg bg-gray-200 dark:bg-gray-900/40 px-2.5 py-1 text-[11px] font-semibold text-gray-700 dark:text-gray-300 hover:bg-gray-300 transition-colors"
        >
          <MdBlock className="h-3.5 w-3.5" />
          Disable
        </button>
      )}
      {acc.account_status === 'disabled' && (
        <button
          onClick={() => requestAction(acc, 'enable')}
          className="flex items-center gap-1 rounded-lg bg-green-100 dark:bg-green-900/30 px-2.5 py-1 text-[11px] font-semibold text-green-700 dark:text-green-400 hover:bg-green-200 transition-colors"
        >
          <MdCheckCircle className="h-3.5 w-3.5" />
          Enable
        </button>
      )}
      {isLockActive(acc) && (
        <button
          onClick={() => requestAction(acc, 'clear_lockout')}
          className="flex items-center gap-1 rounded-lg bg-orange-100 dark:bg-orange-900/30 px-2.5 py-1 text-[11px] font-semibold text-orange-700 dark:text-orange-400 hover:bg-orange-200 transition-colors"
          title="Administrator intervention: clear the temporary login lockout"
        >
          <MdLockReset className="h-3.5 w-3.5" />
          Unlock
        </button>
      )}
      {acc.account_status === 'approved' && acc.email.toLowerCase() !== PRIMARY_ADMIN_EMAIL && (
        <select
          value={acc.role}
          onChange={(e) => handleRoleChange(acc, e.target.value as UserRole)}
          className="rounded-lg border border-slate-200 dark:border-navy-600 bg-white dark:bg-navy-800 px-1.5 py-1 text-[11px] font-semibold text-slate-700 dark:text-slate-200"
          title="Change user role"
        >
          <option value="Staff">Staff</option>
          <option value="Administrator">Administrator</option>
        </select>
      )}
    </div>
  );

  return (
    <div className="mt-3 flex flex-col gap-5">
      {/* Page Header */}
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold text-navy-700 dark:text-white flex items-center gap-2">
          <MdAdminPanelSettings className="h-7 w-7 text-[#4318FF]" />
          User Account Management
        </h1>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          Manage SPID personnel registrations — approve, reject, disable or re-enable accounts.
        </p>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-6">
        {[
          { label: 'Total Users', value: stats.total, color: 'from-[#4318FF] to-brand-500', icon: MdPersonAdd },
          { label: 'Approved', value: stats.approved, color: 'from-green-500 to-emerald-600', icon: MdCheckCircle },
          { label: 'Pending', value: stats.pending, color: 'from-amber-500 to-yellow-600', icon: MdPending },
          { label: 'Rejected', value: stats.rejected, color: 'from-red-500 to-rose-600', icon: MdCancel },
          { label: 'Disabled', value: stats.disabled, color: 'from-gray-500 to-gray-700', icon: MdBlock },
          { label: 'Locked', value: stats.locked, color: 'from-orange-500 to-amber-600', icon: MdLock },
        ].map(({ label, value, color, icon: Icon }) => (
          <div
            key={label}
            className="relative rounded-[20px] bg-white dark:bg-navy-700 shadow-md shadow-shadow-500 dark:shadow-none p-4 flex flex-col gap-2 overflow-hidden"
          >
            <div className={`absolute -top-3 -right-3 h-16 w-16 rounded-full bg-gradient-to-b ${color} opacity-10`} />
            <div className={`h-10 w-10 rounded-xl bg-gradient-to-b ${color} flex items-center justify-center text-white shadow-md`}>
              <Icon className="h-5 w-5" />
            </div>
            <div>
              <p className="text-2xl font-black text-navy-700 dark:text-white">{value}</p>
              <p className="text-xs font-medium text-gray-500 dark:text-gray-400">{label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Filters & Search */}
      <div className="rounded-[20px] bg-white dark:bg-navy-700 shadow-md shadow-shadow-500 dark:shadow-none p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          {/* Search */}
          <div className="flex h-10 items-center gap-2 rounded-xl bg-[#f4f7fe] dark:bg-navy-900 px-3 w-full sm:w-72">
            <MdSearch className="h-4 w-4 text-gray-400 dark:text-slate-500 shrink-0" />
            <input
              type="text"
              placeholder="Search by name, email, section..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-full w-full bg-transparent text-sm text-navy-700 dark:text-white outline-none placeholder:text-gray-400 dark:placeholder:text-slate-500"
            />
          </div>

          {/* Filter Tabs */}
          <div className="flex items-center gap-1.5 flex-wrap">
            <FiFilter className="h-3.5 w-3.5 text-gray-400 mr-1" />
            {FILTER_STATUSES.map((s) => (
              <button
                key={s}
                onClick={() => setFilterStatus(s)}
                className={`rounded-lg px-3 py-1.5 text-xs font-semibold capitalize transition-all ${
                  filterStatus === s
                    ? 'bg-[#4318FF] text-white shadow'
                    : 'bg-[#f4f7fe] dark:bg-navy-900 text-gray-500 dark:text-gray-400 hover:bg-brand-50'
                }`}
              >
                {s === 'all'
                  ? `All (${stats.total})`
                  : `${s.charAt(0).toUpperCase()}${s.slice(1)} (${stats[s]})`}
              </button>
            ))}
            <button
              onClick={loadAccounts}
              className="ml-1 flex items-center gap-1 rounded-lg bg-[#f4f7fe] dark:bg-navy-900 px-2.5 py-1.5 text-xs text-gray-500 dark:text-gray-400 hover:text-[#4318FF] transition-colors"
              title="Refresh"
            >
              <MdRefresh className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* Permission Notice for non-admins */}
      {!isAdmin && !listLoading && (
        <div className="rounded-xl border border-amber-300 bg-amber-50 dark:bg-amber-900/20 dark:border-amber-700 p-3 flex items-center gap-2">
          <MdAdminPanelSettings className="h-5 w-5 text-amber-600 dark:text-amber-400 shrink-0" />
          <p className="text-xs text-amber-700 dark:text-amber-400">
            Only Administrators can view and manage the personnel registry.
          </p>
        </div>
      )}

      {/* Users Table */}
      <div className="rounded-[20px] bg-white dark:bg-navy-700 shadow-md shadow-shadow-500 dark:shadow-none overflow-hidden">
        {/* Table Header */}
        <div className="px-5 py-4 border-b border-gray-100 dark:border-navy-600">
          <h2 className="text-base font-bold text-navy-700 dark:text-white">
            Personnel Registry
          </h2>
          <p className="text-xs text-gray-400 mt-0.5">{filtered.length} of {accounts.length} records</p>
        </div>

        {/* Desktop Table */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-[#f4f7fe] dark:bg-navy-800">
                {['Officer', 'Section', 'Contact', 'Role', 'Registered', 'Status', 'Login Security', isAdmin ? 'Actions' : '']
                  .filter(Boolean)
                  .map((h) => (
                    <th key={h} className="px-4 py-3 text-left text-[11px] font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                      {h}
                    </th>
                  ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50 dark:divide-navy-600">
              {listLoading ? (
                <tr>
                  <td colSpan={isAdmin ? 8 : 7} className="px-4 py-12 text-center text-sm text-gray-400">
                    Loading registry...
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={isAdmin ? 8 : 7} className="px-4 py-12 text-center text-sm text-gray-400 dark:text-gray-500">
                    No accounts match your search/filter criteria.
                  </td>
                </tr>
              ) : (
                filtered.map((acc) => {
                  const statusCfg = STATUS_CONFIG[acc.account_status];
                  const roleCfg = ROLE_CONFIG[acc.role];
                  const isLoading = loading === acc.id;
                  const isProtected = acc.email.toLowerCase() === PRIMARY_ADMIN_EMAIL && acc.role === 'Administrator';

                  return (
                    <tr key={acc.id} className={`hover:bg-[#f4f7fe] dark:hover:bg-navy-800/50 transition-colors ${isLoading ? 'opacity-50' : ''}`}>
                      {/* Officer */}
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2.5">
                          <div className="h-8 w-8 rounded-full bg-gradient-to-b from-[#4318FF] to-brand-500 flex items-center justify-center text-white text-xs font-bold shrink-0">
                            {acc.full_name.slice(0, 2).toUpperCase()}
                          </div>
                          <div>
                            <p className="text-sm font-semibold text-navy-700 dark:text-white">
                              {acc.full_name}
                              {isProtected && (
                                <span className="ml-1.5 inline-flex items-center gap-0.5 rounded bg-purple-100 dark:bg-purple-900/30 px-1 py-0.5 text-[9px] font-bold text-purple-600 dark:text-purple-400">
                                  <MdVerifiedUser className="h-2.5 w-2.5" /> PROTECTED
                                </span>
                              )}
                            </p>
                            <p className="text-[11px] text-gray-400 dark:text-gray-500 flex items-center gap-1">
                              <MdEmail className="h-3 w-3" />
                              {acc.email}
                            </p>
                          </div>
                        </div>
                      </td>

                      {/* Section */}
                      <td className="px-4 py-3">
                        <p className="text-xs text-gray-600 dark:text-gray-300 max-w-[160px]">{acc.section_name || '—'}</p>
                      </td>

                      {/* Contact */}
                      <td className="px-4 py-3">
                        <span className="flex items-center gap-1 text-xs text-gray-600 dark:text-gray-300">
                          <MdPhone className="h-3.5 w-3.5 text-gray-400" />
                          {acc.mobile_phone || '—'}
                        </span>
                      </td>

                      {/* Role */}
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-semibold ${roleCfg.bg} ${roleCfg.text}`}>
                          {acc.role === 'Administrator' ? <MdAdminPanelSettings className="h-3 w-3" /> : <MdBadge className="h-3 w-3" />}
                          {acc.role}
                        </span>
                        {acc.requested_role && acc.requested_role !== acc.role && (
                          <p className="mt-1 text-[10px] text-gray-400">requested: {acc.requested_role}</p>
                        )}
                      </td>

                      {/* Registered */}
                      <td className="px-4 py-3">
                        <p className="text-xs text-gray-500 dark:text-gray-400">{formatDate(acc.created_at)}</p>
                      </td>

                      {/* Status */}
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-[11px] font-semibold ${statusCfg.bg} ${statusCfg.text}`}>
                          <span className={`h-1.5 w-1.5 rounded-full ${statusCfg.dot}`} />
                          {statusCfg.label}
                        </span>
                      </td>

                      {/* Login Security */}
                      <td className="px-4 py-3">
                        {isLockActive(acc) ? (
                          <span className="inline-flex items-center gap-1 rounded-lg bg-orange-100 dark:bg-orange-900/30 px-2 py-1 text-[11px] font-semibold text-orange-700 dark:text-orange-400">
                            <MdLock className="h-3 w-3" />
                            {Math.max(0, Math.ceil((new Date(acc.locked_until!).getTime() - Date.now()) / 1000))}s left
                          </span>
                        ) : acc.failed_attempts > 0 ? (
                          <span className="text-[11px] text-gray-400">{acc.failed_attempts} failed</span>
                        ) : (
                          <span className="text-[11px] text-gray-300 dark:text-gray-600">—</span>
                        )}
                      </td>

                      {/* Actions (Admin only) */}
                      {isAdmin && (
                        <td className="px-4 py-3">
                          {isProtected ? (
                            <span className="text-[11px] text-gray-400 dark:text-gray-500">Protected</span>
                          ) : isLoading ? (
                            <span className="text-xs text-gray-400">Updating...</span>
                          ) : (
                            renderActionButtons(acc)
                          )}
                        </td>
                      )}
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Mobile Cards */}
        <div className="block md:hidden divide-y divide-gray-50 dark:divide-navy-600">
          {listLoading ? (
            <div className="px-5 py-10 text-center text-sm text-gray-400">Loading registry...</div>
          ) : filtered.length === 0 ? (
            <div className="px-5 py-10 text-center text-sm text-gray-400">
              No accounts found.
            </div>
          ) : (
            filtered.map((acc) => {
              const statusCfg = STATUS_CONFIG[acc.account_status];
              const roleCfg = ROLE_CONFIG[acc.role];
              const isLoading = loading === acc.id;
              const isProtected = acc.email.toLowerCase() === PRIMARY_ADMIN_EMAIL && acc.role === 'Administrator';

              return (
                <div key={acc.id} className={`p-4 flex flex-col gap-3 ${isLoading ? 'opacity-50' : ''}`}>
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-2.5">
                      <div className="h-10 w-10 rounded-full bg-gradient-to-b from-[#4318FF] to-brand-500 flex items-center justify-center text-white text-sm font-bold shrink-0">
                        {acc.full_name.slice(0, 2).toUpperCase()}
                      </div>
                      <div>
                        <p className="text-sm font-bold text-navy-700 dark:text-white">{acc.full_name}</p>
                        <p className="text-xs text-gray-400">{acc.email}</p>
                      </div>
                    </div>
                    <span className={`inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-semibold ${statusCfg.bg} ${statusCfg.text}`}>
                      <span className={`h-1.5 w-1.5 rounded-full ${statusCfg.dot}`} />
                      {statusCfg.label}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-1.5 text-xs text-gray-500 dark:text-gray-400">
                    <span><strong>Section:</strong> {acc.section_name || '—'}</span>
                    <span><strong>Phone:</strong> {acc.mobile_phone || '—'}</span>
                    <span><strong>Joined:</strong> {formatDate(acc.created_at)}</span>
                    <span><strong>Failed attempts:</strong> {acc.failed_attempts}</span>
                  </div>

                  <div className="flex items-center justify-between">
                    <span className={`inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-semibold ${roleCfg.bg} ${roleCfg.text}`}>
                      {acc.role}
                    </span>
                    {isAdmin && !isProtected && renderActionButtons(acc)}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Confirm Modal */}
      {confirmAction && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-2xl bg-white dark:bg-navy-700 p-6 shadow-2xl">
            <div className={`mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full ${
              ['approve', 'enable', 'clear_lockout'].includes(confirmAction.action)
                ? 'bg-green-100 dark:bg-green-900/30'
                : 'bg-red-100 dark:bg-red-900/30'
            }`}>
              {['approve', 'enable', 'clear_lockout'].includes(confirmAction.action) ? (
                <MdCheckCircle className="h-7 w-7 text-green-600 dark:text-green-400" />
              ) : (
                <MdBlock className="h-7 w-7 text-red-600 dark:text-red-400" />
              )}
            </div>
            <h3 className="text-center text-base font-bold text-navy-700 dark:text-white">
              {confirmAction.action === 'approve' && 'Approve Account?'}
              {confirmAction.action === 'reject' && 'Reject Account?'}
              {confirmAction.action === 'disable' && 'Disable Account?'}
              {confirmAction.action === 'enable' && 'Re-enable Account?'}
              {confirmAction.action === 'clear_lockout' && 'Clear Login Lockout?'}
            </h3>
            <p className="mt-2 text-center text-sm text-gray-500 dark:text-gray-400">
              {confirmAction.action === 'approve' &&
                `Approving will allow ${confirmAction.name} to log in to the SPID system.`}
              {confirmAction.action === 'reject' &&
                `Rejecting will prevent ${confirmAction.name} from accessing the SPID system.`}
              {confirmAction.action === 'disable' &&
                `${confirmAction.name} will be signed out and blocked from the SPID system immediately.`}
              {confirmAction.action === 'enable' &&
                `${confirmAction.name} will regain access to the SPID system.`}
              {confirmAction.action === 'clear_lockout' &&
                `The temporary login lockout for ${confirmAction.name} will be cleared.`}
            </p>
            <div className="mt-5 flex gap-3">
              <button
                onClick={() => setConfirmAction(null)}
                className="flex-1 rounded-xl border border-gray-200 dark:border-navy-600 bg-white dark:bg-navy-800 py-2.5 text-sm font-semibold text-gray-600 dark:text-gray-300 hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={executeAction}
                className={`flex-1 rounded-xl py-2.5 text-sm font-bold text-white transition-colors shadow ${
                  ['approve', 'enable', 'clear_lockout'].includes(confirmAction.action)
                    ? 'bg-green-500 hover:bg-green-600'
                    : 'bg-red-500 hover:bg-red-600'
                }`}
              >
                Confirm
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
