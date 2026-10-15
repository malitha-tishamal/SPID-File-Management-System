'use client';
import React, { useEffect, useState } from 'react';
import {
  FiCheckCircle,
  FiPhone,
  FiMail,
  FiPower,
  FiTrash2,
  FiEdit2,
  FiSlash,
  FiLockReset,
  FiChevronLeft,
  FiChevronRight,
  FiClock,
} from 'react-icons/fi';
import type { AccountStatus, AdminUserRow } from 'types/auth';
import type { AccountAction } from 'components/admin/useAccountActions';

export const PRIMARY_ADMIN_EMAIL = 'officer@spid.gov.lk';

const STATUS_CONFIG: Record<AccountStatus, { label: string; cls: string; dot: string }> = {
  approved: { label: 'Approved', cls: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400', dot: 'bg-emerald-500' },
  pending: { label: 'Pending', cls: 'bg-sky-50 text-sky-600 dark:bg-sky-900/30 dark:text-sky-400', dot: 'bg-sky-500' },
  rejected: { label: 'Rejected', cls: 'bg-red-50 text-red-600 dark:bg-red-900/30 dark:text-red-400', dot: 'bg-red-500' },
  disabled: { label: 'Disabled', cls: 'bg-gray-100 text-gray-500 dark:bg-navy-600 dark:text-gray-400', dot: 'bg-gray-400' },
  locked: { label: 'Locked', cls: 'bg-orange-50 text-orange-600 dark:bg-orange-900/30 dark:text-orange-400', dot: 'bg-orange-500' },
};

const PAGE_SIZE = 7;

function formatLastLogin(iso: string | null): string | null {
  if (!iso) return null;
  try {
    const d = new Date(iso);
    return `${d.toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' })} • ${d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}`;
  } catch {
    return null;
  }
}

const HEADERS = [
  'ID',
  'Profile',
  'Contact & Credentials',
  'NIC Number',
  'Section Name',
  'Last Login',
  'Status',
  'Actions',
];

/**
 * Shared account directory table used by both Admin Management and User
 * Management. Handles paging, status pills and the action pill set
 * (Approve / Activate, Disable, Unlock, Reject, Delete, Edit).
 */
export default function AccountTable({
  rows,
  listLoading,
  loadingId,
  title,
  caption,
  emptyMessage,
  onAction,
  onEdit,
}: {
  rows: AdminUserRow[];
  listLoading: boolean;
  loadingId: string | null;
  title: string;
  caption?: string;
  emptyMessage: string;
  onAction: (acc: AdminUserRow, action: AccountAction) => void;
  onEdit: (acc: AdminUserRow) => void;
}) {
  const [page, setPage] = useState(1);

  useEffect(() => {
    setPage(1);
  }, [rows.length]);

  const totalPages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const start = (safePage - 1) * PAGE_SIZE;
  const paged = rows.slice(start, start + PAGE_SIZE);

  const isLockActive = (acc: AdminUserRow) =>
    !!acc.locked_until && new Date(acc.locked_until).getTime() > Date.now();

  const pill =
    'flex items-center gap-1 rounded-full px-2.5 py-1 text-[10px] font-bold transition-colors whitespace-nowrap';

  const renderActions = (acc: AdminUserRow) => {
    const isProtected =
      acc.email.toLowerCase() === PRIMARY_ADMIN_EMAIL && acc.role === 'Administrator';
    const busy = loadingId === acc.id;
    return (
      <div className="flex items-center gap-1.5">
        {busy ? (
          <span className="flex items-center gap-1.5 text-[11px] text-gray-400">
            <span className="h-3 w-3 animate-spin rounded-full border-2 border-gray-200 border-t-[#4318FF]" />
            Updating...
          </span>
        ) : (
          <>
            {acc.account_status === 'pending' && (
              <button onClick={() => onAction(acc, 'approve')} className={`${pill} bg-emerald-100 text-emerald-700 hover:bg-emerald-200 dark:bg-emerald-900/40 dark:text-emerald-400`}>
                <FiCheckCircle className="h-3 w-3" /> Approve
              </button>
            )}
            {acc.account_status === 'pending' && (
              <button onClick={() => onAction(acc, 'reject')} className={`${pill} bg-amber-100 text-amber-700 hover:bg-amber-200 dark:bg-amber-900/40 dark:text-amber-400`}>
                <FiSlash className="h-3 w-3" /> Reject
              </button>
            )}
            {acc.account_status === 'approved' && (
              <button onClick={() => onAction(acc, 'disable')} className={`${pill} bg-orange-500 text-white hover:bg-orange-600`}>
                <FiSlash className="h-3 w-3" /> Disable
              </button>
            )}
            {acc.account_status === 'disabled' && (
              <button onClick={() => onAction(acc, 'enable')} className={`${pill} bg-emerald-600 text-white hover:bg-emerald-700`}>
                <FiPower className="h-3 w-3" /> Activate
              </button>
            )}
            {isLockActive(acc) && (
              <button
                onClick={() => onAction(acc, 'clear_lockout')}
                className={`${pill} bg-orange-100 text-orange-700 hover:bg-orange-200 dark:bg-orange-900/40 dark:text-orange-400`}
                title="Administrator intervention: clear the temporary login lockout"
              >
                <FiLockReset className="h-3 w-3" /> Unlock
              </button>
            )}
            {!isProtected && (
              <button
                onClick={() => onAction(acc, 'delete')}
                className={`${pill} bg-red-100 text-red-600 hover:bg-red-200 dark:bg-red-900/40 dark:text-red-400`}
                title="Permanently delete this account"
              >
                <FiTrash2 className="h-3 w-3" /> Delete
              </button>
            )}
            <button
              onClick={() => onEdit(acc)}
              className="flex h-7 w-7 items-center justify-center rounded-full border border-gray-200 text-gray-400 transition-colors hover:border-[#4318FF] hover:text-[#4318FF] dark:border-navy-600"
              title="Edit profile"
            >
              <FiEdit2 className="h-3 w-3" />
            </button>
          </>
        )}
      </div>
    );
  };

  return (
    <div className="overflow-hidden rounded-[20px] bg-white shadow-md shadow-shadow-500 dark:bg-navy-700 dark:shadow-none">
      {/* Card header */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-100 px-5 py-4 dark:border-navy-600">
        <h2 className="flex items-center gap-2 text-sm font-bold text-navy-700 dark:text-white">
          <span className="h-2 w-2 rounded-full bg-[#4318FF]" />
          {title}
        </h2>
        {caption && <p className="text-[11px] font-medium text-gray-400 dark:text-gray-500">{caption}</p>}
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[960px]">
          <thead>
            <tr className="bg-[#f4f7fe] dark:bg-navy-800">
              {HEADERS.map((h) => (
                <th
                  key={h}
                  className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400"
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50 dark:divide-navy-600">
            {listLoading ? (
              <tr>
                <td colSpan={HEADERS.length} className="px-4 py-12 text-center text-sm text-gray-400">
                  Loading directory...
                </td>
              </tr>
            ) : paged.length === 0 ? (
              <tr>
                <td colSpan={HEADERS.length} className="px-4 py-12 text-center text-sm text-gray-400 dark:text-gray-500">
                  {emptyMessage}
                </td>
              </tr>
            ) : (
              paged.map((acc, i) => {
                const statusCfg = STATUS_CONFIG[acc.account_status];
                const isProtected =
                  acc.email.toLowerCase() === PRIMARY_ADMIN_EMAIL && acc.role === 'Administrator';
                const lastLogin = formatLastLogin(acc.last_login_at);
                return (
                  <tr
                    key={acc.id}
                    className={`transition-colors hover:bg-[#f8faff] dark:hover:bg-navy-800/50 ${loadingId === acc.id ? 'opacity-50' : ''}`}
                  >
                    <td className="px-4 py-3 text-xs font-bold text-gray-400">{start + i + 1}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2.5">
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-b from-[#4318FF] to-brand-500 text-xs font-bold text-white">
                          {acc.full_name.slice(0, 2).toUpperCase()}
                        </div>
                        <div className="min-w-0">
                          <p className="truncate text-[13px] font-bold text-navy-700 dark:text-white">
                            {acc.full_name}
                            {isProtected && (
                              <span className="ml-1.5 rounded bg-purple-100 px-1 py-0.5 text-[8px] font-bold text-purple-600 dark:bg-purple-900/30 dark:text-purple-400">
                                PROTECTED
                              </span>
                            )}
                          </p>
                          <p className="text-[10px] font-medium text-gray-400">
                            {acc.role}
                            {acc.requested_role && acc.requested_role !== acc.role
                              ? ` • requested ${acc.requested_role}`
                              : ''}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <p className="flex items-center gap-1.5 text-[11px] text-gray-600 dark:text-gray-300">
                        <FiMail className="h-3 w-3 shrink-0 text-gray-400" />
                        <span className="truncate max-w-[170px]">{acc.email}</span>
                      </p>
                      <p className="mt-0.5 flex items-center gap-1.5 text-[11px] text-gray-500 dark:text-gray-400">
                        <FiPhone className="h-3 w-3 shrink-0 text-gray-400" />
                        {acc.mobile_phone || '—'}
                      </p>
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-600 dark:text-gray-300">
                      {acc.nic || '—'}
                    </td>
                    <td className="px-4 py-3">
                      <span className="rounded-full bg-[#f4f7fe] px-2.5 py-1 text-[11px] font-semibold text-gray-600 dark:bg-navy-800 dark:text-gray-300">
                        {acc.section_name || '—'}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {lastLogin ? (
                        <p className="flex items-center gap-1.5 text-[11px] text-gray-600 dark:text-gray-300">
                          <FiClock className="h-3 w-3 text-gray-400" />
                          {lastLogin}
                        </p>
                      ) : (
                        <div>
                          <p className="text-[11px] font-semibold text-gray-400">Never Logged In</p>
                          {acc.account_status === 'pending' && (
                            <p className="text-[10px] text-sky-500">(Pending Activation)</p>
                          )}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-bold ${statusCfg.cls}`}>
                        <span className={`h-1.5 w-1.5 rounded-full ${statusCfg.dot}`} />
                        {statusCfg.label}
                      </span>
                    </td>
                    <td className="px-4 py-3">{renderActions(acc)}</td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination footer */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-gray-100 px-5 py-3 dark:border-navy-600">
        <p className="text-[11px] text-gray-400 dark:text-gray-500">
          Showing {rows.length === 0 ? 0 : start + 1} to {Math.min(start + PAGE_SIZE, rows.length)} of{' '}
          {rows.length} accounts
        </p>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={safePage <= 1}
            className="flex h-7 w-7 items-center justify-center rounded-lg text-gray-400 transition-colors hover:bg-[#f4f7fe] disabled:opacity-40 dark:hover:bg-navy-800"
            aria-label="Previous page"
          >
            <FiChevronLeft className="h-4 w-4" />
          </button>
          {Array.from({ length: totalPages }, (_, idx) => idx + 1)
            .filter(
              (p) =>
                p === 1 ||
                p === totalPages ||
                Math.abs(p - safePage) <= 1
            )
            .map((p, idx, arr) => (
              <React.Fragment key={p}>
                {idx > 0 && arr[idx - 1] !== p - 1 && (
                  <span className="px-1 text-[11px] text-gray-300">…</span>
                )}
                <button
                  onClick={() => setPage(p)}
                  className={`flex h-7 w-7 items-center justify-center rounded-lg text-[11px] font-bold transition-colors ${
                    p === safePage
                      ? 'bg-[#4318FF] text-white shadow'
                      : 'text-gray-500 hover:bg-[#f4f7fe] dark:text-gray-400 dark:hover:bg-navy-800'
                  }`}
                >
                  {p}
                </button>
              </React.Fragment>
            ))}
          <button
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={safePage >= totalPages}
            className="flex h-7 w-7 items-center justify-center rounded-lg text-gray-400 transition-colors hover:bg-[#f4f7fe] disabled:opacity-40 dark:hover:bg-navy-800"
            aria-label="Next page"
          >
            <FiChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
