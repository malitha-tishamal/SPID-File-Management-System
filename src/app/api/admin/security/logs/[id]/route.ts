import { SecurityController } from 'controllers/SecurityController';
import { withErrorHandling } from 'lib/apiResponse';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

type Ctx = { params: Promise<{ id: string }> };

export const DELETE = withErrorHandling(async (req: Request, ctx: Ctx) => {
  const { id } = await ctx.params;
  return SecurityController.deleteOne(id);
});
