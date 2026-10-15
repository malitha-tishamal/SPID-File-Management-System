'use client';
import React, { ReactNode } from 'react';

/**
 * Reusable page header: breadcrumb trail, title, subtitle and a right-side
 * action slot. Shared by every directory page so headings stay consistent
 * under the single navbar rendered by the admin layout.
 */
export default function PageHeader({
  crumbs,
  title,
  subtitle,
  right,
}: {
  crumbs: string[];
  title: string;
  subtitle?: string;
  right?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
      <div className="flex flex-col gap-1">
        <nav className="flex flex-wrap items-center gap-1.5 text-[11px] font-bold text-slate-700 dark:text-gray-300">
          {crumbs.map((crumb, i) => {
            const last = i === crumbs.length - 1;
            return (
              <span key={crumb} className="flex items-center gap-1.5">
                {i > 0 && <span className="text-slate-400 dark:text-gray-600 font-bold">/</span>}
                {last ? (
                  <span className="font-extrabold text-[#4318FF] dark:text-brand-300">
                    {crumb}
                  </span>
                ) : (
                  <span className="hover:text-black dark:hover:text-white transition-colors">{crumb}</span>
                )}
              </span>
            );
          })}
        </nav>
        <h1 className="text-[26px] font-extrabold leading-tight text-slate-950 dark:text-white">{title}</h1>
        {subtitle && (
          <p className="max-w-2xl text-[13px] font-medium leading-relaxed text-slate-700 dark:text-gray-300">
            {subtitle}
          </p>
        )}
      </div>
      {right && <div className="flex shrink-0 flex-wrap items-center gap-2.5">{right}</div>}
    </div>
  );
}
