'use client';
import { useCallback, useState } from 'react';
import type { AdminUserRow } from 'types/auth';
import type { FeedbackState } from 'components/modals/ActionFeedbackModal';

export type AccountAction =
  | 'approve'
  | 'reject'
  | 'disable'
  | 'enable'
  | 'clear_lockout'
  | 'delete';

interface ActionMessages {
  successTitle: string;
  successDescription: (name: string) => string;
  failTitle: string;
  failDescription: string;
}

const MESSAGES: Record<AccountAction, ActionMessages> = {
  approve: {
    successTitle: 'Account Activated Successfully',
    successDescription: (n) =>
      `${n}'s account was successfully activated and access permissions are restored.`,
    failTitle: 'Account Activation Failed',
    failDescription: 'The user account cannot be activated at this time.',
  },
  enable: {
    successTitle: 'Account Activated Successfully',
    successDescription: (n) =>
      `${n}'s account was successfully activated and access permissions are restored.`,
    failTitle: 'Account Activation Failed',
    failDescription: 'The user account cannot be activated at this time.',
  },
  disable: {
    successTitle: 'Account Suspended Successfully',
    successDescription: (n) =>
      `${n}'s account has been suspended and all active sessions were revoked.`,
    failTitle: 'Account Disable Failed',
    failDescription: 'The account suspension request was unsuccessful.',
  },
  reject: {
    successTitle: 'Account Rejected',
    successDescription: (n) => `${n}'s registration has been declined by the administration.`,
    failTitle: 'Account Rejection Failed',
    failDescription: 'The rejection request was unsuccessful.',
  },
  clear_lockout: {
    successTitle: 'Lockout Cleared',
    successDescription: (n) => `${n} can now attempt to sign in again immediately.`,
    failTitle: 'Lockout Clear Failed',
    failDescription: 'The lockout could not be cleared at this time.',
  },
  delete: {
    successTitle: 'Account Permanently Expunged',
    successDescription: (n) =>
      `Credentials, cryptographic root keys, and records for ${n} have been irrevocably expunged from the departmental cluster.`,
    failTitle: 'Account Deletion Failed',
    failDescription: 'The account could not be deleted at this time.',
  },
};

function successFeedback(action: AccountAction, name: string, apiMessage?: string): FeedbackState {
  const m = MESSAGES[action];
  if (action === 'disable') {
    return { tone: 'info', icon: 'pause', title: m.successTitle, description: apiMessage || m.successDescription(name) };
  }
  if (action === 'delete') {
    return { tone: 'error', icon: 'x', title: m.successTitle, description: apiMessage || m.successDescription(name) };
  }
  if (action === 'reject') {
    return { tone: 'warning', icon: 'alert', title: m.successTitle, description: apiMessage || m.successDescription(name) };
  }
  return {
    tone: 'success',
    icon: action === 'clear_lockout' ? 'lock' : 'check',
    title: m.successTitle,
    description: apiMessage || m.successDescription(name),
  };
}

function failureFeedback(action: AccountAction, apiMessage?: string, status?: number, name?: string): FeedbackState {
  const m = MESSAGES[action];
  if (action === 'delete' && status === 403) {
    return {
      tone: 'restricted',
      icon: 'lock',
      badge: 'Action Restricted',
      title: 'Cannot Delete Account',
      description:
        apiMessage ||
        'The deletion request has been blocked because the account is still linked to active departmental records.',
    };
  }
  return {
    tone: 'error',
    icon: 'alert',
    title: m.failTitle,
    description: apiMessage || (name ? m.failDescription : m.failDescription),
  };
}

/**
 * Shared action pipeline for both directory pages: performs the PATCH/DELETE,
 * shows the matching feedback dialog (success / failure / restricted) and
 * gates destructive actions behind the confirm dialog.
 */
export function useAccountActions(reload: () => void) {
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<FeedbackState | null>(null);
  const [confirmTarget, setConfirmTarget] = useState<{
    acc: AdminUserRow;
    action: AccountAction;
  } | null>(null);

  const run = useCallback(
    async (acc: AdminUserRow, action: AccountAction) => {
      setConfirmTarget(null);
      setLoadingId(acc.id);
      const isDelete = action === 'delete';
      try {
        const res = await fetch(`/api/admin/users/${acc.id}`, {
          method: isDelete ? 'DELETE' : 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: isDelete ? undefined : JSON.stringify({ action }),
        });
        const json = await res.json().catch(() => null);
        if (res.ok && json?.ok) {
          setFeedback(successFeedback(action, acc.full_name, json.message));
          reload();
        } else {
          setFeedback(failureFeedback(action, json?.message, res.status, acc.full_name));
        }
      } catch {
        setFeedback({
          tone: 'error',
          icon: 'alert',
          title: MESSAGES[action].failTitle,
          description: 'Could not reach the server. Please check your connection and try again.',
        });
      } finally {
        setLoadingId(null);
      }
    },
    [reload]
  );

  /** Destructive actions go through the confirm dialog first. */
  const request = useCallback(
    (acc: AdminUserRow, action: AccountAction) => {
      if (action === 'disable' || action === 'reject' || action === 'delete') {
        setConfirmTarget({ acc, action });
      } else {
        void run(acc, action);
      }
    },
    [run]
  );

  /** Edit-modal save — returns true when the update succeeded. */
  const saveProfile = useCallback(
    async (
      acc: AdminUserRow,
      payload: { full_name: string; section_id: number | null; role?: string; status?: string }
    ): Promise<boolean> => {
      setLoadingId(acc.id);
      try {
        const res = await fetch(`/api/admin/users/${acc.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'update_profile', ...payload }),
        });
        const json = await res.json().catch(() => null);
        if (res.ok && json?.ok) {
          setFeedback({
            tone: 'success',
            icon: 'check',
            badge: 'Cryptographically Sealed',
            title: 'Profile Updated Successfully',
            description:
              json.message ||
              `${acc.full_name}'s profile details have been updated successfully. All changes have been verified and saved securely to the system.`,
          });
          reload();
          return true;
        }
        setFeedback({
          tone: 'error',
          icon: 'alert',
          title: 'Profile Update Failed',
          description:
            json?.message ||
            'The administrative update could not be committed due to an unresolvable database validation conflict.',
        });
        return false;
      } catch {
        setFeedback({
          tone: 'error',
          icon: 'alert',
          title: 'Profile Update Failed',
          description: 'Could not reach the server. Please check your connection and try again.',
        });
        return false;
      } finally {
        setLoadingId(null);
      }
    },
    [reload]
  );

  return { loadingId, feedback, setFeedback, request, run, confirmTarget, setConfirmTarget, saveProfile };
}
