import { FileController } from 'controllers/FileController';
import { withErrorHandling } from 'lib/apiResponse';

export const dynamic = 'force-dynamic';

export const POST = withErrorHandling(async (req: Request) =>
  FileController.bulkImportFiles(req),
);
