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
} from 'react-icons/md';
import { FiFilter } from 'react-icons/fi';
import {
  getAllAccounts,
  approveAccount,
  getCurrentUser,
  UserAccount,
  AccountStatus,
  REGISTERED_USERS_KEY,
} from 'utils/auth';
import { useToast } from 'components/toast/ToastContext';

// Extend approveAccount to also support reject
function updateAccountStatus(email: string, newStatus: AccountStatus): boolean {
  if (typeof window === 'undefined') return false;
  const accounts = getAllAccounts();
  const index = accounts.findIndex((a) => a.email.toLowerCase() === email.toLowerCase());
  if (index !== -1) {
    accounts[index].status = newStatus;
    localStorage.setItem(REGISTERED_USERS_KEY, JSON.stringify(accounts));
    return true;
  }
  return false;
}

const STATUS_CONFIG = {
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

export default function UserManagementPage() {
  const { showToast } = useToast();
  const [accounts, setAccounts] = useState<UserAccount[]>([]);
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState<'all' | AccountStatus>('all');
  const [loading, setLoading] = useState<string | null>(null);
  const [confirmAction, setConfirmAction] = useState<{
    email: string;
    name: string;
    action: 'approve' | 'reject';
  } | null>(null);

  const loadAccounts = useCallback(() => {
    const all = getAllAccounts();
    setAccounts(all);
  }, []);

  useEffect(() => {
    loadAccounts();
    setCurrentUser(getCurrentUser());
  }, [loadAccounts]);

  const isAdmin = currentUser?.role === 'Administrator';

  const filtered = accounts.filter((acc) => {
    const matchSearch =
      acc.name.toLowerCase().includes(search.toLowerCase()) ||
      acc.email.toLowerCase().includes(search.toLowerCase()) ||
      acc.division.toLowerCase().includes(search.toLowerCase()) ||
      acc.nic.toLowerCase().includes(search.toLowerCase());
    const matchStatus = filterStatus === 'all' || acc.status === filterStatus;
    return matchSearch && matchStatus;
  });

  const stats = {
    total: accounts.length,
    approved: accounts.filter((a) => a.status === 'approved').length,
    pending: accounts.filter((a) => a.status === 'pending').length,
    rejected: accounts.filter((a) => a.status === 'rejected').length,
  };

  const handleAction = async (email: string, name: string, action: 'approve' | 'reject') => {
    if (!isAdmin) {
      showToast({ type: 'error', title: 'Access Denied', message: 'Only Administrators can manage user accounts.' });
      return;
    }
    setConfirmAction({ email, name, action });
  };

  const executeAction = () => {
    if (!confirmAction) return;
    const { email, name, action } = confirmAction;
    setLoading(email);
    setConfirmAction(null);

    setTimeout(() => {
      const newStatus: AccountStatus = action === 'approve' ? 'approved' : 'rejected';
      const success = updateAccountStatus(email, newStatus);
      setLoading(null);

      if (success) {
        loadAccounts();
        if (action === 'approve') {
          showToast({
            type: 'success',
            title: 'Account Approved',
            message: `${name}'s account has been approved. They can now log in.`,
          });
        } else {
          showToast({
            type: 'error',
            title: 'Account Rejected',
            message: `${name}'s account registration has been rejected.`,
          });
        }
      } else {
        showToast({ type: 'error', title: 'Action Failed', message: 'Could not update account status. Please try again.' });
      }
    }, 600);
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

  return (
    <div className="mt-3 flex flex-col gap-5">
      {/* Page Header */}
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold text-navy-700 dark:text-white flex items-center gap-2">
          <MdAdminPanelSettings className="h-7 w-7 text-[#4318FF]" />
          User Account Management
        </h1>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          Manage SPID personnel registrations — approve or reject pending accounts.
        </p>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {[
          { label: 'Total Users', value: stats.total, color: 'from-[#4318FF] to-brand-500', icon: MdPersonAdd },
          { label: 'Approved', value: stats.approved, color: 'from-green-500 to-emerald-600', icon: MdCheckCircle },
          { label: 'Pending', value: stats.pending, color: 'from-amber-500 to-yellow-600', icon: MdPending },
          { label: 'Rejected', value: stats.rejected, color: 'from-red-500 to-rose-600', icon: MdCancel },
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
              placeholder="Search by name, email, NIC..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-full w-full bg-transparent text-sm text-navy-700 dark:text-white outline-none placeholder:text-gray-400 dark:placeholder:text-slate-500"
            />
          </div>

          {/* Filter Tabs */}
          <div className="flex items-center gap-1.5 flex-wrap">
            <FiFilter className="h-3.5 w-3.5 text-gray-400 mr-1" />
            {(['all', 'pending', 'approved', 'rejected'] as const).map((s) => (
              <button
                key={s}
                onClick={() => setFilterStatus(s)}
                className={`rounded-lg px-3 py-1.5 text-xs font-semibold capitalize transition-all ${
                  filterStatus === s
                    ? 'bg-[#4318FF] text-white shadow'
                    : 'bg-[#f4f7fe] dark:bg-navy-900 text-gray-500 dark:text-gray-400 hover:bg-brand-50'
                }`}
              >
                {s === 'all' ? `All (${stats.total})` : s === 'pending' ? `Pending (${stats.pending})` : s === 'approved' ? `Approved (${stats.approved})` : `Rejected (${stats.rejected})`}
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
      {!isAdmin && (
        <div className="rounded-xl border border-amber-300 bg-amber-50 dark:bg-amber-900/20 dark:border-amber-700 p-3 flex items-center gap-2">
          <MdAdminPanelSettings className="h-5 w-5 text-amber-600 dark:text-amber-400 shrink-0" />
          <p className="text-xs text-amber-700 dark:text-amber-400">
            You have <strong>read-only access</strong>. Only Administrators can approve or reject accounts.
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
                {['Officer', 'Division', 'NIC', 'Contact', 'Role', 'Registered', 'Status', isAdmin ? 'Actions' : ''].filter(Boolean).map((h) => (
                  <th key={h} className="px-4 py-3 text-left text-[11px] font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50 dark:divide-navy-600">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={isAdmin ? 8 : 7} className="px-4 py-12 text-center text-sm text-gray-400 dark:text-gray-500">
                    No accounts match your search/filter criteria.
                  </td>
                </tr>
              ) : (
                filtered.map((acc) => {
                  const statusCfg = STATUS_CONFIG[acc.status];
                  const roleCfg = ROLE_CONFIG[acc.role];
                  const isLoading = loading === acc.email;
                  const isDefaultAdmin = acc.id === 'SPID-ADMIN-001';

                  return (
                    <tr key={acc.id} className={`hover:bg-[#f4f7fe] dark:hover:bg-navy-800/50 transition-colors ${isLoading ? 'opacity-50' : ''}`}>
                      {/* Officer */}
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2.5">
                          <div className="h-8 w-8 rounded-full bg-gradient-to-b from-[#4318FF] to-brand-500 flex items-center justify-center text-white text-xs font-bold shrink-0">
                            {acc.name.slice(0, 2).toUpperCase()}
                          </div>
                          <div>
                            <p className="text-sm font-semibold text-navy-700 dark:text-white">
                              {acc.name}
                              {isDefaultAdmin && (
                                <span className="ml-1.5 inline-flex items-center gap-0.5 rounded bg-purple-100 dark:bg-purple-900/30 px-1 py-0.5 text-[9px] font-bold text-purple-600 dark:text-purple-400">
                                  <MdVerifiedUser className="h-2.5 w-2.5" /> DEFAULT
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

                      {/* Division */}
                      <td className="px-4 py-3">
                        <p className="text-xs text-gray-600 dark:text-gray-300 max-w-[160px]">{acc.division}</p>
                      </td>

                      {/* NIC */}
                      <td className="px-4 py-3">
                        <span className="flex items-center gap-1 text-xs text-gray-600 dark:text-gray-300">
                          <MdBadge className="h-3.5 w-3.5 text-gray-400" />
                          {acc.nic}
                        </span>
                      </td>

                      {/* Contact */}
                      <td className="px-4 py-3">
                        <span className="flex items-center gap-1 text-xs text-gray-600 dark:text-gray-300">
                          <MdPhone className="h-3.5 w-3.5 text-gray-400" />
                          {acc.phone}
                        </span>
                      </td>

                      {/* Role */}
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-semibold ${roleCfg.bg} ${roleCfg.text}`}>
                          {acc.role === 'Administrator' ? <MdAdminPanelSettings className="h-3 w-3" /> : <MdBadge className="h-3 w-3" />}
                          {acc.role}
                        </span>
                      </td>

                      {/* Registered */}
                      <td className="px-4 py-3">
                        <p className="text-xs text-gray-500 dark:text-gray-400">{formatDate(acc.registeredAt)}</p>
                      </td>

                      {/* Status */}
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-[11px] font-semibold ${statusCfg.bg} ${statusCfg.text}`}>
                          <span className={`h-1.5 w-1.5 rounded-full ${statusCfg.dot}`} />
                          {statusCfg.label}
                        </span>
                      </td>

                      {/* Actions (Admin only) */}
                      {isAdmin && (
                        <td className="px-4 py-3">
                          {isDefaultAdmin ? (
                            <span className="text-[11px] text-gray-400 dark:text-gray-500">Protected</span>
                          ) : isLoading ? (
                            <span className="text-xs text-gray-400">Updating...</span>
                          ) : (
                            <div className="flex items-center gap-1.5">
                              {acc.status !== 'approved' && (
                                <button
                                  onClick={() => handleAction(acc.email, acc.name, 'approve')}
                                  className="flex items-center gap-1 rounded-lg bg-green-100 dark:bg-green-900/30 px-2.5 py-1 text-[11px] font-semibold text-green-700 dark:text-green-400 hover:bg-green-200 dark:hover:bg-green-900/50 transition-colors"
                                >
                                  <MdCheckCircle className="h-3.5 w-3.5" />
                                  Approve
                                </button>
                              )}
                              {acc.status !== 'rejected' && !isDefaultAdmin && (
                                <button
                                  onClick={() => handleAction(acc.email, acc.name, 'reject')}
                                  className="flex items-center gap-1 rounded-lg bg-red-100 dark:bg-red-900/30 px-2.5 py-1 text-[11px] font-semibold text-red-600 dark:text-red-400 hover:bg-red-200 dark:hover:bg-red-900/50 transition-colors"
                                >
                                  <MdBlock className="h-3.5 w-3.5" />
                                  Reject
                                </button>
                              )}
                            </div>
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
          {filtered.length === 0 ? (
            <div className="px-5 py-10 text-center text-sm text-gray-400">
              No accounts found.
            </div>
          ) : (
            filtered.map((acc) => {
              const statusCfg = STATUS_CONFIG[acc.status];
              const roleCfg = ROLE_CONFIG[acc.role];
              const isLoading = loading === acc.email;
              const isDefaultAdmin = acc.id === 'SPID-ADMIN-001';

              return (
                <div key={acc.id} className={`p-4 flex flex-col gap-3 ${isLoading ? 'opacity-50' : ''}`}>
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-2.5">
                      <div className="h-10 w-10 rounded-full bg-gradient-to-b from-[#4318FF] to-brand-500 flex items-center justify-center text-white text-sm font-bold shrink-0">
                        {acc.name.slice(0, 2).toUpperCase()}
                      </div>
                      <div>
                        <p className="text-sm font-bold text-navy-700 dark:text-white">{acc.name}</p>
                        <p className="text-xs text-gray-400">{acc.email}</p>
                      </div>
                    </div>
                    <span className={`inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-semibold ${statusCfg.bg} ${statusCfg.text}`}>
                      <span className={`h-1.5 w-1.5 rounded-full ${statusCfg.dot}`} />
                      {statusCfg.label}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-1.5 text-xs text-gray-500 dark:text-gray-400">
                    <span><strong>Division:</strong> {acc.division}</span>
                    <span><strong>NIC:</strong> {acc.nic}</span>
                    <span><strong>Phone:</strong> {acc.phone}</span>
                    <span><strong>Joined:</strong> {formatDate(acc.registeredAt)}</span>
                  </div>

                  <div className="flex items-center justify-between">
                    <span className={`inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-semibold ${roleCfg.bg} ${roleCfg.text}`}>
                      {acc.role}
                    </span>
                    {isAdmin && !isDefaultAdmin && (
                      <div className="flex gap-2">
                        {acc.status !== 'approved' && (
                          <button
                            onClick={() => handleAction(acc.email, acc.name, 'approve')}
                            disabled={!!isLoading}
                            className="rounded-lg bg-green-100 dark:bg-green-900/30 px-3 py-1.5 text-xs font-semibold text-green-700 dark:text-green-400"
                          >
                            ✓ Approve
                          </button>
                        )}
                        {acc.status !== 'rejected' && (
                          <button
                            onClick={() => handleAction(acc.email, acc.name, 'reject')}
                            disabled={!!isLoading}
                            className="rounded-lg bg-red-100 dark:bg-red-900/30 px-3 py-1.5 text-xs font-semibold text-red-700 dark:text-red-400"
                          >
                            ✗ Reject
                          </button>
                        )}
                      </div>
                    )}
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
              confirmAction.action === 'approve' ? 'bg-green-100 dark:bg-green-900/30' : 'bg-red-100 dark:bg-red-900/30'
            }`}>
              {confirmAction.action === 'approve' ? (
                <MdCheckCircle className="h-7 w-7 text-green-600 dark:text-green-400" />
              ) : (
                <MdBlock className="h-7 w-7 text-red-600 dark:text-red-400" />
              )}
            </div>
            <h3 className="text-center text-base font-bold text-navy-700 dark:text-white">
              {confirmAction.action === 'approve' ? 'Approve Account?' : 'Reject Account?'}
            </h3>
            <p className="mt-2 text-center text-sm text-gray-500 dark:text-gray-400">
              {confirmAction.action === 'approve'
                ? `Approving will allow ${confirmAction.name} to log in to the SPID system.`
                : `Rejecting will prevent ${confirmAction.name} from accessing the SPID system.`}
            </p>
            <p className="mt-1 text-center text-xs font-semibold text-[#4318FF] dark:text-brand-400 break-all">
              {confirmAction.email}
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
                  confirmAction.action === 'approve'
                    ? 'bg-green-500 hover:bg-green-600'
                    : 'bg-red-500 hover:bg-red-600'
                }`}
              >
                {confirmAction.action === 'approve' ? 'Yes, Approve' : 'Yes, Reject'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
