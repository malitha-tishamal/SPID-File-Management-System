'use client';
import React from 'react';
import Image from 'next/image';
import { IoWater } from 'react-icons/io5';
import { HiCheck } from 'react-icons/hi';

interface AuthBrandHeaderProps {
  variant: 'sign-in' | 'forgot-password' | 'register';
}

export default function AuthBrandHeader({ variant }: AuthBrandHeaderProps) {
  return (
    <div className="flex flex-col items-center text-center mb-6">
      {/* SPID Circular Emblem with bottom-right status badge */}
      <div className="relative mb-3 flex items-center justify-center">
        <div className="h-20 w-20 sm:h-22 sm:w-22 rounded-full bg-white p-1.5 shadow-md border border-slate-200/80 flex items-center justify-center">
          <img
            src="/img/spid/spid-logo.png"
            alt="Southern Provincial Irrigation Department Emblem"
            className="h-full w-full object-contain select-none"
          />
        </div>
        {/* Tiny green status badge with water drop/check icon */}
        <div className="absolute bottom-0 right-0 flex h-6 w-6 items-center justify-center rounded-full bg-teal-800 text-white border-2 border-white shadow-sm">
          <IoWater className="h-3 w-3 text-emerald-300" />
        </div>
      </div>

      {/* Header Text based on screen variant */}
      {variant === 'sign-in' && (
        <>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
            SPID File Management System
          </h1>
          <p className="mt-1 text-xs font-bold uppercase tracking-wider text-sky-600 dark:text-sky-400">
            SOUTHERN PROVINCIAL IRRIGATION DEPARTMENT
          </p>
        </>
      )}

      {variant === 'forgot-password' && (
        <>
          <p className="text-xs font-bold uppercase tracking-wider text-sky-600 dark:text-sky-400">
            OFFICIAL GOVERNMENT PORTAL
          </p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
            SPID File Management System
          </h1>
          <p className="mt-0.5 text-xs font-medium text-slate-500 dark:text-slate-400">
            Southern Provincial Irrigation Department
          </p>
        </>
      )}

      {variant === 'register' && (
        <>
          <p className="text-xs font-bold uppercase tracking-wider text-sky-600 dark:text-sky-400">
            SOUTHERN PROVINCIAL IRRIGATION DEPARTMENT
          </p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
            SPID File Management System
          </h1>
          <p className="mt-0.5 text-xs font-medium text-slate-500 dark:text-slate-400">
            Secure Archival Network & Official Registry
          </p>
        </>
      )}
    </div>
  );
}
