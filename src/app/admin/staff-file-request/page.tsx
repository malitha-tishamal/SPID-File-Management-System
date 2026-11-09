'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import { TABLE_ACTIONS_CLASS, TABLE_BODY_CLASS, TABLE_GROUP_BREAK_CLASS, TABLE_HEAD_CLASS, TABLE_HIGHLIGHT_CLASS, tableRowClass } from 'lib/tableStyles';
import ReactDOM from 'react-dom';
import {
  FiAlertCircle,
  FiCalendar,
  FiCheck,
  FiCheckCircle,
  FiClock,
  FiEye,
  FiFileText,
  FiFlag,
  FiInfo,
  FiMapPin,
  FiRefreshCw,
  FiShield,
  FiUser,
  FiX,
  FiXCircle,
} from 'react-icons/fi';
import { useToast } from 'components/toast/ToastContext';
import CompetingBadge from 'components/requests/CompetingBadge';
import RequestFilterBar from 'components/admin/requests/RequestFilterBar';
import {
  getCompetingGroup,
  getCompetingGroupKey,
  getCompetingInfo,
  getCompetingRowClasses,
  getCompetingRowState,
  sortByCompetingGroups,
} from 'lib/competing-requests';
import {
  matchesRequestSearch,
  parsePriorityFilter,
  sanitizeRequestSearch,
  type StaffRequestPriorityFilter,
} from 'lib/staffRequests';
import { getSupabaseBrowserClient } from 'config/supabase/client';
import TableLoadingProgressBar from 'components/admin/files/TableLoadingProgressBar';
import { useDialogBehavior } from 'lib/dialogBehavior';
import { formatSriLankaDate, formatSriLankaDateTime } from 'lib/datetime';
import {
  clearQueryParam,
  parseRecordId,
  readQueryParam,
  setQueryParam,
} from 'lib/deep-link';
import AttributedUser from 'components/ui/AttributedUser';
import { attributedNameText, isReservedDeletedEmail } from 'utils/userDisplay';

type RequestStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED';
type RequestPriority = 'HIGH' | 'NORMAL' | 'LOW';
type RequestTab = 'pending' | 'rejected' | 'extensions';

type StaffRequest = {
  id: number;
  file_id?: number;
  file_no: string;
  file_name: string;
  section_name: string;
  storage_location: string;
  requester_name: string;
  requester_email: string;
  requester_role?: string;
  requester_section: string | null;
  request_date: string;
  duration_days: number;
  admin_notes: string | null;
  cancellation_reason?: string | null;
  priority: RequestPriority;
  status: RequestStatus;
  reviewed_by?: string | null;
  reviewed_at?: string | null;
  reviewer_name?: string | null;
  reviewer_email?: string | null;
  /** Soft-delete markers (migration 0027); undefined on older deployments. */
  requester_is_deleted?: boolean;
  reviewer_is_deleted?: boolean;
  expected_return_date?: string | null;
  returned_at?: string | null;
  created_at: string;
};

type ExtensionStatus = 'PENDING' | 'APPROVED' | 'REJECTED';

type ExtensionRequest = {
  id: number;
  request_id: number;
  file_no: string;
  file_name: string;
  previous_return_date: string;
  new_return_date: string;
  reason: string;
  status: ExtensionStatus;
  requested_by_name: string;
  requester_name?: string | null;
  requester_section?: string | null;
  reviewed_by_name?: string | null;
  /** Soft-delete markers from listExtensions; undefined on older deployments. */
  requester_is_deleted?: boolean;
  reviewer_is_deleted?: boolean;
  reviewed_at?: string | null;
  review_note?: string | null;
  created_at: string;
};

const priorityStyle: Record<
  RequestPriority,
  { label: string; className: string; badgeClass: string }
> = {
  HIGH: {
    label: 'common:priority.HIGH',
    className: 'text-red-700 dark:text-red-400',
    badgeClass:
      'bg-rose-50 text-red-800 border border-rose-300 dark:bg-rose-900 dark:text-rose-50 dark:border-rose-700',
  },
  NORMAL: {
    label: 'common:priority.NORMAL',
    className: 'text-orange-700 dark:text-orange-400',
    badgeClass:
      'bg-amber-50 text-orange-800 border border-amber-300 dark:bg-amber-900 dark:text-amber-50 dark:border-amber-700',
  },
  LOW: {
    label: 'common:priority.LOW',
    className: 'text-slate-700 dark:text-slate-300',
    badgeClass:
      'bg-slate-100 text-slate-800 border border-slate-300 dark:bg-slate-700 dark:text-slate-50 dark:border-slate-500',
  },
};

const statusClass: Record<RequestStatus, string> = {
  PENDING:
    'bg-amber-100 text-amber-900 dark:bg-amber-800 dark:text-amber-50 border border-amber-300 dark:border-amber-600',
  APPROVED:
    'bg-emerald-100 text-emerald-900 dark:bg-emerald-800 dark:text-emerald-50 border border-emerald-300 dark:border-emerald-600',
  REJECTED:
    'bg-rose-100 text-rose-900 dark:bg-rose-900 dark:text-rose-50 border border-rose-300 dark:border-rose-700',
  CANCELLED:
    'bg-slate-100 text-slate-800 dark:bg-slate-700 dark:text-slate-50 border border-slate-300 dark:border-slate-500',
};

function getLocationParts(location: string): string[] {
  return location
    .split(/\s+—\s+/)
    .map((part) => part.trim())
    .filter(Boolean);
}

// Priority numeric weight lives in `lib/staffRequestPriority`; the competing
// ranking and its row styling live in `lib/competing-requests`, shared with the
// staff views and the approve API.

/** Typing in the search box should not re-filter on every keystroke. */
const SEARCH_DEBOUNCE_MS = 300;

/** Realtime events arrive in bursts; one reload per burst keeps the table cheap. */
const REALTIME_REFRESH_DEBOUNCE_MS = 1000;

/** The live issuance blocking an approval, as reported by the server. */
type CurrentIssuance = {
  request_id: number;
  file_no: string;
  file_name: string;
  holder_id?: string;
  holder_name: string;
  issued_at: string | null;
  expected_return_date: string | null;
};

