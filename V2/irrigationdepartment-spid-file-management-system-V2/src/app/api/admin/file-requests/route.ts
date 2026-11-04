import { StaffFileRequestController } from 'controllers/StaffFileRequestController';
import { withErrorHandling } from 'lib/apiResponse';

export const dynamic = 'force-dynamic';

export const GET = withErrorHandling(async () =>
  StaffFileRequestController.listForAdmin(),
);
