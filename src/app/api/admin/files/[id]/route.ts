import { FileController } from 'controllers/FileController';
import { withErrorHandling } from 'lib/apiResponse';

export const dynamic = 'force-dynamic';

export const GET = withErrorHandling(
  async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
    const { id } = await ctx.params;
    return FileController.getFile(Number(id));
  }
);

export const PUT = withErrorHandling(
  async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
    const { id } = await ctx.params;
    return FileController.updateFile(Number(id), req);
  }
);

export const DELETE = withErrorHandling(
  async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
    const { id } = await ctx.params;
    return FileController.deleteFile(Number(id));
  }
);
