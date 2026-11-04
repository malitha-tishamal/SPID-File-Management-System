'use client';

import React, { useRef } from 'react';
import { FiActivity, FiCheckCircle, FiClock, FiXCircle } from 'react-icons/fi';
import {
  STAFF_REQUEST_TABS,
  type StaffRequestTab,
} from 'lib/staffRequests';
import type { StaffRequestTabCountMap } from 'types/staffRequests';

const TAB_ICON: Record<StaffRequestTab, React.ComponentType<{ className?: string }>> = {
  ongoing: FiActivity,
  pending: FiClock,
  closed: FiCheckCircle,
  cancelled: FiXCircle,
};

const TAB_BADGE_IDLE: Record<StaffRequestTab, string> = {
  ongoing:
    'bg-[#F4F2FF] text-[#4318FF] dark:bg-brand-900/50 dark:text-brand-300',
  pending: 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300',
  closed:
    'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300',
  cancelled: 'bg-slate-100 text-slate-600 dark:bg-navy-700 dark:text-slate-300',
};

interface RequestTabsProps {
  activeTab: StaffRequestTab;
  counts: StaffRequestTabCountMap;
  onChange: (tab: StaffRequestTab) => void;
}

/**
 * Tablist with roving tabindex: only the selected tab is in the tab order and
 * Left/Right/Home/End move (and activate) between tabs, per the WAI-ARIA tabs
 * pattern.
 */
export default function RequestTabs({ activeTab, counts, onChange }: RequestTabsProps) {
  const tabRefs = useRef<Record<string, HTMLButtonElement | null>>({});

  const moveTo = (index: number) => {
    const next = STAFF_REQUEST_TABS[(index + STAFF_REQUEST_TABS.length) % STAFF_REQUEST_TABS.length];
    onChange(next.id);
    tabRefs.current[next.id]?.focus();
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>, index: number) => {
    if (event.key === 'ArrowRight') {
      event.preventDefault();
      moveTo(index + 1);
    } else if (event.key === 'ArrowLeft') {
      event.preventDefault();
      moveTo(index - 1);
    } else if (event.key === 'Home') {
      event.preventDefault();
      moveTo(0);
    } else if (event.key === 'End') {
      event.preventDefault();
      moveTo(STAFF_REQUEST_TABS.length - 1);
    }
  };

  return (
    <div
      role="tablist"
      aria-label="Request status"
      className="mb-4 flex flex-wrap items-center gap-2"
    >
      {STAFF_REQUEST_TABS.map((tab, index) => {
        const Icon = TAB_ICON[tab.id];
        const isActive = activeTab === tab.id;
        const count = counts[tab.id] ?? 0;
        return (
          <button
            key={tab.id}
            ref={(node) => {
              tabRefs.current[tab.id] = node;
            }}
            type="button"
            role="tab"
            id={`staff-requests-tab-${tab.id}`}
            aria-selected={isActive}
            aria-controls="staff-requests-panel"
            tabIndex={isActive ? 0 : -1}
            onClick={() => onChange(tab.id)}
            onKeyDown={(event) => handleKeyDown(event, index)}
            className={`flex cursor-pointer items-center gap-2 rounded-full px-4 py-2 text-xs font-bold transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-[#4318FF]/60 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-navy-900 ${
              isActive
                ? 'bg-[#4318FF] text-white shadow-md shadow-[#4318FF]/25'
                : 'border border-slate-200/60 bg-white text-slate-600 hover:bg-slate-50 dark:border-navy-700 dark:bg-navy-800 dark:text-slate-300'
            }`}
          >
            <Icon className="h-3.5 w-3.5" />
            <span className="whitespace-nowrap">{tab.label}</span>
            <span
              className={`rounded-full px-2 py-0.5 text-[10px] font-black ${
                isActive ? 'bg-[#3311CC] text-white' : TAB_BADGE_IDLE[tab.id]
              }`}
            >
              {count}
            </span>
          </button>
        );
      })}
    </div>
  );
}
