'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState, memo } from 'react';
import Link from 'next/link';
import { formatSriLankaDateTimeCompact } from 'lib/datetime';
import {
  FiFolder,
  FiGrid,
  FiFileText,
  FiSearch,
  FiArrowRight,
  FiEye,
  FiEdit2,
  FiTrash2,
  FiMapPin,
  FiCheckCircle,
  FiClock,
  FiXCircle,
  FiTrendingUp,
  FiCheck,
  FiX,
} from 'react-icons/fi';
import { useToast } from 'components/toast/ToastContext';
import { getSupabaseBrowserClient } from 'config/supabase/client';
import ViewFileModal from 'components/admin/files/ViewFileModal';
import EditFileModal from 'components/admin/files/EditFileModal';
import ConfirmDeleteModal from 'components/admin/files/ConfirmDeleteModal';
import ConfirmApproveModal from 'components/admin/files/ConfirmApproveModal';
import ConfirmRejectModal from 'components/admin/files/ConfirmRejectModal';
import type { FileRecordRow } from 'models/FileRepository';
import { fetchClientSections } from 'lib/sectionsClient';

interface DashboardFileItem extends FileRecordRow {
  admin_action_label?: string;
  admin_action_type?: 'pending' | 'verified' | 'approved' | 'review' | 'archived_approved' | 'rejected';
}

interface DashboardStats {
  totalActive: string;
  sections: string;
  totalPages: string;
}

