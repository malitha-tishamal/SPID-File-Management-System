import { ApiError, jsonOk, requireServerEnv } from 'lib/apiResponse';
import { AuthorizationService } from 'services/AuthorizationService';
import { StorageService } from 'services/StorageService';
import { ProfileRepository } from 'models/ProfileRepository';
import { isValidNicFormat } from 'validators/authValidators';
import { getSupabaseAdminClient } from 'config/supabase/server';

/**
 * Controller layer: self-service profile management and secure uploads.
 */
export class ProfileController {
  /** PATCH /api/profile  body: { full_name?, nic?, mobile_phone?, section_id? } */
  static async updateOwn(req: Request) {
    requireServerEnv();
    const profile = await AuthorizationService.requireApprovedProfile();

    const body = await req.json().catch(() => null);
    if (!body) throw new ApiError(400, 'VALIDATION_ERROR', 'Invalid request body.');

    const patch: { full_name?: string; nic?: string; mobile_phone?: string; section_id?: number | null } = {};

    if (typeof body.full_name === 'string') {
      const name = body.full_name.trim();
      if (name.length < 3) {
        throw new ApiError(400, 'VALIDATION_ERROR', 'Full name must have at least 3 characters.');
      }
      patch.full_name = name;
    }
    if (typeof body.nic === 'string' && body.nic.trim() !== '') {
      const nic = body.nic.trim().toUpperCase();
      if (!isValidNicFormat(nic)) {
        throw new ApiError(400, 'VALIDATION_ERROR', 'Invalid NIC format (use 9 digits + V/X or 12 digits).');
      }
      patch.nic = nic;
    }
    if (typeof body.mobile_phone === 'string') {
      const digits = body.mobile_phone.replace(/\D/g, '').replace(/^0/, '');
      if (!/^\d{9}$/.test(digits)) {
        throw new ApiError(400, 'VALIDATION_ERROR', 'A valid 9-digit mobile number is required.');
      }
      patch.mobile_phone = `+94 ${digits.slice(0, 2)} ${digits.slice(2, 5)} ${digits.slice(5, 9)}`;
    }
    if (typeof body.section_id === 'number' || body.section_id === null) {
      patch.section_id = body.section_id;
    }

    if (Object.keys(patch).length === 0) {
      throw new ApiError(400, 'VALIDATION_ERROR', 'No editable fields provided.');
    }

    // Use admin client so the update commits smoothly
    const admin = getSupabaseAdminClient();
    const updated = await new ProfileRepository(admin).updateOwn(profile.id, patch);
    return jsonOk({ profile: updated, message: 'Profile details updated successfully.' });
  }

  /** POST /api/profile/avatar  multipart/form-data field: file */
  static async uploadAvatar(req: Request) {
    requireServerEnv();
    const profile = await AuthorizationService.requireApprovedProfile();

    const form = await req.formData().catch(() => null);
    const file = form?.get('file');
    if (!(file instanceof File)) {
      throw new ApiError(400, 'VALIDATION_ERROR', 'An image file is required.');
    }

    const result = await StorageService.uploadProfileImage(profile.id, file);
    return jsonOk({ ...result, message: 'Profile image uploaded.' });
  }
}
