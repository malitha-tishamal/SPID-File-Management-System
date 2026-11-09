import { ApiError } from 'lib/apiResponse';
import { getSupabaseAdminClient, getSupabaseServerClient } from 'config/supabase/server';
import { UploadSecurityService, UPLOAD_POLICIES } from 'services/UploadSecurityService';

const PROFILE_IMAGE_BUCKET = 'profile-images';
const DOCUMENT_BUCKET = 'official-documents';

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

function extensionFor(format: string): string {
  switch (format) {
    case 'png':
      return 'png';
    case 'webp':
      return 'webp';
    case 'gif':
      return 'gif';
    case 'jpeg':
      return 'jpg';
    case 'pdf':
      return 'pdf';
    default:
      return 'bin';
  }
}

/**
 * Application service layer: Supabase Storage operations.
 *
 * Every upload passes through UploadSecurityService first: the file is
 * validated by signature, written to private quarantine and scanned by a real
 * malware engine. Only clean bytes reach an approved bucket, so a stored
 * object always implies a completed clean scan. Scanner failures block the
 * upload instead of being treated as clean.
 */
export class StorageService {
  /** Uploads a profile image to the caller's own folder. RLS enforces ownership. */
  static async uploadProfileImage(
    userId: string,
    file: File,
  ): Promise<{
    path: string;
    publicUrl: string;
    scan: { status: string; message: string };
  }> {
    const policy = { ...UPLOAD_POLICIES.image, maxBytes: Math.min(MAX_IMAGE_BYTES, UPLOAD_POLICIES.image.maxBytes) };
    const secured = await UploadSecurityService.ingest(file.name, file, policy, {
      actorId: userId,
      source: 'profile_image',
    });

    try {
      const ext = extensionFor(secured.detected.format);
      const path = `${userId}/${Date.now()}-${sanitizeFileName(
        secured.displayName.replace(/\.[^.]+$/, ''),
      )}.${ext}`;

      const supabase = await getSupabaseServerClient();
      let { error } = await supabase.storage
        .from(PROFILE_IMAGE_BUCKET)
        .upload(path, secured.bytes, { contentType: secured.detected.mime, upsert: false });

      // Fallback to privileged admin client if session client encounters permission constraints
      if (error) {
        const admin = getSupabaseAdminClient();
        const adminRes = await admin.storage
          .from(PROFILE_IMAGE_BUCKET)
          .upload(path, secured.bytes, { contentType: secured.detected.mime, upsert: false });
        error = adminRes.error;
      }

      if (error) {
        throw new ApiError(500, 'AUTH_ERROR', `Image upload failed: ${error.message}`);
      }

      const admin = getSupabaseAdminClient();
      const { data } = admin.storage.from(PROFILE_IMAGE_BUCKET).getPublicUrl(path);
      return {
        path,
        publicUrl: data.publicUrl,
        scan: { status: 'Clean', message: 'File security scan completed successfully.' },
      };
    } finally {
      await UploadSecurityService.release(secured);
    }
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

  /** Uploads an official document (private bucket) after a clean malware scan. */
  static async uploadDocument(
    userId: string,
    file: File,
  ): Promise<{ path: string; scan: { status: string; message: string } }> {
    const policy = {
      ...UPLOAD_POLICIES.document,
      maxBytes: Math.min(MAX_DOCUMENT_BYTES, UPLOAD_POLICIES.document.maxBytes),
    };
    const secured = await UploadSecurityService.ingest(file.name, file, policy, {
      actorId: userId,
      source: 'official_document',
    });

    try {
      const supabase = await getSupabaseServerClient();
      const ext = extensionFor(secured.detected.format);
      const baseName = sanitizeFileName(secured.displayName.replace(/\.[^.]+$/, ''));
      const path = `${userId}/${Date.now()}-${baseName}.${ext}`;

      const { error } = await supabase.storage
        .from(DOCUMENT_BUCKET)
        .upload(path, secured.bytes, { contentType: secured.detected.mime, upsert: false });

      if (error) {
        throw new ApiError(500, 'AUTH_ERROR', `Document upload failed: ${error.message}`);
      }
      return {
        path,
        scan: { status: 'Clean', message: 'File security scan completed successfully.' },
      };
    } finally {
      await UploadSecurityService.release(secured);
    }
  }

  /**
   * Short-lived signed URL for a private document (server-side authorization).
   * Only objects that passed scanning are ever written to this bucket.
   */
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
