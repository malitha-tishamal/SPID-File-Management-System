'use client';

import React from 'react';
import { useRouter } from 'next/navigation';
import {
  FiAlertTriangle,
  FiArrowUp,
  FiCheckCircle,
  FiFlag,
  FiX,
} from 'react-icons/fi';
import Modal from 'components/ui/Modal';
import Button from 'components/ui/Button';
import type { StaffRequestPriority } from 'lib/staffRequests';
import {
  REQUEST_CONFLICT_MESSAGES,
  type OwnPendingRequest,
} from 'lib/staffRequestPriority';

export type RequestPriorityDialogState =
  | { kind: 'duplicate'; existing: OwnPendingRequest }
  | { kind: 'blocked'; existing: OwnPendingRequest }
  | {
      kind: 'upgrade';
      existing: OwnPendingRequest;
      file: { id: number; file_no: string; file_name: string };
      requestedPriority: StaffRequestPriority;
    }
  | { kind: 'success'; fileNo: string };

const priorityLabel: Record<StaffRequestPriority, string> = {
  HIGH: 'High',
  NORMAL: 'Normal',
  LOW: 'Low',
};

const priorityChipClass: Record<StaffRequestPriority, string> = {
  HIGH: 'bg-rose-100 text-rose-700 border-rose-200 dark:bg-rose-950/50 dark:text-rose-300 dark:border-rose-800',
  NORMAL:
    'bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-950/50 dark:text-amber-300 dark:border-amber-800',
  LOW: 'bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-950/50 dark:text-blue-300 dark:border-blue-800',
};

function PriorityChip({ priority }: { priority: StaffRequestPriority }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-black ${priorityChipClass[priority]}`}
    >
      <FiFlag aria-hidden="true" className="h-3 w-3" />
      {priorityLabel[priority]}
    </span>
  );
}

interface RequestPriorityDialogProps {
  state: RequestPriorityDialogState | null;
  processing?: boolean;
  onClose: () => void;
  onConfirmUpgrade: () => void;
}

/**
 * One dialog for every outcome of the duplicate/priority rules: an identical
 * pending request, a blocked lower priority, the upgrade confirmation, and
 * the upgrade success notice. Rendered through the shared accessible Modal.
 */
export default function RequestPriorityDialog({
  state,
  processing = false,
  onClose,
  onConfirmUpgrade,
}: RequestPriorityDialogProps) {
  const router = useRouter();

  const viewMyRequests = () => {
    onClose();
    router.push('/staff/your-requests?tab=pending');
  };

  if (!state) return null;

  const isSuccess = state.kind === 'success';
  const isUpgrade = state.kind === 'upgrade';

  const title = isSuccess
    ? 'Priority Upgraded Successfully'
    : state.kind === 'duplicate'
      ? 'Request Already Exists'
      : state.kind === 'blocked'
        ? 'Active Request Already Exists'
        : 'Upgrade Request Priority?';

  const description = isSuccess
    ? REQUEST_CONFLICT_MESSAGES.upgraded
    : state.kind === 'duplicate'
      ? REQUEST_CONFLICT_MESSAGES.duplicate
      : state.kind === 'blocked'
        ? REQUEST_CONFLICT_MESSAGES.lowerPriority
        : REQUEST_CONFLICT_MESSAGES.upgrade;

  const icon = isSuccess ? (
    <span className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-300">
      <FiCheckCircle className="h-6 w-6" aria-hidden="true" />
    </span>
  ) : (
    <span className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-50 text-amber-600 ring-1 ring-amber-200/70 dark:bg-amber-950/40 dark:text-amber-300 dark:ring-amber-900/60">
      <FiAlertTriangle className="h-6 w-6" aria-hidden="true" />
    </span>
  );

  return (
    <Modal
      open
      onClose={processing ? () => undefined : onClose}
      busy={processing}
      labelledBy="request-priority-dialog-title"
      describedBy="request-priority-dialog-description"
      panelClassName="w-full max-w-md rounded-3xl border border-slate-100 bg-white p-6 text-center shadow-2xl dark:border-navy-700 dark:bg-navy-800 sm:p-7"
    >
      <div className="relative">
        <button
          type="button"
          onClick={onClose}
          disabled={processing}
          aria-label="Close dialog"
          className="absolute -right-1 -top-1 cursor-pointer rounded-full p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600 disabled:cursor-not-allowed disabled:opacity-50 dark:hover:bg-navy-700 dark:hover:text-white"
        >
          <FiX className="h-4 w-4" />
        </button>

        {icon}

        <h3
          id="request-priority-dialog-title"
          className="text-base font-black tracking-tight text-slate-800 dark:text-white"
        >
          {title}
        </h3>
        <p
          id="request-priority-dialog-description"
          className="mt-2 text-xs leading-relaxed text-slate-600 dark:text-slate-300"
        >
          {description}
        </p>

        {state.kind === 'upgrade' && (
          <div className="mt-4 rounded-2xl border border-slate-100 bg-slate-50/80 p-3.5 text-left dark:border-navy-700 dark:bg-navy-900/60">
            <dl className="grid grid-cols-[auto,1fr] gap-x-3 gap-y-2 text-[11px]">
              <dt className="font-bold text-slate-400">File Number</dt>
              <dd className="truncate font-bold text-slate-800 dark:text-white">
                {state.file.file_no}
              </dd>
              <dt className="font-bold text-slate-400">File Name</dt>
              <dd
                className="truncate font-semibold text-slate-700 dark:text-slate-200"
                title={state.file.file_name}
              >
                {state.file.file_name}
              </dd>
              <dt className="font-bold text-slate-400">Current Priority</dt>
              <dd>
                <PriorityChip priority={state.existing.priority} />
              </dd>
              <dt className="font-bold text-slate-400">New Priority</dt>
              <dd className="flex items-center gap-2">
                <FiArrowUp
                  aria-hidden="true"
                  className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400"
                />
                <PriorityChip priority={state.requestedPriority} />
              </dd>
            </dl>
          </div>
        )}

        <div className="mt-6 flex flex-col-reverse gap-2.5 sm:flex-row">
          {isUpgrade ? (
            <>
              <Button
                variant="secondary"
                onClick={onClose}
                disabled={processing}
                fullWidth
              >
                Keep Existing Request
              </Button>
              <Button
                variant="warning"
                onClick={onConfirmUpgrade}
                loading={processing}
                loadingText="Submitting..."
                fullWidth
              >
                Cancel Previous &amp; Submit New
              </Button>
            </>
          ) : (
            <>
              <Button
                variant="secondary"
                onClick={onClose}
                disabled={processing}
                fullWidth
              >
                Close
              </Button>
              <Button variant="primary" onClick={viewMyRequests} fullWidth>
                View My Requests
              </Button>
            </>
          )}
        </div>
      </div>
    </Modal>
  );
}
