import { AdminController } from 'controllers/AdminController';
import { withErrorHandling } from 'lib/apiResponse';

export const dynamic = 'force-dynamic';

/** Debounced blur-time availability check for the registration modals. */
export const GET = withErrorHandling((req: Request) => AdminController.checkAvailability(req));
