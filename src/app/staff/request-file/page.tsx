'use client';

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Trans, useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import {
  FiAlertCircle,
  FiCalendar,
  FiCheckCircle,
  FiChevronDown,
  FiClock,
  FiFileText,
  FiFlag,
  FiFolder,
  FiMapPin,
  FiRefreshCw,
  FiSearch,
  FiShield,
  FiUser,
} from 'react-icons/fi';
import { useToast } from 'components/toast/ToastContext';
import { useProfile } from 'contexts/ProfileContext';
import CompetingBadge from 'components/requests/CompetingBadge';
import type { CompetingInfo } from 'lib/competing-requests';
import type { ProfileDTO } from 'types/auth';
import { formatSriLankaDate, formatSriLankaDateTime } from 'lib/datetime';
import {
  classifyPendingPriority,
  type OwnPendingRequest,
  type RequestConflictPayload,
} from 'lib/staffRequestPriority';
import RequestPriorityDialog, {
  type RequestPriorityDialogState,
} from 'components/staff/requests/RequestPriorityDialog';
import AttributedUser from 'components/ui/AttributedUser';
import { attributedNameText } from 'utils/userDisplay';

type ArchiveFile = {
  id: number;
  file_no: string;
  file_name: string;
  section_name: string;
  locker_no?: string | null;
  shelf_name?: string | null;
  shelf_position?: string | null;
  archive_repository?: string | null;
  status?: string;
};

type ApiResult<T> = {
  ok: boolean;
  data?: T;
  message?: string;
  code?: string;
  conflict?: RequestConflictPayload | null;
};
type DurationUnit = 'days' | 'weeks' | 'months';
type RequestPriority = 'HIGH' | 'NORMAL' | 'LOW';

const requestPriorities: {
  value: RequestPriority;
  /** i18n key, resolved with `t()` at render time. */
  label: string;
  description: string;
  iconClass: string;
  selectedClass: string;
}[] = [
  {
    value: 'HIGH',
    label: 'common:priority.HIGH',
    description: 'page.priorityHighHint',
    iconClass: 'text-rose-600 dark:text-rose-400',
    selectedClass:
      'border-rose-300 bg-rose-50 dark:border-rose-800 dark:bg-rose-950/30',
  },
  {
    value: 'NORMAL',
    label: 'common:priority.NORMAL',
    description: 'page.priorityNormalHint',
    iconClass: 'text-amber-500 dark:text-amber-400',
    selectedClass:
      'border-amber-300 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/30',
  },
  {
    value: 'LOW',
    label: 'common:priority.LOW',
    description: 'page.priorityLowHint',
    iconClass: 'text-blue-600 dark:text-blue-400',
    selectedClass:
      'border-blue-300 bg-blue-50 dark:border-blue-800 dark:bg-blue-950/30',
  },
];

