'use client';

import React, { useState, useEffect } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import {
  LockKeyhole,
  Menu,
  X,
  ArrowRight,
  ShieldCheck,
  Building2,
  ExternalLink,
} from 'lucide-react';
import { RiMoonFill, RiSunFill } from 'react-icons/ri';

interface NavbarProps {
  isAuthenticated?: boolean;
  dashboardUrl?: string;
}

export default function Navbar({
  isAuthenticated = false,
  dashboardUrl = '/auth/sign-in',
}: NavbarProps) {
  const [isScrolled, setIsScrolled] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [darkmode, setDarkmode] = useState(false);

  useEffect(() => {
    if (typeof document !== 'undefined') {
      setDarkmode(
        document.body.classList.contains('dark') ||
        document.documentElement.classList.contains('dark')
      );
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

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 20);
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const navLinks = [
    { label: 'Home', href: '#hero' },
    { label: 'About System', href: '#about' },
    { label: 'Features', href: '#features' },
    { label: 'How It Works', href: '#how-it-works' },
    { label: 'Security', href: '#security' },
    { label: 'Statistics', href: '#statistics' },
    { label: 'Contact', href: '#contact' },
  ];

  return (
    <header
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
        isScrolled
          ? 'bg-white/95 dark:bg-navy-900/95 backdrop-blur-md shadow-sm border-b border-slate-200/80 dark:border-navy-700/80 py-2.5'
          : 'bg-white/80 dark:bg-navy-900/80 backdrop-blur-sm border-b border-slate-100 dark:border-navy-800 py-3.5'
      }`}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between">
          {/* Official Branding */}
          <Link
            href="/"
            className="flex items-center gap-3 group focus:outline-none focus-visible:ring-2 focus-visible:ring-[#4318FF] rounded-xl p-1"
            aria-label="Southern Provincial Irrigation Department File Management System Home"
          >
            <div className="relative h-11 w-11 sm:h-12 sm:w-12 rounded-full bg-white p-1 shadow-xs border border-slate-200/80 dark:border-navy-700 flex items-center justify-center shrink-0 transition-transform group-hover:scale-105">
              <Image
                src="/img/spid/spid-logo.png"
                alt="Southern Provincial Irrigation Department Emblem"
                width={48}
                height={48}
                priority
                className="h-full w-full object-contain select-none"
              />
              <span
                className="absolute -bottom-0.5 -right-0.5 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-emerald-500 border-2 border-white dark:border-navy-900"
                title="System Operational"
              />
            </div>
            <div className="flex flex-col text-left">
              <span className="text-[10px] sm:text-[11px] font-black uppercase tracking-wider text-sky-700 dark:text-sky-400 leading-tight">
                Southern Provincial Irrigation Department
              </span>
              <div className="flex items-center gap-1.5">
                <span className="text-base sm:text-lg font-extrabold tracking-tight text-[#1B2559] dark:text-white leading-tight">
                  SPID-FMS
                </span>
                <span className="hidden sm:inline-block rounded-md bg-[#EEF2FF] px-1.5 py-0.5 text-[9px] font-bold text-[#4318FF] dark:bg-brand-950/60 dark:text-brand-300 border border-indigo-100 dark:border-brand-900">
                  OFFICIAL PORTAL
                </span>
              </div>
            </div>
          </Link>

          {/* Desktop Navigation Links */}
          <nav
            className="hidden lg:flex items-center gap-1 xl:gap-2"
            aria-label="Main Navigation"
          >
            {navLinks.map((link) => (
              <a
                key={link.href}
                href={link.href}
                className="px-3 py-1.5 rounded-lg text-xs font-bold text-slate-600 dark:text-slate-300 hover:text-[#4318FF] dark:hover:text-white hover:bg-slate-50 dark:hover:bg-navy-800 transition-colors"
              >
                {link.label}
              </a>
            ))}
          </nav>

          {/* Action / Login Button */}
          <div className="hidden sm:flex items-center gap-3">
            {/* Dark / Light Mode Toggle */}
            <button
              type="button"
              onClick={toggleDarkMode}
              aria-label={darkmode ? 'Switch to light mode' : 'Switch to dark mode'}
              className="flex h-9 w-9 items-center justify-center rounded-xl text-slate-500 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-navy-800 border border-slate-200/80 dark:border-navy-700 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#4318FF]"
            >
              {darkmode ? (
                <RiSunFill className="h-4 w-4 text-amber-400" />
              ) : (
                <RiMoonFill className="h-4 w-4 text-slate-500" />
              )}
            </button>
            {isAuthenticated ? (
              <Link
                href={dashboardUrl}
                className="inline-flex items-center gap-2 rounded-xl bg-[#4318FF] px-4 py-2.5 text-xs font-bold text-white shadow-md shadow-brand-500/20 hover:bg-[#3311DB] transition-all hover:scale-[1.02] active:scale-[0.98] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#4318FF]"
              >
                <span>Access Dashboard</span>
                <ArrowRight className="h-4 w-4" />
              </Link>
            ) : (
              <Link
                href="/auth/sign-in"
                className="inline-flex items-center gap-2 rounded-xl bg-[#4318FF] px-4 py-2.5 text-xs font-bold text-white shadow-md shadow-brand-500/20 hover:bg-[#3311DB] transition-all hover:scale-[1.02] active:scale-[0.98] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#4318FF]"
              >
                <LockKeyhole className="h-3.5 w-3.5" />
                <span>Login to SPID-FMS</span>
              </Link>
            )}
          </div>

          {/* Mobile Hamburger Toggle */}
          <div className="flex sm:hidden items-center gap-2">
            {/* Dark / Light Mode Toggle (Mobile) */}
            <button
              type="button"
              onClick={toggleDarkMode}
              aria-label={darkmode ? 'Switch to light mode' : 'Switch to dark mode'}
              className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-navy-800 border border-slate-200/80 dark:border-navy-700 transition-colors"
            >
              {darkmode ? (
                <RiSunFill className="h-4 w-4 text-amber-400" />
              ) : (
                <RiMoonFill className="h-4 w-4 text-slate-500" />
              )}
            </button>
            <Link
              href={isAuthenticated ? dashboardUrl : '/auth/sign-in'}
              className="inline-flex items-center gap-1.5 rounded-lg bg-[#4318FF] px-3 py-1.5 text-xs font-bold text-white shadow-xs"
              aria-label="Login"
            >
              <LockKeyhole className="h-3 w-3" />
              <span>Login</span>
            </Link>
            <button
              type="button"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="p-2 rounded-lg text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-navy-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#4318FF]"
              aria-expanded={mobileMenuOpen}
              aria-label="Toggle navigation menu"
            >
              {mobileMenuOpen ? (
                <X className="h-5 w-5" />
              ) : (
                <Menu className="h-5 w-5" />
              )}
            </button>
          </div>
        </div>

        {/* Mobile Navigation Drawer */}
        {mobileMenuOpen && (
          <div className="lg:hidden mt-3 pt-3 pb-4 border-t border-slate-200/80 dark:border-navy-700 animate-fadeIn">
            <div className="flex flex-col gap-1">
              {navLinks.map((link) => (
                <a
                  key={link.href}
                  href={link.href}
                  onClick={() => setMobileMenuOpen(false)}
                  className="px-3 py-2 rounded-lg text-xs font-bold text-slate-700 dark:text-slate-200 hover:bg-indigo-50/70 hover:text-[#4318FF] dark:hover:bg-navy-800 transition-colors"
                >
                  {link.label}
                </a>
              ))}
              <div className="mt-3 pt-3 border-t border-slate-100 dark:border-navy-800 flex flex-col gap-2">
                <Link
                  href={isAuthenticated ? dashboardUrl : '/auth/sign-in'}
                  onClick={() => setMobileMenuOpen(false)}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[#4318FF] px-4 py-2.5 text-xs font-bold text-white shadow-sm"
                >
                  <LockKeyhole className="h-3.5 w-3.5" />
                  <span>{isAuthenticated ? 'Access Dashboard' : 'Login to SPID-FMS'}</span>
                </Link>
                <button
                  type="button"
                  onClick={toggleDarkMode}
                  className="flex w-full items-center justify-between gap-2 px-3 py-2 rounded-lg text-xs font-bold text-slate-700 dark:text-slate-200 hover:bg-indigo-50/70 dark:hover:bg-navy-800 border border-slate-200/80 dark:border-navy-700 transition-colors"
                >
                  <span>{darkmode ? 'Switch to Light Mode' : 'Switch to Dark Mode'}</span>
                  {darkmode ? (
                    <RiSunFill className="h-4 w-4 text-amber-400" />
                  ) : (
                    <RiMoonFill className="h-4 w-4 text-slate-500" />
                  )}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </header>
  );
}
