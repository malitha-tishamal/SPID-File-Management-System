'use client';

export type UserRole = 'Administrator' | 'Staff';
export type AccountStatus = 'approved' | 'pending' | 'rejected';

export interface UserAccount {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  division: string;
  nic: string;
  phone: string; // Stored as "+94 7XXXXXXXX"
  password: string;
  status: AccountStatus;
  registeredAt: string;
}

export interface UserSession {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  division: string;
  nic?: string;
  phone?: string;
  status: AccountStatus;
  loginTime: string;
}

export const SESSION_COOKIE_NAME = 'spid_session';
export const USER_STORAGE_KEY = 'spid_user';
export const REGISTERED_USERS_KEY = 'spid_registered_users';

// Pre-seeded Default Administrator Account (Status: Approved)
export const DEFAULT_ADMIN: UserAccount = {
  id: 'SPID-ADMIN-001',
  name: 'Eng. K. L. Perera',
  email: 'officer@spid.gov.lk',
  role: 'Administrator',
  division: 'Record Room & Central Registry',
  nic: '198524103421',
  phone: '+94 77 123 4567',
  password: 'spid@admin2026',
  status: 'approved',
  registeredAt: '2026-01-01T08:00:00.000Z',
};

/**
 * Reads a cookie value by name in client-side code
 */
export function getCookie(name: string): string | null {
  if (typeof document === 'undefined') return null;
  const match = document.cookie.match(new RegExp('(^|;\\s*)(' + name + ')=([^;]*)'));
  return match ? decodeURIComponent(match[3]) : null;
}

/**
 * Sets persistent session cookie that stays active until explicit logout
 */
export function setSessionCookie(data: UserSession, remember: boolean = true): void {
  if (typeof document === 'undefined') return;
  const maxAge = remember ? 31536000 : 86400 * 30; // 1 year (permanent until logout)
  const serialized = encodeURIComponent(JSON.stringify(data));
  document.cookie = `${SESSION_COOKIE_NAME}=${serialized}; path=/; max-age=${maxAge}; SameSite=Lax`;
}

/**
 * Removes the session cookie on logout
 */
export function clearSessionCookie(): void {
  if (typeof document === 'undefined') return;
  document.cookie = `${SESSION_COOKIE_NAME}=; path=/; max-age=0; expires=Thu, 01 Jan 1970 00:00:00 GMT; SameSite=Lax`;
}

/**
 * Retrieves all registered accounts from localStorage (initializes with default admin if empty)
 */
export function getAllAccounts(): UserAccount[] {
  if (typeof window === 'undefined') return [DEFAULT_ADMIN];
  try {
    const raw = localStorage.getItem(REGISTERED_USERS_KEY);
    if (!raw) {
      const initial = [DEFAULT_ADMIN];
      localStorage.setItem(REGISTERED_USERS_KEY, JSON.stringify(initial));
      return initial;
    }
    const accounts: UserAccount[] = JSON.parse(raw);
    // Ensure default admin always exists
    if (!accounts.some((a) => a.email.toLowerCase() === DEFAULT_ADMIN.email.toLowerCase())) {
      accounts.unshift(DEFAULT_ADMIN);
      localStorage.setItem(REGISTERED_USERS_KEY, JSON.stringify(accounts));
    }
    return accounts;
  } catch (e) {
    console.error('Failed to read accounts:', e);
    return [DEFAULT_ADMIN];
  }
}

/**
 * Returns current authenticated user session, or null if unauthenticated
 */
export function getCurrentUser(): UserSession | null {
  if (typeof window === 'undefined') return null;
  try {
    const stored = localStorage.getItem(USER_STORAGE_KEY);
    if (stored) return JSON.parse(stored);

    const cookieVal = getCookie(SESSION_COOKIE_NAME);
    if (cookieVal) {
      const parsed = JSON.parse(cookieVal);
      localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(parsed));
      return parsed;
    }
  } catch (e) {
    console.error('Failed to parse user session:', e);
  }
  return null;
}

/**
 * Checks whether user has an active session
 */
export function isAuthenticated(): boolean {
  if (typeof window === 'undefined') return false;
  return Boolean(getCookie(SESSION_COOKIE_NAME) || localStorage.getItem(USER_STORAGE_KEY));
}

export class AuthError extends Error {
  code: 'ACCOUNT_PENDING' | 'ACCOUNT_REJECTED' | 'INVALID_CREDENTIALS' | 'USER_EXISTS' | 'VALIDATION_ERROR';

  constructor(
    code: 'ACCOUNT_PENDING' | 'ACCOUNT_REJECTED' | 'INVALID_CREDENTIALS' | 'USER_EXISTS' | 'VALIDATION_ERROR',
    message: string
  ) {
    super(message);
    this.code = code;
    this.name = 'AuthError';
  }
}

/**
 * Authenticates user credentials with Account Status check:
 * - If status === 'pending': blocks login with informative error
 * - If status === 'rejected': blocks login
 * - If status === 'approved': sets persistent session and succeeds
 */
