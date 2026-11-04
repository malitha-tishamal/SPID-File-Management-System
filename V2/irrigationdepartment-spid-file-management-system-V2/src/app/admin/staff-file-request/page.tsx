'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { TABLE_ACTIONS_CLASS, TABLE_BODY_CLASS, TABLE_HEAD_CLASS, TABLE_HIGHLIGHT_CLASS, tableRowClass } from 'lib/tableStyles';
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
import TableLoadingProgressBar from 'components/admin/files/TableLoadingProgressBar';
import { useDialogBehavior } from 'lib/dialogBehavior';
import { formatSriLankaDate, formatSriLankaDateTime } from 'lib/datetime';
import {
  clearQueryParam,
  parseRecordId,
  readQueryParam,
} from 'lib/deep-link';

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
  reviewed_at?: string | null;
  review_note?: string | null;
  created_at: string;
};

const priorityStyle: Record<
  RequestPriority,
  { label: string; className: string; badgeClass: string }
> = {
  HIGH: {
    label: 'High',
    className: 'text-rose-600 dark:text-rose-400',
    badgeClass:
      'bg-rose-100 text-rose-700 dark:bg-rose-900/50 dark:text-rose-300 border border-rose-200 dark:border-rose-800',
  },
  NORMAL: {
    label: 'Normal',
    className: 'text-amber-600 dark:text-amber-400',
    badgeClass:
      'bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-300 border border-amber-200 dark:border-amber-800',
  },
  LOW: {
    label: 'Low',
    className: 'text-blue-600 dark:text-blue-400',
    badgeClass:
      'bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300 border border-blue-200 dark:border-blue-800',
  },
};

const statusClass: Record<RequestStatus, string> = {
  PENDING:
    'bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300 border border-amber-200 dark:border-amber-800/40',
  APPROVED:
    'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800/40',
  REJECTED:
    'bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300 border border-rose-200 dark:border-rose-800/40',
  CANCELLED:
    'bg-slate-100 text-slate-600 dark:bg-navy-700 dark:text-slate-300 border border-slate-200 dark:border-navy-600',
};

function getLocationParts(location: string): string[] {
  return location
    .split(/\s+—\s+/)
    .map((part) => part.trim())
    .filter(Boolean);
}

// Priority numeric weight: HIGH = 3, NORMAL = 2, LOW = 1
const priorityWeight: Record<RequestPriority, number> = {
  HIGH: 3,
  NORMAL: 2,
  LOW: 1,
};

