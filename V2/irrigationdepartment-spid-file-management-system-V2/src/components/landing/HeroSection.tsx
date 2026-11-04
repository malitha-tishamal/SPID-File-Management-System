'use client';

import React from 'react';
import Image from 'next/image';
import Link from 'next/link';
import {
  ArrowRight,
  ShieldCheck,
  FolderArchive,
  Search,
  CheckCircle2,
  LockKeyhole,
  FileText,
  Clock,
  Sparkles,
  MapPin,
  Building2,
  Layers,
  ArrowUpRight,
} from 'lucide-react';

interface HeroSectionProps {
  isAuthenticated?: boolean;
  dashboardUrl?: string;
  totalFiles?: number;
}

export default function HeroSection({
  isAuthenticated = false,
  dashboardUrl = '/auth/sign-in',
  totalFiles = 49,
}: HeroSectionProps) {
  return (
    <section
      id="hero"
      className="relative pt-28 sm:pt-36 pb-16 sm:pb-24 overflow-hidden bg-gradient-to-b from-slate-50 via-indigo-50/20 to-white dark:from-navy-950 dark:via-navy-900 dark:to-navy-900 border-b border-slate-100 dark:border-navy-800"
    >
      {/* Subtle Background Radial Gradients & Grid */}
      <div
        className="absolute inset-0 pointer-events-none opacity-40 dark:opacity-20"
        style={{
          backgroundImage:
            'radial-gradient(circle at 50% 0%, rgba(67, 24, 255, 0.15) 0%, transparent 60%), radial-gradient(circle at 85% 30%, rgba(5, 205, 153, 0.1) 0%, transparent 40%)',
        }}
      />
      <div
        aria-hidden="true"
        className="absolute inset-0 pointer-events-none opacity-[0.03] dark:opacity-[0.05]"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg width='40' height='40' viewBox='0 0 40 40' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M0 0h40v40H0V0zm1 1h38v38H1V1z' fill='%231B2559' fill-rule='evenodd'/%3E%3C/svg%3E")`,
        }}
      />

      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 lg:gap-8 items-center">
          {/* Left Column: Heading, Subheading & CTAs */}
          <div className="lg:col-span-7 flex flex-col items-start text-left">
            {/* Government Department Badge */}
            <div className="inline-flex items-center gap-2 rounded-full border border-sky-200/80 bg-white/90 dark:bg-navy-800/90 dark:border-sky-800/60 px-3.5 py-1.5 shadow-xs mb-6 backdrop-blur-sm">
              <span className="flex h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
              <span className="text-[11px] sm:text-xs font-bold text-sky-800 dark:text-sky-300 tracking-wide uppercase">
                Government of Sri Lanka • Southern Provincial Council
              </span>
            </div>

            {/* SPID Official Logo — Government Identity */}
            <div className="flex items-center gap-4 mb-5 p-3 rounded-2xl bg-white/80 dark:bg-navy-800/80 border border-slate-200/70 dark:border-navy-700/70 backdrop-blur-sm shadow-xs w-fit">
              <div className="relative h-14 w-14 sm:h-16 sm:w-16 rounded-xl bg-white p-1.5 shadow-sm border border-slate-200/80 dark:border-navy-700 flex items-center justify-center shrink-0">
                <Image
                  src="/img/spid/spid-logo.png"
                  alt="Southern Provincial Irrigation Department Official Emblem"
                  width={64}
                  height={64}
                  priority
                  className="h-full w-full object-contain select-none"
                />
              </div>
              <div className="flex flex-col text-left">
                <span className="text-[10px] sm:text-[11px] font-black uppercase tracking-widest text-sky-700 dark:text-sky-400 leading-tight">
                  Southern Provincial Irrigation Department
                </span>
                <span className="text-sm sm:text-base font-extrabold text-[#1B2559] dark:text-white leading-tight mt-0.5">
                  SPID-FMS
                </span>
                <span className="text-[10px] text-slate-500 dark:text-slate-400 font-medium mt-0.5">
                  Official Digital Records Portal
                </span>
              </div>
            </div>

            {/* Main Heading */}
            <h1 className="text-3xl sm:text-4xl md:text-5xl lg:text-[52px] font-black tracking-tight text-[#1B2559] dark:text-white leading-[1.12]">
              Modernizing Departmental{' '}
              <span className="bg-gradient-to-r from-[#4318FF] via-indigo-600 to-sky-600 bg-clip-text text-transparent">
                Records Management
              </span>
            </h1>

            {/* Subheading */}
            <p className="mt-5 text-sm sm:text-base md:text-lg text-slate-600 dark:text-slate-300 leading-relaxed max-w-2xl font-normal">
              A secure and centralized digital platform for managing, tracking,
              and accessing departmental files efficiently across all divisions of
              the Southern Provincial Irrigation Department.
            </p>

            {/* CTA Buttons */}
            <div className="mt-8 flex flex-wrap items-center gap-3 sm:gap-4 w-full sm:w-auto">
              <Link
                href={isAuthenticated ? dashboardUrl : '/auth/sign-in'}
                className="inline-flex w-full sm:w-auto items-center justify-center gap-2.5 rounded-xl bg-[#4318FF] px-6 py-3.5 text-sm font-bold text-white shadow-lg shadow-brand-500/25 hover:bg-[#3311DB] hover:shadow-brand-500/35 transition-all hover:-translate-y-0.5 active:translate-y-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#4318FF]"
              >
                <span>Access System</span>
                <ArrowRight className="h-4 w-4" />
              </Link>
              <a
                href="#features"
                className="inline-flex w-full sm:w-auto items-center justify-center gap-2 rounded-xl border border-slate-300/90 bg-white dark:bg-navy-800 dark:border-navy-700 px-5 py-3.5 text-sm font-bold text-slate-700 dark:text-slate-200 shadow-xs hover:bg-slate-50 dark:hover:bg-navy-700 transition-all hover:-translate-y-0.5 active:translate-y-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-400"
              >
                <FolderArchive className="h-4 w-4 text-[#4318FF] dark:text-brand-300" />
                <span>Explore Features</span>
              </a>
            </div>

            {/* Trust Badges Row */}
            <div className="mt-10 pt-6 border-t border-slate-200/80 dark:border-navy-700/80 grid grid-cols-2 sm:grid-cols-3 gap-4 w-full">
              <div className="flex items-center gap-2.5">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-400 border border-emerald-100 dark:border-emerald-900">
                  <ShieldCheck className="h-4 w-4" />
                </div>
                <div>
                  <p className="text-[11px] font-bold text-slate-800 dark:text-slate-200 leading-tight">
                    RBAC Enforced
                  </p>
                  <p className="text-[10px] text-slate-400">Role-Segregated</p>
                </div>
              </div>

              <div className="flex items-center gap-2.5">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-[#4318FF] dark:bg-brand-950/40 dark:text-brand-300 border border-indigo-100 dark:border-brand-900">
                  <Layers className="h-4 w-4" />
                </div>
                <div>
                  <p className="text-[11px] font-bold text-slate-800 dark:text-slate-200 leading-tight">
                    Dual Repository
                  </p>
                  <p className="text-[10px] text-slate-400">Digital & Physical</p>
                </div>
              </div>

              <div className="flex items-center gap-2.5 col-span-2 sm:col-span-1">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-sky-50 text-sky-600 dark:bg-sky-950/40 dark:text-sky-400 border border-sky-100 dark:border-sky-900">
                  <Clock className="h-4 w-4" />
                </div>
                <div>
                  <p className="text-[11px] font-bold text-slate-800 dark:text-slate-200 leading-tight">
                    Audit Trail
                  </p>
                  <p className="text-[10px] text-slate-400">Full Traceability</p>
                </div>
              </div>
            </div>
          </div>

          {/* Right Column: Modern Digital Archive Dashboard Preview */}
          <div className="lg:col-span-5 relative">
            {/* Ambient Background Glow */}
            <div className="absolute -inset-4 bg-gradient-to-tr from-[#4318FF]/20 to-teal-400/20 rounded-3xl blur-2xl opacity-60 dark:opacity-40" />

            {/* Central Terminal / Dashboard Card */}
            <div className="relative rounded-2xl bg-white dark:bg-navy-800 border border-slate-200/90 dark:border-navy-700 shadow-2xl p-5 sm:p-6 backdrop-blur-xl">
              {/* Window Header */}
              <div className="flex items-center justify-between pb-4 border-b border-slate-100 dark:border-navy-700">
                <div className="flex items-center gap-2">
                  <div className="flex gap-1.5">
                    <span className="h-2.5 w-2.5 rounded-full bg-rose-400" />
                    <span className="h-2.5 w-2.5 rounded-full bg-amber-400" />
                    <span className="h-2.5 w-2.5 rounded-full bg-emerald-400" />
                  </div>
                  <span className="ml-2 text-[11px] font-mono font-semibold text-slate-400 dark:text-slate-400">
                    SPID Central Ledger v3.0
                  </span>
                </div>
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-0.5 text-[10px] font-bold text-emerald-600 dark:bg-emerald-950/50 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-ping" />
                  <span>Verified Canonical</span>
                </span>
              </div>

              {/* Mock Search Bar */}
              <div className="mt-4 flex items-center rounded-xl bg-slate-50 dark:bg-navy-900 border border-slate-200/80 dark:border-navy-700 px-3 py-2 text-xs text-slate-400">
                <Search className="h-3.5 w-3.5 text-slate-400 shrink-0 mr-2" />
                <span className="text-slate-500 dark:text-slate-400 font-mono text-[11px] truncate">
                  PDI/SPID/2026/WR-084...
                </span>
                <span className="ml-auto rounded-md bg-slate-200/70 dark:bg-navy-800 px-1.5 py-0.5 text-[9px] font-mono text-slate-600 dark:text-slate-300">
                  ⌘K
                </span>
              </div>

              {/* Sample Official Record Card */}
              <div className="mt-4 rounded-xl bg-gradient-to-br from-indigo-50/60 to-white dark:from-navy-900 dark:to-navy-850 p-4 border border-indigo-100 dark:border-navy-700 shadow-xs">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <span className="inline-block rounded-md bg-[#4318FF]/10 text-[#4318FF] dark:text-brand-300 font-mono text-[11px] font-bold px-2 py-0.5 mb-1.5">
                      PDI/SPIDF/2026/ENG-042
                    </span>
                    <h4 className="text-xs sm:text-sm font-bold text-slate-900 dark:text-white leading-snug">
                      Nilwala Ganga Flood Mitigation &amp; Bund Engineering Survey
                    </h4>
                    <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                      <Building2 className="h-3 w-3 text-slate-400" />
                      <span>Irrigation Engineering &amp; Hydrology Division</span>
                    </p>
                  </div>
                  <span className="inline-flex shrink-0 items-center gap-1 rounded-md bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 px-2 py-1 text-[10px] font-bold border border-emerald-200 dark:border-emerald-800">
                    <CheckCircle2 className="h-3 w-3" />
                    <span>Archived</span>
                  </span>
                </div>

                {/* Storage Coordinate Grid */}
                <div className="mt-3.5 pt-3 border-t border-slate-200/60 dark:border-navy-700/60 grid grid-cols-3 gap-2 text-[10px]">
                  <div className="rounded-lg bg-white dark:bg-navy-800 p-2 border border-slate-100 dark:border-navy-700">
                    <span className="text-slate-400 block font-medium">Locker</span>
                    <span className="font-bold text-slate-700 dark:text-slate-200 font-mono">
                      L-03 (East)
                    </span>
                  </div>
                  <div className="rounded-lg bg-white dark:bg-navy-800 p-2 border border-slate-100 dark:border-navy-700">
                    <span className="text-slate-400 block font-medium">Shelf</span>
                    <span className="font-bold text-slate-700 dark:text-slate-200 font-mono">
                      Tier S-2
                    </span>
                  </div>
                  <div className="rounded-lg bg-white dark:bg-navy-800 p-2 border border-slate-100 dark:border-navy-700">
                    <span className="text-slate-400 block font-medium">Position</span>
                    <span className="font-bold text-slate-700 dark:text-slate-200 font-mono">
                      Front-08
                    </span>
                  </div>
                </div>
              </div>

              {/* Second Record Row: Active Circulation */}
              <div className="mt-3 rounded-xl bg-white dark:bg-navy-900/60 p-3.5 border border-slate-200/70 dark:border-navy-700 flex items-center justify-between text-xs">
                <div className="flex items-center gap-2.5">
                  <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-sky-50 text-sky-600 dark:bg-sky-950/50 dark:text-sky-300">
                    <FileText className="h-3.5 w-3.5" />
                  </div>
                  <div>
                    <span className="font-mono text-[11px] font-bold text-slate-800 dark:text-slate-200 block">
                      PDI/SPIDF/26/M.Main/01
                    </span>
                    <span className="text-[10px] text-slate-400 block">
                      Issued to Planning Engineer • Due in 4 days
                    </span>
                  </div>
                </div>
                <span className="rounded-full bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900 px-2 py-0.5 text-[10px] font-bold text-amber-700 dark:text-amber-300">
                  On Issue
                </span>
              </div>

              {/* Floating Mini-Badge 1: Security */}
              <div className="absolute -top-3 -right-3 hidden sm:flex items-center gap-2 rounded-xl bg-white dark:bg-navy-900 border border-slate-200/90 dark:border-navy-700 p-2.5 shadow-lg backdrop-blur-md">
                <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600 dark:bg-emerald-950/50 dark:text-emerald-400">
                  <ShieldCheck className="h-4 w-4" />
                </div>
                <div>
                  <p className="text-[11px] font-bold text-slate-800 dark:text-slate-200 leading-none">
                    Security Active
                  </p>
                  <p className="text-[9px] text-slate-400 mt-0.5">Encrypted Access</p>
                </div>
              </div>

              {/* Floating Mini-Badge 2: Records Count */}
              <div className="absolute -bottom-4 -left-4 hidden sm:flex items-center gap-2.5 rounded-xl bg-white dark:bg-navy-900 border border-slate-200/90 dark:border-navy-700 p-2.5 shadow-lg backdrop-blur-md">
                <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#4318FF]/10 text-[#4318FF] dark:text-brand-300">
                  <FolderArchive className="h-4 w-4" />
                </div>
                <div>
                  <p className="text-[11px] font-bold text-slate-800 dark:text-slate-200 leading-none">
                    Digital Repository
                  </p>
                  <p className="text-[9px] text-slate-400 mt-0.5">
                    {totalFiles} Verified Records Live
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
