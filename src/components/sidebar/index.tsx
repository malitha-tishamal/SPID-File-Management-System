/* eslint-disable */
'use client';

import React, { useState } from 'react';
import AppLogo from 'components/brand/AppLogo';
import Link from 'next/link';
import { useTranslation } from 'react-i18next';
import { HiX } from 'react-icons/hi';
import { FiSettings, FiLogOut } from 'react-icons/fi';
import Links from './components/Links';
import { IRoute } from 'types/navigation';
import ConfirmLogoutModal from 'components/modals/ConfirmLogoutModal';
import { useProfile } from 'contexts/ProfileContext';
import { broadcastLogout, clearLastActivity } from 'lib/authSync';

function SidebarHorizon(props: { routes: IRoute[]; [x: string]: any }) {
  const { routes, open, setOpen } = props;
  const { profile, avatarUrl, clearProfile } = useProfile();
  const { t } = useTranslation();
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  const handleLogout = async () => {
    if (isLoggingOut) return;
    setIsLoggingOut(true);
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
    } catch {}

    // Broadcast logout so other tabs drop this session too
    broadcastLogout();
    clearLastActivity();

    clearProfile();
    try {
      document.cookie = 'spid_session=; path=/; max-age=0; expires=Thu, 01 Jan 1970 00:00:00 GMT';
    } catch {}
    window.location.href = '/auth/sign-in';
  };

  const displayName = profile?.full_name || t('common:misc.officerFallback');
  const displayRole = profile?.role || 'Administrator';

  const getInitials = (name: string) => {
    const parts = name.trim().split(/\s+/).filter(Boolean);
    if (parts.length >= 2) {
      return (parts[0][0] + parts[1][0]).toUpperCase();
    }
    return name.slice(0, 2).toUpperCase() || 'SP';
  };
  const initials = getInitials(displayName);

  return (
    <>
      {/* ── Mobile Backdrop Overlay ── */}
      {open && (
        <div
          className="fixed inset-0 z-40 bg-slate-900/50 backdrop-blur-xs transition-opacity xl:hidden"
          onClick={() => setOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* ── Sidebar Container ── */}
      <aside
        aria-label={t('nav:navbar.sidebarLabel')}
        className={`fixed !z-50 flex min-h-full flex-col bg-white pb-0 shadow-2xl shadow-slate-300/40 transition-transform duration-300 ease-in-out dark:!bg-navy-800 dark:text-white dark:shadow-navy-950 md:!z-50 lg:!z-50 xl:!z-30 ${
          open ? 'translate-x-0' : '-translate-x-full'
        }`}
        style={{ width: '280px' }}
      >
        {/* ── SPID Logo & Brand with Toggle Button ── */}
        <div className="mx-5 mt-6 flex items-center justify-between gap-2">
          <Link href="/admin/dashboard" className="flex items-center gap-3 min-w-0 group">
            <AppLogo
              size="md"
              priority
              alt={t('shell:sidebar.logoAlt')}
              className="shadow-md transition-transform group-hover:scale-105"
            />
            <div className="flex flex-col leading-tight min-w-0">
              <span className="text-[13px] font-black uppercase text-navy-700 dark:text-white tracking-tight truncate">
                SPID
              </span>
              <span className="text-[10px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider truncate">
                {t('nav:brand.fileManagement')}
              </span>
            </div>
          </Link>
        </div>

        {/* ── Divider ── */}
        <div className="mx-4 my-5 h-px bg-gray-100 dark:bg-navy-700" />

        {/* ── Navigation Links (scrollable) ── */}
        <ul className="flex-1 overflow-y-auto pb-4 scrollbar-thin scrollbar-thumb-gray-200 dark:scrollbar-thumb-navy-700">
          <Links
            routes={routes}
            onClickRoute={() => {
              if (typeof window !== 'undefined' && window.innerWidth < 1280) {
                setOpen(false);
              }
            }}
          />
        </ul>

      {/* ── Bottom: User Profile + LOG OUT ── */}
      <div className="mt-auto border-t border-gray-100 dark:border-navy-700 pt-3">
        {/* User Info Row */}
        <Link
          href="/admin/profile"
          className="flex items-center justify-between gap-2.5 px-3 py-2.5 mx-3 mb-3 rounded-2xl bg-[#F4F7FE] dark:bg-navy-700/60 border border-slate-100 dark:border-navy-600 transition-all hover:bg-slate-100 dark:hover:bg-navy-700 cursor-pointer group shadow-sm"
          title={t('nav:navbar.openProfile')}
        >
          <div className="flex items-center gap-3 min-w-0">
            <div className="h-10 w-10 shrink-0 rounded-full bg-gradient-to-tr from-[#4318FF] to-[#3B82F6] overflow-hidden flex items-center justify-center text-white shadow-sm group-hover:scale-105 transition-transform border border-slate-200/50 dark:border-navy-600">
              {avatarUrl ? (
                <img
                  src={avatarUrl}
                  alt={displayName}
                  className="h-full w-full object-cover"
                />
              ) : (
                <span className="select-none font-black text-xs tracking-wider text-white">
                  {initials}
                </span>
              )}
            </div>
            <div className="min-w-0">
              <p className="truncate text-[12px] font-black text-navy-700 dark:text-white uppercase tracking-tight group-hover:text-[#4318FF] transition-colors">
                {displayName}
              </p>
              <p className="text-[10px] font-extrabold text-[#4318FF] dark:text-brand-300 uppercase tracking-wider">
                {t(
                  `common:roles.${String(displayRole).toLowerCase().startsWith('admin') ? 'ADMIN' : 'STAFF'}`,
                  displayRole,
                )}
              </p>
            </div>
          </div>
          {/* Settings gear */}
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-slate-500 hover:text-[#4318FF] group-hover:rotate-45 transition-all">
            <FiSettings className="h-4 w-4" />
          </div>
        </Link>

        {/* LOG OUT Button */}
        <div className="px-3 pb-5">
          <button
            onClick={() => setShowLogoutConfirm(true)}
            className="flex w-full items-center justify-center gap-2.5 rounded-2xl bg-gradient-to-r from-[#FF5B5B] to-[#FF4757] py-3 text-sm font-bold text-white shadow-md shadow-red-500/25 transition-all hover:opacity-95 active:scale-[0.99]"
          >
            {t('common:buttons.logout').toUpperCase()}
            <FiLogOut className="h-4 w-4 ml-1" />
          </button>
        </div>
      </div>

      <ConfirmLogoutModal
        isOpen={showLogoutConfirm}
        loading={isLoggingOut}
        onCancel={() => {
          if (!isLoggingOut) setShowLogoutConfirm(false);
        }}
        onConfirm={handleLogout}
      />
    </aside>
  </>
  );
}

export default SidebarHorizon;
