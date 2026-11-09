'use client';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  FiX,
  FiUser,
  FiMail,
  FiLock,
  FiShield,
  FiPhone,
  FiUserPlus,
  FiEye,
  FiEyeOff,
  FiAlertCircle,
  FiCheck,
  FiRefreshCw,
} from 'react-icons/fi';
import { MdAdminPanelSettings, MdOutlineBadge } from 'react-icons/md';
import { useTranslation } from 'react-i18next';
import type { UserRole } from 'types/auth';
import type { SectionRow } from 'models/SectionRepository';
import Button from 'components/ui/Button';
import {
  validateRegisterUserInput,
  type RegisterUserErrors,
} from 'lib/validation/registerUser';
import {
  getPasswordIssues,
} from 'lib/validation/password';
import {
  MOBILE_INPUT_MAX_LENGTH,
  isDepartmentRequiredForRole,
} from 'lib/validation/constants';
import {
  isValidLkMobile,
  sanitizeLkMobileInput,
} from 'lib/validation/lkPhone';
import { getPasswordStrength } from 'validators/authValidators';

type FieldKey = 'fullName' | 'email' | 'password' | 'sectionId' | 'mobilePhone';

const ERROR_KEY: Record<string, string> = {
  required: 'validation.required',
  nameInvalid: 'validation.nameInvalid',
  nameTooLong: 'validation.nameTooLong',
  emailInvalid: 'validation.emailInvalid',
  emailTooLong: 'validation.emailTooLong',
  emailDomain: 'validation.emailDomain',
  roleInvalid: 'validation.roleInvalid',
  departmentRequired: 'validation.departmentRequired',
  departmentInvalid: 'validation.departmentInvalid',
  phoneRequired: 'validation.phoneRequired',
  phoneInvalid: 'validation.phoneInvalid',
  tooShort: 'validation.passwordTooShort',
  tooLong: 'validation.passwordTooLong',
  edgeWhitespace: 'validation.passwordEdgeWhitespace',
  missingUpper: 'validation.passwordMissingUpper',
  missingLower: 'validation.passwordMissingLower',
  missingDigit: 'validation.passwordMissingDigit',
  missingSpecial: 'validation.passwordMissingSpecial',
  common: 'validation.passwordCommon',
  matchesIdentity: 'validation.passwordMatchesIdentity',
};

const PASSWORD_CHECK_KEYS: { issue: string; label: string }[] = [
  { issue: 'tooShort', label: 'validation.pwRuleLength' },
  { issue: 'missingUpper', label: 'validation.pwRuleUpper' },
  { issue: 'missingLower', label: 'validation.pwRuleLower' },
  { issue: 'missingDigit', label: 'validation.pwRuleDigit' },
  { issue: 'missingSpecial', label: 'validation.pwRuleSpecial' },
  { issue: 'common', label: 'validation.pwRuleCommon' },
  { issue: 'matchesIdentity', label: 'validation.pwRuleIdentity' },
];

