'use client';

import React, { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useDialogBehavior } from 'lib/dialogBehavior';
import { FiAlertCircle, FiCalendar, FiUpload, FiX } from 'react-icons/fi';
import { formatSriLankaDate } from 'lib/datetime';
import AttributedUser from 'components/ui/AttributedUser';
import type { IssuedFileRow } from './issuedTypes';

export interface ExtendPayload {
  new_return_date: string;
  reason: string;
}

/**
 * Glassmorphism extend dialog. Field state lives here so text stays typed when
 * the request fails; the dialog only unmounts after the backend accepts it.
 */
export default function ExtendReturnModal({
  file,
  loading = false,
  onConfirm,
  onCancel,
}: {
  file: IssuedFileRow | null;
  loading?: boolean;
  /** Resolves to an error message to show inline, or `null` when it succeeded. */
  onConfirm: (payload: ExtendPayload) => Promise<string | null>;
  onCancel: () => void;
}) {
  const { t } = useTranslation('issued');
  const [newDate, setNewDate] = useState('');
  const [reason, setReason] = useState('');
  const [dateError, setDateError] = useState('');
  const [reasonError, setReasonError] = useState('');
  const [serverError, setServerError] = useState('');
  const reasonRef = useRef<HTMLTextAreaElement>(null);

  const currentDate = (file?.expected_return_date || '').slice(0, 10);

  useEffect(() => {
    setNewDate('');
    setReason('');
    setDateError('');
    setReasonError('');
    setServerError('');
  }, [file?.id]);

  // Escape is ignored while the extension request is in flight.
  const panelRef = useDialogBehavior<HTMLDivElement>(file !== null, () => {
    if (!loading) onCancel();
  });

  // Autocorrect / IME commits can change the DOM node without firing onChange.
  const syncReasonFromDom = (e: React.SyntheticEvent<HTMLTextAreaElement>) => {
    const dom = e.currentTarget.value;
    if (dom !== reason) setReason(dom);
  };

  if (!file) return null;

  const validate = (): boolean => {
    let valid = true;
    if (!newDate) {
      setDateError(t('validation.dateRequired'));
      valid = false;
    } else if (currentDate && newDate <= currentDate) {
      setDateError(
        t('validation.dateMustBeLater', {
          date: formatSriLankaDate(currentDate),
        }),
      );
      valid = false;
    } else {
      setDateError('');
    }

    if (!reason.trim()) {
      setReasonError(t('validation.reasonRequired'));
      valid = false;
    } else {
      setReasonError('');
    }
    return valid;
  };

  const handleSubmit = async () => {
    setServerError('');
    if (!validate()) return;
    const message = await onConfirm({
      new_return_date: newDate,
      reason: reason.trim(),
    });
    if (message) setServerError(message);
  };

  return (
    <div
      className="fixed inset-0 z-[95] flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-[6px]"
      onClick={() => !loading && onCancel()}
    >
      <div
        ref={panelRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby="extend-return-title"
        className="animate-in fade-in zoom-in-95 duration-150 w-full max-w-md rounded-3xl border border-slate-100/80 bg-white/85 p-6 shadow-2xl backdrop-blur-xl dark:border-navy-700/80 dark:bg-navy-800/85"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-slate-100 pb-3 dark:border-navy-700">
          <div className="flex items-center gap-2.5">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-[#F4F2FF] text-[#4318FF] dark:bg-brand-900/40 dark:text-brand-300">
              <FiUpload className="h-5 w-5" />
            </div>
            <div>
              <h3
                id="extend-return-title"
                className="text-base font-bold text-navy-800 dark:text-white"
              >
                {t('modals.extend.title')}
              </h3>
              <p className="text-xs text-slate-400">{t('modals.extend.subtitle')}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onCancel}
            disabled={loading}
            className="cursor-pointer rounded-xl p-2 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600 disabled:opacity-50 dark:hover:bg-navy-700 dark:hover:text-white"
            aria-label={t('common:buttons.cancel')}
          >
            <FiX className="h-5 w-5" />
          </button>
        </div>

        <div className="mt-4 rounded-2xl border border-slate-100 bg-slate-50/80 p-4 text-xs dark:border-navy-700 dark:bg-navy-900/50">
          <div className="flex flex-col gap-1.5">
            <div className="flex justify-between gap-3">
              <span className="font-semibold text-slate-400">{t('modals.extend.file')}</span>
              <span
                className="max-w-[240px] break-words text-right font-mono font-bold text-slate-700 dark:text-slate-300 [overflow-wrap:anywhere]"
                title={file.file_no}
              >
                {file.file_no}
              </span>
            </div>
            <div className="flex justify-between gap-3">
              <span className="font-semibold text-slate-400">{t('modals.extend.staffMember')}</span>
              <span className="text-right font-bold text-slate-800 dark:text-white">
                <AttributedUser
                  name={file.requester_name}
                  deleted={file.requester_is_deleted}
                />
              </span>
            </div>
            <div className="flex justify-between gap-3">
              <span className="font-semibold text-slate-400">
                {t('modals.extend.currentExpected')}
              </span>
              <span className="text-right font-bold text-[#4318FF] dark:text-brand-300">
                {formatSriLankaDate(file.expected_return_date)}
              </span>
            </div>
            {file.is_extended && (
              <div className="flex justify-between gap-3">
                <span className="font-semibold text-slate-400">{t('modals.extend.originalDate')}</span>
                <span className="text-right font-bold text-rose-600 line-through dark:text-rose-400">
                  {formatSriLankaDate(file.original_return_date)}
                </span>
              </div>
            )}
          </div>

          <div className="mt-4">
            <label
              htmlFor="extend-new-date"
              className="mb-1.5 block text-[10px] font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300"
            >
              {t('modals.extend.newDateLabel')} <span className="text-rose-500">*</span>
            </label>
            <div className="relative">
              <FiCalendar className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                id="extend-new-date"
                type="date"
                value={newDate}
                min={currentDate || undefined}
                onChange={(e) => {
                  setNewDate(e.target.value);
                  setDateError('');
                  setServerError('');
                }}
                className={`h-9 w-full rounded-xl border bg-white pl-9 pr-3 text-xs font-semibold text-slate-800 outline-none transition-all dark:bg-navy-900 dark:text-white ${
                  dateError
                    ? 'border-rose-400 focus:border-rose-500'
                    : 'border-slate-200 focus:border-[#4318FF] dark:border-navy-700'
                }`}
              />
            </div>
            {dateError && (
              <p role="alert" className="mt-1.5 text-[11px] font-bold text-rose-600 dark:text-rose-400">
                {dateError}
              </p>
            )}
          </div>

          <div className="mt-3.5">
            <label
              htmlFor="extend-reason"
              className="mb-1.5 block text-[10px] font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300"
            >
              {t('modals.extend.reasonLabel')} <span className="text-rose-500">*</span>
            </label>
            <textarea
              id="extend-reason"
              ref={reasonRef}
              rows={3}
              maxLength={1000}
              value={reason}
              onChange={(e) => {
                setReason(e.target.value);
                setReasonError('');
                setServerError('');
              }}
              onBlur={syncReasonFromDom}
              onKeyUp={syncReasonFromDom}
              placeholder={t('modals.extend.reasonPlaceholder')}
              className={`w-full resize-y rounded-xl border bg-white p-2.5 text-xs text-slate-800 outline-none transition-all placeholder:text-slate-400 dark:bg-navy-900 dark:text-white ${
                reasonError
                  ? 'border-rose-400 focus:border-rose-500'
                  : 'border-slate-200 focus:border-[#4318FF] dark:border-navy-700'
              }`}
            />
            <div className="mt-1 flex items-start justify-between gap-3">
              {reasonError ? (
                <p role="alert" className="text-[11px] font-bold text-rose-600 dark:text-rose-400">
                  {reasonError}
                </p>
              ) : (
                <span />
              )}
              <span className="text-[10px] text-slate-400">{reason.length}/1000</span>
            </div>
          </div>

          {serverError && (
            <div className="mt-3 flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 dark:border-rose-900 dark:bg-rose-950/30">
              <FiAlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-rose-600 dark:text-rose-400" />
              <p className="whitespace-pre-wrap text-[11px] font-bold text-rose-700 dark:text-rose-300">
                {serverError}
              </p>
            </div>
          )}
        </div>

        <div className="mt-6 flex gap-3">
          <button
            type="button"
            onClick={onCancel}
            disabled={loading}
            className="flex-1 cursor-pointer rounded-xl border border-slate-200 bg-white/80 py-2.5 text-xs font-bold text-slate-600 transition-colors hover:bg-slate-50 disabled:opacity-50 dark:border-navy-600 dark:bg-navy-700 dark:text-slate-300"
          >
            {t('common:buttons.cancel')}
          </button>
          <button
            type="button"
            onClick={() => void handleSubmit()}
            disabled={loading}
            className="inline-flex flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-xl bg-[#4318FF] py-2.5 text-xs font-bold text-white shadow-md shadow-[#4318FF]/25 transition-all hover:bg-[#3311CC] active:scale-95 disabled:opacity-60"
          >
            {loading ? (
              <>
                <span className="h-3 w-3 animate-spin rounded-full border-2 border-white border-t-transparent" />
                <span>{t('common:feedback.saving')}</span>
              </>
            ) : (
              <>
                <FiUpload className="h-4 w-4" />
                <span>{t('modals.extend.confirm')}</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
