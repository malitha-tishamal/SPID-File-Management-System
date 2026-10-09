'use client';
import { PropsWithChildren } from 'react';
import React from 'react';
import { isWindowAvailable } from 'utils/navigation';
import FixedPlugin from 'components/fixedPlugin/FixedPlugin';

export default function AuthLayout({ children }: PropsWithChildren) {
  if (isWindowAvailable()) document.documentElement.dir = 'ltr';

  return (
    <div className="relative min-h-screen w-full bg-gradient-to-br from-[#f8faff] via-[#f0f4fd] to-[#ebf1fc] dark:from-[#0b1437] dark:via-[#0c163d] dark:to-[#080d26] text-slate-800 dark:text-white flex flex-col justify-between py-8 px-4 sm:px-6 overflow-x-hidden">
      {/* Ambient soft glow highlights */}
      <div className="pointer-events-none absolute -top-24 -left-24 h-96 w-96 rounded-full bg-sky-200/40 blur-3xl dark:bg-sky-900/10" />
      <div className="pointer-events-none absolute top-1/3 -right-24 h-96 w-96 rounded-full bg-indigo-200/35 blur-3xl dark:bg-indigo-900/10" />
      <div className="pointer-events-none absolute -bottom-24 left-1/3 h-96 w-96 rounded-full bg-blue-200/30 blur-3xl dark:bg-blue-900/10" />

      {/* Floating Theme Switcher */}
      <FixedPlugin />

      {/* Centered Page Content */}
      <main className="relative z-10 w-full flex-grow flex flex-col items-center justify-center">
        {children}
      </main>
    </div>
  );
}
