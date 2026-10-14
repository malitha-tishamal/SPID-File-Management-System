/**
 * Centralized environment configuration + startup validation.
 * Reports missing variables clearly without printing secret values.
 */

export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
export const SUPABASE_ANON_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
  '';
export const SUPABASE_SERVICE_ROLE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY || '';
export const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';

export interface EnvValidationResult {
  valid: boolean;
  missing: string[];
}

/**
 * Validates the public (browser-safe) configuration. Safe to call anywhere.
 */
export function validatePublicEnv(): EnvValidationResult {
  const missing: string[] = [];
  if (!SUPABASE_URL) missing.push('NEXT_PUBLIC_SUPABASE_URL');
  if (!SUPABASE_ANON_KEY) missing.push('NEXT_PUBLIC_SUPABASE_ANON_KEY');
  return { valid: missing.length === 0, missing };
}

/**
 * Validates the server-side configuration including the privileged key.
 * Returns variable NAMES only — never secret values.
 */
export function validateServerEnv(): EnvValidationResult {
  const base = validatePublicEnv();
  const missing = [...base.missing];
  if (!SUPABASE_SERVICE_ROLE_KEY) missing.push('SUPABASE_SERVICE_ROLE_KEY');
  return { valid: missing.length === 0, missing };
}

export function missingEnvMessage(missing: string[]): string {
  return (
    `Server configuration error: missing environment variable(s): ${missing.join(', ')}. ` +
    'Copy .env.example to .env.local and fill in the values from your Supabase project ' +
    '(Dashboard -> Project Settings -> API), then restart the dev server.'
  );
}
