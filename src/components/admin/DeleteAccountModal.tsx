'use client';
import React, { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FiAlertTriangle, FiTrash2, FiRotateCcw } from 'react-icons/fi';
import Modal from 'components/ui/Modal';
import Button from 'components/ui/Button';
import type { AdminUserRow } from 'types/auth';
import type { DeletePayload } from 'components/admin/useAccountActions';
import { attributedName } from 'utils/userDisplay';

/** Mirror of the server `DeletionImpact` (services/UserDeletionService) for the client. */
interface DeletionImpact {
  user: { full_name: string; email: string; role: string; is_deleted?: boolean };
  counts: {
    files: number;
    requests: number;
    approvals: number;
    notifications: number;
    auditLogs: number;
    checkouts: number;
  };
  activeCheckouts: Array<{ id: number; file_no: string; file_name: string; expected_return_date: string | null }>;
  pendingRequests: Array<{ id: number; file_no: string; file_name: string; request_date: string | null }>;
  isLastActiveAdmin: boolean;
  canDelete: boolean;
}

/**
 * Soft-delete confirmation. Shows what the account is linked to, states plainly
 * that files, requests and history are kept, and forces a decision on any
 * pending request before the account can be retired. Accounts holding issued
 * files, or the last active administrator, cannot be deleted at all.
 */
