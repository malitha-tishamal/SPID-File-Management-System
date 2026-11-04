import { AuthController } from 'controllers/AuthController';
import { withErrorHandling } from 'lib/apiResponse';

export const dynamic = 'force-dynamic';

export const GET = withErrorHandling(async () => AuthController.me());
export const POST = withErrorHandling(async (req: Request) => AuthController.me(req));
