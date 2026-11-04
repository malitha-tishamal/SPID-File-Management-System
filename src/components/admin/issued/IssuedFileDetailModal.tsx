'use client';

import React, { useEffect, useState } from 'react';
import { useDialogBehavior } from 'lib/dialogBehavior';
import {
  FiAlertCircle,
  FiCalendar,
  FiCheckCircle,
  FiClock,
  FiFileText,
  FiMapPin,
  FiRefreshCw,
  FiUpload,
  FiUser,
  FiX,
} from 'react-icons/fi';
import { formatSriLankaDate, formatSriLankaDateTimeCompact } from 'lib/datetime';
import {
  EXTENSION_STATUS_BADGE_CLASS,
  RETURN_BADGE_CLASS,
  type FileExtensionRow,
  type IssuedFileRow,
} from './issuedTypes';

function InfoBlock({
  icon: Icon,
  label,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-slate-100 bg-slate-50 p-3.5 dark:border-navy-700 dark:bg-navy-900/50">
      <span className="mb-1 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-400">
        <Icon className="h-3.5 w-3.5" /> {label}
      </span>
      <div className="text-xs font-bold text-slate-800 dark:text-white">
        {children}
      </div>
    </div>
  );
}

/**
 * Full detail dialog for one issued file: file, staff, every issue/return date
 * and the extension history straight from
 * `GET /api/admin/file-request-extensions?status=ALL`.
 */