function generateStrongPassword(): string {
  const upper = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  const lower = 'abcdefghijkmnpqrstuvwxyz';
  const digits = '23456789';
  const special = '!@#$%^&*';
  const all = upper + lower + digits + special;
  const pick = (set: string) => set[Math.floor(Math.random() * set.length)];
  const chars = [
    pick(upper), pick(lower), pick(digits), pick(special),
    ...Array.from({ length: 8 }, () => pick(all)),
  ];
  for (let i = chars.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join('');
}

export default function RegisterUserModal({
  variant,
  sections,
  onClose,
  onSuccess,
}: {
  variant: 'admin' | 'staff';
  sections: SectionRow[];
  onClose: () => void;
  onSuccess: (message: string) => void;
}) {
  const { t } = useTranslation('accounts');
  const role: UserRole = variant === 'admin' ? 'Administrator' : 'Staff';
  const departmentRequired = isDepartmentRequiredForRole(role);

  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [sectionId, setSectionId] = useState<number | ''>('');
  const [mobilePhone, setMobilePhone] = useState('');

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [touched, setTouched] = useState<Partial<Record<FieldKey | 'submit', boolean>>>({});
  const [loading, setLoading] = useState(false);
  const [bannerError, setBannerError] = useState<string | null>(null);
  const [emailChecking, setEmailChecking] = useState(false);

  const fieldRefs = useRef<Partial<Record<FieldKey, HTMLElement | null>>>({});
  const emailTimer = useRef<number | null>(null);
  const dirty =
    fullName !== '' || email !== '' || password !== '' || mobilePhone !== '' || sectionId !== '';

  const passwordIssues = useMemo(
    () => getPasswordIssues(password, { email, fullName }),
    [password, email, fullName]
  );
  const passwordStrength = useMemo(() => getPasswordStrength(password), [password]);

  const validate = useCallback(
    (overrides: Partial<Record<FieldKey, string | number | ''>> = {}) => {
      const result = validateRegisterUserInput(
        {
          fullName: (overrides.fullName as string) ?? fullName,
          email: (overrides.email as string) ?? email,
          password: (overrides.password as string) ?? password,
          role,
          sectionId: (overrides.sectionId as number | '') ?? sectionId,
          mobilePhone: (overrides.mobilePhone as string) ?? mobilePhone,
        },
        { pinnedRole: role }
      );
      // Uniqueness hints are not part of the schema; preserve them.
      setErrors((prev) => ({ ...result.errors, emailTaken: prev.emailTaken, phoneTaken: prev.phoneTaken }));
      return result;
    },
    [fullName, email, password, sectionId, mobilePhone, role]
  );

  const showError = (field: FieldKey, code?: string) => {
    if (!code) return null;
    const key = ERROR_KEY[code] ?? 'validation.invalid';
    return t(key);
  };

  const errText = (field: FieldKey): string | null => {
    const code = errors[field];
    if (!code) return null;
    if (code === 'emailTaken') return t('validation.emailTaken');
    if (code === 'phoneTaken') return t('validation.phoneTaken');
    return showError(field, code);
  };

  const markTouched = (field: FieldKey) => {
    setTouched((prev) => ({ ...prev, [field]: true }));
    // Live re-validation once the field has been touched/submitted.
    if (touched.submit || touched[field]) validate();
  };

  // Debounced server-side uniqueness check on email/phone blur.
  const checkAvailability = useCallback(async (emailVal: string, phoneVal: string) => {
    const params = new URLSearchParams();
    if (emailVal && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailVal)) params.set('email', emailVal);
    if (phoneVal && isValidLkMobile(phoneVal)) params.set('phone', phoneVal);
    if (!params.toString()) return;
    setEmailChecking(true);
    try {
      const res = await fetch(`/api/admin/users/availability?${params.toString()}`, {
        headers: { Accept: 'application/json' },
      });
      const json = await res.json().catch(() => null);
      if (res.ok && json?.ok) {
        setErrors((prev) => ({
          ...prev,
          email: json.data.email?.available === false ? 'emailTaken' : prev.email === 'emailTaken' ? undefined : prev.email,
          mobilePhone: json.data.phone?.available === false ? 'phoneTaken' : prev.mobilePhone === 'phoneTaken' ? undefined : prev.mobilePhone,
        }));
      }
    } catch {
      // Availability check is best-effort; the server re-checks on submit.
    } finally {
      setEmailChecking(false);
    }
  }, []);

  const scheduleAvailability = useCallback(
    (emailVal: string, phoneVal: string) => {
      if (emailTimer.current) window.clearTimeout(emailTimer.current);
      emailTimer.current = window.setTimeout(() => {
        void checkAvailability(emailVal, phoneVal);
      }, 400);
    },
    [checkAvailability]
  );

  useEffect(() => () => {
    if (emailTimer.current) window.clearTimeout(emailTimer.current);
  }, []);

  const requestClose = () => {
    if (loading) return;
    if (dirty && !window.confirm(t('modals.register.discardConfirm'))) return;
    onClose();
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') requestClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return;
    setBannerError(null);

    const result = validate();
    const firstInvalid = (['fullName', 'email', 'password', 'sectionId', 'mobilePhone'] as FieldKey[]).find(
      (f) => result.errors[f]
    );
    if (firstInvalid) {
      setTouched({ submit: true, [firstInvalid]: true } as never);
      fieldRefs.current[firstInvalid]?.focus?.();
      return;
    }

    setLoading(true);
    try {
      const endpoint =
        variant === 'admin' ? '/api/admin/users/create/admin' : '/api/admin/users/create/staff';
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          full_name: result.values.fullName,
          email: result.values.email,
          password,
          role,
          section_id: sectionId === '' ? null : Number(sectionId),
          mobile_phone: result.values.mobilePhone,
        }),
      });
      const json = await res.json().catch(() => null);

      if (res.ok && json?.ok) {
        onSuccess(json?.data?.message || t('modals.register.registered', { name: result.values.fullName }));
        onClose();
        return;
      }

      // Map server field errors onto the form; keep entered values.
      const serverErrors = json?.errors as Record<string, string> | undefined;
      if (serverErrors && typeof serverErrors === 'object') {
        const mapped: Record<string, string> = {};
        for (const [field, code] of Object.entries(serverErrors)) {
          const key = field === 'sectionId' || field === 'section_id' ? 'sectionId'
            : field === 'mobilePhone' || field === 'mobile_phone' ? 'mobilePhone'
            : field === 'fullName' || field === 'full_name' ? 'fullName'
            : field;
          if (key === 'email' && code === 'emailTaken') mapped.email = 'emailTaken';
          else if ((key === 'mobilePhone') && code === 'phoneTaken') mapped.mobilePhone = 'phoneTaken';
          else if (key in ERROR_KEY || ['emailTaken', 'phoneTaken'].includes(code)) {
            (mapped as Record<string, string>)[key] = code;
          }
        }
        if (Object.keys(mapped).length > 0) {
          setErrors(mapped);
          const first = (['fullName', 'email', 'password', 'sectionId', 'mobilePhone'] as FieldKey[]).find(
            (f) => mapped[f]
          );
          if (first) fieldRefs.current[first]?.focus?.();
          return;
        }
      }
      if (json?.code === 'EMAIL_TAKEN') {
        setErrors((p) => ({ ...p, email: 'emailTaken' }));
        fieldRefs.current.email?.focus?.();
        return;
      }
      if (json?.code === 'PHONE_TAKEN') {
        setErrors((p) => ({ ...p, mobilePhone: 'phoneTaken' }));
        fieldRefs.current.mobilePhone?.focus?.();
        return;
      }
      setBannerError(json?.message || t('modals.register.createFailed'));
    } catch {
      setBannerError(t('modals.register.networkError'));
    } finally {
      setLoading(false);
    }
  };

  const inputBase =
    'h-11 w-full rounded-xl border bg-[#f4f7fe] px-3.5 text-xs font-bold text-slate-900 outline-none transition-all focus:bg-white focus:ring-2 dark:bg-navy-800 dark:text-white';
  const inputNormal = `${inputBase} border-slate-200 focus:border-[#4318FF] focus:ring-[#4318FF]/20 dark:border-navy-600 dark:focus:border-brand-400`;
  const inputError = `${inputBase} border-red-400 focus:border-red-500 focus:ring-red-500/20 dark:border-red-500`;

  const fieldWrap = (field: FieldKey) =>
    touched.submit || touched[field] ? errText(field) : null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-md animate-fadeIn"
      onClick={requestClose}
    >
      <div
        className="relative w-full max-w-lg overflow-hidden rounded-[28px] bg-white p-6 sm:p-7 shadow-2xl dark:bg-navy-700 border border-slate-100 dark:border-navy-600 max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        {/* Header */}
        <div className="flex items-start justify-between border-b border-gray-100 pb-4 dark:border-navy-600">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-b from-[#4318FF] to-brand-500 text-white shadow-md shadow-brand-500/25">
              <FiUserPlus className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-base font-extrabold text-slate-950 dark:text-white">
                {t(variant === 'admin' ? 'page.admin.registerLabel' : 'page.staff.registerLabel')}
              </h3>
              <p className="text-[11px] font-semibold text-slate-500 dark:text-gray-400">
                {t(variant === 'admin' ? 'modals.register.subtitleAdmin' : 'modals.register.subtitleStaff')}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={requestClose}
            disabled={loading}
            className="flex h-8 w-8 items-center justify-center rounded-full text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-navy-600 cursor-pointer disabled:opacity-50"
            aria-label={t('common:buttons.close')}
          >
            <FiX className="h-4 w-4" />
          </button>
        </div>

        {bannerError && (
          <div className="mt-4 flex items-start gap-2.5 rounded-xl border border-red-200 bg-red-50 p-3 text-red-700 dark:border-red-800 dark:bg-red-900/30 dark:text-red-300">
            <FiAlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
            <p className="text-xs font-semibold leading-relaxed">{bannerError}</p>
          </div>
        )}

        <form onSubmit={handleSubmit} aria-label={t('modals.register.formAria')} data-testid="add-admin-form" className="mt-4 space-y-4">
          {/* Full Name */}
          <div>
            <label htmlFor="reg-fullname" className="mb-1.5 flex items-center gap-1.5 text-xs font-extrabold text-slate-800 dark:text-gray-200">
              <FiUser className="h-3.5 w-3.5 text-[#4318FF]" /> {t('modals.register.fullName')}
            </label>
            <input
              id="reg-fullname"
              ref={(el) => { fieldRefs.current.fullName = el; }}
              type="text"
              required
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              onBlur={() => { markTouched('fullName'); scheduleAvailability(email, mobilePhone); }}
              className={fieldWrap('fullName') ? inputError : inputNormal}
              placeholder={t('modals.register.fullNamePlaceholder')}
              disabled={loading}
              aria-invalid={!!fieldWrap('fullName')}
              aria-describedby={fieldWrap('fullName') ? 'reg-fullname-error' : undefined}
            />
            {fieldWrap('fullName') && (
              <p id="reg-fullname-error" className="mt-1 text-[11px] font-semibold text-red-500">{fieldWrap('fullName')}</p>
            )}
          </div>

          {/* Email */}
          <div>
            <label htmlFor="reg-email" className="mb-1.5 flex items-center gap-1.5 text-xs font-extrabold text-slate-800 dark:text-gray-200">
              <FiMail className="h-3.5 w-3.5 text-[#4318FF]" /> {t('modals.register.email')}
              {emailChecking && <span className="h-3 w-3 animate-spin rounded-full border border-slate-300 border-t-[#4318FF]" />}
            </label>
            <input
              id="reg-email"
              ref={(el) => { fieldRefs.current.email = el; }}
              type="email"
              required
              maxLength={254}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onBlur={(e) => { markTouched('email'); scheduleAvailability(e.target.value.trim().toLowerCase(), mobilePhone); }}
              className={fieldWrap('email') ? inputError : inputNormal}
              placeholder={t('modals.register.emailPlaceholder')}
              disabled={loading}
              aria-invalid={!!fieldWrap('email')}
              aria-describedby={fieldWrap('email') ? 'reg-email-error' : undefined}
            />
            {fieldWrap('email') && (
              <p id="reg-email-error" className="mt-1 text-[11px] font-semibold text-red-500">{fieldWrap('email')}</p>
            )}
          </div>

          {/* Password */}
          <div>
            <label htmlFor="reg-password" className="mb-1.5 flex items-center gap-1.5 text-xs font-extrabold text-slate-800 dark:text-gray-200">
              <FiLock className="h-3.5 w-3.5 text-[#4318FF]" /> {t('modals.register.password', { count: 8 })}
            </label>
            <div className="relative">
              <input
                id="reg-password"
                ref={(el) => { fieldRefs.current.password = el; }}
                type={showPassword ? 'text' : 'password'}
                required
                minLength={8}
                maxLength={128}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onBlur={() => markTouched('password')}
                className={`${fieldWrap('password') ? inputError : inputNormal} pr-20`}
                placeholder={t('modals.register.passwordPlaceholder')}
                disabled={loading}
                aria-invalid={!!fieldWrap('password')}
                aria-describedby="reg-password-rules"
              />
              <div className="absolute right-2 top-1/2 flex -translate-y-1/2 items-center gap-1">
                <button
                  type="button"
                  onClick={() => setPassword(generateStrongPassword())}
                  title={t('modals.register.generatePassword')}
                  className="rounded-md p-1 text-gray-400 hover:text-[#4318FF] dark:hover:text-brand-300"
                  tabIndex={-1}
                >
                  <FiRefreshCw className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  aria-label={showPassword ? t('modals.register.hidePassword') : t('modals.register.showPassword')}
                  className="rounded-md p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                  tabIndex={-1}
                >
                  {showPassword ? <FiEyeOff className="h-4 w-4" /> : <FiEye className="h-4 w-4" />}
                </button>
              </div>
            </div>
            {password && (
              <div className="mt-2 space-y-1" id="reg-password-rules">
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-navy-900">
                  <div className={`h-full transition-all duration-300 ${passwordStrength.color}`} style={{ width: passwordStrength.width }} />
                </div>
                <p className={`text-[10px] font-semibold ${passwordStrength.text}`}>
                  {t(`passwordStrength.${['notEntered', 'weak', 'fair', 'good', 'strong'][passwordStrength.score]}`)}
                </p>
              </div>
            )}
            {password && (
              <ul className="mt-1.5 grid grid-cols-1 gap-0.5 text-[10px] font-semibold" id="reg-password-checklist">
                {PASSWORD_CHECK_KEYS.map(({ issue, label }) => {
                  const failed = passwordIssues.includes(issue as never);
                  const relevant =
                    issue === 'tooShort' ? password.length < 8 :
                    issue === 'missingUpper' ? !/[A-ZÀ-Þ]/.test(password) :
                    issue === 'missingLower' ? !/[a-zà-ÿ]/.test(password) :
                    issue === 'missingDigit' ? !/\d/.test(password) :
                    issue === 'missingSpecial' ? !/[!@#$%^&*(),.?":{}|<>\-_=+[\]\\|;'/`~]/.test(password) :
                    issue === 'common' ? ['password', 'password1', 'password123', '12345678'].includes(password.toLowerCase()) :
                    issue === 'matchesIdentity' ? false :
                    failed;
                  const ok = !relevant;
                  return (
                    <li key={issue} className={`flex items-center gap-1 ${ok ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-400'}`}>
                      {ok ? <FiCheck className="h-3 w-3" /> : <span className="h-3 w-3 text-center">·</span>}
                      {t(label)}
                    </li>
                  );
                })}
              </ul>
            )}
            {fieldWrap('password') && (
              <p className="mt-1 text-[11px] font-semibold text-red-500">{fieldWrap('password')}</p>
            )}
          </div>

          {/* Role (read-only) + Department */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1.5 flex items-center gap-1.5 text-xs font-extrabold text-slate-800 dark:text-gray-200">
                {variant === 'admin' ? <MdAdminPanelSettings className="h-3.5 w-3.5 text-[#4318FF]" /> : <MdOutlineBadge className="h-3.5 w-3.5 text-[#4318FF]" />}
                {t('modals.register.role')}
              </label>
              {variant === 'staff' ? (
                <div className="flex h-11 w-full items-center rounded-xl border border-slate-200 bg-slate-50 px-3.5 text-xs font-bold text-slate-900 dark:border-navy-600 dark:bg-navy-800 dark:text-white select-none">
                  <span className="flex items-center gap-1.5 text-[#4318FF] dark:text-brand-300">
                    <MdOutlineBadge className="h-4 w-4" />
                    {t('modals.register.roleStaffChip')}
                  </span>
                </div>
              ) : (
                <div className="flex h-11 w-full items-center rounded-xl border border-slate-200 bg-slate-50 px-3.5 text-xs font-bold text-slate-900 dark:border-navy-600 dark:bg-navy-800 dark:text-white select-none">
                  <span className="flex items-center gap-1.5 text-[#4318FF] dark:text-brand-300">
                    <MdAdminPanelSettings className="h-4 w-4" />
                    {t('modals.edit.optionAdmin')}
                  </span>
                </div>
              )}
            </div>

            <div>
              <label htmlFor="reg-section" className="mb-1.5 flex items-center gap-1.5 text-xs font-extrabold text-slate-800 dark:text-gray-200">
                <FiShield className="h-3.5 w-3.5 text-[#4318FF]" />
                {departmentRequired ? t('modals.register.sectionRequired') : t('modals.register.section')}
                {departmentRequired && <span className="text-red-500">*</span>}
              </label>
              <select
                id="reg-section"
                ref={(el) => { fieldRefs.current.sectionId = el; }}
                value={sectionId}
                onChange={(e) => { setSectionId(e.target.value === '' ? '' : Number(e.target.value)); markTouched('sectionId'); }}
                onBlur={() => markTouched('sectionId')}
                className={`${fieldWrap('sectionId') ? inputError : inputNormal} cursor-pointer`}
                disabled={loading || sections.length === 0}
                aria-invalid={!!fieldWrap('sectionId')}
                aria-describedby={fieldWrap('sectionId') ? 'reg-section-error' : undefined}
              >
                <option value="" disabled>
                  {sections.length === 0 ? t('modals.register.sectionsUnavailable') : t('modals.register.selectDepartment')}
                </option>
                {sections.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
              {sections.length === 0 && (
                <p className="mt-1 text-[11px] font-semibold text-amber-600 dark:text-amber-400">
                  {t('modals.register.sectionsLoadFailed')}
                </p>
              )}
              {fieldWrap('sectionId') && (
                <p id="reg-section-error" className="mt-1 text-[11px] font-semibold text-red-500">{fieldWrap('sectionId')}</p>
              )}
            </div>
          </div>

          {/* Mobile (required) */}
          <div>
            <label htmlFor="reg-phone" className="mb-1.5 flex items-center gap-1.5 text-xs font-extrabold text-slate-800 dark:text-gray-200">
              <FiPhone className="h-3.5 w-3.5 text-[#4318FF]" /> {t('modals.register.mobile')}
            </label>
            <input
              id="reg-phone"
              ref={(el) => { fieldRefs.current.mobilePhone = el; }}
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              required
              maxLength={MOBILE_INPUT_MAX_LENGTH}
              value={mobilePhone}
              onChange={(e) => {
                setMobilePhone(sanitizeLkMobileInput(e.target.value, MOBILE_INPUT_MAX_LENGTH));
                if (errors.mobilePhone === 'phoneTaken' || errors.mobilePhone === 'phoneInvalid' || errors.mobilePhone === 'phoneRequired') {
                  setErrors((p) => ({ ...p, mobilePhone: undefined }));
                }
              }}
              onPaste={(e) => {
                e.preventDefault();
                const pasted = sanitizeLkMobileInput(e.clipboardData.getData('text'), MOBILE_INPUT_MAX_LENGTH);
                setMobilePhone(pasted);
              }}
              onBlur={() => { markTouched('mobilePhone'); scheduleAvailability(email, mobilePhone); }}
              className={fieldWrap('mobilePhone') ? inputError : inputNormal}
              placeholder={t('modals.register.mobilePlaceholder')}
              disabled={loading}
              aria-invalid={!!fieldWrap('mobilePhone')}
              aria-describedby={fieldWrap('mobilePhone') ? 'reg-phone-error' : 'reg-phone-hint'}
            />
            {fieldWrap('mobilePhone') ? (
              <p id="reg-phone-error" className="mt-1 text-[11px] font-semibold text-red-500">{fieldWrap('mobilePhone')}</p>
            ) : (
              <p id="reg-phone-hint" className="mt-1 text-[10px] font-medium text-slate-400">
                {t('modals.register.mobileHint')}
              </p>
            )}
          </div>

          {/* Actions */}
          <div className="mt-6 flex items-center justify-end gap-3 pt-3 border-t border-gray-100 dark:border-navy-600">
            <Button type="button" variant="cancel" size="sm" onClick={requestClose} disabled={loading}>
              {t('common:buttons.cancel')}
            </Button>
            <button
              type="submit"
              disabled={loading || (departmentRequired && sections.length === 0)}
              className="flex items-center gap-2 rounded-xl bg-[#4318FF] px-5 py-2.5 text-xs font-bold text-white shadow-md shadow-[#4318FF]/25 transition-all hover:bg-brand-600 active:scale-95 disabled:opacity-60 cursor-pointer"
            >
              {loading ? (
                <>
                  <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white border-t-transparent" />
                  {t('modals.register.creating')}
                </>
              ) : (
                <>
                  <FiUserPlus className="h-4 w-4" />
                  {t(variant === 'admin' ? 'modals.register.submitAdmin' : 'modals.register.submitStaff')}
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
