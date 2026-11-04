'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import ReactDOM from 'react-dom';
import {
  FiAlertCircle,
  FiAlertTriangle,
  FiCalendar,
  FiCheckCircle,
  FiFileText,
  FiMapPin,
  FiRefreshCw,
  FiX,
  FiXCircle,
} from 'react-icons/fi';
import { formatSriLankaDate, formatSriLankaDateTime } from 'lib/datetime';
import { clearQueryParam, parseRecordId, readQueryParam } from 'lib/deep-link';
import { getReturnStatus, isReturnDateExtended } from 'lib/returnStatus';
import {
  buildStaffRequestsQuery,
  getStaffRequestTabMeta,
  isStaffRequestTab,
  requestTabOf,
  sanitizeRequestSearch,
  validateRequestDateRange,
  type StaffRequestPriority,
  type StaffRequestPriorityFilter,
  type StaffRequestTab,
} from 'lib/staffRequests';
import type {
  StaffRequestRow,
  StaffRequestTabCountMap,
} from 'types/staffRequests';
import { useToast } from 'components/toast/ToastContext';
import RequestTabs from 'components/staff/requests/RequestTabs';
import RequestsToolbar from 'components/staff/requests/RequestsToolbar';
import RequestsTable from 'components/staff/requests/RequestsTable';

const PAGE_LIMIT = 10;

interface RequestsPayload {
  requests: StaffRequestRow[];
  counts: StaffRequestTabCountMap;
  total: number;
  totalPages: number;
}

const EMPTY_COUNTS: StaffRequestTabCountMap = {
  ongoing: 0,
  pending: 0,
  closed: 0,
  cancelled: 0,
};

const EMPTY_PAYLOAD: RequestsPayload = {
  requests: [],
  counts: EMPTY_COUNTS,
  total: 0,
  totalPages: 1,
};

const priorityLabel: Record<StaffRequestPriority, string> = {
  HIGH: 'High',
  NORMAL: 'Normal',
  LOW: 'Low',
};

const statusStyle: Record<string, { label: string; className: string }> = {
  PENDING: {
    label: 'Pending',
    className: 'bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300',
  },
  APPROVED: {
    label: 'Approved',
    className:
      'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300',
  },
  REJECTED: {
    label: 'Rejected',
    className: 'bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300',
  },
  CANCELLED: {
    label: 'Cancelled',
    className: 'bg-slate-100 text-slate-600 dark:bg-navy-700 dark:text-slate-300',
  },
};

