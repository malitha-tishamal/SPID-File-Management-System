import { StaffFileRequestController } from 'controllers/StaffFileRequestController';
import { withErrorHandling } from 'lib/apiResponse';

export const dynamic = 'force-dynamic';

export const GET = withErrorHandling(async (req: Request) => {
  const url = new URL(req.url);
  if (url.searchParams.has('file_id')) {
    return StaffFileRequestController.checkCompeting(req);
  }
  return StaffFileRequestController.listMine(req);
});

export const POST = withErrorHandling(async (req: Request) =>
  StaffFileRequestController.create(req),
);
