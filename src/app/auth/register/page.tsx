'use client';

import React, { useState, useMemo, useEffect, Suspense } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Trans, useTranslation } from 'react-i18next';
import { localiseFieldErrors, localiseMessage } from 'i18n/uiText';
import {
  FiUser,
  FiMail,
  FiLock,
  FiPhone,
  FiEye,
  FiEyeOff,
  FiBriefcase,
  FiInfo,
  FiArrowRight,
  FiCheck,
  FiAlertCircle,
  FiShield,
} from 'react-icons/fi';
import { HiOutlineShieldCheck } from 'react-icons/hi';
import { RiLockPasswordLine } from 'react-icons/ri';
import AuthBrandHeader from 'components/auth/AuthBrandHeader';
import AuthBrandFooter from 'components/auth/AuthBrandFooter';
import { validateRegistration, getPasswordStrength } from 'validators/authValidators';
import type { UserRole } from 'types/auth';
import { useToast } from 'components/toast/ToastContext';

const STRENGTH_KEY: Record<number, string> = {
  0: 'notEntered',
  1: 'weak',
  2: 'fair',
  3: 'good',
  4: 'strong',
};

function RegisterPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { showToast } = useToast();
  const { t } = useTranslation('auth');

  const roleParam = searchParams.get('role');
  const initialRole: UserRole = roleParam && /admin/i.test(roleParam) ? 'Administrator' : 'Staff';

  // Role state initialized from URL param (defaulting to Staff if not specified)
  const [role, setRole] = useState<UserRole>(initialRole);

  useEffect(() => {
    if (roleParam) {
      if (/admin/i.test(roleParam)) setRole('Administrator');
      else if (/staff/i.test(roleParam)) setRole('Staff');
    }
  }, [roleParam]);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [division, setDivision] = useState('');
  const [phoneDigits, setPhoneDigits] = useState(''); // 9 digits after +94
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [agreeProtocols, setAgreeProtocols] = useState(false);

  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [registeredPendingInfo, setRegisteredPendingInfo] = useState<{
    id: string;
    email: string;
    name: string;
    role: string;
  } | null>(null);

  const [divisions, setDivisions] = useState<string[]>([]);
  const [loadingSections, setLoadingSections] = useState(true);

  // Section list comes from the database (sections table) via the API.
  useEffect(() => {
    const loadSections = async () => {
      try {
        const response = await fetch('/api/sections');
        const json = await response.json();
        console.log('Sections API response:', json);

        if (json?.ok && Array.isArray(json.data?.sections)) {
          setDivisions(json.data.sections.map((s: { name: string }) => s.name));
        } else {
          console.error('Invalid sections response:', json);
          showToast({
            type: 'error',
            title: t('register.loadFailedTitle'),
            message: t('register.loadFailedMessage'),
          });
        }
      } catch (error) {
        console.error('Error loading sections:', error);
        showToast({
          type: 'error',
          title: t('register.loadFailedTitle'),
          message: t('register.loadFailedMessage'),
        });
      } finally {
        setLoadingSections(false);
      }
    };

    loadSections();
  }, [showToast, t]);

  // Real-time Phone Number Formatter & Cleaner (Enforces 9 digits after +94, stripping leading 0)
  const handlePhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let raw = e.target.value.replace(/\D/g, '');
    // If user starts with 0, strip it since +94 covers the leading 0
    if (raw.startsWith('0')) {
      raw = raw.substring(1);
    }
    // Limit to exactly 9 digits
    if (raw.length > 9) {
      raw = raw.slice(0, 9);
    }
    setPhoneDigits(raw);
  };

  // Formatted display of the 9 digits (e.g. "77 123 4567")
  const formattedPhoneDisplay = useMemo(() => {
    if (!phoneDigits) return '';
    if (phoneDigits.length <= 2) return phoneDigits;
    if (phoneDigits.length <= 5) return `${phoneDigits.slice(0, 2)} ${phoneDigits.slice(2)}`;
    return `${phoneDigits.slice(0, 2)} ${phoneDigits.slice(2, 5)} ${phoneDigits.slice(5, 9)}`;
  }, [phoneDigits]);

  // Password Strength Calculation with dynamic color rating
  const passwordStrength = useMemo(() => getPasswordStrength(password), [password]);

  // Validations — shared with the server (validators/authValidators)
  const errors = useMemo(() => {
    const raw = validateRegistration({
      role,
      fullName: name,
      email,
      section: division,
      phoneDigits,
      password,
      confirmPassword,
    });

    const errs: Record<string, string> = {};
    if (raw.role) errs.role = raw.role;
    if (raw.fullName) errs.name = raw.fullName;
    if (raw.email) errs.email = raw.email;
    if (raw.section) errs.division = raw.section;
    if (raw.phone) errs.phone = raw.phone;
    if (raw.password) errs.password = raw.password;
    if (raw.confirmPassword) errs.confirmPassword = raw.confirmPassword;
    if (!agreeProtocols) {
      errs.agree = 'You must agree to the Department Data Protection & Archival Security Protocols.';
    }
    return errs;
  }, [role, name, email, division, phoneDigits, password, confirmPassword, agreeProtocols]);

  const localisedErrors = useMemo(() => localiseFieldErrors(errors), [errors]);

  const markTouched = (field: string) => {
    setTouched((prev) => ({ ...prev, [field]: true }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isLoading) return;

    // Mark all fields as touched for validation inspection
    setTouched({
      role: true,
      name: true,
      email: true,
      division: true,
      phone: true,
      password: true,
      confirmPassword: true,
      agree: true,
    });

    // Check if there are any errors
    const errorKeys = Object.keys(errors);
    if (errorKeys.length > 0) {
      const firstError = localisedErrors[errorKeys[0]];
      showToast({
        type: 'error',
        title: t('register.validationTitle'),
        message: firstError,
        duration: 5000,
      });
      return;
    }

    setIsLoading(true);

    try {
      // The requested role is stored for admin review; the server always
      // creates the account as Staff + pending approval.
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          role,
          fullName: name.trim(),
          email: email.trim(),
          section: division,
          phoneDigits,
          password,
          confirmPassword,
        }),
      });
      const json = await res.json();

      if (!res.ok || !json.ok) {
        setIsLoading(false);
        showToast({
          type: 'error',
          title: t('register.registrationFailedTitle'),
          message: localiseMessage(json.message || t('register.failedSubmit')),
          duration: 6000,
        });
        return;
      }

      setIsLoading(false);

      // Real-time toast notifying that account is pending approval
      showToast({
        type: 'warning',
        title: t('register.pendingToastTitle'),
        message: t('register.pendingToastMessage'),
        duration: 8000,
      });

      // Show on-screen confirmation card
      setRegisteredPendingInfo({
        id: json.data.userId || 'PENDING',
        email: email.trim(),
        name: name.trim(),
        role,
      });
    } catch {
      setIsLoading(false);
      showToast({
        type: 'error',
        title: t('register.registrationFailedTitle'),
        message: t('register.unreachable'),
        duration: 5000,
      });
    }
  };

  return (
    <div className="w-full flex flex-col items-center px-4 sm:px-6">
      {/* Brand Header */}
      <AuthBrandHeader variant="register" />

      {/* Main Registration Card */}
      <div className="relative w-full max-w-[540px] rounded-3xl bg-white shadow-xl shadow-slate-200/60 dark:bg-navy-800 dark:shadow-navy-950 border border-slate-100 dark:border-navy-700 overflow-hidden">
        {/* Top Gradient Stripe */}
        <div className="h-1.5 w-full bg-gradient-to-r from-[#4318FF] via-cyan-500 to-emerald-400" />

        <div className="p-6 sm:p-10">
          {/* Card Header */}
          <div className="mb-6 flex flex-col">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-bold tracking-tight text-slate-900 dark:text-white" data-testid="registration-title">
                {t(role === 'Administrator' ? 'register.adminTitle' : 'register.staffTitle')}
              </h2>
              <span className="flex items-center gap-1 rounded-full bg-sky-50 dark:bg-sky-950/50 px-2.5 py-0.5 text-xs font-semibold text-sky-800 dark:text-sky-300 border border-sky-200/80 dark:border-sky-800">
                <HiOutlineShieldCheck className="h-3.5 w-3.5 text-sky-600" />
                {t('register.authorizedOnly')}
              </span>
            </div>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              {t(role === 'Administrator' ? 'register.adminSubtitle' : 'register.staffSubtitle')}
            </p>
          </div>

          {registeredPendingInfo ? (
            /* Registration Success & Pending Approval Display */
            <div className="space-y-5 text-center">
              <div className="rounded-2xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 p-5 text-left">
                <div className="flex items-center gap-2 mb-2">
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-amber-500 text-white text-xs font-bold">
                    ⏳
                  </span>
                  <p className="text-sm font-bold text-amber-900 dark:text-amber-200">
                    {t('register.submittedTitle')}
                  </p>
                </div>

                <p className="text-xs text-amber-800 dark:text-amber-300 leading-relaxed">
                  <Trans
                    t={t}
                    i18nKey="register.thankYou"
                    values={{
                      name: registeredPendingInfo.name,
                      role: registeredPendingInfo.role,
                      id: registeredPendingInfo.id,
                    }}
                    components={{
                      name: <span className="font-semibold" />,
                      role: <span className="font-semibold" />,
                    }}
                  />
                </p>

                <div className="mt-3 rounded-xl bg-white/70 dark:bg-navy-900/60 p-3 text-[11px] text-slate-700 dark:text-slate-300 border border-amber-200/50">
                  <p className="font-semibold text-slate-800 dark:text-white">{t('register.nextSteps')}</p>
                  <p className="mt-0.5 text-slate-600 dark:text-slate-300">
                    <Trans
                      t={t}
                      i18nKey="register.verifyText"
                      values={{ email: registeredPendingInfo.email }}
                      components={{ email: <span className="font-medium underline" /> }}
                    />
                  </p>
                </div>
              </div>

              <Link
                href="/auth/sign-in"
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#4318FF] py-3.5 text-sm font-semibold text-white shadow-lg shadow-indigo-600/25 transition duration-150 hover:bg-[#3411db]"
              >
                ← {t('register.returnToSignIn')}
              </Link>
            </div>
          ) : (
            /* Registration Form */
            <form onSubmit={handleSubmit} className="space-y-4">
              {/* 1. USER ROLE (REQUIRED AT VERY TOP - DEFAULT: STAFF) */}
              <div>
                <label className="mb-1.5 flex items-center justify-between text-xs font-semibold text-slate-700 dark:text-slate-200">
                  <span className="flex items-center gap-1">
                    <FiShield className="text-[#4318FF]" />
                    {t('register.userRole')} <span className="text-red-500">*</span>
                  </span>
                  <span className="text-[10px] font-medium text-slate-400">
                    {t('register.defaultStaff')}
                  </span>
                </label>

                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    data-testid="role-staff-btn"
                    aria-label={t('register.selectStaffRole')}
                    onClick={() => setRole('Staff')}
                    className={`flex items-center justify-center gap-2 rounded-xl py-2.5 px-3 text-xs font-semibold border transition duration-150 cursor-pointer ${
                      role === 'Staff'
                        ? 'bg-[#4318FF] text-white border-[#4318FF] shadow-sm'
                        : 'bg-[#f4f7fe] dark:bg-navy-900 text-slate-600 dark:text-slate-300 border-transparent hover:bg-slate-200/50'
                    }`}
                  >
                    <FiUser className="h-3.5 w-3.5" />
                    <span>{t('register.staffRole')}</span>
                    {role === 'Staff' && <FiCheck className="h-3 w-3" />}
                  </button>

                  <button
                    type="button"
                    data-testid="role-admin-btn"
                    aria-label={t('register.selectAdminRole')}
                    onClick={() => setRole('Administrator')}
                    className={`flex items-center justify-center gap-2 rounded-xl py-2.5 px-3 text-xs font-semibold border transition duration-150 cursor-pointer ${
                      role === 'Administrator'
                        ? 'bg-[#4318FF] text-white border-[#4318FF] shadow-sm'
                        : 'bg-[#f4f7fe] dark:bg-navy-900 text-slate-600 dark:text-slate-300 border-transparent hover:bg-slate-200/50'
                    }`}
                  >
                    <FiShield className="h-3.5 w-3.5" />
                    <span>{t('register.adminRole')}</span>
                    {role === 'Administrator' && <FiCheck className="h-3 w-3" />}
                  </button>
                </div>
              </div>

              {/* 2. Full Legal Name */}
              <div>
                <label
                  htmlFor="reg-name"
                  className="mb-1.5 block text-xs font-semibold text-slate-700 dark:text-slate-200"
                >
                  {t('register.fullLegalName')} <span className="text-red-500">*</span>
                </label>
                <div className="relative flex items-center">
                  <FiUser className="absolute left-3.5 h-4 w-4 text-slate-400 pointer-events-none" />
                  <input
                    id="reg-name"
                    type="text"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    onBlur={() => markTouched('name')}
                    autoComplete="name"
                    placeholder={t('register.fullNamePlaceholder')}
                    className={`w-full rounded-xl bg-[#f4f7fe] dark:bg-navy-900 py-3 pl-10 pr-4 text-sm text-slate-800 dark:text-white placeholder:text-slate-500 dark:placeholder:text-slate-400 border transition duration-150 focus:outline-none ${
                      touched.name && errors.name
                        ? 'border-red-400 focus:border-red-500'
                        : 'border-transparent focus:border-[#4318FF]'
                    }`}
                  />
                </div>
                {touched.name && errors.name && (
                  <p className="mt-1 text-[11px] text-red-500 flex items-center gap-1">
                    <FiAlertCircle className="h-3 w-3" />
                    {localisedErrors.name}
                  </p>
                )}
              </div>

              {/* 3. Official / Work Email */}
              <div>
                <label
                  htmlFor="reg-email"
                  className="mb-1.5 block text-xs font-semibold text-slate-700 dark:text-slate-200"
                >
                  {t('register.officialEmail')} <span className="text-red-500">*</span>
                </label>
                <div className="relative flex items-center">
                  <FiMail className="absolute left-3.5 h-4 w-4 text-slate-400 pointer-events-none" />
                  <input
                    id="reg-email"
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    onBlur={() => markTouched('email')}
                    autoComplete="email"
                    placeholder={t('register.emailPlaceholder')}
                    className={`w-full rounded-xl bg-[#f4f7fe] dark:bg-navy-900 py-3 pl-10 pr-4 text-sm text-slate-800 dark:text-white placeholder:text-slate-500 dark:placeholder:text-slate-400 border transition duration-150 focus:outline-none ${
                      touched.email && errors.email
                        ? 'border-red-400 focus:border-red-500'
                        : 'border-transparent focus:border-[#4318FF]'
                    }`}
                  />
                </div>
                {touched.email && errors.email ? (
                  <p className="mt-1 text-[11px] text-red-500 flex items-center gap-1">
                    <FiAlertCircle className="h-3 w-3" />
                    {localisedErrors.email}
                  </p>
                ) : (
                  <p className="mt-1 text-[11px] text-slate-400">
                    {t('register.emailHint')}
                  </p>
                )}
              </div>

              {/* 4. Section */}
              <div>
                <label
                  htmlFor="reg-division"
                  className="mb-1.5 block text-xs font-semibold text-slate-700 dark:text-slate-200"
                >
                  {t('register.section')} <span className="text-red-500">*</span>
                </label>
                <div className="relative flex items-center">
                  <FiBriefcase className="absolute left-3.5 h-4 w-4 text-slate-400 pointer-events-none" />
                  <select
                    id="reg-division"
                    required
                    value={division}
                    onChange={(e) => setDivision(e.target.value)}
                    onBlur={() => markTouched('division')}
                    disabled={loadingSections}
                    className={`w-full rounded-xl bg-[#f4f7fe] dark:bg-navy-900 py-3 pl-10 pr-8 text-sm text-slate-800 dark:text-white border transition duration-150 focus:outline-none appearance-none cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${
                      touched.division && errors.division
                        ? 'border-red-400 focus:border-red-500'
                        : 'border-transparent focus:border-[#4318FF]'
                    }`}
                  >
                    <option value="" disabled>
                      {loadingSections ? t('register.loadingSections') : t('register.selectSection')}
                    </option>
                    {!loadingSections && divisions.length > 0 ? (
                      divisions.map((div) => (
                        <option key={div} value={div}>
                          {div}
                        </option>
                      ))
                    ) : (
                      !loadingSections && (
                        <option value="" disabled>
                          {t('register.noSections')}
                        </option>
                      )
                    )}
                  </select>
                  <span className="pointer-events-none absolute right-3 text-xs text-slate-400">
                    ▼
                  </span>
                </div>
                {touched.division && errors.division && (
                  <p className="mt-1 text-[11px] text-red-500 flex items-center gap-1">
                    <FiAlertCircle className="h-3 w-3" />
                    {localisedErrors.division}
                  </p>
                )}
              </div>

              {/* 5. Mobile Phone Number (🇱🇰 +94 prefix pill + exactly 9 digits) */}
              <div>
                <div className="mb-1.5 flex items-center justify-between">
                  <label
                    htmlFor="reg-phone"
                    className="text-xs font-semibold text-slate-700 dark:text-slate-200"
                  >
                    {t('register.mobilePhone')} <span className="text-red-500">*</span>
                  </label>
                  <span className="text-[10px] text-slate-400">
                    {t('register.phoneHint')}
                  </span>
                </div>
                <div
                  className={`flex items-center rounded-xl bg-[#f4f7fe] dark:bg-navy-900 overflow-hidden border transition duration-150 ${
                    touched.phone && errors.phone
                      ? 'border-red-400 focus-within:border-red-500'
                      : 'border-transparent focus-within:border-[#4318FF]'
                  }`}
                >
                  {/* +94 Prefix Pill */}
                  <div className="flex items-center gap-1.5 bg-slate-200/80 dark:bg-navy-800 px-3 py-3 text-xs font-bold text-slate-700 dark:text-slate-200 border-r border-slate-300 dark:border-navy-700 select-none shrink-0">
                    <span>🇱🇰</span>
                    <span>+94</span>
                  </div>

                  <div className="relative flex w-full items-center bg-[#f4f7fe] dark:bg-navy-900">
                    <FiPhone className="absolute left-3 h-4 w-4 text-slate-400 dark:text-slate-500 pointer-events-none z-10" />
                    <input
                      id="reg-phone"
                      type="tel"
                      required
                      value={formattedPhoneDisplay}
                      onChange={handlePhoneChange}
                      onBlur={() => markTouched('phone')}
                      placeholder="77 123 4567"
                      maxLength={11}
                      autoComplete="off"
                      className="w-full bg-[#f4f7fe] dark:bg-navy-900 py-3 pl-9 pr-4 text-sm text-slate-800 dark:text-white placeholder:text-slate-400/90 dark:placeholder:text-slate-500 focus:outline-none"
                    />
                  </div>
                </div>
                {touched.phone && errors.phone && (
                  <p className="mt-1 text-[11px] text-red-500 flex items-center gap-1">
                    <FiAlertCircle className="h-3 w-3" />
                    {localisedErrors.phone}
                  </p>
                )}
              </div>

              {/* 6. Password & Real-Time Color Strength Meter */}
              <div>
                <label
                  htmlFor="reg-password"
                  className="mb-1.5 block text-xs font-semibold text-slate-700 dark:text-slate-200"
                >
                  {t('register.password')} <span className="text-red-500">*</span>
                </label>
                <div className="relative flex items-center">
                  <FiLock className="absolute left-3.5 h-4 w-4 text-slate-400 pointer-events-none" />
                  <input
                    id="reg-password"
                    type={showPassword ? 'text' : 'password'}
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    onBlur={() => markTouched('password')}
                    autoComplete="new-password"
                    placeholder={t('register.passwordPlaceholder')}
                    className={`w-full rounded-xl bg-[#f4f7fe] dark:bg-navy-900 py-3 pl-10 pr-10 text-sm text-slate-800 dark:text-white placeholder:text-slate-500 dark:placeholder:text-slate-400 border transition duration-150 focus:outline-none ${
                      touched.password && errors.password
                        ? 'border-red-400 focus:border-red-500'
                        : 'border-transparent focus:border-[#4318FF]'
                    }`}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    aria-pressed={showPassword}
                    aria-controls="reg-password"
                    className="absolute right-3 cursor-pointer rounded-md p-1 text-slate-400 hover:text-slate-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#4318FF] dark:hover:text-slate-200"
                    aria-label={t('register.togglePassword')}
                  >
                    {showPassword ? <FiEyeOff className="h-4 w-4" /> : <FiEye className="h-4 w-4" />}
                  </button>
                </div>

                {/* Password Strength Colored Progress Bar */}
                {password && (
                  <div className="mt-2 space-y-1">
                    <div className="h-1.5 w-full bg-slate-200 dark:bg-navy-700 rounded-full overflow-hidden">
                      <div
                        className={`h-full transition-all duration-300 ${passwordStrength.color}`}
                        style={{ width: passwordStrength.width }}
                      />
                    </div>
                    <div className="flex items-center justify-between text-[10px]">
                      <span className={`font-semibold ${passwordStrength.text}`}>
                        {t(`passwordStrength.${STRENGTH_KEY[passwordStrength.score]}`)}
                      </span>
                      <span className="text-slate-400">{t('register.archivalStandard')}</span>
                    </div>
                  </div>
                )}

                {touched.password && errors.password && (
                  <p className="mt-1 text-[11px] text-red-500 flex items-center gap-1">
                    <FiAlertCircle className="h-3 w-3" />
                    {localisedErrors.password}
                  </p>
                )}
              </div>

              {/* 7. Confirm Password */}
              <div>
                <label
                  htmlFor="reg-confirmPassword"
                  className="mb-1.5 block text-xs font-semibold text-slate-700 dark:text-slate-200"
                >
                  {t('register.confirmPassword')} <span className="text-red-500">*</span>
                </label>
                <div className="relative flex items-center">
                  <RiLockPasswordLine className="absolute left-3.5 h-4 w-4 text-slate-400 pointer-events-none" />
                  <input
                    id="reg-confirmPassword"
                    type={showConfirmPassword ? 'text' : 'password'}
                    required
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    onBlur={() => markTouched('confirmPassword')}
                    autoComplete="new-password"
                    placeholder={t('register.confirmPasswordPlaceholder')}
                    className={`w-full rounded-xl bg-[#f4f7fe] dark:bg-navy-900 py-3 pl-10 pr-10 text-sm text-slate-800 dark:text-white placeholder:text-slate-500 dark:placeholder:text-slate-400 border transition duration-150 focus:outline-none ${
                      touched.confirmPassword && errors.confirmPassword
                        ? 'border-red-400 focus:border-red-500'
                        : 'border-transparent focus:border-[#4318FF]'
                    }`}
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                    aria-pressed={showConfirmPassword}
                    aria-controls="reg-confirmPassword"
                    className="absolute right-3 cursor-pointer rounded-md p-1 text-slate-400 hover:text-slate-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#4318FF] dark:hover:text-slate-200"
                    aria-label={t('register.toggleConfirmPassword')}
                  >
                    {showConfirmPassword ? (
                      <FiEyeOff className="h-4 w-4" />
                    ) : (
                      <FiEye className="h-4 w-4" />
                    )}
                  </button>
                </div>
                {touched.confirmPassword && errors.confirmPassword ? (
                  <p className="mt-1 text-[11px] text-red-500 flex items-center gap-1">
                    <FiAlertCircle className="h-3 w-3" />
                    {localisedErrors.confirmPassword}
                  </p>
                ) : (
                  <div className="mt-1 flex items-center gap-1 text-[11px] text-slate-400">
                    <FiInfo className="h-3 w-3" />
                    <span>{t('register.mustMatch')}</span>
                  </div>
                )}
              </div>

              {/* 8. Security Protocol Agreement Checkbox (MANDATORY) */}
              <div className="pt-2">
                <label className="flex items-start gap-2.5 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    required
                    checked={agreeProtocols}
                    onChange={(e) => setAgreeProtocols(e.target.checked)}
                    className="mt-0.5 h-4 w-4 rounded border-slate-300 text-[#4318FF] focus:ring-[#4318FF]"
                  />
                  <span className="text-xs text-slate-600 dark:text-slate-300 leading-tight">
                    {t('register.agree')}{' '}
                    <span className="text-red-500 font-bold">*</span>
                  </span>
                </label>
                {touched.agree && errors.agree && (
                  <p className="mt-1 text-[11px] text-red-500 flex items-center gap-1">
                    <FiAlertCircle className="h-3 w-3" />
                    {localisedErrors.agree}
                  </p>
                )}
              </div>

              {/* Submit Registration Button */}
              <button
                type="submit"
                disabled={isLoading}
                aria-busy={isLoading}
                className="mt-6 flex w-full items-center justify-center gap-2 rounded-xl bg-[#4318FF] py-3.5 text-sm font-semibold text-white shadow-lg shadow-indigo-600/25 transition duration-150 hover:bg-[#3411db] active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-70 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#4318FF] focus-visible:ring-offset-2 cursor-pointer"
              >
                {isLoading ? (
                  <span>{t('register.creatingAccount')}</span>
                ) : (
                  <span>{t('register.createAccount')}</span>
                )}
              </button>
            </form>
          )}

          {/* Already have account link */}
          <div className="mt-6 text-center">
            <p className="text-xs text-slate-600 dark:text-slate-400">
              {t('register.alreadyHaveAccount')}{' '}
              <Link
                href="/auth/sign-in"
                className="inline-flex items-center gap-1 font-semibold text-[#4318FF] hover:underline dark:text-brand-400"
              >
                <span>{t('register.signIn')}</span>
                <FiArrowRight className="h-3 w-3" />
              </Link>
            </p>
          </div>
        </div>
      </div>

      {/* Brand Footer */}
      <AuthBrandFooter />
    </div>
  );
}

function RegisterPageFallback() {
  const { t } = useTranslation('auth');
  return (
    <div className="min-h-screen flex items-center justify-center">{t('register.loading')}</div>
  );
}

export default function RegisterPage() {
  return (
    <Suspense fallback={<RegisterPageFallback />}>
      <RegisterPageContent />
    </Suspense>
  );
}
