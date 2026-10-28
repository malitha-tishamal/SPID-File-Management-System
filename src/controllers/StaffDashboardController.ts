import { jsonOk, requireServerEnv } from 'lib/apiResponse';
import { getSupabaseAdminClient } from 'config/supabase/server';
import { AuthorizationService } from 'services/AuthorizationService';
import { sriLankaTodayStart, sriLankaMonthStart } from 'lib/datetime';
import { getReturnStatus } from 'lib/returnStatus';

export class StaffDashboardController {
  static async getStats() {
    requireServerEnv();
    const profile = await AuthorizationService.requireApprovedProfile();
    const admin = getSupabaseAdminClient();

    const todayStartIso = sriLankaTodayStart().toISOString();
    const monthStartIso = sriLankaMonthStart().toISOString();

    // 1. Files added by this staff member (in files table)
    let thisMonthFilesAdded = 0;
    let todayFilesAdded = 0;
    try {
      const [thisMonthFilesRes, todayFilesRes] = await Promise.all([
        admin
          .from('files')
          .select('*', { count: 'exact', head: true })
          .or(`created_by.eq.${profile.id},registered_by.eq.${profile.id}`)
          .gte('created_at', monthStartIso),
        admin
          .from('files')
          .select('*', { count: 'exact', head: true })
          .or(`created_by.eq.${profile.id},registered_by.eq.${profile.id}`)
          .gte('created_at', todayStartIso),
      ]);
      thisMonthFilesAdded = thisMonthFilesRes.count ?? 0;
      todayFilesAdded = todayFilesRes.count ?? 0;
    } catch (fErr) {
      console.error('Error fetching files added count for staff dashboard:', fErr);
    }

    // 2. Staff file requests submitted by this staff member
    let thisMonthRequests = 0;
    let todayRequests = 0;
    let pendingRequests = 0;
    let ongoingFiles = 0;
    let lateFiles = 0;
    let totalRequests = 0;

    try {
      const { data: requests, error: reqError } = await admin
        .from('staff_file_requests')
        .select('id, status, expected_return_date, returned_at, created_at, request_date')
        .eq('requester_id', profile.id);

      if (reqError) {
        console.error('Error fetching staff requests for dashboard stats:', reqError);
      }

      const allRequests = requests || [];
      totalRequests = allRequests.length;
      const monthStartTime = new Date(monthStartIso).getTime();
      const todayStartTime = new Date(todayStartIso).getTime();
      const now = new Date();

      for (const req of allRequests) {
        const createdAtTime = req.created_at ? new Date(req.created_at).getTime() : 0;
        if (createdAtTime >= monthStartTime) {
          thisMonthRequests++;
        }
        if (createdAtTime >= todayStartTime) {
          todayRequests++;
        }
        if (req.status === 'PENDING') {
          pendingRequests++;
        }
        // Ongoing files: issued to this staff and not returned yet
        if (req.status === 'APPROVED' && !req.returned_at) {
          ongoingFiles++;
          const returnInfo = getReturnStatus(req.expected_return_date, req.returned_at, now);
          if (returnInfo.isOverdue) {
            lateFiles++;
          }
        }
      }
    } catch (rErr) {
      console.error('Error processing staff requests for dashboard stats:', rErr);
    }

    return jsonOk({
      thisMonthFilesAdded,
      todayFilesAdded,
      thisMonthRequests,
      todayRequests,
      pendingRequests,
      ongoingFiles,
      lateFiles,
      totalRequests,
    });
  }
}
