import { SectionController } from 'controllers/SectionController';
import { withErrorHandling } from 'lib/apiResponse';

export const dynamic = 'force-dynamic';

export const GET = withErrorHandling(async () => SectionController.listSections());
export const POST = withErrorHandling(async (req) => SectionController.createSection(req));
