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
  /** Soft-deleted accounts keep their records; they cannot sign in. */
  is_deleted?: boolean;
  deleted_at?: string | null;
  deleted_by?: string | null;
  deletion_reason?: string | null;
  /** Address before deletion; `email` is anonymised once deleted. */
  original_email?: string | null;
}

export interface AdminUserRow extends ProfileDTO {
  failed_attempts: number;
  locked_until: string | null;
  lockout_level?: number;
  is_permanently_locked?: boolean;
  locked_at?: string | null;
  last_failed_login_at?: string | null;
  last_failed_login_ip?: string | null;
}

export interface LockoutState {
  locked: boolean;
  failed_attempts: number;
  lockout_level: number;
  locked_until: string | null;
  remaining_seconds: number;
  /** True once the account passed the timed-lock stages and is locked until an administrator intervenes. */
  permanent?: boolean;
  is_permanently_locked?: boolean;
  locked_at?: string | null;
  last_failed_login_at?: string | null;
  last_failed_login_ip?: string | null;
}

/** Reasons persisted for every sign-in attempt (never the password itself). */
export type LoginAttemptReason =
  | 'INVALID_PASSWORD'
  | 'LOCKED_TEMP'
  | 'LOCKED_PERMANENT'
  | 'SUCCESS';

export interface LoginRequestMeta {
  ip?: string | null;
  userAgent?: string | null;
}

/** Machine-readable error codes shared by API routes and pages. */
export type ApiErrorCode =
  | 'CONFIG_ERROR'
  | 'VALIDATION_ERROR'
  | 'FIELD_TOO_LONG'
  | 'INVALID_CREDENTIALS'
  | 'EMAIL_NOT_CONFIRMED'
  | 'ACCOUNT_PENDING'
  | 'ACCOUNT_DISABLED'
  | 'ACCOUNT_LOCKED'
  | 'ACCOUNT_REJECTED'
  | 'ACCOUNT_LOCKED_TEMP'
  | 'ACCOUNT_LOCKED_PERMANENT'
  | 'LOGIN_LOCKED_OUT'
  | 'USER_EXISTS'
  | 'DUPLICATE_REQUEST'
  | 'REQUEST_CONFLICT'
  | 'UNAUTHORIZED'
  | 'SESSION_EXPIRED_INACTIVITY'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'RATE_LIMITED'
  | 'AUTHENTICATION_DISCREPANCY'
  | 'AUTH_ERROR'
  | 'MALWARE_DETECTED'
  | 'SCANNER_UNAVAILABLE'
  | 'USER_HAS_ACTIVE_CHECKOUTS'
  | 'USER_HAS_PENDING_REQUESTS'
  | 'USER_HAS_RECORDS'
  | 'LAST_ACTIVE_ADMIN'
  | 'ACCOUNT_ALREADY_DELETED'
  | 'ACCOUNT_NOT_DELETED'
  | 'EMAIL_TAKEN'
  | 'PHONE_TAKEN'
  | 'ROLE_NOT_ALLOWED'
  | 'LOCATION_NOT_ASSIGNED'
  | 'REQUEST_ALREADY_HANDLED'
  | 'INTERNAL_ERROR';
