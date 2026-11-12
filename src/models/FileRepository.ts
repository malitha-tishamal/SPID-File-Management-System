import type { SupabaseClient } from '@supabase/supabase-js';
import {
  isValidYmd,
  sriLankaDayEndIso,
  sriLankaDayStartIso,
  sriLankaTodayStart,
} from 'lib/datetime';

export type FileStatus =
  | 'PENDING'
  | 'APPROVED'
  | 'REJECTED'
  | 'active'
  | 'archived'
  | 'issued'
  | 'disposed'
  | 'disabled';

export interface FileRecordRow {
  id?: number;
  file_no: string;
  file_name: string;
  section_name: string;
  /** ISO date string YYYY-MM-DD */
  start_date: string;
  /** ISO date string YYYY-MM-DD */
  end_date: string;
  locker_no?: string | null;
  /** Shelf identifier */
  shelf_name?: string | null;
  shelf_position?: 'Front' | 'Middle' | 'Back' | null;
  page_numbers?: number;
  minute_sheets_count?: number;
  registrar_name?: string | null;
  registrar_role?: string | null;
  /** User who registered the file */
  registered_by?: string | null;
  /** Alias: created_by */
  created_by?: string | null;
  approved_by?: string | null;
  approved_by_name?: string | null;
  approved_at?: string | null;
  /** Admin-entered reason for rejecting the submission */
  reject_reason?: string | null;
  /** Timestamp when the rejection was recorded */
  rejected_at?: string | null;
  /** Display name of the admin who rejected the submission */
  rejected_by_name?: string | null;
  /** The registrar/approver account was soft-deleted; their name is kept. */
  registrar_is_deleted?: boolean;
  approver_is_deleted?: boolean;
  is_deleted?: boolean;
  deleted_at?: string | null;
  deleted_by?: string | null;
  deletion_reason?: string | null;
  status?: FileStatus;
  created_at?: string;
  updated_at?: string;
}

export interface FileFilterOptions {
  tab?: 'requests' | 'all' | 'rejected' | 'recent' | 'deleted';
  status?: string;
  search?: string;
  section?: string;
  storage?: string;
  officer?: string;
  registered_by?: string;
  date?: string;
  dateFrom?: string;
  dateTo?: string;
  sort?: 'newest' | 'oldest' | 'file_no' | 'file_name';
  page?: number;
  limit?: number;
}

export interface FileCountsSummary {
  totalArchives: number;
  todayCount: number;
  allFilesCount: number;
  pendingCount: number;
  rejectedCount?: number;
  deletedCount?: number;
  totalPageNumbers?: number;
}

export interface FileDependentCounts {
  fileRequests: number;
  fileRequestExtensions: number;
  activeCheckouts?: number;
  returnedCheckouts?: number;
  auditLogs?: number;
  canDelete?: boolean;
}

export interface DeletedFileResult extends FileDependentCounts {
  outcome: 'deleted' | 'not_found';
  fileId: number;
  fileNo: string;
  fileName: string;
  auditId: number | null;
}

/** Columns required for list/table views (avoids select * on large rows). */
export const FILE_LIST_SELECT =
  'id,file_no,file_name,section_name,start_date,end_date,locker_no,shelf_name,shelf_position,page_numbers,minute_sheets_count,registrar_name,registrar_role,registered_by,created_by,approved_by,approved_by_name,reject_reason,rejected_at,rejected_by_name,approved_at,status,created_at,updated_at';

export const FILE_LIST_SELECT_WITH_DELETED =
  `${FILE_LIST_SELECT},is_deleted,deleted_at,deleted_by,deletion_reason`;

/**
 * Strip characters that carry grammar meaning inside PostgREST `or=(...)`
 * filters, so user input cannot alter the filter expression.
 */