export default function DeleteAccountModal({
  acc,
  reassignCandidates,
  loading = false,
  onClose,
  onConfirm,
}: {
  acc: AdminUserRow;
  /** Approved, active staff the pending requests may be handed to. */
  reassignCandidates: AdminUserRow[];
  loading?: boolean;
  onClose: () => void;
  onConfirm: (payload: DeletePayload) => void;
}) {
  const { t } = useTranslation('accounts');
  const { t: tc } = useTranslation('common');

  const [impact, setImpact] = useState<DeletionImpact | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [pendingAction, setPendingAction] = useState<'reject' | 'reassign'>('reject');
  const [reassignTo, setReassignTo] = useState('');
  const [reason, setReason] = useState('');

  const name = attributedName(acc.full_name, tc('unknownUser'));
  const pendingCount = impact?.pendingRequests.length ?? 0;

  useEffect(() => {
    let cancelled = false;
    // eslint-disable-next-line no-void
    void (async () => {
      try {
        const res = await fetch(`/api/admin/users/${acc.id}`);
        const json = await res.json().catch(() => null);
        if (cancelled) return;
        if (res.ok && json?.ok) setImpact(json.impact as DeletionImpact);
        else setLoadError(json?.message || t('modals.deleteAccount.impactFailed'));
      } catch {
        if (!cancelled) setLoadError(t('modals.deleteAccount.impactFailed'));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [acc.id, t]);

  // Deleting is only possible once every pending request has a decision.
  const blocked =
    !!impact && (impact.activeCheckouts.length > 0 || impact.isLastActiveAdmin);
  const needsPendingDecision = pendingCount > 0;
  const reassignReady = pendingAction === 'reject' || reassignTo.length > 0;
  const canSubmit = !!impact && !blocked && impact.canDelete && (!needsPendingDecision || reassignReady);

  const kept = useMemo(
    () => [
      { label: t('modals.deleteAccount.keptFiles'), value: impact?.counts.files ?? 0 },
      { label: t('modals.deleteAccount.keptRequests'), value: impact?.counts.requests ?? 0 },
      { label: t('modals.deleteAccount.keptApprovals'), value: impact?.counts.approvals ?? 0 },
      { label: t('modals.deleteAccount.keptCheckouts'), value: impact?.counts.checkouts ?? 0 },
      { label: t('modals.deleteAccount.keptNotifications'), value: impact?.counts.notifications ?? 0 },
      { label: t('modals.deleteAccount.keptLogs'), value: impact?.counts.auditLogs ?? 0 },
    ],
    [impact, t]
  );

  const submit = () => {
    onConfirm({
      pendingAction: needsPendingDecision ? pendingAction : undefined,
      reassignToUserId:
        needsPendingDecision && pendingAction === 'reassign' ? reassignTo : undefined,
      reason: reason.trim() || undefined,
    });
  };

  return (
    <Modal open onClose={onClose} busy={loading} labelledBy="delete-account-title" panelClassName="w-full max-w-lg rounded-3xl border border-slate-100 bg-white p-6 shadow-2xl dark:border-navy-700 dark:bg-navy-700">
      <div className="flex items-start gap-3">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400">
          <FiTrash2 className="h-5 w-5" aria-hidden="true" />
        </div>
        <div className="min-w-0">
          <h3 id="delete-account-title" className="text-base font-bold text-navy-700 dark:text-white">
            {t('modals.deleteAccount.title')}
          </h3>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            {t('modals.deleteAccount.description', { name })}
          </p>
        </div>
      </div>

      {loadError && (
        <p className="mt-4 rounded-xl bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
          {loadError}
        </p>
      )}

      {!impact && !loadError && (
        <p role="status" className="mt-4 text-xs font-semibold text-gray-500 dark:text-gray-400">
          {t('modals.deleteAccount.loadingImpact')}
        </p>
      )}

      {impact && (
        <>
          {blocked && (
            <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 p-4 dark:border-red-800 dark:bg-red-950/40">
              <p className="flex items-center gap-2 text-sm font-bold text-red-800 dark:text-red-300">
                <FiAlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" />
                {impact.isLastActiveAdmin
                  ? t('modals.deleteAccount.blockedLastAdmin')
                  : t('modals.deleteAccount.blockedCheckouts', { count: impact.activeCheckouts.length })}
              </p>
              {impact.activeCheckouts.length > 0 && (
                <ul className="mt-2 max-h-32 space-y-1 overflow-y-auto text-xs font-semibold text-red-900 dark:text-red-200">
                  {impact.activeCheckouts.map((row) => (
                    <li key={row.id}>
                      {row.file_no} — {row.file_name}
                      {row.expected_return_date
                        ? ` (${t('modals.deleteAccount.due', { date: row.expected_return_date.slice(0, 10) })})`
                        : ''}
                    </li>
                  ))}
                </ul>
              )}
              <p className="mt-2 text-xs text-red-700 dark:text-red-300">
                {t('modals.deleteAccount.blockedHint')}
              </p>
            </div>
          )}

          <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-navy-600 dark:bg-navy-800">
            <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-gray-400">
              {t('modals.deleteAccount.keptHeading')}
            </p>
            <ul className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs font-semibold text-slate-700 dark:text-gray-300">
              {kept.map((row) => (
                <li key={row.label} className="flex items-center justify-between gap-2">
                  <span className="min-w-0 break-words">{row.label}</span>
                  <span className="shrink-0 rounded-full bg-white px-2 py-0.5 text-[11px] font-extrabold text-[#4318FF] dark:bg-navy-700 dark:text-brand-300">
                    {row.value}
                  </span>
                </li>
              ))}
            </ul>
            <p className="mt-2 text-[11px] leading-relaxed text-slate-600 dark:text-gray-400">
              {t('modals.deleteAccount.keptFootnote', { name })}
            </p>
          </div>

          {needsPendingDecision && !blocked && (
            <fieldset className="mt-4 rounded-2xl border border-amber-300 bg-amber-50 p-4 dark:border-amber-700 dark:bg-amber-950/30">
              <legend className="px-1 text-xs font-bold text-amber-900 dark:text-amber-300">
                {t('modals.deleteAccount.pendingHeading', { count: pendingCount })}
              </legend>
              <div className="space-y-2">
                <label className="flex items-start gap-2 text-xs font-semibold text-amber-900 dark:text-amber-200">
                  <input
                    type="radio"
                    name="pending-action"
                    checked={pendingAction === 'reject'}
                    onChange={() => setPendingAction('reject')}
                    className="mt-0.5"
                  />
                  <span>{t('modals.deleteAccount.pendingReject')}</span>
                </label>
                <label className="flex items-start gap-2 text-xs font-semibold text-amber-900 dark:text-amber-200">
                  <input
                    type="radio"
                    name="pending-action"
                    checked={pendingAction === 'reassign'}
                    onChange={() => setPendingAction('reassign')}
                    className="mt-0.5"
                  />
                  <span>{t('modals.deleteAccount.pendingReassign')}</span>
                </label>
              </div>

              {pendingAction === 'reassign' && (
                <label className="mt-3 block">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-amber-900 dark:text-amber-300">
                    {t('modals.deleteAccount.reassignTo')}
                  </span>
                  <select
                    value={reassignTo}
                    onChange={(e) => setReassignTo(e.target.value)}
                    className="mt-1 w-full rounded-xl border border-amber-300 bg-white px-3 py-2 text-xs font-semibold text-slate-800 dark:border-amber-800 dark:bg-navy-800 dark:text-gray-200"
                  >
                    <option value="">{t('modals.deleteAccount.reassignPlaceholder')}</option>
                    {reassignCandidates.map((staff) => (
                      <option key={staff.id} value={staff.id}>
                        {attributedName(staff.full_name, tc('unknownUser'))}
                        {staff.section_name ? ` — ${staff.section_name}` : ''}
                      </option>
                    ))}
                  </select>
                </label>
              )}
            </fieldset>
          )}

          <label className="mt-4 block">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-gray-400">
              {t('modals.deleteAccount.reasonLabel')}
            </span>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value.slice(0, 500))}
              rows={2}
              placeholder={t('modals.deleteAccount.reasonPlaceholder')}
              className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-800 dark:border-navy-600 dark:bg-navy-800 dark:text-gray-200"
            />
          </label>
        </>
      )}

      <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row">
        <Button type="button" variant="cancel" onClick={onClose} disabled={loading} className="flex-1">
          {tc('buttons.cancel')}
        </Button>
        <Button
          type="button"
          variant={blocked ? 'cancel' : 'danger'}
          onClick={submit}
          disabled={!canSubmit || loading}
          className="flex-1"
        >
          {loading ? (
            <span className="flex items-center justify-center gap-2">
              <FiRotateCcw className="h-4 w-4 animate-spin" aria-hidden="true" />
              {t('modals.working')}
            </span>
          ) : (
            t('modals.deleteAccount.confirm')
          )}
        </Button>
      </div>
    </Modal>
  );
}
