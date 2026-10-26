'use client';
import React, { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { FiAlignJustify, FiSearch, FiClock } from 'react-icons/fi';
import { RiMoonFill, RiSunFill } from 'react-icons/ri';
import { useProfile } from 'contexts/ProfileContext';

export interface NavbarProps {
  onOpenSidenav: () => void;
  brandText?: string;
  secondary?: boolean | string;
  hideBreadcrumb?: boolean;
  [x: string]: any;
}

function SriLankaClock() {
  const [time, setTime] = useState<{ time: string; date: string } | null>(null);

  useEffect(() => {
    const update = () => {
      const now = new Date();
      setTime({
        time: now.toLocaleTimeString('en-US', {
          timeZone: 'Asia/Colombo',
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
          hour12: true,
        }),
        date: now.toLocaleDateString('en-GB', {
          timeZone: 'Asia/Colombo',
          day: '2-digit',
          month: 'short',
          year: 'numeric',
        }),
      });
    };
    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, []);

  if (!time) {
    return (
      <div className="hidden md:flex h-9 items-center gap-2 rounded-xl bg-[#f4f7fe] px-3 text-xs dark:bg-navy-900 border border-slate-200 dark:border-navy-700 opacity-60">
        <FiClock className="h-3.5 w-3.5 text-slate-400" />
        <span className="font-mono text-xs">Loading...</span>
      </div>
    );
  }

  return (
    <div
      title="Sri Lanka Standard Time (Asia/Colombo, UTC+05:30) — Sri Jayawardenepura Kotte"
      className="hidden md:flex items-center gap-2.5 rounded-xl bg-[#f4f7fe] dark:bg-navy-900 border border-slate-200 dark:border-navy-700 px-3 py-1.5 shadow-xs select-none"
    >
      <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-600 dark:bg-emerald-500/20 dark:text-emerald-400 shrink-0">
        <FiClock className="h-4 w-4" />
      </div>
      <div className="flex flex-col text-left leading-none">
        <div className="flex items-center gap-1.5">
          <span className="font-mono text-xs font-bold text-navy-700 dark:text-white tracking-tight">
            {time.time}
          </span>
          <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
        </div>
        <span className="text-[10px] font-semibold text-slate-500 dark:text-slate-400 mt-0.5">
          {time.date} • SLST (Kotte)
        </span>
      </div>
    </div>
  );
}

export default function Navbar({
  onOpenSidenav,
  brandText = 'Dashboard',
  secondary,
  hideBreadcrumb = false,
}: NavbarProps) {
  const [darkmode, setDarkmode] = useState(false);
  const pathname = usePathname();
  const { profile } = useProfile();

  const isStaffArea = pathname?.startsWith('/staff');
  const profileHref = isStaffArea ? '/staff/profile' : '/admin/profile';
  const displayName = profile?.full_name || (isStaffArea ? 'SPID Staff' : 'SPID Officer');

  const getInitials = (name: string) => {
    const parts = name.trim().split(/\s+/).filter(Boolean);
    if (parts.length >= 2) {
      return (parts[0][0] + parts[1][0]).toUpperCase();
    }
    return name.slice(0, 2).toUpperCase() || 'SP';
  };
  const initials = getInitials(displayName);

  useEffect(() => {
    if (typeof document !== 'undefined') {
      setDarkmode(document.body.classList.contains('dark') || document.documentElement.classList.contains('dark'));
    }
  }, []);

  const toggleDarkMode = () => {
    if (darkmode) {
      document.body.classList.remove('dark');
      document.documentElement.classList.remove('dark');
      setDarkmode(false);
    } else {
      document.body.classList.add('dark');
      document.documentElement.classList.add('dark');
      setDarkmode(true);
    }
  };

  return (
    <nav className="sticky top-2 z-40 mb-3 flex flex-row items-center justify-between gap-3 rounded-2xl bg-white/70 px-4 py-2.5 backdrop-blur-xl shadow-sm dark:bg-navy-800/80 dark:shadow-none border border-slate-100 dark:border-navy-700">
      {/* Mobile Menu & Search Bar */}
      <div className="flex flex-1 items-center gap-3">
        <button
          type="button"
          onClick={onOpenSidenav}
          className="flex h-9 w-9 items-center justify-center rounded-xl text-gray-600 transition-colors hover:bg-slate-100 dark:text-gray-300 dark:hover:bg-navy-700 xl:hidden"
          aria-label="Toggle Sidenav"
        >
          <FiAlignJustify className="h-5 w-5" />
        </button>

        {/* Global Search Bar (matching screenshots) */}
        <div className="flex h-10 w-full max-w-md items-center rounded-xl bg-[#f4f7fe] px-3.5 text-slate-900 transition-all focus-within:ring-2 focus-within:ring-[#4318FF]/20 dark:bg-navy-900 dark:text-white border border-slate-300 dark:border-navy-700">
          <FiSearch className="h-4 w-4 text-slate-700 dark:text-gray-300 shrink-0" />
          <input
            type="text"
            placeholder="Search record numbers, files, or offices..."
            style={{ backgroundColor: 'transparent' }}
            className="ml-2 block h-full w-full !bg-transparent text-xs font-bold text-slate-950 outline-none placeholder:text-slate-600 placeholder:font-medium dark:!bg-transparent dark:text-white dark:placeholder:text-gray-400"
          />
        </div>
      </div>

      {/* Right side actions */}
      <div className="flex items-center gap-2.5">
        {/* Sri Lanka / Sri Jayawardenepura Kotte Live Clock */}
        <SriLankaClock />

        {/* Dark Mode Toggle */}
        <button
          type="button"
          onClick={toggleDarkMode}
          className="flex h-9 w-9 items-center justify-center rounded-xl text-gray-500 transition-colors hover:bg-slate-100 dark:text-gray-300 dark:hover:bg-navy-700"
          aria-label="Toggle Dark Mode"
        >
          {darkmode ? <RiSunFill className="h-4 w-4 text-amber-400" /> : <RiMoonFill className="h-4 w-4 text-gray-600" />}
        </button>
      </div>
    </nav>
  );
}
