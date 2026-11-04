import { StaffDashboardController } from 'controllers/StaffDashboardController';
import { withErrorHandling } from 'lib/apiResponse';

export const dynamic = 'force-dynamic';

export const GET = withErrorHandling(async () => {
  return StaffDashboardController.getStats();
});
