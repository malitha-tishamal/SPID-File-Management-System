import type { SupabaseClient } from '@supabase/supabase-js';

export type FileStatus =
  | 'PENDING'
  | 'APPROVED'
  | 'REJECTED'
  | 'active'
  | 'archived'
  | 'issued'
  | 'disposed';

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
  approved_at?: string | null;
  archive_repository?: string;
  status?: FileStatus;
  created_at?: string;
  updated_at?: string;
}

export interface FileFilterOptions {
  tab?: 'requests' | 'all';
  status?: string;
  search?: string;
  section?: string;
  storage?: string;
  officer?: string;
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
}

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

  /** Look up a file by its file_no (unique index) */
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

  /** Look up a file by its file_name (unique business key) */
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

  /** Find existing file names in a batch for duplicate checking */
  async findExistingFileNames(fileNames: string[]): Promise<Set<string>> {
    if (!fileNames.length) return new Set();
    const cleanNames = fileNames.map((n) => n.trim()).filter(Boolean);
    if (!cleanNames.length) return new Set();

    const { data, error } = await this.client
      .from('files')
      .select('file_name')
      .in('file_name', cleanNames);

    if (error || !data) return new Set();
    return new Set(data.map((r: { file_name: string }) => r.file_name.toLowerCase()));
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
      date,
      sort = 'newest',
      page = 1,
      limit = 15,
    } = options;

    let query = this.client.from('files').select('*', { count: 'exact' });

    // Tab-level filtering:
    // File Requests tab shows strictly pending submissions
    if (tab === 'requests') {
      query = query.eq('status', 'PENDING');
    } else {
      // All Files tab shows approved / active repository files (excludes pending & rejected)
      if (status) {
        query = query.eq('status', status);
      } else {
        query = query.in('status', ['APPROVED', 'active', 'archived', 'issued']);
      }
    }

    // Search filter across file_no, file_name, registrar_name
    if (search && search.trim()) {
      const term = search.trim();
      query = query.or(`file_no.ilike.%${term}%,file_name.ilike.%${term}%,registrar_name.ilike.%${term}%`);
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
      query = query.gte('created_at', `${date.trim()}T00:00:00.000Z`)
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
    // Allow up to 10 000 records per request so that callers can retrieve all
    // matching records for CSV export and the "show all when filtered" mode
    // without the backend silently truncating the result set.
    const safeLimit = Math.max(1, Math.min(10000, limit));
    const offset = (safePage - 1) * safeLimit;

    query = query.range(offset, offset + safeLimit - 1);

    const { data, count, error } = await query;

    if (error) {
      console.error('FileRepository.listFiltered error:', error);
      return { files: [], total: 0, page: safePage, limit: safeLimit, totalPages: 1 };
    }

    const total = count ?? (data?.length || 0);
    const totalPages = Math.max(1, Math.ceil(total / safeLimit));

    return {
      files: (data as FileRecordRow[]) ?? [],
      total,
      page: safePage,
      limit: safeLimit,
      totalPages,
    };
  }

  /** Aggregated KPI summary counts for top cards and tab badges */
  async getSummaryCounts(): Promise<FileCountsSummary> {
    try {
      // 1. Pending count (File Requests)
      const { count: pendingCount } = await this.client
        .from('files')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'PENDING');

      // 2. All Files count (approved + active repository files)
      const { count: allFilesCount } = await this.client
        .from('files')
        .select('*', { count: 'exact', head: true })
        .in('status', ['APPROVED', 'active', 'archived', 'issued']);

      // 3. Total Archives count (all records ever registered in files table)
      const { count: totalArchives } = await this.client
        .from('files')
        .select('*', { count: 'exact', head: true });

      // 4. Today's intake count
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);
      const { count: todayCount } = await this.client
        .from('files')
        .select('*', { count: 'exact', head: true })
        .gte('created_at', todayStart.toISOString());

      return {
        totalArchives: totalArchives ?? 0,
        todayCount: todayCount ?? 0,
        allFilesCount: allFilesCount ?? 0,
        pendingCount: pendingCount ?? 0,
      };
    } catch (err) {
      console.error('FileRepository.getSummaryCounts error:', err);
      return {
        totalArchives: 0,
        todayCount: 0,
        allFilesCount: 0,
        pendingCount: 0,
      };
    }
  }
}
