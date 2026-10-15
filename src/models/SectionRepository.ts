import type { SupabaseClient } from '@supabase/supabase-js';

export type SectionStatus = 'approved' | 'pending' | 'disabled';

export interface SectionRow {
  id: number;
  name: string;
  status?: SectionStatus;
  section_lead?: string | null;
  created_at?: string;
}

/** Model layer: sections reference data and management. */
export class SectionRepository {
  constructor(private client: SupabaseClient) {}

  /** Returns all sections (id + name only) — used for dropdowns. */
  async list(): Promise<SectionRow[]> {
    const { data, error } = await this.client
      .from('sections')
      .select('id, name')
      .order('name', { ascending: true });
    if (error) return [];
    return (data as SectionRow[]) ?? [];
  }

  /** Returns all sections with full details — used for management page. */
  async listAll(): Promise<SectionRow[]> {
    const { data, error } = await this.client
      .from('sections')
      .select('id, name, status, section_lead, created_at')
      .order('id', { ascending: true });
    if (error) {
      // If status/section_lead columns don't exist yet, fall back to basic list
      const fallback = await this.list();
      return fallback.map(s => ({ ...s, status: 'approved' as SectionStatus, section_lead: null }));
    }
    return (data as SectionRow[]) ?? [];
  }

  async findByName(name: string): Promise<SectionRow | null> {
    const { data } = await this.client
      .from('sections')
      .select('id, name, status, section_lead')
      .ilike('name', name.trim())
      .maybeSingle();
    return (data as SectionRow) ?? null;
  }

  async findById(id: number): Promise<SectionRow | null> {
    const { data } = await this.client
      .from('sections')
      .select('id, name, status, section_lead')
      .eq('id', id)
      .maybeSingle();
    return (data as SectionRow) ?? null;
  }

  async create(name: string, sectionLead?: string): Promise<SectionRow> {
    const insert: Record<string, unknown> = {
      name: name.trim(),
      status: 'approved',
    };
    if (sectionLead) insert.section_lead = sectionLead.trim();

    const { data, error } = await this.client
      .from('sections')
      .insert(insert)
      .select('id, name, status, section_lead, created_at')
      .single();
    if (error) throw error;
    return data as SectionRow;
  }

  async update(id: number, patch: { name?: string; status?: SectionStatus; section_lead?: string | null }): Promise<SectionRow> {
    const { data, error } = await this.client
      .from('sections')
      .update(patch)
      .eq('id', id)
      .select('id, name, status, section_lead, created_at')
      .single();
    if (error) throw error;
    return data as SectionRow;
  }

  async delete(id: number): Promise<void> {
    const { error } = await this.client
      .from('sections')
      .delete()
      .eq('id', id);
    if (error) throw error;
  }
}
