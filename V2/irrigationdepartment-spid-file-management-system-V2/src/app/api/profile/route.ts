import { ProfileController } from 'controllers/ProfileController';
import { withErrorHandling } from 'lib/apiResponse';

export const dynamic = 'force-dynamic';

export const PATCH = withErrorHandling(async (req: Request) => ProfileController.updateOwn(req));
