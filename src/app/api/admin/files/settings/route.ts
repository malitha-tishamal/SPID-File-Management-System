import { FileController } from 'controllers/FileController';
import { withErrorHandling } from 'lib/apiResponse';

export const dynamic = 'force-dynamic';

export const GET = withErrorHandling(async () => FileController.getApprovalSetting());

export const POST = withErrorHandling(async (req: Request) => FileController.updateApprovalSetting(req));
