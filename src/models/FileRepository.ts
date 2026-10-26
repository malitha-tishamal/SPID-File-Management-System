import type { SupabaseClient } from '@supabase/supabase-js';

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
  archive_repository?: string;
  status?: FileStatus;
  created_at?: string;
  updated_at?: string;
}

export interface FileFilterOptions {
  tab?: 'requests' | 'all' | 'rejected' | 'recent';
  status?: string;
  search?: string;
  section?: string;
  storage?: string;
  officer?: string;
  registered_by?: string;
  date?: string;
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
}

/** Columns required for list/table views (avoids select * on large rows). */
export const FILE_LIST_SELECT =
  'id,file_no,file_name,section_name,start_date,end_date,locker_no,shelf_name,shelf_position,page_numbers,minute_sheets_count,registrar_name,registrar_role,registered_by,created_by,approved_by,approved_by_name,reject_reason,rejected_at,rejected_by_name,approved_at,archive_repository,status,created_at,updated_at';

/** Model layer: File and physical record repository */
export class FileRepository {
  private client: SupabaseClient;
  constructor(client: SupabaseClient) {
    this.client = client;
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
    return (data as FileRecordRow) ?? null;
  }

  /** Look up a file by its file_no */
  async findByFileNo(fileNo: string): Promise<FileRecordRow | null> {
    const { data, error } = await this.client
      .from('files')
      .select('*')
      .ilike('file_no', fileNo.trim())
      .maybeSingle();

    if (error) {
      console.error('FileRepository.findByFileNo error:', error);
      return null;
    }
    return (data as FileRecordRow) ?? null;
  }

  /** Look up a file by its file_name */
  async findByFileName(fileName: string): Promise<FileRecordRow | null> {
    const { data, error } = await this.client
      .from('files')
      .select('*')
      .ilike('file_name', fileName.trim())
      .maybeSingle();

    if (error) {
      console.error('FileRepository.findByFileName error:', error);
      return null;
    }
    return (data as FileRecordRow) ?? null;
  }

  async findByFileIdentity(
    fileNo: string,
    fileName: string,
  ): Promise<FileRecordRow | null> {
    const { data, error } = await this.client
      .from('files')
      .select('*')
      .eq('file_no', fileNo.trim())
      .eq('file_name', fileName.trim())
      .maybeSingle();

    if (error) {
      console.error('FileRepository.findByFileIdentity error:', error);
      throw error;
    }
    return (data as FileRecordRow) ?? null;
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
    return (data as FileRecordRow[]) ?? [];
  }

  async findExistingFileIdentities(fileNos: string[]): Promise<Set<string>> {
    const cleanFileNos = [
      ...new Set(fileNos.map((n) => n.trim()).filter(Boolean)),
    ];
    if (!cleanFileNos.length) return new Set();

    const { data, error } = await this.client
      .from('files')
      .select('file_no, file_name')
      .in('file_no', cleanFileNos);

    if (error) throw error;
    return new Set(
      (data ?? []).map((record: { file_no: string; file_name: string }) =>
        JSON.stringify([
          record.file_no.toLowerCase(),
          record.file_name.toLowerCase(),
        ]),
      ),
    );
  }

