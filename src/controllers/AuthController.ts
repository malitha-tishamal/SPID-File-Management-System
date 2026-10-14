import { ApiError, jsonOk, requireServerEnv } from 'lib/apiResponse';
import { AuthService } from 'services/AuthService';
import { AuthorizationService } from 'services/AuthorizationService';
import { isValidEmailFormat, validatePasswordPair } from 'validators/authValidators';

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
      role: 'Staff', // Public registration is forced to Staff at the service layer too
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

    const profile = await AuthService.login(email, password);
    return jsonOk({ profile, message: 'Login successful.' });
  }

  /** POST /api/auth/logout */
  static async logout() {
    await AuthService.logout();
    return jsonOk({ message: 'Logged out.' });
  }

  /** GET /api/auth/me */
  static async me() {
    const profile = await AuthorizationService.getSessionProfile();
    if (!profile) {
      throw new ApiError(401, 'UNAUTHORIZED', 'Not signed in.');
    }
    return jsonOk({ profile });
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

    const passwordError = validatePasswordPair(String(body.password ?? ''), String(body.confirmPassword ?? ''));
    if (passwordError) {
      throw new ApiError(400, 'VALIDATION_ERROR', passwordError);
    }

    await AuthService.resetPassword(String(body.password));
    return jsonOk({ message: 'Password updated successfully. You can now sign in.' });
  }
}
