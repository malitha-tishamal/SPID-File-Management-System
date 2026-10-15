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
  FiChevronLeft,
  FiChevronRight,
  FiClock,
  FiUserCheck,
} from 'react-icons/fi';
import { MdLockReset } from 'react-icons/md';
import type { AccountStatus, AdminUserRow } from 'types/auth';
import type { AccountAction } from 'components/admin/useAccountActions';

export const PRIMARY_ADMIN_EMAIL = 'officer@spid.gov.lk';

const STATUS_CONFIG: Record<AccountStatus, { label: string; cls: string; dot: string }> = {
  approved: { label: 'Approved', cls: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400 border border-emerald-200/50', dot: 'bg-emerald-500' },
  pending: { label: 'Pending', cls: 'bg-sky-50 text-sky-600 dark:bg-sky-900/30 dark:text-sky-400 border border-sky-200/50', dot: 'bg-sky-500' },
  rejected: { label: 'Rejected', cls: 'bg-red-50 text-red-600 dark:bg-red-900/30 dark:text-red-400 border border-red-200/50', dot: 'bg-red-500' },
  disabled: { label: 'Disabled', cls: 'bg-gray-100 text-gray-500 dark:bg-navy-600 dark:text-gray-400 border border-gray-200/50', dot: 'bg-gray-400' },
  locked: { label: 'Locked', cls: 'bg-orange-50 text-orange-600 dark:bg-orange-900/30 dark:text-orange-400 border border-orange-200/50', dot: 'bg-orange-500' },
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

export default function AccountTable({
  rows,
  listLoading,
  loadingId,
  title,
  caption,
  emptyMessage,
  variant = 'admin',
  onAction,
  onEdit,
}: {
  rows: AdminUserRow[];
  listLoading: boolean;
  loadingId: string | null;
  title: string;
  caption?: string;
  emptyMessage: string;
  variant?: 'admin' | 'staff';
  onAction: (acc: AdminUserRow, action: AccountAction) => void;
  onEdit: (acc: AdminUserRow) => void;
}) {
  const [page, setPage] = useState(1);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  useEffect(() => {
    setPage(1);
  }, [rows.length]);

  const totalPages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const start = (safePage - 1) * PAGE_SIZE;
  const paged = rows.slice(start, start + PAGE_SIZE);

  const isLockActive = (acc: AdminUserRow) =>
    !!acc.locked_until && new Date(acc.locked_until).getTime() > Date.now();

  const toggleSelectAll = () => {
    if (selectedIds.length === paged.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(paged.map((r) => r.id));
    }
  };

  const toggleSelectOne = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const renderActions = (acc: AdminUserRow) => {
    const isProtected =
      acc.email.toLowerCase() === PRIMARY_ADMIN_EMAIL && acc.role === 'Administrator';
    const busy = loadingId === acc.id;

    return (
      <div className="flex items-center gap-1.5 whitespace-nowrap">
        {busy ? (
          <span className="flex items-center gap-1.5 text-[11px] text-gray-400">
            <span className="h-3 w-3 animate-spin rounded-full border-2 border-gray-200 border-t-[#4318FF]" />
            Updating...
          </span>
        ) : (
          <>
            {/* 1. APPROVE / ACTIVATE BUTTON */}
            {acc.account_status === 'pending' ? (
              <button
                onClick={() => onAction(acc, 'approve')}
                className="flex items-center gap-1 rounded-full bg-[#4318FF] px-2.5 py-1 text-[10px] font-bold text-white shadow-sm hover:bg-brand-600 transition-all cursor-pointer"
                title="Approve registration"
              >
                <FiUserCheck className="h-3 w-3" /> Approve
              </button>
            ) : acc.account_status === 'disabled' ? (
              <button
                onClick={() => onAction(acc, 'enable')}
                className="flex items-center gap-1 rounded-full bg-emerald-600 px-2.5 py-1 text-[10px] font-bold text-white shadow-sm hover:bg-emerald-700 transition-all cursor-pointer"
                title="Activate account"
              >
                <FiPower className="h-3 w-3" /> Activate
              </button>
            ) : (
              <button
                disabled
                className="flex items-center gap-1 rounded-full bg-emerald-50 dark:bg-emerald-950/20 px-2.5 py-1 text-[10px] font-bold text-emerald-600 dark:text-emerald-400 opacity-60 cursor-not-allowed"
                title="Account is already approved"
              >
                <FiCheckCircle className="h-3 w-3" /> Approve
              </button>
            )}

            {/* 2. DISABLE BUTTON */}
            {acc.account_status === 'disabled' ? (
              <button
                disabled
                className="flex items-center gap-1 rounded-full bg-slate-100 dark:bg-navy-800 px-2.5 py-1 text-[10px] font-bold text-slate-400 opacity-50 cursor-not-allowed"
                title="Account is already suspended"
              >
                <FiSlash className="h-3 w-3" /> Disable
              </button>
            ) : (
              <button
                onClick={() => onAction(acc, 'disable')}
                className="flex items-center gap-1 rounded-full bg-[#e77a39] px-2.5 py-1 text-[10px] font-bold text-white shadow-sm hover:bg-[#d56b2c] transition-all cursor-pointer"
                title="Suspend account access"
              >
                <FiSlash className="h-3 w-3" /> Disable
              </button>
            )}

            {/* Optional Unlock for Lockout */}
            {isLockActive(acc) && (
              <button
                onClick={() => onAction(acc, 'clear_lockout')}
                className="flex items-center gap-1 rounded-full bg-orange-100 px-2.5 py-1 text-[10px] font-bold text-orange-700 hover:bg-orange-200 dark:bg-orange-900/40 dark:text-orange-400 cursor-pointer"
                title="Clear login lockout"
              >
                <MdLockReset className="h-3 w-3" /> Unlock
              </button>
            )}

            {/* 3. DELETE BUTTON */}
            {!isProtected && (
              <button
                onClick={() => onAction(acc, 'delete')}
                className="flex items-center gap-1 rounded-full bg-[#ff4a55] px-2.5 py-1 text-[10px] font-bold text-white shadow-sm hover:bg-red-600 transition-all cursor-pointer"
                title="Permanently expunge this account"
              >
                <FiTrash2 className="h-3 w-3" /> Delete
              </button>
            )}

            {/* 4. EDIT BUTTON (Pencil icon) */}
            <button
              onClick={() => onEdit(acc)}
              className="flex h-7 w-7 items-center justify-center rounded-full border border-gray-200 dark:border-navy-600 text-gray-400 hover:border-[#4318FF] hover:text-[#4318FF] hover:bg-[#f4f7fe] dark:hover:bg-navy-800 transition-colors cursor-pointer"
              title="Edit profile & permissions"
            >
              <FiEdit2 className="h-3 w-3" />
            </button>
          </>
        )}
      </div>
    );
  };

  return (
    <div className="overflow-hidden rounded-[20px] bg-white shadow-md shadow-shadow-500 dark:bg-navy-700 dark:shadow-none border border-slate-100 dark:border-navy-600">
      {/* Card header */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-100 px-5 py-4 dark:border-navy-600">
        <h2 className="flex items-center gap-2 text-sm font-bold text-navy-700 dark:text-white">
          <span className="h-2 w-2 rounded-full bg-[#4318FF]" />
          {title}
        </h2>
        {caption && <p className="text-[11px] font-medium text-gray-400 dark:text-gray-500">{caption}</p>}
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[980px]">
          <thead>
            <tr className="bg-[#f4f7fe] dark:bg-navy-800">
              {variant === 'staff' && (
                <th className="w-10 px-4 py-3 text-left">
                  <input
                    type="checkbox"
                    checked={paged.length > 0 && selectedIds.length === paged.length}
                    onChange={toggleSelectAll}
                    className="h-4 w-4 rounded border-gray-300 text-[#4318FF] focus:ring-[#4318FF]"
                    aria-label="Select all"
                  />
                </th>
              )}
              <th className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                {variant === 'admin' ? 'ADMIN ID' : 'USER ID'}
              </th>
              <th className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                {variant === 'admin' ? 'ADMINISTRATOR PROFILE' : 'USER PROFILE & NAME'}
              </th>
              <th className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                CONTACT &amp; CREDENTIALS
              </th>
              <th className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                NIC NUMBER
              </th>
              <th className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                SECTION NAME
              </th>
              <th className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                {variant === 'admin' ? 'LAST LOGIN TIME' : 'LAST LOGIN'}
              </th>
              <th className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                {variant === 'admin' ? 'ACCOUNT STATUS' : 'STATUS'}
              </th>
              <th className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                {variant === 'admin' ? 'OPERATIONAL ACTIONS' : 'ACTIONS'}
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50 dark:divide-navy-600">
            {listLoading ? (
              <tr>
                <td colSpan={9} className="px-4 py-12 text-center text-sm text-gray-400">
                  <span className="inline-flex items-center gap-2">
                    <span className="h-4 w-4 animate-spin rounded-full border-2 border-gray-200 border-t-[#4318FF]" />
                    Loading directory...
                  </span>
                </td>
              </tr>
            ) : paged.length === 0 ? (
              <tr>
                <td colSpan={9} className="px-4 py-12 text-center text-sm text-gray-400 dark:text-gray-500">
                  {emptyMessage}
                </td>
              </tr>
            ) : (
              paged.map((acc, i) => {
                const statusCfg = STATUS_CONFIG[acc.account_status] || STATUS_CONFIG.approved;
                const isProtected =
                  acc.email.toLowerCase() === PRIMARY_ADMIN_EMAIL && acc.role === 'Administrator';
                const lastLogin = formatLastLogin(acc.last_login_at);
                const isSelected = selectedIds.includes(acc.id);

                return (
                  <tr
                    key={acc.id}
                    className={`transition-colors hover:bg-[#f8faff] dark:hover:bg-navy-800/50 ${
                      loadingId === acc.id ? 'opacity-50' : ''
                    } ${isSelected ? 'bg-indigo-50/40 dark:bg-navy-800/80' : ''}`}
                  >
                    {variant === 'staff' && (
                      <td className="w-10 px-4 py-3">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleSelectOne(acc.id)}
                          className="h-4 w-4 rounded border-gray-300 text-[#4318FF] focus:ring-[#4318FF]"
                          aria-label={`Select ${acc.full_name}`}
                        />
                      </td>
                    )}
                    <td className="px-4 py-3 text-xs font-bold text-gray-400">
                      {start + i + 1}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2.5">
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-b from-[#4318FF] to-brand-500 text-xs font-bold text-white shadow-sm">
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
                    <td className="px-4 py-3 text-xs text-gray-600 dark:text-gray-300 font-mono">
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
          {rows.length} {variant === 'admin' ? 'administrators' : 'staff members'}
        </p>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={safePage <= 1}
            className="flex h-7 w-7 items-center justify-center rounded-lg text-gray-400 transition-colors hover:bg-[#f4f7fe] disabled:opacity-40 dark:hover:bg-navy-800 cursor-pointer"
            aria-label="Previous page"
          >
            <FiChevronLeft className="h-4 w-4" />
          </button>
          {Array.from({ length: totalPages }, (_, idx) => idx + 1)
            .filter((p) => p === 1 || p === totalPages || Math.abs(p - safePage) <= 1)
            .map((p, idx, arr) => (
              <React.Fragment key={p}>
                {idx > 0 && arr[idx - 1] !== p - 1 && (
                  <span className="px-1 text-[11px] text-gray-300">…</span>
                )}
                <button
                  onClick={() => setPage(p)}
                  className={`flex h-7 w-7 items-center justify-center rounded-lg text-[11px] font-bold transition-colors cursor-pointer ${
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
            className="flex h-7 w-7 items-center justify-center rounded-lg text-gray-400 transition-colors hover:bg-[#f4f7fe] disabled:opacity-40 dark:hover:bg-navy-800 cursor-pointer"
            aria-label="Next page"
          >
            <FiChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
