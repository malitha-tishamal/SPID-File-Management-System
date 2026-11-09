import { ApiError, jsonOk, requireServerEnv } from 'lib/apiResponse';
import {
  enforceAuthCookieLifetime,
  readSessionMeta,
  writeSessionMeta,
} from 'lib/sessionCookie';
import { SESSION_TOUCH_THROTTLE_MS } from 'lib/sessionPolicy';
import { getRequestMeta } from 'lib/requestMeta';
import { AuthService } from 'services/AuthService';
import { AuthorizationService } from 'services/AuthorizationService';
import { isValidEmailFormat, validatePasswordPair, validateStrongPasswordPair } from 'validators/authValidators';
import type { UserRole } from 'types/auth';

/**
 * Controller layer: HTTP request handling for authentication flows.
 * Validates input at the boundary, delegates to services, formats responses.
 */
export class AuthController {
  /** POST /api/auth/register */
  static async register(req: Request) {
    requireServerEnv();
    const body = await req.json().catch(() => null);
    if (!body) throw new ApiError(400, 'VALIDATION_ERROR', 'Invalid request body.');

    const { role, fullName, email, section, phoneDigits, password, confirmPassword } = body;

    // Server-side re-validation of every field (client checks are never trusted).
    if (role !== 'Staff' && role !== 'Administrator') {
      throw new ApiError(400, 'VALIDATION_ERROR', 'Invalid role selection.');
    }
    const passwordError = validatePasswordPair(password, confirmPassword);
    if (passwordError) {
      throw new ApiError(400, 'VALIDATION_ERROR', passwordError);
    }
    if (typeof phoneDigits !== 'string' || !/^\d{9}$/.test(phoneDigits)) {
      throw new ApiError(400, 'VALIDATION_ERROR', 'A valid 9-digit mobile number is required.');
    }

    const result = await AuthService.register({
      role: role as UserRole,
      fullName: String(fullName ?? ''),
      email: String(email ?? ''),
      section: String(section ?? ''),
      phoneDigits,
      password: String(password),
    });

    return jsonOk({
      submitted: true,
      accountStatus: 'pending',
      emailConfirmationRequired: result.emailConfirmationRequired,
      message:
        'Registration submitted successfully. Your account is pending administrator approval.',
    });
  }

  /** POST /api/auth/login */
  static async login(req: Request) {
    requireServerEnv();
    const body = await req.json().catch(() => null);
    if (!body) throw new ApiError(400, 'VALIDATION_ERROR', 'Invalid request body.');

    const email = String(body.email ?? '').trim();
    const password = String(body.password ?? '');
    if (!email || !password) {
      throw new ApiError(400, 'VALIDATION_ERROR', 'Email and password are required.');
    }
    const remember = body.remember === true;

    const profile = await AuthService.login(email, password, getRequestMeta(req));
    const res = jsonOk({ profile, message: 'Login successful.' });
    // The inactivity deadline always starts at the moment of login.
    writeSessionMeta(res, {
      id: profile.id,
      role: profile.role,
      status: profile.account_status,
      t: Date.now(),
      remember,
    });
    await enforceAuthCookieLifetime(res, remember);
    return res;
  }

  /** POST /api/auth/logout */
  static async logout() {
    await AuthService.logout();
    const res = jsonOk({ message: 'Logged out.' });
    res.cookies.set('spid_session_auth', '', {
      path: '/',
      httpOnly: true,
      maxAge: 0,
    });
    return res;
  }

  /**
   * GET  /api/auth/me — profile read (does NOT reset the inactivity deadline).
   * POST /api/auth/me — heartbeat; rolls the deadline only when the client
   * reports genuine user activity (`{ active: true }`), so token refreshes
   * and background polling can never keep an idle session alive.
   */
  static async me(req?: Request) {
    const profile = await AuthorizationService.getSessionProfile();
    if (!profile) {
      throw new ApiError(401, 'UNAUTHORIZED', 'Not signed in.');
    }

    let active = false;
    if (req) {
      const body = await req.json().catch(() => null);
      active = body?.active === true;
    }

    const existing = await readSessionMeta();
    const remember = existing?.remember === true;
    // Slide the deadline only on a genuine interaction, and at most once a
    // minute so a chatty tab cannot rewrite the cookie on every request.
    const now = Date.now();
    const shouldSlide =
      active && (!existing || now - existing.t >= SESSION_TOUCH_THROTTLE_MS);
    const lastActivity = shouldSlide ? now : (existing?.t ?? now);

    const res = jsonOk({ profile });
    writeSessionMeta(res, {
      id: profile.id,
      role: profile.role,
      status: profile.account_status,
      t: lastActivity,
      remember,
    });
    await enforceAuthCookieLifetime(res, remember);
    return res;
  }

  /** POST /api/auth/forgot-password */
  static async forgotPassword(req: Request) {
    requireServerEnv();
    const body = await req.json().catch(() => null);
    const email = String(body?.email ?? '').trim();
    if (!email || !isValidEmailFormat(email)) {
      throw new ApiError(400, 'VALIDATION_ERROR', 'Please provide a valid email address.');
    }

    await AuthService.requestPasswordReset(email);

    // Generic message — never reveal whether the account exists.
    return jsonOk({
      message:
        'If an account exists for this email address, password reset instructions will be sent.',
    });
  }

  /** POST /api/auth/reset-password — consumes the recovery session. */
  static async resetPassword(req: Request) {
    requireServerEnv();
    const body = await req.json().catch(() => null);
    if (!body) throw new ApiError(400, 'VALIDATION_ERROR', 'Invalid request body.');

    const passwordError = validateStrongPasswordPair(String(body.password ?? ''), String(body.confirmPassword ?? ''));
    if (passwordError) {
      throw new ApiError(400, 'VALIDATION_ERROR', passwordError);
    }

    await AuthService.resetPassword({
      newPassword: String(body.password),
      accessToken: typeof body.accessToken === 'string' ? body.accessToken : undefined,
    });
    return jsonOk({ message: 'Password updated successfully. You can now sign in.' });
  }
}
