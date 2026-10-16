import type { SupabaseClient } from '@supabase/supabase-js';

export interface FileRecordRow {
  id?: number;
  file_no: string;
  file_name: string;
  section_name: string;
  year: number;
  locker_no?: string | null;
  shelf_no?: string | null;
  shelf_position?: 'Front' | 'Middle' | 'Back' | null;
  page_numbers?: number;
  minute_sheets_count?: number;
  registrar_name?: string | null;
  registrar_role?: string | null;
  registered_by?: string | null;
  archive_repository?: string;
  status?: string;
  created_at?: string;
  updated_at?: string;
}

/** Model layer: File and physical record repository */
export class FileRepository {
  constructor(private client: SupabaseClient) {}

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

  async create(payload: Omit<FileRecordRow, 'id' | 'created_at' | 'updated_at'>): Promise<FileRecordRow> {
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