export default function StaffYourRequestsPage() {
  const { showToast } = useToast();

  const [activeTab, setActiveTab] = useState<StaffRequestTab>('ongoing');
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [priority, setPriority] = useState<StaffRequestPriorityFilter>('ALL');
  const [page, setPage] = useState(1);

  const [view, setView] = useState<RequestsPayload>(EMPTY_PAYLOAD);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  const [cancellingId, setCancellingId] = useState<number | null>(null);
  const [cancelTarget, setCancelTarget] = useState<StaffRequestRow | null>(null);
  const [cancelError, setCancelError] = useState('');
  const [actionError, setActionError] = useState('');
  const [selectedDetailRequest, setSelectedDetailRequest] = useState<StaffRequestRow | null>(null);
  const [mounted, setMounted] = useState(false);
  const [highlightId, setHighlightId] = useState<number | null>(null);
  const [deepLinkNotice, setDeepLinkNotice] = useState('');

  const controllerRef = useRef<AbortController | null>(null);
  const cacheRef = useRef(new Map<string, RequestsPayload>());
  const deepLinkHandled = useRef(false);
  /** Query string currently rendered, so a refresh keeps rows instead of flashing a skeleton. */
  const dataKeyRef = useRef<string | null>(null);
  const countsRef = useRef<StaffRequestTabCountMap>(EMPTY_COUNTS);
  const [reloadToken, setReloadToken] = useState(0);

  const dateError = validateRequestDateRange(dateFrom, dateTo);
  const isFiltered = Boolean(search || dateFrom || dateTo || priority !== 'ALL');
  const tabMeta = getStaffRequestTabMeta(activeTab);

  const queryKey = useMemo(
    () =>
      buildStaffRequestsQuery({
        tab: activeTab,
        search,
        dateFrom,
        dateTo,
        priority,
        page,
        limit: PAGE_LIMIT,
      }),
    [activeTab, search, dateFrom, dateTo, priority, page],
  );

  useEffect(() => {
    setMounted(true);
    return () => setMounted(false);
  }, []);

  // `?tab=pending` seeds the active tab — used by the request form after a
  // submission or priority upgrade. Later tab clicks stay client-side.
  useEffect(() => {
    const requestedTab = readQueryParam('tab');
    if (isStaffRequestTab(requestedTab)) {
      setActiveTab(requestedTab);
      setPage(1);
    }
  }, []);

  // Debounce typing so every keystroke does not become an API call.
  useEffect(() => {
    const normalized = sanitizeRequestSearch(searchInput);
    if (normalized === search) return;
    const timer = setTimeout(() => {
      setSearch(normalized);
      setPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchInput, search]);

  const applyPayload = useCallback((payload: RequestsPayload) => {
    const counts = { ...EMPTY_COUNTS, ...(payload.counts ?? {}) };
    countsRef.current = counts;
    setView({
      requests: payload.requests ?? [],
      counts,
      total: payload.total ?? 0,
      totalPages: payload.totalPages ?? 1,
    });
  }, []);

  useEffect(() => {
    if (dateError) return;
    const key = queryKey;
    const cached = cacheRef.current.get(key);
    if (cached) {
      applyPayload(cached);
      dataKeyRef.current = key;
      setLoading(false);
      setRefreshing(false);
      setError('');
      return;
    }

    // Same tab + filters as what is on screen (refresh): keep the rows visible
    // and only show the thin progress bar. New tab/filters: swap to skeleton.
    const keepExistingRows = dataKeyRef.current === key;
    if (!keepExistingRows) {
      setView({ ...EMPTY_PAYLOAD, counts: countsRef.current });
    }
    setLoading(!keepExistingRows);
    setRefreshing(true);
    setError('');

    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;

    (async () => {
      try {
        const response = await fetch(`/api/staff/file-requests?${key}`, {
          signal: controller.signal,
          cache: 'no-store',
        });
        const json = await response.json().catch(() => null);
        if (controller.signal.aborted) return;
        if (!response.ok || !json?.ok) {
          throw new Error(json?.message || 'Unable to load your requests.');
        }
        const payload: RequestsPayload = {
          requests: json.data?.requests ?? [],
          counts: json.data?.counts ?? EMPTY_COUNTS,
          total: json.data?.total ?? 0,
          totalPages: json.data?.totalPages ?? 1,
        };
        cacheRef.current.set(key, payload);
        dataKeyRef.current = key;
        applyPayload(payload);
      } catch (err) {
        if (controller.signal.aborted) return;
        setError(err instanceof Error ? err.message : 'Unable to load your requests.');
        setView({ ...EMPTY_PAYLOAD, counts: countsRef.current });
        dataKeyRef.current = key;
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
          setRefreshing(false);
        }
        if (controllerRef.current === controller) controllerRef.current = null;
      }
    })();

    return () => controller.abort();
  }, [queryKey, dateError, reloadToken, applyPayload]);

  useEffect(
    () => () => {
      controllerRef.current?.abort();
      controllerRef.current = null;
    },
    [],
  );

  const refreshAll = useCallback(() => {
    cacheRef.current.clear();
    setReloadToken((value) => value + 1);
  }, []);

  // Notification deep link (?request=12): the endpoint returns that single
  // owner-scoped record regardless of the tab or page that is open first.
  useEffect(() => {
    if (deepLinkHandled.current) return;
    const id = parseRecordId(readQueryParam('request'));
    if (id === null) return;
    deepLinkHandled.current = true;
    clearQueryParam('request');
    setHighlightId(id);

    (async () => {
      try {
        const response = await fetch(`/api/staff/file-requests?request=${id}`, {
          cache: 'no-store',
        });
        const json = await response.json().catch(() => null);
        if (!response.ok || !json?.ok) throw new Error('lookup failed');
        const match: StaffRequestRow | undefined = json.data?.requests?.[0];
        if (match) {
          setSelectedDetailRequest(match);
        } else {
          setDeepLinkNotice(
            'That notification points at a request that is no longer in your list — it may have been cancelled or removed. Your current requests are shown below.',
          );
        }
      } catch {
        setDeepLinkNotice(
          'That notification points at a request we could not load right now. Your current requests are shown below.',
        );
      }
    })();
  }, []);

  const handleTabChange = useCallback((tab: StaffRequestTab) => {
    setActiveTab(tab);
    setPage(1);
  }, []);

  const handleClearFilters = useCallback(() => {
    setSearchInput('');
    setSearch('');
    setDateFrom('');
    setDateTo('');
    setPriority('ALL');
    setPage(1);
  }, []);

  const cancelRequest = async (request: StaffRequestRow) => {
    setCancellingId(request.id);
    setCancelError('');
    setActionError('');
    try {
      const response = await fetch(`/api/staff/file-requests/${request.id}`, {
        method: 'DELETE',
      });
      const json = await response.json().catch(() => null);
      if (!response.ok || !json?.ok) {
        throw new Error(json?.message || 'Unable to cancel this request.');
      }
      cacheRef.current.clear();
      refreshAll();
      setCancelTarget(null);
      showToast({
        type: 'success',
        title: 'Request cancelled',
        message: json.data?.message ?? 'Your request was cancelled.',
      });
    } catch (err) {
      setCancelError(
        err instanceof Error ? err.message : 'Unable to cancel this request.',
      );
    } finally {
      setCancellingId(null);
    }
  };

  useEffect(() => {
    if (!cancelTarget) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && cancellingId === null) setCancelTarget(null);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [cancelTarget, cancellingId]);

  const [extensionTarget, setExtensionTarget] = useState<StaffRequestRow | null>(null);
  const [extensionDate, setExtensionDate] = useState('');
  const [extensionReason, setExtensionReason] = useState('');
  const [extensionError, setExtensionError] = useState('');
  const [submittingExtension, setSubmittingExtension] = useState(false);

  const submitExtensionRequest = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!extensionTarget) return;
    const reason = extensionReason.trim();
    const current = String(extensionTarget.expected_return_date || '').slice(0, 10);
    if (!extensionDate) {
      setExtensionError('Choose the new return date you are requesting.');
      return;
    }
    if (current && extensionDate <= current) {
      setExtensionError('The requested date must be later than your current return date.');
      return;
    }
    if (!reason) {
      setExtensionError('Enter a reason for keeping the file longer.');
      return;
    }

    setSubmittingExtension(true);
    setExtensionError('');
    try {
      const response = await fetch('/api/staff/file-request-extensions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          request_id: extensionTarget.id,
          new_return_date: extensionDate,
          reason,
        }),
      });
      const json = await response.json().catch(() => null);
      if (!response.ok || !json?.ok) {
        throw new Error(json?.message || 'Unable to send your extension request.');
      }

      setView((currentView) => ({
        ...currentView,
        requests: currentView.requests.map((item) =>
          item.id === extensionTarget.id
            ? {
                ...item,
                pending_extension: {
                  id: json.data?.extension?.id ?? 0,
                  previous_return_date: current,
                  new_return_date: extensionDate,
                  reason,
                  status: 'PENDING' as const,
                  created_at: new Date().toISOString(),
                },
              }
            : item,
        ),
      }));
      cacheRef.current.clear();
      setExtensionTarget(null);
      setExtensionDate('');
      setExtensionReason('');
      showToast({
        type: 'success',
        title: 'Extension requested',
        message: json.data?.message ?? 'An administrator will review your request.',
      });
    } catch (err) {
      // Keep the typed reason so the staff member does not re-enter it.
      setExtensionError(
        err instanceof Error ? err.message : 'Unable to send your extension request.',
      );
    } finally {
      setSubmittingExtension(false);
    }
  };

  const selectedTabForRow = selectedDetailRequest
    ? requestTabOf(selectedDetailRequest.status, selectedDetailRequest.returned_at)
    : null;

  return (
    <div className="w-full pb-8 pt-2">
      <div className="mb-4 flex items-end justify-between gap-3">
        <div>
          <p className="mb-2 text-[11px] text-slate-400">
            Pages <span className="mx-1.5">/</span> Record Room{' '}
            <span className="mx-1.5">/</span> Your Requests
          </p>
          <h1 className="text-2xl font-extrabold text-slate-800 dark:text-white">
            Your Requests
          </h1>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            Track your file requests, monitor approval decisions, and manage your
            request history.
          </p>
        </div>
        <button
          type="button"
          onClick={refreshAll}
          disabled={loading || refreshing}
          className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-600 hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#4318FF]/60 disabled:cursor-not-allowed disabled:opacity-50 dark:border-navy-600 dark:bg-navy-800 dark:text-slate-300"
        >
          <FiRefreshCw className={loading || refreshing ? 'animate-spin' : ''} /> Refresh
        </button>
      </div>

      {deepLinkNotice && (
        <div
          role="status"
          className="mb-4 flex items-start gap-2 rounded-2xl border border-[#4318FF]/20 bg-[#4318FF]/[0.05] p-4 text-xs text-slate-700 dark:border-brand-700 dark:bg-brand-900/25 dark:text-slate-200"
        >
          <FiAlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-[#4318FF] dark:text-brand-300" />
          <p className="break-words font-semibold">{deepLinkNotice}</p>
        </div>
      )}

      <RequestTabs activeTab={activeTab} counts={view.counts} onChange={handleTabChange} />

      <RequestsToolbar
        search={searchInput}
        onSearchChange={setSearchInput}
        dateFrom={dateFrom}
        dateTo={dateTo}
        onDateFromChange={(value) => {
          setDateFrom(value);
          setPage(1);
        }}
        onDateToChange={(value) => {
          setDateTo(value);
          setPage(1);
        }}
        priority={priority}
        onPriorityChange={(value) => {
          setPriority(value);
          setPage(1);
        }}
        dateError={dateError}
        isFiltered={isFiltered}
        onClearFilters={handleClearFilters}
      />

      <p className="sr-only" role="status" aria-live="polite">
        {loading
          ? 'Loading requests'
          : `${view.total} request${view.total === 1 ? '' : 's'} in ${tabMeta.label}`}
      </p>

      {dateError ? (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-xs font-semibold text-amber-800 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
          Fix the date range above to load this tab.
        </div>
      ) : (
        <RequestsTable
          requests={view.requests}
          tab={activeTab}
          loading={loading}
          refreshing={refreshing}
          error={error}
          onRetry={refreshAll}
          cancellingId={cancellingId}
          onCancel={(request) => {
            setCancelError('');
            setCancelTarget(request);
          }}
          onDetails={setSelectedDetailRequest}
          onExtend={(request) => {
            setExtensionTarget(request);
            setExtensionDate('');
            setExtensionReason('');
            setExtensionError('');
          }}
          highlightId={highlightId}
          isFiltered={isFiltered}
          onClearFilters={handleClearFilters}
          page={page}
          limit={PAGE_LIMIT}
          total={view.total}
          totalPages={view.totalPages}
          onPageChange={setPage}
        />
      )}

      {actionError && (
        <p
          role="alert"
          className="mt-3 rounded-xl bg-rose-50 p-3 text-xs text-rose-700 dark:bg-rose-950/30 dark:text-rose-300"
        >
          {actionError}
        </p>
      )}

      {/* ── Cancel confirmation modal ── */}
      {cancelTarget &&
        mounted &&
        ReactDOM.createPortal(
          <div
            className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-[6px] animate-fadeIn"
            onClick={(event) => {
              if (event.target === event.currentTarget && cancellingId === null) {
                setCancelTarget(null);
              }
            }}
          >
            <div
              role="dialog"
              aria-modal="true"
              aria-labelledby="staff-cancel-title"
              aria-describedby="staff-cancel-body"
              className="w-full max-w-md rounded-2xl border border-slate-100 bg-white p-6 shadow-2xl dark:border-navy-700 dark:bg-navy-800 animate-scaleUp"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-rose-50 text-rose-600 dark:bg-rose-950/40 dark:text-rose-300">
                    <FiAlertTriangle className="h-5 w-5" />
                  </span>
                  <h2
                    id="staff-cancel-title"
                    className="text-base font-extrabold text-slate-800 dark:text-white"
                  >
                    Cancel this request?
                  </h2>
                </div>
                <button
                  type="button"
                  disabled={cancellingId !== null}
                  onClick={() => setCancelTarget(null)}
                  aria-label="Close cancel confirmation"
                  className="cursor-pointer rounded-full p-1 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600 disabled:cursor-not-allowed disabled:opacity-50 dark:hover:bg-navy-700 dark:hover:text-white"
                >
                  <FiX className="h-4 w-4" />
                </button>
              </div>

              <p
                id="staff-cancel-body"
                className="mt-3 text-xs leading-relaxed text-slate-500 dark:text-slate-400"
              >
                This withdraws your pending request for{' '}
                <strong className="font-bold text-slate-800 dark:text-white">
                  {cancelTarget.file_no} — {cancelTarget.file_name}
                </strong>
                . It moves to the Cancelled tab and cannot be restored, but you can
                submit a new request for this file afterwards.
              </p>

              <dl className="mt-4 grid grid-cols-2 gap-3 rounded-2xl border border-slate-100 bg-slate-50/70 p-3.5 text-[11px] dark:border-navy-700 dark:bg-navy-900/50">
                <div>
                  <dt className="font-bold uppercase tracking-wider text-slate-400">
                    Submitted
                  </dt>
                  <dd className="mt-0.5 font-bold text-slate-800 dark:text-white">
                    {formatSriLankaDate(cancelTarget.created_at)}
                  </dd>
                </div>
                <div>
                  <dt className="font-bold uppercase tracking-wider text-slate-400">
                    Duration
                  </dt>
                  <dd className="mt-0.5 font-bold text-slate-800 dark:text-white">
                    {cancelTarget.duration_days}{' '}
                    {cancelTarget.duration_days === 1 ? 'day' : 'days'}
                  </dd>
                </div>
              </dl>

              {cancelError && (
                <p
                  role="alert"
                  className="mt-3 rounded-xl border border-rose-200 bg-rose-50 p-3 text-[11px] font-semibold text-rose-700 dark:border-rose-900 dark:bg-rose-950/30 dark:text-rose-300"
                >
                  {cancelError}
                </p>
              )}

              <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                <button
                  type="button"
                  autoFocus
                  disabled={cancellingId !== null}
                  onClick={() => setCancelTarget(null)}
                  className="inline-flex cursor-pointer items-center justify-center rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-bold text-slate-600 transition-colors hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#4318FF]/60 disabled:cursor-not-allowed disabled:opacity-50 dark:border-navy-600 dark:bg-navy-800 dark:text-slate-300 dark:hover:bg-navy-700"
                >
                  Keep request
                </button>
                <button
                  type="button"
                  disabled={cancellingId !== null}
                  onClick={() => void cancelRequest(cancelTarget)}
                  className="inline-flex cursor-pointer items-center justify-center gap-1.5 rounded-xl bg-[#EF4444] px-3.5 py-2 text-xs font-bold text-white shadow-sm transition hover:bg-[#DC2626] focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-500/60 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {cancellingId === cancelTarget.id ? (
                    <FiRefreshCw className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <FiX className="h-3.5 w-3.5" />
                  )}
                  Yes, cancel request
                </button>
              </div>
            </div>
          </div>,
          document.body,
        )}

      {/* ── Details modal ── */}
      {selectedDetailRequest &&
        mounted &&
        ReactDOM.createPortal(
          <div
            className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-[6px] animate-fadeIn"
            onClick={() => setSelectedDetailRequest(null)}
          >
            <div
              role="dialog"
              aria-modal="true"
              aria-labelledby="staff-request-detail-title"
              className="relative max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-3xl border border-slate-100 bg-white p-6 shadow-2xl dark:border-navy-700 dark:bg-navy-800 sm:p-7 animate-scaleUp"
              onClick={(event) => event.stopPropagation()}
            >
              <div className="flex items-start justify-between border-b border-slate-100 pb-4 dark:border-navy-700">
                <div className="flex items-center gap-3">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-indigo-50 text-[#4318FF] shadow-xs dark:bg-brand-900/40 dark:text-brand-300">
                    <FiFileText className="h-5 w-5" />
                  </span>
                  <div>
                    <div className="flex items-center gap-2">
                      <h2
                        id="staff-request-detail-title"
                        className="text-lg font-black text-slate-800 dark:text-white"
                      >
                        {selectedDetailRequest.file_no}
                      </h2>
                      <span
                        className={`rounded-full px-2.5 py-0.5 text-[10px] font-black ${
                          statusStyle[selectedDetailRequest.status]?.className ??
                          statusStyle.CANCELLED.className
                        }`}
                      >
                        {statusStyle[selectedDetailRequest.status]?.label ??
                          selectedDetailRequest.status}
                      </span>
                    </div>
                    <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                      {selectedDetailRequest.file_name}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedDetailRequest(null)}
                  aria-label="Close details"
                  className="cursor-pointer rounded-full p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-navy-700 dark:hover:text-white"
                >
                  <FiX className="h-5 w-5" />
                </button>
              </div>

              <div className="mt-5 space-y-4 text-xs">
                <div className="rounded-2xl border border-slate-100 bg-slate-50/70 p-4 dark:border-navy-700 dark:bg-navy-900/50">
                  <div className="flex items-center gap-2 text-[11px] font-extrabold uppercase tracking-wider text-slate-500">
                    <FiMapPin className="text-[#4318FF] dark:text-brand-300" />
                    <span>Archive Location</span>
                  </div>
                  <p className="mt-1.5 font-bold text-slate-800 dark:text-white">
                    {selectedDetailRequest.storage_location}
                  </p>
                  <p className="mt-1 text-[10px] font-semibold text-slate-500 dark:text-slate-400">
                    {selectedDetailRequest.section_name}
                  </p>
                </div>

                <div className="rounded-2xl border border-slate-100 bg-slate-50/70 p-4 dark:border-navy-700 dark:bg-navy-900/50">
                  <div className="flex items-center gap-2 text-[11px] font-extrabold uppercase tracking-wider text-slate-500">
                    <FiCalendar className="text-[#4318FF] dark:text-brand-300" />
                    <span>Request Scheduling</span>
                  </div>
                  <div className="mt-2 grid gap-3 sm:grid-cols-3">
                    <div>
                      <p className="text-[10px] font-bold text-slate-400">Requested Access Date</p>
                      <p className="mt-0.5 font-bold text-slate-800 dark:text-white">
                        {formatSriLankaDate(`${String(selectedDetailRequest.request_date).slice(0, 10)}T00:00:00Z`)}
                      </p>
                    </div>
                    <div>
                      <p className="text-[10px] font-bold text-slate-400">Duration</p>
                      <p className="mt-0.5 font-bold text-slate-800 dark:text-white">
                        {selectedDetailRequest.duration_days}{' '}
                        {selectedDetailRequest.duration_days === 1 ? 'day' : 'days'}
                      </p>
                    </div>
                    <div>
                      <p className="text-[10px] font-bold text-slate-400">Priority Level</p>
                      <p className="mt-0.5 font-bold text-slate-800 dark:text-white">
                        {priorityLabel[selectedDetailRequest.priority] ??
                          selectedDetailRequest.priority}{' '}
                        Priority
                      </p>
                    </div>
                    <div>
                      <p className="text-[10px] font-bold text-slate-400">Submitted</p>
                      <p className="mt-0.5 font-bold text-slate-800 dark:text-white">
                        {formatSriLankaDateTime(selectedDetailRequest.created_at)}
                      </p>
                    </div>
                  </div>
                </div>

                {selectedDetailRequest.status === 'APPROVED' && (
                  <div className="rounded-2xl border border-slate-100 bg-slate-50/70 p-4 dark:border-navy-700 dark:bg-navy-900/50">
                    <div className="flex items-center gap-2 text-[11px] font-extrabold uppercase tracking-wider text-slate-500">
                      <FiCalendar className="text-[#4318FF] dark:text-brand-300" />
                      <span>Issue &amp; Return</span>
                    </div>
                    <div className="mt-2 grid gap-3 sm:grid-cols-3">
                      <div>
                        <p className="text-[10px] font-bold text-slate-400">Issued On</p>
                        <p className="mt-0.5 font-bold text-slate-800 dark:text-white">
                          {selectedDetailRequest.reviewed_at
                            ? formatSriLankaDateTime(selectedDetailRequest.reviewed_at)
                            : '—'}
                        </p>
                      </div>
                      <div>
                        <p className="text-[10px] font-bold text-slate-400">Expected Return</p>
                        <p
                          className={`mt-0.5 font-bold ${
                            isReturnDateExtended(
                              selectedDetailRequest.original_return_date,
                              selectedDetailRequest.expected_return_date,
                            )
                              ? 'text-rose-600 dark:text-rose-300'
                              : 'text-slate-800 dark:text-white'
                          }`}
                        >
                          {selectedDetailRequest.expected_return_date
                            ? formatSriLankaDate(
                                `${String(selectedDetailRequest.expected_return_date).slice(0, 10)}T00:00:00Z`,
                              )
                            : '—'}
                        </p>
                        {isReturnDateExtended(
                          selectedDetailRequest.original_return_date,
                          selectedDetailRequest.expected_return_date,
                        ) && (
                          <p className="mt-0.5 text-[9px] font-black uppercase tracking-wider text-rose-600 dark:text-rose-400">
                            Extended from{' '}
                            {formatSriLankaDate(
                              `${String(selectedDetailRequest.original_return_date).slice(0, 10)}T00:00:00Z`,
                            )}
                          </p>
                        )}
                      </div>
                      <div>
                        <p className="text-[10px] font-bold text-slate-400">
                          {selectedDetailRequest.returned_at ? 'Returned On' : 'Return Status'}
                        </p>
                        <p className="mt-0.5 font-bold text-slate-800 dark:text-white">
                          {selectedDetailRequest.returned_at
                            ? formatSriLankaDateTime(selectedDetailRequest.returned_at)
                            : getReturnStatus(
                                selectedDetailRequest.expected_return_date,
                                selectedDetailRequest.returned_at,
                              ).label}
                        </p>
                      </div>
                    </div>
                  </div>
                )}

                {selectedDetailRequest.status === 'REJECTED' ? (
                  <div className="rounded-2xl border border-rose-200 bg-rose-50/70 p-4 dark:border-rose-900 dark:bg-rose-950/40">
                    <div className="flex items-center gap-2 text-[11px] font-extrabold uppercase tracking-wider text-rose-700 dark:text-rose-300">
                      <FiXCircle className="h-4 w-4" />
                      <span>Administrator Rejection Reason</span>
                    </div>
                    <div className="mt-2.5 rounded-xl border border-rose-200/60 bg-white p-3.5 dark:border-navy-700 dark:bg-navy-900/90">
                      <p className="text-xs font-bold leading-relaxed text-slate-800 dark:text-white">
                        {selectedDetailRequest.admin_notes || 'No specific note provided.'}
                      </p>
                    </div>
                    <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-[10px] text-rose-800 dark:text-rose-300">
                      <span>
                        <strong>Reviewed By:</strong>{' '}
                        {selectedDetailRequest.reviewer_name || 'Administrator'}
                      </span>
                      <span>
                        <strong>Reviewed At (SLST):</strong>{' '}
                        {formatSriLankaDateTime(
                          selectedDetailRequest.reviewed_at || selectedDetailRequest.created_at,
                        )}
                      </span>
                    </div>
                  </div>
                ) : selectedDetailRequest.status === 'APPROVED' ? (
                  <div className="rounded-2xl border border-emerald-200 bg-emerald-50/70 p-4 dark:border-emerald-900 dark:bg-emerald-950/40">
                    <div className="flex items-center gap-2 text-[11px] font-extrabold uppercase tracking-wider text-emerald-700 dark:text-emerald-300">
                      <FiCheckCircle className="h-4 w-4" />
                      <span>
                        {selectedTabForRow === 'closed'
                          ? 'Completed — File Returned'
                          : 'Approved for Checkout'}
                      </span>
                    </div>
                    <div className="mt-2.5 rounded-xl border border-emerald-200/60 bg-white p-3.5 dark:border-navy-700 dark:bg-navy-900/90">
                      <p className="text-xs font-semibold leading-relaxed text-slate-800 dark:text-white">
                        {selectedDetailRequest.admin_notes ||
                          'Approved for physical retrieval.'}
                      </p>
                    </div>
                    <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-[10px] text-emerald-800 dark:text-emerald-300">
                      <span>
                        <strong>Approved By:</strong>{' '}
                        {selectedDetailRequest.reviewer_name || 'Administrator'}
                      </span>
                      <span>
                        <strong>Approved At (SLST):</strong>{' '}
                        {formatSriLankaDateTime(
                          selectedDetailRequest.reviewed_at || selectedDetailRequest.created_at,
                        )}
                      </span>
                    </div>
                  </div>
                ) : selectedDetailRequest.status === 'CANCELLED' ? (
                  <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4 dark:border-navy-600 dark:bg-navy-900/50">
                    <div className="flex items-center gap-2 text-[11px] font-extrabold uppercase tracking-wider text-slate-600 dark:text-slate-300">
                      <FiXCircle className="h-4 w-4" />
                      <span>
                        {selectedDetailRequest.cancellation_reason ===
                        'Replaced by higher-priority request'
                          ? 'Replaced by a higher-priority request'
                          : selectedDetailRequest.cancellation_reason ===
                            'Duplicate pending request consolidated'
                          ? 'Duplicate request consolidated'
                          : 'Cancelled by you'}
                      </span>
                    </div>
                    <div className="mt-2.5 rounded-xl border border-slate-200 bg-white p-3.5 dark:border-navy-700 dark:bg-navy-900/90">
                      <p className="text-xs font-semibold leading-relaxed text-slate-700 dark:text-slate-200">
                        {selectedDetailRequest.cancellation_reason ||
                          'You cancelled this request before it was reviewed.'}
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="rounded-2xl border border-amber-200 bg-amber-50/70 p-4 dark:border-amber-900 dark:bg-amber-950/30">
                    <div className="flex items-center gap-2 text-[11px] font-extrabold uppercase tracking-wider text-amber-700 dark:text-amber-300">
                      <FiCalendar className="h-4 w-4" />
                      <span>Waiting for administrator review</span>
                    </div>
                    <p className="mt-2 text-xs font-semibold text-amber-800 dark:text-amber-200">
                      You can still cancel this request from the table while it is
                      pending.
                    </p>
                  </div>
                )}
              </div>

              <div className="mt-6 flex justify-end border-t border-slate-100 pt-4 dark:border-navy-700">
                <button
                  type="button"
                  onClick={() => setSelectedDetailRequest(null)}
                  className="cursor-pointer rounded-xl border border-slate-200 bg-white px-5 py-2 text-xs font-bold text-slate-700 shadow-xs hover:bg-slate-50 dark:border-navy-600 dark:bg-navy-700 dark:text-slate-200"
                >
                  Close
                </button>
              </div>
            </div>
          </div>,
          document.body,
        )}

      {/* ── Request extra days ── */}
      {extensionTarget &&
        mounted &&
        ReactDOM.createPortal(
          <div
            className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-[6px] animate-fadeIn"
            onClick={(event) => {
              if (event.target === event.currentTarget && !submittingExtension) {
                setExtensionTarget(null);
                setExtensionError('');
              }
            }}
          >
            <form
              role="dialog"
              aria-modal="true"
              aria-labelledby="staff-extension-title"
              onSubmit={submitExtensionRequest}
              className="w-full max-w-lg rounded-2xl border border-slate-100 bg-white p-6 shadow-2xl dark:border-navy-700 dark:bg-navy-800 animate-scaleUp"
            >
              <div className="flex items-center justify-between border-b border-slate-100 pb-3 dark:border-navy-700">
                <div className="flex items-center gap-2 text-[#4318FF] dark:text-brand-300">
                  <FiCalendar className="h-5 w-5" />
                  <h2
                    id="staff-extension-title"
                    className="text-base font-extrabold text-slate-800 dark:text-white"
                  >
                    Request Return-Date Extension
                  </h2>
                </div>
                <button
                  type="button"
                  disabled={submittingExtension}
                  onClick={() => {
                    setExtensionTarget(null);
                    setExtensionError('');
                  }}
                  aria-label="Close extension request"
                  className="cursor-pointer rounded-full p-1 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-navy-700 dark:hover:text-white"
                >
                  <FiX className="h-4 w-4" />
                </button>
              </div>

              <p className="mt-3 text-xs leading-relaxed text-slate-500 dark:text-slate-400">
                Ask the Record Room administrator to keep{' '}
                <strong className="font-bold text-slate-800 dark:text-white">
                  {extensionTarget.file_no} — {extensionTarget.file_name}
                </strong>{' '}
                for longer. Your return date only changes once an administrator
                approves this request.
              </p>

              <div className="mt-4 grid gap-3 rounded-2xl border border-slate-100 bg-slate-50/70 p-4 text-[11px] dark:border-navy-700 dark:bg-navy-900/50 sm:grid-cols-2">
                <div>
                  <p className="font-bold uppercase tracking-wider text-slate-400">
                    Current return date
                  </p>
                  <p className="mt-0.5 font-bold text-slate-800 dark:text-white">
                    {extensionTarget.expected_return_date
                      ? formatSriLankaDate(
                          `${String(extensionTarget.expected_return_date).slice(0, 10)}T00:00:00Z`,
                        )
                      : 'Not set'}
                  </p>
                </div>
                <div>
                  <p className="font-bold uppercase tracking-wider text-slate-400">
                    Current status
                  </p>
                  <p className="mt-0.5 font-bold text-slate-800 dark:text-white">
                    {getReturnStatus(
                      extensionTarget.expected_return_date,
                      extensionTarget.returned_at,
                    ).label}
                  </p>
                </div>
              </div>

              <label
                htmlFor="extension-new-date"
                className="mb-1.5 mt-4 block text-[10px] font-extrabold uppercase tracking-wider text-slate-600 dark:text-slate-300"
              >
                Requested new return date <span className="text-rose-500">*</span>
              </label>
              <input
                id="extension-new-date"
                type="date"
                value={extensionDate}
                min={String(extensionTarget.expected_return_date || '').slice(0, 10)}
                onChange={(event) => {
                  setExtensionDate(event.target.value);
                  setExtensionError('');
                }}
                required
                className="w-full rounded-xl border border-slate-200 bg-white p-3 text-xs text-slate-700 outline-none transition focus:border-[#4318FF] focus:ring-4 focus:ring-[#4318FF]/10 dark:border-navy-600 dark:bg-navy-900 dark:text-white"
              />

              <label
                htmlFor="extension-reason"
                className="mb-1.5 mt-4 block text-[10px] font-extrabold uppercase tracking-wider text-slate-600 dark:text-slate-300"
              >
                Reason for the extension <span className="text-rose-500">*</span>
              </label>
              <textarea
                id="extension-reason"
                value={extensionReason}
                onChange={(event) => {
                  setExtensionReason(event.target.value);
                  setExtensionError('');
                }}
                maxLength={500}
                rows={4}
                required
                className="w-full resize-y rounded-xl border border-slate-200 bg-white p-3 text-xs text-slate-700 outline-none transition focus:border-[#4318FF] focus:ring-4 focus:ring-[#4318FF]/10 dark:border-navy-600 dark:bg-navy-900 dark:text-white"
                placeholder="E.g., The statements are still being verified by the section head."
              />

              {extensionError && (
                <p
                  role="alert"
                  className="mt-2 text-[10px] font-bold text-rose-600 dark:text-rose-400"
                >
                  {extensionError}
                </p>
              )}

              <div className="mt-5 flex justify-end gap-2.5">
                <button
                  type="button"
                  disabled={submittingExtension}
                  onClick={() => {
                    setExtensionTarget(null);
                    setExtensionError('');
                  }}
                  className="cursor-pointer rounded-xl border border-slate-200 px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-50 disabled:opacity-50 dark:border-navy-600 dark:text-slate-300 dark:hover:bg-navy-700"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submittingExtension}
                  className="inline-flex cursor-pointer items-center gap-2 rounded-xl bg-[#4318FF] px-4 py-2 text-xs font-bold text-white shadow-md shadow-[#4318FF]/20 hover:bg-[#3612d6] disabled:opacity-50"
                >
                  {submittingExtension && <FiRefreshCw className="animate-spin" />}
                  Submit Request
                </button>
              </div>
            </form>
          </div>,
          document.body,
        )}
    </div>
  );
}
