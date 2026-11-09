import { AdminController } from 'controllers/AdminController';
import { withErrorHandling } from 'lib/apiResponse';

export const dynamic = 'force-dynamic';

/**
 * Admin-only endpoint: always creates a Staff account. Any explicit
 * non-staff `role` in the payload is rejected with ROLE_NOT_ALLOWED.
 */
export const POST = withErrorHandling((req: Request) =>
  AdminController.createUserAs(req, 'Staff')
);
