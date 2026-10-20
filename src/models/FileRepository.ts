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
  /** Previously shelf_no — renamed to shelf_name per requirements */
  shelf_name?: string | null;
  shelf_position?: 'Front' | 'Middle' | 'Back' | null;
  page_numbers?: number;
  minute_sheets_count?: number;
  registrar_name?: string | null;
  registrar_role?: string | null;
  /** User who registered the file */
  registered_by?: string | null;
  /** Alias: created_by — same as registered_by for backward compat */
  created_by?: string | null;
  approved_by?: string | null;
  approved_at?: string | null;
  archive_repository?: string;
  status?: FileStatus;
  created_at?: string;
  updated_at?: string;
}

/** Model layer: File and physical record repository */
export class FileRepository {
  constructor(private client: SupabaseClient) {}

  /** Look up a file by its file_no (existing search) */
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
}
