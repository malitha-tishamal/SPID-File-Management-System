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
    const { data, error } = await this.client
      .from('sections')
      .select('id, name, status, section_lead')
      .ilike('name', name.trim())
      .maybeSingle();
    if (error) {
      // Fallback if columns don't exist
      const fallback = await this.client
        .from('sections')
        .select('id, name')
        .ilike('name', name.trim())
        .maybeSingle();
      if (fallback.data) {
        return { ...fallback.data, status: 'approved' as SectionStatus, section_lead: null } as SectionRow;
      }
      return null;
    }
    return (data as SectionRow) ?? null;
  }

  async findById(id: number): Promise<SectionRow | null> {
    const { data, error } = await this.client
      .from('sections')
      .select('id, name, status, section_lead')
      .eq('id', id)
      .maybeSingle();
    if (error) {
      // Fallback if columns don't exist
      const fallback = await this.client
        .from('sections')
        .select('id, name')
        .eq('id', id)
        .maybeSingle();
      if (fallback.data) {
        return { ...fallback.data, status: 'approved' as SectionStatus, section_lead: null } as SectionRow;
      }
      return null;
    }
    return (data as SectionRow) ?? null;
  }

  async create(name: string, sectionLead?: string): Promise<SectionRow> {
    const insert: Record<string, unknown> = {
      name: name.trim(),
    };

    // Try to insert with status and section_lead columns
    try {
      insert.status = 'approved';
      if (sectionLead) insert.section_lead = sectionLead.trim();

      const { data, error } = await this.client
        .from('sections')
        .insert(insert)
        .select('id, name, status, section_lead, created_at')
        .single();
      if (error) throw error;
      return data as SectionRow;
    } catch (err: any) {
      // If columns don't exist, fallback to basic insert
      if (err.code === '42703' || err.message?.includes('column') || err.message?.includes('does not exist')) {
        const basicInsert: Record<string, unknown> = { name: name.trim() };
        const { data, error } = await this.client
          .from('sections')
          .insert(basicInsert)
          .select('id, name, created_at')
          .single();
        if (error) throw error;
        return { ...data, status: 'approved' as SectionStatus, section_lead: null } as SectionRow;
      }
      throw err;
    }
  }

  async update(id: number, patch: { name?: string; status?: SectionStatus; section_lead?: string | null }): Promise<SectionRow> {
    // Filter out status and section_lead if they might not exist in the DB
    const updateData: Record<string, unknown> = {};
    if (patch.name !== undefined) updateData.name = patch.name;

    try {
      // Try updating with all fields
      if (patch.status !== undefined) updateData.status = patch.status;
      if (patch.section_lead !== undefined) updateData.section_lead = patch.section_lead;

      const { data, error } = await this.client
        .from('sections')
        .update(updateData)
        .eq('id', id)
        .select('id, name, status, section_lead, created_at')
        .single();
      if (error) throw error;
      return data as SectionRow;
    } catch (err: any) {
      // If columns don't exist, fallback to name-only update
      if (err.code === '42703' || err.message?.includes('column') || err.message?.includes('does not exist')) {
        const basicUpdate: Record<string, unknown> = {};
        if (patch.name !== undefined) basicUpdate.name = patch.name;

        const { data, error } = await this.client
          .from('sections')
          .update(basicUpdate)
          .eq('id', id)
          .select('id, name, created_at')
          .single();
        if (error) throw error;
        return { ...data, status: 'approved' as SectionStatus, section_lead: null } as SectionRow;
      }
      throw err;
    }
  }

  async delete(id: number): Promise<void> {
    const { error } = await this.client
      .from('sections')
      .delete()
      .eq('id', id);
    if (error) throw error;
  }
}
