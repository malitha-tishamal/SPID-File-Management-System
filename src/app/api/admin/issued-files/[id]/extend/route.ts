import { FileIssuanceController } from 'controllers/FileIssuanceController';
import { withErrorHandling } from 'lib/apiResponse';

export const dynamic = 'force-dynamic';

export const POST = withErrorHandling(
  async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
    const { id } = await ctx.params;
    return FileIssuanceController.extendReturnDate(req, id);
  },
);
