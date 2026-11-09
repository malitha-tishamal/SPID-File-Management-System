'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useTranslation } from 'react-i18next';
import {
  MdNoteAdd,
  MdAddCircleOutline,
  MdListAlt,
  MdAssignment,
  MdFolderOpen,
  MdWarning,
} from 'react-icons/md';
import { FiArrowRight, FiClock, FiPlusCircle } from 'react-icons/fi';

interface StaffStats {
  thisMonthFilesAdded: number;
  todayFilesAdded: number;
  thisMonthRequests: number;
  todayRequests: number;
  pendingRequests: number;
  ongoingFiles: number;
  lateFiles: number;
  totalRequests: number;
  loading: boolean;
}

export default function StaffDashboardPage() {
  const { t } = useTranslation(['dashboard', 'nav']);
  const [stats, setStats] = useState<StaffStats>({
    thisMonthFilesAdded: 0,
    todayFilesAdded: 0,
    thisMonthRequests: 0,
    todayRequests: 0,
    pendingRequests: 0,
    ongoingFiles: 0,
    lateFiles: 0,
    totalRequests: 0,
    loading: true,
  });

  useEffect(() => {
    let mounted = true;
    fetch('/api/staff/dashboard-stats')
      .then((res) => (res.ok ? res.json() : null))
      .then((json) => {
        if (!mounted || !json?.ok) return;
        const d = json.data || {};
        setStats({
          thisMonthFilesAdded: d.thisMonthFilesAdded ?? 0,
          todayFilesAdded: d.todayFilesAdded ?? 0,
          thisMonthRequests: d.thisMonthRequests ?? 0,
          todayRequests: d.todayRequests ?? 0,
          pendingRequests: d.pendingRequests ?? 0,
          ongoingFiles: d.ongoingFiles ?? 0,
          lateFiles: d.lateFiles ?? 0,
          totalRequests: d.totalRequests ?? 0,
          loading: false,
        });
      })
      .catch(() => {
        if (mounted) setStats((prev) => ({ ...prev, loading: false }));
      });
    return () => {
      mounted = false;
    };
  }, []);

  const statCards = [
    {
      icon: <MdNoteAdd className="h-6 w-6" />,
      label: t('stats.thisMonthFilesAdded'),
      hint: t('stats.thisMonthFilesAddedHint'),
      value: stats.loading ? null : String(stats.thisMonthFilesAdded),
      href: '/staff/files',
      color: 'from-[#4318FF] to-[#3B82F6]',
    },
    {
      icon: <MdAddCircleOutline className="h-6 w-6" />,
      label: t('stats.todayAdded'),
      hint: t('stats.todayAddedHint'),
      value: stats.loading ? null : String(stats.todayFilesAdded),
      href: '/staff/files',
      color: 'from-sky-500 to-blue-600',
    },
    {
      icon: <MdListAlt className="h-6 w-6" />,
      label: t('stats.thisMonthRequests'),
      hint: t('stats.thisMonthRequestsHint'),
      value: stats.loading ? null : String(stats.thisMonthRequests),
      href: '/staff/your-requests',
      color: 'from-emerald-500 to-teal-500',
    },
    {
      icon: <FiClock className="h-6 w-6" />,
      label: t('stats.todayRequests'),
      hint: t('stats.todayRequestsHint'),
      value: stats.loading ? null : String(stats.todayRequests),
      href: '/staff/your-requests',
      color: 'from-cyan-500 to-teal-600',
    },
    {
      icon: <MdAssignment className="h-6 w-6" />,
      label: t('stats.pendingApprovalRequests'),
      hint: t('stats.pendingApprovalRequestsHint'),
      value: stats.loading ? null : String(stats.pendingRequests),
      href: '/staff/your-requests',
      color: 'from-amber-500 to-orange-500',
    },
    {
      icon: <MdFolderOpen className="h-6 w-6" />,
      label: t('stats.ongoingFiles'),
      hint: t('stats.ongoingFilesHint'),
      value: stats.loading ? null : String(stats.ongoingFiles),
      href: '/staff/your-requests',
      color: 'from-indigo-500 to-purple-600',
    },
    {
      icon: <MdWarning className="h-6 w-6" />,
      label: t('stats.lateFiles'),
      hint: t('stats.lateFilesHint'),
      value: stats.loading ? null : String(stats.lateFiles),
      href: '/staff/your-requests',
      color: 'from-rose-500 to-red-600',
    },
  ];

  return (
    <div className="mt-3 flex flex-col gap-5">
      {/* Heading */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black text-navy-700 dark:text-white">
            {t('headings.staffDashboard')}
          </h1>
          <p className="text-sm text-slate-400 mt-0.5">{t('headings.staffWelcome')}</p>
        </div>
        <div className="flex items-center gap-2.5">
          <Link
            href="/staff/add-new-file"
            className="inline-flex items-center gap-2 rounded-xl bg-white dark:bg-navy-700 border border-slate-200 dark:border-navy-600 px-3.5 py-2 text-xs font-bold text-slate-700 dark:text-slate-200 shadow-xs hover:bg-slate-50 transition-colors"
          >
            <FiPlusCircle className="h-4 w-4 text-[#4318FF]" />
            <span>{t('nav:menu.add-new-file')}</span>
          </Link>
          <Link
            href="/staff/request-file"
            className="inline-flex items-center gap-2 rounded-xl bg-[#4318FF] px-3.5 py-2 text-xs font-bold text-white shadow-sm hover:bg-[#3311CC] transition-colors"
          >
            <span>{t('nav:menu.request-file')}</span>
          </Link>
        </div>
      </div>

      {/* Stats Grid - 7 Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {statCards.map((w, i) => {
          const content = (
            <div className="rounded-2xl bg-white dark:bg-navy-700 p-5 shadow-sm border border-slate-100 dark:border-navy-600 flex items-center gap-4 transition-all hover:shadow-md hover:-translate-y-0.5">
              <div
                className={`flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-b ${w.color} text-white shadow-md shrink-0`}
              >
                {w.icon}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-bold text-slate-400 uppercase tracking-wider truncate" title={w.label}>
                  {w.label}
                </p>
                {w.value === null ? (
                  <div className="mt-1.5 h-6 w-12 rounded bg-slate-200 dark:bg-navy-600 animate-pulse" />
                ) : (
                  <p className="text-2xl font-black text-navy-700 dark:text-white mt-0.5">
                    {w.value}
                  </p>
                )}
                {w.hint && (
                  <p className="text-[11px] text-slate-400 dark:text-slate-400 truncate mt-0.5">
                    {w.hint}
                  </p>
                )}
              </div>
            </div>
          );

          return (
            <Link key={i} href={w.href} className="block group">
              {content}
            </Link>
          );
        })}
      </div>

      {/* Recent Activity Card */}
      <div className="rounded-[24px] bg-white dark:bg-navy-700 p-6 shadow-sm border border-slate-100 dark:border-navy-600">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-base font-black text-navy-700 dark:text-white">
              {t('headings.recentActivity')}
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">{t('headings.recentActivityHint')}</p>
          </div>
          <Link
            href="/staff/your-requests"
            className="inline-flex items-center gap-1.5 text-xs font-bold text-[#4318FF] hover:underline dark:text-brand-300"
          >
            <span>{t('cards.viewAll')}</span>
            <FiArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>

        {/* Overdue Alert banner if any late files exist */}
        {!stats.loading && stats.lateFiles > 0 && (
          <div className="mt-4 flex items-center gap-3 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/60 p-3.5 text-xs text-rose-800 dark:text-rose-200">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-rose-500 text-white shrink-0">
              <MdWarning className="h-5 w-5" />
            </div>
            <div className="flex-1">
              <p className="font-bold">{t('states.overdueTitle', { count: stats.lateFiles })}</p>
              <p className="text-[11px] text-rose-600 dark:text-rose-300 mt-0.5">
                {t('states.overdueHint', { count: stats.lateFiles })}
              </p>
            </div>
            <Link
              href="/staff/your-requests"
              className="rounded-lg bg-rose-600 px-3 py-1.5 text-[11px] font-bold text-white shadow-xs hover:bg-rose-700 transition-colors"
            >
              {t('actions.resolveNow')}
            </Link>
          </div>
        )}

        {stats.loading ? (
          <div className="mt-6 flex flex-col items-center justify-center gap-3 py-10 text-center">
            <span className="h-6 w-6 animate-spin rounded-full border-2 border-slate-300 border-t-[#4318FF]" />
            <p className="text-xs text-slate-400 font-semibold">{t('states.loadingSummary')}</p>
          </div>
        ) : stats.totalRequests === 0 ? (
          <div className="mt-6 flex flex-col items-center justify-center gap-3 py-10 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100 dark:bg-navy-800 text-slate-400">
              <MdListAlt className="h-7 w-7" />
            </div>
            <p className="text-sm font-bold text-slate-700 dark:text-slate-300">
              {t('states.noRequestsOnRecord')}
            </p>
            <p className="text-xs text-slate-400 max-w-sm">{t('states.noRequestsOnRecordHint')}</p>
            <Link
              href="/staff/request-file"
              className="mt-2 inline-flex items-center gap-2 rounded-xl bg-[#4318FF] px-4 py-2 text-xs font-bold text-white shadow-sm hover:bg-[#3311CC] transition-colors"
            >
              {t('nav:menu.request-file')}
            </Link>
          </div>
        ) : (
          <div className="mt-4 rounded-xl bg-slate-50 dark:bg-navy-800 p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#EEF2FF] text-[#4318FF] dark:bg-brand-950/40 dark:text-brand-300 shrink-0">
                <FiClock className="h-5 w-5" />
              </div>
              <div>
                <p className="text-xs font-bold text-slate-800 dark:text-white">
                  {t('states.totalRequests', { count: stats.totalRequests })}
                  {stats.ongoingFiles > 0 && ` ${t('states.ongoingSuffix', { count: stats.ongoingFiles })}`}
                  .
                </p>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  {stats.pendingRequests > 0
                    ? t('states.pendingReview', { count: stats.pendingRequests })
                    : t('states.allReviewed')}
                </p>
              </div>
            </div>
            <Link
              href="/staff/your-requests"
              className="rounded-xl border border-slate-200 dark:border-navy-600 bg-white dark:bg-navy-700 px-3.5 py-1.5 text-xs font-bold text-slate-700 dark:text-slate-200 hover:bg-slate-50 transition-colors text-center"
            >
              {t('actions.openRequestsPortal')}
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
