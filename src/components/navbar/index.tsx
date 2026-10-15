'use client';
import React, { useEffect, useState } from 'react';
import Dropdown from 'components/dropdown';
import { FiAlignJustify, FiSearch, FiLogOut, FiUser, FiBell, FiHelpCircle } from 'react-icons/fi';
import NavLink from 'components/link/NavLink';
import { BsArrowBarUp } from 'react-icons/bs';
import { RiMoonFill, RiSunFill } from 'react-icons/ri';
import type { ProfileDTO } from 'types/auth';

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
  const [user, setUser] = useState<ProfileDTO | null>(null);

  useEffect(() => {
    if (typeof document !== 'undefined') {
      setDarkmode(document.body.classList.contains('dark') || document.documentElement.classList.contains('dark'));
    }
    fetch('/api/auth/me')
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (j?.ok && j.data?.profile) setUser(j.data.profile);
      })
      .catch(() => {});
  }, []);

  const handleLogout = async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
    } finally {
      try {
        localStorage.removeItem('spid_user');
        document.cookie = 'spid_session=; path=/; max-age=0; expires=Thu, 01 Jan 1970 00:00:00 GMT';
      } catch {}
      window.location.href = '/auth/sign-in';
    }
  };

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

  const displayName = user?.full_name || 'SPID Officer';
  const displayRole = user?.role || 'Staff';
  const displayInitials = displayName.slice(0, 2).toUpperCase();

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
        <div className="flex h-10 w-full max-w-md items-center rounded-xl bg-[#f4f7fe] px-3.5 text-navy-700 transition-all focus-within:ring-2 focus-within:ring-[#4318FF]/20 dark:bg-navy-900 dark:text-white">
          <FiSearch className="h-4 w-4 text-gray-400 dark:text-gray-400 shrink-0" />
          <input
            type="text"
            placeholder="Search record numbers, files, or offices..."
            className="ml-2 block h-full w-full bg-transparent text-xs font-medium text-navy-700 outline-none placeholder:text-gray-400 dark:text-white dark:placeholder:text-gray-500"
          />
        </div>
      </div>

      {/* Right side actions */}
      <div className="flex items-center gap-2">
        {/* Department Notifications Dropdown */}
        <Dropdown
          button={
            <button
              type="button"
              className="relative flex h-9 w-9 items-center justify-center rounded-xl text-gray-500 transition-colors hover:bg-slate-100 dark:text-gray-300 dark:hover:bg-navy-700"
              aria-label="Notifications"
            >
              <FiBell className="h-4 w-4" />
              <span className="absolute right-2 top-2 h-2 w-2 rounded-full bg-[#4318FF] ring-2 ring-white dark:ring-navy-800" />
            </button>
          }
          animation="origin-top-right transition-all duration-200 ease-out"
          classNames="py-2 top-10 right-0 w-max"
        >
          <div className="flex w-[340px] flex-col gap-3 rounded-2xl bg-white p-4 shadow-xl shadow-shadow-500 dark:!bg-navy-700 dark:text-white sm:w-[380px]">
            <div className="flex items-center justify-between border-b border-gray-100 pb-2 dark:border-navy-600">
              <p className="text-sm font-bold text-navy-700 dark:text-white">Department Notifications</p>
              <button type="button" className="text-xs font-semibold text-[#4318FF] hover:underline">Mark all read</button>
            </div>

            <div className="flex w-full items-start rounded-xl bg-slate-50 p-2.5 dark:bg-navy-800">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-b from-[#4318FF] to-brand-500 text-white">
                <BsArrowBarUp className="h-4 w-4" />
              </div>
              <div className="ml-3 flex flex-col justify-center text-xs">
                <p className="font-bold text-gray-900 dark:text-white">Circular #SPID/CIR/2026/04</p>
                <p className="text-[11px] text-gray-500 dark:text-gray-400">Updated guidelines for river basin &amp; tank dossier archiving.</p>
              </div>
            </div>

            <div className="flex w-full items-start rounded-xl bg-slate-50 p-2.5 dark:bg-navy-800">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-b from-teal-500 to-emerald-600 text-white">
                <BsArrowBarUp className="h-4 w-4" />
              </div>
              <div className="ml-3 flex flex-col justify-center text-xs">
                <p className="font-bold text-gray-900 dark:text-white">File Requisition Approved</p>
                <p className="text-[11px] text-gray-500 dark:text-gray-400">File #GAL-IRR-2026-081 ready for archival download.</p>
              </div>
            </div>
          </div>
        </Dropdown>

        {/* System Info / Help Dropdown */}
        <Dropdown
          button={
            <button
              type="button"
              className="flex h-9 w-9 items-center justify-center rounded-xl text-gray-500 transition-colors hover:bg-slate-100 dark:text-gray-300 dark:hover:bg-navy-700"
              aria-label="Department Info"
            >
              <FiHelpCircle className="h-4 w-4" />
            </button>
          }
          classNames="py-2 top-10 right-0 w-max"
          animation="origin-top-right transition-all duration-200 ease-out"
        >
          <div className="flex w-[300px] flex-col gap-2 rounded-2xl bg-white p-4 shadow-xl shadow-shadow-500 dark:!bg-navy-700 dark:text-white">
            <div className="flex items-center gap-3 border-b border-gray-100 pb-3 dark:border-navy-600">
              <div className="h-9 w-9 shrink-0 rounded-full bg-white p-1 shadow-sm border border-slate-200 flex items-center justify-center dark:bg-navy-900 dark:border-navy-700">
                <img src="/img/spid/spid-logo.png" alt="SPID Logo" className="h-full w-full object-contain" />
              </div>
              <div>
                <p className="text-xs font-bold text-slate-800 dark:text-white">SPID File Management</p>
                <p className="text-[10px] text-slate-500 dark:text-slate-400">Southern Provincial Irrigation Dept.</p>
              </div>
            </div>
            <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed mt-1">
              Official records, irrigation engineering dossiers, and cadastral archives portal.
            </p>
            <div className="mt-2 text-[10px] text-slate-400">System Version: 2.1 (Production)</div>
          </div>
        </Dropdown>

        {/* Dark Mode Toggle */}
        <button
          type="button"
          onClick={toggleDarkMode}
          className="flex h-9 w-9 items-center justify-center rounded-xl text-gray-500 transition-colors hover:bg-slate-100 dark:text-gray-300 dark:hover:bg-navy-700"
          aria-label="Toggle Dark Mode"
        >
          {darkmode ? <RiSunFill className="h-4 w-4 text-amber-400" /> : <RiMoonFill className="h-4 w-4 text-gray-600" />}
        </button>

        {/* User Profile Dropdown */}
        <Dropdown
          button={
            <div className="flex items-center gap-2 cursor-pointer pl-1">
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-b from-[#4318FF] to-brand-500 text-xs font-bold text-white shadow-sm ring-2 ring-brand-500/20">
                {displayInitials}
              </div>
            </div>
          }
          classNames="py-2 top-10 right-0 w-max"
          animation="origin-top-right transition-all duration-200 ease-out"
        >
          <div className="flex w-64 flex-col rounded-2xl bg-white p-4 shadow-xl shadow-shadow-500 dark:!bg-navy-700 dark:text-white border border-slate-100 dark:border-navy-600">
            <div className="flex flex-col border-b border-gray-100 pb-3 dark:border-navy-600">
              <p className="text-xs font-bold text-navy-700 dark:text-white">
                👋 {displayName}
              </p>
              <p className="text-[11px] font-medium text-slate-400 truncate mt-0.5">
                {user?.email || 'officer@spid.gov.lk'}
              </p>
              <span className="mt-1.5 inline-block w-fit rounded-full bg-indigo-50 px-2 py-0.5 text-[9px] font-bold text-[#4318FF] dark:bg-navy-800 dark:text-brand-300">
                {displayRole}
              </span>
            </div>

            <div className="flex flex-col gap-1.5 pt-2">
              <NavLink
                href="/admin/profile"
                className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-xs text-gray-700 transition-colors hover:bg-slate-50 hover:text-[#4318FF] dark:text-gray-300 dark:hover:bg-navy-800"
              >
                <FiUser className="h-3.5 w-3.5" /> Officer Profile
              </NavLink>

              <button
                type="button"
                onClick={handleLogout}
                className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-xs font-bold text-red-500 transition-colors hover:bg-red-50 dark:hover:bg-red-950/20 text-left"
              >
                <FiLogOut className="h-3.5 w-3.5" /> Log Out
              </button>
            </div>
          </div>
        </Dropdown>
      </div>
    </nav>
  );
}
