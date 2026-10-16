/* eslint-disable */
'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { HiX } from 'react-icons/hi';
import { FiSettings, FiLogOut } from 'react-icons/fi';
import Links from './components/Links';
import { IRoute } from 'types/navigation';

interface SessionUser {
  full_name?: string;
  name?: string;
  email?: string;
  role?: string;
}

let sessionCache: SessionUser | null = null;

async function fetchSession(): Promise<SessionUser | null> {
  if (sessionCache) return sessionCache;
  try {
    const res = await fetch('/api/auth/me');
    if (res.ok) {
      const json = await res.json();
      if (json.ok && json.data?.profile) {
        sessionCache = json.data.profile;
        return sessionCache;
      }
    }
  } catch {}
  return null;
}

function SidebarHorizon(props: { routes: IRoute[]; [x: string]: any }) {
  const { routes, open, setOpen } = props;
  const [user, setUser] = useState<SessionUser | null>(sessionCache);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);

  useEffect(() => {
    const syncAvatar = () => {
      try {
        const stored = localStorage.getItem('spid_user_avatar');
        setAvatarUrl(stored || null);
      } catch {}
    };

    syncAvatar();
    window.addEventListener('spid_avatar_updated', syncAvatar);
    window.addEventListener('storage', syncAvatar);

    if (!sessionCache) {
      fetchSession().then((profile) => {
        if (profile) {
          setUser(profile);
        } else {
          try {
            const stored = localStorage.getItem('spid_user');
            if (stored) setUser(JSON.parse(stored));
          } catch {}
        }
      });
    }

    return () => {
      window.removeEventListener('spid_avatar_updated', syncAvatar);
      window.removeEventListener('storage', syncAvatar);
    };
  }, []);

  const handleLogout = async () => {
    sessionCache = null;
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
    } catch {}
    // Clear local session data
    try {
      localStorage.removeItem('spid_user');
      document.cookie = 'spid_session=; path=/; max-age=0; expires=Thu, 01 Jan 1970 00:00:00 GMT';
    } catch {}
    window.location.href = '/auth/sign-in';
  };

  const displayName = user?.full_name || user?.name || 'SPID Officer';
  const displayRole = user?.role || 'Staff';

  const getInitials = (name: string) => {
    const parts = name.trim().split(/\s+/).filter(Boolean);
    if (parts.length >= 2) {
      return (parts[0][0] + parts[1][0]).toUpperCase();
    }
    return name.slice(0, 2).toUpperCase() || 'SP';
  };
  const initials = getInitials(displayName);

  return (
    <div
      className={`sm:none duration-175 linear fixed !z-50 flex min-h-full flex-col bg-white pb-0 shadow-2xl shadow-white/5 transition-all dark:!bg-navy-800 dark:text-white md:!z-50 lg:!z-50 xl:!z-0 ${
        open ? 'translate-x-0' : '-translate-x-96 xl:translate-x-0'
      }`}
      style={{ width: '280px' }}
    >
      {/* Close button (mobile) */}
      <span
        className="absolute right-4 top-4 block cursor-pointer xl:hidden"
        onClick={() => setOpen(false)}
      >
        <HiX className="h-5 w-5 text-gray-400" />
      </span>

      {/* ── SPID Logo & Brand ── */}
      <div className="mx-5 mt-8 flex items-center gap-3">
        <div className="h-12 w-12 rounded-full bg-white p-1 shadow-md border border-slate-200/80 flex items-center justify-center shrink-0 dark:bg-navy-900 dark:border-navy-700">
          <img
            src="/img/spid/spid-logo.png"
            alt="SPID Logo"
            className="h-full w-full object-contain select-none"
          />
        </div>
        <div className="flex flex-col leading-tight">
          <span className="text-[13px] font-black uppercase text-navy-700 dark:text-white tracking-tight">
            SPID
          </span>
          <span className="text-[10px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider">
            File Management
          </span>
        </div>
      </div>

      {/* ── Divider ── */}
      <div className="mx-4 my-5 h-px bg-gray-100 dark:bg-navy-700" />

      {/* ── Navigation Links (scrollable) ── */}
      <ul className="flex-1 overflow-y-auto pb-4 scrollbar-thin scrollbar-thumb-gray-200 dark:scrollbar-thumb-navy-700">
        <Links routes={routes} />
      </ul>

      {/* ── Bottom: User Profile + LOG OUT ── */}
      <div className="mt-auto border-t border-gray-100 dark:border-navy-700 pt-3">
        {/* User Info Row */}
        <Link
          href="/admin/profile"
          className="flex items-center justify-between gap-2.5 px-3 py-2.5 mx-3 mb-3 rounded-2xl bg-[#F4F7FE] dark:bg-navy-700/60 border border-slate-100 dark:border-navy-600 transition-all hover:bg-slate-100 dark:hover:bg-navy-700 cursor-pointer group shadow-sm"
          title="Open Profile Management"
        >
          <div className="flex items-center gap-3 min-w-0">
            <div className="h-10 w-10 shrink-0 rounded-full bg-gradient-to-tr from-[#4318FF] to-[#3B82F6] overflow-hidden flex items-center justify-center text-white shadow-sm group-hover:scale-105 transition-transform border border-slate-200/50 dark:border-navy-600">
              {avatarUrl ? (
                <img
                  src={avatarUrl}
                  alt={displayName}
                  onError={() => setAvatarUrl(null)}
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
                {displayRole}
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
            onClick={handleLogout}
            className="flex w-full items-center justify-center gap-2.5 rounded-2xl bg-gradient-to-r from-[#FF5B5B] to-[#FF4757] py-3 text-sm font-bold text-white shadow-md shadow-red-500/25 transition-all hover:opacity-95 active:scale-[0.99]"
          >
            LOG OUT
            <FiLogOut className="h-4 w-4 ml-1" />
          </button>
        </div>
      </div>
    </div>
  );
}

export default SidebarHorizon;
