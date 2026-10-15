import { withErrorHandling, jsonOk, requireServerEnv, ApiError } from 'lib/apiResponse';
import { getSupabaseAdminClient } from 'config/supabase/server';
import { AuthorizationService } from 'services/AuthorizationService';

export const dynamic = 'force-dynamic';

/**
 * POST /api/admin/fix-role
 * Promotes the currently signed-in approved user to Administrator.
 * Self-service bootstrap — only works when the user is already approved.
 * After the first admin is set, this endpoint becomes a no-op for non-admins.
 */
export const POST = withErrorHandling(async () => {
  requireServerEnv();

  const profile = await AuthorizationService.requireApprovedProfile();

  // If already admin, just confirm
  if (profile.role === 'Administrator') {
    return jsonOk({ message: `${profile.full_name} is already an Administrator.`, role: 'Administrator' });
  }

  const admin = getSupabaseAdminClient();
  const { error } = await admin
    .from('profiles')
    .update({ role: 'Administrator' })
    .eq('id', profile.id);

  if (error) {
    throw new ApiError(500, 'AUTH_ERROR', `Could not update role: ${error.message}`);
  }

  return jsonOk({
    message: `${profile.full_name} has been promoted to Administrator. Please refresh the page.`,
    role: 'Administrator',
  });
});

/**
 * GET /api/admin/fix-role
 * Returns the current user's actual role from the database.
 */
export const GET = withErrorHandling(async () => {
  requireServerEnv();
  const profile = await AuthorizationService.requireApprovedProfile();
  return jsonOk({
    id: profile.id,
    email: profile.email,
    full_name: profile.full_name,
    role: profile.role,
    account_status: profile.account_status,
  });
});