  async list(limit = 100): Promise<FileRecordRow[]> {
    const { data, error } = await this.client
      .from('files')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) {
      console.error('FileRepository.list error:', error);
      return [];
    }
    return (data as FileRecordRow[]) ?? [];
  }

  async searchRequestableFiles(
    search: string,
    limit = 20,
  ): Promise<FileRecordRow[]> {
    const term = search.trim();
    if (!term) return [];

    const { data, error } = await this.client
      .from('files')
      .select(
        'id, file_no, file_name, section_name, locker_no, shelf_name, shelf_position, archive_repository, status',
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
    return (data as FileRecordRow[]) ?? [];
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
      sort = 'newest',
      page = 1,
      limit = 15,
    } = options;

    let query = this.client.from('files').select(FILE_LIST_SELECT, { count: 'exact' });

    // Tab-level filtering:
    // File Requests tab shows strictly pending submissions
    // Rejected Files tab shows strictly rejected submissions
    // Recent tab shows all recently added files across statuses (Dashboard)
    // All Files tab shows approved / active repository files (excludes pending & rejected)
    if (tab === 'requests') {
      query = query.eq('status', 'PENDING');
    } else if (tab === 'rejected') {
      query = query.eq('status', 'REJECTED');
    } else if (tab === 'recent') {
      if (status && status !== 'all') {
        query = query.eq('status', status);
      }
    } else {
      if (status) {
        query =
          status === 'requestable'
            ? query.in('status', ['APPROVED', 'active', 'archived'])
            : query.eq('status', status);
      } else {
        query = query.in('status', [
          'APPROVED',
          'active',
          'archived',
          'issued',
        ]);
      }
    }

    // Registered By filter (e.g. for staff viewing their own submitted files)
    if (registered_by) {
      query = query.eq('registered_by', registered_by);
    }

    // Search filter across file_no, file_name, registrar_name
    if (search && search.trim()) {
      const term = search.trim();
      query = query.or(
        `file_no.ilike.%${term}%,file_name.ilike.%${term}%,registrar_name.ilike.%${term}%`,
      );
    }

    // Section filter
    if (section && section !== 'all' && section !== 'All Sections') {
      query = query.ilike('section_name', `%${section.trim()}%`);
    }

    // Storage unit / location filter
    if (storage && storage !== 'all' && storage !== 'All Storage Units') {
      const term = storage.trim();
      query = query.or(`locker_no.ilike.%${term}%,shelf_name.ilike.%${term}%`);
    }

    // Officer filter
    if (officer && officer !== 'all' && officer !== 'All Officers') {
      query = query.ilike('registrar_name', `%${officer.trim()}%`);
    }

    // Date filter
    if (date && date.trim()) {
      query = query
        .gte('created_at', `${date.trim()}T00:00:00.000Z`)
        .lte('created_at', `${date.trim()}T23:59:59.999Z`);
    }

    // Sorting
    switch (sort) {
      case 'oldest':
        query = query.order('created_at', { ascending: true });
        break;
      case 'file_no':
        query = query.order('file_no', { ascending: true });
        break;
      case 'file_name':
        query = query.order('file_name', { ascending: true });
        break;
      case 'newest':
      default:
        query = query.order('created_at', { ascending: false });
        break;
    }

    // Pagination
    const safePage = Math.max(1, page);
    // Allow larger batches for explicit exports while keeping normal queries paginated.
    const safeLimit = Math.max(1, Math.min(10000, limit));
    const offset = (safePage - 1) * safeLimit;

    query = query.range(offset, offset + safeLimit - 1);

    const { data, count, error } = await query;

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
    const files: FileRecordRow[] = ((data as FileRecordRow[]) ?? []).map(
      (f) => ({ ...f }),
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

  /** Delete a file record by id */
  async delete(id: number): Promise<void> {
    const { error } = await this.client.from('files').delete().eq('id', id);

    if (error) {
      throw new Error(`FileRepository.delete error: ${error.message}`);
    }
  }

  /** Approve a pending file submission */
  async approve(
    id: number,
    actorId: string,
    approverName: string,
  ): Promise<FileRecordRow> {
    const now = new Date().toISOString();
    const { data, error } = await this.client
      .from('files')
      .update({
        status: 'APPROVED',
        approved_by: actorId,
        approved_by_name: approverName,
        approved_at: now,
        updated_at: now,
      })
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
    try {
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);
      const [pending, allFiles, archives, today] = await Promise.all([
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
          .gte('created_at', todayStart.toISOString()),
      ]);

      // 5. Rejected count (Rejected Files tab badge)
      const { count: rejectedCount } = await this.client
        .from('files')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'REJECTED');

      return {
        totalArchives: archives.count ?? 0,
        todayCount: today.count ?? 0,
        allFilesCount: allFiles.count ?? 0,
        pendingCount: pending.count ?? 0,
      };
    } catch (err) {
      console.error('FileRepository.getSummaryCounts error:', err);
      return {
        totalArchives: 0,
        todayCount: 0,
        allFilesCount: 0,
        pendingCount: 0,
        rejectedCount: 0,
      };
    }
  }
}
