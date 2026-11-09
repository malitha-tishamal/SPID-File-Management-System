import { SecurityController } from 'controllers/SecurityController';
import { withErrorHandling } from 'lib/apiResponse';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export const POST = withErrorHandling(async (req: Request) =>
  SecurityController.restoreLogs(req),
);
