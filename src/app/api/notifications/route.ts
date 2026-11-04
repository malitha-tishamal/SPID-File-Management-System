import { NotificationController } from 'controllers/NotificationController';
import { withErrorHandling } from 'lib/apiResponse';

export const dynamic = 'force-dynamic';

export const GET = withErrorHandling(async (req: Request) =>
  NotificationController.listMine(req),
);
