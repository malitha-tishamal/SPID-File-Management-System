import { FileIssuanceController } from 'controllers/FileIssuanceController';
import { withErrorHandling } from 'lib/apiResponse';

export const dynamic = 'force-dynamic';

export const GET = withErrorHandling(async (req: Request) =>
  FileIssuanceController.listExtensions(req),
);
