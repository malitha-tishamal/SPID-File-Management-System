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
import { useTranslation } from 'react-i18next';
import type { ProfileDTO, UserRole } from 'types/auth';
import type { SectionRow } from 'models/SectionRepository';
import { formatSriLankaDate } from 'lib/datetime';
import { useProfile } from 'contexts/ProfileContext';
import Button from 'components/ui/Button';

type ActiveTab = 'profile' | 'security';

interface ProfileFeedback {
  type: 'profile-success' | 'profile-error' | 'password-success' | 'password-error';
  title: string;
  description: string;
  badge?: string;
}

const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

export default function ProfileManagementPage() {
  const { t } = useTranslation('profile');
  const [activeTab, setActiveTab] = useState<ActiveTab>('profile');
  const {
    profile: contextProfile,
    avatarUrl,
    setAvatar,
    updateProfile,
    refreshProfile,
  } = useProfile();
  const [profile, setProfile] = useState<ProfileDTO | null>(contextProfile);
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
  const [avatarPreview, setAvatarPreview] = useState<string | null>(avatarUrl);
  const [pendingAvatarFile, setPendingAvatarFile] = useState<File | null>(null);
  const [pendingAvatarBase64, setPendingAvatarBase64] = useState<string | null>(null);
  const [showAvatarConfirmModal, setShowAvatarConfirmModal] = useState(false);
  const [showAvatarRemoveModal, setShowAvatarRemoveModal] = useState(false);

  // Modal feedback state
  const [feedback, setFeedback] = useState<ProfileFeedback | null>(null);

  // Keep preview in sync with context avatarUrl when not selecting a pending image
  useEffect(() => {
    if (!pendingAvatarBase64) {
      setAvatarPreview(avatarUrl);
    }
  }, [avatarUrl, pendingAvatarBase64]);

  // Keep profile in sync with contextProfile
  useEffect(() => {
    if (contextProfile) {
      setProfile(contextProfile);
      setFullName((prev) => prev || contextProfile.full_name || '');
      setSectionId((prev) => (prev !== null ? prev : contextProfile.section_id));
      if (!phoneDigits && contextProfile.mobile_phone) {
        const clean = contextProfile.mobile_phone.replace(/\D/g, '').replace(/^94/, '').replace(/^0/, '');
        setPhoneDigits(clean);
      }
    }
  }, [contextProfile]);

  // Load profile and sections
  const loadData = async () => {
    setLoading(true);
    try {
      const [p, secRes] = await Promise.all([
        refreshProfile(),
        fetch('/api/sections'),
      ]);

      if (p) {
        setProfile(p);
        setFullName(p.full_name || '');
        setSectionId(p.section_id);
        const cleanPhone = (p.mobile_phone || '').replace(/\D/g, '').replace(/^94/, '').replace(/^0/, '');
        setPhoneDigits(cleanPhone);
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
        if (json.data?.profile) {
          const updated = json.data.profile as ProfileDTO;
          // Saving contact details must never clear an existing avatar.
          const normalized = { ...updated, avatar_url: updated.avatar_url ?? avatarUrl };
          setProfile(normalized);
          updateProfile(normalized);
        }
        setFeedback({
          type: 'profile-success',
          badge: t('feedback.badgeProfileSynced'),
          title: t('feedback.profileUpdated'),
          description: t('feedback.profileUpdatedDesc'),
        });
      } else {
        setFeedback({
          type: 'profile-error',
          title: t('feedback.profileUpdateFailed'),
          description: json?.message || t('feedback.profileRejectedDesc'),
        });
      }
    } catch {
      setFeedback({
        type: 'profile-error',
        title: t('feedback.profileUpdateFailed'),
        description: t('feedback.networkDesc'),
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
        badge: t('feedback.badgeAuthDiscrepancy'),
        title: t('feedback.passwordUpdateFailed'),
        description: t('feedback.passwordVerificationDesc'),
      });
      return;
    }

    if (passStrengthScore < 3 || !passwordsMatch) {
      setFeedback({
        type: 'password-error',
        badge: t('feedback.badgeAuthDiscrepancy'),
        title: t('feedback.passwordUpdateFailed'),
        description: t('feedback.passwordComplianceDesc'),
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
          title: t('feedback.passwordUpdated'),
          description: t('feedback.passwordUpdatedDesc'),
        });
        setCurrentPassword('');
        setNewPassword('');
        setConfirmPassword('');
      } else {
        setFeedback({
          type: 'password-error',
          badge: t('feedback.badgeAuthDiscrepancy'),
          title: t('feedback.passwordUpdateFailed'),
          description: json?.message || t('feedback.passwordVerificationDesc'),
        });
      }
    } catch {
      setFeedback({
        type: 'password-error',
        badge: t('feedback.badgeAuthDiscrepancy'),
        title: t('feedback.passwordUpdateFailed'),
        description: t('feedback.networkSecurityDesc'),
      });
    } finally {
      setSavingPassword(false);
    }
  };

  // Handle Avatar selection (Opens confirmation modal first)
  const handleAvatarFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!ALLOWED_IMAGE_TYPES.includes(file.type) && !/\.(jpe?g|png|gif|webp)$/i.test(file.name)) {
      setFeedback({
        type: 'profile-error',
        badge: t('feedback.badgeUnsupportedFormat'),
        title: t('feedback.invalidFormat'),
        description: t('feedback.invalidFormatDesc'),
      });
      e.target.value = '';
      return;
    }

    if (file.size > 2 * 1024 * 1024) {
      setFeedback({
        type: 'profile-error',
        badge: t('feedback.badgeFileSize'),
        title: t('feedback.imageTooLarge'),
        description: t('feedback.imageTooLargeDesc'),
      });
      e.target.value = '';
      return;
    }

    const reader = new FileReader();
    reader.onload = (ev) => {
      const base64 = ev.target?.result as string;
      if (base64) {
        setPendingAvatarFile(file);
        setPendingAvatarBase64(base64);
        setAvatarPreview(base64);
        setShowAvatarConfirmModal(true);
      }
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  // Confirm and persist avatar to server and shared context
  const confirmSaveAvatar = async () => {
    if (!pendingAvatarFile) return;

    setAvatarUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', pendingAvatarFile);
      const res = await fetch('/api/profile/avatar', {
        method: 'POST',
        body: formData,
      });

      const json = await res.json().catch(() => null);

      if (res.ok && json?.ok) {
        const permanentUrl = json.data?.publicUrl || json.data?.profile?.avatar_url;
        if (!permanentUrl) {
          throw new Error('The server did not return a saved image URL.');
        }

        const serverProfile = json.data?.profile as ProfileDTO | undefined;
        const newUpdateIso = json?.data?.updated_at || new Date().toISOString();
        const savedProfile: ProfileDTO | null = serverProfile
          ? { ...serverProfile, avatar_url: permanentUrl }
          : profile
          ? { ...profile, avatar_url: permanentUrl, updated_at: newUpdateIso }
          : null;

        setAvatar(permanentUrl);
        setAvatarPreview(permanentUrl);
        if (savedProfile) {
          setProfile(savedProfile);
          updateProfile(savedProfile);
        }

        setShowAvatarConfirmModal(false);
        setPendingAvatarFile(null);
        setPendingAvatarBase64(null);

        setFeedback({
          type: 'profile-success',
          badge: t('feedback.badgeAvatarSynced'),
          title: t('feedback.avatarUpdated'),
          description: t('feedback.avatarUpdatedDesc'),
        });
      } else {
        // Preserve previous avatar on upload failure
        setShowAvatarConfirmModal(false);
        setPendingAvatarFile(null);
        setPendingAvatarBase64(null);
        setAvatarPreview(avatarUrl);
        setFeedback({
          type: 'profile-error',
          badge: t('feedback.badgeUploadFailed'),
          title: t('feedback.avatarUpdateFailed'),
          description: json?.message || t('feedback.avatarSaveFailedDesc'),
        });
      }
    } catch {
      // Preserve previous avatar on network error
      setShowAvatarConfirmModal(false);
      setPendingAvatarFile(null);
      setPendingAvatarBase64(null);
      setAvatarPreview(avatarUrl);
      setFeedback({
        type: 'profile-error',
        badge: t('feedback.badgeNetwork'),
        title: t('feedback.connectionError'),
        description: t('feedback.networkStorageDesc'),
      });
    } finally {
      setAvatarUploading(false);
    }
  };

  const handleRemoveAvatar = async () => {
    try {
      const res = await fetch('/api/profile/avatar', { method: 'DELETE' });
      const json = await res.json().catch(() => null);

      if (res.ok && json?.ok) {
        setAvatarPreview(null);
        setAvatar(null);
        setPendingAvatarFile(null);
        setPendingAvatarBase64(null);
        setShowAvatarRemoveModal(false);

        const nowIso = new Date().toISOString();
        const clearedProfile = json.data?.profile
          ? { ...(json.data.profile as ProfileDTO), avatar_url: null }
          : profile
          ? { ...profile, avatar_url: null, updated_at: nowIso }
          : null;
        if (clearedProfile) {
          setProfile(clearedProfile);
          updateProfile(clearedProfile);
        }

        setFeedback({
          type: 'profile-success',
          badge: t('feedback.badgeAvatarRemoved'),
          title: t('feedback.avatarReset'),
          description: t('feedback.avatarResetDesc'),
        });
      } else {
        setFeedback({
          type: 'profile-error',
          badge: t('feedback.badgeResetFailed'),
          title: t('feedback.avatarRemoveFailed'),
          description: json?.message || t('feedback.avatarRemoveFailedDesc'),
        });
        setShowAvatarRemoveModal(false);
      }
    } catch {
      setFeedback({
        type: 'profile-error',
        badge: t('feedback.badgeNetwork'),
        title: t('feedback.connectionError'),
        description: t('feedback.networkProfileDesc'),
      });
      setShowAvatarRemoveModal(false);
    }
  };

  const displayName = profile?.full_name || 'Malitha Tishamal';
  const displayRole = profile?.role || t('common:roles.ADMIN');
  const displayEmail = profile?.email || 'malitha.tashimal@spid.gov.lk';
  const displayInitials = displayName.slice(0, 2).toUpperCase();

  const formattedUpdateDate = useMemo(() => {
    const raw = profile?.updated_at || profile?.approved_at || profile?.created_at;
    if (!raw) return '—';
    return formatSriLankaDate(raw);
  }, [profile?.updated_at, profile?.approved_at, profile?.created_at]);

  return (
    <div className="mt-2 flex flex-col gap-5">
      {/* ── Top Breadcrumbs & Page Heading ── */}
      <div className="flex flex-col gap-1 md:flex-row md:items-start md:justify-between">
        <div>
          <nav className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-400 dark:text-slate-500">
            <span>{t('page.pages')}</span>
            <span>&gt;</span>
            <span>{t('page.systemSettings')}</span>
            <span>&gt;</span>
            <span className="font-bold text-[#4318FF] dark:text-brand-300">{t('page.title')}</span>
          </nav>
          <h1 className="text-2xl sm:text-[28px] font-black tracking-tight text-navy-700 dark:text-white mt-1">
            {t('page.title')}
          </h1>
          <p className="max-w-2xl text-xs sm:text-[13px] leading-relaxed text-slate-500 dark:text-slate-400 mt-0.5">
            {activeTab === 'profile'
              ? t('page.description')
              : t('page.securityDescription')}
          </p>
        </div>

        {/* Right Status Badge (Matching Screenshots) */}
        <div className="mt-2 md:mt-0 flex shrink-0">
          {activeTab === 'profile' ? (
            <div className="flex items-center gap-2 rounded-full bg-emerald-50 px-3.5 py-1.5 text-[10px] font-black text-slate-700 dark:bg-emerald-950/30 dark:text-emerald-400 border border-emerald-200/60 shadow-sm">
              <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
              <span>{t('page.sessionId')} <span className="font-mono text-emerald-700 dark:text-emerald-300">SPID-SES-9941</span></span>
            </div>
          ) : (
            <div className="flex items-center gap-2 rounded-full bg-emerald-50 px-3.5 py-1.5 text-[10px] font-black text-slate-700 dark:bg-emerald-950/30 dark:text-emerald-400 border border-emerald-200/60 shadow-sm">
              <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
              <span>{t('page.nodeStatus')}</span>
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
          <span>{t('tabs.profile')}</span>
          {activeTab === 'profile' && (
            <span className="rounded-md bg-white/20 px-1.5 py-0.5 text-[9px] font-black tracking-wider uppercase">
              {t('tabs.primary')}
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
          <span>{t('tabs.security')}</span>
          {activeTab === 'security' && (
            <span className="rounded-md bg-white/20 px-1.5 py-0.5 text-[9px] font-black tracking-wider uppercase">
              {t('common:status.active')}
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
                    <img src={avatarPreview} alt={t('avatar.alt')} className="h-full w-full object-cover" />
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
              <div className="mt-4 flex flex-col items-center gap-2">
                <div className="flex items-center gap-2">
                  <label className="flex items-center gap-1.5 rounded-xl bg-[#4318FF] px-4 py-2 text-xs font-bold text-white shadow-sm hover:bg-brand-600 cursor-pointer transition-colors active:scale-95">
                    <FiUploadCloud className="h-4 w-4" />
                    <span>{t('avatar.upload')}</span>
                    <input
                      type="file"
                      accept="image/jpeg,image/png,image/gif,image/webp"
                      onChange={handleAvatarFile}
                      className="hidden"
                    />
                  </label>
                  <button
                    type="button"
                    onClick={() => setShowAvatarRemoveModal(true)}
                    className="flex h-8 w-8 items-center justify-center rounded-xl border border-red-200 text-red-500 hover:bg-red-50 dark:border-red-900/40 dark:hover:bg-red-950/20 transition-colors cursor-pointer"
                    title={t('avatar.removeTooltip')}
                  >
                    <FiTrash2 className="h-4 w-4" />
                  </button>
                </div>

                {pendingAvatarBase64 && (
                  <div className="flex items-center gap-2 mt-1">
                    <button
                      type="button"
                      onClick={() => setShowAvatarConfirmModal(true)}
                      className="flex items-center gap-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 px-3.5 py-1.5 text-xs font-bold text-white shadow-md shadow-emerald-600/25 transition-all cursor-pointer"
                    >
                      <FiCheck className="h-3.5 w-3.5" />
                      <span>{t('avatar.save')}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setPendingAvatarFile(null);
                        setPendingAvatarBase64(null);
                        setAvatarPreview(avatarUrl);
                      }}
                      className="rounded-xl border border-slate-200 dark:border-navy-600 px-2.5 py-1.5 text-xs font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-navy-700 transition-colors cursor-pointer"
                    >
                      {t('common:buttons.cancel')}
                    </button>
                  </div>
                )}
                <p className="mt-1 text-[11px] font-medium text-slate-400">{t('avatar.hint')}</p>
              </div>
            </div>

            {/* Officer Name & Badges */}
            <h2 className="mt-2 text-lg font-black text-navy-700 dark:text-white">{displayName}</h2>
            <div className="mt-1 flex items-center justify-center">
              <span className="flex items-center gap-1 rounded-full bg-indigo-50 px-3 py-1 text-[10px] font-black uppercase tracking-wider text-[#4318FF] dark:bg-navy-800 dark:text-brand-300 border border-indigo-200/50">
                <FiLock className="h-3 w-3" /> {displayRole}
              </span>
            </div>
            <p className="mt-1 text-xs font-bold text-slate-400 font-mono">{t('identity.employeeId', { id: 'EMP-SPID-0842' })}</p>

            {/* Account Status Card */}
            <div className="mt-6 w-full rounded-2xl bg-[#f8faff] dark:bg-navy-800 p-4 border border-slate-100 dark:border-navy-700 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-100 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-400">
                  <FiCheckCircle className="h-4 w-4" />
                </div>
                <div className="text-left">
                  <p className="text-[11px] font-bold text-slate-700 dark:text-white">{t('identity.accountStatus')}</p>
                </div>
              </div>
              <span className="rounded-full bg-emerald-100 px-3 py-1 text-[10px] font-black text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400 border border-emerald-200">
                {t('identity.verified')}
              </span>
            </div>

            {/* Last Update Card */}
            <div className="mt-3 w-full rounded-2xl bg-[#f8faff] dark:bg-navy-800 p-4 border border-slate-100 dark:border-navy-700 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-indigo-100 text-[#4318FF] dark:bg-navy-700 dark:text-brand-300">
                  <FiClock className="h-4 w-4" />
                </div>
                <div className="text-left">
                  <p className="text-[11px] font-bold text-slate-700 dark:text-white">{t('identity.lastUpdate')}</p>
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
                {t('form.staffDetailsTitle')}
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">
                {t('form.adminSubtitle')}
              </p>
            </div>

            <form onSubmit={handleSaveProfile} className="mt-6 flex flex-col gap-5">
              {/* Row 1: Role (Locked) & Email (Locked) */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <div className="mb-1.5 flex items-center justify-between">
                    <label className="text-xs font-bold text-navy-700 dark:text-slate-200">
                      {t('form.userRole')} <span className="text-red-500">*</span>
                    </label>
                    <span className="flex items-center gap-1 text-[10px] font-bold text-slate-400">
                      <FiLock className="h-3 w-3" /> {t('form.locked')}
                    </span>
                  </div>
                  <div className="relative">
                    <input
                      type="text"
                      disabled
                      value={t('form.roleValue', { role: displayRole })}
                      className="h-11 w-full rounded-xl bg-[#f4f7fe] dark:bg-navy-900 px-4 text-xs font-bold text-slate-500 dark:text-slate-400 cursor-not-allowed border border-transparent"
                    />
                    <FiLock className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 h-4 w-4" />
                  </div>
                </div>

                <div>
                  <div className="mb-1.5 flex items-center justify-between">
                    <label className="text-xs font-bold text-navy-700 dark:text-slate-200">
                      {t('form.workEmail')} <span className="text-red-500">*</span>
                    </label>
                    <span className="flex items-center gap-1 text-[10px] font-bold text-emerald-600 dark:text-emerald-400">
                      <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" /> {t('form.permanentGov')}
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
                    {t('form.fullName')} <span className="text-red-500">*</span>
                  </label>
                  <span className="text-[10px] text-slate-400">{t('form.fullNameHint')}</span>
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
                    {t('form.section')} <span className="text-red-500">*</span>
                  </label>
                  <span className="text-[10px] text-[#4318FF] dark:text-brand-300 font-bold">{t('form.sectionHint')}</span>
                </div>
                <select
                  value={sectionId ?? ''}
                  onChange={(e) => setSectionId(e.target.value ? Number(e.target.value) : null)}
                  className="h-11 w-full rounded-xl bg-[#f4f7fe] dark:bg-navy-900 px-4 text-xs font-bold text-navy-700 dark:text-white outline-none focus:ring-2 focus:ring-[#4318FF]/20 border border-transparent focus:border-[#4318FF] transition-all cursor-pointer"
                >
                  <option value="">{t('form.sectionPlaceholder')}</option>
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
                    {t('form.phone')} <span className="text-red-500">*</span>
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
                      placeholder={t('form.phonePlaceholder')}
                      maxLength={11}
                      className="h-11 w-full bg-transparent pl-3 pr-9 text-xs font-bold text-navy-700 dark:text-white outline-none"
                    />
                    <FiPhone className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 h-4 w-4 pointer-events-none" />
                  </div>
                </div>
                <p className="mt-1 text-[10px] text-slate-400">
                  {t('form.phoneHint')}
                </p>
              </div>

              {/* Bottom Actions Row */}
              <div className="mt-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-t border-slate-100 dark:border-navy-600 pt-5">
                <p className="text-[11px] font-medium text-slate-400">
                  {t('form.mandatoryHint', { star: '*' })}
                </p>
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={handleDiscardProfile}
                    disabled={savingProfile}
                    className="rounded-xl bg-[#ff5a60] px-5 py-2.5 text-xs font-bold text-white shadow-sm hover:bg-red-600 transition-colors cursor-pointer"
                  >
                    {t('form.discard')}
                  </button>
                  <button
                    type="submit"
                    disabled={savingProfile}
                    className="flex items-center gap-2 rounded-xl bg-[#4318FF] px-6 py-2.5 text-xs font-bold text-white shadow-md shadow-indigo-500/25 hover:bg-brand-600 transition-colors cursor-pointer"
                  >
                    {savingProfile ? (
                      <>
                        <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/40 border-t-white" />
                        <span>{t('form.saving')}</span>
                      </>
                    ) : (
                      <>
                        <FiCheck className="h-4 w-4" />
                        <span>{t('form.save')}</span>
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
        <div className="flex w-full flex-col gap-5">
          <div className="rounded-[24px] bg-white dark:bg-navy-700 p-6 sm:p-8 shadow-md shadow-shadow-500 dark:shadow-none border border-slate-100 dark:border-navy-600">
            {/* Header */}
            <div className="flex items-start justify-between pb-4 border-b border-gray-100 dark:border-navy-600">
              <div>
                <h2 className="text-lg font-black text-navy-700 dark:text-white tracking-tight">
                  {t('security.title')}
                </h2>
                <p className="text-xs text-slate-400 max-w-xl mt-1 leading-relaxed">
                  {t('security.description')}
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
                    {t('security.currentPassword')} <span className="text-red-500">*</span>
                  </label>
                  <a href="/auth/forgot-password" className="text-[11px] font-bold text-[#4318FF] hover:underline dark:text-brand-300">
                    {t('security.forgot')}
                  </a>
                </div>
                <div className="relative">
                  <FiLock className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 h-4 w-4" />
                  <input
                    type={showCurrentPassword ? 'text' : 'password'}
                    required
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    placeholder={t('security.currentPlaceholder')}
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
                    {t('security.newPassword')} <span className="text-red-500">*</span>
                  </label>
                  <span className="text-[10px] text-slate-400">{t('security.newHint')}</span>
                </div>
                <div className="relative">
                  <FiLock className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 h-4 w-4" />
                  <input
                    type={showNewPassword ? 'text' : 'password'}
                    required
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder={t('security.newPlaceholder')}
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

                {/* Password strength progress bar */}
                {newPassword.length > 0 && (
                  <div className="mt-2.5">
                    <div className="flex items-center justify-between text-[11px] font-bold mb-1">
                      <span className="text-slate-400">{t('security.strength')}</span>
                      <span
                        className={
                          passStrengthScore >= 4
                            ? 'text-emerald-500'
                            : passStrengthScore >= 3
                            ? 'text-amber-500'
                            : 'text-red-500'
                        }
                      >
                        {passStrengthScore >= 4 ? t('security.excellent') : passStrengthScore >= 3 ? t('security.moderateShort') : t('security.weakShort')}
                      </span>
                    </div>
                    <div className="grid grid-cols-4 gap-1.5">
                      {[1, 2, 3, 4].map((step) => (
                        <div
                          key={step}
                          className={`h-1.5 rounded-full transition-colors ${
                            passStrengthScore >= step
                              ? passStrengthScore >= 4
                                ? 'bg-emerald-500'
                                : passStrengthScore >= 3
                                ? 'bg-amber-500'
                                : 'bg-red-500'
                              : 'bg-slate-200 dark:bg-navy-800'
                          }`}
                        />
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Confirm Password */}
              <div>
                <div className="mb-1.5 flex items-center justify-between">
                  <label className="text-xs font-bold text-navy-700 dark:text-slate-200">
                    {t('security.confirmPassword')} <span className="text-red-500">*</span>
                  </label>
                  {confirmPassword.length > 0 && (
                    <span
                      className={`flex items-center gap-1 text-[10px] font-bold ${
                        passwordsMatch ? 'text-emerald-500' : 'text-red-500'
                      }`}
                    >
                      {passwordsMatch ? <FiCheck className="h-3 w-3" /> : <FiX className="h-3 w-3" />}
                      {passwordsMatch ? t('security.match') : t('security.mismatch')}
                    </span>
                  )}
                </div>
                <div className="relative">
                  <FiLock className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 h-4 w-4" />
                  <input
                    type={showConfirmPassword ? 'text' : 'password'}
                    required
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder={t('security.confirmPlaceholder')}
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

              {/* Action Buttons */}
              <div className="mt-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-t border-slate-100 dark:border-navy-600 pt-5">
                <p className="text-[11px] font-medium text-slate-400">
                  {t('security.auditNote')}
                </p>
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => {
                      setCurrentPassword('');
                      setNewPassword('');
                      setConfirmPassword('');
                    }}
                    disabled={savingPassword}
                    className="rounded-xl bg-[#ff5a60] px-5 py-2.5 text-xs font-bold text-white shadow-sm hover:bg-red-600 transition-colors cursor-pointer"
                  >
                    {t('security.clear')}
                  </button>
                  <button
                    type="submit"
                    disabled={savingPassword || passStrengthScore < 3 || !passwordsMatch}
                    className="flex items-center gap-2 rounded-xl bg-[#4318FF] px-6 py-2.5 text-xs font-bold text-white shadow-md shadow-indigo-500/25 hover:bg-brand-600 transition-colors cursor-pointer disabled:opacity-50"
                  >
                    {savingPassword ? (
                      <>
                        <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/40 border-t-white" />
                        <span>{t('security.updating')}</span>
                      </>
                    ) : (
                      <>
                        <FiCheck className="h-4 w-4" />
                        <span>{t('security.submit')}</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Glassmorphism Feedback Alert Modal ── */}
      {feedback && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-fadeIn">
          <div className="relative w-full max-w-md rounded-[28px] bg-white p-6 shadow-2xl dark:bg-navy-800 border border-slate-100 dark:border-navy-700 text-center animate-scaleUp overflow-hidden">
            {/* Ambient background glow */}
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

            {/* Badge Pill */}
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

      {/* ── Confirm Avatar Update Modal ── */}
      {showAvatarConfirmModal && pendingAvatarBase64 && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-fadeIn">
          <div className="relative w-full max-w-md rounded-[28px] bg-white p-6 shadow-2xl dark:bg-navy-800 border border-slate-100 dark:border-navy-700 text-center animate-scaleUp">
            {/* Close button */}
            <button
              onClick={() => {
                setShowAvatarConfirmModal(false);
                setPendingAvatarFile(null);
                setPendingAvatarBase64(null);
                setAvatarPreview(avatarUrl);
              }}
              className="absolute right-5 top-5 rounded-full p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-navy-700 dark:hover:text-white transition-colors cursor-pointer"
            >
              <FiX className="h-5 w-5" />
            </button>

            {/* Circular Preview with Glow */}
            <div className="mx-auto mt-2 flex flex-col items-center">
              <div className="relative">
                <div className="h-32 w-32 rounded-full overflow-hidden border-4 border-[#4318FF] shadow-xl shadow-indigo-500/20 bg-slate-100 dark:bg-navy-900">
                  <img
                    src={pendingAvatarBase64}
                    alt={t('avatar.pendingAlt')}
                    className="h-full w-full object-cover"
                  />
                </div>
                <span className="absolute bottom-1 right-1 flex h-7 w-7 items-center justify-center rounded-full bg-emerald-500 text-white shadow-md ring-2 ring-white dark:ring-navy-800">
                  <FiCheck className="h-4 w-4 stroke-[3]" />
                </span>
              </div>
            </div>

            {/* Title & Description */}
            <h3 className="mt-5 text-xl font-black text-navy-700 dark:text-white">
              {t('modals.confirmAvatarTitle')}
            </h3>
            <p className="mx-auto mt-2 max-w-sm text-xs leading-relaxed text-slate-500 dark:text-slate-400">
              {t('modals.confirmAvatarDesc')}
            </p>

            {/* Action buttons */}
            <div className="mt-6 flex items-center justify-center gap-3">
              <button
                type="button"
                disabled={avatarUploading}
                onClick={() => {
                  setShowAvatarConfirmModal(false);
                  setPendingAvatarFile(null);
                  setPendingAvatarBase64(null);
                  setAvatarPreview(avatarUrl);
                }}
                className="flex-1 rounded-2xl border border-slate-200 dark:border-navy-600 py-3 text-xs font-bold text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-navy-700 transition-colors cursor-pointer"
              >
                {t('form.discard')}
              </button>
              <button
                type="button"
                disabled={avatarUploading}
                onClick={confirmSaveAvatar}
                className="flex-1 flex items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-[#4318FF] to-[#3B82F6] py-3 text-xs font-bold text-white shadow-md shadow-indigo-500/25 hover:opacity-95 active:scale-[0.99] transition-all cursor-pointer disabled:opacity-50"
              >
                {avatarUploading ? (
                  <>
                    <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                    <span>{t('form.saving')}</span>
                  </>
                ) : (
                  <>
                    <FiCheck className="h-4 w-4 stroke-[3]" />
                    <span>{t('modals.confirmSave')}</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Confirm Avatar Remove Modal ── */}
      {showAvatarRemoveModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-fadeIn">
          <div className="relative w-full max-w-sm rounded-[28px] bg-white p-6 shadow-2xl dark:bg-navy-800 border border-slate-100 dark:border-navy-700 text-center animate-scaleUp">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-red-50 text-red-600 dark:bg-red-950/40 dark:text-red-400">
              <FiTrash2 className="h-7 w-7" />
            </div>
            <h3 className="mt-4 text-lg font-black text-navy-700 dark:text-white">
              {t('modals.removeTitle')}
            </h3>
            <p className="mt-1.5 text-xs text-slate-500 dark:text-slate-400">
              {t('modals.removeDesc')}
            </p>
            <div className="mt-6 flex items-center justify-center gap-3">
              <Button
                type="button"
                variant="cancel"
                size="sm"
                onClick={() => setShowAvatarRemoveModal(false)}
                className="flex-1"
              >
                {t('common:buttons.cancel')}
              </Button>
              <Button
                type="button"
                variant="danger"
                size="sm"
                onClick={handleRemoveAvatar}
                className="flex-1"
              >
                {t('modals.removePhoto')}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
