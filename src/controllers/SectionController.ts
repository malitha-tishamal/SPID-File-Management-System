import { ApiError, jsonOk, requireServerEnv } from 'lib/apiResponse';
import { getSupabaseAdminClient } from 'config/supabase/server';
import { SectionRepository } from 'models/SectionRepository';
import type { SectionStatus } from 'models/SectionRepository';
import { AuthorizationService } from 'services/AuthorizationService';
import { AuditLogRepository } from 'models/AuditLogRepository';

import { invalidatePublicSectionsCache } from 'lib/sectionsCacheStore';

let cachedAdminSections: any = null;
let lastAdminCacheTime = 0;
const ADMIN_SECTIONS_CACHE_TTL_MS = 10_000; // 10 seconds

export function invalidateSectionsCache() {
  cachedAdminSections = null;
  lastAdminCacheTime = 0;
  try {
    invalidatePublicSectionsCache();
  } catch {}
}

/**
 * Controller layer: section management.
 * All write operations require Administrator role.
 */
export class SectionController {
  /** GET /api/admin/sections — list all sections with full details. */
  static async listSections(req?: Request) {
    requireServerEnv();
    await AuthorizationService.requireAdminProfile();

    const isForce = req ? new URL(req.url).searchParams.get('refresh') === 'true' : false;
    const now = Date.now();
    if (!isForce && cachedAdminSections && now - lastAdminCacheTime < ADMIN_SECTIONS_CACHE_TTL_MS) {
      const res = jsonOk({ sections: cachedAdminSections });
      res.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate');
      return res;
    }

    const admin = getSupabaseAdminClient();
    const sections = await new SectionRepository(admin).listAll();
    cachedAdminSections = sections;
    lastAdminCacheTime = now;
    const res = jsonOk({ sections });
    res.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate');
    return res;
  }

  /** POST /api/admin/sections — create a new section. */
  static async createSection(req: Request) {
    requireServerEnv();
    const actor = await AuthorizationService.requireAdminProfile();
    const body = await req.json().catch(() => null);
    if (!body) throw new ApiError(400, 'VALIDATION_ERROR', 'Request body is required.');

    const name = String(body.name ?? '').trim();
    const sectionLead = body.section_lead ? String(body.section_lead).trim() : undefined;

    if (!name || name.length < 3) {
      throw new ApiError(400, 'VALIDATION_ERROR', 'Section name must be at least 3 characters.');
    }
    if (name.length > 120) {
      throw new ApiError(400, 'VALIDATION_ERROR', 'Section name must be 120 characters or fewer.');
    }

    const admin = getSupabaseAdminClient();
    const repo = new SectionRepository(admin);

    // Check duplicate
    const existing = await repo.findByName(name);
    if (existing) {
      throw new ApiError(409, 'VALIDATION_ERROR', 'A section with this name already exists.');
    }

    const section = await repo.create(name, sectionLead);

    try {
      await new AuditLogRepository(admin).log({
        actorId: actor.id,
        targetUserId: null as any,
        action: 'section_created',
        details: { section_id: section.id, name },
      });
    } catch {}

    invalidateSectionsCache();
    return jsonOk({ section, message: `Section "${name}" has been created.` }, 201);
  }

  /** PATCH /api/admin/sections/[id] — update name, status, or section_lead. */
  static async updateSection(req: Request, sectionId: string) {
    requireServerEnv();
    const actor = await AuthorizationService.requireAdminProfile();
    const body = await req.json().catch(() => null);
    if (!body) throw new ApiError(400, 'VALIDATION_ERROR', 'Request body is required.');

    const id = parseInt(sectionId, 10);
    if (isNaN(id)) throw new ApiError(400, 'VALIDATION_ERROR', 'Invalid section ID.');

    const admin = getSupabaseAdminClient();
    const repo = new SectionRepository(admin);

    const target = await repo.findById(id);
    if (!target) throw new ApiError(404, 'NOT_FOUND', 'Section not found.');

    const patch: { name?: string; status?: SectionStatus; section_lead?: string | null } = {};

    if (body.name !== undefined) {
      const name = String(body.name).trim();
      if (name.length < 3) throw new ApiError(400, 'VALIDATION_ERROR', 'Section name must be at least 3 characters.');
      if (name.length > 120) throw new ApiError(400, 'VALIDATION_ERROR', 'Section name must be 120 characters or fewer.');
      if (name.toLowerCase() !== target.name.toLowerCase()) {
        const dup = await repo.findByName(name);
        if (dup && dup.id !== id) throw new ApiError(409, 'VALIDATION_ERROR', 'A section with this name already exists.');
      }
      patch.name = name;
    }

    if (body.status !== undefined) {
      if (!['approved', 'pending', 'disabled'].includes(body.status)) {
        throw new ApiError(400, 'VALIDATION_ERROR', 'Invalid status value.');
      }
      patch.status = body.status as SectionStatus;
    }

    if (body.section_lead !== undefined) {
      patch.section_lead = body.section_lead ? String(body.section_lead).trim() : null;
    }

    const updated = await repo.update(id, patch);

    try {
      await new AuditLogRepository(admin).log({
        actorId: actor.id,
        targetUserId: null as any,
        action: 'section_updated',
        details: { section_id: id, patch },
      });
    } catch {}

    invalidateSectionsCache();
    return jsonOk({ section: updated, message: `Section "${updated.name}" has been updated.` });
  }

  /** DELETE /api/admin/sections/[id] — permanently delete a section. */
  static async deleteSection(_req: Request, sectionId: string) {
    requireServerEnv();
    const actor = await AuthorizationService.requireAdminProfile();

    const id = parseInt(sectionId, 10);
    if (isNaN(id)) throw new ApiError(400, 'VALIDATION_ERROR', 'Invalid section ID.');

    const admin = getSupabaseAdminClient();
    const repo = new SectionRepository(admin);

    const target = await repo.findById(id);
    if (!target) throw new ApiError(404, 'NOT_FOUND', 'Section not found.');

    // Check if any profiles reference this section
    const { count } = await admin
      .from('profiles')
      .select('id', { count: 'exact', head: true })
      .eq('section_id', id);

    if (count && count > 0) {
      throw new ApiError(
        409,
        'VALIDATION_ERROR',
        `Cannot delete "${target.name}" — ${count} staff member${count > 1 ? 's' : ''} are assigned to this section. Reassign them first.`
      );
    }

    try {
      await new AuditLogRepository(admin).log({
        actorId: actor.id,
        targetUserId: null as any,
        action: 'section_deleted',
        details: { section_id: id, name: target.name },
      });
    } catch {}

    await repo.delete(id);
    invalidateSectionsCache();
    return jsonOk({ message: `Section "${target.name}" has been permanently deleted.` });
  }
}
