'use client';

import React from 'react';
import { FiLogOut, FiX } from 'react-icons/fi';
import Modal from 'components/ui/Modal';
import Button from 'components/ui/Button';

export default function ConfirmLogoutModal({
  isOpen,
  loading = false,
  onConfirm,
  onCancel,
}: {
  isOpen: boolean;
  loading?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <Modal
      open={isOpen}
      onClose={onCancel}
      busy={loading}
      labelledBy="logout-confirm-title"
      overlayClassName="!z-[9999] bg-slate-900/40 backdrop-blur-[6px]"
      panelClassName="relative w-full max-w-[420px] overflow-hidden rounded-[32px] border border-white/60 bg-white/90 p-8 text-center shadow-2xl backdrop-blur-[24px] dark:border-navy-600/80 dark:bg-navy-800/90 animate-scaleUp"
    >
      {/* Ambient glow */}
      <div className="pointer-events-none absolute -top-14 left-1/2 h-52 w-52 -translate-x-1/2 rounded-full bg-rose-400/25 blur-3xl" />

      {/* Close × button */}
      <button
        type="button"
        onClick={onCancel}
        disabled={loading}
        aria-label="Close"
        className="absolute right-5 top-5 flex h-8 w-8 items-center justify-center rounded-full text-slate-400 hover:text-slate-600 hover:bg-slate-100/80 dark:hover:bg-navy-700 dark:hover:text-white transition-colors disabled:opacity-50 cursor-pointer"
      >
        <FiX className="h-4 w-4" />
      </button>

      {/* Icon */}
      <div className="relative mx-auto mb-6 flex items-center justify-center">
        <div className="absolute h-28 w-28 rounded-full bg-rose-500/20 blur-md" />
        <div className="flex h-20 w-20 items-center justify-center rounded-full bg-rose-100/70 dark:bg-rose-950/40">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-tr from-[#FF5B5B] to-[#FF4757] text-white shadow-lg shadow-red-500/40">
            <FiLogOut className="h-6 w-6" strokeWidth={2.5} />
          </div>
        </div>
      </div>

      {/* Title & description */}
      <h3
        id="logout-confirm-title"
        className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900 dark:text-white mb-2.5"
      >
        Confirm Logout
      </h3>
      <p className="mx-auto max-w-sm text-sm sm:text-base font-medium leading-relaxed text-slate-500 dark:text-slate-300">
        Are you sure you want to log out of your account?
      </p>

      {/* Action buttons */}
      <div className="mt-7 flex flex-col-reverse sm:flex-row items-stretch sm:items-center justify-center gap-3">
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
          variant="danger"
          onClick={onConfirm}
          loading={loading}
          loadingText="Logging out..."
          icon={<FiLogOut className="h-4 w-4" />}
          className="flex-1"
        >
          Logout
        </Button>
      </div>
    </Modal>
  );
}
