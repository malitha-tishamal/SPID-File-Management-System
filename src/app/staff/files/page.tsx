'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  FiSearch,
  FiEye,
  FiMapPin,
  FiCheckCircle,
  FiClock,
  FiXCircle,
  FiCheck,
  FiX,
  FiRefreshCw,
  FiFileText,
  FiChevronLeft,
  FiChevronRight,
  FiArchive,
} from 'react-icons/fi';
import ViewFileModal from 'components/admin/files/ViewFileModal';
import { useProfile } from 'contexts/ProfileContext';
import { formatSriLankaDateTimeCompact } from 'lib/datetime';
import type { FileRecordRow } from 'models/FileRepository';
import { fetchClientSections } from 'lib/sectionsClient';

function getInitials(name?: string | null): string {
  if (!name) return 'SO';
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

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
  return 'bg-[#F4F7FE] text-[#4318FF] border border-[#E0E5F2] dark:bg-navy-900 dark:text-brand-300 dark:border-navy-700';
}

export default function StaffFilesPage() {
  const { profile } = useProfile();

  const [activeTab, setActiveTab] = useState<'all' | 'mine'>('all');
  const [files, setFiles] = useState<FileRecordRow[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [selectedSection, setSelectedSection] = useState<string>('all');
  const [sectionsList, setSectionsList] = useState<{ id?: number | string; name: string }[]>([]);
  const [page, setPage] = useState<number>(1);
  const [total, setTotal] = useState<number>(0);
  const [totalPages, setTotalPages] = useState<number>(1);
  const LIMIT = 15;

  const [viewingFile, setViewingFile] = useState<FileRecordRow | null>(null);

  // Load sections
  useEffect(() => {
    fetchClientSections()
      .then((secs) => {
        if (Array.isArray(secs)) setSectionsList(secs);
      })
      .catch(() => {});
  }, []);

  // Fetch files
  const loadFiles = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        tab: activeTab === 'mine' ? 'recent' : 'all',
        page: String(page),
        limit: String(LIMIT),
        sort: 'newest',
      });

      if (searchTerm.trim()) params.set('search', searchTerm.trim());
      if (selectedSection && selectedSection !== 'all') params.set('section', selectedSection);
      if (activeTab === 'mine' && profile?.id) {
        params.set('registered_by', profile.id);
      }

      const res = await fetch(`/api/admin/files?${params.toString()}`);
      if (res.ok) {
        const json = await res.json();
        if (json?.ok && json.data) {
          setFiles(json.data.files || []);
          setTotal(json.data.total || 0);
          setTotalPages(json.data.totalPages || 1);
        }
      }
    } catch {
      // Fallback
    } finally {
      setLoading(false);
    }
  }, [activeTab, page, searchTerm, selectedSection, profile?.id]);

  useEffect(() => {
    loadFiles();
  }, [loadFiles]);

  return (
    <div className="w-full space-y-5 pb-12 font-dm">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-[#1B2559] dark:text-white">
            View &amp; Search Files
          </h1>
          <p className="text-xs text-slate-400 mt-0.5">
            Browse registered archive records, verify storage locations, and monitor your submission status.
          </p>
        </div>
        <button
          type="button"
          onClick={() => loadFiles()}
          className="inline-flex items-center gap-1.5 self-start sm:self-auto rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-bold text-slate-700 shadow-xs hover:bg-slate-50 dark:border-navy-700 dark:bg-navy-800 dark:text-slate-200 dark:hover:bg-navy-700 transition cursor-pointer"
        >
          <FiRefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
          <span>Refresh</span>
        </button>
      </div>

      {/* Main Container */}
      <div className="rounded-3xl bg-white p-5 shadow-xs border border-slate-100 dark:bg-navy-800 dark:border-navy-700">
        {/* Tab Controls & Filters */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-4 border-b border-slate-100 dark:border-navy-700">
          {/* Tabs */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                setActiveTab('all');
                setPage(1);
              }}
              className={`rounded-xl px-4 py-2 text-xs font-bold transition-all cursor-pointer ${
                activeTab === 'all'
                  ? 'bg-[#4318FF] text-white shadow-md shadow-[#4318FF]/20'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-navy-900 dark:text-slate-300'
              }`}
            >
              All System Files
            </button>
            <button
              type="button"
              onClick={() => {
                setActiveTab('mine');
                setPage(1);
              }}
              className={`rounded-xl px-4 py-2 text-xs font-bold transition-all cursor-pointer ${
                activeTab === 'mine'
                  ? 'bg-[#4318FF] text-white shadow-md shadow-[#4318FF]/20'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-navy-900 dark:text-slate-300'
              }`}
            >
              My Submissions
            </button>
          </div>

          {/* Search & Section Filter */}
          <div className="flex flex-wrap items-center gap-2.5">
            {/* Search Box */}
            <div className="flex h-9 w-60 items-center rounded-xl bg-slate-50 px-3 text-slate-800 dark:bg-navy-900 dark:text-white border border-slate-200 dark:border-navy-700">
              <FiSearch className="h-3.5 w-3.5 text-slate-400 shrink-0" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => {
                  setSearchTerm(e.target.value);
                  setPage(1);
                }}
                placeholder="Search file name, number..."
                className="ml-2 w-full bg-transparent text-xs outline-none placeholder:text-slate-400"
              />
            </div>

            {/* Section Filter */}
            <select
              value={selectedSection}
              onChange={(e) => {
                setSelectedSection(e.target.value);
                setPage(1);
              }}
              className="h-9 max-w-[200px] rounded-xl bg-slate-50 px-3 text-xs font-semibold text-slate-700 dark:bg-navy-900 dark:text-white border border-slate-200 dark:border-navy-700 outline-none cursor-pointer truncate"
            >
              <option value="all" className="dark:bg-navy-800">All Sections</option>
              {sectionsList.map((sec) => (
                <option key={sec.id || sec.name} value={sec.name} className="dark:bg-navy-800">
                  {sec.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Table View */}
        <div className="w-full overflow-x-auto mt-4">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <span className="h-8 w-8 animate-spin rounded-full border-3 border-[#4318FF] border-t-transparent" />
              <p className="mt-3 text-xs font-semibold text-slate-400">Loading files...</p>
            </div>
          ) : files.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100 text-slate-400 dark:bg-navy-900 mb-2">
                <FiFileText className="h-6 w-6" />
              </div>
              <p className="text-sm font-bold text-slate-700 dark:text-slate-300">No files found</p>
              <p className="mt-1 text-xs text-slate-400">
                {activeTab === 'mine'
                  ? "You haven't submitted any files yet. Use 'Add New File' to register a document."
                  : 'No files match your current search or section filter.'}
              </p>
            </div>
          ) : (
            <table className="w-full text-left border-collapse table-auto min-w-[950px] xl:min-w-0">
              <thead>
                <tr className="border-b border-slate-100 dark:border-navy-700 text-[10px] font-black uppercase tracking-wider text-slate-400">
                  <th className="py-2.5 px-2 w-8 text-center">NO</th>
                  <th className="py-2.5 px-2 whitespace-nowrap">FILE NUMBER</th>
                  <th className="py-2.5 px-2 min-w-[170px]">FILE NAME</th>
                  <th className="py-2.5 px-2 w-[140px]">SECTION</th>
                  <th className="py-2.5 px-2">FILE LOCATION</th>
                  <th className="py-2.5 px-2">SUBMITTED BY</th>
                  <th className="py-2.5 px-2 whitespace-nowrap">DATE</th>
                  <th className="py-2.5 px-2 text-center w-[130px] whitespace-nowrap">STATUS</th>
                  <th className="py-2.5 px-2 text-center w-20 whitespace-nowrap">ACTION</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-navy-700 text-xs">
                {files.map((file, idx) => {
                  const isAdmin =
                    file.registrar_role === 'Administrator' ||
                    file.registrar_role === 'Admin' ||
                    (file.registrar_name && file.registrar_name.toLowerCase().includes('admin'));

                  const isPending = file.status === 'PENDING';
                  const isRejected = file.status === 'REJECTED';
                  const isApproved = file.status === 'APPROVED' || file.status === 'active';

                  const locationStr =
                    [
                      file.locker_no,
                      file.shelf_name,
                      file.shelf_position ? `Position: ${file.shelf_position}` : null,
                      !file.locker_no && !file.shelf_name ? file.archive_repository : null,
                    ]
                      .filter(Boolean)
                      .join(' / ') || 'Central Record Room';

                  const rowNo = String((page - 1) * LIMIT + idx + 1).padStart(2, '0');
                  const dateFormatted = file.created_at
                    ? formatSriLankaDateTimeCompact(file.created_at)
                    : 'â€”';

                  return (
                    <tr
                      key={file.id ?? idx}
                      className="hover:bg-slate-50/70 dark:hover:bg-navy-700/50 transition-colors"
                    >
                      {/* NO */}
                      <td className="py-2.5 px-2 text-center font-bold text-slate-400 whitespace-nowrap">
                        {rowNo}
                      </td>

                      {/* FILE NUMBER */}
                      <td className="py-2.5 px-2 whitespace-nowrap">
                        <button
                          type="button"
                          onClick={() => setViewingFile(file)}
                          className="font-bold text-[#4318FF] hover:underline dark:text-brand-300 transition-colors text-left whitespace-nowrap inline-block"
                        >
                          {file.file_no}
                        </button>
                      </td>

                      {/* FILE NAME */}
                      <td className="py-2.5 px-2 font-bold text-[#1B2559] dark:text-white max-w-[190px] truncate" title={file.file_name}>
                        {file.file_name}
                      </td>

                      {/* SECTION */}
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

                      {/* FILE LOCATION */}
                      <td className="py-2.5 px-2">
                        <div
                          className="inline-flex items-start gap-1.5 rounded-xl bg-slate-100/90 px-2.5 py-1 text-[11px] font-semibold text-slate-700 dark:bg-navy-900/90 dark:text-slate-200 border border-slate-200/80 dark:border-navy-700 max-w-[160px] break-words leading-tight"
                          title={locationStr}
                        >
                          <FiMapPin className="h-3.5 w-3.5 text-[#4318FF] dark:text-brand-300 shrink-0 mt-0.5" />
                          <span className="break-words">{locationStr}</span>
                        </div>
                      </td>

                      {/* ADDED BY */}
                      <td className="py-2.5 px-2 whitespace-nowrap">
                        <div className="flex items-center gap-1.5">
                          <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-slate-100 text-[9px] font-bold text-slate-600 dark:bg-navy-900 dark:text-slate-300">
                            {getInitials(file.registrar_name)}
                          </div>
                          <span className="font-semibold text-slate-700 dark:text-slate-200 truncate max-w-[105px] text-[11px]">
                            {file.registrar_name || 'Staff Member'}
                          </span>
                        </div>
                      </td>

                      {/* ADDED DATE */}
                      <td className="py-2.5 px-2 text-[11px] font-medium text-slate-500 dark:text-slate-400 whitespace-nowrap">
                        {dateFormatted}
                      </td>

                      {/* STATUS */}
                      <td className="py-2.5 px-2 text-center whitespace-nowrap">
                        {isAdmin ? (
                          <div className="flex flex-col items-center justify-center gap-0.5">
                            <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 text-blue-700 border border-blue-200 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-800 px-2 py-0.5 text-[10px] font-bold">
                              <FiCheckCircle className="h-3 w-3 stroke-[2.5]" />
                              <span>System Verified</span>
                            </span>
                            <span className="text-[9px] font-semibold text-slate-500 dark:text-slate-400">
                              Admin Added
                            </span>
                          </div>
                        ) : isPending ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-[#FFFBEB] text-[#D97706] border border-[#FDE68A] dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800 px-2.5 py-0.5 text-[10px] font-bold">
                            <span className="text-[9px]">â³</span>
                            <span>Pending Review</span>
                          </span>
                        ) : isRejected ? (
                          <div className="flex flex-col items-center justify-center gap-0.5">
                            <span className="inline-flex items-center gap-1 rounded-full bg-rose-50 text-rose-600 border border-rose-200 dark:bg-rose-950/40 dark:text-rose-400 dark:border-rose-900 px-2 py-0.5 text-[10px] font-bold">
                              <FiX className="h-3 w-3 stroke-[3]" />
                              <span>Rejected</span>
                            </span>
                            <span className="text-[9px] font-semibold text-rose-500 dark:text-rose-400">
                              By Admin
                            </span>
                          </div>
                        ) : (
                          <div className="flex flex-col items-center justify-center gap-0.5">
                            <span className="inline-flex items-center gap-1 rounded-full bg-[#E6F9F0] text-[#05CD99] border border-[#C6F6D5] dark:bg-emerald-950/40 dark:text-emerald-400 dark:border-emerald-900 px-2 py-0.5 text-[10px] font-bold">
                              <FiCheck className="h-3 w-3 stroke-[3]" />
                              <span>Approved</span>
                            </span>
                            <span className="text-[9px] font-semibold text-slate-500 dark:text-slate-400">
                              Admin ({file.approved_by_name || 'Admin'})
                            </span>
                          </div>
                        )}
                      </td>

                      {/* ACTION: Eye Icon (View Full Details & Rejection Reason) */}
                      <td className="py-2.5 px-2 text-center whitespace-nowrap">
                        <button
                          type="button"
                          onClick={() => setViewingFile(file)}
                          className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-bold text-slate-700 shadow-xs hover:border-[#4318FF] hover:bg-slate-50 hover:text-[#4318FF] dark:border-navy-600 dark:bg-navy-800 dark:text-slate-200 dark:hover:bg-navy-700 transition-all cursor-pointer"
                          title="View complete details & decisions"
                        >
                          <FiEye className="h-3.5 w-3.5 text-[#4318FF] dark:text-brand-300" />
                          <span>View</span>
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* Pagination Footer */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between border-t border-slate-100 dark:border-navy-700 pt-4 mt-4 text-xs text-slate-500">
            <div>
              Showing {(page - 1) * LIMIT + 1}â€“{Math.min(page * LIMIT, total)} of {total} files
            </div>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
                className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 dark:border-navy-700 bg-white dark:bg-navy-800 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-50 transition cursor-pointer"
              >
                <FiChevronLeft className="h-4 w-4" />
              </button>
              <span className="px-2 font-bold text-slate-700 dark:text-slate-200">
                {page} / {totalPages}
              </span>
              <button
                type="button"
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
                className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 dark:border-navy-700 bg-white dark:bg-navy-800 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-50 transition cursor-pointer"
              >
                <FiChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* View File Modal */}
      {viewingFile && (
        <ViewFileModal file={viewingFile} onClose={() => setViewingFile(null)} isStaffView={true} />
      )}
    </div>
  );
}
