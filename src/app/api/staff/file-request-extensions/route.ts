import { FileIssuanceController } from 'controllers/FileIssuanceController';
import { withErrorHandling } from 'lib/apiResponse';

export const dynamic = 'force-dynamic';

export const POST = withErrorHandling(async (req: Request) =>
  FileIssuanceController.requestExtension(req),
);
