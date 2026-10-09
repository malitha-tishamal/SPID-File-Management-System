'use client';

export interface UserSession {
  id: string;
  name: string;
  email: string;
  role: string;
  division: string;
  nic?: string;
  phone?: string;
  loginTime: string;
}

export const SESSION_COOKIE_NAME = 'spid_session';
export const USER_STORAGE_KEY = 'spid_user';
export const REGISTERED_USERS_KEY = 'spid_registered_users';

export const DEFAULT_USER: UserSession = {
  id: 'SPID-OFFICER-001',
  name: 'Eng. K. L. Perera',
  email: 'officer@spid.gov.lk',
  role: 'Senior Records Officer',
  division: 'Record Room & Central Registry',
  nic: '198524103421',
  phone: '077 123 4567',
  loginTime: new Date().toISOString(),
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
 * Sets a persistent session cookie that stays active until explicit logout
 */
export function setSessionCookie(data: UserSession, remember: boolean = true): void {
  if (typeof document === 'undefined') return;
  // 1 year (31,536,000 seconds) if remember is true or permanent until explicit logout
  const maxAge = remember ? 31536000 : 86400 * 30; // 30 days minimum even without remember
  const serialized = encodeURIComponent(JSON.stringify(data));
  document.cookie = `${SESSION_COOKIE_NAME}=${serialized}; path=/; max-age=${maxAge}; SameSite=Lax`;
}

/**
 * Removes the session cookie
 */
export function clearSessionCookie(): void {
  if (typeof document === 'undefined') return;
  document.cookie = `${SESSION_COOKIE_NAME}=; path=/; max-age=0; expires=Thu, 01 Jan 1970 00:00:00 GMT; SameSite=Lax`;
}

/**
 * Returns current authenticated user, or null if not logged in
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

/**
 * Logs in a user, setting permanent session and local storage
 */
export function loginUser(email: string, password?: string, remember: boolean = true): UserSession {
  // Check if this email matches a previously registered user
  let user: UserSession = {
    ...DEFAULT_USER,
    email: email.trim().toLowerCase(),
    loginTime: new Date().toISOString(),
  };

  if (typeof window !== 'undefined') {
    try {
      const rawRegistered = localStorage.getItem(REGISTERED_USERS_KEY);
      if (rawRegistered) {
        const registeredList: any[] = JSON.parse(rawRegistered);
        const found = registeredList.find(
          (u) => u.email.toLowerCase() === email.trim().toLowerCase()
        );
        if (found) {
          user = {
            id: found.id || `SPID-${Date.now().toString().slice(-4)}`,
            name: found.name || 'Official Staff Officer',
            email: found.email,
            role: 'Official Staff Member',
            division: found.division || 'Southern Provincial Irrigation Department',
            nic: found.nic,
            phone: found.phone,
            loginTime: new Date().toISOString(),
          };
        }
      }
    } catch (e) {
      console.error(e);
    }

    localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(user));
  }

  setSessionCookie(user, remember);
  return user;
}

/**
 * Registers a new staff member and saves them in local storage
 */
export function registerUser(formData: {
  name: string;
  email: string;
  division: string;
  nic: string;
  phone: string;
  password?: string;
}): UserSession {
  const newUser: UserSession = {
    id: `SPID-STAFF-${Math.floor(1000 + Math.random() * 9000)}`,
    name: formData.name,
    email: formData.email.trim().toLowerCase(),
    role: 'Staff Member',
    division: formData.division,
    nic: formData.nic,
    phone: formData.phone,
    loginTime: new Date().toISOString(),
  };

  if (typeof window !== 'undefined') {
    try {
      const existing = localStorage.getItem(REGISTERED_USERS_KEY);
      const list = existing ? JSON.parse(existing) : [];
      list.push({ ...formData, ...newUser });
      localStorage.setItem(REGISTERED_USERS_KEY, JSON.stringify(list));
    } catch (e) {
      console.error('Failed to save registered user:', e);
    }
  }

  return newUser;
}

/**
 * Logs out the user and clears all sessions, then redirects to sign-in page
 */
export function logoutUser(): void {
  clearSessionCookie();
  if (typeof window !== 'undefined') {
    localStorage.removeItem(USER_STORAGE_KEY);
    window.location.href = '/auth/sign-in';
  }
}