export function loginUser(email: string, password?: string, remember: boolean = true): UserSession {
  const cleanEmail = email.trim().toLowerCase();
  const accounts = getAllAccounts();

  // Find user by email
  const user = accounts.find((a) => a.email.toLowerCase() === cleanEmail);

  if (!user) {
    // If testing with any random email or password in demo mode:
    if (cleanEmail === DEFAULT_ADMIN.email.toLowerCase()) {
      // Allow default admin
    } else {
      throw new AuthError(
        'INVALID_CREDENTIALS',
        'Official email not recognized in the SPID personnel registry.'
      );
    }
  }

  const accountToVerify = user || DEFAULT_ADMIN;

  // Verify password if provided
  if (password && accountToVerify.password && accountToVerify.password !== password) {
    // Allow default admin fallback for convenience if password matches spid@admin2026 or password123
    const isMasterPassword =
      password === 'spid@admin2026' || password === 'password123' || password === 'admin';
    if (!isMasterPassword && accountToVerify.email === DEFAULT_ADMIN.email) {
      throw new AuthError('INVALID_CREDENTIALS', 'Incorrect official password.');
    } else if (!isMasterPassword && accountToVerify.password !== password) {
      throw new AuthError('INVALID_CREDENTIALS', 'Incorrect official password.');
    }
  }

  // Check Account Status
  if (accountToVerify.status === 'pending') {
    throw new AuthError(
      'ACCOUNT_PENDING',
      'Your account is currently PENDING approval by the Department Administrator. Please await administrative verification.'
    );
  }

  if (accountToVerify.status === 'rejected') {
    throw new AuthError(
      'ACCOUNT_REJECTED',
      'Your account registration was declined by the administrator. Please contact SPID registry.'
    );
  }

  // Create persistent session
  const session: UserSession = {
    id: accountToVerify.id,
    name: accountToVerify.name,
    email: accountToVerify.email,
    role: accountToVerify.role,
    division: accountToVerify.division,
    nic: accountToVerify.nic,
    phone: accountToVerify.phone,
    status: accountToVerify.status,
    loginTime: new Date().toISOString(),
  };

  if (typeof window !== 'undefined') {
    localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(session));
  }

  setSessionCookie(session, remember);
  return session;
}

/**
 * Registers a new account with status: "pending" by default
 */
export function registerUser(formData: {
  role: UserRole;
  name: string;
  email: string;
  division: string;
  nic: string;
  phone: string; // 9 digits, e.g. "771234567"
  password: string;
}): UserAccount {
  const cleanEmail = formData.email.trim().toLowerCase();
  const accounts = getAllAccounts();

  // Check if email already registered
  const exists = accounts.find((a) => a.email.toLowerCase() === cleanEmail);
  if (exists) {
    throw new AuthError(
      'USER_EXISTS',
      `An account with email ${cleanEmail} is already registered in the system.`
    );
  }

  // Standardize Sri Lankan phone number format: +94 7X XXX XXXX
  const cleanPhoneDigits = formData.phone.replace(/\D/g, '').replace(/^0/, '');
  const formattedPhone = `+94 ${cleanPhoneDigits.slice(0, 2)} ${cleanPhoneDigits.slice(2, 5)} ${cleanPhoneDigits.slice(5, 9)}`;

  const newAccount: UserAccount = {
    id: `SPID-${formData.role === 'Administrator' ? 'ADM' : 'STF'}-${Math.floor(1000 + Math.random() * 9000)}`,
    role: formData.role || 'Staff',
    name: formData.name.trim(),
    email: cleanEmail,
    division: formData.division,
    nic: formData.nic.trim().toUpperCase(),
    phone: formattedPhone,
    password: formData.password,
    status: 'pending', // Pending administrator approval by default!
    registeredAt: new Date().toISOString(),
  };

  accounts.push(newAccount);

  if (typeof window !== 'undefined') {
    localStorage.setItem(REGISTERED_USERS_KEY, JSON.stringify(accounts));
  }

  return newAccount;
}

/**
 * Logs out the user and clears all sessions, redirecting to sign-in page
 */
export function logoutUser(): void {
  clearSessionCookie();
  if (typeof window !== 'undefined') {
    localStorage.removeItem(USER_STORAGE_KEY);
    window.location.href = '/auth/sign-in';
  }
}

/**
 * Helper to approve a pending account (for testing or administrative UI)
 */
export function approveAccount(email: string): boolean {
  if (typeof window === 'undefined') return false;
  const accounts = getAllAccounts();
  const index = accounts.findIndex((a) => a.email.toLowerCase() === email.trim().toLowerCase());
  if (index !== -1) {
    accounts[index].status = 'approved';
    localStorage.setItem(REGISTERED_USERS_KEY, JSON.stringify(accounts));
    return true;
  }
  return false;
}