export default function AdminStaffFileRequestPage() {
  const { t } = useTranslation('staffRequests');
  const { showToast } = useToast();
  const [activeTab, setActiveTab] = useState<RequestTab>('pending');
  // Filter state. `searchInput` is what the box holds while typing; `search` is
  // the debounced value the list filters on, so a refresh never disturbs it.
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [priorityFilter, setPriorityFilter] =
    useState<StaffRequestPriorityFilter>('ALL');
  const [groupByFile, setGroupByFile] = useState(false);
  const [requests, setRequests] = useState<StaffRequest[]>([]);
  const [loading, setLoading] = useState(true);
  /**
   * A reload after the first successful one keeps the current rows on screen;
   * this flag is what tells the table it is showing slightly old data.
   */
  const [refreshing, setRefreshing] = useState(false);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [error, setError] = useState('');

  // Rejection modal state
  const [rejectionRequest, setRejectionRequest] = useState<StaffRequest | null>(
    null,
  );
  const [rejectionNote, setRejectionNote] = useState('');
  const [rejectionError, setRejectionError] = useState('');

  // "See Details" modal state
  const [selectedDetailRequest, setSelectedDetailRequest] =
    useState<StaffRequest | null>(null);

  // Approval conflict modal state (when approving a file with competing requests)
  const [conflictApproval, setConflictApproval] = useState<{
    target: StaffRequest;
    competingRequests: StaffRequest[];
  } | null>(null);
  const [approvingWithConflict, setApprovingWithConflict] = useState(false);

  // Simple approval confirmation (non-competing requests)
  const [approvalTarget, setApprovalTarget] = useState<StaffRequest | null>(null);

  // Server-side availability block: the file is still issued to someone else.
  const [issuedBlock, setIssuedBlock] = useState<{
    issuance: CurrentIssuance | null;
    blockedFileNo: string;
  } | null>(null);

  // Return-date extension requests awaiting a decision
  const [extensions, setExtensions] = useState<ExtensionRequest[]>([]);
  const [extensionBusyId, setExtensionBusyId] = useState<number | null>(null);
  const [extensionError, setExtensionError] = useState('');
  const [extensionDecision, setExtensionDecision] = useState<{
    target: ExtensionRequest;
    status: 'APPROVED' | 'REJECTED';
  } | null>(null);
  const [extensionNote, setExtensionNote] = useState('');
  const [extensionNoteError, setExtensionNoteError] = useState('');
  const [extensionDetail, setExtensionDetail] = useState<ExtensionRequest | null>(null);
  const [extensionsLoaded, setExtensionsLoaded] = useState(false);
  const [extensionsLoading, setExtensionsLoading] = useState(true);

  // Fetch ordering guards: the response of a superseded request is discarded.
  const requestTicket = useRef(0);
  const extensionTicket = useRef(0);
  const hasLoadedRequests = useRef(false);

  // Requests already announced by a realtime toast, so a reconnect that replays
  // an event can never show the admin the same "new request" notice twice.
  const announcedRequestIds = useRef<Set<number>>(new Set());

  // Notification deep links: ?tab=extensions&extension=4, ?tab=pending&request=12
  const [highlightRequestId, setHighlightRequestId] = useState<number | null>(null);
  const [highlightExtensionId, setHighlightExtensionId] = useState<number | null>(null);
  const [deepLinkNotice, setDeepLinkNotice] = useState('');
  const requestLinkHandled = useRef(false);
  const extensionLinkHandled = useRef(false);

  // Escape-to-close and focus handoff for the seven dialogs rendered below.
  const rejectionPanelRef = useDialogBehavior<HTMLFormElement>(
    Boolean(rejectionRequest),
    () => {
      setRejectionRequest(null);
      setRejectionError('');
    },
  );
  const conflictPanelRef = useDialogBehavior<HTMLDivElement>(
    Boolean(conflictApproval),
    () => {
      if (!approvingWithConflict) setConflictApproval(null);
    },
  );
  const detailPanelRef = useDialogBehavior<HTMLDivElement>(
    Boolean(selectedDetailRequest),
    () => setSelectedDetailRequest(null),
  );
  const approvalPanelRef = useDialogBehavior<HTMLDivElement>(
    Boolean(approvalTarget),
    () => {
      if (busyId === null) setApprovalTarget(null);
    },
  );
  const issuedBlockPanelRef = useDialogBehavior<HTMLDivElement>(
    Boolean(issuedBlock),
    () => setIssuedBlock(null),
  );
  const extensionDecisionPanelRef = useDialogBehavior<HTMLFormElement>(
    Boolean(extensionDecision),
    () => {
      if (extensionBusyId === null) {
        setExtensionDecision(null);
        setExtensionNoteError('');
      }
    },
  );
  const extensionDetailPanelRef = useDialogBehavior<HTMLDivElement>(
    Boolean(extensionDetail),
    () => setExtensionDetail(null),
  );

  // Client-side mounted state for React Portals
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
    return () => setMounted(false);
  }, []);

  const loadRequests = useCallback(async () => {
    // Only the newest response may write state, so a slow first reply can never
    // overwrite a faster retry that already landed.
    const ticket = ++requestTicket.current;
    if (hasLoadedRequests.current) setRefreshing(true);
    else setLoading(true);
    setError('');

    try {
      const response = await fetch('/api/admin/file-requests');
      const json = await response.json();
      if (!response.ok || !json.ok)
        throw new Error(json.message || t('feedback.loadRequestsFailed'));
      if (ticket !== requestTicket.current) return;
      setRequests(json.data?.requests ?? []);
      hasLoadedRequests.current = true;
    } catch (err) {
      if (ticket !== requestTicket.current) return;
      setError(
        err instanceof Error
          ? err.message
          : t('feedback.loadRequestsFailed'),
      );
    } finally {
      if (ticket === requestTicket.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, [t]);

  const loadExtensions = useCallback(async () => {
    const ticket = ++extensionTicket.current;
    setExtensionsLoading(true);
    setExtensionError('');
    try {
      const response = await fetch('/api/admin/file-request-extensions?status=PENDING');
      const json = await response.json();
      if (!response.ok || !json.ok)
        throw new Error(json.message || t('feedback.loadExtensionsFailed'));
      if (ticket !== extensionTicket.current) return;
      setExtensions(json.data?.extensions ?? []);
    } catch (err) {
      if (ticket !== extensionTicket.current) return;
      setExtensionError(
        err instanceof Error
          ? err.message
          : t('feedback.loadExtensionsFailed'),
      );
    } finally {
      if (ticket === extensionTicket.current) {
        setExtensionsLoading(false);
        setExtensionsLoaded(true);
      }
    }
  }, [t]);

  useEffect(() => {
    void loadRequests();
    void loadExtensions();
  }, [loadRequests, loadExtensions]);

  /**
   * Supabase Realtime keeps this queue live without a manual reload: new
   * requests, approvals, rejections and allocations all push a refresh. The
   * subscription uses the anon browser client only — RLS and admin auth stay on
   * the API route — and every change is discarded by the server, never applied
   * from the payload, so the table always reflects authoritative data.
   */
  useEffect(() => {
    let refreshTimer: number | undefined;
    let channel: any = null;
    let handshakeDone = false;

    const scheduleRefresh = () => {
      window.clearTimeout(refreshTimer);
      refreshTimer = window.setTimeout(() => {
        void loadRequests();
        void loadExtensions();
      }, REALTIME_REFRESH_DEBOUNCE_MS);
    };

    const announceNewRequest = (record: any) => {
      if (!record || record.status !== 'PENDING') return;
      const id = Number(record.id);
      if (!Number.isSafeInteger(id) || announcedRequestIds.current.has(id)) return;
      if (announcedRequestIds.current.size > 500) announcedRequestIds.current.clear();
      announcedRequestIds.current.add(id);
      showToast({
        type: 'info',
        title: t('feedback.newRequestTitle'),
        message: t('feedback.newRequestMessage', {
          name: attributedNameText(record.requester_name, {
            deleted: record.requester_is_deleted,
            label: t('common:deletedUser'),
            fallback: t('feedback.anonymousStaff'),
          }),
          file: record.file_no || t('feedback.unnamedFile'),
          priority: record.priority || 'NORMAL',
        }),
      });
    };

    const handleRequestEvent = (payload: any) => {
      const record = payload?.new ?? payload?.record;
      const eventType = payload?.eventType ?? payload?.event;
      if (String(eventType).toUpperCase() === 'INSERT') announceNewRequest(record);
      scheduleRefresh();
    };

    try {
      const supabase = getSupabaseBrowserClient();
      channel = supabase
        .channel('admin-staff-file-requests-realtime')
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'staff_file_requests' },
          handleRequestEvent,
        )
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'file_request_extensions' },
          () => scheduleRefresh(),
        )
        .subscribe((status: string) => {
          // The mount effect already fetched once, so only a reconnect needs a
          // fresh pull — anything that changed while the socket was down is
          // otherwise invisible until the admin reloads.
          if (status === 'SUBSCRIBED') {
            if (handshakeDone) {
              void loadRequests();
              void loadExtensions();
            }
            handshakeDone = true;
          }
          if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
            console.warn('Realtime subscription issue for staff file requests:', status);
          }
        });
    } catch (err) {
      console.warn('Realtime is unavailable; the queue still refreshes manually.', err);
    }

    return () => {
      window.clearTimeout(refreshTimer);
      if (channel) {
        try {
          getSupabaseBrowserClient().removeChannel(channel);
        } catch (err) {
          console.warn('Error removing realtime channel:', err);
        }
      }
    };
  }, [loadRequests, loadExtensions, showToast, t]);

  // Which tab a notification asked for, applied before the rows arrive.
  useEffect(() => {
    const tab = readQueryParam('tab');
    if (tab === 'pending' || tab === 'rejected' || tab === 'extensions') {
      setActiveTab(tab);
    }
  }, []);

  // ?q=&priority=&group=1 restore the toolbar after a refresh or from a shared
  // link. Defaults stay out of the address, so a plain queue has no params.
  useEffect(() => {
    const seededSearch = sanitizeRequestSearch(readQueryParam('q'));
    if (seededSearch) {
      setSearchInput(seededSearch);
      setSearch(seededSearch);
    }
    setPriorityFilter(parsePriorityFilter(readQueryParam('priority')));
    setGroupByFile(readQueryParam('group') === '1');
  }, []);

  // Debounce typing so one burst of keystrokes is one re-filter.
  useEffect(() => {
    const normalized = sanitizeRequestSearch(searchInput);
    if (normalized === search) return;
    const timer = setTimeout(() => setSearch(normalized), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [searchInput, search]);

  // The first run reflects the just-seeded defaults; after that every change is
  // mirrored, so the address bar always describes what is on screen.
  const filtersInUrlHandled = useRef(false);
  useEffect(() => {
    if (!filtersInUrlHandled.current) {
      filtersInUrlHandled.current = true;
      return;
    }
    setQueryParam('q', search || null);
    setQueryParam('priority', priorityFilter === 'ALL' ? null : priorityFilter);
    setQueryParam('group', groupByFile ? '1' : null);
  }, [search, priorityFilter, groupByFile]);

  // ?request=<id> opens that request in the details dialog once loaded.
  useEffect(() => {
    if (loading || requestLinkHandled.current) return;
    const id = parseRecordId(readQueryParam('request'));
    if (id === null) return;
    requestLinkHandled.current = true;
    clearQueryParam('request');
    const match = requests.find((request) => request.id === id);
    if (match) {
      setSelectedDetailRequest(match);
      setHighlightRequestId(id);
    } else {
      setDeepLinkNotice(t('feedback.deepLinkGone'));
    }
  }, [loading, requests, t]);

  // ?extension=<id> opens the extension queue and its decision dialog.
  useEffect(() => {
    if (!extensionsLoaded || extensionLinkHandled.current) return;
    const id = parseRecordId(readQueryParam('extension'));
    if (id === null) return;
    extensionLinkHandled.current = true;
    clearQueryParam('extension');
    setActiveTab('extensions');
    const match = extensions.find((extension) => extension.id === id);
    if (match) {
      setExtensionDetail(match);
      setHighlightExtensionId(id);
    }
  }, [extensionsLoaded, extensions]);

  // One ranking for the whole queue, shared with the staff views and the
  // approve API: pending requests grouped per file, ranked by priority then by
  // first submission. Recomputed whenever the rows change, including after a
  // realtime refresh or an approve/reject decision.
  const competingById = useMemo(() => getCompetingInfo(requests), [requests]);

  // The allocation notice walks the same group the approve API ranks, in the
  // same order, so the admin sees who is genuinely first in line for the file.
  const conflictGroup = useMemo(
    () =>
      conflictApproval ? getCompetingGroup(requests, conflictApproval.target) : [],
    [conflictApproval, requests],
  );

  // Only rank 0 of the group can be approved — the API answers anything else with
  // a 409 — so the notice disables the button instead of offering a refusal.
  const conflictTargetIsLeader =
    conflictGroup.length < 2 ||
    conflictGroup[0]?.id === conflictApproval?.target.id;

  const review = async (
    request: StaffRequest,
    status: 'APPROVED' | 'REJECTED',
    adminNotes?: string,
  ): Promise<boolean> => {
    setBusyId(request.id);
    try {
      const response = await fetch(`/api/admin/file-requests/${request.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status, admin_notes: adminNotes }),
      });
      const json = await response.json();
      if (!response.ok || !json.ok) {
        // Availability is enforced on the server, so this is the authoritative
        // answer: show the red notice, resync the table, and change nothing.
        if (json?.reason === 'file_currently_issued') {
          setIssuedBlock({
            issuance: json.issuance ?? null,
            blockedFileNo: request.file_no,
          });
          void loadRequests();
          return false;
        }
        // The queue moved underneath us — another admin decided on the request
        // ahead of this one. Resync, then explain whose turn it is.
        if (json?.reason === 'not_highest_priority') {
          void loadRequests();
          throw new Error(
            json.message || t('feedback.notFirstInLine'),
          );
        }
        throw new Error(json.message || t('feedback.updateFailed'));
      }

      showToast({
        type: 'success',
        title:
          status === 'APPROVED'
            ? t('feedback.requestApprovedTitle')
            : t('feedback.requestRejectedTitle'),
        message: json.data?.message,
      });

      const updatedRequest: StaffRequest = {
        ...request,
        status,
        admin_notes: adminNotes?.trim() || null,
        reviewed_at: new Date().toISOString(),
        reviewer_name: json.data?.request?.reviewer_name || t('common:roles.ADMIN'),
        reviewer_email: json.data?.request?.reviewer_email || null,
      };

      setRequests((current) =>
        current.map((item) =>
          item.id === request.id ? updatedRequest : item,
        ),
      );

      // If details modal is open for this request, update it
      if (selectedDetailRequest?.id === request.id) {
        setSelectedDetailRequest(updatedRequest);
      }

      setRejectionRequest(null);
      setRejectionNote('');
      setRejectionError('');
      return true;
    } catch (err) {
      showToast({
        type: 'error',
        title: t('feedback.requestNotUpdatedTitle'),
        message: err instanceof Error ? err.message : t('feedback.tryAgain'),
      });
      return false;
    } finally {
      setBusyId(null);
    }
  };

  const handleApproveClick = (request: StaffRequest) => {
    const group = getCompetingGroup(requests, request);
    if (group.length > 1) {
      // More than one staff member is waiting for this folder: the allocation
      // notice lists the whole group in rank order.
      setConflictApproval({
        target: request,
        competingRequests: group.filter((row) => row.id !== request.id),
      });
    } else {
      // Single request: confirm before the file moves into the issued workflow
      setApprovalTarget(request);
    }
  };

  const handleConfirmConflictApproval = async () => {
    if (!conflictApproval) return;
    const { target, competingRequests } = conflictApproval;
    setApprovingWithConflict(true);

    try {
      // 1. Approve target request
      const approved = await review(target, 'APPROVED');
      // Availability outranks priority: if the server refused, every competing
      // request for this file must stay pending and untouched.
      if (!approved) {
        setConflictApproval(null);
        return;
      }

      // 2. Reject the competing requests for this same file
      if (competingRequests.length > 0) {
        const rejectionNote = `Physical file allocated to competing request from ${target.requester_name} (${target.priority} Priority).`;
        for (const comp of competingRequests) {
          try {
            await fetch(`/api/admin/file-requests/${comp.id}`, {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                status: 'REJECTED',
                admin_notes: rejectionNote,
              }),
            });
            setRequests((curr) =>
              curr.map((r) =>
                r.id === comp.id
                  ? {
                      ...r,
                      status: 'REJECTED',
                      admin_notes: rejectionNote,
                      reviewed_at: new Date().toISOString(),
                    }
                  : r,
              ),
            );
          } catch (e) {
            console.error('Failed to auto-reject competing request', comp.id, e);
          }
        }
        showToast({
          type: 'info',
          title: t('feedback.competingUpdatedTitle'),
          message: t('feedback.competingUpdatedMessage', {
            count: competingRequests.length,
          }),
        });
      }
      setConflictApproval(null);
    } finally {
      setApprovingWithConflict(false);
    }
  };

  const submitRejection = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const note = rejectionNote.trim();
    if (!note) {
      setRejectionError(t('validation.rejectionReasonRequired'));
      return;
    }
    if (rejectionRequest) {
      await review(rejectionRequest, 'REJECTED', note);
    }
  };

  const submitExtensionDecision = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!extensionDecision) return;
    const { target, status } = extensionDecision;
    const note = extensionNote.trim();
    if (status === 'REJECTED' && !note) {
      setExtensionNoteError(t('validation.extensionReasonRequired'));
      return;
    }

    setExtensionBusyId(target.id);
    try {
      const response = await fetch(
        `/api/admin/file-request-extensions/${target.id}/review`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status, review_note: note || null }),
        },
      );
      const json = await response.json();
      if (!response.ok || !json.ok) {
        throw new Error(json.message || t('feedback.extensionUpdateFailed'));
      }

      showToast({
        type: 'success',
        title:
          status === 'APPROVED'
            ? t('feedback.extensionApprovedTitle')
            : t('feedback.extensionRejectedTitle'),
        message: json.data?.message,
      });
      setExtensionDecision(null);
      setExtensionNote('');
      setExtensionNoteError('');
      setExtensions((current) => current.filter((item) => item.id !== target.id));
      // The official return date changed, so the request list must be re-read.
      void loadRequests();
    } catch (err) {
      showToast({
        type: 'error',
        title: t('feedback.extensionNotUpdatedTitle'),
        message: err instanceof Error ? err.message : t('feedback.tryAgain'),
      });
    } finally {
      setExtensionBusyId(null);
    }
  };

  const pendingCount = requests.filter(
    (request) => request.status === 'PENDING',
  ).length;

  const pendingRequests = useMemo(
    () => requests.filter((request) => request.status === 'PENDING'),
    [requests],
  );

  const rejectedRequests = useMemo(
    () => requests.filter((request) => request.status === 'REJECTED'),
    [requests],
  );

  /**
   * Which rows the queue shows. The ranking itself is deliberately untouched
   * here: `competingById` above reads the full list, so filtering the leader out
   * of sight still leaves every row behind it faded, badged and blocked exactly
   * as it was. Grouping only reorders what is visible, using the shared
   * comparator.
   */
  const applyFilters = useCallback(
    (rows: StaffRequest[]) => {
      const matched = rows.filter(
        (request) =>
          (priorityFilter === 'ALL' || request.priority === priorityFilter) &&
          matchesRequestSearch(request, search),
      );
      return groupByFile ? sortByCompetingGroups(matched) : matched;
    },
    [priorityFilter, search, groupByFile],
  );

  const visiblePendingRequests = useMemo(
    () => applyFilters(pendingRequests),
    [applyFilters, pendingRequests],
  );

  const visibleRejectedRequests = useMemo(
    () => applyFilters(rejectedRequests),
    [applyFilters, rejectedRequests],
  );

  const isFiltered = search.length > 0 || priorityFilter !== 'ALL';

  const clearFilters = () => {
    setSearchInput('');
    setSearch('');
    setPriorityFilter('ALL');
    setGroupByFile(false);
  };

  const isExtensionSchemaMissing = /migration|0017|column|table/i.test(
    extensionError,
  );

  return (
    <div className="mx-auto max-w-[1240px] pb-8 pt-2">
      {/* Top Header */}
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <nav
            aria-label={t('page.breadcrumbAria')}
            className="mb-2 block text-[11px] text-slate-400"
          >
            {t('page.pages')} <span className="mx-1.5">/</span>{' '}
            {t('page.recordRoom')} <span className="mx-1.5">/</span>{' '}
            <span className="font-semibold text-slate-600 dark:text-slate-300">
              {t('page.title')}
            </span>
          </nav>
          <h1 className="text-2xl font-extrabold text-slate-800 dark:text-white">
            {t('page.title')}
          </h1>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            {t('page.subtitle')}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span className="rounded-full bg-amber-50 px-3 py-2 text-[10px] font-bold text-amber-700 dark:bg-amber-950/40 dark:text-amber-300 border border-amber-200 dark:border-amber-800/40">
            {t('page.awaitingReview', { count: pendingCount })}
          </span>
          <button
            type="button"
            onClick={() => {
              void loadRequests();
              void loadExtensions();
            }}
            disabled={loading || refreshing}
            className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-bold text-slate-600 hover:bg-slate-50 disabled:opacity-50 dark:border-navy-600 dark:bg-navy-800 dark:text-slate-300 shadow-xs cursor-pointer"
          >
            <FiRefreshCw
              className={loading || refreshing ? 'animate-spin' : ''}
            />{' '}
            {t('common:buttons.refresh')}
          </button>
        </div>
      </div>

      {/* Workflow tabs */}
      <div
        role="group"
        aria-label={t('page.viewsLabel')}
        className="mb-4 flex flex-wrap gap-1.5 rounded-2xl border border-slate-100 bg-white p-1.5 shadow-sm dark:border-navy-700 dark:bg-navy-800"
      >
        {(
          [
            { key: 'pending', label: 'tabs.pending', count: pendingRequests.length },
            { key: 'rejected', label: 'tabs.rejected', count: rejectedRequests.length },
            { key: 'extensions', label: 'tabs.extensions', count: extensions.length },
          ] as const
        ).map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() => setActiveTab(tab.key)}
            aria-pressed={activeTab === tab.key}
            className={`inline-flex items-center gap-2 rounded-xl px-3.5 py-2 text-xs font-bold transition-all cursor-pointer ${
              activeTab === tab.key
                ? 'bg-[#4318FF] text-white shadow-md shadow-[#4318FF]/20'
                : 'text-slate-600 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-navy-700'
            }`}
          >
            {t(tab.label)}
            <span
              className={`rounded-full px-1.5 py-0.5 text-[10px] font-black ${
                activeTab === tab.key
                  ? 'bg-white/20 text-white'
                  : 'bg-slate-100 text-slate-600 dark:bg-navy-700 dark:text-slate-300'
              }`}
            >
              {tab.count}
            </span>
          </button>
        ))}
      </div>

      {activeTab !== 'extensions' && (
        <RequestFilterBar
          search={searchInput}
          onSearchChange={setSearchInput}
          priority={priorityFilter}
          onPriorityChange={setPriorityFilter}
          grouped={groupByFile}
          onGroupedChange={setGroupByFile}
          isFiltered={isFiltered}
          onClearFilters={clearFilters}
          resultCount={
            activeTab === 'rejected'
              ? visibleRejectedRequests.length
              : visiblePendingRequests.length
          }
          totalCount={
            activeTab === 'rejected'
              ? rejectedRequests.length
              : pendingRequests.length
          }
        />
      )}

      {deepLinkNotice && (
        <div
          role="status"
          className="mb-4 flex items-start gap-2 rounded-2xl border border-[#4318FF]/20 bg-[#4318FF]/[0.05] p-4 text-xs text-slate-700 dark:border-brand-700 dark:bg-brand-900/25 dark:text-slate-200"
        >
          <FiInfo className="mt-0.5 h-4 w-4 shrink-0 text-[#4318FF] dark:text-brand-300" />
          <p className="break-words font-semibold">{deepLinkNotice}</p>
        </div>
      )}

      {/* Rows stay visible while a reload runs; the bar is the only new ink. */}
      <TableLoadingProgressBar
        active={refreshing}
        label={t('page.updating')}
      />

      {error ? (
        <div
          role="alert"
          className="rounded-2xl border border-rose-200 bg-rose-50 p-5 text-sm text-rose-700 dark:border-rose-900 dark:bg-rose-950/30 dark:text-rose-300"
        >
          <p className="font-bold">{t('feedback.loadRequestsFailedTitle')}</p>
          <p className="mt-1 text-xs">{error}</p>
          <button
            type="button"
            onClick={() => void loadRequests()}
            className="mt-3 text-xs font-bold underline"
          >
            {t('common:buttons.retry')}
          </button>
        </div>
      ) : loading ? (
        <div
          role="status"
          className="rounded-2xl border border-slate-100 bg-white py-16 text-center text-xs text-slate-500 dark:border-navy-700 dark:bg-navy-800 shadow-sm"
        >
          <span className="inline-block animate-spin mr-2" aria-hidden="true">
            <FiRefreshCw />
          </span>
          {t('feedback.loadingRequests')}
        </div>
      ) : activeTab === 'extensions' ? (
        extensionError ? (
          <div
            role="alert"
            className="rounded-2xl border border-rose-200 bg-rose-50 p-5 text-sm text-rose-700 dark:border-rose-900 dark:bg-rose-950/30 dark:text-rose-300"
          >
            <p className="font-bold">
              {t('feedback.loadExtensionsFailedTitle')}
            </p>
            <p className="mt-1 text-xs">{extensionError}</p>
            {isExtensionSchemaMissing && (
              <p className="mt-1 text-xs">
                <Trans
                  t={t}
                  i18nKey="page.extensionMigrationHint"
                  components={{ code: <code className="font-mono" /> }}
                />
              </p>
            )}
            <button
              type="button"
              onClick={() => void loadExtensions()}
              className="mt-3 text-xs font-bold underline"
            >
              {t('common:buttons.retry')}
            </button>
          </div>
        ) : extensionsLoading ? (
          <div
            role="status"
            className="rounded-2xl border border-slate-100 bg-white py-16 text-center text-xs text-slate-500 dark:border-navy-700 dark:bg-navy-800 shadow-sm"
          >
            <span
              className="inline-block animate-spin mr-2"
              aria-hidden="true"
            >
              <FiRefreshCw />
            </span>
            {t('feedback.loadingExtensions')}
          </div>
        ) : extensions.length === 0 ? (
          <div className="rounded-2xl border border-slate-100 bg-white px-5 py-16 text-center dark:border-navy-700 dark:bg-navy-800 shadow-sm">
            <FiCalendar className="mx-auto h-8 w-8 text-slate-300" />
            <p className="mt-3 text-sm font-bold text-slate-700 dark:text-white">
              {t('empty.extensionsTitle')}
            </p>
            <p className="mt-1 text-xs text-slate-500">
              {t('empty.extensionsHint')}
            </p>
          </div>
        ) : (
          <div
              aria-busy={refreshing}
              className="overflow-hidden rounded-2xl border border-slate-100 bg-white dark:border-navy-700 dark:bg-navy-800 shadow-sm"
            >
            <div className="overflow-x-auto">
              <table className="w-full min-w-[900px] text-left border-collapse table-auto">
                <caption className="sr-only">
                  {t('table.captionExtensions')}
                </caption>
                <colgroup>
                  <col className="w-[5%]" />
                  <col className="w-[13%]" />
                  <col className="w-[15%]" />
                  <col className="w-[9%]" />
                  <col className="w-[10%]" />
                  <col className="w-[8%]" />
                  <col className="w-[13%]" />
                  <col className="w-[9%]" />
                  <col className="w-[19%]" />
                </colgroup>
                <thead className={TABLE_HEAD_CLASS}>
                  <tr>
                    <th scope="col" className="px-2.5 py-3">{t('table.reqId')}</th>
                    <th scope="col" className="px-2.5 py-3">{t('table.staffMember')}</th>
                    <th scope="col" className="px-2.5 py-3">{t('table.file')}</th>
                    <th scope="col" className="px-2.5 py-3">{t('table.currentReturn')}</th>
                    <th scope="col" className="px-2.5 py-3">{t('table.requestedReturn')}</th>
                    <th scope="col" className="px-2.5 py-3">{t('table.requestedOn')}</th>
                    <th scope="col" className="px-2.5 py-3">{t('table.staffReason')}</th>
                    <th scope="col" className="px-2.5 py-3">{t('common:labels.status')}</th>
                    <th scope="col" className="px-2.5 py-3 text-right">{t('common:labels.action')}</th>
                  </tr>
                </thead>
                <tbody className={TABLE_BODY_CLASS}>
                  {extensions.map((extension) => (
                    <tr
                      key={extension.id}
                      className={tableRowClass(
                        highlightExtensionId === extension.id && TABLE_HIGHLIGHT_CLASS,
                      )}
                    >
                      <td className="px-2.5 py-3 font-bold text-muted">
                        #{extension.id}
                      </td>
                      <td className="px-2.5 py-3">
                        <p className="font-bold text-slate-800 dark:text-slate-100">
                          <AttributedUser
                            name={
                              extension.requester_name ||
                              extension.requested_by_name
                            }
                            deleted={extension.requester_is_deleted}
                          />
                        </p>
                        <p className="mt-0.5 text-[10px] text-muted">
                          {extension.requester_section || t('detail.noSection')}
                        </p>
                      </td>
                      <td className="px-2.5 py-3">
                        <p
                          className="break-words font-bold text-[#4318FF] dark:text-brand-300 [overflow-wrap:anywhere]"
                          title={extension.file_no}
                        >
                          {extension.file_no}
                        </p>
                        <p
                          className="mt-1 break-words text-slate-600 dark:text-slate-300 font-medium"
                          title={extension.file_name}
                        >
                          {extension.file_name}
                        </p>
                      </td>
                      <td className="px-2.5 py-3 font-semibold text-slate-700 dark:text-slate-200">
                        {formatSriLankaDate(`${extension.previous_return_date}T00:00:00Z`)}
                      </td>
                      <td className="px-2.5 py-3">
                        <span className="inline-flex items-center rounded-lg bg-rose-50 px-2 py-1 text-[11px] font-black text-rose-700 dark:bg-rose-950/40 dark:text-rose-300 border border-rose-200 dark:border-rose-900/60">
                          {formatSriLankaDate(`${extension.new_return_date}T00:00:00Z`)}
                        </span>
                      </td>
                      <td className="px-2.5 py-3 text-slate-600 dark:text-slate-300">
                        {formatSriLankaDate(extension.created_at)}
                      </td>
                      <td className="max-w-[240px] px-2.5 py-3">
                        <p className="whitespace-pre-wrap break-words text-[11px] text-slate-600 dark:text-slate-300">
                          {extension.reason}
                        </p>
                      </td>
                      <td className="px-2.5 py-3">
                        <span
                          className={`rounded-full px-2.5 py-1 text-[10px] font-extrabold shadow-2xs ${
                            statusClass[extension.status as RequestStatus] ??
                            statusClass.PENDING
                          }`}
                        >
                          {extension.status}
                        </span>
                      </td>
                      <td className="px-2.5 py-3 text-right">
                        <div className={TABLE_ACTIONS_CLASS}>
                          <button
                            type="button"
                            disabled={extensionBusyId !== null}
                            onClick={() => {
                              setExtensionDecision({ target: extension, status: 'APPROVED' });
                              setExtensionNote('');
                              setExtensionNoteError('');
                            }}
                            className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-2 py-1.5 text-[10px] font-bold text-white hover:bg-emerald-700 disabled:opacity-50 transition-all shadow-xs cursor-pointer"
                          >
                            <FiCheck /> {t('common:buttons.approve')}
                          </button>
                          <button
                            type="button"
                            disabled={extensionBusyId !== null}
                            onClick={() => {
                              setExtensionDecision({ target: extension, status: 'REJECTED' });
                              setExtensionNote('');
                              setExtensionNoteError('');
                            }}
                            className="inline-flex items-center gap-1 rounded-lg border border-rose-200 px-2 py-1.5 text-[10px] font-bold text-rose-600 hover:bg-rose-50 disabled:opacity-50 dark:border-rose-900 dark:hover:bg-rose-950/30 transition-all shadow-xs cursor-pointer"
                          >
                            <FiX /> {t('common:buttons.reject')}
                          </button>
                          <button
                            type="button"
                            onClick={() => setExtensionDetail(extension)}
                            title={t('table.viewExtensionDetails')}
                            aria-label={t('table.viewExtensionDetails')}
                            className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-[10px] font-bold text-slate-600 hover:border-[#4318FF] hover:text-[#4318FF] hover:bg-slate-50 dark:border-navy-600 dark:bg-navy-800 dark:text-slate-300 dark:hover:bg-navy-700 transition-all shadow-xs cursor-pointer"
                          >
                            <FiEye className="h-3.5 w-3.5" />
                          </button>
                          {extensionBusyId === extension.id && (
                            <FiRefreshCw className="animate-spin text-[#4318FF]" />
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )
      ) : activeTab === 'rejected' ? (
        rejectedRequests.length === 0 ? (
          <div className="rounded-2xl border border-slate-100 bg-white px-5 py-16 text-center dark:border-navy-700 dark:bg-navy-800 shadow-sm">
            <FiXCircle className="mx-auto h-8 w-8 text-slate-300" />
            <p className="mt-3 text-sm font-bold text-slate-700 dark:text-white">
              {t('empty.rejectedTitle')}
            </p>
            <p className="mt-1 text-xs text-slate-500">
              {t('empty.rejectedHint')}
            </p>
          </div>
        ) : visibleRejectedRequests.length === 0 ? (
          <div className="rounded-2xl border border-slate-100 bg-white px-5 py-16 text-center dark:border-navy-700 dark:bg-navy-800 shadow-sm">
            <FiXCircle className="mx-auto h-8 w-8 text-slate-300" />
            <p className="mt-3 text-sm font-bold text-slate-700 dark:text-white">
              {t('common:table.noRequestsMatch')}
            </p>
            <p className="mt-1 text-xs text-slate-500">
              {t('empty.filteredRejected', { count: rejectedRequests.length })}
            </p>
            <button
              type="button"
              onClick={clearFilters}
              className="mt-3 inline-flex cursor-pointer items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-600 transition-colors hover:bg-slate-50 dark:border-navy-600 dark:bg-navy-900 dark:text-slate-300 dark:hover:bg-navy-700"
            >
              <FiX className="h-3.5 w-3.5" />
              {t('common:buttons.clearFilters')}
            </button>
          </div>
        ) : (
          <div
              aria-busy={refreshing}
              className="overflow-hidden rounded-2xl border border-slate-100 bg-white dark:border-navy-700 dark:bg-navy-800 shadow-sm"
            >
            <div className="overflow-x-auto">
              <table className="w-full min-w-[900px] text-left border-collapse table-auto">
                <caption className="sr-only">
                  {t('table.captionRejected')}
                </caption>
                <colgroup>
                  <col className="w-[6%]" />
                  <col className="w-[12%]" />
                  <col className="w-[13%]" />
                  <col className="w-[12%]" />
                  <col className="w-[17%]" />
                  <col className="w-[10%]" />
                  <col className="w-[10%]" />
                  <col className="w-[10%]" />
                  <col className="w-[10%]" />
                </colgroup>
                <thead className={TABLE_HEAD_CLASS}>
                  <tr>
                    <th scope="col" className="px-2.5 py-3">{t('table.requestId')}</th>
                    <th scope="col" className="px-2.5 py-3">{t('table.staffName')}</th>
                    <th scope="col" className="px-2.5 py-3">{t('table.departmentSection')}</th>
                    <th scope="col" className="px-2.5 py-3">{t('table.fileNumber')}</th>
                    <th scope="col" className="px-2.5 py-3">{t('table.fileName')}</th>
                    <th scope="col" className="px-2.5 py-3">{t('table.requestDate')}</th>
                    <th scope="col" className="px-2.5 py-3">{t('table.rejectionDate')}</th>
                    <th scope="col" className="px-2.5 py-3">{t('table.rejectedBy')}</th>
                    <th scope="col" className="px-2.5 py-3 text-right">{t('common:labels.action')}</th>
                  </tr>
                </thead>
                <tbody className={TABLE_BODY_CLASS}>
                  {visibleRejectedRequests.map((request, index) => {
                    const previous = visibleRejectedRequests[index - 1];

                    return (
                      <tr
                        key={request.id}
                        className={tableRowClass(
                          highlightRequestId === request.id &&
                            TABLE_HIGHLIGHT_CLASS,
                          groupByFile &&
                            index > 0 &&
                            getCompetingGroupKey(previous) !==
                              getCompetingGroupKey(request) &&
                            TABLE_GROUP_BREAK_CLASS,
                        )}
                      >
                      <td className="px-2.5 py-3 font-bold text-muted">
                        #{request.id}
                      </td>
                      <td className="px-2.5 py-3">
                        <p className="font-bold text-slate-800 dark:text-slate-100">
                          <AttributedUser
                            name={request.requester_name}
                            deleted={request.requester_is_deleted}
                          />
                        </p>
                        <p className="mt-0.5 text-[10px] text-muted">
                          {isReservedDeletedEmail(request.requester_email)
                            ? null
                            : request.requester_email}
                        </p>
                      </td>
                      <td className="px-2.5 py-3 text-slate-600 dark:text-slate-300">
                        {request.requester_section || t('detail.noSection')}
                      </td>
                      <td className="px-2.5 py-3 font-bold text-[#4318FF] dark:text-brand-300">
                        <span
                          className="break-words [overflow-wrap:anywhere]"
                          title={request.file_no}
                        >
                          {request.file_no}
                        </span>
                      </td>
                      <td className="px-2.5 py-3">
                        <p
                          className="break-words font-medium text-slate-600 dark:text-slate-300"
                          title={request.file_name}
                        >
                          {request.file_name}
                        </p>
                        <p className="mt-0.5 text-[10px] text-muted">
                          {request.section_name}
                        </p>
                      </td>
                      <td className="px-2.5 py-3 font-semibold text-slate-700 dark:text-slate-200">
                        {formatSriLankaDate(`${request.request_date}T00:00:00Z`)}
                      </td>
                      <td className="px-2.5 py-3 text-slate-600 dark:text-slate-300">
                        {request.reviewed_at
                          ? formatSriLankaDateTime(request.reviewed_at)
                          : '—'}
                      </td>
                      <td className="px-2.5 py-3 text-slate-600 dark:text-slate-300">
                        <AttributedUser
                          name={request.reviewer_name}
                          deleted={request.reviewer_is_deleted}
                          fallback={t('common:roles.ADMIN')}
                        />
                      </td>
                      <td className="px-2.5 py-3 text-right">
                        <button
                          type="button"
                          onClick={() => setSelectedDetailRequest(request)}
                          title={t('table.viewRejectedDetails')}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-[11px] font-bold text-slate-700 shadow-xs hover:border-[#4318FF] hover:bg-slate-50 hover:text-[#4318FF] dark:border-navy-600 dark:bg-navy-800 dark:text-slate-200 dark:hover:bg-navy-700 transition-all cursor-pointer"
                        >
                          <FiEye className="h-3.5 w-3.5 text-[#4318FF] dark:text-brand-300" />
                          <span>{t('common:buttons.view')}</span>
                        </button>
                      </td>
                    </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )
      ) : pendingRequests.length === 0 ? (
        <div className="rounded-2xl border border-slate-100 bg-white px-5 py-16 text-center dark:border-navy-700 dark:bg-navy-800 shadow-sm">
          <FiClock className="mx-auto h-8 w-8 text-slate-300" />
          <p className="mt-3 text-sm font-bold text-slate-700 dark:text-white">
            {t('empty.pendingTitle')}
          </p>
          <p className="mt-1 text-xs text-slate-500">
            {t('empty.pendingHint')}
          </p>
        </div>
      ) : visiblePendingRequests.length === 0 ? (
        <div className="rounded-2xl border border-slate-100 bg-white px-5 py-16 text-center dark:border-navy-700 dark:bg-navy-800 shadow-sm">
          <FiXCircle className="mx-auto h-8 w-8 text-slate-300" />
          <p className="mt-3 text-sm font-bold text-slate-700 dark:text-white">
            {t('common:table.noRequestsMatch')}
          </p>
          <p className="mt-1 text-xs text-slate-500">
            {t('empty.filteredPending', { count: pendingRequests.length })}
          </p>
          <button
            type="button"
            onClick={clearFilters}
            className="mt-3 inline-flex cursor-pointer items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-600 transition-colors hover:bg-slate-50 dark:border-navy-600 dark:bg-navy-900 dark:text-slate-300 dark:hover:bg-navy-700"
          >
            <FiX className="h-3.5 w-3.5" />
            {t('common:buttons.clearFilters')}
          </button>
        </div>
      ) : (
        <div
              aria-busy={refreshing}
              className="overflow-hidden rounded-2xl border border-slate-100 bg-white dark:border-navy-700 dark:bg-navy-800 shadow-sm"
            >
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-left border-collapse table-auto">
              <caption className="sr-only">
                {t('table.captionPending')}
              </caption>
              <colgroup>
                <col className="w-[5%]" />
                <col className="w-[17%]" />
                <col className="w-[12%]" />
                <col className="w-[12%]" />
                <col className="w-[10%]" />
                <col className="w-[6%]" />
                <col className="w-[10%]" />
                <col className="w-[9%]" />
                <col className="w-[19%]" />
              </colgroup>
              <thead className={TABLE_HEAD_CLASS}>
                <tr>
                  <th scope="col" className="px-2.5 py-3">{t('table.requestId')}</th>
                  <th scope="col" className="px-2.5 py-3">{t('table.file')}</th>
                  <th scope="col" className="px-2.5 py-3">{t('table.staffMember')}</th>
                  <th scope="col" className="px-2.5 py-3">{t('table.location')}</th>
                  <th scope="col" className="px-2.5 py-3">{t('table.requestDate')}</th>
                  <th scope="col" className="px-2.5 py-3">{t('table.duration')}</th>
                  <th scope="col" className="px-2.5 py-3">{t('common:labels.priority')}</th>
                  <th scope="col" className="px-2.5 py-3">{t('common:labels.status')}</th>
                  <th scope="col" className="px-2.5 py-3 text-right">{t('common:labels.action')}</th>
                </tr>
              </thead>
              <tbody className={TABLE_BODY_CLASS}>
                {visiblePendingRequests.map((request, index) => {
                  const competing = competingById.get(request.id);
                  const previous = visiblePendingRequests[index - 1];
                  const approveBlockedByRank = Boolean(
                    competing?.isCompeting && !competing.isLeader,
                  );

                  return (
                    <tr
                      key={request.id}
                      data-state={getCompetingRowState(competing)}
                      className={tableRowClass(
                        // Shading only ever communicates rank inside a
                        // competing group; a lone request keeps the plain row.
                        getCompetingRowClasses(competing),
                        highlightRequestId === request.id && TABLE_HIGHLIGHT_CLASS,
                        // Marks where a new file group starts.
                        groupByFile &&
                          index > 0 &&
                          getCompetingGroupKey(previous) !==
                            getCompetingGroupKey(request) &&
                          TABLE_GROUP_BREAK_CLASS,
                      )}
                    >
                      {/* REQUEST ID column */}
                      <td className="min-w-0 px-2.5 py-3 font-bold row-text-secondary">
                        #{request.id}
                      </td>

                      {/* FILE column */}
                      <td className="min-w-0 px-2.5 py-3">
                        <p
                          className="break-words font-bold text-indigo-700 dark:text-brand-300 [overflow-wrap:anywhere]"
                          title={request.file_no}
                        >
                          {request.file_no}
                        </p>
                        <p
                          className="mt-1 break-words font-medium row-text-primary"
                          title={request.file_name}
                        >
                          {request.file_name}
                        </p>
                        <p className="mt-0.5 break-words text-[10px] text-muted">
                          {request.section_name}
                        </p>
                        {competing && (
                          <div className="mt-1.5">
                            <CompetingBadge info={competing} variant="count" />
                          </div>
                        )}
                      </td>

                      {/* STAFF MEMBER column */}
                      <td className="min-w-0 px-2.5 py-3">
                        <p className="break-words font-bold row-text-primary">
                          <AttributedUser
                            name={request.requester_name}
                            deleted={request.requester_is_deleted}
                          />
                        </p>
                        <p className="mt-0.5 break-words text-[10px] row-text-secondary">
                          {isReservedDeletedEmail(request.requester_email)
                            ? null
                            : request.requester_email}
                        </p>
                        <p className="mt-0.5 break-words text-[10px] text-muted">
                          {request.requester_section || t('detail.noSection')}
                        </p>
                      </td>

                      {/* LOCATION column */}
                      <td className="min-w-0 px-2.5 py-3 row-text-secondary">
                        <div
                          className="flex max-w-[220px] flex-wrap items-center gap-x-1 break-words text-[10px] row-text-secondary"
                          title={request.storage_location}
                        >
                          {getLocationParts(request.storage_location).map(
                            (part, index) => (
                              <React.Fragment key={`${part}-${index}`}>
                                {index > 0 && (
                                  <span aria-hidden="true" className="text-slate-300 dark:text-slate-500">
                                    •
                                  </span>
                                )}
                                <span>{part}</span>
                              </React.Fragment>
                            ),
                          )}
                        </div>
                      </td>

                      {/* REQUEST DATE column */}
                      <td className="min-w-0 px-2.5 py-3 row-text-secondary">
                        <span className="whitespace-nowrap font-semibold">
                          {formatSriLankaDate(`${request.request_date}T00:00:00Z`)}
                        </span>
                        <p className="mt-1 break-words text-[10px] text-muted">
                          {t('table.submitted', {
                            date: formatSriLankaDate(request.created_at),
                          })}
                        </p>
                      </td>

                      {/* DURATION column */}
                      <td className="min-w-0 px-2.5 py-3 whitespace-nowrap font-semibold row-text-secondary">
                        {request.duration_days}{' '}
                        {request.duration_days === 1
                          ? t('table.day')
                          : t('table.days')}
                      </td>

                      {/* PRIORITY column */}
                      <td className="min-w-0 px-2.5 py-3">
                        <div className="flex min-w-0 flex-col items-start gap-1">
                          <span
                            className={`inline-flex max-w-full items-center gap-1.5 whitespace-normal break-words font-bold ${
                              priorityStyle[request.priority].className
                            }`}
                          >
                            <FiFlag aria-hidden="true" className="shrink-0" />
                            {t(priorityStyle[request.priority].label)}
                          </span>

                          {/* Rank inside the competing group, same words as the
                              staff views read from the shared helper. */}
                          <CompetingBadge info={competing} />
                        </div>
                      </td>

                      {/* STATUS column */}
                      <td className="min-w-0 px-2.5 py-3">
                        <span
                          className={`inline-flex max-w-full items-center whitespace-normal break-words rounded-full px-2.5 py-1 text-[10px] font-extrabold leading-snug ${
                            statusClass[request.status]
                          }`}
                        >
                          {request.status}
                        </span>
                      </td>

                      {/* ACTION column */}
                      <td className="min-w-0 px-2.5 py-3 text-right">
                        <div className={TABLE_ACTIONS_CLASS}>
                            <button
                              type="button"
                              disabled={busyId !== null || approveBlockedByRank}
                              aria-disabled={busyId !== null || approveBlockedByRank}
                              title={
                                approveBlockedByRank
                                  ? t('table.approveBlocked')
                                  : undefined
                              }
                              onClick={() => handleApproveClick(request)}
                              className={`inline-flex min-w-fit items-center gap-1 whitespace-nowrap rounded-lg px-2.5 py-1.5 text-[10px] font-bold transition-all shadow-xs ${
                                approveBlockedByRank
                                  ? 'cursor-not-allowed border border-slate-300 bg-slate-200 text-slate-500 dark:border-slate-500 dark:bg-slate-700 dark:text-slate-300'
                                  : 'cursor-pointer bg-emerald-600 text-white hover:bg-emerald-700'
                              } disabled:cursor-not-allowed`}
                            >
                              <FiCheck /> {t('common:buttons.approve')}
                            </button>
                            <button
                              type="button"
                              disabled={busyId !== null}
                              aria-disabled={busyId !== null}
                              onClick={() => {
                                setRejectionRequest(request);
                                setRejectionNote('');
                                setRejectionError('');
                              }}
                              className="inline-flex min-w-fit items-center gap-1 whitespace-nowrap rounded-lg border border-rose-300 bg-white px-2.5 py-1.5 text-[10px] font-bold text-rose-700 hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-rose-800 dark:bg-navy-800 dark:text-rose-300 dark:hover:bg-rose-950/30 transition-all shadow-xs cursor-pointer"
                            >
                              <FiX /> {t('common:buttons.reject')}
                            </button>
                            <button
                              type="button"
                              onClick={() => setSelectedDetailRequest(request)}
                              className="inline-flex min-w-fit items-center gap-1 whitespace-nowrap rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-[10px] font-bold text-slate-700 hover:border-[#4318FF] hover:text-[#4318FF] hover:bg-slate-50 dark:border-navy-600 dark:bg-navy-800 dark:text-slate-200 dark:hover:bg-navy-700 transition-all shadow-xs cursor-pointer"
                              title={t('table.viewRequestDetails')}
                              aria-label={t('table.viewRequestDetails')}
                            >
                              <FiEye className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        {busyId === request.id && (
                          <span className="ml-2 inline-block animate-spin align-middle text-[#4318FF]">
                            <FiRefreshCw />
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════════
          MODAL 1: REJECTION WITH MANDATORY REVIEW REASON
         ═══════════════════════════════════════════════════════════════════════ */}
      {rejectionRequest && mounted &&
        ReactDOM.createPortal(
          <div
            className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-[6px] animate-fadeIn"
            onClick={(event) => {
              if (event.target === event.currentTarget && busyId === null) {
                setRejectionRequest(null);
                setRejectionError('');
              }
            }}
          >
            <form
              ref={rejectionPanelRef}
              tabIndex={-1}
              role="dialog"
              aria-modal="true"
              aria-labelledby="reject-request-title"
              onSubmit={submitRejection}
              className="w-full max-w-lg rounded-2xl border border-slate-100 bg-white p-6 shadow-2xl dark:border-navy-700 dark:bg-navy-800 animate-scaleUp"
            >
              <div className="flex items-center justify-between border-b border-slate-100 pb-3 dark:border-navy-700">
                <div className="flex items-center gap-2 text-rose-600 dark:text-rose-400">
                  <FiXCircle className="h-5 w-5" />
                  <h2
                    id="reject-request-title"
                    className="text-base font-extrabold text-slate-800 dark:text-white"
                  >
                    {t('modals.rejection.title')}
                  </h2>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setRejectionRequest(null);
                    setRejectionError('');
                  }}
                  disabled={busyId !== null}
                  aria-label={t('modals.rejection.closeLabel')}
                  className="rounded-full p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-navy-700 dark:hover:text-white transition cursor-pointer"
                >
                  <FiX className="h-4 w-4" />
                </button>
              </div>

              <p className="mt-3 text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                <Trans
                  t={t}
                  i18nKey="modals.rejection.intro"
                  values={{
                    file: `${rejectionRequest.file_no} — ${rejectionRequest.file_name}`,
                    requester: attributedNameText(
                      rejectionRequest.requester_name,
                      {
                        deleted: rejectionRequest.requester_is_deleted,
                        label: t('common:deletedUser'),
                      },
                    ),
                  }}
                  components={{
                    strong: (
                      <strong className="text-slate-800 dark:text-white font-bold" />
                    ),
                  }}
                />
              </p>

              <label
                htmlFor="rejection-note"
                className="mb-1.5 mt-4 block text-[10px] font-extrabold uppercase tracking-wider text-slate-600 dark:text-slate-300"
              >
                {t('modals.rejection.reasonLabel')}{' '}
                <span className="text-rose-500">*</span>
              </label>
              <textarea
                id="rejection-note"
                value={rejectionNote}
                onChange={(event) => {
                  setRejectionNote(event.target.value);
                  setRejectionError('');
                }}
                maxLength={500}
                rows={4}
                required
                autoFocus
                className="w-full resize-y rounded-xl border border-slate-200 bg-white p-3 text-xs text-slate-700 outline-none transition focus:border-rose-400 focus:ring-4 focus:ring-rose-500/10 dark:border-navy-600 dark:bg-navy-900 dark:text-white"
                placeholder={t('modals.rejection.reasonPlaceholder')}
              />
              <div className="mt-1 flex justify-between text-[10px]">
                {rejectionError ? (
                  <p role="alert" className="font-bold text-rose-600 dark:text-rose-400">
                    {rejectionError}
                  </p>
                ) : (
                  <span />
                )}
                <span className="text-slate-400">{rejectionNote.length}/500</span>
              </div>

              <div className="mt-5 flex justify-end gap-2.5">
                <button
                  type="button"
                  disabled={busyId !== null}
                  onClick={() => {
                    setRejectionRequest(null);
                    setRejectionError('');
                  }}
                  className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-50 disabled:opacity-50 dark:border-navy-600 dark:text-slate-300 dark:hover:bg-navy-700 cursor-pointer"
                >
                  {t('common:buttons.cancel')}
                </button>
                <button
                  type="submit"
                  disabled={busyId !== null || !rejectionNote.trim()}
                  className="inline-flex items-center gap-2 rounded-xl bg-rose-600 px-4 py-2 text-xs font-bold text-white hover:bg-rose-700 disabled:opacity-50 shadow-md shadow-rose-600/20 cursor-pointer"
                >
                  {busyId === rejectionRequest.id && (
                    <FiRefreshCw className="animate-spin" />
                  )}
                  {t('modals.rejection.confirm')}
                </button>
              </div>
            </form>
          </div>,
          document.body,
        )}

      {/* ═══════════════════════════════════════════════════════════════════════
          MODAL 2: COMPETING REQUESTS APPROVAL CONFLICT CONFIRMATION
         ═══════════════════════════════════════════════════════════════════════ */}
      {conflictApproval && mounted &&
        ReactDOM.createPortal(
          <div
            className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-[6px] animate-fadeIn"
            onClick={() => {
              if (!approvingWithConflict) setConflictApproval(null);
            }}
          >
            <div
              ref={conflictPanelRef}
              tabIndex={-1}
              role="dialog"
              aria-modal="true"
              aria-labelledby="conflict-approval-title"
              className="w-full max-w-lg rounded-2xl border border-slate-100 bg-white p-6 shadow-2xl dark:border-navy-700 dark:bg-navy-800 animate-scaleUp"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center gap-2 text-amber-600 dark:text-amber-400 border-b border-slate-100 pb-3 dark:border-navy-700">
                <FiAlertCircle className="h-5 w-5" />
                <h2
                  id="conflict-approval-title"
                  className="text-base font-extrabold text-slate-800 dark:text-white"
                >
                  {t('modals.conflict.title')}
                </h2>
              </div>

              <div className="mt-3 text-xs leading-relaxed text-slate-600 dark:text-slate-300">
                <p>
                  <Trans
                    t={t}
                    i18nKey="modals.conflict.intro"
                    values={{
                      file: `${conflictApproval.target.file_no} — ${conflictApproval.target.file_name}`,
                    }}
                    components={{
                      strong: (
                        <strong className="text-slate-900 dark:text-white font-bold" />
                      ),
                    }}
                  />
                </p>

                {/* Target requester card */}
                <div className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50/70 p-3 dark:border-emerald-800/40 dark:bg-emerald-950/30">
                  <p className="text-[10px] font-black uppercase tracking-wider text-emerald-800 dark:text-emerald-300">
                    {t('modals.conflict.selectedForCheckout')}
                  </p>
                  <div className="mt-1 flex items-center justify-between">
                    <div>
                      <p className="font-bold text-slate-800 dark:text-white">
                        <AttributedUser
                          name={conflictApproval.target.requester_name}
                          deleted={conflictApproval.target.requester_is_deleted}
                        />
                      </p>
                      <p className="text-[10px] text-slate-500">
                        {conflictApproval.target.requester_section ||
                          t('detail.staffFallback')}{' '}
                        •{' '}
                        {t('detail.needed', {
                          date: formatSriLankaDate(
                            conflictApproval.target.request_date,
                          ),
                        })}
                      </p>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      <span className="rounded-full bg-emerald-200/80 px-2.5 py-0.5 text-[10px] font-black text-emerald-900 dark:bg-emerald-900/60 dark:text-emerald-200">
                        {t('detail.priorityLabel', {
                          priority: conflictApproval.target.priority,
                        })}
                      </span>
                      <CompetingBadge
                        info={competingById.get(conflictApproval.target.id)}
                      />
                    </div>
                  </div>
                </div>

                {/* The approve API refuses a request that is not first in line. */}
                {!conflictTargetIsLeader && (
                    <p className="mt-3 rounded-xl border border-rose-200 bg-rose-50/80 p-3 text-[11px] font-bold leading-relaxed text-rose-800 dark:border-rose-800/50 dark:bg-rose-950/35 dark:text-rose-200">
                      {t('modals.conflict.notLeader', {
                        name: attributedNameText(
                          conflictGroup[0]?.requester_name,
                          {
                            deleted: conflictGroup[0]?.requester_is_deleted,
                            label: t('common:deletedUser'),
                          },
                        ),
                      })}
                    </p>
                  )}

                {/* Competing request(s) */}
                <div className="mt-3">
                  <p className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400">
                    {t('modals.conflict.competingPending', {
                      count: conflictApproval.competingRequests.length,
                    })}
                  </p>
                  <div className="mt-1.5 space-y-2">
                    {conflictApproval.competingRequests.map((comp) => (
                      <div
                        key={comp.id}
                        className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 p-2.5 dark:border-navy-600 dark:bg-navy-900/60 text-[11px]"
                      >
                        <div>
                          <p className="font-bold text-slate-700 dark:text-slate-200">
                            <AttributedUser
                              name={comp.requester_name}
                              deleted={comp.requester_is_deleted}
                            />{' '}
                            (
                            {comp.requester_section ||
                              t('detail.staffFallback')})
                          </p>
                          <p className="text-[10px] text-slate-400">
                            {t('modals.conflict.submittedNeeded', {
                              submitted: formatSriLankaDate(comp.created_at),
                              needed: formatSriLankaDate(comp.request_date),
                            })}
                          </p>
                        </div>
                        <div className="flex flex-col items-end gap-1">
                          <span className="rounded-full bg-slate-200 px-2 py-0.5 text-[10px] font-bold text-slate-700 dark:bg-navy-700 dark:text-slate-300">
                            {t('detail.priorityLabel', {
                              priority: comp.priority,
                            })}
                          </span>
                          <CompetingBadge info={competingById.get(comp.id)} />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <div className="mt-6 flex flex-col sm:flex-row items-stretch sm:items-center justify-end gap-2 text-xs">
                <button
                  type="button"
                  disabled={approvingWithConflict}
                  onClick={() => setConflictApproval(null)}
                  className="rounded-xl border border-slate-200 px-3.5 py-2 font-bold text-slate-600 hover:bg-slate-50 dark:border-navy-600 dark:text-slate-300 dark:hover:bg-navy-700 cursor-pointer"
                >
                  {t('common:buttons.cancel')}
                </button>
                <button
                  type="button"
                  disabled={approvingWithConflict || !conflictTargetIsLeader}
                  onClick={() => void handleConfirmConflictApproval()}
                  className={`inline-flex items-center justify-center gap-1.5 rounded-xl px-4 py-2 font-bold shadow-md ${
                    conflictTargetIsLeader
                      ? 'bg-emerald-600 text-white hover:bg-emerald-700 shadow-emerald-600/20 cursor-pointer'
                      : 'bg-slate-200 text-slate-400 shadow-none dark:bg-navy-700 dark:text-slate-500 cursor-not-allowed'
                  }`}
                  title={
                    conflictTargetIsLeader
                      ? t('modals.conflict.approveTooltip')
                      : t('modals.conflict.approveBlockedTooltip')
                  }
                >
                  {approvingWithConflict ? (
                    <FiRefreshCw className="animate-spin" />
                  ) : (
                    <FiCheck />
                  )}
                  {t('modals.conflict.approveAndReject')}
                </button>
              </div>
            </div>
          </div>,
          document.body,
        )}

      {/* ═══════════════════════════════════════════════════════════════════════
          MODAL 3: COMPREHENSIVE REQUEST & REVIEW DETAILS MODAL ("See Details")
         ═══════════════════════════════════════════════════════════════════════ */}
      {selectedDetailRequest && mounted &&
        ReactDOM.createPortal(
          <div
            className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-[6px] animate-fadeIn"
            onClick={() => setSelectedDetailRequest(null)}
          >
            <div
              ref={detailPanelRef}
              tabIndex={-1}
              role="dialog"
              aria-modal="true"
              aria-labelledby="request-detail-title"
              aria-describedby="request-detail-file"
              className="relative w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-3xl border border-slate-100 bg-white p-6 sm:p-7 shadow-2xl dark:border-navy-700 dark:bg-navy-800 animate-scaleUp"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header */}
              <div className="flex items-start justify-between border-b border-slate-100 pb-4 dark:border-navy-700">
                <div className="flex items-center gap-3">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-indigo-50 text-[#4318FF] dark:bg-brand-900/40 dark:text-brand-300 shadow-xs">
                    <FiFileText className="h-5 w-5" />
                  </span>
                  <div>
                    <div className="flex items-center gap-2">
                      <h2
                        id="request-detail-title"
                        className="break-words text-lg font-black text-slate-800 dark:text-white [overflow-wrap:anywhere]"
                        title={selectedDetailRequest.file_no}
                      >
                        {selectedDetailRequest.file_no}
                      </h2>
                      <span
                        className={`rounded-full px-2.5 py-0.5 text-[10px] font-black ${
                          statusClass[selectedDetailRequest.status]
                        }`}
                      >
                        {selectedDetailRequest.status}
                      </span>
                    </div>
                    <p
                      id="request-detail-file"
                      className="break-words text-xs font-semibold text-slate-500 dark:text-slate-400 [overflow-wrap:anywhere]"
                      title={selectedDetailRequest.file_name}
                    >
                      {selectedDetailRequest.file_name}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedDetailRequest(null)}
                  className="rounded-full p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-navy-700 dark:hover:text-white transition cursor-pointer"
                  aria-label={t('detail.closeLabel')}
                >
                  <FiX className="h-5 w-5" />
                </button>
              </div>

              {/* Grid content */}
              <div className="mt-5 space-y-5 text-xs">
                {/* 1. Archive & Storage Location */}
                <div className="rounded-2xl border border-slate-100 bg-slate-50/70 p-4 dark:border-navy-700 dark:bg-navy-900/50">
                  <div className="flex items-center gap-2 text-[11px] font-extrabold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                    <FiMapPin className="text-[#4318FF] dark:text-brand-300" />
                    <span>{t('detail.physicalLocation')}</span>
                  </div>
                  <div className="mt-2 grid gap-3 sm:grid-cols-2">
                    <div>
                      <p className="text-[10px] font-bold text-slate-400">{t('detail.fileSection')}</p>
                      <p className="font-bold text-slate-800 dark:text-white mt-0.5">
                        {selectedDetailRequest.section_name}
                      </p>
                    </div>
                    <div>
                      <p className="text-[10px] font-bold text-slate-400">{t('detail.storageCoordinates')}</p>
                      <p className="font-bold text-slate-800 dark:text-white mt-0.5">
                        {selectedDetailRequest.storage_location}
                      </p>
                    </div>
                  </div>
                </div>

                {/* 2. Staff Requester Details */}
                <div className="rounded-2xl border border-slate-100 bg-slate-50/70 p-4 dark:border-navy-700 dark:bg-navy-900/50">
                  <div className="flex items-center gap-2 text-[11px] font-extrabold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                    <FiUser className="text-[#4318FF] dark:text-brand-300" />
                    <span>{t('detail.staffRequester')}</span>
                  </div>
                  <div className="mt-2 grid gap-3 sm:grid-cols-3">
                    <div>
                      <p className="text-[10px] font-bold text-slate-400">{t('table.staffName')}</p>
                      <p className="font-bold text-slate-800 dark:text-white mt-0.5">
                        <AttributedUser
                          name={selectedDetailRequest.requester_name}
                          deleted={selectedDetailRequest.requester_is_deleted}
                        />
                      </p>
                    </div>
                    <div>
                      <p className="text-[10px] font-bold text-slate-400">{t('table.staffEmail')}</p>
                      <p className="font-medium text-slate-600 dark:text-slate-300 mt-0.5">
                        {isReservedDeletedEmail(selectedDetailRequest.requester_email)
                          ? null
                          : selectedDetailRequest.requester_email}
                      </p>
                    </div>
                    <div>
                      <p className="text-[10px] font-bold text-slate-400">{t('detail.staffSection')}</p>
                      <p className="font-medium text-slate-600 dark:text-slate-300 mt-0.5">
                        {selectedDetailRequest.requester_section || t('detail.noDepartment')}
                      </p>
                    </div>
                  </div>
                </div>

                {/* 3. Request Timeline & Priority */}
                <div className="rounded-2xl border border-slate-100 bg-slate-50/70 p-4 dark:border-navy-700 dark:bg-navy-900/50">
                  <div className="flex items-center gap-2 text-[11px] font-extrabold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                    <FiCalendar className="text-[#4318FF] dark:text-brand-300" />
                    <span>{t('detail.scheduling')}</span>
                  </div>
                  <div className="mt-2 grid gap-3 sm:grid-cols-4">
                    <div>
                      <p className="text-[10px] font-bold text-slate-400">{t('detail.accessNeededDate')}</p>
                      <p className="font-bold text-slate-800 dark:text-white mt-0.5">
                        {formatSriLankaDate(`${selectedDetailRequest.request_date}T00:00:00Z`)}
                      </p>
                    </div>
                    <div>
                      <p className="text-[10px] font-bold text-slate-400">{t('table.duration')}</p>
                      <p className="font-bold text-slate-800 dark:text-white mt-0.5">
                        {selectedDetailRequest.duration_days}{' '}
                        {selectedDetailRequest.duration_days === 1
                          ? t('table.day')
                          : t('table.days')}
                      </p>
                    </div>
                    <div>
                      <p className="text-[10px] font-bold text-slate-400">{t('detail.priorityLevel')}</p>
                      <span
                        className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold mt-0.5 ${
                          priorityStyle[selectedDetailRequest.priority].badgeClass
                        }`}
                      >
                        <FiFlag className="h-3 w-3" />
                        {t('detail.priorityLabel', {
                          priority: t(
                            priorityStyle[selectedDetailRequest.priority].label,
                          ),
                        })}
                      </span>
                      {competingById.get(selectedDetailRequest.id) && (
                        <div className="mt-1 flex flex-wrap items-center gap-1">
                          <CompetingBadge
                            info={competingById.get(selectedDetailRequest.id)}
                          />
                          <CompetingBadge
                            info={competingById.get(selectedDetailRequest.id)}
                            variant="count"
                          />
                        </div>
                      )}
                    </div>
                    <div>
                      <p className="text-[10px] font-bold text-slate-400">{t('detail.submittedTimestamp')}</p>
                      <p className="font-medium text-slate-600 dark:text-slate-300 mt-0.5 text-[11px]">
                        {formatSriLankaDateTime(selectedDetailRequest.created_at)}
                      </p>
                    </div>
                  </div>
                </div>

                {/* 4. Administrative Decision & Review Notes */}
                {selectedDetailRequest.status === 'REJECTED' ? (
                  <div className="rounded-2xl border border-rose-200 bg-rose-50/70 p-4 dark:border-rose-900 dark:bg-rose-950/40">
                    <div className="flex items-center gap-2 text-[11px] font-extrabold uppercase tracking-wider text-rose-700 dark:text-rose-300">
                      <FiXCircle className="h-4 w-4" />
                      <span>{t('detail.rejectionDecision')}</span>
                    </div>
                    <div className="mt-2.5 rounded-xl bg-white p-3.5 dark:bg-navy-900/90 border border-rose-200/60 dark:border-navy-700">
                      <p className="text-[10px] font-black uppercase tracking-wider text-rose-500">
                        {t('detail.reasonForRejection')}
                      </p>
                      <p className="mt-1 text-xs font-bold text-slate-800 dark:text-white leading-relaxed">
                        {selectedDetailRequest.admin_notes || t('detail.noRejectionReason')}
                      </p>
                    </div>
                    <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-[10px] text-rose-800 dark:text-rose-300">
                      <span>
                        <strong>{t('detail.reviewedBy')}</strong>{' '}
                        <AttributedUser
                          name={selectedDetailRequest.reviewer_name}
                          deleted={selectedDetailRequest.reviewer_is_deleted}
                          fallback={t('common:roles.ADMIN')}
                        />
                        {selectedDetailRequest.reviewer_email &&
                          !isReservedDeletedEmail(selectedDetailRequest.reviewer_email) &&
                          ` (${selectedDetailRequest.reviewer_email})`}
                      </span>
                      <span>
                        <strong>{t('detail.reviewedAt')}</strong>{' '}
                        {formatSriLankaDateTime(selectedDetailRequest.reviewed_at || selectedDetailRequest.created_at)}
                      </span>
                    </div>
                  </div>
                ) : selectedDetailRequest.status === 'APPROVED' ? (
                  <div className="rounded-2xl border border-emerald-200 bg-emerald-50/70 p-4 dark:border-emerald-900 dark:bg-emerald-950/40">
                    <div className="flex items-center gap-2 text-[11px] font-extrabold uppercase tracking-wider text-emerald-700 dark:text-emerald-300">
                      <FiCheckCircle className="h-4 w-4" />
                      <span>{t('detail.approvalDecision')}</span>
                    </div>
                    <div className="mt-2.5 rounded-xl bg-white p-3.5 dark:bg-navy-900/90 border border-emerald-200/60 dark:border-navy-700">
                      <p className="text-[10px] font-black uppercase tracking-wider text-emerald-600">
                        {t('detail.approvalRemarks')}
                      </p>
                      <p className="mt-1 text-xs font-semibold text-slate-800 dark:text-white leading-relaxed">
                        {selectedDetailRequest.admin_notes || t('detail.defaultApprovalRemarks')}
                      </p>
                    </div>
                    <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-[10px] text-emerald-800 dark:text-emerald-300">
                      <span>
                        <strong>{t('detail.approvedBy')}</strong>{' '}
                        <AttributedUser
                          name={selectedDetailRequest.reviewer_name}
                          deleted={selectedDetailRequest.reviewer_is_deleted}
                          fallback={t('common:roles.ADMIN')}
                        />
                        {selectedDetailRequest.reviewer_email &&
                          !isReservedDeletedEmail(selectedDetailRequest.reviewer_email) &&
                          ` (${selectedDetailRequest.reviewer_email})`}
                      </span>
                      <span>
                        <strong>{t('detail.approvedAt')}</strong>{' '}
                        {formatSriLankaDateTime(selectedDetailRequest.reviewed_at || selectedDetailRequest.created_at)}
                      </span>
                    </div>
                  </div>
                ) : selectedDetailRequest.status === 'CANCELLED' ? (
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-navy-700 dark:bg-navy-900">
                    <p className="text-[11px] font-extrabold text-slate-600 dark:text-slate-300">
                      {selectedDetailRequest.cancellation_reason ===
                      'Replaced by higher-priority request'
                        ? t('detail.cancelledReplaced')
                        : selectedDetailRequest.cancellation_reason ===
                          'Duplicate pending request consolidated'
                        ? t('detail.cancelledDuplicate')
                        : t('detail.cancelledByStaff')}
                    </p>
                    <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
                      {selectedDetailRequest.cancellation_reason ||
                        t('detail.cancelledReasonFallback')}
                    </p>
                    <p className="mt-2 text-[10px] font-semibold text-slate-400">
                      {t('detail.cancelledNote')}
                    </p>
                  </div>
                ) : (
                  <div className="rounded-2xl border border-amber-200 bg-amber-50/70 p-4 dark:border-amber-900/40 dark:bg-amber-950/30">
                    <p className="text-[11px] font-extrabold text-amber-800 dark:text-amber-300">
                      {t('detail.pendingReview')}
                    </p>
                    <p className="mt-1 text-[11px] text-amber-700 dark:text-amber-400">
                      {t('detail.pendingReviewHint')}
                    </p>
                  </div>
                )}
              </div>

              {/* Bottom footer */}
              <div className="mt-6 flex justify-end border-t border-slate-100 pt-4 dark:border-navy-700">
                <button
                  type="button"
                  onClick={() => setSelectedDetailRequest(null)}
                  className="rounded-xl border border-slate-200 bg-white px-5 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 dark:border-navy-600 dark:bg-navy-700 dark:text-slate-200 cursor-pointer shadow-xs"
                >
                  {t('common:buttons.close')}
                </button>
              </div>
            </div>
          </div>,
          document.body,
        )}

      {/* ═══════════════════════════════════════════════════════════════════════
          MODAL 4: APPROVAL CONFIRMATION
         ═══════════════════════════════════════════════════════════════════════ */}
      {approvalTarget && mounted &&
        ReactDOM.createPortal(
          <div
            className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-[6px] animate-fadeIn"
            onClick={() => {
              if (busyId === null) setApprovalTarget(null);
            }}
          >
            <div
              ref={approvalPanelRef}
              tabIndex={-1}
              role="dialog"
              aria-modal="true"
              aria-labelledby="approve-request-title"
              className="w-full max-w-lg rounded-2xl border border-slate-100 bg-white p-6 shadow-2xl dark:border-navy-700 dark:bg-navy-800 animate-scaleUp"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center gap-2 border-b border-slate-100 pb-3 dark:border-navy-700">
                <FiCheckCircle className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
                <h2
                  id="approve-request-title"
                  className="text-base font-extrabold text-slate-800 dark:text-white"
                >
                  {t('modals.approval.title')}
                </h2>
              </div>

              <p className="mt-3 text-xs leading-relaxed text-slate-500 dark:text-slate-400">
                <Trans
                  t={t}
                  i18nKey="modals.approval.intro"
                  values={{
                    file: `${approvalTarget.file_no} — ${approvalTarget.file_name}`,
                    name: approvalTarget.requester_name,
                  }}
                  components={{
                    strong: (
                      <strong className="font-bold text-slate-800 dark:text-white" />
                    ),
                  }}
                />
              </p>

              <div className="mt-4 grid gap-3 rounded-2xl border border-slate-100 bg-slate-50/70 p-4 text-[11px] dark:border-navy-700 dark:bg-navy-900/50 sm:grid-cols-3">
                <div>
                  <p className="font-bold uppercase tracking-wider text-slate-400">{t('common:labels.section')}</p>
                  <p className="mt-0.5 font-bold text-slate-800 dark:text-white">
                    {approvalTarget.section_name}
                  </p>
                </div>
                <div>
                  <p className="font-bold uppercase tracking-wider text-slate-400">{t('modals.approval.neededOn')}</p>
                  <p className="mt-0.5 font-bold text-slate-800 dark:text-white">
                    {formatSriLankaDate(`${approvalTarget.request_date}T00:00:00Z`)}
                  </p>
                </div>
                <div>
                  <p className="font-bold uppercase tracking-wider text-slate-400">{t('table.duration')}</p>
                  <p className="mt-0.5 font-bold text-slate-800 dark:text-white">
                    {approvalTarget.duration_days}{' '}
                    {approvalTarget.duration_days === 1
                      ? t('table.day')
                      : t('table.days')}
                  </p>
                </div>
              </div>

              <div className="mt-5 flex justify-end gap-2.5">
                <button
                  type="button"
                  disabled={busyId !== null}
                  onClick={() => setApprovalTarget(null)}
                  className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-50 disabled:opacity-50 dark:border-navy-600 dark:text-slate-300 dark:hover:bg-navy-700 cursor-pointer"
                >
                  {t('common:buttons.cancel')}
                </button>
                <button
                  type="button"
                  disabled={busyId !== null}
                  onClick={async () => {
                    const target = approvalTarget;
                    setApprovalTarget(null);
                    await review(target, 'APPROVED');
                  }}
                  className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2 text-xs font-bold text-white hover:bg-emerald-700 disabled:opacity-50 shadow-md shadow-emerald-600/20 cursor-pointer"
                >
                  <FiCheck />
                  {t('modals.approval.confirm')}
                </button>
              </div>
            </div>
          </div>,
          document.body,
        )}

      {/* ═══════════════════════════════════════════════════════════════════════
          MODAL 4b: FILE CURRENTLY ISSUED (server-side availability block)
         ═══════════════════════════════════════════════════════════════════════ */}
      {issuedBlock && mounted &&
        ReactDOM.createPortal(
          <div
            className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-[6px] animate-fadeIn"
            onClick={() => setIssuedBlock(null)}
          >
            <div
              ref={issuedBlockPanelRef}
              tabIndex={-1}
              role="alertdialog"
              aria-modal="true"
              aria-labelledby="issued-block-title"
              className="w-full max-w-lg rounded-2xl border border-rose-200 bg-white p-6 shadow-2xl dark:border-rose-900/60 dark:bg-navy-800 animate-scaleUp"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center gap-2 border-b border-rose-100 pb-3 dark:border-rose-900/50">
                <FiAlertCircle className="h-5 w-5 text-rose-600 dark:text-rose-400" />
                <h2
                  id="issued-block-title"
                  className="text-base font-extrabold text-rose-700 dark:text-rose-300"
                >
                  {t('modals.issuedBlock.title')}
                </h2>
              </div>

              <p className="mt-3 text-xs leading-relaxed text-slate-700 dark:text-slate-200">
                {t('modals.issuedBlock.intro')}
              </p>

              <div className="mt-4 grid gap-3 rounded-2xl border border-rose-100 bg-rose-50/70 p-4 text-[11px] dark:border-rose-900/40 dark:bg-rose-950/25 sm:grid-cols-2">
                <div>
                  <p className="font-bold uppercase tracking-wider text-rose-400">
                    {t('table.fileNumber')}
                  </p>
                  <p className="mt-0.5 font-bold text-slate-800 dark:text-white">
                    {issuedBlock.issuance?.file_no || issuedBlock.blockedFileNo}
                  </p>
                </div>
                <div>
                  <p className="font-bold uppercase tracking-wider text-rose-400">
                    {t('modals.issuedBlock.issuedTo')}
                  </p>
                  <p className="mt-0.5 font-bold text-slate-800 dark:text-white">
                    {issuedBlock.issuance?.holder_name || '—'}
                  </p>
                </div>
                <div>
                  <p className="font-bold uppercase tracking-wider text-rose-400">
                    {t('modals.issuedBlock.issuedDate')}
                  </p>
                  <p className="mt-0.5 font-bold text-slate-800 dark:text-white">
                    {issuedBlock.issuance?.issued_at
                      ? formatSriLankaDateTime(issuedBlock.issuance.issued_at)
                      : t('modals.issuedBlock.missingIssuedAt')}
                  </p>
                </div>
                <div>
                  <p className="font-bold uppercase tracking-wider text-rose-400">
                    {t('modals.issuedBlock.expectedReturn')}
                  </p>
                  <p className="mt-0.5 font-bold text-slate-800 dark:text-white">
                    {issuedBlock.issuance?.expected_return_date
                      ? formatSriLankaDate(
                          `${String(issuedBlock.issuance.expected_return_date).slice(0, 10)}T00:00:00Z`,
                        )
                      : t('modals.issuedBlock.missingExpectedReturn')}
                  </p>
                </div>
              </div>

              <p className="mt-3 text-[11px] font-semibold leading-relaxed text-slate-500 dark:text-slate-400">
                {t('modals.issuedBlock.hint')}
              </p>

              <div className="mt-5 flex justify-end">
                <button
                  type="button"
                  onClick={() => setIssuedBlock(null)}
                  className="inline-flex items-center gap-2 rounded-xl bg-rose-600 px-4 py-2 text-xs font-bold text-white hover:bg-rose-700 shadow-md shadow-rose-600/20 cursor-pointer"
                >
                  <FiX />
                  {t('common:buttons.close')}
                </button>
              </div>
            </div>
          </div>,
          document.body,
        )}

      {/* ═══════════════════════════════════════════════════════════════════════
          MODAL 5: EXTENSION DECISION (approve, or reject with a required reason)
         ═══════════════════════════════════════════════════════════════════════ */}
      {extensionDecision && mounted &&
        ReactDOM.createPortal(
          <div
            className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-[6px] animate-fadeIn"
            onClick={(event) => {
              if (event.target === event.currentTarget && extensionBusyId === null) {
                setExtensionDecision(null);
                setExtensionNoteError('');
              }
            }}
          >
            <form
              ref={extensionDecisionPanelRef}
              tabIndex={-1}
              role="dialog"
              aria-modal="true"
              aria-labelledby="extension-decision-title"
              onSubmit={submitExtensionDecision}
              className="w-full max-w-lg rounded-2xl border border-slate-100 bg-white p-6 shadow-2xl dark:border-navy-700 dark:bg-navy-800 animate-scaleUp"
            >
              <div className="flex items-center justify-between border-b border-slate-100 pb-3 dark:border-navy-700">
                <div
                  className={`flex items-center gap-2 ${
                    extensionDecision.status === 'APPROVED'
                      ? 'text-emerald-600 dark:text-emerald-400'
                      : 'text-rose-600 dark:text-rose-400'
                  }`}
                >
                  {extensionDecision.status === 'APPROVED' ? (
                    <FiCheckCircle className="h-5 w-5" />
                  ) : (
                    <FiXCircle className="h-5 w-5" />
                  )}
                  <h2
                    id="extension-decision-title"
                    className="text-base font-extrabold text-slate-800 dark:text-white"
                  >
                    {extensionDecision.status === 'APPROVED'
                      ? t('modals.extension.approveTitle')
                      : t('modals.extension.rejectTitle')}
                  </h2>
                </div>
                <button
                  type="button"
                  disabled={extensionBusyId !== null}
                  onClick={() => {
                    setExtensionDecision(null);
                    setExtensionNoteError('');
                  }}
                  className="rounded-full p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-navy-700 dark:hover:text-white transition cursor-pointer"
                >
                  <FiX className="h-4 w-4" />
                </button>
              </div>

              <div className="mt-3 space-y-2 text-xs text-slate-600 dark:text-slate-300">
                <p>
                  <Trans
                    t={t}
                    i18nKey="modals.extension.intro"
                    values={{
                      file: `${extensionDecision.target.file_no} — ${extensionDecision.target.file_name}`,
                      name: attributedNameText(
                        extensionDecision.target.requester_name ||
                          extensionDecision.target.requested_by_name,
                        {
                          deleted:
                            extensionDecision.target.requester_is_deleted,
                          label: t('common:deletedUser'),
                        },
                      ),
                    }}
                    components={{ strong: <strong className="text-slate-800 dark:text-white" /> }}
                  />
                </p>
                <div className="flex flex-wrap gap-3 rounded-xl border border-slate-100 bg-slate-50/70 p-3 dark:border-navy-700 dark:bg-navy-900/50">
                  <span className="text-[11px]">
                    <span className="font-bold text-slate-400">
                      {t('modals.extension.currentReturn')}
                    </span>{' '}
                    <span className="font-bold text-slate-800 dark:text-white">
                      {formatSriLankaDate(
                        `${extensionDecision.target.previous_return_date}T00:00:00Z`,
                      )}
                    </span>
                  </span>
                  <span className="text-[11px]">
                    <span className="font-bold text-slate-400">
                      {t('modals.extension.requested')}
                    </span>{' '}
                    <span className="font-black text-rose-600 dark:text-rose-300">
                      {formatSriLankaDate(
                        `${extensionDecision.target.new_return_date}T00:00:00Z`,
                      )}
                    </span>
                  </span>
                </div>
                <div className="rounded-xl border border-slate-100 bg-slate-50/70 p-3 dark:border-navy-700 dark:bg-navy-900/50">
                  <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">
                    {t('modals.extension.staffReason')}
                  </p>
                  <p className="mt-1 whitespace-pre-wrap break-words text-[11px] leading-relaxed">
                    {extensionDecision.target.reason}
                  </p>
                </div>
              </div>

              {extensionDecision.status === 'REJECTED' && (
                <>
                  <label
                    htmlFor="extension-reason"
                    className="mb-1.5 mt-4 block text-[10px] font-extrabold uppercase tracking-wider text-slate-600 dark:text-slate-300"
                  >
                    {t('modals.extension.rejectionReasonLabel')}{' '}
                    <span className="text-rose-500">*</span>
                  </label>
                  <textarea
                    id="extension-reason"
                    value={extensionNote}
                    onChange={(event) => {
                      setExtensionNote(event.target.value);
                      setExtensionNoteError('');
                    }}
                    maxLength={500}
                    rows={4}
                    required
                    autoFocus
                    className="w-full resize-y rounded-xl border border-slate-200 bg-white p-3 text-xs text-slate-700 outline-none transition focus:border-rose-400 focus:ring-4 focus:ring-rose-500/10 dark:border-navy-600 dark:bg-navy-900 dark:text-white"
                    placeholder={t('modals.extension.rejectionReasonPlaceholder')}
                  />
                  {extensionNoteError && (
                    <p role="alert" className="mt-1 text-[10px] font-bold text-rose-600 dark:text-rose-400">
                      {extensionNoteError}
                    </p>
                  )}
                </>
              )}

              {extensionDecision.status === 'APPROVED' && (
                <label className="mt-4 block">
                  <span className="mb-1.5 block text-[10px] font-extrabold uppercase tracking-wider text-slate-600 dark:text-slate-300">
                    {t('modals.extension.approvalNoteLabel')}
                  </span>
                  <textarea
                    value={extensionNote}
                    onChange={(event) => setExtensionNote(event.target.value)}
                    maxLength={500}
                    rows={3}
                    className="w-full resize-y rounded-xl border border-slate-200 bg-white p-3 text-xs text-slate-700 outline-none transition focus:border-emerald-400 focus:ring-4 focus:ring-emerald-500/10 dark:border-navy-600 dark:bg-navy-900 dark:text-white"
                    placeholder={t('modals.extension.approvalNotePlaceholder')}
                  />
                </label>
              )}

              <div className="mt-5 flex justify-end gap-2.5">
                <button
                  type="button"
                  disabled={extensionBusyId !== null}
                  onClick={() => {
                    setExtensionDecision(null);
                    setExtensionNoteError('');
                  }}
                  className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-50 disabled:opacity-50 dark:border-navy-600 dark:text-slate-300 dark:hover:bg-navy-700 cursor-pointer"
                >
                  {t('common:buttons.cancel')}
                </button>
                <button
                  type="submit"
                  disabled={
                    extensionBusyId !== null ||
                    (extensionDecision.status === 'REJECTED' && !extensionNote.trim())
                  }
                  className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-bold text-white disabled:opacity-50 shadow-md cursor-pointer ${
                    extensionDecision.status === 'APPROVED'
                      ? 'bg-emerald-600 hover:bg-emerald-700 shadow-emerald-600/20'
                      : 'bg-rose-600 hover:bg-rose-700 shadow-rose-600/20'
                  }`}
                >
                  {extensionBusyId === extensionDecision.target.id && (
                    <FiRefreshCw className="animate-spin" />
                  )}
                  {extensionDecision.status === 'APPROVED'
                    ? t('modals.extension.confirmApprove')
                    : t('modals.extension.confirmReject')}
                </button>
              </div>
            </form>
          </div>,
          document.body,
        )}

      {/* ═══════════════════════════════════════════════════════════════════════
          MODAL 6: EXTENSION REQUEST FULL DETAILS (read-only)
         ═══════════════════════════════════════════════════════════════════════ */}
      {extensionDetail && mounted &&
        ReactDOM.createPortal(
          <div
            className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-[6px] animate-fadeIn"
            onClick={() => setExtensionDetail(null)}
          >
            <div
              ref={extensionDetailPanelRef}
              tabIndex={-1}
              role="dialog"
              aria-modal="true"
              aria-labelledby="extension-detail-title"
              aria-describedby="extension-detail-file"
              className="relative w-full max-w-xl rounded-3xl border border-slate-100 bg-white p-6 shadow-2xl dark:border-navy-700 dark:bg-navy-800 animate-scaleUp"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-start justify-between border-b border-slate-100 pb-4 dark:border-navy-700">
                <div className="flex items-center gap-3">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-indigo-50 text-[#4318FF] dark:bg-brand-900/40 dark:text-brand-300 shadow-xs">
                    <FiCalendar className="h-5 w-5" />
                  </span>
                  <div>
                    <h2
                      id="extension-detail-title"
                      className="break-words text-lg font-black text-slate-800 dark:text-white [overflow-wrap:anywhere]"
                      title={extensionDetail.file_no}
                    >
                      {extensionDetail.file_no}
                    </h2>
                    <p
                      id="extension-detail-file"
                      className="break-words text-xs font-semibold text-slate-500 dark:text-slate-400 [overflow-wrap:anywhere]"
                      title={extensionDetail.file_name}
                    >
                      {extensionDetail.file_name}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setExtensionDetail(null)}
                  aria-label={t('detail.closeLabel')}
                  className="rounded-full p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-navy-700 dark:hover:text-white transition cursor-pointer"
                >
                  <FiX className="h-5 w-5" />
                </button>
              </div>

              <div className="mt-4 grid gap-3 text-[11px] sm:grid-cols-2">
                {[
                  [t('modals.extensionDetail.extensionId'), `#${extensionDetail.id}`],
                  [t('modals.extensionDetail.fileRequest'), `#${extensionDetail.request_id}`],
                  [
                    t('modals.extensionDetail.staffMember'),
                    `${attributedNameText(
                      extensionDetail.requester_name ||
                        extensionDetail.requested_by_name,
                      {
                        deleted: extensionDetail.requester_is_deleted,
                        label: t('common:deletedUser'),
                      },
                    )}${
                      extensionDetail.requester_section ? ` • ${extensionDetail.requester_section}` : ''
                    }`,
                  ],
                  [t('modals.extensionDetail.submitted'), formatSriLankaDateTime(extensionDetail.created_at)],
                  [
                    t('modals.extensionDetail.currentReturnDate'),
                    formatSriLankaDate(`${extensionDetail.previous_return_date}T00:00:00Z`),
                  ],
                  [
                    t('modals.extensionDetail.requestedReturnDate'),
                    formatSriLankaDate(`${extensionDetail.new_return_date}T00:00:00Z`),
                  ],
                ].map(([label, value]) => (
                  <div
                    key={label}
                    className="rounded-xl border border-slate-100 bg-slate-50/70 p-3 dark:border-navy-700 dark:bg-navy-900/50"
                  >
                    <p className="font-bold uppercase tracking-wider text-slate-400">{label}</p>
                    <p className="mt-0.5 font-bold text-slate-800 dark:text-white">{value}</p>
                  </div>
                ))}
              </div>

              <div className="mt-4 rounded-2xl border border-slate-100 bg-slate-50/70 p-4 dark:border-navy-700 dark:bg-navy-900/50">
                <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">
                  {t('modals.extensionDetail.reasonFromStaff')}
                </p>
                <p className="mt-1 whitespace-pre-wrap break-words text-[11px] leading-relaxed text-slate-700 dark:text-slate-200">
                  {extensionDetail.reason || t('modals.extensionDetail.noReason')}
                </p>
              </div>

              <div className="mt-5 flex justify-end border-t border-slate-100 pt-4 dark:border-navy-700">
                <button
                  type="button"
                  onClick={() => setExtensionDetail(null)}
                  className="rounded-xl border border-slate-200 bg-white px-5 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 dark:border-navy-600 dark:bg-navy-700 dark:text-slate-200 cursor-pointer shadow-xs"
                >
                  {t('common:buttons.close')}
                </button>
              </div>
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}
