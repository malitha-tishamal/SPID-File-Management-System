/**
 * Session token helpers shared by the reset-password page and API.
 * Reads the JWT payload only — signature verification stays with Supabase.
 */

/** Decodes the JWT payload (no signature verification — Supabase verifies it). */
export function parseJwtPayload(token: string): Record<string, any> | null {
  try {
    const base64 = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), '=');
    return JSON.parse(atob(padded));
  } catch {
    return null;
  }
}

/**
 * Recovery links issue a session whose authentication methods ("amr")
 * include OTP. Regular password sign-ins use "password", so this keeps the
 * reset screen (which never asks for the current password) limited to
 * sessions that actually came from a reset link.
 */
export function isRecoverySession(accessToken?: string | null): boolean {
  if (!accessToken) return false;
  const payload = parseJwtPayload(accessToken);
  const amr = payload?.amr;
  return (
    Array.isArray(amr) &&
    amr.some(
      (entry: any) =>
        entry?.method === 'otp' ||
        entry?.method === 'recovery' ||
        entry?.method === 'magiclink'
    )
  );
}
