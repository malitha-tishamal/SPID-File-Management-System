'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import {
  FiAlertTriangle,
  FiArrowLeft,
  FiCheckCircle,
  FiClock,
  FiDownload,
  FiInfo,
  FiPackage,
  FiRefreshCw,
  FiSearch,
  FiTrendingUp,
} from 'react-icons/fi';
import { useToast } from 'components/toast/ToastContext';
import { exportToCsv, formatDateTimeForCsv } from 'lib/csvExport';
import { formatSriLankaDate, sriLankaTodayInput } from 'lib/datetime';
import {
  clearQueryParam,
  parseRecordId,
  readQueryParam,
} from 'lib/deep-link';
import IssuedFilesTable from './IssuedFilesTable';
import IssuedFileDetailModal from './IssuedFileDetailModal';
import ConfirmReturnModal from './ConfirmReturnModal';
import ExtendReturnModal, { type ExtendPayload } from './ExtendReturnModal';
import type {
  IssuedFileRow,
  IssuedFilesCounts,
  IssuedView,
} from './issuedTypes';

const VIEW_TABS: { key: IssuedView; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { key: 'active', label: 'Active', icon: FiClock },
  { key: 'overdue', label: 'Overdue', icon: FiAlertTriangle },
  { key: 'returned', label: 'Returned', icon: FiCheckCircle },
];

