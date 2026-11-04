'use client';

import React from 'react';
import {
  FolderArchive,
  ShieldCheck,
  Search,
  Database,
  CheckCircle2,
  Building2,
  Layers,
  MapPin,
  LockKeyhole,
} from 'lucide-react';

export default function AboutSection() {
  const highlights = [
    {
      title: 'Digital File Management',
      description:
        'Systematic registration, structured metadata classification, and continuous indexing of all departmental engineering dockets, tenders, and administrative files.',
      icon: FolderArchive,
      accent: 'text-[#4318FF] bg-blue-50 dark:bg-brand-950/50 dark:text-brand-300 border-indigo-100 dark:border-brand-900',
    },
    {
      title: 'Secure Access Control',
      description:
        'Rigorous Role-Based Access Control (RBAC) separating administrative governance from staff request workflows, preventing unauthorized modifications and data leakage.',
      icon: ShieldCheck,
      accent: 'text-emerald-600 bg-emerald-50 dark:bg-emerald-950/50 dark:text-emerald-400 border-emerald-100 dark:border-emerald-900',
    },
    {
      title: 'Efficient File Tracking',
      description:
        'End-to-end custody tracking that connects digital records with precise physical storage coordinates (Record Room, Locker, Shelf, Position) and borrower history.',
      icon: Search,
      accent: 'text-sky-600 bg-sky-50 dark:bg-sky-950/50 dark:text-sky-400 border-sky-100 dark:border-sky-900',
    },
    {
      title: 'Centralized Records Management',
      description:
        'A unified canonical repository eliminating fragmented record-keeping, misplaced documentation, and administrative delays across all Southern Province divisions.',
      icon: Database,
      accent: 'text-purple-600 bg-purple-50 dark:bg-purple-950/50 dark:text-purple-400 border-purple-100 dark:border-purple-900',
    },
  ];

  return (
    <section
      id="about"
      className="py-16 sm:py-24 bg-white dark:bg-navy-900 border-b border-slate-100 dark:border-navy-800"
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Section Header */}
        <div className="max-w-3xl mx-auto text-center">
          <div className="inline-flex items-center gap-1.5 rounded-full bg-[#EEF2FF] dark:bg-brand-950/50 px-3 py-1 text-xs font-bold text-[#4318FF] dark:text-brand-300 border border-indigo-100 dark:border-brand-900 mb-3">
            <Building2 className="h-3.5 w-3.5" />
            <span>DEPARTMENTAL OVERVIEW</span>
          </div>
          <h2 className="text-2xl sm:text-3xl md:text-4xl font-extrabold text-[#1B2559] dark:text-white tracking-tight">
            Engineered for Departmental Accountability &amp; Archival Integrity
          </h2>
          <p className="mt-4 text-sm sm:text-base text-slate-600 dark:text-slate-300 leading-relaxed font-normal">
            The Southern Provincial Irrigation Department (SPID) oversees the planning,
            construction, rehabilitation, and maintenance of major and medium irrigation
            schemes, flood protection infrastructure, and water resources across Galle,
            Matara, and Hambantota districts. SPID-FMS represents the department&apos;s
            official digital transition toward transparent, rapid, and audit-compliant records
            management.
          </p>
        </div>

        {/* 4 Core Pillars Grid */}
        <div className="mt-14 grid grid-cols-1 md:grid-cols-2 gap-6 lg:gap-8">
          {highlights.map((item, index) => {
            const Icon = item.icon;
            return (
              <div
                key={item.title}
                className="group relative rounded-2xl bg-slate-50/60 dark:bg-navy-800/60 p-7 border border-slate-200/80 dark:border-navy-700 hover:border-[#4318FF]/40 dark:hover:border-brand-500/40 transition-all duration-300 hover:shadow-lg hover:shadow-indigo-500/5 hover:-translate-y-1"
              >
                <div className="flex items-start gap-4">
                  <div
                    className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border ${item.accent} shadow-xs group-hover:scale-105 transition-transform`}
                  >
                    <Icon className="h-6 w-6" />
                  </div>
                  <div>
                    <span className="text-[10px] font-mono font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider block mb-1">
                      Pillar 0{index + 1}
                    </span>
                    <h3 className="text-base sm:text-lg font-bold text-[#1B2559] dark:text-white group-hover:text-[#4318FF] dark:group-hover:text-brand-300 transition-colors">
                      {item.title}
                    </h3>
                    <p className="mt-2 text-xs sm:text-sm text-slate-600 dark:text-slate-300 leading-relaxed font-normal">
                      {item.description}
                    </p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Department Jurisdictional Scope Callout */}
        <div className="mt-12 rounded-2xl bg-gradient-to-r from-sky-900 via-indigo-950 to-[#0b1437] text-white p-6 sm:p-8 shadow-xl relative overflow-hidden">
          <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
            <div className="max-w-2xl">
              <span className="inline-block rounded-md bg-white/10 px-2.5 py-1 text-[11px] font-bold text-sky-200 uppercase tracking-wider mb-2">
                Provincial Coverage
              </span>
              <h4 className="text-lg sm:text-xl font-bold text-white">
                Serving the Southern Province Irrigation Network
              </h4>
              <p className="mt-1.5 text-xs sm:text-sm text-slate-300 leading-relaxed">
                Covering Nilwala, Gin, Walawe, and Kirama Oya river basins, along with hundreds of
                rural agricultural tanks, anicuts, and feeder canals managed by SPID divisional
                engineering offices.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-3 shrink-0">
              <span className="rounded-xl bg-white/10 px-3.5 py-2 text-xs font-bold text-white border border-white/15">
                📍 Galle District
              </span>
              <span className="rounded-xl bg-white/10 px-3.5 py-2 text-xs font-bold text-white border border-white/15">
                📍 Matara District
              </span>
              <span className="rounded-xl bg-white/10 px-3.5 py-2 text-xs font-bold text-white border border-white/15">
                📍 Hambantota District
              </span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