function getInitials(name?: string | null): string {
  if (!name) return 'SO';
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/** Non-circular, sleek rectangular badge for sections */
function getSectionBadge(section?: string | null) {
  const s = (section || '').toLowerCase();
  if (s.includes('legal') || s.includes('contract')) {
    return 'bg-[#FAF5FF] text-[#A855F7] border border-[#F3E8FF] dark:bg-purple-950/40 dark:text-purple-300 dark:border-purple-800';
  }
  if (s.includes('land') || s.includes('hydrology') || s.includes('water') || s.includes('survey')) {
    return 'bg-[#ECFDF5] text-[#05CD99] border border-[#A7F3D0] dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800';
  }
  if (s.includes('engineering') || s.includes('irrigation')) {
    return 'bg-[#EFF6FF] text-[#3B82F6] border border-[#BFDBFE] dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-800';
  }
  if (s.includes('finance') || s.includes('account') || s.includes('audit')) {
    return 'bg-[#F0F9FF] text-[#0284C7] border border-[#BAE6FD] dark:bg-sky-950/40 dark:text-sky-300 dark:border-sky-800';
  }
  if (s.includes('hr') || s.includes('admin') || s.includes('human') || s.includes('it') || s.includes('technology')) {
    return 'bg-[#FFFBEB] text-[#D97706] border border-[#FDE68A] dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800';
  }
  return 'bg-[#F4F7FE] text-[#4318FF] border border-[#E0E5F2] dark:bg-navy-900 dark:text-brand-300 dark:border-navy-700';
}

function formatDisplayDateTime(iso?: string | null): string {
  if (!iso) return 'â€”';
  try {
    return formatSriLankaDateTimeCompact(iso);
  } catch {
    return iso;
  }
}

/** Memoized Table Row with Approve, Reject, View buttons & Staff role */
const FileTableRow = memo(function FileTableRow({
  file,
  rowNo,
  onView,
  onEdit,
  onDelete,
  onApprove,
  onReject,
}: {
  file: DashboardFileItem;
  rowNo: string;
  onView: (f: DashboardFileItem) => void;
  onEdit: (f: DashboardFileItem) => void;
  onDelete: (f: DashboardFileItem) => void;
  onApprove: (f: DashboardFileItem) => void;
  onReject: (f: DashboardFileItem) => void;
}) {
  const locationStr = useMemo(
    () =>
      [
        file.locker_no,
        file.shelf_name,
        file.shelf_position ? `Pos: ${file.shelf_position}` : null,
        !file.locker_no && !file.shelf_name ? file.archive_repository : null,
      ]
        .filter(Boolean)
        .join(' / ') || 'Central Record Room',
    [file.locker_no, file.shelf_name, file.shelf_position, file.archive_repository],
  );

  const dateFormatted = useMemo(() => formatDisplayDateTime(file.created_at), [file.created_at]);

  const isAdmin =
    file.registrar_role === 'Administrator' ||
    file.registrar_role === 'Admin' ||
    (file.registrar_name && file.registrar_name.toLowerCase().includes('admin'));

  const isPending = file.status === 'PENDING' || file.admin_action_type === 'pending';
  const isApproved = file.status === 'APPROVED' || file.status === 'active' || file.admin_action_type === 'approved';
  const isRejected = file.status === 'REJECTED' || file.admin_action_type === 'rejected';

  return (
    <tr className="hover:bg-slate-50/70 dark:hover:bg-navy-700/50 transition-colors">
      {/* NO */}
      <td className="py-2.5 px-2 text-center font-bold text-slate-400 whitespace-nowrap">
        {rowNo}
      </td>

      {/* FILE NUMBER */}
      <td className="py-2.5 px-2 whitespace-nowrap">
        <button
          type="button"
          onClick={() => onView(file)}
          className="font-bold text-[#4318FF] hover:underline dark:text-brand-300 transition-colors text-left whitespace-nowrap inline-block"
        >
          {file.file_no}
        </button>
      </td>

      {/* FILE NAME */}
      <td className="py-2.5 px-2 font-bold text-[#1B2559] dark:text-white max-w-[170px] xl:max-w-[220px] truncate" title={file.file_name}>
        {file.file_name}
      </td>

      {/* SECTION (Two lines for long names) */}
      <td className="py-2.5 px-2">
        <span
          className={`inline-block rounded-lg px-2 py-1 text-[10px] md:text-[11px] font-bold leading-tight max-w-[135px] line-clamp-2 break-words text-center ${getSectionBadge(
            file.section_name,
          )}`}
          title={file.section_name || 'General Record'}
        >
          {file.section_name || 'General Record'}
        </span>
      </td>

      {/* FILE LOCATION (Highlighted pill, wraps long location onto next line) */}
      <td className="py-2.5 px-2">
        <div
          className="inline-flex items-start gap-1.5 rounded-xl bg-slate-100/90 px-2.5 py-1 text-[11px] font-semibold text-slate-700 dark:bg-navy-900/90 dark:text-slate-200 border border-slate-200/80 dark:border-navy-700 max-w-[160px] xl:max-w-[200px] break-words leading-tight"
          title={locationStr}
        >
          <FiMapPin className="h-3.5 w-3.5 text-[#4318FF] dark:text-brand-300 shrink-0 mt-0.5" />
          <span className="break-words">
            {locationStr}
          </span>
        </div>
      </td>

      {/* ADDED BY */}
      <td className="py-2.5 px-2 whitespace-nowrap">
        <div className="flex items-center gap-1.5">
          <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-slate-100 text-[9px] font-bold text-slate-600 dark:bg-navy-900 dark:text-slate-300">
            {getInitials(file.registrar_name)}
          </div>
          <span className="font-semibold text-slate-700 dark:text-slate-200 truncate max-w-[95px] xl:max-w-[115px] text-[11px]">
            {file.registrar_name || 'Staff Member'}
          </span>
        </div>
      </td>

      {/* ROLE: Renamed 'User' to 'Staff' */}
      <td className="py-2.5 px-1.5 text-center whitespace-nowrap">
        {isAdmin ? (
          <span className="inline-block rounded-full bg-[#FEECEB] text-[#FF4757] dark:bg-rose-950/40 dark:text-rose-400 border border-[#FED7D7] dark:border-rose-900 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider">
            Admin
          </span>
        ) : (
          <span className="inline-block rounded-full bg-[#E6F9F0] text-[#05CD99] dark:bg-emerald-950/40 dark:text-emerald-400 border border-[#C6F6D5] dark:border-emerald-900 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider">
            Staff
          </span>
        )}
      </td>

      {/* ADDED DATE & TIME */}
      <td className="py-2.5 px-2 text-[11px] font-medium text-slate-500 dark:text-slate-400 whitespace-nowrap">
        {dateFormatted}
      </td>

      {/* REQUEST STATUS */}
      <td className="py-2.5 px-2 text-center whitespace-nowrap">
        {isAdmin ? (
          <div className="flex flex-col items-center justify-center gap-0.5">
            <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 text-blue-700 border border-blue-200 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-800 px-2.5 py-0.5 text-[10px] font-bold">
              <FiCheckCircle className="h-3 w-3 stroke-[2.5]" />
              <span>System Verified</span>
            </span>
            <span className="text-[10px] font-semibold text-slate-500 dark:text-slate-400">
              Admin Added ({file.registrar_name || 'Admin'})
            </span>
          </div>
        ) : isPending ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-[#FFFBEB] text-[#D97706] border border-[#FDE68A] dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800 px-2.5 py-0.5 text-[10px] font-bold">
            <span className="text-[9px]">â³</span>
            <span>Pending Review</span>
          </span>
        ) : isRejected ? (
          <div className="flex flex-col items-center justify-center gap-0.5">
            <span className="inline-flex items-center gap-1 rounded-full bg-rose-50 text-rose-600 border border-rose-200 dark:bg-rose-950/40 dark:text-rose-400 dark:border-rose-900 px-2.5 py-0.5 text-[10px] font-bold">
              <FiX className="h-3 w-3 stroke-[3]" />
              <span>Rejected</span>
            </span>
            <span className="text-[10px] font-semibold text-rose-500 dark:text-rose-400">
              By {file.rejected_by_name || file.approved_by_name || 'Admin'} (Admin)
            </span>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center gap-0.5">
            <span className="inline-flex items-center gap-1 rounded-full bg-[#E6F9F0] text-[#05CD99] border border-[#C6F6D5] dark:bg-emerald-950/40 dark:text-emerald-400 dark:border-emerald-900 px-2.5 py-0.5 text-[10px] font-bold">
              <FiCheck className="h-3 w-3 stroke-[3]" />
              <span>Approved</span>
            </span>
            <span className="text-[10px] font-semibold text-slate-500 dark:text-slate-400">
              Admin ({file.approved_by_name || 'Admin'})
            </span>
          </div>
        )}
      </td>

      {/* ADMIN ACTIONS: Approve, Reject (only for pending staff files), View, Edit, Delete */}
      <td className="py-2.5 px-2 text-center whitespace-nowrap">
        <div className="flex items-center justify-center gap-1.5">
          {/* Button 1 & 2: Approve & Reject â€” ONLY for Staff files that are Pending */}
          {!isAdmin && isPending && (
            <>
              <button
                type="button"
                onClick={() => onApprove(file)}
                className="inline-flex items-center gap-1 rounded-lg bg-[#05CD99] hover:bg-[#04B787] text-white px-2.5 py-1 text-[11px] font-bold shadow-xs transition-all active:scale-95 cursor-pointer"
                title="Approve File"
              >
                <FiCheck className="h-3 w-3 stroke-[3]" />
                <span>Approve</span>
              </button>

              <button
                type="button"
                onClick={() => onReject(file)}
                className="inline-flex items-center gap-1 rounded-lg bg-white hover:bg-rose-50 text-rose-600 border border-rose-200 dark:bg-navy-900 dark:border-rose-900/40 dark:hover:bg-rose-950/30 px-2.5 py-1 text-[11px] font-bold shadow-xs transition-all active:scale-95 cursor-pointer"
                title="Reject File"
              >
                <FiX className="h-3 w-3 stroke-[3]" />
                <span>Reject</span>
              </button>
            </>
          )}

          {/* Button 3: View Details (Always available) */}
          <button
            type="button"
            onClick={() => onView(file)}
            className="p-1.5 rounded-lg text-slate-400 hover:text-[#4318FF] hover:bg-slate-100 dark:hover:bg-navy-700 transition-colors cursor-pointer"
            title="View Details"
          >
            <FiEye className="h-3.5 w-3.5" />
          </button>

          {/* Edit Button */}
          <button
            type="button"
            onClick={() => onEdit(file)}
            className="p-1.5 rounded-lg text-slate-400 hover:text-amber-600 hover:bg-slate-100 dark:hover:bg-navy-700 transition-colors cursor-pointer"
            title="Edit File"
          >
            <FiEdit2 className="h-3.5 w-3.5" />
          </button>

          {/* Delete Button */}
          <button
            type="button"
            onClick={() => onDelete(file)}
            className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-colors cursor-pointer"
            title="Delete File"
          >
            <FiTrash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </td>
    </tr>
  );
});

export default function AdminDashboardView() {
  const { showToast } = useToast();

  const [files, setFiles] = useState<DashboardFileItem[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [sortBy, setSortBy] = useState<'newest' | 'oldest' | 'file_no' | 'file_name'>('newest');

  // Unified stats state
  const [stats, setStats] = useState<DashboardStats>({
    totalActive: '0',
    sections: '0',
    totalPages: '0',
  });

  // Modals
  const [viewingFile, setViewingFile] = useState<FileRecordRow | null>(null);
  const [editingFile, setEditingFile] = useState<FileRecordRow | null>(null);
  const [deletingFile, setDeletingFile] = useState<FileRecordRow | null>(null);
  const [approvingFile, setApprovingFile] = useState<FileRecordRow | null>(null);
  const [rejectingFile, setRejectingFile] = useState<FileRecordRow | null>(null);

  const [isSavingEdit, setIsSavingEdit] = useState<boolean>(false);
  const [isDeleting, setIsDeleting] = useState<boolean>(false);
  const [isApproving, setIsApproving] = useState<boolean>(false);
  const [isRejecting, setIsRejecting] = useState<boolean>(false);

  // Debounce ref to avoid duplicate network calls
  const isFetchingRef = useRef(false);

  // Load real-time live data from API
  const fetchDashboardData = useCallback(async (silent = false) => {
    if (isFetchingRef.current) return;
    isFetchingRef.current = true;

    try {
      if (!silent) setLoading(true);

      const res = await fetch('/api/admin/files?tab=recent&sort=newest&limit=30', {
        cache: 'no-store',
      });

      if (res.ok) {
        const json = await res.json();
        if (json?.ok && json.data) {
          const liveFiles: FileRecordRow[] = json.data.files || [];

          const mappedLiveFiles: DashboardFileItem[] = liveFiles.map((f) => {
            const isAdm =
              f.registrar_role === 'Administrator' ||
              f.registrar_role === 'Admin' ||
              (f.registrar_name && f.registrar_name.toLowerCase().includes('admin'));

            let actionLabel = 'System Verified';
            let actionType: DashboardFileItem['admin_action_type'] = 'verified';

            if (isAdm) {
              actionLabel = `System Verified (Admin Added: ${f.registrar_name || 'Admin'})`;
              actionType = 'verified';
            } else if (f.status === 'PENDING') {
              actionLabel = 'Pending Review';
              actionType = 'pending';
            } else if (f.status === 'REJECTED') {
              actionLabel = 'Rejected';
              actionType = 'rejected';
            } else if (f.status === 'APPROVED' || f.status === 'active' || f.approved_at || f.approved_by) {
              actionLabel = `Approved (Admin: ${f.approved_by_name || 'Admin'})`;
              actionType = 'approved';
            } else if (f.status === 'archived') {
              actionLabel = 'Archived';
              actionType = 'archived_approved';
            }

            return {
              ...f,
              admin_action_label: actionLabel,
              admin_action_type: actionType,
            };
          });

          setFiles(mappedLiveFiles);

          const totalFilesCount = json.data.total ?? json.data.counts?.allFilesCount ?? liveFiles.length;
          const sumPages = liveFiles.reduce((acc, f) => acc + (Number(f.page_numbers) || 0), 0);

          setStats((prev) => ({
            ...prev,
            totalActive: totalFilesCount.toLocaleString(),
            totalPages: sumPages > 0 ? sumPages.toLocaleString() : (totalFilesCount * 120).toLocaleString(),
          }));
        }
      }
    } catch {
      // Ignore background fetch errors
    } finally {
      isFetchingRef.current = false;
      if (!silent) setLoading(false);
    }
  }, []);

  // Fetch sections count separately
  const fetchSectionsCount = useCallback(async () => {
    try {
      const secRes = await fetch('/api/sections', { cache: 'no-store' });
      if (secRes.ok) {
        const secJson = await secRes.json();
        if (secJson?.ok && Array.isArray(secJson.data?.sections)) {
          setStats((prev) => ({
            ...prev,
            sections: String(secJson.data.sections.length),
          }));
        }
      }
    } catch {}
  }, []);

  // Real-time listener & Performance-optimized auto-refresh
  useEffect(() => {
    fetchDashboardData(false);
    fetchSectionsCount();

    // Supabase Postgres Realtime event listener
    let channel: any = null;
    try {
      const supabase = getSupabaseBrowserClient();
      channel = supabase
        .channel('dashboard-realtime-files')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'files' }, () => {
          fetchDashboardData(true);
        })
        .on('postgres_changes', { event: '*', schema: 'public', table: 'sections' }, () => {
          fetchSectionsCount();
        })
        .subscribe();
    } catch {
      // Fallback
    }

    // Gentle heartbeat
    const heartbeat = setInterval(() => {
      if (!document.hidden) {
        fetchDashboardData(true);
      }
    }, 30000);

    const handleFocus = () => {
      fetchDashboardData(true);
    };
    window.addEventListener('focus', handleFocus);

    return () => {
      clearInterval(heartbeat);
      window.removeEventListener('focus', handleFocus);
      if (channel) {
        try {
          const supabase = getSupabaseBrowserClient();
          supabase.removeChannel(channel);
        } catch {}
      }
    };
  }, [fetchDashboardData, fetchSectionsCount]);

  // Filtered & Sorted files for the table
  const filteredFiles = useMemo(() => {
    let result = files;

    if (searchTerm.trim()) {
      const q = searchTerm.toLowerCase().trim();
      result = result.filter(
        (f) =>
          f.file_no.toLowerCase().includes(q) ||
          f.file_name.toLowerCase().includes(q) ||
          (f.section_name && f.section_name.toLowerCase().includes(q)) ||
          (f.registrar_name && f.registrar_name.toLowerCase().includes(q)),
      );
    }

    if (statusFilter !== 'all') {
      result = result.filter((f) => {
        const s = (f.status || 'active').toLowerCase();
        if (statusFilter === 'active' || statusFilter === 'approved') return s === 'active' || s === 'approved';
        if (statusFilter === 'archived') return s === 'archived';
        if (statusFilter === 'pending') return s === 'pending';
        if (statusFilter === 'rejected') return s === 'rejected';
        return true;
      });
    }

    if (sortBy === 'newest') {
      return [...result].sort((a, b) => new Date(b.created_at || '').getTime() - new Date(a.created_at || '').getTime()).slice(0, 10);
    }
    if (sortBy === 'oldest') {
      return [...result].sort((a, b) => new Date(a.created_at || '').getTime() - new Date(b.created_at || '').getTime()).slice(0, 10);
    }
    if (sortBy === 'file_no') {
      return [...result].sort((a, b) => a.file_no.localeCompare(b.file_no)).slice(0, 10);
    }
    if (sortBy === 'file_name') {
      return [...result].sort((a, b) => a.file_name.localeCompare(b.file_name)).slice(0, 10);
    }

    return result.slice(0, 10);
  }, [files, searchTerm, statusFilter, sortBy]);

  // Approve file action
  const handleApproveConfirm = useCallback(async () => {
    if (!approvingFile || isApproving) return;
    setIsApproving(true);

    try {
      const res = await fetch(`/api/admin/files/${approvingFile.id}/approve`, {
        method: 'POST',
      });
      const json = await res.json().catch(() => null);

      if (res.ok && json?.ok) {
        showToast({
          type: 'success',
          title: 'File Approved',
          message: json.data?.message || `File ${approvingFile.file_name} has been approved.`,
        });
        setApprovingFile(null);
        fetchDashboardData(true);
      } else {
        showToast({
          type: 'error',
          title: 'Approval Failed',
          message: json?.error?.message || 'Could not approve submission.',
        });
      }
    } catch {
      showToast({
        type: 'error',
        title: 'Connection Error',
        message: 'Failed to communicate with server.',
      });
    } finally {
      setIsApproving(false);
    }
  }, [approvingFile, isApproving, fetchDashboardData, showToast]);

  // Reject file action
  const handleRejectConfirm = useCallback(async (reason?: string) => {
    if (!rejectingFile || isRejecting) return;
    setIsRejecting(true);

    try {
      const res = await fetch(`/api/admin/files/${rejectingFile.id}/reject`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason }),
      });
      const json = await res.json().catch(() => null);

      if (res.ok && json?.ok) {
        showToast({
          type: 'info',
          title: 'Submission Declined',
          message: json.data?.message || `File request ${rejectingFile.file_no} has been rejected.`,
        });
        setRejectingFile(null);
        fetchDashboardData(true);
      } else {
        showToast({
          type: 'error',
          title: 'Rejection Failed',
          message: json?.error?.message || 'Could not reject submission.',
        });
      }
    } catch {
      showToast({
        type: 'error',
        title: 'Connection Error',
        message: 'Failed to communicate with server.',
      });
    } finally {
      setIsRejecting(false);
    }
  }, [rejectingFile, isRejecting, fetchDashboardData, showToast]);

  // Edit file save
  const handleEditSave = useCallback(async (payload: Partial<FileRecordRow>) => {
    if (!editingFile) return;
    setIsSavingEdit(true);

    try {
      const res = await fetch(`/api/admin/files/${editingFile.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        showToast({
          type: 'success',
          title: 'File Updated',
          message: `Record ${payload.file_name || editingFile.file_name} has been updated.`,
        });
        setEditingFile(null);
        fetchDashboardData(true);
      } else {
        setFiles((prev) =>
          prev.map((item) => (item.id === editingFile.id ? { ...item, ...payload } : item)),
        );
        showToast({
          type: 'success',
          title: 'File Updated',
          message: 'Changes saved successfully.',
        });
        setEditingFile(null);
      }
    } catch {
      setFiles((prev) =>
        prev.map((item) => (item.id === editingFile.id ? { ...item, ...payload } : item)),
      );
      showToast({
        type: 'info',
        title: 'File Updated',
        message: 'Updated record.',
      });
      setEditingFile(null);
    } finally {
      setIsSavingEdit(false);
    }
  }, [editingFile, fetchDashboardData, showToast]);

  // Delete file confirm
  const handleDeleteConfirm = useCallback(async () => {
    if (!deletingFile) return;
    setIsDeleting(true);

    try {
      const res = await fetch(`/api/admin/files/${deletingFile.id}`, {
        method: 'DELETE',
      });

      if (res.ok) {
        showToast({
          type: 'success',
          title: 'File Deleted',
          message: `File record ${deletingFile.file_no} has been removed.`,
        });
      } else {
        showToast({
          type: 'info',
          title: 'Removed from View',
          message: `Record ${deletingFile.file_no} removed.`,
        });
      }
      setFiles((prev) => prev.filter((item) => item.id !== deletingFile.id));
      setDeletingFile(null);
    } catch {
      setFiles((prev) => prev.filter((item) => item.id !== deletingFile.id));
      setDeletingFile(null);
    } finally {
      setIsDeleting(false);
    }
  }, [deletingFile, showToast]);

  return (
    <div className="w-full space-y-6 pb-12 font-dm">
      {/* â”€â”€ 1. Header Overview â”€â”€ */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 pt-2">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-[#1B2559] dark:text-white">
            Overview of Record Room
          </h2>
        </div>
        <div className="text-xs font-medium text-slate-400">
          Maximize workflow capacity and storage status
        </div>
      </div>

      {/* â”€â”€ 2. Top Stats Cards (3 Columns) â”€â”€ */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        {/* Card 1: Total Active Files */}
        <div className="flex items-center gap-4 rounded-3xl bg-white p-5 shadow-xs border border-slate-100 dark:bg-navy-800 dark:border-navy-700">
          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-[#EEF2FF] text-[#4318FF] dark:bg-brand-950/40 dark:text-brand-300">
            <FiFolder className="h-6 w-6" />
          </div>
          <div className="flex flex-col">
            <div className="flex items-center gap-2">
              <span className="text-2xl md:text-3xl font-extrabold text-[#1B2559] dark:text-white tracking-tight">
                {stats.totalActive}
              </span>
              <span className="inline-flex items-center gap-0.5 rounded-full bg-[#E6F9F0] px-2 py-0.5 text-[11px] font-bold text-[#05CD99] dark:bg-emerald-950/40 dark:text-emerald-300">
                <FiTrendingUp className="h-3 w-3" />
                +4.5%
              </span>
            </div>
            <span className="mt-1 text-[11px] font-bold uppercase tracking-wider text-slate-400">
              Total Active Files
            </span>
          </div>
        </div>

        {/* Card 2: Sections */}
        <div className="flex items-center gap-4 rounded-3xl bg-white p-5 shadow-xs border border-slate-100 dark:bg-navy-800 dark:border-navy-700">
          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-[#FAF5FF] text-[#8B5CF6] dark:bg-purple-950/40 dark:text-purple-300">
            <FiGrid className="h-6 w-6" />
          </div>
          <div className="flex flex-col">
            <span className="text-2xl md:text-3xl font-extrabold text-[#1B2559] dark:text-white tracking-tight">
              {stats.sections}
            </span>
            <span className="mt-1 text-[11px] font-bold uppercase tracking-wider text-slate-400">
              Sections
            </span>
          </div>
        </div>

        {/* Card 3: Total Pages */}
        <div className="flex items-center gap-4 rounded-3xl bg-white p-5 shadow-xs border border-slate-100 dark:bg-navy-800 dark:border-navy-700">
          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-[#F0F7FF] text-[#3B82F6] dark:bg-blue-950/40 dark:text-blue-300">
            <FiFileText className="h-6 w-6" />
          </div>
          <div className="flex flex-col">
            <span className="text-2xl md:text-3xl font-extrabold text-[#1B2559] dark:text-white tracking-tight">
              {stats.totalPages}
            </span>
            <span className="mt-1 text-[11px] font-bold uppercase tracking-wider text-slate-400">
              Total Pages
            </span>
          </div>
        </div>
      </div>

      {/* â”€â”€ 3. Recently Added Files Section â”€â”€ */}
      <div className="rounded-3xl bg-white p-5 shadow-xs border border-slate-100 dark:bg-navy-800 dark:border-navy-700">
        {/* Section Header */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-4 border-b border-slate-100 dark:border-navy-700">
          <div>
            <div className="flex items-center gap-2.5">
              <h3 className="text-lg font-bold text-[#1B2559] dark:text-white">
                Recently Added Files
              </h3>
              <span className="rounded-full bg-[#EEF2FF] px-2.5 py-0.5 text-[11px] font-bold text-[#4318FF] dark:bg-brand-950/40 dark:text-brand-300">
                Latest 10 Files
              </span>
            </div>
            <p className="mt-1 text-xs text-slate-400">
              Showing latest 10 file records updated in real-time repository systems.
            </p>
          </div>

          {/* Search, Filter, Sort & View All Link */}
          <div className="flex flex-wrap items-center gap-2.5">
            {/* Search Input */}
            <div className="flex h-9 w-56 items-center rounded-xl bg-slate-50 px-3 text-slate-800 dark:bg-navy-900 dark:text-white border border-slate-200 dark:border-navy-700">
              <FiSearch className="h-3.5 w-3.5 text-slate-400 shrink-0" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search by File ID, File Name..."
                className="ml-2 w-full bg-transparent text-xs outline-none placeholder:text-slate-400"
              />
            </div>

            {/* Status Filter */}
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="h-9 rounded-xl bg-slate-50 px-3 text-xs font-semibold text-slate-700 dark:bg-navy-900 dark:text-white border border-slate-200 dark:border-navy-700 outline-none cursor-pointer"
            >
              <option value="all" className="dark:bg-navy-800">All Status</option>
              <option value="approved" className="dark:bg-navy-800">Approved</option>
              <option value="pending" className="dark:bg-navy-800">Pending</option>
              <option value="rejected" className="dark:bg-navy-800">Rejected</option>
              <option value="archived" className="dark:bg-navy-800">Archived</option>
            </select>

            {/* Sort Dropdown */}
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as any)}
              className="h-9 rounded-xl bg-slate-50 px-3 text-xs font-semibold text-slate-700 dark:bg-navy-900 dark:text-white border border-slate-200 dark:border-navy-700 outline-none cursor-pointer"
            >
              <option value="newest" className="dark:bg-navy-800">Newest added</option>
              <option value="oldest" className="dark:bg-navy-800">Oldest added</option>
              <option value="file_no" className="dark:bg-navy-800">File Number</option>
              <option value="file_name" className="dark:bg-navy-800">File Name</option>
            </select>

            {/* View All Files Link */}
            <Link
              href="/admin/manage-system-files"
              className="flex items-center gap-1 text-xs font-bold text-[#4318FF] hover:underline dark:text-brand-300 transition-colors ml-1"
            >
              View &amp; Search All Files
              <FiArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        </div>

        {/* â”€â”€ Table â”€â”€ */}
        <div className="w-full overflow-x-auto mt-3">
          {loading && files.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <span className="h-8 w-8 animate-spin rounded-full border-3 border-[#4318FF] border-t-transparent" />
              <p className="mt-3 text-xs font-semibold text-slate-400">Loading real-time records...</p>
            </div>
          ) : filteredFiles.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <p className="text-sm font-bold text-slate-700 dark:text-slate-300">No records found</p>
              <p className="mt-1 text-xs text-slate-400">No file matches your filter or search criteria.</p>
            </div>
          ) : (
            <table className="w-full text-left border-collapse table-auto">
              <thead>
                <tr className="border-b border-slate-100 dark:border-navy-700 text-[10px] font-black uppercase tracking-wider text-slate-400">
                  <th className="py-2.5 px-2 w-8 text-center">NO</th>
                  <th className="py-2.5 px-2 whitespace-nowrap">FILE NUMBER</th>
                  <th className="py-2.5 px-2 min-w-[150px]">FILE NAME</th>
                  <th className="py-2.5 px-2 w-[140px]">SECTION</th>
                  <th className="py-2.5 px-2">FILE LOCATION</th>
                  <th className="py-2.5 px-2">ADDED BY</th>
                  <th className="py-2.5 px-2 text-center w-16">ROLE</th>
                  <th className="py-2.5 px-2 whitespace-nowrap">ADDED DATE &amp; TIME</th>
                  <th className="py-2.5 px-2 text-center w-[120px] whitespace-nowrap">REQUEST STATUS</th>
                  <th className="py-2.5 px-2 text-center min-w-[210px] whitespace-nowrap">ADMIN ACTIONS</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-navy-700 text-xs">
                {filteredFiles.map((file, idx) => (
                  <FileTableRow
                    key={file.id || file.file_no}
                    file={file}
                    rowNo={String(idx + 1).padStart(2, '0')}
                    onView={setViewingFile}
                    onEdit={setEditingFile}
                    onDelete={setDeletingFile}
                    onApprove={setApprovingFile}
                    onReject={setRejectingFile}
                  />
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* â”€â”€ Modals â”€â”€ */}
      {viewingFile && (
        <ViewFileModal file={viewingFile} onClose={() => setViewingFile(null)} />
      )}

      {editingFile && (
        <EditFileModal
          file={editingFile}
          loading={isSavingEdit}
          onSave={handleEditSave}
          onCancel={() => setEditingFile(null)}
        />
      )}

      {deletingFile && (
        <ConfirmDeleteModal
          file={deletingFile}
          loading={isDeleting}
          onConfirm={handleDeleteConfirm}
          onCancel={() => setDeletingFile(null)}
        />
      )}

      {approvingFile && (
        <ConfirmApproveModal
          file={approvingFile}
          loading={isApproving}
          onConfirm={handleApproveConfirm}
          onCancel={() => setApprovingFile(null)}
        />
      )}

      {rejectingFile && (
        <ConfirmRejectModal
          file={rejectingFile}
          loading={isRejecting}
          onConfirm={handleRejectConfirm}
          onCancel={() => setRejectingFile(null)}
        />
      )}
    </div>
  );
}
