'use client';

import React from 'react';
import Image from 'next/image';
import Link from 'next/link';
import {
  ShieldCheck,
  Building2,
  LockKeyhole,
  MapPin,
  ArrowUpRight,
  ExternalLink,
} from 'lucide-react';

export default function Footer() {
  const currentYear = new Date().getFullYear();

  return (
    <footer
      id="contact"
      className="bg-[#0b1437] text-white border-t border-slate-800"
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-14 sm:py-16">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-12 gap-10">
          {/* Col 1: Branding & Description */}
          <div className="lg:col-span-5 flex flex-col items-start">
            <div className="flex items-center gap-3">
              <div className="relative h-12 w-12 rounded-full bg-white p-1 shadow-md border border-slate-200/80 flex items-center justify-center shrink-0">
                <Image
                  src="/img/spid/spid-logo.png"
                  alt="Southern Provincial Irrigation Department Emblem"
                  width={48}
                  height={48}
                  className="h-full w-full object-contain select-none"
                />
              </div>
              <div>
                <span className="text-[10px] font-black uppercase tracking-wider text-sky-400 block leading-tight">
                  SOUTHERN PROVINCIAL IRRIGATION DEPARTMENT
                </span>
                <span className="text-lg font-black tracking-tight text-white leading-tight">
                  SPID-FMS
                </span>
              </div>
            </div>

            <p className="mt-4 text-xs sm:text-sm text-slate-400 leading-relaxed max-w-sm font-normal">
              Official digital records repository and physical dossier tracking system developed for
              the Southern Provincial Irrigation Department, Sri Lanka.
            </p>

            <div className="mt-6 inline-flex items-center gap-2 rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-xs text-slate-300">
              <ShieldCheck className="h-4 w-4 text-emerald-400 shrink-0" />
              <span>Official Departmental Document Management Platform</span>
            </div>
          </div>

          {/* Col 2: Quick Links */}
          <div className="lg:col-span-3">
            <h4 className="text-xs font-bold uppercase tracking-wider text-sky-400 mb-4">
              Quick Navigation
            </h4>
            <ul className="space-y-2.5 text-xs text-slate-300 font-medium">
              <li>
                <a
                  href="#hero"
                  className="hover:text-white transition-colors"
                >
                  System Home
                </a>
              </li>
              <li>
                <a
                  href="#about"
                  className="hover:text-white transition-colors"
                >
                  About the Department
                </a>
              </li>
              <li>
                <a
                  href="#features"
                  className="hover:text-white transition-colors"
                >
                  Enterprise Features
                </a>
              </li>
              <li>
                <a
                  href="#how-it-works"
                  className="hover:text-white transition-colors"
                >
                  Archival Workflow
                </a>
              </li>
              <li>
                <a
                  href="#security"
                  className="hover:text-white transition-colors"
                >
                  Security &amp; RBAC
                </a>
              </li>
              <li>
                <a
                  href="#statistics"
                  className="hover:text-white transition-colors"
                >
                  Verified Metrics
                </a>
              </li>
            </ul>
          </div>

          {/* Col 3: Department Location & System Access */}
          <div className="lg:col-span-4">
            <h4 className="text-xs font-bold uppercase tracking-wider text-sky-400 mb-4">
              Department Details
            </h4>
            <div className="space-y-3 text-xs text-slate-300 font-normal">
              <div className="flex items-start gap-2.5">
                <MapPin className="h-4 w-4 text-sky-400 shrink-0 mt-0.5" />
                <p className="leading-relaxed">
                  Southern Provincial Irrigation Department
                  <br />
                  Southern Provincial Council Complex
                  <br />
                  Southern Province, Sri Lanka
                </p>
              </div>

              <div className="flex items-start gap-2.5 pt-2">
                <Building2 className="h-4 w-4 text-sky-400 shrink-0 mt-0.5" />
                <p className="leading-relaxed">
                  Divisional Engineering Offices:
                  <br />
                  Galle • Matara • Hambantota
                </p>
              </div>

              <div className="pt-3">
                <Link
                  href="/auth/sign-in"
                  className="inline-flex items-center gap-2 rounded-xl bg-white/10 hover:bg-white/15 px-4 py-2 text-xs font-bold text-white border border-white/20 transition-colors"
                >
                  <LockKeyhole className="h-3.5 w-3.5" />
                  <span>Officer Portal Login</span>
                </Link>
              </div>
            </div>
          </div>
        </div>

        {/* Bottom Bar: Copyright & Confidentiality */}
        <div className="mt-12 pt-8 border-t border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-4 text-[11px] text-slate-500">
          <p>
            © {currentYear} Southern Provincial Irrigation Department, Sri Lanka. All
            rights reserved.
          </p>
          <p className="text-center sm:text-right">
            Authorized State Document System • SPID-FMS v3.0
          </p>
        </div>
      </div>
    </footer>
  );
}
