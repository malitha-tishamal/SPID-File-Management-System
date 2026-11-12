'use client';

import React from 'react';
import { FiAlertTriangle } from 'react-icons/fi';
import Modal from 'components/ui/Modal';
import Button from 'components/ui/Button';

interface StaffConfirmDialogProps {
  open: boolean;
  title: string;
  description: string;
  cancelLabel: string;
  confirmLabel: string;
  confirmVariant?: 'primary' | 'danger' | 'warning' | 'secondary' | 'cancel';
  loading?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}

/** Staff-only confirmation dialog built on the shared accessible Modal/Button. */
export default function StaffConfirmDialog({
  open,
  title,
  description,
  cancelLabel,
  confirmLabel,
  confirmVariant = 'primary',
  loading = false,
  onCancel,
  onConfirm,
}: StaffConfirmDialogProps) {
  return (
    <Modal
      open={open}
      onClose={onCancel}
      busy={loading}
      labelledBy="staff-confirm-title"
      describedBy="staff-confirm-description"
      panelClassName="w-full max-w-sm rounded-3xl border border-slate-100 bg-white p-6 text-center shadow-2xl dark:border-navy-700 dark:bg-navy-700"
    >
      <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-amber-100 text-amber-600 dark:bg-amber-900/30 dark:text-amber-300">
        <FiAlertTriangle className="h-6 w-6" aria-hidden="true" />
      </div>
      <h3 id="staff-confirm-title" className="text-base font-bold text-navy-700 dark:text-white">
        {title}
      </h3>
      <p id="staff-confirm-description" className="mt-2 text-sm leading-relaxed text-gray-500 dark:text-gray-400">
        {description}
      </p>
      <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row">
        <Button type="button" variant="secondary" onClick={onCancel} disabled={loading} className="flex-1">
          {cancelLabel}
        </Button>
        <Button
          type="button"
          variant={confirmVariant}
          onClick={onConfirm}
          loading={loading}
          loadingText={confirmLabel}
          className="flex-1"
        >
          {confirmLabel}
        </Button>
      </div>
    </Modal>
  );
}
