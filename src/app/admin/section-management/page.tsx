'use client';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  FiPlus,
  FiEdit3,
  FiTrash2,
  FiPower,
  FiSearch,
  FiRefreshCw,
  FiDatabase,
  FiFolder,
  FiClock,
  FiCheckCircle,
} from 'react-icons/fi';
import PageHeader from 'components/admin/PageHeader';
import StatCard from 'components/admin/StatCard';
import ConfirmActionModal from 'components/modals/ConfirmActionModal';
import { useToast } from 'components/toast/ToastContext';
import type { SectionRow, SectionStatus } from 'models/SectionRepository';
import { getSupabaseBrowserClient } from 'config/supabase/client';
import { broadcastAdminSync } from 'components/admin/AccountDirectoryPage';

let memorySections: SectionRow[] | null = null;
let memoryLastFetched = 0;
const CACHE_TTL_MS = 3_000; // 3s freshness; dynamic background revalidation

function invalidateSectionManagementCache() {
  memorySections = null;
  memoryLastFetched = 0;
}

export default function SectionManagementPage() {
  const { showToast } = useToast();

  const [sections, setSections] = useState<SectionRow[]>(() => memorySections || []);
  const [listLoading, setListLoading] = useState(() => memorySections === null);
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState<'all' | SectionStatus>('all');

  const [editSection, setEditSection] = useState<SectionRow | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<SectionRow | null>(null);
  const [disableTarget, setDisableTarget] = useState<SectionRow | null>(null);
  const [loadingId, setLoadingId] = useState<number | null>(null);

  const loadSections = useCallback(async (force = false, silent = false) => {
    const isCached = memorySections !== null;
    const isFresh = isCached && Date.now() - memoryLastFetched < CACHE_TTL_MS;

    if (!silent) {
      if (!isCached || force) {
        setListLoading(true);
      } else if (isFresh) {
        return;
      }
    }

    try {
      const ts = Date.now();
      const res = await fetch(`/api/admin/sections?_t=${ts}`, {
        cache: 'no-store',
        headers: { 'Cache-Control': 'no-cache, no-store, must-revalidate', Pragma: 'no-cache' },
      });
      const json = await res.json();
      if (res.ok && json.ok) {
        memorySections = json.data.sections;
        memoryLastFetched = Date.now();
        setSections(json.data.sections);
      } else if (!silent) {
        showToast({
          type: 'error',
          title: 'Load Failed',
          message: json.message || 'Could not load sections.',
        });
      }
    } catch {
      if (!isCached && !silent) {
        showToast({ type: 'error', title: 'Load Failed', message: 'Could not reach the server.' });
      }
    } finally {
      if (!silent) {
        setListLoading(false);
      }
    }
  }, [showToast]);

  useEffect(() => {
    loadSections(false);

    // 1. Supabase Realtime Channel for live sections database changes
    let channel: any = null;
    try {
      const supabase = getSupabaseBrowserClient();
      channel = supabase
        .channel('realtime:admin-sections')
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'sections' },
          () => {
            void loadSections(true, true);
          }
        )
        .subscribe();
    } catch (err) {
      console.warn('Realtime channel error:', err);
    }

    // 2. Cross-tab sync via BroadcastChannel
    let bc: BroadcastChannel | null = null;
    try {
      bc = new BroadcastChannel('spid_admin_sync');
      bc.onmessage = (event) => {
        if (event.data?.type === 'SECTIONS_UPDATED') {
          void loadSections(true, true);
        }
      };
    } catch {}

    // 3. Storage event sync for multi-window / multi-tab guarantee
    const onStorage = (e: StorageEvent) => {
      if (e.key === 'spid_admin_sync') {
        void loadSections(true, true);
      }
    };
    window.addEventListener('storage', onStorage);

    // 4. Window focus and visibility revalidation
    const onFocus = () => void loadSections(true, true);
    const onVisibility = () => {
      if (document.visibilityState === 'visible') {
        void loadSections(true, true);
      }
    };
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVisibility);

    // 5. Dynamic background silent polling (every 3 seconds)
    const interval = setInterval(() => {
      void loadSections(true, true);
    }, 3000);

    return () => {
      if (channel) {
        try {
          const supabase = getSupabaseBrowserClient();
          supabase.removeChannel(channel);
        } catch {}
      }
      if (bc) {
        try { bc.close(); } catch {}
      }
      window.removeEventListener('storage', onStorage);
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onVisibility);
      clearInterval(interval);
    };
  }, [loadSections]);

  const filtered = useMemo(
    () =>
      sections.filter((s) => {
        const q = search.toLowerCase();
        const matchSearch = s.name.toLowerCase().includes(q) || (s.section_lead || '').toLowerCase().includes(q);
        const matchStatus = filterStatus === 'all' || s.status === filterStatus;
        return matchSearch && matchStatus;
      }),
    [sections, search, filterStatus]
  );

  const stats = useMemo(() => {
    const total = sections.length;
    const approved = sections.filter((s) => s.status === 'approved').length;
    const pending = sections.filter((s) => s.status === 'pending').length;
    const disabled = sections.filter((s) => s.status === 'disabled').length;
    return { total, approved, pending, disabled };
  }, [sections]);

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setLoadingId(deleteTarget.id);
    try {
      const res = await fetch(`/api/admin/sections/${deleteTarget.id}`, { method: 'DELETE' });
      const json = await res.json();
      if (res.ok && json.ok) {
        showToast({
          type: 'success',
          title: 'Section Deleted',
          message: json.message,
        });
        invalidateSectionManagementCache();
        broadcastAdminSync('SECTIONS_UPDATED');
        await loadSections(true);
      } else {
        showToast({
          type: 'error',
          title: 'Delete Failed',
          message: json.message || 'Could not delete section.',
        });
      }
    } catch {
      showToast({ type: 'error', title: 'Delete Failed', message: 'Could not reach the server.' });
    } finally {
      setLoadingId(null);
      setDeleteTarget(null);
    }
  };

  const handleDisable = async () => {
    if (!disableTarget) return;
    setLoadingId(disableTarget.id);
    try {
      const res = await fetch(`/api/admin/sections/${disableTarget.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'disabled' }),
      });
      const json = await res.json();
      if (res.ok && json.ok) {
        showToast({
          type: 'success',
          title: 'Section Disabled',
          message: json.message,
        });
        invalidateSectionManagementCache();
        broadcastAdminSync('SECTIONS_UPDATED');
        await loadSections(true);
      } else {
        showToast({
          type: 'error',
          title: 'Disable Failed',
          message: json.message || 'Could not disable section.',
        });
      }
    } catch {
      showToast({ type: 'error', title: 'Disable Failed', message: 'Could not reach the server.' });
    } finally {
      setLoadingId(null);
      setDisableTarget(null);
    }
  };

  const handleActivate = async (section: SectionRow) => {
    setLoadingId(section.id);
    try {
      const res = await fetch(`/api/admin/sections/${section.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'approved' }),
      });
      const json = await res.json();
      if (res.ok && json.ok) {
        showToast({
          type: 'success',
          title: 'Section Activated',
          message: json.message || `Section "${section.name}" is now active.`,
        });
        invalidateSectionManagementCache();
        broadcastAdminSync('SECTIONS_UPDATED');
        await loadSections(true);
      } else {
        showToast({
          type: 'error',
          title: 'Activation Failed',
          message: json.message || 'Could not activate section.',
        });
      }
    } catch {
      showToast({ type: 'error', title: 'Activation Failed', message: 'Could not reach the server.' });
    } finally {
      setLoadingId(null);
    }
  };

  const handleEditSave = async (payload: { name: string; section_lead?: string | null }) => {
    if (!editSection) return;
    setLoadingId(editSection.id);
    try {
      const res = await fetch(`/api/admin/sections/${editSection.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (res.ok && json.ok) {
        showToast({
          type: 'success',
          title: 'Section Updated',
          message: json.message,
        });
        invalidateSectionManagementCache();
        broadcastAdminSync('SECTIONS_UPDATED');
        await loadSections(true);
        setEditSection(null);
      } else {
        showToast({
          type: 'error',
          title: 'Update Failed',
          message: json.message || 'Could not update section.',
        });
      }
    } catch {
      showToast({ type: 'error', title: 'Update Failed', message: 'Could not reach the server.' });
    } finally {
      setLoadingId(null);
    }
  };

  const handleAddSave = async (payload: { name: string; section_lead?: string }) => {
    setLoadingId(-1);
    try {
      const res = await fetch('/api/admin/sections', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (res.ok && json.ok) {
        showToast({
          type: 'success',
          title: 'Section Created',
          message: json.message,
        });
        invalidateSectionManagementCache();
        broadcastAdminSync('SECTIONS_UPDATED');
        await loadSections(true);
        setShowAddModal(false);
      } else {
        showToast({
          type: 'error',
          title: 'Create Failed',
          message: json.message || 'Could not create section.',
        });
      }
    } catch {
      showToast({ type: 'error', title: 'Create Failed', message: 'Could not reach the server.' });
    } finally {
      setLoadingId(null);
    }
  };

  const getStatusBadge = (status?: SectionStatus) => {
    switch (status) {
      case 'approved':
        return (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-100 px-2.5 py-0.5 text-[10px] font-bold text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
            Active
          </span>
        );
      case 'pending':
        return (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-100 px-2.5 py-0.5 text-[10px] font-bold text-amber-800 dark:bg-amber-900/40 dark:text-amber-300">
            <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
            Pending
          </span>
        );
      case 'disabled':
        return (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-red-100 px-2.5 py-0.5 text-[10px] font-bold text-red-800 dark:bg-red-900/40 dark:text-red-300">
            <span className="h-1.5 w-1.5 rounded-full bg-red-500" />
            Disabled
          </span>
        );
      default:
        return null;
    }
  };

  return (
    <div className="mt-3 flex flex-col gap-5">
      <PageHeader
        crumbs={['Pages', 'System Management', 'Section Management']}
        title="Section Management"
        subtitle="Manage departmental sections, divisions, and their configuration across the irrigation department system."
        right={
          <button
            type="button"
            onClick={() => setShowAddModal(true)}
            className="flex items-center gap-2 rounded-xl bg-[#4318FF] px-4 py-2.5 text-xs font-bold text-white shadow-md shadow-[#4318FF]/25 transition-all hover:bg-brand-600 active:scale-95 cursor-pointer"
          >
            <FiPlus className="h-3.5 w-3.5" /> Add New Section
          </button>
        }
      />

      {/* KPI Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          icon={FiDatabase}
          tone="purple"
          label="Total Sections"
          value={stats.total}
          pill="Sections"
          sub="All departments"
        />
        <StatCard
          icon={FiFolder}
          tone="green"
          label="Active Sections"
          value={stats.approved}
          pill={`${stats.total > 0 ? Math.round((stats.approved / stats.total) * 100) : 0}%`}
          sub="Operational"
        />
        <StatCard
          icon={FiClock}
          tone="blue"
          label="Pending Approval"
          value={stats.pending}
          pill="Action"
          sub="Awaiting review"
        />
        <StatCard
          icon={FiPower}
          tone="red"
          label="Disabled Sections"
          value={stats.disabled}
          pill="Inactive"
          sub="Access restricted"
        />
      </div>

      {/* Filters & Search */}
      <div className="rounded-2xl bg-white p-4 shadow-md shadow-shadow-500 dark:bg-navy-700 dark:shadow-none">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
          <div className="flex h-10 w-full items-center gap-2 rounded-xl bg-[#f4f7fe] px-3 dark:bg-navy-900 lg:max-w-sm border border-slate-300 dark:border-navy-700">
            <FiSearch className="h-4 w-4 shrink-0 text-slate-700 dark:text-gray-300" />
            <input
              type="text"
              placeholder="Search by section name or lead..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{ backgroundColor: 'transparent' }}
              className="h-full w-full !bg-transparent text-xs font-bold text-slate-950 outline-none placeholder:text-slate-600 placeholder:font-medium dark:!bg-transparent dark:text-white dark:placeholder:text-gray-400"
            />
          </div>
          <div className="flex flex-1 flex-wrap items-center gap-2 lg:justify-end">
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value as 'all' | SectionStatus)}
              className="h-9 rounded-xl bg-[#f4f7fe] px-3 text-xs font-extrabold text-slate-950 outline-none border border-slate-300 dark:border-navy-700 dark:bg-navy-900 dark:text-gray-200 cursor-pointer"
            >
              <option value="all">All Statuses</option>
              <option value="approved">Active</option>
              <option value="pending">Pending</option>
              <option value="disabled">Disabled</option>
            </select>
            <button
              onClick={() => loadSections(true)}
              className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#f4f7fe] border border-slate-300 dark:border-navy-700 text-slate-900 transition-colors hover:text-[#4318FF] hover:border-[#4318FF] dark:bg-navy-900 dark:text-gray-200 cursor-pointer"
              title="Refresh"
            >
              <FiRefreshCw className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* Sections Table */}
      <div className="rounded-2xl bg-white shadow-md shadow-shadow-500 dark:bg-navy-700 dark:shadow-none overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50 dark:border-navy-600 dark:bg-navy-800">
                <th className="px-6 py-4 text-[11px] font-bold uppercase tracking-wider text-slate-700 dark:text-gray-300">
                  Section Name
                </th>
                <th className="px-6 py-4 text-[11px] font-bold uppercase tracking-wider text-slate-700 dark:text-gray-300">
                  Status
                </th>
                <th className="px-6 py-4 text-[11px] font-bold uppercase tracking-wider text-slate-700 dark:text-gray-300">
                  Section Lead
                </th>
                <th className="px-6 py-4 text-[11px] font-bold uppercase tracking-wider text-slate-700 dark:text-gray-300">
                  Created
                </th>
                <th className="px-6 py-4 text-[11px] font-bold uppercase tracking-wider text-slate-700 dark:text-gray-300 text-right">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {listLoading ? (
                <tr>
                  <td colSpan={5} className="px-6 py-12 text-center text-sm text-slate-500 dark:text-gray-400">
                    Loading sections...
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-12 text-center text-sm text-slate-500 dark:text-gray-400">
                    No sections match your search/filter criteria.
                  </td>
                </tr>
              ) : (
                filtered.map((section) => (
                  <tr
                    key={section.id}
                    className="border-b border-gray-100 hover:bg-gray-50 dark:border-navy-600 dark:hover:bg-navy-800/50 transition-colors"
                  >
                    <td className="px-6 py-4">
                      <div className="text-sm font-bold text-slate-900 dark:text-white">{section.name}</div>
                    </td>
                    <td className="px-6 py-4">{getStatusBadge(section.status)}</td>
                    <td className="px-6 py-4">
                      <div className="text-sm text-slate-700 dark:text-gray-300">
                        {section.section_lead || '—'}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="text-xs text-slate-500 dark:text-gray-400">
                        {section.created_at ? new Date(section.created_at).toLocaleDateString() : '—'}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        {section.status !== 'approved' && (
                          <button
                            onClick={() => handleActivate(section)}
                            disabled={loadingId === section.id}
                            className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600 transition-colors hover:bg-emerald-100 disabled:opacity-50 dark:bg-emerald-900/30 dark:text-emerald-400 dark:hover:bg-emerald-900/50 cursor-pointer"
                            title="Activate / Approve Section"
                          >
                            <FiCheckCircle className="h-3.5 w-3.5" />
                          </button>
                        )}
                        <button
                          onClick={() => setEditSection(section)}
                          disabled={loadingId === section.id}
                          className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-50 text-blue-600 transition-colors hover:bg-blue-100 disabled:opacity-50 dark:bg-blue-900/30 dark:text-blue-400 dark:hover:bg-blue-900/50 cursor-pointer"
                          title="Edit"
                        >
                          <FiEdit3 className="h-3.5 w-3.5" />
                        </button>
                        {section.status !== 'disabled' && (
                          <button
                            onClick={() => setDisableTarget(section)}
                            disabled={loadingId === section.id}
                            className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-50 text-amber-600 transition-colors hover:bg-amber-100 disabled:opacity-50 dark:bg-amber-900/30 dark:text-amber-400 dark:hover:bg-amber-900/50 cursor-pointer"
                            title="Disable"
                          >
                            <FiPower className="h-3.5 w-3.5" />
                          </button>
                        )}
                        <button
                          onClick={() => setDeleteTarget(section)}
                          disabled={loadingId === section.id}
                          className="flex h-8 w-8 items-center justify-center rounded-lg bg-red-50 text-red-600 transition-colors hover:bg-red-100 disabled:opacity-50 dark:bg-red-900/30 dark:text-red-400 dark:hover:bg-red-900/50 cursor-pointer"
                          title="Delete"
                        >
                          <FiTrash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Delete Confirmation Modal */}
      {deleteTarget && (
        <ConfirmActionModal
          title="Delete Section"
          description={`Are you sure you want to delete "${deleteTarget.name}"? This will permanently remove the section and all associated data. This action cannot be undone.`}
          confirmLabel="Delete Section"
          tone="danger"
          loading={loadingId === deleteTarget.id}
          onConfirm={handleDelete}
          onCancel={() => setDeleteTarget(null)}
        />
      )}

      {/* Disable Confirmation Modal */}
      {disableTarget && (
        <ConfirmActionModal
          title="Disable Section"
          description={`Are you sure you want to disable "${disableTarget.name}"? Once disabled, it cannot be updated or navigated. Pending workflow will remain, creating inconsistent and unusable data for both users and admins.`}
          confirmLabel="Disable Section"
          tone="primary"
          loading={loadingId === disableTarget.id}
          onConfirm={handleDisable}
          onCancel={() => setDisableTarget(null)}
        />
      )}

      {/* Add/Edit Section Modal */}
      {(showAddModal || editSection) && (
        <SectionFormModal
          section={editSection}
          saving={loadingId === (editSection?.id ?? -1)}
          onClose={() => {
            setShowAddModal(false);
            setEditSection(null);
          }}
          onSave={editSection ? handleEditSave : handleAddSave}
        />
      )}
    </div>
  );
}

// Section Form Modal Component
function SectionFormModal({
  section,
  saving,
  onClose,
  onSave,
}: {
  section: SectionRow | null;
  saving: boolean;
  onClose: () => void;
  onSave: (payload: { name: string; section_lead?: string | null }) => Promise<void>;
}) {
  const [name, setName] = useState(section?.name || '');
  const [sectionLead, setSectionLead] = useState(section?.section_lead || '');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    await onSave({
      name: name.trim(),
      section_lead: sectionLead.trim() || null,
    });
  };

  return (
    <div
      className="fixed inset-0 z-[90] flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-sm"
      onClick={() => !saving && onClose()}
    >
      <div
        className="w-full max-w-md rounded-3xl bg-white p-6 shadow-2xl dark:bg-navy-700"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-lg font-bold text-navy-700 dark:text-white mb-4">
          {section ? 'Edit Section' : 'Add New Section'}
        </h3>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="mb-1.5 block text-xs font-semibold text-slate-700 dark:text-slate-200">
              Section Name <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Engineering Central Registry"
              className="w-full rounded-xl bg-[#f4f7fe] dark:bg-navy-900 py-3 px-4 text-sm text-slate-800 dark:text-white border border-transparent focus:border-[#4318FF] focus:outline-none transition-colors"
              disabled={saving}
            />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-semibold text-slate-700 dark:text-slate-200">
              Section Lead (Optional)
            </label>
            <input
              type="text"
              value={sectionLead}
              onChange={(e) => setSectionLead(e.target.value)}
              placeholder="e.g. K. L. Perera"
              className="w-full rounded-xl bg-[#f4f7fe] dark:bg-navy-900 py-3 px-4 text-sm text-slate-800 dark:text-white border border-transparent focus:border-[#4318FF] focus:outline-none transition-colors"
              disabled={saving}
            />
          </div>
          <div className="flex gap-3 mt-6">
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="flex-1 rounded-xl border border-gray-200 bg-white py-2.5 text-sm font-semibold text-gray-600 transition-colors hover:bg-gray-50 disabled:opacity-50 dark:border-navy-600 dark:bg-navy-800 dark:text-gray-300"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving || !name.trim()}
              className="flex-1 rounded-xl bg-[#4318FF] py-2.5 text-sm font-bold text-white shadow transition-colors hover:bg-brand-600 disabled:opacity-60"
            >
              {saving ? 'Saving...' : section ? 'Update Section' : 'Create Section'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
