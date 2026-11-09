import { AdminController } from 'controllers/AdminController';
import { withErrorHandling } from 'lib/apiResponse';

export const dynamic = 'force-dynamic';

/** Admin-only endpoint: always creates an Administrator account. */
export const POST = withErrorHandling((req: Request) =>
  AdminController.createUserAs(req, 'Administrator')
);
