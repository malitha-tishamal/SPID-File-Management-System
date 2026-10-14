import { AuthController } from 'controllers/AuthController';
import { withErrorHandling } from 'lib/apiResponse';

export const dynamic = 'force-dynamic';

export const POST = withErrorHandling(async (req: Request) => AuthController.login(req));
