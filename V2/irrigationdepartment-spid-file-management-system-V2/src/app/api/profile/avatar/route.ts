import { ProfileController } from 'controllers/ProfileController';
import { withErrorHandling } from 'lib/apiResponse';

export const dynamic = 'force-dynamic';

export const POST = withErrorHandling(async (req: Request) => ProfileController.uploadAvatar(req));
export const DELETE = withErrorHandling(async (req: Request) => ProfileController.deleteAvatar(req));
