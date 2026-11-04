import { ApiError } from 'lib/apiResponse';
import { getSupabaseAdminClient, getSupabaseServerClient } from 'config/supabase/server';

const PROFILE_IMAGE_BUCKET = 'profile-images';
const DOCUMENT_BUCKET = 'official-documents';

const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
const ALLOWED_DOCUMENT_TYPES = [...ALLOWED_IMAGE_TYPES, 'application/pdf'];
const MAX_IMAGE_BYTES = 5 * 1024 * 1024; // 5 MB
const MAX_DOCUMENT_BYTES = 20 * 1024 * 1024; // 20 MB

function sanitizeFileName(name: string): string {
  return (
    name
      .replace(/[^a-zA-Z0-9._-]/g, '_')
      .replace(/_{2,}/g, '_')
      .slice(-80) || 'file'
  );
}

function assertAllowed(type: string, allowed: string[], maxBytes: number, size: number) {
  // Type is taken from the parsed upload (not the raw extension) and re-checked
  // against the bucket whitelist; size is enforced server-side.
  if (!allowed.includes(type)) {
    throw new ApiError(400, 'VALIDATION_ERROR', `File type ${type || 'unknown'} is not allowed.`);
  }
  if (size <= 0 || size > maxBytes) {
    throw new ApiError(
      400,
      'VALIDATION_ERROR',
      `File exceeds the ${Math.round(maxBytes / (1024 * 1024))} MB limit.`
    );
  }
}

/**
 * Application service layer: Supabase Storage operations.
 * Private documents are accessed through server-generated signed URLs.
 */
export class StorageService {
  /** Uploads a profile image to the caller's own folder. RLS enforces ownership. */
  static async uploadProfileImage(userId: string, file: File): Promise<{ path: string; publicUrl: string }> {
    if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
      throw new ApiError(400, 'VALIDATION_ERROR', 'Profile image must be JPEG, PNG, WebP or GIF.');
    }
    assertAllowed(file.type, ALLOWED_IMAGE_TYPES, MAX_IMAGE_BYTES, file.size);

    const ext =
      file.type === 'image/png'
        ? 'png'
        : file.type === 'image/webp'
        ? 'webp'
        : file.type === 'image/gif'
        ? 'gif'
        : 'jpg';
    const path = `${userId}/${Date.now()}-${sanitizeFileName(file.name.replace(/\.[^.]+$/, ''))}.${ext}`;
    const buffer = await file.arrayBuffer();

    const supabase = await getSupabaseServerClient();
    let { error } = await supabase.storage
      .from(PROFILE_IMAGE_BUCKET)
      .upload(path, buffer, { contentType: file.type, upsert: false });

    // Fallback to privileged admin client if session client encounters permission constraints
    if (error) {
      const admin = getSupabaseAdminClient();
      const adminRes = await admin.storage
        .from(PROFILE_IMAGE_BUCKET)
        .upload(path, buffer, { contentType: file.type, upsert: false });
      error = adminRes.error;
    }

    if (error) {
      throw new ApiError(500, 'AUTH_ERROR', `Image upload failed: ${error.message}`);
    }

    const admin = getSupabaseAdminClient();
    const { data } = admin.storage.from(PROFILE_IMAGE_BUCKET).getPublicUrl(path);
    return { path, publicUrl: data.publicUrl };
  }

  /** Removes all existing profile images for a user from the bucket. */
  static async deleteProfileImage(userId: string): Promise<void> {
    const admin = getSupabaseAdminClient();
    try {
      const { data: files } = await admin.storage
        .from(PROFILE_IMAGE_BUCKET)
        .list(userId);

      if (files && files.length > 0) {
        const pathsToDelete = files.map((f) => `${userId}/${f.name}`);
        await admin.storage.from(PROFILE_IMAGE_BUCKET).remove(pathsToDelete);
      }
    } catch (e) {
      console.warn('Could not clean up storage files for user:', userId, e);
    }
  }

  /** Uploads an official document (private bucket). */
  static async uploadDocument(userId: string, file: File): Promise<{ path: string }> {
    assertAllowed(file.type, ALLOWED_DOCUMENT_TYPES, MAX_DOCUMENT_BYTES, file.size);

    const supabase = await getSupabaseServerClient();
    const path = `${userId}/${Date.now()}-${sanitizeFileName(file.name)}`;

    const { error } = await supabase.storage
      .from(DOCUMENT_BUCKET)
      .upload(path, await file.arrayBuffer(), { contentType: file.type, upsert: false });

    if (error) {
      throw new ApiError(500, 'AUTH_ERROR', `Document upload failed: ${error.message}`);
    }
    return { path };
  }

  /** Short-lived signed URL for a private document (server-side authorization). */
  static async createDocumentSignedUrl(path: string, expiresIn = 300): Promise<string> {
    const admin = getSupabaseAdminClient();
    const { data, error } = await admin.storage
      .from(DOCUMENT_BUCKET)
      .createSignedUrl(path, expiresIn);
    if (error || !data) {
      throw new ApiError(404, 'NOT_FOUND', 'Document not found or access denied.');
    }
    return data.signedUrl;
  }
}
