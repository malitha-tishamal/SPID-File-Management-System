'use client';

import React from 'react';
import Link from 'next/link';
import {
  LockKeyhole,
  ArrowRight,
  ShieldCheck,
  Building2,
  ExternalLink,
} from 'lucide-react';

interface CtaSectionProps {
  isAuthenticated?: boolean;
  dashboardUrl?: string;
}

export default function CtaSection({
  isAuthenticated = false,
  dashboardUrl = '/auth/sign-in',
}: CtaSectionProps) {
  return (
    <section className="relative py-16 sm:py-24 bg-gradient-to-br from-[#0b1437] via-[#111c44] to-[#1B2559] text-white overflow-hidden">
      {/* Subtle Background Glow & Pattern */}
      <div
        className="absolute inset-0 pointer-events-none opacity-20"
        style={{
          backgroundImage:
            'radial-gradient(circle at 20% 50%, rgba(67, 24, 255, 0.4) 0%, transparent 50%), radial-gradient(circle at 80% 50%, rgba(5, 205, 153, 0.25) 0%, transparent 50%)',
        }}
      />

      <div className="relative max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
        {/* Badge */}
        <div className="inline-flex items-center gap-2 rounded-full border border-sky-400/30 bg-sky-500/10 px-4 py-1.5 text-xs font-bold text-sky-300 backdrop-blur-md mb-6">
          <Building2 className="h-3.5 w-3.5" />
          <span>SOUTHERN PROVINCIAL COUNCIL • OFFICIAL SYSTEM</span>
        </div>

        {/* Heading */}
        <h2 className="text-3xl sm:text-4xl md:text-5xl font-black tracking-tight text-white leading-tight">
          Access the Digital Records Management Platform
        </h2>

        {/* Description */}
        <p className="mt-5 text-sm sm:text-base md:text-lg text-slate-300 max-w-2xl mx-auto leading-relaxed font-normal">
          Experience a more organized, secure, and efficient approach to departmental file
          management. Connect to the canonical repository to search, request, and verify records.
        </p>

        {/* CTA Buttons */}
        <div className="mt-9 flex flex-wrap items-center justify-center gap-4">
          <Link
            href={isAuthenticated ? dashboardUrl : '/auth/sign-in'}
            className="inline-flex items-center justify-center gap-2.5 rounded-xl bg-[#4318FF] px-8 py-4 text-sm font-bold text-white shadow-xl shadow-brand-500/30 hover:bg-[#3311DB] transition-all hover:scale-105 active:scale-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-white"
          >
            <LockKeyhole className="h-4 w-4" />
            <span>{isAuthenticated ? 'Open SPID Dashboard' : 'Login to SPID-FMS'}</span>
            <ArrowRight className="h-4 w-4 ml-1" />
          </Link>

          {!isAuthenticated && (
            <Link
              href="/auth/register"
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-white/10 hover:bg-white/15 px-6 py-4 text-sm font-bold text-white border border-white/20 transition-all hover:scale-105 active:scale-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-white"
            >
              <span>Request Staff Account</span>
            </Link>
          )}
        </div>

        {/* Notice */}
        <p className="mt-8 text-xs text-slate-400 flex items-center justify-center gap-1.5 font-medium">
          <ShieldCheck className="h-3.5 w-3.5 text-emerald-400" />
          <span>
            Authorized Departmental Personnel Only • Protected Under State Archival Protocols
          </span>
        </p>
      </div>
    </section>
  );
}
