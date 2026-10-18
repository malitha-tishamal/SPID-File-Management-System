import { SectionController } from 'controllers/SectionController';
import { withErrorHandling } from 'lib/apiResponse';

export const dynamic = 'force-dynamic';

export const GET = withErrorHandling(async (req) => SectionController.listSections(req));
export const POST = withErrorHandling(async (req) => SectionController.createSection(req));
