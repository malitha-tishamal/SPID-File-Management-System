'use client';
import React from 'react';
import { MdFolder, MdAssignment, MdListAlt, MdHome } from 'react-icons/md';

export default function StaffDashboardPage() {
  return (
    <div className="mt-3 flex flex-col gap-5">
      {/* Heading */}
      <div>
        <h1 className="text-2xl font-black text-navy-700 dark:text-white">Dashboard</h1>
        <p className="text-sm text-slate-400 mt-0.5">
          Welcome to your SPID Staff Portal. Manage and track files efficiently.
        </p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          {
            icon: <MdFolder className="h-6 w-6" />,
            label: 'Total Files',
            value: '—',
            color: 'from-[#4318FF] to-[#3B82F6]',
          },
          {
            icon: <MdAssignment className="h-6 w-6" />,
            label: 'Pending Requests',
            value: '—',
            color: 'from-amber-500 to-orange-500',
          },
          {
            icon: <MdListAlt className="h-6 w-6" />,
            label: 'Your Requests',
            value: '—',
            color: 'from-emerald-500 to-teal-500',
          },
          {
            icon: <MdHome className="h-6 w-6" />,
            label: 'Active Sessions',
            value: '1',
            color: 'from-pink-500 to-rose-500',
          },
        ].map((w, i) => (
          <div
            key={i}
            className="rounded-2xl bg-white dark:bg-navy-700 p-5 shadow-sm border border-slate-100 dark:border-navy-600 flex items-center gap-4"
          >
            <div
              className={`flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-b ${w.color} text-white shadow-md shrink-0`}
            >
              {w.icon}
            </div>
            <div>
              <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                {w.label}
              </p>
              <p className="text-2xl font-black text-navy-700 dark:text-white mt-0.5">
                {w.value}
              </p>
            </div>
          </div>
        ))}
      </div>

      {/* Placeholder content area */}
      <div className="rounded-[24px] bg-white dark:bg-navy-700 p-6 shadow-sm border border-slate-100 dark:border-navy-600">
        <h2 className="text-base font-black text-navy-700 dark:text-white">Recent Activity</h2>
        <p className="text-xs text-slate-400 mt-1">Recent file operations and request updates will appear here.</p>
        <div className="mt-6 flex flex-col items-center justify-center gap-3 py-10 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100 dark:bg-navy-800 text-slate-400">
            <MdListAlt className="h-7 w-7" />
          </div>
          <p className="text-sm font-bold text-slate-500 dark:text-slate-400">No recent activity</p>
          <p className="text-xs text-slate-400">Your file interactions will appear here once you start working.</p>
        </div>
      </div>
    </div>
  );
}
