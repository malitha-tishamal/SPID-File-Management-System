'use client';
import React from 'react';
import { FiAlertTriangle } from 'react-icons/fi';
import Modal from 'components/ui/Modal';
import Button from 'components/ui/Button';

/**
 * Confirmation dialog for destructive account actions
 * (disable / reject / delete) before the feedback modal fires.
 *
 * `tone="warning"` renders the orange glassmorphism treatment used by the
 * Section Management disable flow.
 */
export default function ConfirmActionModal({
  title,
  description,
  confirmLabel,
  tone = 'danger',
  loading = false,
  onConfirm,
  onCancel,
}: {
  title: string;
  description: string;
  confirmLabel: string;
  tone?: 'danger' | 'primary' | 'warning';
  loading?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const isWarning = tone === 'warning';

  const panelClassName = isWarning
    ? 'relative w-full max-w-sm overflow-hidden rounded-3xl border border-white/30 bg-white/80 bg-gradient-to-br from-orange-500/15 to-orange-400/25 p-6 text-center shadow-[0_24px_60px_-12px_rgba(249,115,22,0.45)] backdrop-blur-[20px] dark:border-white/15 dark:bg-navy-800/85 dark:from-orange-500/20 dark:to-orange-400/10'
    : 'w-full max-w-sm rounded-3xl border border-slate-100 bg-white p-6 text-center shadow-2xl dark:border-navy-700 dark:bg-navy-700';

  const iconClassName = isWarning
    ? 'bg-gradient-to-br from-orange-400 to-orange-500 text-white shadow-lg shadow-orange-500/40'
    : tone === 'danger'
      ? 'bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400'
      : 'bg-brand-50 text-[#4318FF] dark:bg-navy-600';

  return (
    <Modal
      open
      onClose={onCancel}
      busy={loading}
      labelledBy="confirm-action-title"
      describedBy="confirm-action-description"
      panelClassName={panelClassName}
    >
      {isWarning && (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -top-16 left-1/2 h-44 w-44 -translate-x-1/2 rounded-full bg-orange-300/40 blur-3xl dark:bg-orange-500/20"
        />
      )}

      <div className="relative">
        <div
          className={`mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full ${iconClassName}`}
        >
          <FiAlertTriangle className="h-6 w-6" aria-hidden="true" />
        </div>
        <h3
          id="confirm-action-title"
          className={`text-base font-bold ${
            isWarning ? 'text-slate-900 dark:text-white' : 'text-navy-700 dark:text-white'
          }`}
        >
          {title}
        </h3>
        <p
          id="confirm-action-description"
          className={`mt-2 text-sm leading-relaxed ${
            isWarning ? 'text-slate-700 dark:text-slate-200' : 'text-gray-500 dark:text-gray-400'
          }`}
        >
          {description}
        </p>

        <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row">
          <Button
            type="button"
            variant="cancel"
            onClick={onCancel}
            disabled={loading}
            className="flex-1"
          >
            Cancel
          </Button>
          <Button
            type="button"
            variant={isWarning ? 'warning' : tone === 'danger' ? 'danger' : 'primary'}
            onClick={onConfirm}
            loading={loading}
            loadingText="Working..."
            className="flex-1"
          >
            {confirmLabel}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
