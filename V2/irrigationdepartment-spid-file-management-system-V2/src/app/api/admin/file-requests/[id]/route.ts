import { StaffFileRequestController } from 'controllers/StaffFileRequestController';
import { withErrorHandling } from 'lib/apiResponse';

export const dynamic = 'force-dynamic';

export const PATCH = withErrorHandling(
  async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
    const { id } = await ctx.params;
    return StaffFileRequestController.review(req, id);
  },
);