export default function AdminStaffFileRequestPage() {
  const { showToast } = useToast();
  const [activeTab, setActiveTab] = useState<RequestTab>('pending');
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

  // Notification deep links: ?tab=extensions&extension=4, ?tab=pending&request=12
  const [highlightRequestId, setHighlightRequestId] = useState<number | null>(null);
  const [highlightExtensionId, setHighlightExtensionId] = useState<number | null>(null);
  const [deepLinkNotice, setDeepLinkNotice] = useState('');
  const requestLinkHandled = useRef(false);
  const extensionLinkHandled = useRef(false);

  // Escape-to-close and focus handoff for the six dialogs rendered below.
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
        throw new Error(json.message || 'Unable to load staff file requests.');
      if (ticket !== requestTicket.current) return;
      setRequests(json.data?.requests ?? []);
      hasLoadedRequests.current = true;
    } catch (err) {
      if (ticket !== requestTicket.current) return;
      setError(
        err instanceof Error
          ? err.message
          : 'Unable to load staff file requests.',
      );
    } finally {
      if (ticket === requestTicket.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, []);

  const loadExtensions = useCallback(async () => {
    const ticket = ++extensionTicket.current;
    setExtensionsLoading(true);
    setExtensionError('');
    try {
      const response = await fetch('/api/admin/file-request-extensions?status=PENDING');
      const json = await response.json();
      if (!response.ok || !json.ok)
        throw new Error(json.message || 'Unable to load extension requests.');
      if (ticket !== extensionTicket.current) return;
      setExtensions(json.data?.extensions ?? []);
    } catch (err) {
      if (ticket !== extensionTicket.current) return;
      setExtensionError(
        err instanceof Error
          ? err.message
          : 'Unable to load extension requests.',
      );
    } finally {
      if (ticket === extensionTicket.current) {
        setExtensionsLoading(false);
        setExtensionsLoaded(true);
      }
    }
  }, []);

  useEffect(() => {
    void loadRequests();
    void loadExtensions();
  }, [loadRequests, loadExtensions]);

  // Which tab a notification asked for, applied before the rows arrive.
  useEffect(() => {
    const tab = readQueryParam('tab');
    if (tab === 'pending' || tab === 'rejected' || tab === 'extensions') {
      setActiveTab(tab);
    }
  }, []);

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
      setDeepLinkNotice(
        'That request no longer needs a decision here — it has been approved, rejected or withdrawn. The full list is shown instead.',
      );
    }
  }, [loading, requests]);

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

  // Group pending requests by file_no to identify competing requests & leaders
  const competingInfoByFile = useMemo(() => {
    const map = new Map<
      string,
      {
        count: number;
        leaderId: number;
        requests: StaffRequest[];
        isTie: boolean;
      }
    >();

    const pendingRequests = requests.filter((r) => r.status === 'PENDING');

    pendingRequests.forEach((req) => {
      const existing = map.get(req.file_no);
      if (!existing) {
        map.set(req.file_no, {
          count: 1,
          leaderId: req.id,
          requests: [req],
          isTie: false,
        });
      } else {
        existing.count += 1;
        existing.requests.push(req);
      }
    });

    // Sort competing groups:
    // 1. Priority score descending (HIGH > NORMAL > LOW)
    // 2. Tie-breaker: Earliest submission (created_at ascending, FIFO)
    // 3. Immediate need: Earliest request_date ascending
    map.forEach((group) => {
      if (group.count > 1) {
        group.requests.sort((a, b) => {
          const pDiff = priorityWeight[b.priority] - priorityWeight[a.priority];
          if (pDiff !== 0) return pDiff;

          // Tie in priority: Earliest submission wins (FIFO)!
          const timeA = new Date(a.created_at).getTime();
          const timeB = new Date(b.created_at).getTime();
          if (timeA !== timeB) return timeA - timeB;

          return a.request_date.localeCompare(b.request_date);
        });

        group.leaderId = group.requests[0].id;
        group.isTie =
          group.requests.length >= 2 &&
          group.requests[0].priority === group.requests[1].priority;
      }
    });

    return map;
  }, [requests]);

  const review = async (
    request: StaffRequest,
    status: 'APPROVED' | 'REJECTED',
    adminNotes?: string,
  ) => {
    setBusyId(request.id);
    try {
      const response = await fetch(`/api/admin/file-requests/${request.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status, admin_notes: adminNotes }),
      });
      const json = await response.json();
      if (!response.ok || !json.ok)
        throw new Error(json.message || 'Unable to update this request.');

      showToast({
        type: 'success',
        title: `Request ${status.toLowerCase()}`,
        message: json.data?.message,
      });

      const updatedRequest: StaffRequest = {
        ...request,
        status,
        admin_notes: adminNotes?.trim() || null,
        reviewed_at: new Date().toISOString(),
        reviewer_name: json.data?.request?.reviewer_name || 'Administrator',
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
    } catch (err) {
      showToast({
        type: 'error',
        title: 'Request was not updated',
        message: err instanceof Error ? err.message : 'Please try again.',
      });
    } finally {
      setBusyId(null);
    }
  };

  const handleApproveClick = (request: StaffRequest) => {
    const compGroup = competingInfoByFile.get(request.file_no);
    if (compGroup && compGroup.count > 1) {
      // Competing requests exist for this physical file! Open conflict modal
      const otherRequests = compGroup.requests.filter((r) => r.id !== request.id);
      setConflictApproval({
        target: request,
        competingRequests: otherRequests,
      });
    } else {
      // Single request: confirm before the file moves into the issued workflow
      setApprovalTarget(request);
    }
  };

  const handleConfirmConflictApproval = async (autoRejectCompeting: boolean) => {
    if (!conflictApproval) return;
    const { target, competingRequests } = conflictApproval;
    setApprovingWithConflict(true);

    try {
      // 1. Approve target request
      await review(target, 'APPROVED');

      // 2. If autoRejectCompeting is true, reject competing requests with allocation note
      if (autoRejectCompeting && competingRequests.length > 0) {
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
          title: 'Competing requests updated',
          message: `${competingRequests.length} competing request(s) auto-rejected with allocation note.`,
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
      setRejectionError('Enter an official reason for rejecting this request.');
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
      setExtensionNoteError('Enter the reason for rejecting this extension request.');
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
        throw new Error(json.message || 'Unable to update this extension request.');
      }

      showToast({
        type: 'success',
        title: status === 'APPROVED' ? 'Extension approved' : 'Extension rejected',
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
        title: 'Extension was not updated',
        message: err instanceof Error ? err.message : 'Please try again.',
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

  const isExtensionSchemaMissing = /migration|0017|column|table/i.test(
    extensionError,
  );

  return (
    <div className="mx-auto max-w-[1240px] pb-8 pt-2">
      {/* Top Header */}
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <nav
            aria-label="Breadcrumb"
            className="mb-2 block text-[11px] text-slate-400"
          >
            Pages <span className="mx-1.5">/</span> Record Room{' '}
            <span className="mx-1.5">/</span>{' '}
            <span className="font-semibold text-slate-600 dark:text-slate-300">
              Staff File Requests
            </span>
          </nav>
          <h1 className="text-2xl font-extrabold text-slate-800 dark:text-white">
            Staff File Requests
          </h1>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            Review physical file checkout requests submitted by departmental staff. Competing requests for identical files are highlighted by priority.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span className="rounded-full bg-amber-50 px-3 py-2 text-[10px] font-bold text-amber-700 dark:bg-amber-950/40 dark:text-amber-300 border border-amber-200 dark:border-amber-800/40">
            {pendingCount} awaiting review
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
            Refresh
          </button>
        </div>
      </div>

      {/* Workflow tabs */}
      <div
        role="group"
        aria-label="Staff file request views"
        className="mb-4 flex flex-wrap gap-1.5 rounded-2xl border border-slate-100 bg-white p-1.5 shadow-sm dark:border-navy-700 dark:bg-navy-800"
      >
        {(
          [
            { key: 'pending', label: 'Pending Requests', count: pendingRequests.length },
            { key: 'rejected', label: 'Rejected Requests', count: rejectedRequests.length },
            { key: 'extensions', label: 'Extension Requests', count: extensions.length },
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
            {tab.label}
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
        label="Updating staff file requests"
      />

      {error ? (
        <div
          role="alert"
          className="rounded-2xl border border-rose-200 bg-rose-50 p-5 text-sm text-rose-700 dark:border-rose-900 dark:bg-rose-950/30 dark:text-rose-300"
        >
          <p className="font-bold">Could not load requests</p>
          <p className="mt-1 text-xs">{error}</p>
          <button
            type="button"
            onClick={() => void loadRequests()}
            className="mt-3 text-xs font-bold underline"
          >
            Try again
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
          Loading staff file requests…
        </div>
      ) : activeTab === 'extensions' ? (
        extensionError ? (
          <div
            role="alert"
            className="rounded-2xl border border-rose-200 bg-rose-50 p-5 text-sm text-rose-700 dark:border-rose-900 dark:bg-rose-950/30 dark:text-rose-300"
          >
            <p className="font-bold">Could not load extension requests</p>
            <p className="mt-1 text-xs">{extensionError}</p>
            {isExtensionSchemaMissing && (
              <p className="mt-1 text-xs">
                Return-date extensions need the{' '}
                <code className="font-mono">0017</code> database migration applied in
                Supabase.
              </p>
            )}
            <button
              type="button"
              onClick={() => void loadExtensions()}
              className="mt-3 text-xs font-bold underline"
            >
              Try again
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
            Loading extension requests…
          </div>
        ) : extensions.length === 0 ? (
          <div className="rounded-2xl border border-slate-100 bg-white px-5 py-16 text-center dark:border-navy-700 dark:bg-navy-800 shadow-sm">
            <FiCalendar className="mx-auto h-8 w-8 text-slate-300" />
            <p className="mt-3 text-sm font-bold text-slate-700 dark:text-white">
              No extension requests
            </p>
            <p className="mt-1 text-xs text-slate-500">
              Requests from staff to keep a file longer will appear here.
            </p>
          </div>
        ) : (
          <div
              aria-busy={refreshing}
              className="overflow-hidden rounded-2xl border border-slate-100 bg-white dark:border-navy-700 dark:bg-navy-800 shadow-sm"
            >
            <div className="overflow-x-auto">
              <table className="w-full min-w-[900px] text-left border-collapse table-auto xl:table-fixed xl:min-w-0">
                <caption className="sr-only">
                  Return-date extension requests awaiting a decision
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
                    <th scope="col" className="px-2.5 py-3">Req ID</th>
                    <th scope="col" className="px-2.5 py-3">Staff Member</th>
                    <th scope="col" className="px-2.5 py-3">File</th>
                    <th scope="col" className="px-2.5 py-3">Current Return</th>
                    <th scope="col" className="px-2.5 py-3">Requested Return</th>
                    <th scope="col" className="px-2.5 py-3">Requested On</th>
                    <th scope="col" className="px-2.5 py-3">Staff Reason</th>
                    <th scope="col" className="px-2.5 py-3">Status</th>
                    <th scope="col" className="px-2.5 py-3 text-right">Action</th>
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
                      <td className="px-2.5 py-3 font-bold text-slate-500">
                        #{extension.id}
                      </td>
                      <td className="px-2.5 py-3">
                        <p className="font-bold text-slate-800 dark:text-slate-100">
                          {extension.requester_name || extension.requested_by_name}
                        </p>
                        <p className="mt-0.5 text-[10px] text-slate-400">
                          {extension.requester_section || 'No section listed'}
                        </p>
                      </td>
                      <td className="px-2.5 py-3">
                        <p className="font-bold text-[#4318FF] dark:text-brand-300">
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
                            <FiCheck /> Approve
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
                            <FiX /> Reject
                          </button>
                          <button
                            type="button"
                            onClick={() => setExtensionDetail(extension)}
                            title="View full extension details"
                            aria-label="View full extension details"
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
              No rejected requests
            </p>
            <p className="mt-1 text-xs text-slate-500">
              Requests you reject with a reason will be listed here for review.
            </p>
          </div>
        ) : (
          <div
              aria-busy={refreshing}
              className="overflow-hidden rounded-2xl border border-slate-100 bg-white dark:border-navy-700 dark:bg-navy-800 shadow-sm"
            >
            <div className="overflow-x-auto">
              <table className="w-full min-w-[900px] text-left border-collapse table-auto xl:table-fixed xl:min-w-0">
                <caption className="sr-only">
                  Rejected staff file requests
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
                    <th scope="col" className="px-2.5 py-3">Request ID</th>
                    <th scope="col" className="px-2.5 py-3">Staff Name</th>
                    <th scope="col" className="px-2.5 py-3">Department / Section</th>
                    <th scope="col" className="px-2.5 py-3">File Number</th>
                    <th scope="col" className="px-2.5 py-3">File Name</th>
                    <th scope="col" className="px-2.5 py-3">Request Date</th>
                    <th scope="col" className="px-2.5 py-3">Rejection Date</th>
                    <th scope="col" className="px-2.5 py-3">Rejected By</th>
                    <th scope="col" className="px-2.5 py-3 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className={TABLE_BODY_CLASS}>
                  {rejectedRequests.map((request) => (
                    <tr
                      key={request.id}
                      className={tableRowClass(
                        highlightRequestId === request.id && TABLE_HIGHLIGHT_CLASS,
                      )}
                    >
                      <td className="px-2.5 py-3 font-bold text-slate-500">
                        #{request.id}
                      </td>
                      <td className="px-2.5 py-3">
                        <p className="font-bold text-slate-800 dark:text-slate-100">
                          {request.requester_name}
                        </p>
                        <p className="mt-0.5 text-[10px] text-slate-400">
                          {request.requester_email}
                        </p>
                      </td>
                      <td className="px-2.5 py-3 text-slate-600 dark:text-slate-300">
                        {request.requester_section || 'No section listed'}
                      </td>
                      <td className="px-2.5 py-3 font-bold text-[#4318FF] dark:text-brand-300">
                        {request.file_no}
                      </td>
                      <td className="px-2.5 py-3">
                        <p
                          className="break-words font-medium text-slate-600 dark:text-slate-300"
                          title={request.file_name}
                        >
                          {request.file_name}
                        </p>
                        <p className="mt-0.5 text-[10px] text-slate-400">
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
                        {request.reviewer_name || 'Administrator'}
                      </td>
                      <td className="px-2.5 py-3 text-right">
                        <button
                          type="button"
                          onClick={() => setSelectedDetailRequest(request)}
                          title="View full rejected request details"
                          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-[11px] font-bold text-slate-700 shadow-xs hover:border-[#4318FF] hover:bg-slate-50 hover:text-[#4318FF] dark:border-navy-600 dark:bg-navy-800 dark:text-slate-200 dark:hover:bg-navy-700 transition-all cursor-pointer"
                        >
                          <FiEye className="h-3.5 w-3.5 text-[#4318FF] dark:text-brand-300" />
                          <span>View</span>
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )
      ) : pendingRequests.length === 0 ? (
        <div className="rounded-2xl border border-slate-100 bg-white px-5 py-16 text-center dark:border-navy-700 dark:bg-navy-800 shadow-sm">
          <FiClock className="mx-auto h-8 w-8 text-slate-300" />
          <p className="mt-3 text-sm font-bold text-slate-700 dark:text-white">
            No pending staff file requests
          </p>
          <p className="mt-1 text-xs text-slate-500">
            New staff requests will appear here for administrative review.
          </p>
        </div>
      ) : (
        <div
              aria-busy={refreshing}
              className="overflow-hidden rounded-2xl border border-slate-100 bg-white dark:border-navy-700 dark:bg-navy-800 shadow-sm"
            >
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-left border-collapse table-auto xl:table-fixed xl:min-w-0">
              <caption className="sr-only">
                Pending staff file requests awaiting a decision
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
                  <th scope="col" className="px-2.5 py-3">Request ID</th>
                  <th scope="col" className="px-2.5 py-3">File</th>
                  <th scope="col" className="px-2.5 py-3">Staff Member</th>
                  <th scope="col" className="px-2.5 py-3">Location</th>
                  <th scope="col" className="px-2.5 py-3">Request Date</th>
                  <th scope="col" className="px-2.5 py-3">Duration</th>
                  <th scope="col" className="px-2.5 py-3">Priority</th>
                  <th scope="col" className="px-2.5 py-3">Status</th>
                  <th scope="col" className="px-2.5 py-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody className={TABLE_BODY_CLASS}>
                {pendingRequests.map((request) => {
                  const compGroup = competingInfoByFile.get(request.file_no);
                  const isCompeting = compGroup && compGroup.count > 1;
                  const isLeader = isCompeting && compGroup.leaderId === request.id;
                  const isLowerOrLater = isCompeting && !isLeader;

                  return (
                    <tr
                      key={request.id}
                      className={tableRowClass(
                        isLeader &&
                          'border-l-4 border-l-rose-500 bg-rose-50/25 dark:bg-rose-950/20',
                        isLowerOrLater &&
                          'border-l-4 border-l-slate-300 bg-slate-50/30 opacity-65 hover:opacity-100 dark:border-l-slate-600 dark:bg-navy-900/20',
                        highlightRequestId === request.id && TABLE_HIGHLIGHT_CLASS,
                      )}
                    >
                      {/* REQUEST ID column */}
                      <td className="px-2.5 py-3 font-bold text-slate-500">
                        #{request.id}
                      </td>

                      {/* FILE column */}
                      <td className="px-2.5 py-3">
                        <p className="font-bold text-[#4318FF] dark:text-brand-300">
                          {request.file_no}
                        </p>
                        <p
                          className="mt-1 break-words text-slate-600 dark:text-slate-300 font-medium"
                          title={request.file_name}
                        >
                          {request.file_name}
                        </p>
                        <p className="mt-0.5 text-[10px] text-slate-400">
                          {request.section_name}
                        </p>
                        {isCompeting && (
                          <div className="mt-1.5 inline-flex items-center gap-1 rounded-md bg-amber-50 px-2 py-0.5 text-[9px] font-extrabold text-amber-700 dark:bg-amber-950/40 dark:text-amber-300 border border-amber-200 dark:border-amber-800/40">
                            <FiAlertCircle className="h-3 w-3 shrink-0" />
                            <span>
                              Competing: {compGroup.count} requests for this file
                            </span>
                          </div>
                        )}
                      </td>

                      {/* STAFF MEMBER column */}
                      <td className="px-2.5 py-3">
                        <p className="font-bold text-slate-800 dark:text-slate-100">
                          {request.requester_name}
                        </p>
                        <p className="mt-0.5 text-[10px] text-slate-500 dark:text-slate-400">
                          {request.requester_email}
                        </p>
                        <p className="mt-0.5 text-[10px] text-slate-400">
                          {request.requester_section || 'No section listed'}
                        </p>
                      </td>

                      {/* LOCATION column */}
                      <td className="px-2.5 py-3 text-slate-600 dark:text-slate-300">
                        <div
                          className="flex max-w-[220px] flex-wrap items-center gap-x-1 text-[10px] text-slate-500 dark:text-slate-400"
                          title={request.storage_location}
                        >
                          {getLocationParts(request.storage_location).map(
                            (part, index) => (
                              <React.Fragment key={`${part}-${index}`}>
                                {index > 0 && (
                                  <span aria-hidden="true" className="text-slate-300 dark:text-slate-600">
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
                      <td className="px-2.5 py-3 text-slate-600 dark:text-slate-300">
                        <span className="font-semibold">
                          {formatSriLankaDate(`${request.request_date}T00:00:00Z`)}
                        </span>
                        <p className="mt-1 text-[10px] text-slate-400">
                          Submitted {formatSriLankaDate(request.created_at)}
                        </p>
                      </td>

                      {/* DURATION column */}
                      <td className="px-2.5 py-3 text-slate-600 dark:text-slate-300 font-semibold">
                        {request.duration_days}{' '}
                        {request.duration_days === 1 ? 'day' : 'days'}
                      </td>

                      {/* PRIORITY column */}
                      <td className="px-2.5 py-3">
                        <div className="flex flex-col gap-1 items-start">
                          <span
                            className={`inline-flex items-center gap-1.5 font-bold ${
                              priorityStyle[request.priority].className
                            }`}
                          >
                            <FiFlag aria-hidden="true" />
                            {priorityStyle[request.priority].label}
                          </span>

                          {/* Priority competition badge */}
                          {isLeader && (
                            <span
                              className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[9px] font-black ${
                                compGroup.isTie
                                  ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/60 dark:text-amber-200 border border-amber-300'
                                  : 'bg-rose-100 text-rose-700 dark:bg-rose-900/60 dark:text-rose-200 border border-rose-300'
                              }`}
                              title={
                                compGroup.isTie
                                  ? 'Equal priority, granted precedence because it was submitted earlier (FIFO)'
                                  : 'Highest priority among competing requests'
                              }
                            >
                              {compGroup.isTie ? '★ Tie Leader (FIFO)' : '⚡ Highest Priority'}
                            </span>
                          )}

                          {isLowerOrLater && (
                            <span
                              className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[9px] font-semibold text-slate-600 dark:bg-navy-700 dark:text-slate-300 border border-slate-200 dark:border-navy-600"
                              title={
                                compGroup.isTie
                                  ? 'Same priority as leader, but submitted later'
                                  : 'A competing request exists with higher priority'
                              }
                            >
                              {compGroup.isTie
                                ? '⚠️ Same Priority (Later)'
                                : '⚠️ Lower Priority'}
                            </span>
                          )}
                        </div>
                      </td>

                      {/* STATUS column */}
                      <td className="px-2.5 py-3">
                        <span
                          className={`rounded-full px-2.5 py-1 text-[10px] font-extrabold shadow-2xs ${
                            statusClass[request.status]
                          }`}
                        >
                          {request.status}
                        </span>
                      </td>

                      {/* ACTION column */}
                      <td className="px-2.5 py-3 text-right">
                        <div className={TABLE_ACTIONS_CLASS}>
                            <button
                              type="button"
                              disabled={busyId !== null}
                              onClick={() => handleApproveClick(request)}
                              className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-2 py-1.5 text-[10px] font-bold text-white hover:bg-emerald-700 disabled:opacity-50 transition-all shadow-xs cursor-pointer"
                            >
                              <FiCheck /> Approve
                            </button>
                            <button
                              type="button"
                              disabled={busyId !== null}
                              onClick={() => {
                                setRejectionRequest(request);
                                setRejectionNote('');
                                setRejectionError('');
                              }}
                              className="inline-flex items-center gap-1 rounded-lg border border-rose-200 px-2 py-1.5 text-[10px] font-bold text-rose-600 hover:bg-rose-50 disabled:opacity-50 dark:border-rose-900 dark:hover:bg-rose-950/30 transition-all shadow-xs cursor-pointer"
                            >
                              <FiX /> Reject
                            </button>
                            <button
                              type="button"
                              onClick={() => setSelectedDetailRequest(request)}
                              className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-[10px] font-bold text-slate-600 hover:border-[#4318FF] hover:text-[#4318FF] hover:bg-slate-50 dark:border-navy-600 dark:bg-navy-800 dark:text-slate-300 dark:hover:bg-navy-700 transition-all shadow-xs cursor-pointer"
                              title="View full request details"
                              aria-label="View full request details"
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
                    Reject File Request
                  </h2>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setRejectionRequest(null);
                    setRejectionError('');
                  }}
                  disabled={busyId !== null}
                  aria-label="Close rejection dialog"
                  className="rounded-full p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-navy-700 dark:hover:text-white transition cursor-pointer"
                >
                  <FiX className="h-4 w-4" />
                </button>
              </div>

              <p className="mt-3 text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                Add an official review note explaining why{' '}
                <strong className="text-slate-800 dark:text-white font-bold">
                  {rejectionRequest.file_no} — {rejectionRequest.file_name}
                </strong>{' '}
                cannot be checked out. The requester ({rejectionRequest.requester_name}) will see this note in their portal.
              </p>

              <label
                htmlFor="rejection-note"
                className="mb-1.5 mt-4 block text-[10px] font-extrabold uppercase tracking-wider text-slate-600 dark:text-slate-300"
              >
                Rejection Reason / Review Note <span className="text-rose-500">*</span>
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
                placeholder="E.g., File is currently restricted for audit review / Physical file temporarily relocated / Competing request prioritized..."
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
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={busyId !== null || !rejectionNote.trim()}
                  className="inline-flex items-center gap-2 rounded-xl bg-rose-600 px-4 py-2 text-xs font-bold text-white hover:bg-rose-700 disabled:opacity-50 shadow-md shadow-rose-600/20 cursor-pointer"
                >
                  {busyId === rejectionRequest.id && (
                    <FiRefreshCw className="animate-spin" />
                  )}
                  Confirm Rejection
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
                  Competing Request Allocation Notice
                </h2>
              </div>

              <div className="mt-3 text-xs leading-relaxed text-slate-600 dark:text-slate-300">
                <p>
                  You are approving the physical file checkout for{' '}
                  <strong className="text-slate-900 dark:text-white font-bold">
                    {conflictApproval.target.file_no} — {conflictApproval.target.file_name}
                  </strong>
                  .
                </p>

                {/* Target requester card */}
                <div className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50/70 p-3 dark:border-emerald-800/40 dark:bg-emerald-950/30">
                  <p className="text-[10px] font-black uppercase tracking-wider text-emerald-800 dark:text-emerald-300">
                    Selected for Checkout
                  </p>
                  <div className="mt-1 flex items-center justify-between">
                    <div>
                      <p className="font-bold text-slate-800 dark:text-white">
                        {conflictApproval.target.requester_name}
                      </p>
                      <p className="text-[10px] text-slate-500">
                        {conflictApproval.target.requester_section || 'Staff'} • Needed {formatSriLankaDate(conflictApproval.target.request_date)}
                      </p>
                    </div>
                    <span className="rounded-full bg-emerald-200/80 px-2.5 py-0.5 text-[10px] font-black text-emerald-900 dark:bg-emerald-900/60 dark:text-emerald-200">
                      {conflictApproval.target.priority} Priority
                    </span>
                  </div>
                </div>

                {/* Competing request(s) */}
                <div className="mt-3">
                  <p className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400">
                    Competing Pending Request(s) ({conflictApproval.competingRequests.length}):
                  </p>
                  <div className="mt-1.5 space-y-2">
                    {conflictApproval.competingRequests.map((comp) => (
                      <div
                        key={comp.id}
                        className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 p-2.5 dark:border-navy-600 dark:bg-navy-900/60 text-[11px]"
                      >
                        <div>
                          <p className="font-bold text-slate-700 dark:text-slate-200">
                            {comp.requester_name} ({comp.requester_section || 'Staff'})
                          </p>
                          <p className="text-[10px] text-slate-400">
                            Submitted {formatSriLankaDate(comp.created_at)} • Needed on {formatSriLankaDate(comp.request_date)}
                          </p>
                        </div>
                        <span className="rounded-full bg-slate-200 px-2 py-0.5 text-[10px] font-bold text-slate-700 dark:bg-navy-700 dark:text-slate-300">
                          {comp.priority} Priority
                        </span>
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
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={approvingWithConflict}
                  onClick={() => void handleConfirmConflictApproval(false)}
                  className="rounded-xl border border-emerald-300 bg-white px-3.5 py-2 font-bold text-emerald-700 hover:bg-emerald-50 dark:border-emerald-700 dark:bg-navy-800 dark:text-emerald-300 cursor-pointer"
                  title="Approve this request and leave other requests pending"
                >
                  Approve This Only
                </button>
                <button
                  type="button"
                  disabled={approvingWithConflict}
                  onClick={() => void handleConfirmConflictApproval(true)}
                  className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-emerald-600 px-4 py-2 font-bold text-white hover:bg-emerald-700 shadow-md shadow-emerald-600/20 cursor-pointer"
                  title="Approve this request and automatically reject competing requests with allocation note"
                >
                  {approvingWithConflict ? (
                    <FiRefreshCw className="animate-spin" />
                  ) : (
                    <FiCheck />
                  )}
                  Approve &amp; Auto-Reject Competing
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
                        className="text-lg font-black text-slate-800 dark:text-white"
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
                      className="text-xs font-semibold text-slate-500 dark:text-slate-400"
                    >
                      {selectedDetailRequest.file_name}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedDetailRequest(null)}
                  className="rounded-full p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-navy-700 dark:hover:text-white transition cursor-pointer"
                  aria-label="Close details"
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
                    <span>Physical Archive Location</span>
                  </div>
                  <div className="mt-2 grid gap-3 sm:grid-cols-2">
                    <div>
                      <p className="text-[10px] font-bold text-slate-400">File Section</p>
                      <p className="font-bold text-slate-800 dark:text-white mt-0.5">
                        {selectedDetailRequest.section_name}
                      </p>
                    </div>
                    <div>
                      <p className="text-[10px] font-bold text-slate-400">Storage Coordinates</p>
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
                    <span>Staff Requester</span>
                  </div>
                  <div className="mt-2 grid gap-3 sm:grid-cols-3">
                    <div>
                      <p className="text-[10px] font-bold text-slate-400">Staff Name</p>
                      <p className="font-bold text-slate-800 dark:text-white mt-0.5">
                        {selectedDetailRequest.requester_name}
                      </p>
                    </div>
                    <div>
                      <p className="text-[10px] font-bold text-slate-400">Staff Email</p>
                      <p className="font-medium text-slate-600 dark:text-slate-300 mt-0.5">
                        {selectedDetailRequest.requester_email}
                      </p>
                    </div>
                    <div>
                      <p className="text-[10px] font-bold text-slate-400">Staff Section</p>
                      <p className="font-medium text-slate-600 dark:text-slate-300 mt-0.5">
                        {selectedDetailRequest.requester_section || 'No department listed'}
                      </p>
                    </div>
                  </div>
                </div>

                {/* 3. Request Timeline & Priority */}
                <div className="rounded-2xl border border-slate-100 bg-slate-50/70 p-4 dark:border-navy-700 dark:bg-navy-900/50">
                  <div className="flex items-center gap-2 text-[11px] font-extrabold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                    <FiCalendar className="text-[#4318FF] dark:text-brand-300" />
                    <span>Scheduling &amp; Priority</span>
                  </div>
                  <div className="mt-2 grid gap-3 sm:grid-cols-4">
                    <div>
                      <p className="text-[10px] font-bold text-slate-400">Access Needed Date</p>
                      <p className="font-bold text-slate-800 dark:text-white mt-0.5">
                        {formatSriLankaDate(`${selectedDetailRequest.request_date}T00:00:00Z`)}
                      </p>
                    </div>
                    <div>
                      <p className="text-[10px] font-bold text-slate-400">Duration</p>
                      <p className="font-bold text-slate-800 dark:text-white mt-0.5">
                        {selectedDetailRequest.duration_days}{' '}
                        {selectedDetailRequest.duration_days === 1 ? 'day' : 'days'}
                      </p>
                    </div>
                    <div>
                      <p className="text-[10px] font-bold text-slate-400">Priority Level</p>
                      <span
                        className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold mt-0.5 ${
                          priorityStyle[selectedDetailRequest.priority].badgeClass
                        }`}
                      >
                        <FiFlag className="h-3 w-3" />
                        {priorityStyle[selectedDetailRequest.priority].label} Priority
                      </span>
                    </div>
                    <div>
                      <p className="text-[10px] font-bold text-slate-400">Submitted Timestamp (SLST)</p>
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
                      <span>Rejection Decision &amp; Official Review Note</span>
                    </div>
                    <div className="mt-2.5 rounded-xl bg-white p-3.5 dark:bg-navy-900/90 border border-rose-200/60 dark:border-navy-700">
                      <p className="text-[10px] font-black uppercase tracking-wider text-rose-500">
                        Reason for Rejection:
                      </p>
                      <p className="mt-1 text-xs font-bold text-slate-800 dark:text-white leading-relaxed">
                        {selectedDetailRequest.admin_notes || 'No specific rejection reason recorded.'}
                      </p>
                    </div>
                    <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-[10px] text-rose-800 dark:text-rose-300">
                      <span>
                        <strong>Reviewed By:</strong>{' '}
                        {selectedDetailRequest.reviewer_name || 'Administrator'}
                        {selectedDetailRequest.reviewer_email && ` (${selectedDetailRequest.reviewer_email})`}
                      </span>
                      <span>
                        <strong>Reviewed At (SLST):</strong>{' '}
                        {formatSriLankaDateTime(selectedDetailRequest.reviewed_at || selectedDetailRequest.created_at)}
                      </span>
                    </div>
                  </div>
                ) : selectedDetailRequest.status === 'APPROVED' ? (
                  <div className="rounded-2xl border border-emerald-200 bg-emerald-50/70 p-4 dark:border-emerald-900 dark:bg-emerald-950/40">
                    <div className="flex items-center gap-2 text-[11px] font-extrabold uppercase tracking-wider text-emerald-700 dark:text-emerald-300">
                      <FiCheckCircle className="h-4 w-4" />
                      <span>Approval Decision &amp; Fulfillment Record</span>
                    </div>
                    <div className="mt-2.5 rounded-xl bg-white p-3.5 dark:bg-navy-900/90 border border-emerald-200/60 dark:border-navy-700">
                      <p className="text-[10px] font-black uppercase tracking-wider text-emerald-600">
                        Approval Remarks:
                      </p>
                      <p className="mt-1 text-xs font-semibold text-slate-800 dark:text-white leading-relaxed">
                        {selectedDetailRequest.admin_notes || 'Approved for physical archive retrieval without special restrictions.'}
                      </p>
                    </div>
                    <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-[10px] text-emerald-800 dark:text-emerald-300">
                      <span>
                        <strong>Approved By:</strong>{' '}
                        {selectedDetailRequest.reviewer_name || 'Administrator'}
                        {selectedDetailRequest.reviewer_email && ` (${selectedDetailRequest.reviewer_email})`}
                      </span>
                      <span>
                        <strong>Approved At (SLST):</strong>{' '}
                        {formatSriLankaDateTime(selectedDetailRequest.reviewed_at || selectedDetailRequest.created_at)}
                      </span>
                    </div>
                  </div>
                ) : selectedDetailRequest.status === 'CANCELLED' ? (
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-navy-700 dark:bg-navy-900">
                    <p className="text-[11px] font-extrabold text-slate-600 dark:text-slate-300">
                      {selectedDetailRequest.cancellation_reason ===
                      'Replaced by higher-priority request'
                        ? 'Request Replaced by a Higher-Priority Request'
                        : selectedDetailRequest.cancellation_reason ===
                          'Duplicate pending request consolidated'
                        ? 'Duplicate Pending Request Consolidated'
                        : 'Request Cancelled by Staff'}
                    </p>
                    <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
                      {selectedDetailRequest.cancellation_reason ||
                        'This request was cancelled by the staff member before administrative review.'}
                    </p>
                    <p className="mt-2 text-[10px] font-semibold text-slate-400">
                      Cancelled requests cannot be approved. The request history
                      is preserved.
                    </p>
                  </div>
                ) : (
                  <div className="rounded-2xl border border-amber-200 bg-amber-50/70 p-4 dark:border-amber-900/40 dark:bg-amber-950/30">
                    <p className="text-[11px] font-extrabold text-amber-800 dark:text-amber-300">
                      Pending Administrative Review
                    </p>
                    <p className="mt-1 text-[11px] text-amber-700 dark:text-amber-400">
                      This request is currently waiting for an administrator to approve or reject.
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
                  Close
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
                  Accept File Request
                </h2>
              </div>

              <p className="mt-3 text-xs leading-relaxed text-slate-500 dark:text-slate-400">
                Confirm that{' '}
                <strong className="font-bold text-slate-800 dark:text-white">
                  {approvalTarget.file_no} — {approvalTarget.file_name}
                </strong>{' '}
                can be handed over to{' '}
                <strong className="font-bold text-slate-800 dark:text-white">
                  {approvalTarget.requester_name}
                </strong>
                . The request moves into the issued-file workflow with an expected
                return date, and the staff member is notified.
              </p>

              <div className="mt-4 grid gap-3 rounded-2xl border border-slate-100 bg-slate-50/70 p-4 text-[11px] dark:border-navy-700 dark:bg-navy-900/50 sm:grid-cols-3">
                <div>
                  <p className="font-bold uppercase tracking-wider text-slate-400">Section</p>
                  <p className="mt-0.5 font-bold text-slate-800 dark:text-white">
                    {approvalTarget.section_name}
                  </p>
                </div>
                <div>
                  <p className="font-bold uppercase tracking-wider text-slate-400">Needed On</p>
                  <p className="mt-0.5 font-bold text-slate-800 dark:text-white">
                    {formatSriLankaDate(`${approvalTarget.request_date}T00:00:00Z`)}
                  </p>
                </div>
                <div>
                  <p className="font-bold uppercase tracking-wider text-slate-400">Duration</p>
                  <p className="mt-0.5 font-bold text-slate-800 dark:text-white">
                    {approvalTarget.duration_days}{' '}
                    {approvalTarget.duration_days === 1 ? 'day' : 'days'}
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
                  Cancel
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
                  Confirm Acceptance
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
                      ? 'Approve Extension Request'
                      : 'Reject Extension Request'}
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
                  <strong className="text-slate-800 dark:text-white">
                    {extensionDecision.target.file_no} — {extensionDecision.target.file_name}
                  </strong>{' '}
                  requested by{' '}
                  <strong className="text-slate-800 dark:text-white">
                    {extensionDecision.target.requester_name ||
                      extensionDecision.target.requested_by_name}
                  </strong>
                </p>
                <div className="flex flex-wrap gap-3 rounded-xl border border-slate-100 bg-slate-50/70 p-3 dark:border-navy-700 dark:bg-navy-900/50">
                  <span className="text-[11px]">
                    <span className="font-bold text-slate-400">Current return:</span>{' '}
                    <span className="font-bold text-slate-800 dark:text-white">
                      {formatSriLankaDate(
                        `${extensionDecision.target.previous_return_date}T00:00:00Z`,
                      )}
                    </span>
                  </span>
                  <span className="text-[11px]">
                    <span className="font-bold text-slate-400">Requested:</span>{' '}
                    <span className="font-black text-rose-600 dark:text-rose-300">
                      {formatSriLankaDate(
                        `${extensionDecision.target.new_return_date}T00:00:00Z`,
                      )}
                    </span>
                  </span>
                </div>
                <div className="rounded-xl border border-slate-100 bg-slate-50/70 p-3 dark:border-navy-700 dark:bg-navy-900/50">
                  <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">
                    Staff reason
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
                    Rejection Reason <span className="text-rose-500">*</span>
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
                    placeholder="Explain why the return date stays unchanged. The staff member sees this reason."
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
                    Note for the staff member (optional)
                  </span>
                  <textarea
                    value={extensionNote}
                    onChange={(event) => setExtensionNote(event.target.value)}
                    maxLength={500}
                    rows={3}
                    className="w-full resize-y rounded-xl border border-slate-200 bg-white p-3 text-xs text-slate-700 outline-none transition focus:border-emerald-400 focus:ring-4 focus:ring-emerald-500/10 dark:border-navy-600 dark:bg-navy-900 dark:text-white"
                    placeholder="E.g., Approved — please return the file on the new date."
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
                  Cancel
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
                    ? 'Confirm Extension'
                    : 'Confirm Rejection'}
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
                      className="text-lg font-black text-slate-800 dark:text-white"
                    >
                      {extensionDetail.file_no}
                    </h2>
                    <p
                      id="extension-detail-file"
                      className="text-xs font-semibold text-slate-500 dark:text-slate-400"
                    >
                      {extensionDetail.file_name}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setExtensionDetail(null)}
                  aria-label="Close details"
                  className="rounded-full p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-navy-700 dark:hover:text-white transition cursor-pointer"
                >
                  <FiX className="h-5 w-5" />
                </button>
              </div>

              <div className="mt-4 grid gap-3 text-[11px] sm:grid-cols-2">
                {[
                  ['Extension ID', `#${extensionDetail.id}`],
                  ['File request', `#${extensionDetail.request_id}`],
                  [
                    'Staff member',
                    `${extensionDetail.requester_name || extensionDetail.requested_by_name}${
                      extensionDetail.requester_section ? ` • ${extensionDetail.requester_section}` : ''
                    }`,
                  ],
                  ['Submitted', formatSriLankaDateTime(extensionDetail.created_at)],
                  [
                    'Current return date',
                    formatSriLankaDate(`${extensionDetail.previous_return_date}T00:00:00Z`),
                  ],
                  [
                    'Requested return date',
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
                  Reason from staff
                </p>
                <p className="mt-1 whitespace-pre-wrap break-words text-[11px] leading-relaxed text-slate-700 dark:text-slate-200">
                  {extensionDetail.reason || 'No reason recorded.'}
                </p>
              </div>

              <div className="mt-5 flex justify-end border-t border-slate-100 pt-4 dark:border-navy-700">
                <button
                  type="button"
                  onClick={() => setExtensionDetail(null)}
                  className="rounded-xl border border-slate-200 bg-white px-5 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 dark:border-navy-600 dark:bg-navy-700 dark:text-slate-200 cursor-pointer shadow-xs"
                >
                  Close
                </button>
              </div>
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}
