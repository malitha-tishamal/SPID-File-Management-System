import { SectionController } from 'controllers/SectionController';
import { withErrorHandling } from 'lib/apiResponse';

export const dynamic = 'force-dynamic';

export const PATCH = withErrorHandling(
  async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
    const { id } = await ctx.params;
    return SectionController.updateSection(req, id);
  }
);

export const DELETE = withErrorHandling(
  async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
    const { id } = await ctx.params;
    return SectionController.deleteSection(req, id);
  }
);
