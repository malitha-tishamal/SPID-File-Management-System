/**
 * Creates the first trusted Administrator account.
 *
 * Public registration can NEVER grant Administrator privileges — admins are
 * provisioned server-side only, through this script (or the same
 * supabase.auth.admin.createUser flow).
 *
 * Usage:
 *   1. Fill SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY in .env.local
 *   2. node scripts/create-admin.mjs "Full Name" admin@spid.gov.lk "StrongPass!23"
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync, existsSync } from 'fs';

function loadEnvLocal() {
  if (!existsSync('.env.local')) return;
  for (const line of readFileSync('.env.local', 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2];
  }
}

loadEnvLocal();

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceKey) {
  console.error(
    'Missing configuration. Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local first.'
  );
  process.exit(1);
}

const [, , fullName, email, password] = process.argv;
if (!fullName || !email || !password || password.length < 8) {
  console.error(
    'Usage: node scripts/create-admin.mjs "Full Name" "admin@spid.gov.lk" "PasswordMin8Chars"'
  );
  process.exit(1);
}

const admin = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const { data, error } = await admin.auth.admin.createUser({
  email,
  password,
  email_confirm: true,
  user_metadata: { full_name: fullName, requested_role: 'Administrator' },
});

if (error) {
  console.error('Failed to create auth user:', error.message);
  process.exit(1);
}

// Promote to approved Administrator (bypasses RLS via service role).
await admin.from('profiles').update({ account_status: 'approved', role: 'Administrator' }).eq('id', data.user.id);

console.log(`Administrator created: ${email} (${data.user.id})`);