export default function IssuedFileDetailModal({
  file,
  onClose,
}: {
  file: IssuedFileRow | null;
  onClose: () => void;
}) {
  const [extensions, setExtensions] = useState<FileExtensionRow[]>([]);
  const [loadingExtensions, setLoadingExtensions] = useState(false);
  const [extensionsError, setExtensionsError] = useState<string | null>(null);

  const panelRef = useDialogBehavior<HTMLDivElement>(file !== null, onClose);

  useEffect(() => {
    if (!file) return;
    let cancelled = false;

    const loadHistory = async () => {
      setLoadingExtensions(true);
      setExtensionsError(null);
      setExtensions([]);
      try {
        const res = await fetch('/api/admin/file-request-extensions?status=ALL');
        const json = await res.json().catch(() => null);
        if (cancelled) return;
        if (res.ok && json?.ok) {
          const all: FileExtensionRow[] = json.data?.extensions ?? [];
          setExtensions(
            all
              .filter((row) => row.request_id === file.id)
              .sort(
                (a, b) =>
                  new Date(b.created_at ?? 0).getTime() -
                  new Date(a.created_at ?? 0).getTime(),
              ),
          );
        } else {
          setExtensionsError(
            json?.message || 'Could not load the extension history.',
          );
        }
      } catch {
        if (!cancelled) {
          setExtensionsError('Could not connect to the server to load history.');
        }
      } finally {
        if (!cancelled) setLoadingExtensions(false);
      }
    };

    void loadHistory();
    return () => {
      cancelled = true;
    };
  }, [file]);

  if (!file) return null;

  const isReturned = Boolean(file.returned_at);

  return (
    <div
      className="fixed inset-0 z-[90] flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        ref={panelRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={`Issue details for ${file.file_no}`}
        className="animate-in fade-in zoom-in-95 duration-150 max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-3xl border border-slate-100 bg-white p-6 shadow-2xl dark:border-navy-700 dark:bg-navy-800"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between border-b border-slate-100 pb-4 dark:border-navy-700">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[#F4F2FF] text-[#4318FF] dark:bg-brand-900/40 dark:text-brand-300">
              <FiFileText className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-mono text-xs font-bold text-[#4318FF] dark:text-brand-300">
                  {file.file_no}
                </span>
                <span
                  className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[10px] font-bold ${
                    RETURN_BADGE_CLASS[file.return_status] ??
                    RETURN_BADGE_CLASS.active
                  }`}
                >
                  {isReturned ? (
                    <FiCheckCircle className="h-3 w-3" />
                  ) : (
                    <FiClock className="h-3 w-3" />
                  )}
                  <span>{file.return_label}</span>
                </span>
              </div>
              <h3 className="mt-1 text-base font-bold leading-snug text-navy-800 dark:text-white">
                {file.file_name}
              </h3>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="cursor-pointer rounded-xl p-2 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-navy-700 dark:hover:text-white"
            aria-label="Close details"
          >
            <FiX className="h-5 w-5" />
          </button>
        </div>

        {/* File + staff grid */}
        <div className="mt-5 grid grid-cols-1 gap-4 text-xs sm:grid-cols-2">
          <InfoBlock icon={FiMapPin} label="Section / Storage Location">
            <p>{file.section_name || '—'}</p>
            <p className="mt-0.5 text-[11px] font-semibold text-slate-500 dark:text-slate-400">
              {file.storage_location || 'Central Record Room'}
            </p>
          </InfoBlock>

          <InfoBlock icon={FiUser} label="Issued To (Staff Member)">
            <p>{file.requester_name}</p>
            <p className="mt-0.5 text-[11px] font-semibold text-slate-500 dark:text-slate-400">
              {file.requester_section || 'Staff'}
              {file.requester_email ? ` • ${file.requester_email}` : ''}
            </p>
          </InfoBlock>

          <InfoBlock icon={FiCalendar} label="Issue Date">
            <p>{formatSriLankaDateTimeCompact(file.issued_at)}</p>
            <p className="mt-0.5 text-[11px] font-semibold text-slate-500 dark:text-slate-400">
              Requested on {formatSriLankaDate(file.request_date)}
            </p>
          </InfoBlock>

          <InfoBlock icon={FiClock} label="Approved Duration">
            <p>
              {file.duration_days ?? '—'} {file.duration_days === 1 ? 'day' : 'days'}
            </p>
            <p className="mt-0.5 text-[11px] font-semibold text-slate-500 dark:text-slate-400">
              Approved on {formatSriLankaDateTimeCompact(file.reviewed_at)}
            </p>
          </InfoBlock>

          <InfoBlock icon={FiCalendar} label="Original Return Date">
            <p>{formatSriLankaDate(file.original_return_date)}</p>
          </InfoBlock>

          <InfoBlock icon={FiUpload} label="Expected Return Date (Official)">
            <p className={file.is_extended && !isReturned ? 'text-rose-600 dark:text-rose-400' : undefined}>
              {formatSriLankaDate(file.expected_return_date)}
            </p>
            {file.is_extended && !isReturned && (
              <p className="mt-0.5 text-[11px] font-bold text-rose-600 dark:text-rose-400">
                Extended — was {formatSriLankaDate(file.original_return_date)}
              </p>
            )}
          </InfoBlock>

          <InfoBlock icon={FiCheckCircle} label="Returned Date">
            <p>{file.returned_at ? formatSriLankaDateTimeCompact(file.returned_at) : '—'}</p>
            {!file.returned_at && (
              <p className="mt-0.5 text-[11px] font-semibold text-slate-400">
                Still checked out of the repository
              </p>
            )}
          </InfoBlock>

          <InfoBlock icon={FiCalendar} label="Request Logged">
            <p>{formatSriLankaDateTimeCompact(file.created_at)}</p>
          </InfoBlock>
        </div>

        {/* Admin notes */}
        {file.admin_notes && (
          <div className="mt-4 rounded-2xl border border-slate-100 bg-slate-50 p-4 dark:border-navy-700 dark:bg-navy-900/50">
            <p className="mb-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">
              Admin Review Note
            </p>
            <p className="whitespace-pre-wrap break-words text-xs font-semibold text-slate-700 dark:text-slate-200">
              {file.admin_notes}
            </p>
          </div>
        )}

        {/* Extension history */}
        <div className="mt-5">
          <div className="flex items-center gap-2">
            <h4 className="text-[10px] font-black uppercase tracking-wider text-slate-700 dark:text-slate-200">
              Extension History
            </h4>
            <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-[10px] font-bold text-slate-600 dark:bg-navy-700 dark:text-slate-300">
              {extensions.length} record{extensions.length === 1 ? '' : 's'}
            </span>
          </div>

          {loadingExtensions && (
            <div className="mt-3 flex items-center gap-2 rounded-2xl border border-slate-100 bg-white p-4 text-xs text-slate-500 dark:border-navy-700 dark:bg-navy-900/50 dark:text-slate-400">
              <FiRefreshCw className="h-3.5 w-3.5 animate-spin" />
              <span>Loading extension history…</span>
            </div>
          )}

          {!loadingExtensions && extensionsError && (
            <div className="mt-3 flex items-start gap-2.5 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-xs dark:border-rose-900 dark:bg-rose-950/30">
              <FiAlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-rose-600 dark:text-rose-400" />
              <div className="min-w-0">
                <p className="font-bold text-rose-700 dark:text-rose-300">
                  Could not load extension history
                </p>
                <p className="mt-0.5 whitespace-pre-wrap text-rose-600 dark:text-rose-400">
                  {extensionsError}
                </p>
              </div>
            </div>
          )}

          {!loadingExtensions && !extensionsError && extensions.length === 0 && (
            <div className="mt-3 rounded-2xl border border-dashed border-slate-200 bg-slate-50/70 p-4 text-center dark:border-navy-600 dark:bg-navy-900/40">
              <p className="text-xs font-bold text-slate-500 dark:text-slate-300">
                No extensions recorded.
              </p>
              <p className="mt-0.5 text-[11px] text-slate-400">
                This file has been kept on its original return date.
              </p>
            </div>
          )}

          {!loadingExtensions &&
            !extensionsError &&
            extensions.map((row) => (
              <div
                key={row.id}
                className="mt-3 rounded-2xl border border-slate-100 bg-slate-50/70 p-4 dark:border-navy-700 dark:bg-navy-900/50"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span
                    className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[10px] font-bold ${
                      EXTENSION_STATUS_BADGE_CLASS[row.status] ??
                      EXTENSION_STATUS_BADGE_CLASS.PENDING
                    }`}
                  >
                    {row.status}
                  </span>
                  <span className="text-[10px] font-semibold text-slate-400">
                    {formatSriLankaDateTimeCompact(row.created_at)}
                  </span>
                </div>

                <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px]">
                  <span className="font-semibold text-slate-500 dark:text-slate-400">
                    {formatSriLankaDate(row.previous_return_date)}
                  </span>
                  <span aria-hidden="true" className="text-slate-400">
                    →
                  </span>
                  <span className="font-bold text-slate-800 dark:text-white">
                    {formatSriLankaDate(row.new_return_date)}
                  </span>
                </div>

                <p className="mt-2 whitespace-pre-wrap break-words text-xs font-semibold text-slate-700 dark:text-slate-200">
                  {row.reason || 'No reason recorded.'}
                </p>

                <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[10px] text-slate-500 dark:text-slate-400">
                  <span>
                    Requested by{' '}
                    <span className="font-bold text-slate-700 dark:text-slate-200">
                      {row.requested_by_name || row.requester_name || '—'}
                    </span>
                  </span>
                  {row.reviewed_by_name && (
                    <span>
                      Reviewed by{' '}
                      <span className="font-bold text-slate-700 dark:text-slate-200">
                        {row.reviewed_by_name}
                      </span>{' '}
                      • {formatSriLankaDateTimeCompact(row.reviewed_at)}
                    </span>
                  )}
                </div>

                {row.review_note && (
                  <p className="mt-2 whitespace-pre-wrap break-words border-t border-slate-200/60 pt-2 text-[11px] font-semibold text-slate-600 dark:border-navy-700 dark:text-slate-300">
                    Review note: {row.review_note}
                  </p>
                )}
              </div>
            ))}
        </div>

        {/* Footer */}
        <div className="mt-6 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="cursor-pointer rounded-xl bg-[#4318FF] px-6 py-2.5 text-xs font-bold text-white shadow-md shadow-[#4318FF]/20 transition-all hover:bg-brand-600 active:scale-95"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
