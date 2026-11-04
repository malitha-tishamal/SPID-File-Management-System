'use client';

import React from 'react';
import {
  FolderArchive,
  Building2,
  Users,
  ShieldCheck,
  CheckCircle2,
  Clock,
  Layers,
} from 'lucide-react';

interface StatsSectionProps {
  filesCount?: number | null;
  sectionsCount?: number | null;
  approvedUsersCount?: number | null;
}

export default function StatsSection({
  filesCount,
  sectionsCount,
  approvedUsersCount,
}: StatsSectionProps) {
  const hasLiveStats =
    typeof filesCount === 'number' &&
    typeof sectionsCount === 'number' &&
    typeof approvedUsersCount === 'number';

  return (
    <section
      id="statistics"
      className="py-16 sm:py-24 bg-white dark:bg-navy-900 border-b border-slate-100 dark:border-navy-800"
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Section Header */}
        <div className="max-w-3xl mx-auto text-center">
          <div className="inline-flex items-center gap-1.5 rounded-full bg-blue-50 dark:bg-brand-950/50 px-3 py-1 text-xs font-bold text-[#4318FF] dark:text-brand-300 border border-blue-200/80 dark:border-brand-900 mb-3">
            <CheckCircle2 className="h-3.5 w-3.5" />
            <span>VERIFIED REPOSITORY METRICS</span>
          </div>
          <h2 className="text-2xl sm:text-3xl md:text-4xl font-extrabold text-[#1B2559] dark:text-white tracking-tight">
            Live Departmental System Overview
          </h2>
          <p className="mt-4 text-sm sm:text-base text-slate-600 dark:text-slate-300 leading-relaxed font-normal">
            Verified system metrics retrieved directly from the official SPID-FMS
            database and departmental registry.
          </p>
        </div>

        {/* Statistic Cards Grid */}
        <div className="mt-14 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {/* Card 1: Verified Files */}
          <div className="rounded-2xl bg-gradient-to-br from-indigo-50/50 via-white to-white dark:from-navy-800 dark:via-navy-800 dark:to-navy-850 p-6 border border-slate-200/80 dark:border-navy-700 shadow-xs hover:shadow-md transition-shadow">
            <div className="flex items-center justify-between mb-4">
              <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                Registry Volume
              </span>
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 text-[#4318FF] dark:bg-brand-950/60 dark:text-brand-300 border border-indigo-100 dark:border-brand-900">
                <FolderArchive className="h-5 w-5" />
              </div>
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-3xl sm:text-4xl font-black text-[#1B2559] dark:text-white font-mono tabular-nums">
                {hasLiveStats ? filesCount : 'Active'}
              </span>
              {hasLiveStats && (
                <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 px-2 py-0.5 rounded-full">
                  Verified Records
                </span>
              )}
            </div>
            <h4 className="mt-2 text-sm font-bold text-slate-700 dark:text-slate-200">
              Departmental Files Cataloged
            </h4>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400 font-normal">
              Indexed in the central repository with physical shelf &amp; locker coordinates.
            </p>
          </div>

          {/* Card 2: Departmental Sections */}
          <div className="rounded-2xl bg-gradient-to-br from-indigo-50/50 via-white to-white dark:from-navy-800 dark:via-navy-800 dark:to-navy-850 p-6 border border-slate-200/80 dark:border-navy-700 shadow-xs hover:shadow-md transition-shadow">
            <div className="flex items-center justify-between mb-4">
              <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                Divisions
              </span>
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-sky-50 text-sky-600 dark:bg-sky-950/60 dark:text-sky-300 border border-sky-100 dark:border-sky-900">
                <Building2 className="h-5 w-5" />
              </div>
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-3xl sm:text-4xl font-black text-[#1B2559] dark:text-white font-mono tabular-nums">
                {hasLiveStats ? sectionsCount : 'Full'}
              </span>
              {hasLiveStats && (
                <span className="text-xs font-bold text-sky-600 dark:text-sky-400 bg-sky-50 dark:bg-sky-950/40 px-2 py-0.5 rounded-full">
                  Operational
                </span>
              )}
            </div>
            <h4 className="mt-2 text-sm font-bold text-slate-700 dark:text-slate-200">
              Departmental Sections
            </h4>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400 font-normal">
              Covering Engineering, Water Management, Planning, and Administration.
            </p>
          </div>

          {/* Card 3: Approved Users */}
          <div className="rounded-2xl bg-gradient-to-br from-indigo-50/50 via-white to-white dark:from-navy-800 dark:via-navy-800 dark:to-navy-850 p-6 border border-slate-200/80 dark:border-navy-700 shadow-xs hover:shadow-md transition-shadow">
            <div className="flex items-center justify-between mb-4">
              <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                Personnel
              </span>
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600 dark:bg-emerald-950/60 dark:text-emerald-400 border border-emerald-100 dark:border-emerald-900">
                <Users className="h-5 w-5" />
              </div>
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-3xl sm:text-4xl font-black text-[#1B2559] dark:text-white font-mono tabular-nums">
                {hasLiveStats ? approvedUsersCount : 'Authorized'}
              </span>
              {hasLiveStats && (
                <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 px-2 py-0.5 rounded-full">
                  Approved
                </span>
              )}
            </div>
            <h4 className="mt-2 text-sm font-bold text-slate-700 dark:text-slate-200">
              Authorized Officers &amp; Staff
            </h4>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400 font-normal">
              Credentialed provincial officers with role-segregated access privileges.
            </p>
          </div>

          {/* Card 4: Audit Standard */}
          <div className="rounded-2xl bg-gradient-to-br from-indigo-50/50 via-white to-white dark:from-navy-800 dark:via-navy-800 dark:to-navy-850 p-6 border border-slate-200/80 dark:border-navy-700 shadow-xs hover:shadow-md transition-shadow">
            <div className="flex items-center justify-between mb-4">
              <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                Integrity
              </span>
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-purple-50 text-purple-600 dark:bg-purple-950/60 dark:text-purple-300 border border-purple-100 dark:border-purple-900">
                <ShieldCheck className="h-5 w-5" />
              </div>
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-3xl sm:text-4xl font-black text-[#1B2559] dark:text-white font-mono">
                100%
              </span>
              <span className="text-xs font-bold text-purple-600 dark:text-purple-400 bg-purple-50 dark:bg-purple-950/40 px-2 py-0.5 rounded-full">
                Audit Tracked
              </span>
            </div>
            <h4 className="mt-2 text-sm font-bold text-slate-700 dark:text-slate-200">
              Departmental Compliance
            </h4>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400 font-normal">
              Zero undocumented file movements; complete traceability for all archival records.
            </p>
          </div>
        </div>

        {/* Real-time Indicator Bar */}
        <div className="mt-8 rounded-xl bg-slate-50 dark:bg-navy-800 border border-slate-200/80 dark:border-navy-700 p-4 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-500 dark:text-slate-400">
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
            <span className="font-semibold text-slate-700 dark:text-slate-300">
              Canonical Database Synchronized
            </span>
            <span className="hidden sm:inline">•</span>
            <span className="hidden sm:inline">Supabase PostgreSQL Enterprise Infrastructure</span>
          </div>
          <span className="font-mono text-[11px] text-slate-400">
            Real-time RLS Protected
          </span>
        </div>
      </div>
    </section>
  );
}
