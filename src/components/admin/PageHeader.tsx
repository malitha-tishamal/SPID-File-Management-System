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
        <nav className="flex flex-wrap items-center gap-1.5 text-[11px] font-medium text-gray-400 dark:text-gray-500">
          {crumbs.map((crumb, i) => {
            const last = i === crumbs.length - 1;
            return (
              <span key={crumb} className="flex items-center gap-1.5">
                {i > 0 && <span className="text-gray-300 dark:text-gray-600">/</span>}
                {last ? (
                  <span className="rounded-md bg-[#4318FF] px-2 py-0.5 text-[10px] font-bold text-white">
                    {crumb}
                  </span>
                ) : (
                  <span>{crumb}</span>
                )}
              </span>
            );
          })}
        </nav>
        <h1 className="text-[26px] font-bold leading-tight text-navy-700 dark:text-white">{title}</h1>
        {subtitle && (
          <p className="max-w-2xl text-[13px] leading-relaxed text-gray-500 dark:text-gray-400">
            {subtitle}
          </p>
        )}
      </div>
      {right && <div className="flex shrink-0 flex-wrap items-center gap-2.5">{right}</div>}
    </div>
  );
}
