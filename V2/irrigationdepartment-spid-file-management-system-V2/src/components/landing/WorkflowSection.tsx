'use client';

import React from 'react';
import {
  FolderPlus,
  Archive,
  Send,
  ClipboardCheck,
  RefreshCw,
  CheckCircle2,
  ArrowRight,
  GitCommit,
  Layers,
} from 'lucide-react';

export default function WorkflowSection() {
  const steps = [
    {
      step: '01',
      title: 'Register Departmental Files',
      description:
        'New dockets, project tenders, and administrative files are cataloged with distinct File Numbers, section attributions, and document period bounds.',
      icon: FolderPlus,
      accent: 'border-blue-500 bg-blue-50 text-[#4318FF] dark:bg-brand-950/60 dark:text-brand-300',
    },
    {
      step: '02',
      title: 'Organize Archive Records',
      description:
        'Files are systematically mapped to precise physical repository coordinates including Locker, Shelf Tier, and Shelf Position in the Central Record Room.',
      icon: Archive,
      accent: 'border-indigo-500 bg-indigo-50 text-indigo-600 dark:bg-indigo-950/60 dark:text-indigo-300',
    },
    {
      step: '03',
      title: 'Submit File Requests',
      description:
        'Authorized irrigation engineers and officers initiate formal digital requisitions indicating the required duration and purpose of review.',
      icon: Send,
      accent: 'border-sky-500 bg-sky-50 text-sky-600 dark:bg-sky-950/60 dark:text-sky-300',
    },
    {
      step: '04',
      title: 'Admin Review & Approval',
      description:
        'System administrators inspect the requisition, verify competing file demands or restrictions, and grant official authorization.',
      icon: ClipboardCheck,
      accent: 'border-purple-500 bg-purple-50 text-purple-600 dark:bg-purple-950/60 dark:text-purple-300',
    },
    {
      step: '05',
      title: 'Physical File Issuance',
      description:
        'The physical file is retrieved and handed to the approved officer, generating an official custody timestamp and scheduled return deadline.',
      icon: RefreshCw,
      accent: 'border-amber-500 bg-amber-50 text-amber-600 dark:bg-amber-950/60 dark:text-amber-300',
    },
    {
      step: '06',
      title: 'Return & Tracking',
      description:
        'Upon completion, the file is inspected, checked back into its physical repository coordinate, and the digital ledger logs the closed transaction.',
      icon: CheckCircle2,
      accent: 'border-emerald-500 bg-emerald-50 text-emerald-600 dark:bg-emerald-950/60 dark:text-emerald-400',
    },
  ];

  return (
    <section
      id="how-it-works"
      className="py-16 sm:py-24 bg-white dark:bg-navy-900 border-b border-slate-100 dark:border-navy-800"
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Section Header */}
        <div className="max-w-3xl mx-auto text-center">
          <div className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 dark:bg-emerald-950/50 px-3 py-1 text-xs font-bold text-emerald-700 dark:text-emerald-300 border border-emerald-200/80 dark:border-emerald-900 mb-3">
            <GitCommit className="h-3.5 w-3.5" />
            <span>OPERATIONAL WORKFLOW</span>
          </div>
          <h2 className="text-2xl sm:text-3xl md:text-4xl font-extrabold text-[#1B2559] dark:text-white tracking-tight">
            How Departmental Records Circulate
          </h2>
          <p className="mt-4 text-sm sm:text-base text-slate-600 dark:text-slate-300 leading-relaxed font-normal">
            A seamless, transparent 6-stage lifecycle ensuring physical document preservation
            while providing digital accessibility to certified provincial personnel.
          </p>
        </div>

        {/* 6-Step Visual Workflow Grid */}
        <div className="mt-16 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 relative">
          {steps.map((item, index) => {
            const Icon = item.icon;
            return (
              <div
                key={item.step}
                className="group relative rounded-2xl bg-slate-50/70 dark:bg-navy-800/70 p-6 border border-slate-200/80 dark:border-navy-700 hover:border-[#4318FF]/40 dark:hover:border-brand-500/40 transition-all duration-300 hover:shadow-lg hover:shadow-indigo-500/5 hover:-translate-y-1 flex flex-col justify-between"
              >
                <div>
                  {/* Step Header */}
                  <div className="flex items-center justify-between mb-5">
                    <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-white dark:bg-navy-900 font-mono text-xs font-extrabold text-[#1B2559] dark:text-white border border-slate-200 dark:border-navy-700 shadow-xs">
                      {item.step}
                    </span>
                    <div
                      className={`flex h-11 w-11 items-center justify-center rounded-xl border ${item.accent} shadow-xs group-hover:scale-105 transition-transform`}
                    >
                      <Icon className="h-5 w-5" />
                    </div>
                  </div>

                  <h3 className="text-base font-bold text-[#1B2559] dark:text-white group-hover:text-[#4318FF] dark:group-hover:text-brand-300 transition-colors">
                    {item.title}
                  </h3>
                  <p className="mt-2 text-xs sm:text-sm text-slate-600 dark:text-slate-300 leading-relaxed font-normal">
                    {item.description}
                  </p>
                </div>

                <div className="mt-6 pt-3 border-t border-slate-200/60 dark:border-navy-700/60 flex items-center gap-1.5 text-[11px] font-bold text-slate-400">
                  <span>Phase {index + 1} of 6</span>
                  {index < steps.length - 1 && (
                    <ArrowRight className="h-3 w-3 ml-auto text-slate-300 group-hover:text-[#4318FF] transition-colors" />
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
