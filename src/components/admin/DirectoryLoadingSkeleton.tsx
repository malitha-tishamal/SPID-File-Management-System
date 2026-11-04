'use client';

import React from 'react';
import StatCard from 'components/admin/StatCard';
import { MdAdminPanelSettings } from 'react-icons/md';
import { FiCheckCircle, FiUserCheck, FiUserX, FiShield, FiRefreshCw } from 'react-icons/fi';

export default function DirectoryLoadingSkeleton({
  variant = 'admin',
}: {
  variant?: 'admin' | 'staff';
}) {
  const isStaff = variant === 'staff';

  const statConfig = isStaff
    ? [
        { icon: FiShield, tone: 'purple' as const, label: 'Total Registered' },
        { icon: FiCheckCircle, tone: 'green' as const, label: 'Approved Staff' },
        { icon: FiUserCheck, tone: 'blue' as const, label: 'Pending Activation' },
        { icon: FiUserX, tone: 'red' as const, label: 'Disabled / Inactive' },
      ]
    : [
        { icon: MdAdminPanelSettings, tone: 'purple' as const, label: 'Total Administrators' },
        { icon: FiCheckCircle, tone: 'green' as const, label: 'Approved & Active' },
        { icon: FiUserCheck, tone: 'blue' as const, label: 'Pending Approve' },
        { icon: FiUserX, tone: 'red' as const, label: 'Disabled / Suspended' },
      ];

  return (
    <>
      <p className="sr-only" role="status" aria-live="polite">
        Loading the {isStaff ? 'user' : 'administrator'} management directory. This page waits up to
        30 seconds before offering a retry.
      </p>
      <div
        className="mt-3 flex flex-col gap-5 animate-in fade-in duration-150"
        aria-hidden="true"
      >
      {/* Header Skeleton */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="h-3 w-48 rounded bg-slate-200 dark:bg-navy-700 animate-pulse mb-1.5" />
          <div className="h-7 w-64 rounded-lg bg-slate-200 dark:bg-navy-700 animate-pulse" />
          <div className="mt-1 h-3.5 w-80 rounded bg-slate-100 dark:bg-navy-800 animate-pulse" />
        </div>
        <div className="flex items-center gap-2">
          <span className="flex items-center gap-1.5 rounded-full bg-indigo-50 dark:bg-navy-900 px-3 py-1.5 text-[10px] font-bold text-[#4318FF] dark:text-brand-300 border border-indigo-100 dark:border-navy-700 shadow-sm animate-pulse">
            <span className="h-2 w-2 animate-spin rounded-full border-2 border-[#4318FF]/20 border-t-[#4318FF] dark:border-brand-300/20 dark:border-t-brand-300" />
            LOADING REGISTRY...
          </span>
          <div className="h-9 w-36 rounded-xl bg-slate-200 dark:bg-navy-700 animate-pulse" />
        </div>
      </div>

      {/* KPI Stat Cards Skeletons */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {statConfig.map(({ icon, tone, label }) => (
          <StatCard
            key={label}
            icon={icon}
            tone={tone}
            label={label}
            value="—"
            loading={true}
          />
        ))}
      </div>

      {/* Search & Filter Bar Skeleton */}
      <div className="rounded-2xl bg-white p-4 shadow-md shadow-shadow-500 dark:bg-navy-700 dark:shadow-none border border-slate-100 dark:border-navy-600">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
          <div className="h-10 w-full rounded-xl bg-slate-100 dark:bg-navy-900 lg:max-w-sm animate-pulse" />
          <div className="flex flex-1 flex-wrap items-center gap-2 lg:justify-end">
            <div className="h-9 w-36 rounded-xl bg-slate-100 dark:bg-navy-900 animate-pulse" />
            <div className="h-9 w-28 rounded-xl bg-slate-100 dark:bg-navy-900 animate-pulse" />
            <div className="h-9 w-28 rounded-xl bg-slate-100 dark:bg-navy-900 animate-pulse" />
            <div className="h-9 w-24 rounded-xl bg-slate-100 dark:bg-navy-900 animate-pulse" />
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-100 dark:bg-navy-900 text-slate-400">
              <FiRefreshCw className="h-3.5 w-3.5 animate-spin text-[#4318FF]" />
            </div>
          </div>
        </div>
      </div>

      {/* Table Skeleton Card */}
      <div className="overflow-hidden rounded-[20px] bg-white shadow-md shadow-shadow-500 dark:bg-navy-700 dark:shadow-none border border-slate-100 dark:border-navy-600">
        {/* Table Card Header */}
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-100 px-5 py-4 dark:border-navy-600">
          <div className="flex items-center gap-2.5">
            <h2 className="flex items-center gap-2 text-sm font-bold text-navy-700 dark:text-white">
              <span className="h-2 w-2 rounded-full bg-[#4318FF]" />
              {isStaff ? 'Staff & User Accounts' : 'Verified System Administrators'}
            </h2>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-indigo-50 dark:bg-navy-900/80 border border-indigo-100 dark:border-navy-600 px-2.5 py-0.5 text-[10px] font-bold text-[#4318FF] dark:text-brand-300 animate-pulse">
              <span className="h-2.5 w-2.5 animate-spin rounded-full border-2 border-[#4318FF]/20 border-t-[#4318FF] dark:border-brand-300/20 dark:border-t-brand-300" />
              Loading records...
            </span>
          </div>
          <div className="h-3 w-40 rounded bg-slate-100 dark:bg-navy-800 animate-pulse" />
        </div>

        {/* Indeterminate loading progress bar */}
        <div className="relative h-1 w-full overflow-hidden bg-slate-100 dark:bg-navy-800">
          <span className="loading-bar-indeterminate absolute inset-y-0 left-0 rounded-full bg-[#4318FF] shadow-[0_0_8px_rgba(67,24,255,0.35)] dark:bg-brand-300" />
        </div>

        {/* Table rows skeleton */}
        <div className="overflow-x-auto">
          <table className="w-full min-w-[860px]">
            <thead>
              <tr className="bg-[#f4f7fe] dark:bg-navy-800">
                {isStaff && <th className="w-10 px-4 py-3" />}
                <th className="px-4 py-3 text-left text-[11px] font-extrabold uppercase tracking-wider text-slate-900 dark:text-gray-300">
                  {isStaff ? 'USER ID' : 'ADMIN ID'}
                </th>
                <th className="px-4 py-3 text-left text-[11px] font-extrabold uppercase tracking-wider text-slate-900 dark:text-gray-300">
                  {isStaff ? 'USER PROFILE & NAME' : 'ADMINISTRATOR PROFILE'}
                </th>
                <th className="px-4 py-3 text-left text-[11px] font-extrabold uppercase tracking-wider text-slate-900 dark:text-gray-300">
                  CONTACT &amp; CREDENTIALS
                </th>
                <th className="px-4 py-3 text-left text-[11px] font-extrabold uppercase tracking-wider text-slate-900 dark:text-gray-300">
                  SECTION NAME
                </th>
                <th className="px-4 py-3 text-left text-[11px] font-extrabold uppercase tracking-wider text-slate-900 dark:text-gray-300">
                  LAST LOGIN
                </th>
                <th className="px-4 py-3 text-left text-[11px] font-extrabold uppercase tracking-wider text-slate-900 dark:text-gray-300">
                  STATUS
                </th>
                <th className="px-4 py-3 text-left text-[11px] font-extrabold uppercase tracking-wider text-slate-900 dark:text-gray-300">
                  ACTIONS
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-300 dark:divide-navy-600">
              {Array.from({ length: 6 }).map((_, idx) => (
                <tr key={`dir-skel-${idx}`} className="animate-pulse">
                  {isStaff && (
                    <td className="w-10 px-4 py-4">
                      <div className="h-4 w-4 rounded bg-slate-200 dark:bg-navy-700" />
                    </td>
                  )}
                  <td className="px-4 py-4">
                    <div className="h-4 w-8 rounded bg-slate-200 dark:bg-navy-700" />
                  </td>
                  <td className="px-4 py-4">
                    <div className="flex items-center gap-2.5">
                      <div className="h-9 w-9 rounded-full bg-slate-200 dark:bg-navy-700 shrink-0" />
                      <div className="space-y-1.5">
                        <div className="h-3.5 w-28 rounded bg-slate-200 dark:bg-navy-700" />
                        <div className="h-3 w-36 rounded bg-slate-100 dark:bg-navy-800" />
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-4">
                    <div className="space-y-1.5">
                      <div className="h-3.5 w-28 rounded bg-slate-200 dark:bg-navy-700" />
                      <div className="h-3 w-20 rounded bg-slate-100 dark:bg-navy-800" />
                    </div>
                  </td>
                  <td className="px-4 py-4">
                    <div className="h-6 w-32 rounded-full bg-slate-200 dark:bg-navy-700" />
                  </td>
                  <td className="px-4 py-4">
                    <div className="h-3.5 w-24 rounded bg-slate-200 dark:bg-navy-700" />
                  </td>
                  <td className="px-4 py-4">
                    <div className="h-5 w-20 rounded-full bg-slate-200 dark:bg-navy-700" />
                  </td>
                  <td className="px-4 py-4">
                    <div className="h-7 w-28 rounded-lg bg-slate-200 dark:bg-navy-700" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      </div>
    </>
  );
}
