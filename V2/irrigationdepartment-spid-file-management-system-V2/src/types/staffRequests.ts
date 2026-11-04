import type {
  StaffRequestPriority,
  StaffRequestStatus,
  StaffRequestTab,
} from 'lib/staffRequests';

export interface StaffRequestExtension {
  id: number;
  previous_return_date: string;
  new_return_date: string;
  reason: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  reviewed_by_name?: string | null;
  reviewed_at?: string | null;
  review_note?: string | null;
  created_at: string;
}

/** One row of `staff_file_requests` as the staff panel consumes it. */
export interface StaffRequestRow {
  id: number;
  file_id?: number;
  file_no: string;
  file_name: string;
  section_name: string;
  storage_location: string;
  requester_name?: string;
  requester_email?: string;
  requester_section?: string | null;
  request_date: string;
  duration_days: number;
  priority: StaffRequestPriority;
  status: StaffRequestStatus;
  admin_notes: string | null;
  cancellation_reason?: string | null;
  reviewed_by?: string | null;
  reviewed_at?: string | null;
  reviewer_name?: string | null;
  reviewer_email?: string | null;
  original_return_date?: string | null;
  expected_return_date?: string | null;
  returned_at?: string | null;
  pending_extension?: StaffRequestExtension | null;
  extension_history?: StaffRequestExtension[];
  created_at: string;
}

export interface StaffRequestTabCounts {
  ongoing: number;
  pending: number;
  closed: number;
  cancelled: number;
}

export type StaffRequestTabCountMap = Record<StaffRequestTab, number>;
