import { SectionController } from 'controllers/SectionController';
import { withErrorHandling } from 'lib/apiResponse';

export const dynamic = 'force-dynamic';

export const PATCH = withErrorHandling(async (req, ctx) =>
  SectionController.updateSection(req, ctx.params.id)
);

export const DELETE = withErrorHandling(async (req, ctx) =>
  SectionController.deleteSection(req, ctx.params.id)
);
