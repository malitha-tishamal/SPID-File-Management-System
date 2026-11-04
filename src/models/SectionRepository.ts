import type { SupabaseClient } from '@supabase/supabase-js';

export type SectionStatus = 'approved' | 'pending' | 'disabled';

export interface SectionRow {
  id: number;
  name: string;
  status?: SectionStatus;
  section_lead?: string | null;
  created_at?: string;
}

function isMissingColumnError(error: { code?: string; message?: string } | null): boolean {
  return !!error && (error.code === '42703' || /column .+ does not exist/i.test(error.message ?? ''));
}

/** Only Active sections may be picked for a new file or a changed section. */
export function isActiveSection(section: Pick<SectionRow, 'status'> | null | undefined): boolean {
  if (!section) return false;
  return (section.status ?? 'approved') === 'approved';
}

const SECTION_LIST_COLUMNS = 'id, name, status';

/** Model layer: sections reference data and management. */
export class SectionRepository {
  constructor(private client: SupabaseClient) {}

  /** Returns all sections (id, name, status) — used for filters and dropdowns. */
  async list(): Promise<SectionRow[]> {
    const { data, error } = await this.client
      .from('sections')
      .select(SECTION_LIST_COLUMNS)
      .order('name', { ascending: true });
    if (error) {
      if (!isMissingColumnError(error)) return [];
      const fallback = await this.client
        .from('sections')
        .select('id, name')
        .order('name', { ascending: true });
      if (fallback.error) return [];
      return ((fallback.data as SectionRow[]) ?? []).map(s => ({
        ...s,
        status: 'approved' as SectionStatus,
      }));
    }
    return (data as SectionRow[]) ?? [];
  }

  /**
   * Returns only Active sections. Used wherever a section is chosen for a new
   * file or a changed file assignment, so disabled sections can never be
   * submitted from the UI.
   */
  async listActive(): Promise<SectionRow[]> {
    const { data, error } = await this.client
      .from('sections')
      .select(SECTION_LIST_COLUMNS)
      .eq('status', 'approved')
      .order('name', { ascending: true });
    if (error) {
      if (!isMissingColumnError(error)) throw error;
      // Legacy schema has no status column — every section is implicitly active.
      return this.list();
    }
    return (data as SectionRow[]) ?? [];
  }

  /** Returns all sections with full details — used for management page. */
  async listAll(): Promise<SectionRow[]> {
    const { data, error } = await this.client
      .from('sections')
      .select('id, name, status, section_lead, created_at')
      .order('id', { ascending: true });
    if (error) {
      if (!isMissingColumnError(error)) throw error;
      // Older schema without status/section_lead columns
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
      if (!isMissingColumnError(error)) throw error;
      const fallback = await this.client
        .from('sections')
        .select('id, name')
        .ilike('name', name.trim())
        .maybeSingle();
      if (fallback.error) throw fallback.error;
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
      if (!isMissingColumnError(error)) throw error;
      const fallback = await this.client
        .from('sections')
        .select('id, name')
        .eq('id', id)
        .maybeSingle();
      if (fallback.error) throw fallback.error;
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
      if (!isMissingColumnError(err)) throw err;
      const basicInsert: Record<string, unknown> = { name: name.trim() };
      const { data, error } = await this.client
        .from('sections')
        .insert(basicInsert)
        .select('id, name, created_at')
        .single();
      if (error) throw error;
      return { ...data, status: 'approved' as SectionStatus, section_lead: null } as SectionRow;
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
      if (!isMissingColumnError(err)) throw err;
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
  }

  async delete(id: number): Promise<void> {
    const { error } = await this.client
      .from('sections')
      .delete()
      .eq('id', id);
    if (error) throw error;
  }
}
