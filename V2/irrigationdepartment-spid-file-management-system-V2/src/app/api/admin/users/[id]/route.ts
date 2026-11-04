import { AdminController } from 'controllers/AdminController';
import { withErrorHandling } from 'lib/apiResponse';

export const dynamic = 'force-dynamic';

export const PATCH = withErrorHandling(
  async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
    const { id } = await ctx.params;
    return AdminController.updateUser(req, id);
  }
);

export const DELETE = withErrorHandling(
  async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
    const { id } = await ctx.params;
    return AdminController.deleteUser(req, id);
  }
);
