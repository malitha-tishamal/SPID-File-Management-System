import { createHash, randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ApiError } from 'lib/apiResponse';
import {
  DEFAULT_ZIP_LIMITS,
  EXCEL_EXTENSIONS,
  DOCUMENT_IMAGE_EXTENSIONS,
  FileSignatureError,
  assertSignatureMatchesExtension,
  assertZipSafe,
  inspectZip,
  sanitizeDisplayFileName,
  type DetectedFile,
} from 'lib/fileSignatures';
import { MalwareScanService, type ScanResult } from 'services/MalwareScanner';
import { AuditLogRepository } from 'models/AuditLogRepository';
import { getSupabaseAdminClient } from 'config/supabase/server';

export type UploadCategory = 'excel' | 'document' | 'image';

export interface UploadPolicy {
  category: UploadCategory;
  allowedExtensions: readonly string[];
  maxBytes: number;
  label: string;
}

function envInt(name: string, fallback: number): number {
  const raw = process.env[name];
  const parsed = raw ? Number.parseInt(raw, 10) : NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export const UPLOAD_POLICIES: Record<UploadCategory, UploadPolicy> = {
  excel: {
    category: 'excel',
    allowedExtensions: EXCEL_EXTENSIONS,
    maxBytes: envInt('SECURITY_MAX_EXCEL_UPLOAD_BYTES', 10 * 1024 * 1024),
    label: 'Excel import file',
  },
  document: {
    category: 'document',
    allowedExtensions: DOCUMENT_IMAGE_EXTENSIONS,
    maxBytes: envInt('SECURITY_MAX_DOCUMENT_UPLOAD_BYTES', 20 * 1024 * 1024),
    label: 'Document',
  },
  image: {
    category: 'image',
    allowedExtensions: ['.jpg', '.jpeg', '.png', '.webp', '.gif'],
    maxBytes: envInt('SECURITY_MAX_IMAGE_UPLOAD_BYTES', 5 * 1024 * 1024),
    label: 'Image',
  },
};

export interface IngestContext {
  actorId?: string | null;
  actorRole?: string | null;
  source: string;
}

export interface SecuredUpload {
  bytes: Uint8Array;
  detected: DetectedFile;
  displayName: string;
  sha256: string;
  scan: ScanResult;
  quarantine: {
    path: string;
    reference: string;
  };
}

function quarantineRoot(): string {
  return process.env.UPLOAD_QUARANTINE_DIR || path.join(os.tmpdir(), 'spid-upload-quarantine');
}

function assertWithinSize(size: number, policy: UploadPolicy): void {
  if (!Number.isFinite(size) || size <= 0) {
    throw new ApiError(400, 'VALIDATION_ERROR', 'The uploaded file is empty.');
  }
  if (size > policy.maxBytes) {
    throw new ApiError(
      400,
      'VALIDATION_ERROR',
      `${policy.label} exceeds the ${Math.floor(policy.maxBytes / (1024 * 1024))} MB size limit.`,
    );
  }
}

function assertImageIntact(bytes: Uint8Array, format: DetectedFile['format']): void {
  const tail = bytes.subarray(Math.max(0, bytes.length - 64));
  const containsAscii = (text: string) => {
    const needle = Array.from(text).map((c) => c.charCodeAt(0));
    outer: for (let i = 0; i <= tail.length - needle.length; i += 1) {
      for (let j = 0; j < needle.length; j += 1) {
        if (tail[i + j] !== needle[j]) continue outer;
      }
      return true;
    }
    return false;
  };

  if (format === 'jpeg') {
    for (let i = tail.length - 2; i >= 0; i -= 1) {
      if (tail[i] === 0xff && tail[i + 1] === 0xd9) return;
    }
    throw new ApiError(400, 'VALIDATION_ERROR', 'The JPEG image is corrupted or incomplete.');
  }
  if (format === 'png' && !containsAscii('IEND')) {
    throw new ApiError(400, 'VALIDATION_ERROR', 'The PNG image is corrupted or incomplete.');
  }
  if (format === 'gif' && bytes[bytes.length - 1] !== 0x3b) {
    throw new ApiError(400, 'VALIDATION_ERROR', 'The GIF image is corrupted or incomplete.');
  }
  if (format === 'webp') {
    const declared =
      bytes[4] | (bytes[5] << 8) | (bytes[6] << 16) | (bytes[7] << 24);
    if (declared + 8 > bytes.length) {
      throw new ApiError(400, 'VALIDATION_ERROR', 'The WebP image is corrupted or incomplete.');
    }
  }
}

export class UploadSecurityService {
  /** Validate bytes, type, signature, macros, archive safety and size. */
  static validateUpload(
    filename: string,
    bytes: Uint8Array,
    policy: UploadPolicy,
  ): { detected: DetectedFile; displayName: string } {
    assertWithinSize(bytes.length, policy);
    const displayName = sanitizeDisplayFileName(filename);
    if (!displayName || displayName.length > 200) {
      throw new ApiError(400, 'VALIDATION_ERROR', 'The uploaded file name is invalid.');
    }

    try {
      const detected = assertSignatureMatchesExtension(
        bytes,
        displayName,
        policy.allowedExtensions,
      );

      if (detected.category === 'excel') {
        if (detected.format === 'xlsx') {
          assertZipSafe(inspectZip(bytes), {
            ...DEFAULT_ZIP_LIMITS,
            maxEntries: envInt('SECURITY_MAX_ARCHIVE_ENTRIES', DEFAULT_ZIP_LIMITS.maxEntries),
            maxTotalUncompressed: envInt(
              'SECURITY_MAX_ARCHIVE_UNCOMPRESSED_BYTES',
              DEFAULT_ZIP_LIMITS.maxTotalUncompressed,
            ),
          });
        }
      } else if (detected.category === 'image') {
        assertImageIntact(bytes, detected.format);
      }

      return { detected, displayName };
    } catch (err) {
      if (err instanceof FileSignatureError) {
        throw new ApiError(400, 'VALIDATION_ERROR', err.message);
      }
      throw err;
    }
  }

  private static async logEvent(
    ctx: IngestContext,
    action: string,
    details: Record<string, unknown>,
  ): Promise<void> {
    if (!process.env.SUPABASE_SERVICE_ROLE_KEY || !process.env.NEXT_PUBLIC_SUPABASE_URL) {
      return;
    }
    try {
      await new AuditLogRepository(getSupabaseAdminClient()).log({
        actorId: ctx.actorId ?? null,
        action,
        details,
      });
    } catch (err) {
      console.warn(`Security audit event "${action}" could not be recorded.`);
    }
  }

  private static async writeQuarantine(bytes: Uint8Array): Promise<{ path: string; reference: string }> {
    const root = quarantineRoot();
    await fs.mkdir(root, { recursive: true, mode: 0o700 });
    const reference = `${Date.now()}-${randomUUID()}.bin`;
    const filePath = path.join(root, reference);
    await fs.writeFile(filePath, bytes, { mode: 0o600, flag: 'wx' });
    return { path: filePath, reference };
  }

  /** Move an item out of the active scanning queue without exposing it. */
  private static async keepQuarantined(filePath: string, infected: boolean): Promise<void> {
    try {
      const suffix = infected ? '.infected' : '.scan-failed';
      await fs.rename(filePath, `${filePath}${suffix}`);
    } catch {
      // The file stays under the private quarantine directory either way.
    }
  }

  private static async cleanupOldQuarantine(): Promise<void> {
    const retentionMs = envInt('SECURITY_QUARANTINE_RETENTION_DAYS', 30) * 24 * 60 * 60 * 1000;
    const root = quarantineRoot();
    try {
      const entries = await fs.readdir(root, { withFileTypes: true });
      const cutoff = Date.now() - retentionMs;
      await Promise.all(
        entries.map(async (entry) => {
          if (!entry.isFile()) return;
          const full = path.join(root, entry.name);
          try {
            const stat = await fs.stat(full);
            if (stat.mtimeMs < cutoff) await fs.unlink(full);
          } catch {
            // Best-effort retention cleanup only.
          }
        }),
      );
    } catch {
      // Quarantine directory may not exist yet.
    }
  }

  /**
   * Full lifecycle: validate -> quarantine -> scan -> release or block.
   * Returns only after a clean verdict. Throws ApiError for rejected files.
   */
  static async ingest(
    filename: string,
    file: File,
    policy: UploadPolicy,
    ctx: IngestContext,
  ): Promise<SecuredUpload> {
    const declaredSize = Number(file?.size ?? 0);
    const displayName = sanitizeDisplayFileName(filename);

    await this.logEvent(ctx, 'security.upload_initiated', {
      source: ctx.source,
      category: policy.category,
      file_name: displayName,
      declared_size: declaredSize,
      declared_mime: file?.type || null,
    });

    if (declaredSize > policy.maxBytes) {
      await this.logEvent(ctx, 'security.file_validation_failed', {
        source: ctx.source,
        file_name: displayName,
        reason: 'size_limit',
        declared_size: declaredSize,
      });
      throw new ApiError(
        400,
        'VALIDATION_ERROR',
        `${policy.label} exceeds the ${Math.floor(policy.maxBytes / (1024 * 1024))} MB size limit.`,
      );
    }

    let bytes: Uint8Array;
    let detected: DetectedFile;
    try {
      bytes = new Uint8Array(await file.arrayBuffer());
      const validated = this.validateUpload(filename, bytes, policy);
      detected = validated.detected;
    } catch (err: any) {
      await this.logEvent(ctx, 'security.file_validation_failed', {
        source: ctx.source,
        file_name: displayName,
        reason: err?.message || 'validation_failed',
        declared_size: declaredSize,
      });
      throw err;
    }

    const sha256 = createHash('sha256').update(bytes).digest('hex');
    const quarantine = await this.writeQuarantine(bytes);
    await this.cleanupOldQuarantine();

    await this.logEvent(ctx, 'security.scan_started', {
      source: ctx.source,
      category: policy.category,
      file_name: displayName,
      size_bytes: bytes.length,
      detected_mime: detected.mime,
      sha256,
      quarantine_ref: quarantine.reference,
    });

    const scan = await MalwareScanService.scanFile(quarantine.path);
    const baseDetails = {
      source: ctx.source,
      category: policy.category,
      file_name: displayName,
      size_bytes: bytes.length,
      detected_mime: detected.mime,
      sha256,
      engine: scan.engine,
      duration_ms: scan.durationMs,
      quarantine_ref: quarantine.reference,
    };

    if (scan.status === 'infected') {
      await this.keepQuarantined(quarantine.path, true);
      await this.logEvent(ctx, 'security.malware_detected', {
        ...baseDetails,
        scan_status: 'INFECTED',
        signature: scan.signature || 'detected',
      });
      throw new ApiError(
        422,
        'MALWARE_DETECTED',
        'Security Warning – Malicious File Detected. The uploaded file has been identified as potentially malicious. It has been blocked from being processed or accessed.',
        { scan: { status: 'INFECTED' } },
      );
    }

    if (scan.status !== 'clean') {
      await this.keepQuarantined(quarantine.path, false);
      await this.logEvent(ctx, 'security.scan_failed', {
        ...baseDetails,
        scan_status: 'SCAN_FAILED',
        reason: scan.detail || 'scanner_error',
      });
      throw new ApiError(
        503,
        'SCANNER_UNAVAILABLE',
        'Security scanning is currently unavailable. The uploaded file has been quarantined and was not processed or made accessible.',
        { scan: { status: 'SCAN_FAILED' } },
      );
    }

    await this.logEvent(ctx, 'security.upload_clean', {
      ...baseDetails,
      scan_status: 'CLEAN',
    });

    return {
      bytes,
      detected,
      displayName,
      sha256,
      scan,
      quarantine,
    };
  }

  /** Remove the clean quarantine copy once the file has been released. */
  static async release(upload: SecuredUpload): Promise<void> {
    try {
      await fs.unlink(upload.quarantine.path);
    } catch {
      // Cleanup is best-effort; the file is under a private directory.
    }
  }

  /** Admin-safe scan summary (never includes detection signatures). */
  static publicSummary(upload: SecuredUpload): {
    status: 'Clean';
    engine: string;
    scanned_at: string;
    message: string;
  } {
    return {
      status: 'Clean',
      engine: upload.scan.engine || 'unknown',
      scanned_at: new Date().toISOString(),
      message: 'File security scan completed successfully.',
    };
  }
}
