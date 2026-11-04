'use client';

import React from 'react';
import {
  ShieldCheck,
  LockKeyhole,
  Clock,
  KeyRound,
  ClipboardCheck,
  Database,
  Building2,
  CheckCircle2,
} from 'lucide-react';

export default function SecuritySection() {
  const securityFeatures = [
    {
      title: 'Role-Based Access Control (RBAC)',
      description:
        'Strict privilege boundary between Administrators (approval, registration, deletion) and Staff (viewing, requesting, extension submission).',
      icon: ShieldCheck,
      color: 'text-emerald-600 bg-emerald-50 dark:bg-emerald-950/50 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800',
    },
    {
      title: 'Cryptographic Authentication',
      description:
        'Hardened password hashing via Supabase Auth, prevention of credential brute-forcing with progressive lockout cooling periods.',
      icon: LockKeyhole,
      color: 'text-blue-600 bg-blue-50 dark:bg-blue-950/50 dark:text-blue-400 border-blue-200 dark:border-blue-800',
    },
    {
      title: 'Protected User Sessions & Watchdog',
      description:
        'Client-side SessionWatchdog actively tracking verified interactions and expiring stale sessions after 2 hours of inactivity.',
      icon: Clock,
      color: 'text-amber-600 bg-amber-50 dark:bg-amber-950/50 dark:text-amber-400 border-amber-200 dark:border-amber-800',
    },
    {
      title: 'Controlled File Circulation',
      description:
        'Zero undocumented file movements. Physical dockets are exclusively released against authorized digital checkout vouchers.',
      icon: KeyRound,
      color: 'text-purple-600 bg-purple-50 dark:bg-purple-950/50 dark:text-purple-400 border-purple-200 dark:border-purple-800',
    },
    {
      title: 'Comprehensive Audit Logging',
      description:
        'Complete chronological audit ledger detailing who created, updated, approved, issued, and returned each departmental document.',
      icon: ClipboardCheck,
      color: 'text-sky-600 bg-sky-50 dark:bg-sky-950/50 dark:text-sky-400 border-sky-200 dark:border-sky-800',
    },
    {
      title: 'Departmental Data Protection',
      description:
        'PostgreSQL Row-Level Security (RLS) policies enforcing database-level data isolation across Southern Province irrigation divisions.',
      icon: Database,
      color: 'text-teal-600 bg-teal-50 dark:bg-teal-950/50 dark:text-teal-400 border-teal-200 dark:border-teal-800',
    },
  ];

  return (
    <section
      id="security"
      className="py-16 sm:py-24 bg-slate-50/70 dark:bg-navy-950/70 border-b border-slate-100 dark:border-navy-800"
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Section Header */}
        <div className="max-w-3xl mx-auto text-center">
          <div className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 dark:bg-emerald-950/50 px-3 py-1 text-xs font-bold text-emerald-700 dark:text-emerald-300 border border-emerald-200/80 dark:border-emerald-900 mb-3">
            <ShieldCheck className="h-3.5 w-3.5" />
            <span>SECURITY &amp; COMPLIANCE</span>
          </div>
          <h2 className="text-2xl sm:text-3xl md:text-4xl font-extrabold text-[#1B2559] dark:text-white tracking-tight">
            Enterprise-Grade Departmental Protection
          </h2>
          <p className="mt-4 text-sm sm:text-base text-slate-600 dark:text-slate-300 leading-relaxed font-normal">
            Designed in accordance with government records protection protocols, ensuring that
            critical irrigation engineering dossiers, land deeds, and contractual documentation
            remain tamper-proof and fully accounted for.
          </p>
        </div>

        {/* 6 Security Cards Grid */}
        <div className="mt-14 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {securityFeatures.map((item) => {
            const Icon = item.icon;
            return (
              <div
                key={item.title}
                className="group relative rounded-2xl bg-white dark:bg-navy-800 p-6 border border-slate-200/80 dark:border-navy-700 shadow-xs hover:shadow-xl hover:shadow-emerald-500/10 hover:border-emerald-500/40 dark:hover:border-emerald-500/40 transition-all duration-300 hover:-translate-y-1 flex flex-col justify-between"
              >
                <div>
                  <div
                    className={`flex h-11 w-11 items-center justify-center rounded-xl border ${item.color} shadow-xs mb-4 group-hover:scale-105 transition-transform`}
                  >
                    <Icon className="h-5 w-5" />
                  </div>

                  <h3 className="text-base font-bold text-[#1B2559] dark:text-white group-hover:text-emerald-600 dark:group-hover:text-emerald-400 transition-colors">
                    {item.title}
                  </h3>
                  <p className="mt-2 text-xs sm:text-sm text-slate-600 dark:text-slate-300 leading-relaxed font-normal">
                    {item.description}
                  </p>
                </div>

                <div className="mt-5 pt-3 border-t border-slate-100 dark:border-navy-700/60 flex items-center gap-1.5 text-[11px] font-bold text-emerald-600 dark:text-emerald-400">
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  <span>Verified Security Standard</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
