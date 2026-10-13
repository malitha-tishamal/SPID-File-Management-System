'use client';

import React, { useState, useMemo } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
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
import { HiOutlineIdentification, HiOutlineShieldCheck } from 'react-icons/hi';
import { RiLockPasswordLine } from 'react-icons/ri';
import AuthBrandHeader from 'components/auth/AuthBrandHeader';
import AuthBrandFooter from 'components/auth/AuthBrandFooter';
import { registerUser, UserRole, AuthError } from 'utils/auth';
import { useToast } from 'components/toast/ToastContext';

export default function RegisterPage() {
  const router = useRouter();
  const { showToast } = useToast();

  // All text inputs start completely empty for true watermark appearance
  const [role, setRole] = useState<UserRole>('Staff'); // Default is 'Staff'
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [division, setDivision] = useState('');
  const [nic, setNic] = useState('');
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

  const divisions = [
    'Administration & Human Resources Division',
    'Irrigation Planning, Design & Feasibility',
    'Water Management, Operations & Hydrology',
    'Engineering Central Registry & Archive Records',
    'Land Acquisition & Field Surveys',
    'Finance, Accounts & Procurement',
    'Galle Regional Engineering Office',
    'Matara Regional Engineering Office',
    'Hambantota Regional Engineering Office',
  ];

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
  const passwordStrength = useMemo(() => {
    if (!password) {
      return { score: 0, label: 'Not entered', color: 'bg-slate-200', text: 'text-slate-400', width: '0%' };
    }

    let score = 0;
    if (password.length >= 8) score += 1;
    if (/[a-z]/.test(password) && /[A-Z]/.test(password)) score += 1;
    if (/\d/.test(password)) score += 1;
    if (/[!@#$%^&*(),.?":{}|<>]/.test(password)) score += 1;

    if (password.length < 8) {
      return {
        score: 1,
        label: 'Weak (min 8 characters)',
        color: 'bg-rose-500',
        text: 'text-rose-500',
        width: '25%',
      };
    }
    if (score <= 2) {
      return {
        score: 2,
        label: 'Fair (add numbers or special characters)',
        color: 'bg-amber-500',
        text: 'text-amber-500',
        width: '50%',
      };
    }
    if (score === 3) {
      return {
        score: 3,
        label: 'Good (meets basic requirements)',
        color: 'bg-sky-500',
        text: 'text-sky-500',
        width: '75%',
      };
    }
    return {
      score: 4,
      label: 'Strong (Archival Standard)',
      color: 'bg-emerald-500',
      text: 'text-emerald-500',
      width: '100%',
    };
  }, [password]);

  // Validations
  const errors = useMemo(() => {
    const errs: Record<string, string> = {};

    if (!role) {
      errs.role = 'User role must be specified.';
    }
    if (!name.trim()) {
      errs.name = 'Full legal name is required.';
    } else if (name.trim().length < 3) {
      errs.name = 'Full name must have at least 3 characters.';
    }

    if (!email.trim()) {
      errs.email = 'Official work email is required.';
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      errs.email = 'Please provide a valid email format (e.g. officer@spid.gov.lk).';
    }

    if (!division) {
      errs.division = 'Please select a section.';
    }

    if (!nic.trim()) {
      errs.nic = 'National Identity Card (NIC) is required.';
    } else if (!/^(\d{9}[vVxX]|\d{12})$/.test(nic.trim())) {
      errs.nic = 'Invalid NIC format (use 9 digits + V/X or modern 12 digits).';
    }

    if (!phoneDigits) {
      errs.phone = 'Mobile phone number is required.';
    } else if (phoneDigits.length !== 9) {
      errs.phone = `Please enter exactly 9 digits after +94 (${9 - phoneDigits.length} remaining).`;
    }

    if (!password) {
      errs.password = 'Password is required.';
    } else if (password.length < 8) {
      errs.password = 'Password must be at least 8 characters.';
    }

    if (!confirmPassword) {
      errs.confirmPassword = 'Confirmation password is required.';
    } else if (password !== confirmPassword) {
      errs.confirmPassword = 'Passwords do not match.';
    }

    if (!agreeProtocols) {
      errs.agree = 'You must agree to the Department Data Protection & Archival Security Protocols.';
    }

    return errs;
  }, [role, name, email, division, nic, phoneDigits, password, confirmPassword, agreeProtocols]);

  const markTouched = (field: string) => {
    setTouched((prev) => ({ ...prev, [field]: true }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    // Mark all fields as touched for validation inspection
    setTouched({
      role: true,
      name: true,
      email: true,
      division: true,
      nic: true,
      phone: true,
      password: true,
      confirmPassword: true,
      agree: true,
    });

    // Check if there are any errors
    const errorKeys = Object.keys(errors);
    if (errorKeys.length > 0) {
      const firstError = errors[errorKeys[0]];
      showToast({
        type: 'error',
        title: 'Validation Error',
        message: firstError,
        duration: 5000,
      });
      return;
    }

    setIsLoading(true);

    try {
      // Register with status: 'pending'
      const newAccount = registerUser({
        role,
        name,
        email,
        division,
        nic,
        phone: phoneDigits,
        password,
      });

      setIsLoading(false);

      // Real-time toast notifying that account is pending approval
      showToast({
        type: 'warning',
        title: 'Account Status: PENDING APPROVAL',
        message:
          'Registration submitted successfully! Your account is pending administrator approval before you can access the system.',
        duration: 8000,
      });

      // Show on-screen confirmation card
      setRegisteredPendingInfo({
        id: newAccount.id,
        email: newAccount.email,
        name: newAccount.name,
        role: newAccount.role,
      });
    } catch (err: any) {
      setIsLoading(false);
      const msg = err?.message || 'Failed to submit registration.';
      showToast({
        type: 'error',
        title: 'Registration Failed',
        message: msg,
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
              <h2 className="text-xl font-bold tracking-tight text-slate-900 dark:text-white">
                Staff Registration
              </h2>
              <span className="flex items-center gap-1 rounded-full bg-sky-50 dark:bg-sky-950/50 px-2.5 py-0.5 text-xs font-semibold text-sky-800 dark:text-sky-300 border border-sky-200/80 dark:border-sky-800">
                <HiOutlineShieldCheck className="h-3.5 w-3.5 text-sky-600" />
                Authorized Only
              </span>
            </div>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              Create an official account to manage irrigation archives and dossiers.
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
                    Registration Submitted — Status: PENDING
                  </p>
                </div>

                <p className="text-xs text-amber-800 dark:text-amber-300 leading-relaxed">
                  Thank you, <span className="font-semibold">{registeredPendingInfo.name}</span>. Your account request as{' '}
                  <span className="font-semibold">{registeredPendingInfo.role}</span> (Reference #{registeredPendingInfo.id}) has been recorded.
                </p>

                <div className="mt-3 rounded-xl bg-white/70 dark:bg-navy-900/60 p-3 text-[11px] text-slate-700 dark:text-slate-300 border border-amber-200/50">
                  <p className="font-semibold text-slate-800 dark:text-white">Next Steps:</p>
                  <p className="mt-0.5 text-slate-600 dark:text-slate-300">
                    Department administrative personnel will verify your official credentials. Once verified, you will be able to log in with{' '}
                    <span className="font-medium underline">{registeredPendingInfo.email}</span>.
                  </p>
                </div>
              </div>

              <Link
                href="/auth/sign-in"
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#4318FF] py-3.5 text-sm font-semibold text-white shadow-lg shadow-indigo-600/25 transition duration-150 hover:bg-[#3411db]"
              >
                ← Return to Sign In Portal
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
                    User Role <span className="text-red-500">*</span>
                  </span>
                  <span className="text-[10px] font-medium text-slate-400">
                    Default: Staff
                  </span>
                </label>

                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setRole('Staff')}
                    className={`flex items-center justify-center gap-2 rounded-xl py-2.5 px-3 text-xs font-semibold border transition duration-150 ${
                      role === 'Staff'
                        ? 'bg-[#4318FF] text-white border-[#4318FF] shadow-sm'
                        : 'bg-[#f4f7fe] dark:bg-navy-900 text-slate-600 dark:text-slate-300 border-transparent hover:bg-slate-200/50'
                    }`}
                  >
                    <FiUser className="h-3.5 w-3.5" />
                    <span>Staff</span>
                    {role === 'Staff' && <FiCheck className="h-3 w-3" />}
                  </button>

                  <button
                    type="button"
                    onClick={() => setRole('Administrator')}
                    className={`flex items-center justify-center gap-2 rounded-xl py-2.5 px-3 text-xs font-semibold border transition duration-150 ${
                      role === 'Administrator'
                        ? 'bg-[#4318FF] text-white border-[#4318FF] shadow-sm'
                        : 'bg-[#f4f7fe] dark:bg-navy-900 text-slate-600 dark:text-slate-300 border-transparent hover:bg-slate-200/50'
                    }`}
                  >
                    <FiShield className="h-3.5 w-3.5" />
                    <span>Administrator</span>
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
                  Full Legal Name <span className="text-red-500">*</span>
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
                    placeholder="e.g. K. L. Perera"
                    className={`w-full rounded-xl bg-[#f4f7fe] dark:bg-navy-900 py-3 pl-10 pr-4 text-sm text-slate-800 dark:text-white placeholder:text-slate-400/90 dark:placeholder:text-slate-500 focus:placeholder-transparent border transition duration-150 focus:outline-none ${
                      touched.name && errors.name
                        ? 'border-red-400 focus:border-red-500'
                        : 'border-transparent focus:border-[#4318FF]'
                    }`}
                  />
                </div>
                {touched.name && errors.name && (
                  <p className="mt-1 text-[11px] text-red-500 flex items-center gap-1">
                    <FiAlertCircle className="h-3 w-3" />
                    {errors.name}
                  </p>
                )}
              </div>

              {/* 3. Official / Work Email */}
              <div>
                <label
                  htmlFor="reg-email"
                  className="mb-1.5 block text-xs font-semibold text-slate-700 dark:text-slate-200"
                >
                  Official / Work Email <span className="text-red-500">*</span>
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
                    placeholder="e.g. perera.k@spid.gov.lk"
                    className={`w-full rounded-xl bg-[#f4f7fe] dark:bg-navy-900 py-3 pl-10 pr-4 text-sm text-slate-800 dark:text-white placeholder:text-slate-400/90 dark:placeholder:text-slate-500 focus:placeholder-transparent border transition duration-150 focus:outline-none ${
                      touched.email && errors.email
                        ? 'border-red-400 focus:border-red-500'
                        : 'border-transparent focus:border-[#4318FF]'
                    }`}
                  />
                </div>
                {touched.email && errors.email ? (
                  <p className="mt-1 text-[11px] text-red-500 flex items-center gap-1">
                    <FiAlertCircle className="h-3 w-3" />
                    {errors.email}
                  </p>
                ) : (
                  <p className="mt-1 text-[11px] text-slate-400">
                    Recommended: Use your designated @spid.gov.lk domain
                  </p>
                )}
              </div>

              {/* 4. Section */}
              <div>
                <label
                  htmlFor="reg-division"
                  className="mb-1.5 block text-xs font-semibold text-slate-700 dark:text-slate-200"
                >
                  Section <span className="text-red-500">*</span>
                </label>
                <div className="relative flex items-center">
                  <FiBriefcase className="absolute left-3.5 h-4 w-4 text-slate-400 pointer-events-none" />
                  <select
                    id="reg-division"
                    required
                    value={division}
                    onChange={(e) => setDivision(e.target.value)}
                    onBlur={() => markTouched('division')}
                    className={`w-full rounded-xl bg-[#f4f7fe] dark:bg-navy-900 py-3 pl-10 pr-8 text-sm text-slate-800 dark:text-white border transition duration-150 focus:outline-none appearance-none cursor-pointer ${
                      touched.division && errors.division
                        ? 'border-red-400 focus:border-red-500'
                        : 'border-transparent focus:border-[#4318FF]'
                    }`}
                  >
                    <option value="" disabled>
                      Select Section
                    </option>
                    {divisions.map((div) => (
                      <option key={div} value={div}>
                        {div}
                      </option>
                    ))}
                  </select>
                  <span className="pointer-events-none absolute right-3 text-xs text-slate-400">
                    ▼
                  </span>
                </div>
                {touched.division && errors.division && (
                  <p className="mt-1 text-[11px] text-red-500 flex items-center gap-1">
                    <FiAlertCircle className="h-3 w-3" />
                    {errors.division}
                  </p>
                )}
              </div>

              {/* 5. National Identity Card (NIC) */}
              <div>
                <label
                  htmlFor="reg-nic"
                  className="mb-1.5 block text-xs font-semibold text-slate-700 dark:text-slate-200"
                >
                  National Identity Card (NIC) <span className="text-red-500">*</span>
                </label>
                <div className="relative flex items-center">
                  <HiOutlineIdentification className="absolute left-3.5 h-4 w-4 text-slate-400 pointer-events-none" />
                  <input
                    id="reg-nic"
                    type="text"
                    required
                    value={nic}
                    onChange={(e) => setNic(e.target.value.toUpperCase())}
                    onBlur={() => markTouched('nic')}
                    placeholder="e.g. 198524103421 / 852410342V"
                    className={`w-full rounded-xl bg-[#f4f7fe] dark:bg-navy-900 py-3 pl-10 pr-4 text-sm text-slate-800 dark:text-white placeholder:text-slate-400/90 dark:placeholder:text-slate-500 focus:placeholder-transparent uppercase tracking-wide border transition duration-150 focus:outline-none ${
                      touched.nic && errors.nic
                        ? 'border-red-400 focus:border-red-500'
                        : 'border-transparent focus:border-[#4318FF]'
                    }`}
                  />
                </div>
                {touched.nic && errors.nic && (
                  <p className="mt-1 text-[11px] text-red-500 flex items-center gap-1">
                    <FiAlertCircle className="h-3 w-3" />
                    {errors.nic}
                  </p>
                )}
              </div>

              {/* 6. Mobile Phone Number (🇱🇰 +94 prefix pill + exactly 9 digits) */}
              <div>
                <div className="mb-1.5 flex items-center justify-between">
                  <label
                    htmlFor="reg-phone"
                    className="text-xs font-semibold text-slate-700 dark:text-slate-200"
                  >
                    Mobile Phone Number <span className="text-red-500">*</span>
                  </label>
                  <span className="text-[10px] text-slate-400">
                    9 digits without leading 0
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
                    {errors.phone}
                  </p>
                )}
              </div>

              {/* 7. Password & Real-Time Color Strength Meter */}
              <div>
                <label
                  htmlFor="reg-password"
                  className="mb-1.5 block text-xs font-semibold text-slate-700 dark:text-slate-200"
                >
                  Password <span className="text-red-500">*</span>
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
                    placeholder="••••••••••••"
                    className={`w-full rounded-xl bg-[#f4f7fe] dark:bg-navy-900 py-3 pl-10 pr-10 text-sm text-slate-800 dark:text-white placeholder:text-slate-400/90 dark:placeholder:text-slate-500 focus:placeholder-transparent border transition duration-150 focus:outline-none ${
                      touched.password && errors.password
                        ? 'border-red-400 focus:border-red-500'
                        : 'border-transparent focus:border-[#4318FF]'
                    }`}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                    aria-label="Toggle password visibility"
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
                        {passwordStrength.label}
                      </span>
                      <span className="text-slate-400">Archival Standard</span>
                    </div>
                  </div>
                )}

                {touched.password && errors.password && (
                  <p className="mt-1 text-[11px] text-red-500 flex items-center gap-1">
                    <FiAlertCircle className="h-3 w-3" />
                    {errors.password}
                  </p>
                )}
              </div>

              {/* 8. Confirm Password */}
              <div>
                <label
                  htmlFor="reg-confirmPassword"
                  className="mb-1.5 block text-xs font-semibold text-slate-700 dark:text-slate-200"
                >
                  Confirm Password <span className="text-red-500">*</span>
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
                    placeholder="••••••••••••"
                    className={`w-full rounded-xl bg-[#f4f7fe] dark:bg-navy-900 py-3 pl-10 pr-10 text-sm text-slate-800 dark:text-white placeholder:text-slate-400/90 dark:placeholder:text-slate-500 focus:placeholder-transparent border transition duration-150 focus:outline-none ${
                      touched.confirmPassword && errors.confirmPassword
                        ? 'border-red-400 focus:border-red-500'
                        : 'border-transparent focus:border-[#4318FF]'
                    }`}
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                    className="absolute right-3 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                    aria-label="Toggle confirm password visibility"
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
                    {errors.confirmPassword}
                  </p>
                ) : (
                  <div className="mt-1 flex items-center gap-1 text-[11px] text-slate-400">
                    <FiInfo className="h-3 w-3" />
                    <span>Must match password</span>
                  </div>
                )}
              </div>

              {/* 9. Security Protocol Agreement Checkbox (MANDATORY) */}
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
                    I agree to the Department Data Protection &amp; Archival Security Protocols{' '}
                    <span className="text-red-500 font-bold">*</span>
                  </span>
                </label>
                {touched.agree && errors.agree && (
                  <p className="mt-1 text-[11px] text-red-500 flex items-center gap-1">
                    <FiAlertCircle className="h-3 w-3" />
                    {errors.agree}
                  </p>
                )}
              </div>

              {/* Submit Registration Button */}
              <button
                type="submit"
                disabled={isLoading}
                className="mt-6 flex w-full items-center justify-center gap-2 rounded-xl bg-[#4318FF] py-3.5 text-sm font-semibold text-white shadow-lg shadow-indigo-600/25 transition duration-150 hover:bg-[#3411db] active:scale-[0.99] disabled:opacity-70 cursor-pointer"
              >
                {isLoading ? (
                  <span>Validating &amp; Submitting...</span>
                ) : (
                  <>
                    <span>+👤 Submit Registration</span>
                  </>
                )}
              </button>
            </form>
          )}

          {/* Already have account link */}
          <div className="mt-6 text-center">
            <p className="text-xs text-slate-600 dark:text-slate-400">
              Already have an account?{' '}
              <Link
                href="/auth/sign-in"
                className="inline-flex items-center gap-1 font-semibold text-[#4318FF] hover:underline dark:text-brand-400"
              >
                <span>Sign In</span>
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