export default function IssuedFilesPage() {
  const { showToast } = useToast();

  const [view, setView] = useState<IssuedView>('active');
  const [files, setFiles] = useState<IssuedFileRow[]>([]);
  const [counts, setCounts] = useState<IssuedFilesCounts>({
    active: 0,
    overdue: 0,
    returned: 0,
    extended: 0,
  });
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const deferredSearchTerm = React.useDeferredValue(searchTerm);
  const [busyId, setBusyId] = useState<number | null>(null);

  const [detailFile, setDetailFile] = useState<IssuedFileRow | null>(null);
  const [returnFile, setReturnFile] = useState<IssuedFileRow | null>(null);
  const [isReturning, setIsReturning] = useState(false);
  const [extendFile, setExtendFile] = useState<IssuedFileRow | null>(null);
  const [isExtending, setIsExtending] = useState(false);

  const hasLoadedRef = useRef(false);

  /** GET /api/admin/issued-files?view=active|overdue|returned */
  const loadFiles = useCallback(
    async (signal?: AbortSignal) => {
      if (!hasLoadedRef.current) setLoading(true);
      else setRefreshing(true);
      setError(null);

      try {
        const res = await fetch(
          `/api/admin/issued-files?view=${view}`,
          { signal },
        );
        const json = await res.json().catch(() => null);

        if (res.ok && json?.ok) {
          setFiles((json.data?.files ?? []) as IssuedFileRow[]);
          setTotal(Number(json.data?.total ?? 0));
          if (json.data?.counts) setCounts(json.data.counts);
          hasLoadedRef.current = true;
        } else {
          setError(
            json?.message || 'Failed to load issued files from the server.',
          );
        }
      } catch (err) {
        if (err instanceof Error && err.name === 'AbortError') return;
        setError(
          'Could not connect to the server to load the issued files ledger.',
        );
      } finally {
        if (!signal?.aborted) {
          setLoading(false);
          setRefreshing(false);
        }
      }
    },
    [view],
  );

  useEffect(() => {
    const controller = new AbortController();
    void loadFiles(controller.signal);
    return () => controller.abort();
  }, [loadFiles]);

  // Notification deep link: ?file=<issue id> opens that record in the ledger.
  const [highlightFileId, setHighlightFileId] = useState<number | null>(null);
  const [deepLinkNotice, setDeepLinkNotice] = useState('');
  const ledgerBeforeProbe = useRef<IssuedView | null>(null);

  useEffect(() => {
    if (loading) return;
    const id = parseRecordId(readQueryParam('file'));
    if (id === null) return;

    const match = files.find((file) => file.id === id);
    if (match) {
      clearQueryParam('file');
      setHighlightFileId(id);
      setDetailFile(match);
      setDeepLinkNotice('');
      return;
    }

    if (ledgerBeforeProbe.current === null) {
      // The issue may already be closed; check the other ledger once.
      ledgerBeforeProbe.current = view;
      setView(view === 'returned' ? 'active' : 'returned');
      return;
    }

    clearQueryParam('file');
    setView(ledgerBeforeProbe.current);
    ledgerBeforeProbe.current = null;
    setHighlightFileId(id);
    setDeepLinkNotice(
      'That issued file is no longer in the ledger, so there is nothing to open. The full list is shown instead.',
    );
  }, [loading, files, view]);

  /** Search filters the loaded rows by file number, file name or staff name. */
  const visibleFiles = useMemo(() => {
    const q = deferredSearchTerm.trim().toLowerCase();
    if (!q) return files;
    return files.filter((file) =>
      [file.file_no, file.file_name, file.requester_name].some((value) =>
        (value || '').toLowerCase().includes(q),
      ),
    );
  }, [files, deferredSearchTerm]);

  const handleExportCsv = () => {
    if (visibleFiles.length === 0) {
      showToast({
        type: 'info',
        title: 'No Records to Export',
        message:
          'No matching issued files to export. Try adjusting your search or view.',
      });
      return;
    }

    const headers = [
      'File Number',
      'File Name',
      'Staff Name',
      'Section',
      'Issue Date',
      'Duration (Days)',
      'Original Return Date',
      'Expected Return Date',
      'Extended',
      'Return Status',
      'Returned Date',
    ];
    const rows = visibleFiles.map((f) => [
      f.file_no,
      f.file_name,
      f.requester_name,
      f.section_name,
      formatDateTimeForCsv(f.issued_at || f.request_date),
      f.duration_days ?? '',
      formatSriLankaDate(f.original_return_date),
      formatSriLankaDate(f.expected_return_date),
      f.is_extended && !f.returned_at ? 'Yes' : 'No',
      f.return_label,
      f.returned_at ? formatDateTimeForCsv(f.returned_at) : '',
    ]);

    exportToCsv(headers, rows, `issued-files-${view}-${sriLankaTodayInput()}.csv`);

    showToast({
      type: 'success',
      title: 'Export Complete',
      message: `Exported ${rows.length} issued file${
        rows.length !== 1 ? 's' : ''
      } to CSV.`,
    });
  };

  /** POST /api/admin/issued-files/[id]/return */
  const handleConfirmReturn = async () => {
    if (!returnFile || isReturning) return;
    const target = returnFile;
    setIsReturning(true);
    setBusyId(target.id);

    try {
      const res = await fetch(
        `/api/admin/issued-files/${encodeURIComponent(target.id)}/return`,
        { method: 'POST' },
      );
      const json = await res.json().catch(() => null);

      if (res.ok && json?.ok) {
        showToast({
          type: 'success',
          title: 'Return Recorded',
          message:
            json.data?.message ||
            `${target.file_no} was marked as received back.`,
        });
        setReturnFile(null);
        setDetailFile((current) => (current?.id === target.id ? null : current));
        await loadFiles();
      } else {
        showToast({
          type: 'error',
          title: 'Return Not Recorded',
          message: json?.message || 'Server rejected the return update.',
        });
      }
    } catch {
      showToast({
        type: 'error',
        title: 'Connection Error',
        message: 'Failed to communicate with server to record the return.',
      });
    } finally {
      setIsReturning(false);
      setBusyId(null);
    }
  };

  /** POST /api/admin/issued-files/[id]/extend — resolves an inline error message on failure. */
  const handleConfirmExtend = async (
    payload: ExtendPayload,
  ): Promise<string | null> => {
    if (!extendFile) return 'No file is selected. Close and reopen the dialog.';
    const target = extendFile;
    setIsExtending(true);
    setBusyId(target.id);

    try {
      const res = await fetch(
        `/api/admin/issued-files/${encodeURIComponent(target.id)}/extend`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            new_return_date: payload.new_return_date,
            reason: payload.reason,
          }),
        },
      );
      const json = await res.json().catch(() => null);

      if (res.ok && json?.ok) {
        showToast({
          type: 'success',
          title: 'Return Date Extended',
          message:
            json.data?.message ||
            `${target.file_no} is now due on ${payload.new_return_date}.`,
        });
        setExtendFile(null);
        setDetailFile((current) => (current?.id === target.id ? null : current));
        await loadFiles();
        return null;
      }

      const message = json?.message || 'Server rejected the extension.';
      showToast({
        type: 'error',
        title: 'Extension Failed',
        message,
      });
      return message;
    } catch {
      const message = 'Could not reach the server to extend this return date.';
      showToast({
        type: 'error',
        title: 'Connection Error',
        message,
      });
      return message;
    } finally {
      setIsExtending(false);
      setBusyId(null);
    }
  };

  const summaryCards = [
    {
      label: 'ACTIVE ISSUES',
      value: counts.active,
      sub: 'Out of the repository',
      icon: FiPackage,
      iconClass:
        'bg-[#F4F2FF] text-[#4318FF] dark:bg-brand-900/40 dark:text-brand-300',
    },
    {
      label: 'OVERDUE',
      value: counts.overdue,
      sub: 'Past the due date',
      icon: FiAlertTriangle,
      iconClass: 'bg-rose-50 text-rose-600 dark:bg-rose-950/40 dark:text-rose-300',
    },
    {
      label: 'EXTENDED',
      value: counts.extended,
      sub: 'Due date moved by admin',
      icon: FiTrendingUp,
      iconClass:
        'bg-[#FFFBEB] text-[#D97706] dark:bg-amber-950/40 dark:text-amber-300',
    },
    {
      label: 'RETURNED',
      value: counts.returned,
      sub: 'Received back in store',
      icon: FiCheckCircle,
      iconClass:
        'bg-[#E6F9F0] text-[#05CD99] dark:bg-emerald-950/40 dark:text-emerald-300',
    },
  ];

  return (
    <div className="w-full pb-10 font-dm">
      {/* ═══ BREADCRUMBS & TOP BAR ═══ */}
      <div className="mb-4 flex flex-col justify-between gap-2 md:flex-row md:items-center">
        <nav className="flex items-center gap-2 text-xs font-semibold text-slate-400 dark:text-gray-400">
          <Link
            href="/admin/default"
            className="transition-colors hover:text-slate-600 dark:hover:text-white"
          >
            Pages
          </Link>
          <span>/</span>
          <span className="text-slate-500 dark:text-gray-300">Record Room</span>
          <span>/</span>
          <span className="font-bold text-[#1B254B] dark:text-white">
            Issued Files
          </span>
        </nav>

        <Link
          href="/admin/default"
          className="inline-flex items-center gap-1.5 text-xs font-bold text-[#4318FF] hover:underline dark:text-brand-300"
        >
          <FiArrowLeft className="h-3.5 w-3.5" />
          <span>Back to Recordroom Dashboard</span>
        </Link>
      </div>

      {/* ═══ HEADING + SUMMARY CHIPS ═══ */}
      <div className="mb-5">
        <div>
          <h1 className="text-2xl font-black tracking-tight text-[#1B254B] dark:text-white sm:text-3xl">
            Issued Files
          </h1>
          <p className="mt-0.5 max-w-xl text-xs text-slate-400 dark:text-gray-400">
            Every approved staff checkout with its official return date. Record
            physical returns, extend due dates and audit the history — all read
            live from the database.
          </p>
        </div>

        {/* One aligned row of four cards; 2 columns on medium, 1 on narrow. */}
        <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
          {summaryCards.map((card) => (
            <div
              key={card.label}
              className="shadow-xs flex min-w-0 items-center gap-3 rounded-2xl border border-slate-100 bg-white p-3 dark:border-navy-700 dark:bg-navy-800"
            >
              <div
                className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${card.iconClass}`}
              >
                <card.icon className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <span className="block text-[9px] font-black uppercase tracking-wider text-slate-400">
                  {card.label}
                </span>
                <div className="flex items-baseline gap-1.5">
                  <span className="font-mono text-base font-black text-[#1B254B] dark:text-white">
                    {card.value}
                  </span>
                  <span className="text-[11px] font-bold text-slate-400">
                    files
                  </span>
                </div>
                <span className="block text-[10px] font-semibold leading-tight text-slate-400">
                  {card.sub}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ═══ VIEW FILTER + SEARCH + EXPORT ═══ */}
      <div className="shadow-xs mb-4 rounded-2xl border border-slate-100 bg-white p-3 dark:border-navy-700 dark:bg-navy-800">
        <div className="flex flex-wrap items-center gap-2.5">
          <div
            role="group"
            aria-label="Issued file ledger views"
            className="flex flex-wrap items-center gap-2.5"
          >
            {VIEW_TABS.map((tab) => {
              const isActive = view === tab.key;
              const badgeCount = counts[tab.key];
              return (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => setView(tab.key)}
                  aria-pressed={isActive}
                  className={`flex cursor-pointer items-center gap-2 rounded-full px-4 py-2 text-xs font-bold transition-all ${
                    isActive
                      ? 'bg-[#4318FF] text-white shadow-md shadow-[#4318FF]/25'
                      : 'border border-slate-200/60 bg-white text-slate-600 hover:bg-slate-50 dark:border-navy-700 dark:bg-navy-800 dark:text-slate-300'
                  }`}
                >
                  <tab.icon className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>{tab.label}</span>
                  <span
                    className={`rounded-full px-2 py-0.5 text-[10px] font-black ${
                      isActive
                        ? 'bg-[#3311CC] text-white'
                        : tab.key === 'overdue'
                          ? 'bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300'
                          : 'bg-slate-100 text-slate-600 dark:bg-navy-700 dark:text-slate-300'
                    }`}
                  >
                    {badgeCount}
                  </span>
                </button>
              );
            })}
          </div>

          <div className="relative ml-auto min-w-[240px] flex-1 lg:max-w-[320px]">
            <FiSearch
              className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
              aria-hidden="true"
            />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              aria-label="Search issued files by file number, file name or staff name"
              placeholder="Search file number, file name or staff name…"
              className="border-transparent h-9 w-full rounded-xl border bg-slate-50/70 pl-9 pr-3 text-xs text-slate-800 outline-none transition-all placeholder:text-slate-400 focus:border-[#4318FF] focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[#4318FF] dark:bg-navy-900/70 dark:text-white"
            />
          </div>

          <button
            type="button"
            onClick={() => void loadFiles()}
            disabled={loading || refreshing}
            className="flex h-9 shrink-0 cursor-pointer items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 text-xs font-bold text-slate-600 transition-colors hover:bg-slate-50 disabled:opacity-50 dark:border-navy-700 dark:bg-navy-900 dark:text-slate-300"
            title="Reload the issued files ledger"
          >
            <FiRefreshCw
              className={`h-3.5 w-3.5 ${refreshing ? 'animate-spin' : ''}`}
            />
            <span>Refresh</span>
          </button>

          <button
            type="button"
            onClick={handleExportCsv}
            className="shadow-xs flex h-9 shrink-0 cursor-pointer items-center gap-1.5 rounded-xl bg-[#4318FF] px-3 text-xs font-bold text-white transition-colors hover:bg-[#3311CC]"
            title="Export the visible issued files as CSV"
          >
            <FiDownload className="h-3.5 w-3.5" />
            <span>Export CSV</span>
          </button>
        </div>
      </div>

      {/* ═══ LEDGER COUNT LINE ═══ */}
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <h2 className="text-xs font-black uppercase tracking-wider text-slate-700 dark:text-slate-200">
            {view === 'active'
              ? 'FILES CURRENTLY ISSUED (AWAITING RETURN)'
              : view === 'overdue'
                ? 'OVERDUE ISSUES (PAST THE OFFICIAL DUE DATE)'
                : 'RETURNED FILES (RECEIVED BACK IN STORE)'}
          </h2>
          <span
            role="status"
            aria-live="polite"
            className="rounded-full bg-slate-100 px-2.5 py-0.5 text-[10px] font-bold text-slate-700 dark:bg-navy-700 dark:text-slate-300"
          >
            {visibleFiles.length} of {total}
            <span className="sr-only"> issued files shown</span>
          </span>
        </div>
        <span className="hidden text-[11px] italic text-slate-400 sm:inline">
          Returns and extensions are saved by the server before the ledger updates.
        </span>
      </div>

      {/* ═══ ERROR / TABLE ═══ */}
      {deepLinkNotice && (
        <div
          role="status"
          className="mb-4 flex items-start gap-2 rounded-2xl border border-[#4318FF]/20 bg-[#4318FF]/[0.05] p-4 text-xs text-slate-700 dark:border-brand-700 dark:bg-brand-900/25 dark:text-slate-200 shadow-xs"
        >
          <FiInfo className="mt-0.5 h-4 w-4 shrink-0 text-[#4318FF] dark:text-brand-300" />
          <p className="break-words font-semibold">{deepLinkNotice}</p>
        </div>
      )}
      {error && !loading ? (
        <div
          role="alert"
          className="rounded-2xl border border-rose-200 bg-rose-50 p-5 text-sm text-rose-700 dark:border-rose-900 dark:bg-rose-950/30 dark:text-rose-300 shadow-xs"
        >
          <p className="font-bold">Could not load issued files</p>
          <p className="mt-1 whitespace-pre-wrap text-xs">{error}</p>
          <button
            type="button"
            onClick={() => void loadFiles()}
            className="mt-3 inline-flex cursor-pointer items-center gap-1.5 rounded-xl bg-[#4318FF] px-3.5 py-2 text-xs font-bold text-white shadow-xs transition-colors hover:bg-[#3311CC]"
          >
            <FiRefreshCw className="h-3.5 w-3.5" />
            <span>Retry</span>
          </button>
        </div>
      ) : (
        <IssuedFilesTable
          files={visibleFiles}
          loading={loading}
          refreshing={refreshing}
          busyId={busyId}
          highlightId={highlightFileId}
          onView={(file) => setDetailFile(file)}
          onReturn={(file) => setReturnFile(file)}
          onExtend={(file) => setExtendFile(file)}
        />
      )}

      {/* ═══ DIALOGS ═══ */}
      <IssuedFileDetailModal
        file={detailFile}
        onClose={() => setDetailFile(null)}
      />

      <ConfirmReturnModal
        file={returnFile}
        loading={isReturning}
        onConfirm={() => void handleConfirmReturn()}
        onCancel={() => !isReturning && setReturnFile(null)}
      />

      <ExtendReturnModal
        file={extendFile}
        loading={isExtending}
        onConfirm={handleConfirmExtend}
        onCancel={() => !isExtending && setExtendFile(null)}
      />
    </div>
  );
}
