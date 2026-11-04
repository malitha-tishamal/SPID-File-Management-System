import { AdminController } from 'controllers/AdminController';
import { withErrorHandling } from 'lib/apiResponse';

export const dynamic = 'force-dynamic';

export const GET = withErrorHandling(async (req: Request) => AdminController.listUsers(req));
export const POST = withErrorHandling((req: Request) => AdminController.createUser(req));

