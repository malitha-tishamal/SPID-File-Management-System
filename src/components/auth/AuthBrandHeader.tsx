'use client';
import React from 'react';
import { IoWater } from 'react-icons/io5';

interface AuthBrandHeaderProps {
  variant: 'sign-in' | 'forgot-password' | 'register';
}

export default function AuthBrandHeader({ variant }: AuthBrandHeaderProps) {
  return (
    <div className="flex flex-col items-center text-center mb-6 w-full max-w-lg px-2">
      {/* SPID Circular Emblem with bottom-right status badge */}
      <div className="relative mb-3 flex items-center justify-center">
        <div className="h-16 w-16 sm:h-20 sm:w-20 rounded-full bg-white p-1.5 shadow-md border border-slate-200/80 flex items-center justify-center">
          <img
            src="/img/spid/spid-logo.png"
            alt="Southern Provincial Irrigation Department Emblem"
            className="h-full w-full object-contain select-none"
          />
        </div>
        {/* Tiny green status badge with water drop */}
        <div className="absolute bottom-0 right-0 flex h-5 w-5 sm:h-6 sm:w-6 items-center justify-center rounded-full bg-teal-800 text-white border-2 border-white shadow-sm">
          <IoWater className="h-2.5 w-2.5 sm:h-3 sm:w-3 text-emerald-300" />
        </div>
      </div>

      {/* Header Text based on screen variant */}
      {variant === 'sign-in' && (
        <>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
            SPID File Management System
          </h1>
          <p className="mt-1 text-[11px] sm:text-xs font-bold uppercase tracking-wider text-sky-600 dark:text-sky-400">
            SOUTHERN PROVINCIAL IRRIGATION DEPARTMENT
          </p>
        </>
      )}

      {variant === 'forgot-password' && (
        <>
          <p className="text-[10px] sm:text-xs font-bold uppercase tracking-wider text-sky-600 dark:text-sky-400">
            OFFICIAL GOVERNMENT PORTAL
          </p>
          <h1 className="mt-1 text-xl sm:text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
            SPID File Management System
          </h1>
          <p className="mt-0.5 text-[11px] sm:text-xs font-medium text-slate-500 dark:text-slate-400">
            Southern Provincial Irrigation Department
          </p>
        </>
      )}

      {variant === 'register' && (
        <>
          <p className="text-[10px] sm:text-xs font-bold uppercase tracking-wider text-sky-600 dark:text-sky-400">
            SOUTHERN PROVINCIAL IRRIGATION DEPARTMENT
          </p>
          <h1 className="mt-1 text-xl sm:text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
            SPID File Management System
          </h1>
          <p className="mt-0.5 text-[11px] sm:text-xs font-medium text-slate-500 dark:text-slate-400">
            Secure Archival Network &amp; Official Registry
          </p>
        </>
      )}
    </div>
  );
}
