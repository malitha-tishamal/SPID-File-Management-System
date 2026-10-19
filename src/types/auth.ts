export type UserRole = 'Staff' | 'Administrator';

export type AccountStatus = 'pending' | 'approved' | 'disabled' | 'locked' | 'rejected';

export interface ProfileDTO {
  id: string;
  full_name: string;
  email: string;
  role: UserRole;
  requested_role: UserRole | null;
  section_id: number | null;
  section_name: string | null;
  nic: string | null;
  mobile_phone: string | null;
  account_status: AccountStatus;
  approved_at: string | null;
  created_at: string;
  updated_at?: string | null;
  avatar_url?: string | null;
  last_login_at: string | null;
}

export interface AdminUserRow extends ProfileDTO {
  failed_attempts: number;
  locked_until: string | null;
}

export interface LockoutState {
  locked: boolean;
  failed_attempts: number;
  lockout_level: number;
  locked_until: string | null;
  remaining_seconds: number;
}

/** Machine-readable error codes shared by API routes and pages. */
export type ApiErrorCode =
  | 'CONFIG_ERROR'
  | 'VALIDATION_ERROR'
  | 'INVALID_CREDENTIALS'
  | 'EMAIL_NOT_CONFIRMED'
  | 'ACCOUNT_PENDING'
  | 'ACCOUNT_DISABLED'
  | 'ACCOUNT_LOCKED'
  | 'ACCOUNT_REJECTED'
  | 'LOGIN_LOCKED_OUT'
  | 'USER_EXISTS'
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'RATE_LIMITED'
  | 'AUTHENTICATION_DISCREPANCY'
  | 'AUTH_ERROR';
