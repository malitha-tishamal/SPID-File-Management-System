import { FileController } from 'controllers/FileController';
import { withErrorHandling } from 'lib/apiResponse';

export const dynamic = 'force-dynamic';

export const GET = withErrorHandling(async () => FileController.listFiles());

export const POST = withErrorHandling(async (req: Request) => FileController.createFile(req));
