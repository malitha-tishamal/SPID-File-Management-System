'use client';
import React from 'react';
import { useTranslation } from 'react-i18next';
import { IoWater } from 'react-icons/io5';
import AppLogo from 'components/brand/AppLogo';

interface AuthBrandHeaderProps {
  variant: 'sign-in' | 'forgot-password' | 'register';
}

const DEPARTMENT_NAME = 'Southern Provincial Irrigation Department';
const SYSTEM_NAME = 'SPID File Management System';

export default function AuthBrandHeader({ variant }: AuthBrandHeaderProps) {
  const { t } = useTranslation('auth');
  return (
    <div className="flex flex-col items-center text-center mb-6 w-full max-w-lg px-2">
      {/* SPID Circular Emblem with bottom-right status badge */}
      <div className="relative mb-3 flex items-center justify-center">
        <AppLogo size="lg" priority alt={t('brand.emblemAlt')} className="shadow-md" />
        {/* Tiny green status badge with water drop */}
        <div className="absolute bottom-0 right-0 flex h-5 w-5 sm:h-6 sm:w-6 items-center justify-center rounded-full bg-teal-800 text-white border-2 border-white shadow-sm">
          <IoWater className="h-2.5 w-2.5 sm:h-3 sm:w-3 text-emerald-300" />
        </div>
      </div>

      {/* Header Text based on screen variant */}
      {variant === 'sign-in' && (
        <>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
            {SYSTEM_NAME}
          </h1>
          <p className="mt-1 text-[11px] sm:text-xs font-bold uppercase tracking-wider text-sky-600 dark:text-sky-400">
            {DEPARTMENT_NAME}
          </p>
        </>
      )}

      {variant === 'forgot-password' && (
        <>
          <p className="text-[10px] sm:text-xs font-bold uppercase tracking-wider text-sky-600 dark:text-sky-400">
            {t('brand.officialPortal')}
          </p>
          <h1 className="mt-1 text-xl sm:text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
            {SYSTEM_NAME}
          </h1>
          <p className="mt-0.5 text-[11px] sm:text-xs font-medium text-slate-500 dark:text-slate-400">
            {DEPARTMENT_NAME}
          </p>
        </>
      )}

      {variant === 'register' && (
        <>
          <p className="text-[10px] sm:text-xs font-bold uppercase tracking-wider text-sky-600 dark:text-sky-400">
            {DEPARTMENT_NAME}
          </p>
          <h1 className="mt-1 text-xl sm:text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
            {SYSTEM_NAME}
          </h1>
          <p className="mt-0.5 text-[11px] sm:text-xs font-medium text-slate-500 dark:text-slate-400">
            {t('brand.secureArchive')}
          </p>
        </>
      )}
    </div>
  );
}
