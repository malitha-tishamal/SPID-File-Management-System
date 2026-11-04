'use client';

import React from 'react';
import {
  FolderPlus,
  Search,
  ShieldCheck,
  Users,
  Send,
  RefreshCw,
  BarChart3,
  Bell,
  Archive,
  FileSpreadsheet,
  CheckCircle2,
  Sparkles,
} from 'lucide-react';

export default function FeaturesSection() {
  const features = [
    {
      title: 'Digital File Registration',
      description:
        'Rapid intake and metadata indexing of incoming records, start/end dates, page numbers, minute sheets, and registrar attribution.',
      icon: FolderPlus,
      color: 'text-blue-600 bg-blue-50 dark:bg-brand-950/50 dark:text-brand-300 border-blue-200 dark:border-blue-900',
    },
    {
      title: 'Advanced File Search',
      description:
        'Instant multi-field search across File Numbers, subjects, registration officers, and departmental divisions with real-time query debounce.',
      icon: Search,
      color: 'text-indigo-600 bg-indigo-50 dark:bg-indigo-950/50 dark:text-indigo-300 border-indigo-200 dark:border-indigo-900',
    },
    {
      title: 'Secure Authentication',
      description:
        'Enterprise-grade Supabase credential verification, cryptographic sessions, brute-force lockouts, and administrative approval gates.',
      icon: ShieldCheck,
      color: 'text-emerald-600 bg-emerald-50 dark:bg-emerald-950/50 dark:text-emerald-300 border-emerald-200 dark:border-emerald-900',
    },
    {
      title: 'User & Section Management',
      description:
        'Administrative directory to manage departmental staff, assign division allocations (Engineering, Accounts, Administration), and control role privileges.',
      icon: Users,
      color: 'text-amber-600 bg-amber-50 dark:bg-amber-950/50 dark:text-amber-300 border-amber-200 dark:border-amber-900',
    },
    {
      title: 'File Request Management',
      description:
        'Streamlined requisition workflow enabling authorized technical staff to request physical archives with priority indicators and duration specifications.',
      icon: Send,
      color: 'text-cyan-600 bg-cyan-50 dark:bg-cyan-950/50 dark:text-cyan-300 border-cyan-200 dark:border-cyan-900',
    },
    {
      title: 'File Issuance & Returns',
      description:
        'Complete circulation ledger monitoring current borrowers, expected return dates, extension requests, and automated overdue notices.',
      icon: RefreshCw,
      color: 'text-teal-600 bg-teal-50 dark:bg-teal-950/50 dark:text-teal-300 border-teal-200 dark:border-teal-900',
    },
    {
      title: 'Administrative Dashboard',
      description:
        'Comprehensive command center with real-time volume metrics, active files breakdown, section analytics, and quick approval controls.',
      icon: BarChart3,
      color: 'text-[#4318FF] bg-[#EEF2FF] dark:bg-brand-950/50 dark:text-brand-300 border-indigo-200 dark:border-indigo-900',
    },
    {
      title: 'Notifications & Alerts',
      description:
        'Immediate broadcast alerts for due-date reminders, pending request reviews, status transitions, and administrative system warnings.',
      icon: Bell,
      color: 'text-rose-600 bg-rose-50 dark:bg-rose-950/50 dark:text-rose-300 border-rose-200 dark:border-rose-900',
    },
    {
      title: 'Digital Archive Management',
      description:
        'Precise storage coordinate cataloging mapping records to specific physical record rooms, lockers, shelves, and folder positions.',
      icon: Archive,
      color: 'text-purple-600 bg-purple-50 dark:bg-purple-950/50 dark:text-purple-300 border-purple-200 dark:border-purple-900',
    },
    {
      title: 'Reports & Data Export',
      description:
        'Audit-ready data exportation to Excel/CSV spreadsheets and printable ledgers conforming to government archival audit guidelines.',
      icon: FileSpreadsheet,
      color: 'text-sky-600 bg-sky-50 dark:bg-sky-950/50 dark:text-sky-300 border-sky-200 dark:border-sky-900',
    },
  ];

  return (
    <section
      id="features"
      className="py-16 sm:py-24 bg-slate-50/70 dark:bg-navy-950/70 border-b border-slate-100 dark:border-navy-800"
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Section Header */}
        <div className="max-w-3xl mx-auto text-center">
          <div className="inline-flex items-center gap-1.5 rounded-full bg-blue-50 dark:bg-brand-950/50 px-3 py-1 text-xs font-bold text-[#4318FF] dark:text-brand-300 border border-blue-200/80 dark:border-brand-900 mb-3">
            <Sparkles className="h-3.5 w-3.5" />
            <span>ENTERPRISE CAPABILITIES</span>
          </div>
          <h2 className="text-2xl sm:text-3xl md:text-4xl font-extrabold text-[#1B2559] dark:text-white tracking-tight">
            Comprehensive Features Built for Departmental Efficiency
          </h2>
          <p className="mt-4 text-sm sm:text-base text-slate-600 dark:text-slate-300 leading-relaxed font-normal">
            Every capability in SPID-FMS has been engineered specifically to align with
            provincial irrigation governance, maintaining complete chain of custody and
            archival preservation.
          </p>
        </div>

        {/* 10 Feature Cards Grid */}
        <div className="mt-14 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {features.map((feature, idx) => {
            const Icon = feature.icon;
            return (
              <div
                key={feature.title}
                className="group relative rounded-2xl bg-white dark:bg-navy-800 p-6 border border-slate-200/80 dark:border-navy-700 shadow-xs hover:shadow-xl hover:shadow-indigo-500/10 hover:border-[#4318FF]/40 dark:hover:border-brand-500/40 transition-all duration-300 hover:-translate-y-1 flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-center justify-between mb-4">
                    <div
                      className={`flex h-11 w-11 items-center justify-center rounded-xl border ${feature.color} shadow-xs group-hover:scale-105 transition-transform`}
                    >
                      <Icon className="h-5 w-5" />
                    </div>
                    <span className="text-[10px] font-mono font-bold text-slate-400 dark:text-slate-500">
                      #{String(idx + 1).padStart(2, '0')}
                    </span>
                  </div>

                  <h3 className="text-base font-bold text-[#1B2559] dark:text-white group-hover:text-[#4318FF] dark:group-hover:text-brand-300 transition-colors">
                    {feature.title}
                  </h3>
                  <p className="mt-2 text-xs sm:text-sm text-slate-600 dark:text-slate-300 leading-relaxed font-normal">
                    {feature.description}
                  </p>
                </div>

                <div className="mt-4 pt-3 border-t border-slate-100 dark:border-navy-700/60 flex items-center justify-between text-[11px] font-bold text-slate-400 group-hover:text-[#4318FF] dark:group-hover:text-brand-300 transition-colors">
                  <span>Standard Operational Protocol</span>
                  <CheckCircle2 className="h-3.5 w-3.5 opacity-60 group-hover:opacity-100 transition-opacity" />
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
