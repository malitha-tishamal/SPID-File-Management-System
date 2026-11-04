import { NotificationController } from 'controllers/NotificationController';
import { withErrorHandling } from 'lib/apiResponse';

export const dynamic = 'force-dynamic';

export const POST = withErrorHandling(async (req: Request) =>
  NotificationController.markAllRead(req),
);