const today = () => {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(
    2,
    '0',
  )}-${String(date.getDate()).padStart(2, '0')}`;
};

const inputClass =
  'h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700 outline-none transition placeholder:text-slate-400 focus:border-[#4318FF] focus:ring-4 focus:ring-[#4318FF]/10 dark:border-navy-600 dark:bg-navy-900 dark:text-white';
const labelClass =
  'mb-2 block text-[10px] font-extrabold uppercase tracking-[0.08em] text-slate-500 dark:text-slate-300';
const cardClass =
  'rounded-2xl border border-slate-100 bg-white p-5 shadow-[0_4px_18px_rgba(28,45,90,0.045)] dark:border-navy-700 dark:bg-navy-800 sm:p-6';

function getLocation(file: ArchiveFile, t: TFunction) {
  return [
    file.archive_repository || t('page.locationFallback'),
    file.locker_no ? t('page.locationLocker', { no: file.locker_no }) : null,
    file.shelf_name ? t('page.locationShelf', { name: file.shelf_name }) : null,
    file.shelf_position
      ? t('page.locationPosition', { position: file.shelf_position })
      : null,
  ]
    .filter(Boolean)
    .join(' — ');
}

function HighlightMatch({ text, term }: { text: string; term: string }) {
  const needle = term.trim();
  if (!needle) return <>{text}</>;
  const index = text.toLowerCase().indexOf(needle.toLowerCase());
  if (index === -1) return <>{text}</>;
  return (
    <>
      {text.slice(0, index)}
      <mark className="rounded bg-blue-100 px-0.5 text-[#4318FF] dark:bg-brand-900/60 dark:text-brand-200">
        {text.slice(index, index + needle.length)}
      </mark>
      {text.slice(index + needle.length)}
    </>
  );
}

export default function StaffRequestFilePage() {
  const { t } = useTranslation('requests');
  const { showToast } = useToast();
  const { profile: contextProfile } = useProfile();
  const [profile, setProfile] = useState<ProfileDTO | null>(contextProfile);
  const [profileError, setProfileError] = useState('');
  const [search, setSearch] = useState('');
  const [selectedFile, setSelectedFile] = useState<ArchiveFile | null>(null);
  const [results, setResults] = useState<ArchiveFile[]>([]);
  const [searching, setSearching] = useState(false);
  const [prefillLoading, setPrefillLoading] = useState(false);
  const [showResults, setShowResults] = useState(false);
  const [requestDate, setRequestDate] = useState(today);
  const [priority, setPriority] = useState<RequestPriority>('NORMAL');
  const [duration, setDuration] = useState('3');
  const [durationUnit, setDurationUnit] = useState<DurationUnit>('days');
  const [submitting, setSubmitting] = useState(false);
  const [competingData, setCompetingData] = useState<{
    has_competing: boolean;
    count: number;
    requests: {
      id: number;
      file_id: number;
      file_no: string;
      requester_name: string;
      /** Soft-delete marker from migration 0027; undefined on older deployments. */
      requester_is_deleted?: boolean;
      requester_section: string | null;
      request_date: string;
      duration_days: number;
      priority: RequestPriority;
      created_at: string;
      /** Rank the API assigns inside the pending group for this file. */
      competing?: CompetingInfo | null;
    }[];
    own_pending?: OwnPendingRequest | null;
    /**
     * The live issuance for this file, read from the approved request row that
     * has not been returned. Null when the folder is physically available.
     */
    issuance?: {
      request_id: number;
      file_no: string;
      file_name: string;
      holder_id?: string | null;
      holder_name: string;
      /** Soft-delete marker for the current holder; undefined on older deployments. */
      holder_is_deleted?: boolean;
      issued_at: string | null;
      expected_return_date: string | null;
    } | null;
  } | null>(null);
  const [checkingCompeting, setCheckingCompeting] = useState(false);
  const [ownPending, setOwnPending] = useState<OwnPendingRequest | null>(null);
  const [priorityDialog, setPriorityDialog] =
    useState<RequestPriorityDialogState | null>(null);
  const [fileName, setFileName] = useState('');
  const [nameResults, setNameResults] = useState<ArchiveFile[]>([]);
  const [nameSearching, setNameSearching] = useState(false);
  const [showNameResults, setShowNameResults] = useState(false);
  const [activeNoIndex, setActiveNoIndex] = useState(-1);
  const [activeNameIndex, setActiveNameIndex] = useState(-1);
  const fileNoBoxRef = useRef<HTMLDivElement>(null);
  const fileNameBoxRef = useRef<HTMLDivElement>(null);
  /** Synchronous guard so a double-click cannot start two submissions. */
  const submittingRef = useRef(false);

  useEffect(() => {
    if (contextProfile) {
      setProfile(contextProfile);
    }
  }, [contextProfile]);

  useEffect(() => {
    if (selectedFile) return;
    const term = search.trim();
    if (term.length < 1) {
      setResults([]);
      return;
    }
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setSearching(true);
      try {
        const params = new URLSearchParams({ search: term });
        const res = await fetch(`/api/staff/requestable-files?${params}`, {
          signal: controller.signal,
        });
        const json = (await res.json()) as ApiResult<{ files: ArchiveFile[] }>;
        if (!res.ok || !json.ok)
          throw new Error(json.message || t('feedback.indexSearchFailed'));

        setResults(json.data?.files ?? []);
        setShowResults(true);
      } catch (error) {
        if (error instanceof Error && error.name !== 'AbortError') {
          showToast({
            type: 'error',
            title: t('feedback.fileSearchFailedTitle'),
            message: error.message,
          });
        }
      } finally {
        if (!controller.signal.aborted) setSearching(false);
      }
    }, 250);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [search, selectedFile, showToast]);

  useEffect(() => {
    const term = fileName.trim();
    if (!term || (selectedFile && selectedFile.file_name === fileName)) {
      setNameResults([]);
      setShowNameResults(false);
      return;
    }
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setNameSearching(true);
      try {
        const params = new URLSearchParams({ search: term });
        const res = await fetch(`/api/staff/requestable-files?${params}`, {
          signal: controller.signal,
        });
        const json = (await res.json()) as ApiResult<{ files: ArchiveFile[] }>;
        if (!res.ok || !json.ok)
          throw new Error(json.message || t('feedback.indexSearchFailed'));

        setNameResults(json.data?.files ?? []);
        setShowNameResults(true);
      } catch (error) {
        if (error instanceof Error && error.name !== 'AbortError') {
          showToast({
            type: 'error',
            title: t('feedback.fileNameSearchFailedTitle'),
            message: error.message,
          });
        }
      } finally {
        if (!controller.signal.aborted) setNameSearching(false);
      }
    }, 250);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [fileName, selectedFile, showToast]);

  useEffect(() => {
    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (fileNoBoxRef.current && !fileNoBoxRef.current.contains(target)) {
        setShowResults(false);
      }
      if (fileNameBoxRef.current && !fileNameBoxRef.current.contains(target)) {
        setShowNameResults(false);
      }
    };
    document.addEventListener('mousedown', handlePointerDown);
    return () => document.removeEventListener('mousedown', handlePointerDown);
  }, []);

  const durationValue = Number(duration);
  const durationDays =
    durationUnit === 'weeks'
      ? durationValue * 7
      : durationUnit === 'months'
      ? durationValue * 30
      : durationValue;

  const expectedReturnDate = useMemo(() => {
    if (!requestDate) return '';
    const date = new Date(`${requestDate}T00:00:00`);
    date.setDate(date.getDate() + durationDays);
    if (Number.isNaN(date.getTime())) return t('page.calendarRange');
    return date.toLocaleDateString('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  }, [requestDate, durationDays, t]);

  const selectFile = useCallback((file: ArchiveFile) => {
    setSelectedFile(file);
    setFileName(file.file_name);
    setSearch(file.file_no);
    setShowResults(false);
    setResults([]);
    setShowNameResults(false);
    setNameResults([]);
    setActiveNoIndex(-1);
    setActiveNameIndex(-1);
    setCheckingCompeting(true);
    fetch(`/api/staff/file-requests?file_id=${file.id}`)
      .then((res) => res.json())
      .then((json) => {
        if (json.ok && json.data) {
          setCompetingData(json.data);
          setOwnPending(json.data.own_pending ?? null);
        } else {
          setCompetingData(null);
          setOwnPending(null);
        }
      })
      .catch(() => {
        setCompetingData(null);
        setOwnPending(null);
      })
      .finally(() => setCheckingCompeting(false));
  }, []);

  useEffect(() => {
    const fileNo = new URLSearchParams(window.location.search).get('file_no')?.trim();
    if (!fileNo) return;

    let cancelled = false;
    const loadRequestedFile = async () => {
      setPrefillLoading(true);
      try {
        const params = new URLSearchParams({ search: fileNo });
        const res = await fetch(`/api/staff/requestable-files?${params}`);
        const json = (await res.json()) as ApiResult<{ files: ArchiveFile[] }>;
        if (!res.ok || !json.ok) {
          throw new Error(json.message || t('feedback.loadSelectedFileFailed'));
        }
        const file = json.data?.files.find(
          (candidate) => candidate.file_no.toLowerCase() === fileNo.toLowerCase(),
        );
        if (!file) {
          throw new Error(t('feedback.fileNoLongerAvailable'));
        }
        if (!cancelled) selectFile(file);
      } catch (error) {
        if (!cancelled) {
          showToast({
            type: 'error',
            title: t('feedback.selectFileFailedTitle'),
            message:
              error instanceof Error
                ? error.message
                : t('feedback.searchFileAgain'),
          });
        }
      } finally {
        if (!cancelled) setPrefillLoading(false);
      }
    };

    loadRequestedFile();
    return () => {
      cancelled = true;
    };
  }, [selectFile, showToast]);

  // Shared keyboard behaviour for the two comboboxes: ↑/↓ move the highlight,
  // Enter picks the highlighted file, Escape closes the list.
  const handleComboKeyDown = (
    event: React.KeyboardEvent<HTMLInputElement>,
    items: ArchiveFile[],
    activeIndex: number,
    setActiveIndex: (index: number) => void,
    isOpen: boolean,
    setIsOpen: (open: boolean) => void,
  ) => {
    if (event.key === 'Escape') {
      if (isOpen) {
        event.preventDefault();
        setIsOpen(false);
        setActiveIndex(-1);
      }
      return;
    }
    if (items.length === 0) return;
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      if (!isOpen) {
        setIsOpen(true);
        setActiveIndex(0);
        return;
      }
      setActiveIndex(activeIndex >= items.length - 1 ? 0 : activeIndex + 1);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      if (!isOpen) {
        setIsOpen(true);
        setActiveIndex(items.length - 1);
        return;
      }
      setActiveIndex(activeIndex <= 0 ? items.length - 1 : activeIndex - 1);
    } else if (event.key === 'Enter' && isOpen && activeIndex >= 0) {
      const file = items[activeIndex];
      if (file) {
        event.preventDefault();
        selectFile(file);
      }
    }
  };

  const resetForm = () => {
    setSelectedFile(null);
    setSearch('');
    setRequestDate(today());
    setPriority('NORMAL');
    setDuration('3');
    setDurationUnit('days');
    setShowResults(false);
    setFileName('');
    setResults([]);
    setNameResults([]);
    setShowNameResults(false);
    setActiveNoIndex(-1);
    setActiveNameIndex(-1);
    setCompetingData(null);
    setOwnPending(null);
  };

  /**
   * Turns a server-side conflict into the matching dialog. Returns true when a
   * dialog was opened, i.e. the message is already being explained in detail.
   */
  const openConflictDialog = (
    conflict: RequestConflictPayload | null | undefined,
    file: ArchiveFile,
    requestedPriority: RequestPriority,
  ): boolean => {
    const existing = conflict?.request ?? null;
    if (!existing) return false;
    if (conflict?.kind === 'duplicate') {
      setPriorityDialog({ kind: 'duplicate', existing });
      return true;
    }
    if (conflict?.kind === 'lower_priority') {
      setPriorityDialog({ kind: 'blocked', existing });
      return true;
    }
    if (conflict?.kind === 'upgrade_required') {
      setPriorityDialog({
        kind: 'upgrade',
        existing,
        file: { id: file.id, file_no: file.file_no, file_name: file.file_name },
        requestedPriority,
      });
      return true;
    }
    return false;
  };

  const sendRequest = async (replaceRequestId?: number) => {
    if (submittingRef.current) return;
    const file = selectedFile;
    if (!file) return;

    submittingRef.current = true;
    setSubmitting(true);
    try {
      const res = await fetch('/api/staff/file-requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          file_id: file.id,
          request_date: requestDate,
          file_name: fileName,
          duration_days: durationDays,
          priority,
          replace_request_id: replaceRequestId ?? null,
        }),
      });
      const json = (await res.json()) as ApiResult<{
        message: string;
        upgraded?: boolean;
        request?: { file_no: string };
      }>;
      if (!res.ok || !json.ok) {
        if (openConflictDialog(json.conflict, file, priority)) return;
        throw new Error(json.message || t('feedback.submitFailed'));
      }

      if (json.data?.upgraded) {
        setPriorityDialog({
          kind: 'success',
          fileNo: json.data.request?.file_no ?? file.file_no,
        });
      } else {
        showToast({
          type: 'success',
          title: t('feedback.requestSentTitle'),
          message: json.data?.message || t('feedback.requestSentBody'),
        });
      }
      resetForm();
    } catch (error) {
      showToast({
        type: 'error',
        title: t('feedback.requestNotSubmittedTitle'),
        message: error instanceof Error ? error.message : t('feedback.tryAgain'),
      });
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  };

  const submitRequest = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (submittingRef.current) return;

    if (!selectedFile) {
      showToast({
        type: 'warning',
        title: t('feedback.selectFileTitle'),
        message: t('feedback.selectFileBody'),
      });
      return;
    }
    if (!Number.isSafeInteger(durationDays) || durationDays < 1) {
      showToast({
        type: 'warning',
        title: t('feedback.checkDurationTitle'),
        message: t('feedback.checkDurationBody'),
      });
      return;
    }

    // The database re-checks all of this; the dialog is here so the staff
    // member learns the outcome before anything is cancelled.
    if (ownPending) {
      const verdict = classifyPendingPriority(ownPending.priority, priority);
      if (verdict === 'duplicate') {
        setPriorityDialog({ kind: 'duplicate', existing: ownPending });
        return;
      }
      if (verdict === 'blocked') {
        setPriorityDialog({ kind: 'blocked', existing: ownPending });
        return;
      }
      setPriorityDialog({
        kind: 'upgrade',
        existing: ownPending,
        file: {
          id: selectedFile.id,
          file_no: selectedFile.file_no,
          file_name: selectedFile.file_name,
        },
        requestedPriority: priority,
      });
      return;
    }

    await sendRequest();
  };

  return (
    <div className="mx-auto max-w-[1080px] pb-8 pt-2 text-slate-800 dark:text-white">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="mb-2 text-[11px] font-medium text-slate-400">
            {t('page.pages')} <span className="mx-1.5">/</span> {t('page.recordRoom')}{' '}
            <span className="mx-1.5">/</span>{' '}
            <span className="text-slate-600 dark:text-slate-300">
              {t('page.requestFileBreadcrumb')}
            </span>
          </p>
          <div className="flex items-center gap-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#F0EEFF] text-[#4318FF] dark:bg-brand-900/40 dark:text-brand-300">
              <FiFileText />
            </span>
            <div>
              <h1 className="text-xl font-extrabold tracking-tight sm:text-2xl">
                {t('page.requestFileTitle')}
              </h1>
              <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                {t('page.requestFileSubtitle')}
              </p>
            </div>
          </div>
        </div>
        <div className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-2 text-[10px] font-bold text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />{' '}
          {t('page.approvalNotice')}
        </div>
      </div>

      {prefillLoading && (
        <div
          role="status"
          className="mb-4 flex items-center gap-2 rounded-xl border border-indigo-100 bg-indigo-50 px-4 py-3 text-xs font-semibold text-indigo-700 dark:border-navy-600 dark:bg-navy-800 dark:text-brand-300"
        >
          <FiRefreshCw className="h-4 w-4 animate-spin" />
          {t('page.loadingSelectedFile')}
        </div>
      )}

      <form onSubmit={submitRequest}>
        <section className={`${cardClass} mb-4`}>
          <div className="mb-5 flex items-center justify-between border-b border-slate-100 pb-4 dark:border-navy-700">
            <h2 className="flex items-center gap-2 text-sm font-extrabold">
              <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-indigo-50 text-[#4318FF] dark:bg-navy-700 dark:text-brand-300">
                <FiShield />
              </span>
              {t('page.staffIdentificationTitle')}
            </h2>
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-[10px] font-bold text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-300">
              <FiCheckCircle /> {t('page.autoVerified')}
            </span>
          </div>
          {profileError ? (
            <div
              role="alert"
              className="flex items-center gap-2 rounded-xl bg-rose-50 p-3 text-xs font-medium text-rose-700 dark:bg-rose-950/30 dark:text-rose-300"
            >
              <FiAlertCircle /> {profileError}
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className={labelClass}>{t('page.staffNameLabel')}</label>
                <div className="relative">
                  <input
                    className={`${inputClass} pr-10`}
                    readOnly
                    value={
                      profile
                        ? `${profile.full_name} (${profile.email})`
                        : t('page.loadingProfile')
                    }
                  />
                  <FiUser className="absolute right-3 top-3.5 text-slate-400" />
                </div>
              </div>
              <div>
                <label className={labelClass}>{t('page.staffRoleLabel')}</label>
                <div className="relative">
                  <input
                    className={`${inputClass} pr-10`}
                    readOnly
                    value={
                      profile
                        ? `${profile.role}${
                            profile.section_name
                              ? ` / ${profile.section_name}`
                              : ''
                          }`
                        : t('page.loadingProfile')
                    }
                  />
                  <FiFolder className="absolute right-3 top-3.5 text-slate-400" />
                </div>
              </div>
            </div>
          )}
        </section>

        <section className={`${cardClass} mb-4`}>
          <div className="mb-5 flex items-center justify-between border-b border-slate-100 pb-4 dark:border-navy-700">
            <h2 className="flex items-center gap-2 text-sm font-extrabold">
              <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-blue-50 text-blue-600 dark:bg-navy-700 dark:text-blue-300">
                <FiFolder />
              </span>
              {t('page.fileInfoTitle')}
            </h2>
            <span className="text-[10px] font-medium text-slate-400">
              {t('page.physicalArchiveIndex')}
            </span>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-[1fr_1.1fr_1fr]">
            <div className="relative" ref={fileNoBoxRef}>
              <label className={labelClass}>
                {t('page.fileNoOrNameLabel')}{' '}
                <span className="text-rose-500">*</span>
              </label>
              <div className="relative">
                <input
                  className={`${inputClass} pr-10 ${
                    selectedFile
                      ? 'border-emerald-300 dark:border-emerald-800'
                      : ''
                  }`}
                  value={search}
                  onChange={(event) => {
                    setSearch(event.target.value);
                    setSelectedFile(null);
                    setCompetingData(null);
                    setOwnPending(null);
                    setShowResults(true);
                    setActiveNoIndex(-1);
                  }}
                  onFocus={() => results.length > 0 && setShowResults(true)}
                  onKeyDown={(event) =>
                    handleComboKeyDown(
                      event,
                      results,
                      activeNoIndex,
                      setActiveNoIndex,
                      showResults,
                      setShowResults,
                    )
                  }
                  placeholder={t('page.fileNoOrNamePlaceholder')}
                  autoComplete="off"
                  role="combobox"
                  aria-autocomplete="list"
                  aria-expanded={showResults && results.length > 0}
                  aria-controls="file-search-results"
                  aria-activedescendant={
                    showResults && activeNoIndex >= 0 && results[activeNoIndex]
                      ? `file-no-option-${results[activeNoIndex].id}`
                      : undefined
                  }
                  required
                />
                {selectedFile ? (
                  <FiCheckCircle className="absolute right-3 top-3.5 text-emerald-500" />
                ) : searching ? (
                  <FiRefreshCw className="absolute right-3 top-3.5 animate-spin text-slate-400" />
                ) : (
                  <FiSearch className="absolute right-3 top-3.5 text-slate-400" />
                )}
              </div>
              <p
                className={`mt-1.5 text-[10px] ${
                  selectedFile ? 'text-emerald-600' : 'text-slate-400'
                }`}
              >
                {selectedFile
                  ? t('page.fileVerifiedHint')
                  : search.trim().length > 0 && search.trim().length < 2
                  ? t('page.fileSearchShortHint')
                  : t('page.fileSearchHint')}
              </p>
              {showResults && results.length > 0 && (
                <div
                  id="file-search-results"
                  role="listbox"
                  className="absolute z-20 mt-1 max-h-64 w-full overflow-auto rounded-xl border border-slate-200 bg-white p-1 shadow-xl dark:border-navy-600 dark:bg-navy-800"
                >
                  {results.map((file, index) => (
                    <button
                      type="button"
                      id={`file-no-option-${file.id}`}
                      role="option"
                      aria-selected={activeNoIndex === index}
                      key={file.id}
                      onClick={() => selectFile(file)}
                      onMouseEnter={() => setActiveNoIndex(index)}
                      className={`w-full rounded-lg px-3 py-2.5 text-left transition-colors ${
                        activeNoIndex === index
                          ? 'bg-indigo-50 dark:bg-navy-700'
                          : 'hover:bg-slate-50 dark:hover:bg-navy-700'
                      }`}
                    >
                      <span
                        className="block break-words text-xs font-bold text-[#4318FF] dark:text-brand-300 [overflow-wrap:anywhere]"
                        title={file.file_no}
                      >
                        <HighlightMatch text={file.file_no} term={search} />
                      </span>
                      <span className="mt-0.5 block truncate text-[10px] text-slate-500">
                        {file.file_name}
                      </span>
                    </button>
                  ))}
                </div>
              )}
              {showResults &&
                !searching &&
                search.trim().length >= 1 &&
                results.length === 0 &&
                !selectedFile && (
                  <p className="mt-1.5 text-[10px] text-slate-400">
                    {t('page.noMatchingFiles')}
                  </p>
                )}
            </div>
            <div className="relative" ref={fileNameBoxRef}>
              <label className={labelClass}>
                {t('page.fileNameLabel')}{' '}
                <span className="text-rose-500">*</span>
              </label>
              <div className="relative">
                <input
                  className={`${inputClass} pr-10 ${
                    selectedFile
                      ? 'border-emerald-300 dark:border-emerald-800'
                      : ''
                  }`}
                  value={fileName}
                  onChange={(e) => {
                    setFileName(e.target.value);
                    setShowNameResults(true);
                    setActiveNameIndex(-1);
                  }}
                  onFocus={() => nameResults.length > 0 && setShowNameResults(true)}
                  onKeyDown={(event) =>
                    handleComboKeyDown(
                      event,
                      nameResults,
                      activeNameIndex,
                      setActiveNameIndex,
                      showNameResults,
                      setShowNameResults,
                    )
                  }
                  placeholder={t('page.fileNamePlaceholder')}
                  autoComplete="off"
                  role="combobox"
                  aria-autocomplete="list"
                  aria-expanded={showNameResults && nameResults.length > 0}
                  aria-controls="file-name-results"
                  aria-activedescendant={
                    showNameResults &&
                    activeNameIndex >= 0 &&
                    nameResults[activeNameIndex]
                      ? `file-name-option-${nameResults[activeNameIndex].id}`
                      : undefined
                  }
                />
                {nameSearching ? (
                  <FiRefreshCw className="absolute right-3 top-3.5 animate-spin text-slate-400" />
                ) : (
                  <FiFileText className="absolute right-3 top-3.5 text-slate-400" />
                )}
              </div>
              <p className="mt-1.5 text-[10px] text-slate-400">
                {t('page.fileNameHint')}
              </p>
              {showNameResults && nameResults.length > 0 && (
                <div
                  id="file-name-results"
                  role="listbox"
                  className="absolute z-20 mt-1 max-h-64 w-full overflow-auto rounded-xl border border-slate-200 bg-white p-1 shadow-xl dark:border-navy-600 dark:bg-navy-800"
                >
                  {nameResults.map((file, index) => (
                    <button
                      type="button"
                      id={`file-name-option-${file.id}`}
                      role="option"
                      aria-selected={activeNameIndex === index}
                      key={file.id}
                      onClick={() => selectFile(file)}
                      onMouseEnter={() => setActiveNameIndex(index)}
                      className={`w-full rounded-lg px-3 py-2.5 text-left transition-colors ${
                        activeNameIndex === index
                          ? 'bg-indigo-50 dark:bg-navy-700'
                          : 'hover:bg-slate-50 dark:hover:bg-navy-700'
                      }`}
                    >
                      <span className="block truncate text-xs font-bold text-[#4318FF] dark:text-brand-300">
                        <HighlightMatch text={file.file_name} term={fileName} />
                      </span>
                      <span className="mt-0.5 block truncate text-[10px] text-slate-500">
                        {file.file_no}
                        {file.section_name ? ` · ${file.section_name}` : ''}
                      </span>
                    </button>
                  ))}
                </div>
              )}
              {showNameResults &&
                !nameSearching &&
                fileName.trim().length >= 1 &&
                nameResults.length === 0 &&
                !(selectedFile && selectedFile.file_name === fileName) && (
                  <p className="mt-1.5 text-[10px] text-slate-400">
                    {t('page.noMatchingFiles')}
                  </p>
                )}
            </div>
            <div>
              <label className={labelClass}>
                {t('page.sectionLabel')}{' '}
                <span className="text-rose-500">*</span>
              </label>
              <div className="relative">
                <input
                  className={`${inputClass} pr-10`}
                  readOnly
                  value={selectedFile?.section_name ?? ''}
                  placeholder={t('page.sectionPlaceholder')}
                />
                <FiFolder className="absolute right-3 top-3.5 text-slate-400" />
              </div>
              <p className="mt-1.5 text-[10px] text-slate-400">
                {t('page.sectionHint')}
              </p>
            </div>
          </div>
          <div className="mt-4">
            <label className={labelClass}>
              {t('page.storageLabel')} <span className="text-rose-500">*</span>
            </label>
            <div className="relative">
              <input
                className={`${inputClass} pr-10`}
                readOnly
                value={selectedFile ? getLocation(selectedFile, t) : ''}
                placeholder={t('page.storagePlaceholder')}
              />
              <FiChevronDown className="absolute right-3 top-3.5 text-slate-400" />
            </div>
            {selectedFile && (
              <p className="mt-1.5 flex items-center gap-1.5 text-[10px] text-slate-400">
                <FiMapPin />{' '}
                {t('page.storageCoordinates', {
                  location: getLocation(selectedFile, t),
                })}
              </p>
            )}
          </div>
        </section>

        <section className={cardClass}>
          <div className="mb-5 flex items-center justify-between border-b border-slate-100 pb-4 dark:border-navy-700">
            <h2 className="flex items-center gap-2 text-sm font-extrabold">
              <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-purple-50 text-purple-600 dark:bg-navy-700 dark:text-purple-300">
                <FiCalendar />
              </span>
              {t('page.scheduleTitle')}
            </h2>
            <span className="text-[10px] font-medium text-slate-400">
              {t('page.protocol')}
            </span>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="request-date" className={labelClass}>
                {t('page.accessDateLabel')}{' '}
                <span className="text-rose-500">*</span>
              </label>
              <input
                id="request-date"
                className={inputClass}
                type="date"
                min={today()}
                value={requestDate}
                onChange={(event) => setRequestDate(event.target.value)}
                required
              />
              <p className="mt-1.5 text-[10px] text-slate-400">
                {t('page.accessDateHint')}
              </p>
            </div>
            <div>
              <label htmlFor="duration" className={labelClass}>
                {t('page.durationLabel')}{' '}
                <span className="text-rose-500">*</span>
              </label>
              <div className="flex gap-2">
                <input
                  id="duration"
                  className={`${inputClass} max-w-[110px] text-center`}
                  type="number"
                  min={1}
                  step={1}
                  value={duration}
                  onChange={(event) => setDuration(event.target.value)}
                  required
                />
                <select
                  className={inputClass}
                  aria-label={t('page.durationUnitAria')}
                  value={durationUnit}
                  onChange={(event) =>
                    setDurationUnit(event.target.value as DurationUnit)
                  }
                >
                  <option value="days">{t('page.unitDays')}</option>
                  <option value="weeks">{t('page.unitWeeks')}</option>
                  <option value="months">{t('page.unitMonths')}</option>
                </select>
              </div>
              <div className="mt-1.5 flex justify-between gap-2 text-[10px] text-slate-400">
                <span>
                  {t('page.expectedReturnLabel')}{' '}
                  <strong className="text-slate-600 dark:text-slate-300">
                    {expectedReturnDate}
                  </strong>
                </span>
                <span>
                  {durationUnit === 'weeks'
                    ? t('page.daysPerWeek')
                    : durationUnit === 'months'
                    ? t('page.daysPerMonth')
                    : t('page.standardCheckout')}
                </span>
              </div>
            </div>
          </div>
          {ownPending && selectedFile && (
            <div className="mt-5 rounded-2xl border border-indigo-200 bg-indigo-50/70 p-4 dark:border-brand-800 dark:bg-brand-950/30">
              <div className="flex items-start gap-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-indigo-500/10 text-[#4318FF] dark:text-brand-300">
                  <FiFileText className="h-5 w-5" />
                </span>
                <div className="flex-1 text-xs">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h4 className="text-sm font-extrabold text-slate-800 dark:text-white">
                      {t('page.pendingTitle')}
                    </h4>
                    <span
                      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[10px] font-black ${
                        ownPending.priority === 'HIGH'
                          ? 'bg-rose-100 text-rose-700 dark:bg-rose-900/50 dark:text-rose-300'
                          : ownPending.priority === 'NORMAL'
                          ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-300'
                          : 'bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300'
                      }`}
                    >
                      <FiFlag className="h-3 w-3" />
                      {t('page.priorityChip', {
                        priority: t(`common:priority.${ownPending.priority}`),
                      })}
                    </span>
                  </div>
                  <p className="mt-1 text-slate-600 dark:text-slate-300">
                    {t('page.pendingBody')}
                  </p>
                  <a
                    href="/staff/your-requests?tab=pending"
                    className="mt-2 inline-flex items-center gap-1 text-[11px] font-bold text-[#4318FF] underline-offset-2 hover:underline dark:text-brand-300"
                  >
                    {t('page.reviewPendingLink')}
                  </a>
                </div>
              </div>
            </div>
          )}
          {competingData?.issuance && (
            <div
              role="alert"
              className="mt-5 rounded-2xl border border-rose-300 bg-rose-50/85 p-4 shadow-sm dark:border-rose-800/70 dark:bg-rose-950/40"
            >
              <div className="flex items-start gap-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-rose-500/15 text-rose-600 dark:text-rose-400">
                  <FiAlertCircle className="h-5 w-5" />
                </span>
                <div className="flex-1 text-xs">
                  <h4 className="text-sm font-extrabold text-rose-800 dark:text-rose-200">
                    {t('page.unavailableTitle')}
                  </h4>
                  <p className="mt-1 font-semibold text-rose-900 dark:text-rose-100">
                    {t('page.unavailableBody', {
                      name: attributedNameText(
                        competingData.issuance.holder_name,
                        {
                          deleted: competingData.issuance.holder_is_deleted,
                          label: t('common:deletedUser'),
                        },
                      ),
                    })}
                    {competingData.issuance.expected_return_date ? (
                      <span className="block mt-0.5 text-rose-800 dark:text-rose-200 font-medium">
                        <Trans
                          ns="requests"
                          i18nKey="page.availableFrom"
                          values={{
                            date: formatSriLankaDate(
                              `${String(
                                competingData.issuance.expected_return_date,
                              ).slice(0, 10)}T00:00:00Z`,
                            ),
                          }}
                          components={{ b: <strong /> }}
                        />
                      </span>
                    ) : null}
                  </p>

                  <div className="mt-3 grid gap-2.5 rounded-xl border border-rose-200/70 bg-white/85 p-3 sm:grid-cols-2 dark:border-rose-900/50 dark:bg-navy-900/70">
                    <div>
                      <p className="text-[10px] font-black uppercase tracking-wider text-rose-400">
                        {t('page.fileNumber')}
                      </p>
                      <p className="mt-0.5 font-bold text-slate-800 dark:text-white">
                        {competingData.issuance.file_no}
                      </p>
                    </div>
                    <div>
                      <p className="text-[10px] font-black uppercase tracking-wider text-rose-400">
                        {t('page.currentHolder')}
                      </p>
                      <p className="mt-0.5 font-bold text-slate-800 dark:text-white">
                        <AttributedUser
                          name={competingData.issuance.holder_name}
                          deleted={competingData.issuance.holder_is_deleted}
                        />
                      </p>
                    </div>
                    <div>
                      <p className="text-[10px] font-black uppercase tracking-wider text-rose-400">
                        {t('page.issuedDate')}
                      </p>
                      <p className="mt-0.5 font-bold text-slate-800 dark:text-white">
                        {competingData.issuance.issued_at
                          ? formatSriLankaDateTime(
                              competingData.issuance.issued_at,
                            )
                          : t('page.issuedDateMissing')}
                      </p>
                    </div>
                    <div>
                      <p className="text-[10px] font-black uppercase tracking-wider text-rose-400">
                        {t('page.expectedAvailableDate')}
                      </p>
                      <p className="mt-0.5 flex items-center gap-1.5 font-bold text-slate-800 dark:text-white">
                        <FiClock className="h-3.5 w-3.5 shrink-0 text-rose-500" aria-hidden="true" />
                        {competingData.issuance.expected_return_date
                          ? formatSriLankaDate(
                              `${String(
                                competingData.issuance.expected_return_date,
                              ).slice(0, 10)}T00:00:00Z`,
                            )
                          : t('page.expectedReturnMissing')}
                      </p>
                    </div>
                  </div>

                  <p className="mt-2.5 text-[11px] font-semibold text-rose-800 dark:text-rose-200">
                    {t('page.unavailableNote')}
                  </p>
                </div>
              </div>
            </div>
          )}
          {competingData?.has_competing && (
            <div className="mt-5 rounded-2xl border border-amber-300 bg-amber-50/80 p-4 shadow-sm dark:border-amber-700/60 dark:bg-amber-950/40">
              <div className="flex items-start gap-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-amber-500/15 text-amber-600 dark:text-amber-400">
                  <FiAlertCircle className="h-5 w-5" />
                </span>
                <div className="flex-1 text-xs">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h4 className="text-sm font-extrabold text-amber-950 dark:text-amber-200">
                      {t('page.competingTitle')}
                    </h4>
                    <span className="rounded-full bg-amber-200/80 px-2.5 py-0.5 text-[10px] font-extrabold text-amber-900 dark:bg-amber-900/60 dark:text-amber-200">
                      {t('page.competingCount', { count: competingData.count })}
                    </span>
                  </div>
                  <p className="mt-1 text-slate-700 dark:text-slate-300">
                    {t('page.competingBody')}
                  </p>
                  <div className="mt-2.5 space-y-2 rounded-xl bg-white/80 p-3 dark:bg-navy-900/80 border border-amber-200/60 dark:border-navy-700">
                    {competingData.requests.map((cr, idx) => (
                      <div
                        key={cr.id || idx}
                        className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-2 text-[11px] last:border-0 last:pb-0 dark:border-navy-700"
                      >
                        <div>
                          <span className="font-bold text-slate-800 dark:text-white">
                            <AttributedUser
                              name={cr.requester_name}
                              deleted={cr.requester_is_deleted}
                            />
                          </span>{' '}
                          <span className="text-slate-500 dark:text-slate-400">
                            ({cr.requester_section || t('page.staffFallback')})
                          </span>
                          <span className="mx-1.5 text-slate-300 dark:text-slate-600">•</span>
                          <span className="text-slate-500 dark:text-slate-400">
                            {t('page.neededOn', {
                              date: formatSriLankaDate(cr.request_date),
                              duration: t('common:datetime.days', {
                                count: cr.duration_days,
                              }),
                            })}
                          </span>
                        </div>
                        <div className="flex flex-col items-end gap-1">
                          <span
                            className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[10px] font-black ${
                              cr.priority === 'HIGH'
                                ? 'bg-rose-100 text-rose-700 dark:bg-rose-900/50 dark:text-rose-300 border border-rose-200 dark:border-rose-800'
                                : cr.priority === 'NORMAL'
                                ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-300 border border-amber-200 dark:border-amber-800'
                                : 'bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300 border border-blue-200 dark:border-blue-800'
                            }`}
                          >
                            <FiFlag className="h-3 w-3" />
                            {t('page.priorityChip', {
                              priority: t(`common:priority.${cr.priority}`),
                            })}
                          </span>
                          {/* Rank wording comes from the shared helper, so this
                              notice and the admin queue never disagree. */}
                          <CompetingBadge info={cr.competing} />
                        </div>
                      </div>
                    ))}
                  </div>
                  <p className="mt-2.5 text-[11px] font-semibold text-amber-800 dark:text-amber-300">
                    {t('page.competingNote')}
                  </p>
                </div>
              </div>
            </div>
          )}

          <fieldset className="mt-5 border-t border-slate-100 pt-4 dark:border-navy-700">
            <legend className={labelClass}>{t('page.priorityLegend')}</legend>
            <div className="grid gap-3 sm:grid-cols-3">
              {requestPriorities.map((item) => (
                <label
                  key={item.value}
                  className={`flex cursor-pointer items-center gap-3 rounded-xl border p-3 transition ${
                    priority === item.value
                      ? item.selectedClass
                      : 'border-slate-200 hover:bg-slate-50 dark:border-navy-600 dark:hover:bg-navy-700'
                  }`}
                >
                  <input
                    type="radio"
                    name="request-priority"
                    value={item.value}
                    checked={priority === item.value}
                    onChange={() => setPriority(item.value)}
                    className="sr-only"
                  />
                  <FiFlag
                    aria-hidden="true"
                    className={`h-5 w-5 shrink-0 ${item.iconClass}`}
                  />
                  <span>
                    <span className="block text-xs font-bold text-slate-700 dark:text-slate-200">
                      {t(item.label)}
                    </span>
                    <span className="mt-0.5 block text-[10px] text-slate-500 dark:text-slate-400">
                      {t(item.description)}
                    </span>
                  </span>
                </label>
              ))}
            </div>
            <p className="mt-2 text-[10px] text-slate-400">
              {t('page.priorityHint')}
            </p>
          </fieldset>
        </section>

        <div className="mt-5 flex flex-wrap items-center justify-end gap-2">
          <button
            type="button"
            onClick={resetForm}
            disabled={submitting}
            className="inline-flex h-10 items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-xs font-bold text-slate-600 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-navy-600 dark:bg-navy-800 dark:text-slate-300"
          >
            <FiRefreshCw /> {t('page.resetForm')}
          </button>
          <button
            type="submit"
            disabled={submitting || !profile || Boolean(profileError)}
            aria-busy={submitting}
            className="inline-flex h-10 items-center gap-2 rounded-xl bg-emerald-600 px-5 text-xs font-bold text-white shadow-md shadow-emerald-600/20 transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {submitting ? (
              <FiRefreshCw className="animate-spin" />
            ) : (
              <FiCheckCircle />
            )}{' '}
            {submitting ? t('page.submitting') : t('page.submitRequest')}
          </button>
        </div>
      </form>

      <RequestPriorityDialog
        state={priorityDialog}
        processing={submitting}
        onClose={() => setPriorityDialog(null)}
        onConfirmUpgrade={() => {
          if (priorityDialog?.kind !== 'upgrade') return;
          void sendRequest(priorityDialog.existing.id);
        }}
      />
    </div>
  );
}
