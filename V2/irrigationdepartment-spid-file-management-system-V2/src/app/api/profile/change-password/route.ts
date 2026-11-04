import { withErrorHandling, jsonOk, requireServerEnv, ApiError } from 'lib/apiResponse';
import { AuthorizationService } from 'services/AuthorizationService';
import { getSupabaseAdminClient } from 'config/supabase/server';
import { validatePasswordPair } from 'validators/authValidators';

export const dynamic = 'force-dynamic';

/**
 * POST /api/profile/change-password
 * Body: { currentPassword, newPassword, confirmPassword }
 */
export const POST = withErrorHandling(async (req: Request) => {
  requireServerEnv();
  const profile = await AuthorizationService.requireApprovedProfile();

  const body = await req.json().catch(() => null);
  if (!body) throw new ApiError(400, 'VALIDATION_ERROR', 'Invalid request body.');

  const { currentPassword, newPassword, confirmPassword } = body;

  if (!currentPassword) {
    throw new ApiError(400, 'VALIDATION_ERROR', 'Please enter your current password.');
  }

  const passErr = validatePasswordPair(newPassword, confirmPassword);
  if (passErr) {
    throw new ApiError(400, 'VALIDATION_ERROR', passErr);
  }

  const admin = getSupabaseAdminClient();

  // Verify current password by attempting an auth check with admin
  const { error: signInErr } = await admin.auth.signInWithPassword({
    email: profile.email,
    password: currentPassword,
  });

  if (signInErr) {
    throw new ApiError(
      400,
      'AUTHENTICATION_DISCREPANCY',
      'We could not verify and update your credentials. Please review the security requirements and re-enter your current password.'
    );
  }

  // Update password in Supabase Auth
  const { error: updateErr } = await admin.auth.admin.updateUserById(profile.id, {
    password: newPassword,
  });

  if (updateErr) {
    throw new ApiError(
      500,
      'AUTH_ERROR',
      updateErr.message || 'Failed to commit the updated password to the identity provider.'
    );
  }

  return jsonOk({
    message:
      'Your official SPID administrative credentials and cryptographic session tokens have been synchronized and updated according to departmental security protocols.',
  });
});
