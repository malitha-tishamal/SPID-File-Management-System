'use client';
import React, { useEffect, useState, useMemo } from 'react';
import {
  FiUser,
  FiMail,
  FiLock,
  FiPhone,
  FiEye,
  FiEyeOff,
  FiCheck,
  FiCheckCircle,
  FiAlertCircle,
  FiX,
  FiKey,
  FiRefreshCw,
  FiShield,
  FiUploadCloud,
  FiTrash2,
  FiEdit2,
  FiClock,
} from 'react-icons/fi';
import { MdAdminPanelSettings, MdSecurity } from 'react-icons/md';
import type { ProfileDTO, UserRole } from 'types/auth';
import type { SectionRow } from 'models/SectionRepository';

type ActiveTab = 'profile' | 'security';

interface ProfileFeedback {
  type: 'profile-success' | 'profile-error' | 'password-success' | 'password-error';
  title: string;
  description: string;
  badge?: string;
}

export default function ProfileManagementPage() {
  const [activeTab, setActiveTab] = useState<ActiveTab>('profile');
  const [profile, setProfile] = useState<ProfileDTO | null>(null);
  const [sections, setSections] = useState<SectionRow[]>([]);
  const [loading, setLoading] = useState(true);

  // Profile Form state
  const [fullName, setFullName] = useState('');
  const [sectionId, setSectionId] = useState<number | null>(null);
  const [phoneDigits, setPhoneDigits] = useState('');
  const [savingProfile, setSavingProfile] = useState(false);

  // Password Form state
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);

  // Avatar upload state
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);

  // Modal feedback state
  const [feedback, setFeedback] = useState<ProfileFeedback | null>(null);

  // Load profile and sections
  const loadData = async () => {
    setLoading(true);
    try {
      try {
        const storedAvatar = localStorage.getItem('spid_user_avatar');
        if (storedAvatar) setAvatarPreview(storedAvatar);
      } catch {}

      const [meRes, secRes] = await Promise.all([
        fetch('/api/auth/me'),
        fetch('/api/sections'),
      ]);

      if (meRes.ok) {
        const meJson = await meRes.json();
        if (meJson.ok && meJson.data?.profile) {
          const p = meJson.data.profile as ProfileDTO;
          setProfile(p);
          setFullName(p.full_name || '');
          setSectionId(p.section_id);
          const cleanPhone = (p.mobile_phone || '').replace(/\D/g, '').replace(/^94/, '').replace(/^0/, '');
          setPhoneDigits(cleanPhone);
        }
      }

      if (secRes.ok) {
        const secJson = await secRes.json();
        if (secJson.ok) setSections(secJson.data.sections);
      }
    } catch (e) {
      console.error('Failed to load profile data', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  // Format phone display
  const formattedPhoneDisplay = useMemo(() => {
    if (!phoneDigits) return '';
    if (phoneDigits.length <= 2) return phoneDigits;
    if (phoneDigits.length <= 5) return `${phoneDigits.slice(0, 2)} ${phoneDigits.slice(2)}`;
    return `${phoneDigits.slice(0, 2)} ${phoneDigits.slice(2, 5)} ${phoneDigits.slice(5, 9)}`;
  }, [phoneDigits]);

  const handlePhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let raw = e.target.value.replace(/\D/g, '');
    if (raw.startsWith('0')) raw = raw.slice(1);
    if (raw.length > 9) raw = raw.slice(0, 9);
    setPhoneDigits(raw);
  };

  // Password criteria verification
  const passCriteria = useMemo(() => {
    return {
      length: newPassword.length >= 8 && newPassword.length <= 16,
      upper: /[A-Z]/.test(newPassword),
      digit: /[0-9]/.test(newPassword),
      special: /[@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?!]/.test(newPassword),
    };
  }, [newPassword]);

  const passStrengthScore = useMemo(() => {
    let score = 0;
    if (passCriteria.length) score++;
    if (passCriteria.upper) score++;
    if (passCriteria.digit) score++;
    if (passCriteria.special) score++;
    return score;
  }, [passCriteria]);

  const passwordsMatch = newPassword.length > 0 && newPassword === confirmPassword;

  // Handle Profile Save
  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile) return;
    setSavingProfile(true);

    try {
      const res = await fetch('/api/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          full_name: fullName.trim(),
          mobile_phone: phoneDigits,
          section_id: sectionId,
        }),
      });

      const json = await res.json().catch(() => null);

      if (res.ok && json?.ok) {
        setFeedback({
          type: 'profile-success',
          badge: 'PROFILE SYNCHRONIZED',
          title: 'Profile Details Updated Successfully',
          description:
            'Official Southern Provincial Irrigation Department staff credentials and departmental registry allocation have been securely committed to the canonical registry.',
        });
        loadData();
      } else {
        setFeedback({
          type: 'profile-error',
          title: 'Profile Update Failed',
          description:
            json?.message ||
            'The departmental archive registry rejected the submitted profile modifications due to compliance validation constraints.',
        });
      }
    } catch {
      setFeedback({
        type: 'profile-error',
        title: 'Profile Update Failed',
        description:
          'Could not reach the server. Please verify your internet connection and try again.',
      });
    } finally {
      setSavingProfile(false);
    }
  };

  // Discard profile changes
  const handleDiscardProfile = () => {
    if (!profile) return;
    setFullName(profile.full_name || '');
    setSectionId(profile.section_id);
    const cleanPhone = (profile.mobile_phone || '').replace(/\D/g, '').replace(/^94/, '').replace(/^0/, '');
    setPhoneDigits(cleanPhone);
  };

  // Handle Password Save
  const handleSavePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentPassword) {
      setFeedback({
        type: 'password-error',
        badge: 'AUTHENTICATION DISCREPANCY',
        title: 'Password Update Failed',
        description:
          'We could not verify and update your credentials. Please review the security requirements and re-enter your current password.',
      });
      return;
    }

    if (passStrengthScore < 3 || !passwordsMatch) {
      setFeedback({
        type: 'password-error',
        badge: 'AUTHENTICATION DISCREPANCY',
        title: 'Password Update Failed',
        description:
          'The new password does not satisfy government archival compliance requirements or passwords do not match.',
      });
      return;
    }

    setSavingPassword(true);

    try {
      const res = await fetch('/api/profile/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          currentPassword,
          newPassword,
          confirmPassword,
        }),
      });

      const json = await res.json().catch(() => null);

      if (res.ok && json?.ok) {
        setFeedback({
          type: 'password-success',
          title: 'Password Updated Successfully',
          description:
            'Your official SPID administrative credentials and cryptographic session tokens have been synchronized and updated according to departmental security protocols.',
        });
        setCurrentPassword('');
        setNewPassword('');
        setConfirmPassword('');
      } else {
        setFeedback({
          type: 'password-error',
          badge: 'AUTHENTICATION DISCREPANCY',
          title: 'Password Update Failed',
          description:
            json?.message ||
            'We could not verify and update your credentials. Please review the security requirements and re-enter your current password.',
        });
      }
    } catch {
      setFeedback({
        type: 'password-error',
        badge: 'AUTHENTICATION DISCREPANCY',
        title: 'Password Update Failed',
        description:
          'Could not reach the security cluster. Please check your network and try again.',
      });
    } finally {
      setSavingPassword(false);
    }
  };

  // Handle Avatar upload
  const handleAvatarFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 2 * 1024 * 1024) {
      alert('File size exceeds 2MB limit.');
      return;
    }

    // Persist as base64 for reliable instant cross-page sync
    const reader = new FileReader();
    reader.onload = (ev) => {
      const base64 = ev.target?.result as string;
      if (base64) {
        setAvatarPreview(base64);
        try {
          localStorage.setItem('spid_user_avatar', base64);
          window.dispatchEvent(new Event('spid_avatar_updated'));
        } catch {}
      }
    };
    reader.readAsDataURL(file);

    setAvatarUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      await fetch('/api/profile/avatar', {
        method: 'POST',
        body: formData,
      });
    } catch (err) {
      console.error(err);
    } finally {
      setAvatarUploading(false);
    }
  };

  const displayName = profile?.full_name || 'Malitha Tishamal';
  const displayRole = profile?.role || 'Administrator';
  const displayEmail = profile?.email || 'malitha.tashimal@spid.gov.lk';
  const displayInitials = displayName.slice(0, 2).toUpperCase();

  const formattedUpdateDate = useMemo(() => {
    const raw = profile?.approved_at || profile?.created_at;
    if (!raw) return '—';
    const d = new Date(raw);
    if (isNaN(d.getTime())) return '—';
    return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  }, [profile?.approved_at, profile?.created_at]);

  return (
    <div className="mt-2 flex flex-col gap-5">
      {/* ── Top Breadcrumbs & Page Heading ── */}
      <div className="flex flex-col gap-1 md:flex-row md:items-start md:justify-between">
        <div>
          <nav className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-400 dark:text-slate-500">
            <span>Pages</span>
            <span>&gt;</span>
            <span>System Settings</span>
            <span>&gt;</span>
            <span className="font-bold text-[#4318FF] dark:text-brand-300">Profile Management</span>
          </nav>
          <h1 className="text-2xl sm:text-[28px] font-black tracking-tight text-navy-700 dark:text-white mt-1">
            Profile Management
          </h1>
          <p className="max-w-2xl text-xs sm:text-[13px] leading-relaxed text-slate-500 dark:text-slate-400 mt-0.5">
            {activeTab === 'profile'
              ? 'Manage your official Southern Provincial Irrigation Department staff credentials, contact info, and department allocation.'
              : 'Manage your official Southern Provincial Irrigation Department security credentials, cryptographic session keys, and password authentication.'}
          </p>
        </div>

        {/* Right Status Badge (Matching Screenshots) */}
        <div className="mt-2 md:mt-0 flex shrink-0">
          {activeTab === 'profile' ? (
            <div className="flex items-center gap-2 rounded-full bg-emerald-50 px-3.5 py-1.5 text-[10px] font-black text-slate-700 dark:bg-emerald-950/30 dark:text-emerald-400 border border-emerald-200/60 shadow-sm">
              <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
              <span>SESSION ID: <span className="font-mono text-emerald-700 dark:text-emerald-300">SPID-SES-9941</span></span>
            </div>
          ) : (
            <div className="flex items-center gap-2 rounded-full bg-emerald-50 px-3.5 py-1.5 text-[10px] font-black text-slate-700 dark:bg-emerald-950/30 dark:text-emerald-400 border border-emerald-200/60 shadow-sm">
              <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
              <span>SPID INTRANET NODE 04 - SECURE</span>
            </div>
          )}
        </div>
      </div>

      {/* ── Tab Switcher Pills (Matching Screenshots) ── */}
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => setActiveTab('profile')}
          className={`flex items-center gap-2 rounded-xl px-5 py-2.5 text-xs font-bold transition-all cursor-pointer ${
            activeTab === 'profile'
              ? 'bg-[#4318FF] text-white shadow-md shadow-indigo-500/25 ring-2 ring-[#4318FF]/20'
              : 'bg-white text-slate-600 hover:bg-slate-50 dark:bg-navy-800 dark:text-slate-300 border border-slate-200/80 dark:border-navy-700'
          }`}
        >
          <FiUser className="h-4 w-4" />
          <span>Profile &amp; Staff Details</span>
          {activeTab === 'profile' && (
            <span className="rounded-md bg-white/20 px-1.5 py-0.5 text-[9px] font-black tracking-wider uppercase">
              PRIMARY
            </span>
          )}
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('security')}
          className={`flex items-center gap-2 rounded-xl px-5 py-2.5 text-xs font-bold transition-all cursor-pointer ${
            activeTab === 'security'
              ? 'bg-[#4318FF] text-white shadow-md shadow-indigo-500/25 ring-2 ring-[#4318FF]/20'
              : 'bg-white text-slate-600 hover:bg-slate-50 dark:bg-navy-800 dark:text-slate-300 border border-slate-200/80 dark:border-navy-700'
          }`}
        >
          <FiLock className="h-4 w-4" />
          <span>Security &amp; Password</span>
          {activeTab === 'security' && (
            <span className="rounded-md bg-white/20 px-1.5 py-0.5 text-[9px] font-black tracking-wider uppercase">
              Active
            </span>
          )}
        </button>
      </div>

      {/* ═══════════════════════════════════════════════════════════════════
          TAB 1: PROFILE & STAFF DETAILS (IMAGE 1)
         ═══════════════════════════════════════════════════════════════════ */}
      {activeTab === 'profile' && (
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-12 items-start">
          {/* ── Left Column: Identity & Avatar Card ── */}
          <div className="lg:col-span-4 rounded-[24px] bg-white dark:bg-navy-700 p-6 shadow-md shadow-shadow-500 dark:shadow-none border border-slate-100 dark:border-navy-600 flex flex-col items-center text-center">
            {/* Ambient top gradient behind avatar */}
            <div className="relative mb-3 flex flex-col items-center">
              <div className="relative">
                {/* Large Avatar */}
                <div className="h-28 w-28 rounded-full bg-gradient-to-b from-slate-200 to-slate-300 dark:from-navy-600 dark:to-navy-800 flex items-center justify-center text-3xl font-black text-slate-500 dark:text-slate-300 shadow-inner overflow-hidden border-4 border-white dark:border-navy-700">
                  {avatarPreview ? (
                    <img src={avatarPreview} alt="Avatar" className="h-full w-full object-cover" />
                  ) : (
                    displayInitials
                  )}
                </div>
                {/* Green verified badge check */}
                <span className="absolute bottom-1 right-1 flex h-6 w-6 items-center justify-center rounded-full bg-emerald-500 text-white shadow-md ring-2 ring-white dark:ring-navy-700">
                  <FiCheck className="h-3.5 w-3.5 stroke-[3]" />
                </span>
              </div>

              {/* Upload buttons */}
              <div className="mt-4 flex items-center gap-2">
                <label className="flex items-center gap-1.5 rounded-xl bg-[#4318FF] px-4 py-2 text-xs font-bold text-white shadow-sm hover:bg-brand-600 cursor-pointer transition-colors">
                  <FiUploadCloud className="h-4 w-4" />
                  <span>Upload New Avatar</span>
                  <input type="file" accept="image/*" onChange={handleAvatarFile} className="hidden" />
                </label>
                <button
                  type="button"
                  onClick={() => {
                    setAvatarPreview(null);
                    try {
                      localStorage.removeItem('spid_user_avatar');
                      window.dispatchEvent(new Event('spid_avatar_updated'));
                    } catch {}
                  }}
                  className="flex h-8 w-8 items-center justify-center rounded-xl border border-red-200 text-red-500 hover:bg-red-50 dark:border-red-900/40 dark:hover:bg-red-950/20 transition-colors"
                  title="Remove avatar"
                >
                  <FiTrash2 className="h-4 w-4" />
                </button>
              </div>
              <p className="mt-1.5 text-[11px] font-medium text-slate-400">JPG, PNG or GIF. Max size 2MB.</p>
            </div>

            {/* Officer Name & Badges */}
            <h2 className="mt-2 text-lg font-black text-navy-700 dark:text-white">{displayName}</h2>
            <div className="mt-1 flex items-center justify-center">
              <span className="flex items-center gap-1 rounded-full bg-indigo-50 px-3 py-1 text-[10px] font-black uppercase tracking-wider text-[#4318FF] dark:bg-navy-800 dark:text-brand-300 border border-indigo-200/50">
                <FiLock className="h-3 w-3" /> {displayRole}
              </span>
            </div>
            <p className="mt-1 text-xs font-bold text-slate-400 font-mono">ID: EMP-SPID-0842</p>

            {/* Account Status Card */}
            <div className="mt-6 w-full rounded-2xl bg-[#f8faff] dark:bg-navy-800 p-4 border border-slate-100 dark:border-navy-700 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-100 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-400">
                  <FiCheckCircle className="h-4 w-4" />
                </div>
                <div className="text-left">
                  <p className="text-[11px] font-bold text-slate-700 dark:text-white">Account Status</p>
                </div>
              </div>
              <span className="rounded-full bg-emerald-100 px-3 py-1 text-[10px] font-black text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400 border border-emerald-200">
                Active &amp; Verified
              </span>
            </div>

            {/* Last Update Card */}
            <div className="mt-3 w-full rounded-2xl bg-[#f8faff] dark:bg-navy-800 p-4 border border-slate-100 dark:border-navy-700 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-indigo-100 text-[#4318FF] dark:bg-navy-700 dark:text-brand-300">
                  <FiClock className="h-4 w-4" />
                </div>
                <div className="text-left">
                  <p className="text-[11px] font-bold text-slate-700 dark:text-white">Last Update</p>
                </div>
              </div>
              <span className="text-xs font-bold text-slate-600 dark:text-slate-300 font-mono">
                {formattedUpdateDate}
              </span>
            </div>
          </div>

          {/* ── Right Column: Staff Registration & Profile Details Form ── */}
          <div className="lg:col-span-8 rounded-[24px] bg-white dark:bg-navy-700 p-6 sm:p-8 shadow-md shadow-shadow-500 dark:shadow-none border border-slate-100 dark:border-navy-600">
            <div>
              <h2 className="text-lg font-black text-navy-700 dark:text-white tracking-tight">
                Staff Registration &amp; Profile Details
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">
                Authorized Only • Manage irrigation archives and dossiers credentials.
              </p>
            </div>

            <form onSubmit={handleSaveProfile} className="mt-6 flex flex-col gap-5">
              {/* Row 1: Role (Locked) & Email (Locked) */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <div className="mb-1.5 flex items-center justify-between">
                    <label className="text-xs font-bold text-navy-700 dark:text-slate-200">
                      User Role <span className="text-red-500">*</span>
                    </label>
                    <span className="flex items-center gap-1 text-[10px] font-bold text-slate-400">
                      <FiLock className="h-3 w-3" /> Locked
                    </span>
                  </div>
                  <div className="relative">
                    <input
                      type="text"
                      disabled
                      value={`${displayRole} (System SuperAdmin)`}
                      className="h-11 w-full rounded-xl bg-[#f4f7fe] dark:bg-navy-900 px-4 text-xs font-bold text-slate-500 dark:text-slate-400 cursor-not-allowed border border-transparent"
                    />
                    <FiLock className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 h-4 w-4" />
                  </div>
                </div>

                <div>
                  <div className="mb-1.5 flex items-center justify-between">
                    <label className="text-xs font-bold text-navy-700 dark:text-slate-200">
                      Official / Work Email <span className="text-red-500">*</span>
                    </label>
                    <span className="flex items-center gap-1 text-[10px] font-bold text-emerald-600 dark:text-emerald-400">
                      <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" /> Permanent GOV.LK
                    </span>
                  </div>
                  <div className="relative">
                    <input
                      type="text"
                      disabled
                      value={displayEmail}
                      className="h-11 w-full rounded-xl bg-[#f4f7fe] dark:bg-navy-900 px-4 text-xs font-bold text-slate-500 dark:text-slate-400 cursor-not-allowed border border-transparent"
                    />
                    <FiLock className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 h-4 w-4" />
                  </div>
                </div>
              </div>

              {/* Row 2: Full Legal Name */}
              <div>
                <div className="mb-1.5 flex items-center justify-between">
                  <label className="text-xs font-bold text-navy-700 dark:text-slate-200">
                    Full Legal Name <span className="text-red-500">*</span>
                  </label>
                  <span className="text-[10px] text-slate-400">Must match National Identity Card</span>
                </div>
                <div className="relative">
                  <input
                    type="text"
                    required
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    className="h-11 w-full rounded-xl bg-[#f4f7fe] dark:bg-navy-900 pl-4 pr-10 text-xs font-bold text-navy-700 dark:text-white outline-none focus:ring-2 focus:ring-[#4318FF]/20 border border-transparent focus:border-[#4318FF] transition-all"
                  />
                  <FiEdit2 className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 h-4 w-4" />
                </div>
              </div>

              {/* Row 3: Section / Department */}
              <div>
                <div className="mb-1.5 flex items-center justify-between">
                  <label className="text-xs font-bold text-navy-700 dark:text-slate-200">
                    Section / Department <span className="text-red-500">*</span>
                  </label>
                  <span className="text-[10px] text-[#4318FF] dark:text-brand-300 font-bold">SPID Operational Unit</span>
                </div>
                <select
                  value={sectionId ?? ''}
                  onChange={(e) => setSectionId(e.target.value ? Number(e.target.value) : null)}
                  className="h-11 w-full rounded-xl bg-[#f4f7fe] dark:bg-navy-900 px-4 text-xs font-bold text-navy-700 dark:text-white outline-none focus:ring-2 focus:ring-[#4318FF]/20 border border-transparent focus:border-[#4318FF] transition-all cursor-pointer"
                >
                  <option value="">— Select Assigned SPID Division —</option>
                  {sections.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Row 4: Mobile Phone (full width) */}
              <div>
                <div className="mb-1.5 flex items-center justify-between">
                  <label className="text-xs font-bold text-navy-700 dark:text-slate-200">
                    Mobile Phone Number <span className="text-red-500">*</span>
                  </label>
                </div>
                <div className="flex items-center rounded-xl bg-[#f4f7fe] dark:bg-navy-900 overflow-hidden border border-transparent focus-within:border-[#4318FF] focus-within:ring-2 focus-within:ring-[#4318FF]/20 transition-all">
                  {/* +94 Prefix pill */}
                  <div className="flex items-center gap-1 bg-slate-200/80 dark:bg-navy-800 px-3 py-3 text-xs font-bold text-slate-700 dark:text-slate-200 border-r border-slate-300 dark:border-navy-700 select-none shrink-0">
                    <span>🇱🇰</span>
                    <span>+94</span>
                  </div>
                  <div className="relative flex w-full items-center">
                    <input
                      type="tel"
                      required
                      value={formattedPhoneDisplay}
                      onChange={handlePhoneChange}
                      placeholder="77 123 4567"
                      maxLength={11}
                      className="h-11 w-full bg-transparent pl-3 pr-9 text-xs font-bold text-navy-700 dark:text-white outline-none"
                    />
                    <FiPhone className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 h-4 w-4 pointer-events-none" />
                  </div>
                </div>
                <p className="mt-1 text-[10px] text-slate-400">
                  9 digits without leading 0 (SMS notifications &amp; 2FA dispatch).
                </p>
              </div>

              {/* Bottom Actions Row */}
              <div className="mt-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-t border-slate-100 dark:border-navy-600 pt-5">
                <p className="text-[11px] font-medium text-slate-400">
                  Field inputs marked with (<span className="text-red-500">*</span>) are mandatory.
                </p>
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={handleDiscardProfile}
                    disabled={savingProfile}
                    className="rounded-xl bg-[#ff5a60] px-5 py-2.5 text-xs font-bold text-white shadow-sm hover:bg-red-600 transition-colors cursor-pointer"
                  >
                    Discard Changes
                  </button>
                  <button
                    type="submit"
                    disabled={savingProfile}
                    className="flex items-center gap-2 rounded-xl bg-[#4318FF] px-6 py-2.5 text-xs font-bold text-white shadow-md shadow-indigo-500/25 hover:bg-brand-600 transition-colors cursor-pointer"
                  >
                    {savingProfile ? (
                      <>
                        <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/40 border-t-white" />
                        <span>Saving...</span>
                      </>
                    ) : (
                      <>
                        <FiCheck className="h-4 w-4" />
                        <span>Save Profile Changes</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════
          TAB 2: SECURITY & PASSWORD (IMAGE 2)
         ═══════════════════════════════════════════════════════════════════ */}
      {activeTab === 'security' && (
        <div className="flex flex-col gap-5 max-w-4xl">
          <div className="rounded-[24px] bg-white dark:bg-navy-700 p-6 sm:p-8 shadow-md shadow-shadow-500 dark:shadow-none border border-slate-100 dark:border-navy-600">
            {/* Header */}
            <div className="flex items-start justify-between pb-4 border-b border-gray-100 dark:border-navy-600">
              <div>
                <h2 className="text-lg font-black text-navy-700 dark:text-white tracking-tight">
                  Change Account Password
                </h2>
                <p className="text-xs text-slate-400 max-w-xl mt-1 leading-relaxed">
                  Ensure your password uses at least 10 characters with numbers, special characters, and mixed casing for government archival compliance.
                </p>
              </div>
              <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-indigo-50 text-[#4318FF] dark:bg-navy-800 dark:text-brand-300">
                <FiKey className="h-5 w-5" />
              </div>
            </div>

            <form onSubmit={handleSavePassword} className="mt-6 flex flex-col gap-5">
              {/* Current Password */}
              <div>
                <div className="mb-1.5 flex items-center justify-between">
                  <label className="text-xs font-bold text-navy-700 dark:text-slate-200">
                    Current Password <span className="text-red-500">*</span>
                  </label>
                  <a href="/auth/forgot-password" className="text-[11px] font-bold text-[#4318FF] hover:underline dark:text-brand-300">
                    Forgot your current password?
                  </a>
                </div>
                <div className="relative">
                  <FiLock className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 h-4 w-4" />
                  <input
                    type={showCurrentPassword ? 'text' : 'password'}
                    required
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    placeholder="Enter current official password"
                    className="h-11 w-full rounded-xl bg-[#f4f7fe] dark:bg-navy-900 pl-10 pr-10 text-xs font-bold text-navy-700 dark:text-white outline-none focus:ring-2 focus:ring-[#4318FF]/20 border border-transparent focus:border-[#4318FF] transition-all"
                  />
                  <button
                    type="button"
                    onClick={() => setShowCurrentPassword(!showCurrentPassword)}
                    className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
                  >
                    {showCurrentPassword ? <FiEyeOff className="h-4 w-4" /> : <FiEye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              {/* New Password */}
              <div>
                <div className="mb-1.5 flex items-center justify-between">
                  <label className="text-xs font-bold text-navy-700 dark:text-slate-200">
                    New Password <span className="text-red-500">*</span>
                  </label>
                </div>
                <div className="relative">
                  <FiKey className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 h-4 w-4" />
                  <input
                    type={showNewPassword ? 'text' : 'password'}
                    required
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="Enter strong password (e.g. Kanneliya#Dams2025)"
                    className="h-11 w-full rounded-xl bg-[#f4f7fe] dark:bg-navy-900 pl-10 pr-10 text-xs font-bold text-navy-700 dark:text-white outline-none focus:ring-2 focus:ring-[#4318FF]/20 border border-transparent focus:border-[#4318FF] transition-all"
                  />
                  <button
                    type="button"
                    onClick={() => setShowNewPassword(!showNewPassword)}
                    className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
                  >
                    {showNewPassword ? <FiEyeOff className="h-4 w-4" /> : <FiEye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              {/* Password Resilience Meter (Matching Screenshot 2) */}
              <div>
                <div className="flex items-center justify-between text-[11px] mb-1.5">
                  <span className="font-bold text-slate-500">Password Resilience:</span>
                  <span className="flex items-center gap-1 font-bold text-emerald-600 dark:text-emerald-400">
                    <FiShield className="h-3.5 w-3.5" />
                    {passStrengthScore >= 3 ? 'Strong (Government Grade)' : passStrengthScore >= 2 ? 'Moderate' : 'Weak'}
                  </span>
                </div>
                <div className="grid grid-cols-4 gap-2">
                  {[1, 2, 3, 4].map((step) => (
                    <div
                      key={step}
                      className={`h-1.5 rounded-full transition-all duration-300 ${
                        step <= passStrengthScore
                          ? 'bg-emerald-500'
                          : 'bg-slate-200 dark:bg-navy-800'
                      }`}
                    />
                  ))}
                </div>

                {/* 4 Criteria Checklist */}
                <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-2 rounded-xl bg-[#f8faff] dark:bg-navy-800 p-3 text-[11px]">
                  <p className={`flex items-center gap-1.5 ${passCriteria.length ? 'text-emerald-600 dark:text-emerald-400 font-bold' : 'text-slate-400'}`}>
                    <FiCheck className="h-3.5 w-3.5" /> At least 8-16 characters
                  </p>
                  <p className={`flex items-center gap-1.5 ${passCriteria.upper ? 'text-emerald-600 dark:text-emerald-400 font-bold' : 'text-slate-400'}`}>
                    <FiCheck className="h-3.5 w-3.5" /> At least one uppercase letter (A-Z)
                  </p>
                  <p className={`flex items-center gap-1.5 ${passCriteria.digit ? 'text-emerald-600 dark:text-emerald-400 font-bold' : 'text-slate-400'}`}>
                    <FiCheck className="h-3.5 w-3.5" /> At least one numerical digit (0-9)
                  </p>
                  <p className={`flex items-center gap-1.5 ${passCriteria.special ? 'text-emerald-600 dark:text-emerald-400 font-bold' : 'text-slate-400'}`}>
                    <FiCheck className="h-3.5 w-3.5" /> Special symbol (@, #, $, %, etc.)
                  </p>
                </div>
              </div>

              {/* Confirm New Password */}
              <div>
                <div className="mb-1.5 flex items-center justify-between">
                  <label className="text-xs font-bold text-navy-700 dark:text-slate-200">
                    Confirm New Password <span className="text-red-500">*</span>
                  </label>
                  {passwordsMatch && (
                    <span className="flex items-center gap-1 text-[11px] font-bold text-emerald-600 dark:text-emerald-400">
                      <FiCheck className="h-3.5 w-3.5" /> Passwords match
                    </span>
                  )}
                </div>
                <div className="relative">
                  <FiRefreshCw className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 h-4 w-4" />
                  <input
                    type={showConfirmPassword ? 'text' : 'password'}
                    required
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Re-enter new password"
                    className="h-11 w-full rounded-xl bg-[#f4f7fe] dark:bg-navy-900 pl-10 pr-10 text-xs font-bold text-navy-700 dark:text-white outline-none focus:ring-2 focus:ring-[#4318FF]/20 border border-transparent focus:border-[#4318FF] transition-all"
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                    className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
                  >
                    {showConfirmPassword ? <FiEyeOff className="h-4 w-4" /> : <FiEye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              {/* Footer Actions */}
              <div className="mt-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-t border-slate-100 dark:border-navy-600 pt-5">
                <div className="flex items-center gap-3">
                  <button
                    type="submit"
                    disabled={savingPassword || !passwordsMatch || passStrengthScore < 3}
                    className="flex items-center gap-2 rounded-xl bg-[#4318FF] px-6 py-2.5 text-xs font-bold text-white shadow-md shadow-indigo-500/25 hover:bg-brand-600 transition-colors disabled:opacity-50 cursor-pointer"
                  >
                    {savingPassword ? (
                      <>
                        <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/40 border-t-white" />
                        <span>Updating...</span>
                      </>
                    ) : (
                      <>
                        <FiRefreshCw className="h-4 w-4" />
                        <span>Update Password &amp; Re-authenticate</span>
                      </>
                    )}
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setCurrentPassword('');
                      setNewPassword('');
                      setConfirmPassword('');
                    }}
                    className="rounded-xl px-4 py-2 text-xs font-bold text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-navy-800 transition-colors"
                  >
                    Cancel
                  </button>
                </div>

                <div className="text-[10px] font-mono font-bold text-slate-400">
                  KEYID: SPID-SHA256-4089
                </div>
              </div>
            </form>
          </div>

        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════
          FEEDBACK MODALS (MATCHING IMAGES 3, 4, 5)
         ═══════════════════════════════════════════════════════════════════ */}
      {feedback && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-md animate-fadeIn"
          onClick={() => setFeedback(null)}
        >
          <div
            className="relative w-full max-w-md overflow-hidden rounded-[28px] bg-white p-7 sm:p-9 text-center shadow-2xl dark:bg-navy-700 border border-slate-100 dark:border-navy-600"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Tone-tinted ambient glow */}
            <div
              className={`pointer-events-none absolute -left-10 -top-12 h-44 w-44 rounded-full ${
                feedback.type.includes('success') ? 'bg-emerald-400' : 'bg-red-400'
              } opacity-20 blur-3xl`}
            />

            {/* Close button */}
            <button
              onClick={() => setFeedback(null)}
              className="absolute right-4 top-4 flex h-7 w-7 items-center justify-center rounded-full text-slate-400 hover:bg-slate-100 dark:hover:bg-navy-600 transition-colors cursor-pointer"
            >
              <FiX className="h-4 w-4" />
            </button>

            {/* Icon */}
            <div
              className={`mx-auto flex h-16 w-16 items-center justify-center rounded-full text-white shadow-xl ${
                feedback.type.includes('success')
                  ? 'bg-gradient-to-b from-emerald-400 to-teal-500 shadow-emerald-500/25 ring-8 ring-emerald-50 dark:ring-navy-600'
                  : 'bg-gradient-to-b from-red-500 to-rose-600 shadow-red-500/25 ring-8 ring-red-50 dark:ring-navy-600'
              }`}
            >
              {feedback.type.includes('success') ? (
                <FiCheck className="h-8 w-8 stroke-[3]" />
              ) : (
                <FiShield className="h-8 w-8 stroke-[2.5]" />
              )}
            </div>

            {/* Badge Pill (e.g. PROFILE SYNCHRONIZED or AUTHENTICATION DISCREPANCY) */}
            {feedback.badge && (
              <div className="mt-4 flex justify-center">
                <span
                  className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[10px] font-black uppercase tracking-wider ${
                    feedback.type.includes('success')
                      ? 'bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-400'
                      : 'bg-red-50 text-red-700 border border-red-200 dark:bg-red-950/40 dark:text-red-400'
                  }`}
                >
                  <span
                    className={`h-1.5 w-1.5 rounded-full ${
                      feedback.type.includes('success') ? 'bg-emerald-500' : 'bg-red-500'
                    }`}
                  />
                  {feedback.badge}
                </span>
              </div>
            )}

            {/* Title & Description */}
            <h3 className="mt-3.5 text-lg font-black text-navy-700 dark:text-white">
              {feedback.title}
            </h3>
            <p className="mx-auto mt-2 max-w-sm text-xs leading-relaxed text-slate-500 dark:text-slate-400">
              {feedback.description}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
