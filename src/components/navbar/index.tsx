'use client';
import React, { useEffect, useState } from 'react';
import { FiAlignJustify, FiSearch } from 'react-icons/fi';
import { RiMoonFill, RiSunFill } from 'react-icons/ri';

export interface NavbarProps {
  onOpenSidenav: () => void;
  brandText?: string;
  secondary?: boolean | string;
  hideBreadcrumb?: boolean;
  [x: string]: any;
}

export default function Navbar({
  onOpenSidenav,
  brandText = 'Dashboard',
  secondary,
  hideBreadcrumb = false,
}: NavbarProps) {
  const [darkmode, setDarkmode] = useState(false);

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
      <div className="flex items-center gap-2">
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
