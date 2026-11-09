'use client';
import React from 'react';
import { useTranslation } from 'react-i18next';
import { FiAlertTriangle, FiClock, FiGlobe, FiLock, FiSlash, FiUnlock } from 'react-icons/fi';
import type { AdminUserRow } from 'types/auth';
import { formatSriLankaDateTime } from 'lib/datetime';
import { formatLockoutCountdown, isLockoutActive, secondsUntilUnlock } from 'lib/auth/lockout';
import AttributedUser from 'components/ui/AttributedUser';
import { attributedName } from 'utils/userDisplay';

function prettyDate(iso?: string | null): string {
  if (!iso) return '—';
  try {
    return formatSriLankaDateTime(iso);
  } catch {
    return '—';
  }
}

/**
 * Dedicated locked-accounts view: permanent and timed locks are shown with the
 * evidence an administrator needs (locked at, last failed IP, attempts) and
 * exactly two decisions — unlock, or keep the lock and disable the account.
 */
function LockedAccountsTable({
  rows,
  listLoading,
  loadingId,
  currentUserId,
  onUnlock,
  onKeepLocked,
}: {
  rows: AdminUserRow[];
  listLoading: boolean;
  loadingId: string | null;
  currentUserId?: string | null;
  onUnlock: (acc: AdminUserRow) => void;
  onKeepLocked: (acc: AdminUserRow) => void;
}) {
  const { t } = useTranslation('accounts');

  return (
    <section
      className="overflow-hidden rounded-[20px] border border-red-100 bg-white shadow-md shadow-shadow-500 dark:border-navy-600 dark:bg-navy-700 dark:shadow-none"
      aria-labelledby="locked-accounts-heading"
      aria-busy={listLoading}
    >
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-red-100 bg-red-50/60 px-5 py-4 dark:border-navy-600 dark:bg-red-950/20">
        <div className="flex items-center gap-2.5">
          <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300">
            <FiLock aria-hidden="true" className="h-4 w-4" />
          </span>
          <div>
            <h2
              id="locked-accounts-heading"
              className="text-sm font-bold text-red-900 dark:text-red-200"
            >
              {t('lockedPanel.title')}
            </h2>
            <p className="text-[11px] font-medium text-red-700/80 dark:text-red-300/80">
              {t('lockedPanel.subtitle', { count: rows.length })}
            </p>
          </div>
        </div>
        <span className="rounded-full border border-red-200 bg-white px-3 py-1 text-[11px] font-extrabold text-red-700 dark:border-red-800 dark:bg-navy-800 dark:text-red-300">
          {t('lockedPanel.count', { count: rows.length })}
        </span>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[960px]" role="table" aria-label={t('lockedPanel.title')}>
          <thead>
            <tr className="bg-[#f4f7fe] dark:bg-navy-800">
              {[
                'lockedPanel.columns.user',
                'lockedPanel.columns.email',
                'lockedPanel.columns.role',
                'lockedPanel.columns.lockedAt',
                'lockedPanel.columns.lastIp',
                'lockedPanel.columns.attempts',
                'lockedPanel.columns.type',
                'lockedPanel.columns.actions',
              ].map((key) => (
                <th
                  key={key}
                  scope="col"
                  className="px-4 py-3 text-left text-[11px] font-extrabold uppercase tracking-wider text-slate-900 dark:text-gray-300"
                >
                  {t(key)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200 dark:divide-navy-600">
            {listLoading ? (
              Array.from({ length: 3 }).map((_, idx) => (
                <tr key={`locked-skeleton-${idx}`} className="animate-pulse">
                  {Array.from({ length: 8 }).map((__, cell) => (
                    <td key={cell} className="px-4 py-4">
                      <div className="h-4 w-24 rounded bg-slate-200 dark:bg-navy-700" />
                    </td>
                  ))}
                </tr>
              ))
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-4 py-12 text-center">
                  <p className="text-sm font-bold text-slate-700 dark:text-gray-200">
                    {t('lockedPanel.emptyTitle')}
                  </p>
                  <p className="mt-1 text-xs font-medium text-slate-500 dark:text-gray-400">
                    {t('lockedPanel.emptyMessage')}
                  </p>
                </td>
              </tr>
            ) : (
              rows.map((acc) => {
                const permanent = acc.is_permanently_locked === true;
                const active = isLockoutActive({
                  locked: true,
                  locked_until: acc.locked_until,
                  is_permanently_locked: permanent,
                  permanent,
                });
                const remaining = secondsUntilUnlock(acc.locked_until);
                const isSelf = !!currentUserId && acc.id === currentUserId;
                const busy = loadingId === acc.id;
                const displayName = attributedName(acc.full_name, t('common:unknownUser'));

                return (
                  <tr
                    key={acc.id}
                    className={`transition-colors hover:bg-red-50/40 dark:hover:bg-navy-800/50 ${
                      busy ? 'opacity-50' : ''
                    }`}
                  >
                    <td className="px-4 py-3">
                      <p
                        className="break-words text-[13px] font-bold text-slate-900 dark:text-white [overflow-wrap:anywhere]"
                        title={displayName}
                      >
                        {displayName}
                        {acc.is_deleted === true && <AttributedUser suffixOnly deleted />}
                      </p>
                      {isSelf && (
                        <span className="mt-1 inline-flex rounded-full bg-indigo-50 px-2 py-0.5 text-[9px] font-bold text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-300">
                          {t('table.you')}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className="block max-w-[220px] break-words text-[11px] font-semibold text-slate-700 dark:text-gray-300 [overflow-wrap:anywhere]"
                        title={acc.email}
                      >
                        {acc.email}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[10px] font-bold text-slate-700 dark:border-navy-600 dark:bg-navy-800 dark:text-gray-200">
                        {acc.role}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-700 dark:text-gray-300">
                        <FiClock aria-hidden="true" className="h-3 w-3 shrink-0 text-slate-400" />
                        {prettyDate(acc.locked_at ?? acc.locked_until)}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-700 dark:text-gray-300">
                        <FiGlobe aria-hidden="true" className="h-3 w-3 shrink-0 text-slate-400" />
                        {acc.last_failed_login_ip || '—'}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="inline-flex min-w-[2rem] justify-center rounded-lg bg-red-50 px-2 py-1 text-[11px] font-extrabold text-red-700 dark:bg-red-950/40 dark:text-red-300">
                        {acc.failed_attempts ?? 0}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {permanent ? (
                        <span className="inline-flex items-center gap-1.5 rounded-full border border-red-300 bg-red-100 px-2.5 py-1 text-[10px] font-extrabold text-red-800 dark:border-red-800 dark:bg-red-950/40 dark:text-red-300">
                          <FiAlertTriangle aria-hidden="true" className="h-3 w-3" />
                          {t('lockedPanel.permanent')}
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-300 bg-amber-50 px-2.5 py-1 text-[10px] font-bold text-amber-800 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-300">
                          <FiClock aria-hidden="true" className="h-3 w-3" />
                          {active
                            ? t('lockedPanel.temporaryRemaining', {
                                time: formatLockoutCountdown(remaining),
                              })
                            : t('lockedPanel.temporary')}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {busy ? (
                        <span
                          role="status"
                          className="flex items-center gap-1.5 text-[11px] font-semibold text-gray-500"
                        >
                          <span
                            aria-hidden="true"
                            className="h-3 w-3 animate-spin rounded-full border-2 border-gray-300 border-t-[#4318FF] motion-reduce:animate-none"
                          />
                          {t('table.updating')}
                        </span>
                      ) : (
                        <div className="flex flex-wrap items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => onUnlock(acc)}
                            className="flex items-center gap-1 rounded-full bg-emerald-600 px-2.5 py-1 text-[10px] font-bold text-white shadow-sm transition-all hover:bg-emerald-700 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 focus-visible:ring-offset-1 cursor-pointer"
                            title={t('lockedPanel.unlockTitle')}
                          >
                            <FiUnlock aria-hidden="true" className="h-3 w-3" />
                            {t('lockedPanel.unlock')}
                          </button>
                          <button
                            type="button"
                            onClick={() => onKeepLocked(acc)}
                            className="flex items-center gap-1 rounded-full border border-orange-300 bg-orange-50 px-2.5 py-1 text-[10px] font-bold text-orange-800 transition-colors hover:bg-orange-100 dark:border-orange-800 dark:bg-orange-950/30 dark:text-orange-300 cursor-pointer"
                            title={t('lockedPanel.keepLockedTitle')}
                          >
                            <FiSlash aria-hidden="true" className="h-3 w-3" />
                            {t('lockedPanel.keepLocked')}
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export default React.memo(LockedAccountsTable);