function sanitizeFilterTerm(value: string): string {
  return value
    .replace(/[,()*"\\]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * True when a Supabase/Postgres error means a unique constraint was violated.
 * Repositories wrap driver errors in plain Errors, so the code may only
 * survive in the message text.
 */
export function isUniqueViolation(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const { code, message, details } = err as {
    code?: string;
    message?: string;
    details?: string;
  };
  if (code === '23505') return true;
  return /duplicate key value|unique constraint|uq_files_file_no_live/i.test(
    `${message ?? ''} ${details ?? ''}`,
  );
}

/** True when Postgres refused a delete because another row still references it. */
export function isForeignKeyViolation(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const { code, message, details } = err as {
    code?: string;
    message?: string;
    details?: string;
  };
  if (code === '23503') return true;
  return /violates foreign key constraint|foreign_key_violation/i.test(
    `${message ?? ''} ${details ?? ''}`,
  );
}

/** Model layer: File and physical record repository */
export class FileRepository {
  private client: SupabaseClient;
  constructor(client: SupabaseClient) {
    this.client = client;
  }

  /** Service-role enrichment: mark rows whose author was soft-deleted. */
  private async markDeletedAuthors(files: FileRecordRow[]): Promise<FileRecordRow[]> {
    if (files.length === 0) return files;
    const ids = new Set<string>();
    for (const file of files) {
      for (const id of [file.registered_by, file.created_by, file.approved_by]) {
        if (id) ids.add(id);
      }
    }
    if (ids.size === 0) return files;

    let deleted = new Set<string>();
    try {
      const { data, error } = await this.client
        .from('profiles')
        .select('id, is_deleted')
        .in('id', Array.from(ids));
      if (!error) {
        deleted = new Set(
          (data ?? [])
            .filter((row: { is_deleted?: boolean | null }) => row.is_deleted === true)
            .map((row: { id: string }) => row.id),
        );
      }
    } catch {
      // Migration 0027 not applied yet — records remain unmarked.
    }

    if (deleted.size === 0) return files;
    for (const file of files) {
      file.registrar_is_deleted =
        (!!file.registered_by && deleted.has(file.registered_by)) ||
        (!!file.created_by && deleted.has(file.created_by));
      file.approver_is_deleted = !!file.approved_by && deleted.has(file.approved_by);
    }
    return files;
  }

  /** Look up a file by its primary key id */
  async findById(id: number): Promise<FileRecordRow | null> {
    const { data, error } = await this.client
      .from('files')
      .select('*')
      .eq('id', id)
      .maybeSingle();

    if (error) {
      console.error('FileRepository.findById error:', error);
      return null;
    }
    if (!data) return null;
    const [file] = await this.markDeletedAuthors([data as FileRecordRow]);
    return file ?? null;
  }

  /** Every row sharing this file number, case-insensitive. */
  private async selectByFileNo(fileNo: string): Promise<FileRecordRow[]> {
    let res = await this.client
      .from('files')
      .select(FILE_LIST_SELECT_WITH_DELETED)
      .ilike('file_no', fileNo.trim());

    if (
      res.error &&
      ((res.error as { code?: string }).code === '42703' ||
        res.error.message?.includes('is_deleted'))
    ) {
      res = (await this.client
        .from('files')
        .select(FILE_LIST_SELECT)
        .ilike('file_no', fileNo.trim())) as typeof res;
    }

    if (res.error) {
      console.error('FileRepository.selectByFileNo error:', res.error);
      return [];
    }
    return (res.data as unknown as FileRecordRow[]) ?? [];
  }

  /** The live record that owns this file number, if any. */
  async findLiveByFileNo(fileNo: string): Promise<FileRecordRow | null> {
    const rows = await this.selectByFileNo(fileNo);
    return rows.find((row) => row.status !== 'REJECTED' && !row.is_deleted) ?? null;
  }

  /** Look up a file by its file_no, preferring the live record over rejected or deleted ones */
  async findByFileNo(fileNo: string): Promise<FileRecordRow | null> {
    const rows = await this.selectByFileNo(fileNo);
    return (
      rows.find((row) => row.status !== 'REJECTED' && !row.is_deleted) ??
      rows.find((row) => !row.is_deleted) ??
      rows[0] ??
      null
    );
  }

  /** Create a new file record */
  async create(
    payload: Omit<FileRecordRow, 'id' | 'created_at' | 'updated_at'>,
  ): Promise<FileRecordRow> {
    const { data, error } = await this.client
      .from('files')
      .insert([payload])
      .select()
      .single();

    if (error) {
      throw error;
    }
    return data as FileRecordRow;
  }

  /** Batch insert multiple file records */
  async createMany(
    payloads: Array<Omit<FileRecordRow, 'id' | 'created_at' | 'updated_at'>>,
  ): Promise<FileRecordRow[]> {
    if (!payloads.length) return [];
    const { data, error } = await this.client
      .from('files')
      .insert(payloads)
      .select();

    if (error) {
      throw error;
    }
    return (data as unknown as FileRecordRow[]) ?? [];
  }

  /** Live file numbers that already exist, lower-cased for comparison. */
  async findExistingLiveFileNos(fileNos: string[]): Promise<Set<string>> {
    const cleanFileNos = [
      ...new Set(fileNos.map((n) => n.trim()).filter(Boolean)),
    ];
    if (!cleanFileNos.length) return new Set();

    const { data, error } = await this.client
      .from('files')
      .select('file_no, status')
      .in('file_no', cleanFileNos);

    if (error) throw error;
    return new Set(
      (data ?? [])
        .filter((record: { status?: string }) => record.status !== 'REJECTED')
        .map((record: { file_no: string }) =>
          record.file_no.trim().toLowerCase(),
        ),
    );
  }

  async list(limit = 100): Promise<FileRecordRow[]> {
    const { data, error } = await this.client
      .from('files')
      .select(FILE_LIST_SELECT)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) {
      console.error('FileRepository.list error:', error);
      return [];
    }
    return (data as unknown as FileRecordRow[]) ?? [];
  }

  async searchRequestableFiles(
    search: string,
    limit = 20,
  ): Promise<FileRecordRow[]> {
    const term = sanitizeFilterTerm(search);
    if (!term) return [];

    const { data, error } = await this.client
      .from('files')
      .select(
        'id, file_no, file_name, section_name, locker_no, shelf_name, shelf_position, status',
      )
      .in('status', ['APPROVED', 'active', 'archived'])
      .or(
        `file_no.ilike.%${term}%,file_name.ilike.%${term}%,registrar_name.ilike.%${term}%`,
      )
      .order('file_no', { ascending: true })
      .limit(limit);

    if (error) {
      console.error('FileRepository.searchRequestableFiles error:', error);
      throw error;
    }
    return (data as unknown as FileRecordRow[]) ?? [];
  }

  /** Filtered and paginated list for the two tabs */
  async listFiltered(options: FileFilterOptions = {}): Promise<{
    files: FileRecordRow[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  }> {
    const {
      tab = 'requests',
      status,
      search,
      section,
      storage,
      officer,
      registered_by,
      date,
      dateFrom,
      dateTo,
      sort = 'newest',
      page = 1,
      limit = 15,
    } = options;

    const buildQuery = (selectCols: string, filterDeleted: boolean) => {
      let q = this.client.from('files').select(selectCols, { count: 'exact' });

      // Tab-level filtering:
      // File Requests tab shows strictly pending submissions
      // Rejected Files tab shows strictly rejected submissions
      // Recent tab shows all recently added files across statuses (Dashboard)
      // Deleted tab shows soft-deleted files
      // All Files tab shows approved / active repository files (excludes pending & rejected)
      if (tab === 'requests') {
        q = q.eq('status', 'PENDING');
        if (filterDeleted) q = q.or('is_deleted.is.null,is_deleted.eq.false');
      } else if (tab === 'rejected') {
        q = q.eq('status', 'REJECTED');
        if (filterDeleted) q = q.or('is_deleted.is.null,is_deleted.eq.false');
      } else if (tab === 'deleted') {
        if (filterDeleted) q = q.eq('is_deleted', true);
      } else if (tab === 'recent') {
        if (filterDeleted) q = q.or('is_deleted.is.null,is_deleted.eq.false');
        if (status && status !== 'all') {
          q = q.eq('status', status);
        }
      } else {
        if (filterDeleted) q = q.or('is_deleted.is.null,is_deleted.eq.false');
        if (status) {
          q =
            status === 'requestable'
              ? q.in('status', ['APPROVED', 'active', 'archived'])
              : q.eq('status', status);
        } else {
          q = q.in('status', [
            'APPROVED',
            'active',
            'archived',
            'issued',
          ]);
        }
      }

      // Registered By filter (e.g. for staff viewing their own submitted files)
      if (registered_by) {
        q = q.eq('registered_by', registered_by);
      }

      // Search filter across file_no, file_name, registrar_name
      const searchTerm = search ? sanitizeFilterTerm(search) : '';
      if (searchTerm) {
        q = q.or(
          `file_no.ilike.%${searchTerm}%,file_name.ilike.%${searchTerm}%,registrar_name.ilike.%${searchTerm}%`,
        );
      }

      // Section filter
      if (section && section !== 'all' && section !== 'All Sections') {
        q = q.ilike('section_name', `%${section.trim()}%`);
      }

      // Storage unit / location filter
      if (storage && storage !== 'all' && storage !== 'All Storage Units') {
        const term = sanitizeFilterTerm(storage);
        if (term) {
          q = q.or(`locker_no.ilike.%${term}%,shelf_name.ilike.%${term}%`);
        }
      }

      // Officer filter
      if (officer && officer !== 'all' && officer !== 'All Officers') {
        q = q.ilike('registrar_name', `%${officer.trim()}%`);
      }

      // Inclusive calendar-day filter in Sri Lanka time (created_at stored as UTC).
      const fromDay = (dateFrom && isValidYmd(dateFrom) ? dateFrom.trim() : '') ||
        (date && isValidYmd(date) ? date.trim() : '');
      const toDay = (dateTo && isValidYmd(dateTo) ? dateTo.trim() : '') ||
        (date && isValidYmd(date) ? date.trim() : '');
      if (fromDay) {
        q = q.gte('created_at', sriLankaDayStartIso(fromDay));
      }
      if (toDay) {
        q = q.lte('created_at', sriLankaDayEndIso(toDay));
      }

      // Sorting
      if (tab === 'deleted' && sort === 'newest') {
        q = q.order('deleted_at', { ascending: false, nullsFirst: false });
      } else {
        switch (sort) {
          case 'oldest':
            q = q.order('created_at', { ascending: true });
            break;
          case 'file_no':
            q = q.order('file_no', { ascending: true });
            break;
          case 'file_name':
            q = q.order('file_name', { ascending: true });
            break;
          case 'newest':
          default:
            q = q.order('created_at', { ascending: false });
            break;
        }
      }

      const offset = (safePage - 1) * safeLimit;
      q = q.range(offset, offset + safeLimit - 1);
      return q;
    };

    const safePage = Math.max(1, page);
    // Allow larger batches for explicit exports while keeping normal queries paginated.
    const safeLimit = Math.max(1, Math.min(10000, limit));

    let res = await buildQuery(FILE_LIST_SELECT_WITH_DELETED, true);
    if (
      res.error &&
      ((res.error as { code?: string }).code === '42703' ||
        res.error.message?.includes('is_deleted'))
    ) {
      if (tab === 'deleted') {
        return {
          files: [],
          total: 0,
          page: safePage,
          limit: safeLimit,
          totalPages: 1,
        };
      }
      res = await buildQuery(FILE_LIST_SELECT, false);
    }

    const { data, count, error } = res;

    if (error) {
      console.error('FileRepository.listFiltered error:', error);
      return {
        files: [],
        total: 0,
        page: safePage,
        limit: safeLimit,
        totalPages: 1,
      };
    }

    const total = count ?? (data?.length || 0);
    const totalPages = Math.max(1, Math.ceil(total / safeLimit));
    const files: FileRecordRow[] = await this.markDeletedAuthors(
      ((data as unknown as FileRecordRow[]) ?? []).map((f) => ({ ...f })),
    );

    // Resolve approver display names from profiles table for any records where approved_by_name is missing
    const approverIdsToResolve = Array.from(
      new Set(
        files
          .filter((f) => f.approved_by && !f.approved_by_name)
          .map((f) => f.approved_by as string),
      ),
    );

    if (approverIdsToResolve.length > 0) {
      try {
        const { data: profiles } = await this.client
          .from('profiles')
          .select('id, full_name, email')
          .in('id', approverIdsToResolve);

        if (profiles && profiles.length > 0) {
          const profileMap = new Map<string, string>();
          for (const p of profiles) {
            if (p.full_name || p.email) {
              profileMap.set(p.id, p.full_name || p.email);
            }
          }
          for (const file of files) {
            if (
              !file.approved_by_name &&
              file.approved_by &&
              profileMap.has(file.approved_by)
            ) {
              file.approved_by_name = profileMap.get(file.approved_by) || null;
            }
          }
        }
      } catch (err) {
        // Non-blocking enrichment
        console.warn(
          'FileRepository.listFiltered: error resolving approver profiles',
          err,
        );
      }
    }

    return {
      files,
      total,
      page: safePage,
      limit: safeLimit,
      totalPages,
    };
  }

  /** Update an existing file record by id */
  async update(
    id: number,
    patch: Partial<FileRecordRow>,
  ): Promise<FileRecordRow> {
    const { data, error } = await this.client
      .from('files')
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();

    if (error) {
      throw new Error(`FileRepository.update error: ${error.message}`);
    }
    return data as FileRecordRow;
  }

  /** Count rows that would be removed with the file or kept during soft delete. */
  async countDependents(id: number, fileNo?: string): Promise<FileDependentCounts> {
    const cleanFileNo = (fileNo || '').trim();
    const auditLogsPromise = cleanFileNo
      ? Promise.resolve(
          this.client
            .from('audit_logs')
            .select('id', { count: 'exact', head: true })
            .or(`details->>file_no.eq.${cleanFileNo},details->>file_id.eq.${id}`)
        ).catch(() => ({ count: 0, error: null }))
      : Promise.resolve({ count: 0, error: null });

    const [requests, extensions, activeCheckouts, returnedCheckouts, auditLogs] = await Promise.all([
      this.client
        .from('staff_file_requests')
        .select('id', { count: 'exact', head: true })
        .eq('file_id', id),
      this.client
        .from('file_request_extensions')
        .select('id, staff_file_requests!inner(file_id)', {
          count: 'exact',
          head: true,
        })
        .eq('staff_file_requests.file_id', id),
      this.client
        .from('staff_file_requests')
        .select('id', { count: 'exact', head: true })
        .eq('file_id', id)
        .eq('status', 'APPROVED')
        .is('returned_at', null),
      this.client
        .from('staff_file_requests')
        .select('id', { count: 'exact', head: true })
        .eq('file_id', id)
        .eq('status', 'APPROVED')
        .not('returned_at', 'is', null),
      auditLogsPromise,
    ]);

    if (requests.error) {
      throw new Error(
        `FileRepository.countDependents error: ${requests.error.message}`,
      );
    }
    if (extensions.error) {
      throw new Error(
        `FileRepository.countDependents error: ${extensions.error.message}`,
      );
    }

    const activeCount = activeCheckouts.count ?? 0;
    return {
      fileRequests: requests.count ?? 0,
      fileRequestExtensions: extensions.count ?? 0,
      activeCheckouts: activeCount,
      returnedCheckouts: returnedCheckouts.count ?? 0,
      auditLogs: auditLogs.count ?? 0,
      canDelete: activeCount === 0,
    };
  }

  /** Soft-delete file record */
  async softDelete(
    id: number,
    actorId: string,
    reason?: string | null,
  ): Promise<FileRecordRow> {
    const now = new Date().toISOString();
    const patch: Record<string, unknown> = {
      is_deleted: true,
      deleted_at: now,
      deleted_by: actorId,
      deletion_reason: reason || null,
      updated_at: now,
    };

    const { data, error } = await this.client
      .from('files')
      .update(patch)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      if ((error as { code?: string }).code === '42703' || error.message?.includes('is_deleted')) {
        throw new Error(
          'Please apply migration 0036_soft_delete_files.sql in Supabase SQL Editor to enable soft delete for files.',
        );
      }
      throw new Error(`FileRepository.softDelete error: ${error.message}`);
    }
    return data as FileRecordRow;
  }

  /** Restore soft-deleted file record */
  async restore(id: number): Promise<FileRecordRow> {
    const now = new Date().toISOString();
    const patch: Record<string, unknown> = {
      is_deleted: false,
      deleted_at: null,
      deleted_by: null,
      deletion_reason: null,
      updated_at: now,
    };

    const { data, error } = await this.client
      .from('files')
      .update(patch)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      if ((error as { code?: string }).code === '42703' || error.message?.includes('is_deleted')) {
        throw new Error(
          'Please apply migration 0036_soft_delete_files.sql in Supabase SQL Editor to enable soft delete for files.',
        );
      }
      throw new Error(`FileRepository.restore error: ${error.message}`);
    }
    return data as FileRecordRow;
  }

  /**
   * Delete the file and its dependent rows through the 0035 RPC. The function
   * runs in one Postgres transaction, so a failure leaves nothing half-deleted.
   */
  async deleteWithDependents(
    id: number,
    actorId: string,
    actorName: string,
  ): Promise<DeletedFileResult> {
    const { data, error } = await this.client.rpc(
      'delete_file_with_dependents',
      {
        p_file_id: id,
        p_actor_id: actorId,
        p_actor_name: actorName,
      },
    );

    if (error) {
      const wrapped = new Error(
        `FileRepository.deleteWithDependents error: ${error.message}`,
      );
      // Keep the Postgres code so the controller can map 23503 precisely.
      Object.assign(wrapped, {
        code: (error as { code?: string }).code,
        details: (error as { details?: string }).details,
      });
      throw wrapped;
    }

    const result = (data ?? {}) as Record<string, unknown>;
    if (result.outcome !== 'deleted') {
      return {
        outcome: 'not_found',
        fileId: id,
        fileNo: '',
        fileName: '',
        fileRequests: 0,
        fileRequestExtensions: 0,
        auditId: null,
      };
    }

    return {
      outcome: 'deleted',
      fileId: Number(result.file_id ?? id),
      fileNo: String(result.file_no ?? ''),
      fileName: String(result.file_name ?? ''),
      fileRequests: Number(result.deleted_file_requests ?? 0),
      fileRequestExtensions: Number(
        result.deleted_file_request_extensions ?? 0,
      ),
      auditId:
        result.audit_id === null || result.audit_id === undefined
          ? null
          : Number(result.audit_id),
    };
  }

  /** Approve a pending file submission */
  async approve(
    id: number,
    actorId: string,
    approverName: string,
    storageData?: { locker_no?: string | null; shelf_name?: string | null; shelf_position?: string | null },
  ): Promise<FileRecordRow> {
    const now = new Date().toISOString();
    const updateData: Record<string, unknown> = {
      status: 'APPROVED',
      approved_by: actorId,
      approved_by_name: approverName,
      approved_at: now,
      updated_at: now,
    };

    // Include storage location data if provided
    if (storageData) {
      if (storageData.locker_no !== undefined) updateData.locker_no = storageData.locker_no;
      if (storageData.shelf_name !== undefined) updateData.shelf_name = storageData.shelf_name;
      if (storageData.shelf_position !== undefined) updateData.shelf_position = storageData.shelf_position;
    }

    const { data, error } = await this.client
      .from('files')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      throw new Error(`FileRepository.approve error: ${error.message}`);
    }
    return data as FileRecordRow;
  }

  /** Reject a pending file submission */
  async reject(
    id: number,
    actorId: string,
    reason?: string,
    adminName?: string,
  ): Promise<FileRecordRow> {
    const now = new Date().toISOString();
    const patch: Record<string, unknown> = {
      status: 'REJECTED',
      approved_by: actorId,
      approved_at: now,
      rejected_at: now,
      updated_at: now,
    };
    // Only include reject_reason if a reason was provided.
    // The column is added by migration 0011; if it does not yet exist the
    // update will fail — in that case we retry without it so the status
    // change still goes through.
    if (reason) patch['reject_reason'] = reason;
    if (adminName) {
      patch['approved_by_name'] = adminName;
      patch['rejected_by_name'] = adminName;
    }

    let { data, error } = await this.client
      .from('files')
      .update(patch)
      .eq('id', id)
      .select()
      .single();

    // Graceful fallback: if the reject_reason column is absent, retry without it
    if (error && reason && error.message?.includes('reject_reason')) {
      delete patch['reject_reason'];
      const retry = await this.client
        .from('files')
        .update(patch)
        .eq('id', id)
        .select()
        .single();
      data = retry.data;
      error = retry.error;
    }

    if (error) {
      throw new Error(
        'FileRepository.reject error: ' +
          (error ? error.message : 'Unknown error'),
      );
    }
    return data as FileRecordRow;
  }

  /** Aggregated KPI summary counts for top cards and tab badges */
  async getSummaryCounts(): Promise<FileCountsSummary> {
    // Preferred path: one aggregate round trip (see migration 0020).
    // Falls back to the per-status queries below until that migration is applied.
    try {
      const { data, error } = await this.client.rpc('file_summary_counts');
      if (!error && data) {
        const row = (Array.isArray(data) ? data[0] : data) as
          | Partial<FileCountsSummary>
          | null;
        if (row && typeof row.allFilesCount === 'number') {
          return {
            totalArchives: Number(row.totalArchives) || 0,
            todayCount: Number(row.todayCount) || 0,
            allFilesCount: Number(row.allFilesCount) || 0,
            pendingCount: Number(row.pendingCount) || 0,
            rejectedCount: Number(row.rejectedCount) || 0,
            deletedCount: Number(row.deletedCount) || 0,
            totalPageNumbers:
              row.totalPageNumbers !== undefined && row.totalPageNumbers !== null
                ? Number(row.totalPageNumbers)
                : undefined,
          };
        }
      }
    } catch {}

    try {
      // Day boundary in Sri Lanka time so "today" matches what users see.
      const todayStartIso = sriLankaTodayStart().toISOString();
      let pendingCount = 0;
      let allFilesCount = 0;
      let archivesCount = 0;
      let rejectedCount = 0;
      let todayCount = 0;
      let deletedCount = 0;

      // Try queries with is_deleted column awareness
      try {
        const [pending, allFiles, archives, rejected, today, deleted] = await Promise.all([
          this.client
            .from('files')
            .select('*', { count: 'exact', head: true })
            .eq('status', 'PENDING')
            .or('is_deleted.is.null,is_deleted.eq.false'),
          this.client
            .from('files')
            .select('*', { count: 'exact', head: true })
            .in('status', ['APPROVED', 'active', 'archived', 'issued'])
            .or('is_deleted.is.null,is_deleted.eq.false'),
          this.client
            .from('files')
            .select('*', { count: 'exact', head: true })
            .or('is_deleted.is.null,is_deleted.eq.false'),
          this.client
            .from('files')
            .select('*', { count: 'exact', head: true })
            .eq('status', 'REJECTED')
            .or('is_deleted.is.null,is_deleted.eq.false'),
          this.client
            .from('files')
            .select('*', { count: 'exact', head: true })
            .gte('created_at', todayStartIso)
            .or('is_deleted.is.null,is_deleted.eq.false'),
          this.client
            .from('files')
            .select('*', { count: 'exact', head: true })
            .eq('is_deleted', true),
        ]);

        if (pending.error) throw pending.error;
        pendingCount = pending.count ?? 0;
        allFilesCount = allFiles.count ?? 0;
        archivesCount = archives.count ?? 0;
        rejectedCount = rejected.count ?? 0;
        todayCount = today.count ?? 0;
        deletedCount = deleted.count ?? 0;
      } catch {
        // Fallback for when is_deleted column is not yet migrated
        const [pending, allFiles, archives, rejected, today] = await Promise.all([
          this.client
            .from('files')
            .select('*', { count: 'exact', head: true })
            .eq('status', 'PENDING'),
          this.client
            .from('files')
            .select('*', { count: 'exact', head: true })
            .in('status', ['APPROVED', 'active', 'archived', 'issued']),
          this.client.from('files').select('*', { count: 'exact', head: true }),
          this.client
            .from('files')
            .select('*', { count: 'exact', head: true })
            .eq('status', 'REJECTED'),
          this.client
            .from('files')
            .select('*', { count: 'exact', head: true })
            .gte('created_at', todayStartIso),
        ]);
        pendingCount = pending.count ?? 0;
        allFilesCount = allFiles.count ?? 0;
        archivesCount = archives.count ?? 0;
        rejectedCount = rejected.count ?? 0;
        todayCount = today.count ?? 0;
      }

      return {
        totalArchives: archivesCount,
        todayCount: todayCount,
        allFilesCount: allFilesCount,
        pendingCount: pendingCount,
        rejectedCount: rejectedCount,
        deletedCount: deletedCount,
      };
    } catch (err) {
      console.error('FileRepository.getSummaryCounts error:', err);
      return {
        totalArchives: 0,
        todayCount: 0,
        allFilesCount: 0,
        pendingCount: 0,
        rejectedCount: 0,
        deletedCount: 0,
      };
    }
  }

  /**
   * Sum of page_numbers across every record. Reads only the needed column in
   * batches so PostgREST's row cap cannot truncate the total.
   */
  async getTotalPageNumbers(batchSize = 1000): Promise<number> {
    try {
      const { data, error } = await this.client.rpc('file_total_pages');
      if (!error && data !== null && data !== undefined) {
        return Number(data) || 0;
      }
    } catch {}

    const size = Math.max(1, Math.min(1000, batchSize));
    let from = 0;
    let total = 0;

    for (let batch = 0; batch < 100; batch += 1) {
      let query = this.client
        .from('files')
        .select('page_numbers')
        .neq('status', 'REJECTED')
        .or('is_deleted.is.null,is_deleted.eq.false')
        .order('id', { ascending: true })
        .range(from, from + size - 1);

      let { data, error } = await query;

      if (error && (error as { code?: string }).code === '42703') {
        // Fallback without is_deleted if column does not exist yet
        const fallback = await this.client
          .from('files')
          .select('page_numbers')
          .neq('status', 'REJECTED')
          .order('id', { ascending: true })
          .range(from, from + size - 1);
        data = fallback.data;
        error = fallback.error;
      }

      if (error) {
        console.error('FileRepository.getTotalPageNumbers error:', error);
        return total;
      }

      const rows = (data as Array<{ page_numbers?: number | null }>) ?? [];
      for (const row of rows) {
        total += Number(row.page_numbers) || 0;
      }

      if (rows.length < size) break;
      from += size;
    }

    return total;
  }
}
