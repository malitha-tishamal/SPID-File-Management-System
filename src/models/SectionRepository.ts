import type { SupabaseClient } from '@supabase/supabase-js';

export interface SectionRow {
  id: number;
  name: string;
}

/** Model layer: sections reference data. */
export class SectionRepository {
  constructor(private client: SupabaseClient) {}

  async list(): Promise<SectionRow[]> {
    const { data, error } = await this.client
      .from('sections')
      .select('id, name')
      .order('name', { ascending: true });
    if (error) return [];
    return (data as SectionRow[]) ?? [];
  }

  async findByName(name: string): Promise<SectionRow | null> {
    const { data } = await this.client
      .from('sections')
      .select('id, name')
      .ilike('name', name.trim())
      .maybeSingle();
    return (data as SectionRow) ?? null;
  }

  async findById(id: number): Promise<SectionRow | null> {
    const { data } = await this.client
      .from('sections')
      .select('id, name')
      .eq('id', id)
      .maybeSingle();
    return (data as SectionRow) ?? null;
  }
}
