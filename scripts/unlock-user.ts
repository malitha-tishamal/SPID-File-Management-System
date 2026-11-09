/**
 * Emergency unlock for a locked account — including the last administrator.
 *
 * The normal path is the "Locked accounts" tab in Admin Management, but it
 * requires another administrator to be signed in. When the only administrator
 * is locked out (or every admin is), this script is the documented recovery
 * path. It performs exactly the same database work as "Approve & Unlock":
 * counters and lock fields are cleared, sessions are revoked and the action is
 * written to the audit trail as `lockout_cleared` with `by: recovery-script`.
 *
 * Requires SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY (loaded from .env.local).
 * The service-role key is used only here, on the operator's machine — never in
 * application or client code.
 *
 * Usage:
 *   node scripts/unlock-user.ts --list
 *   node scripts/unlock-user.ts --email officer@spid.gov.lk
 *   node scripts/unlock-user.ts --id 00000000-0000-0000-0000-000000000000
 */
import { createClient } from '@supabase/supabase-js';
import { existsSync, readFileSync } from 'node:fs';

function loadEnvLocal() {
  if (!existsSync('.env.local')) return;
  for (const line of readFileSync('.env.local', 'utf8').split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (match && process.env[match[1]] === undefined) process.env[match[1]] = match[2];
  }
}

loadEnvLocal();

const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceKey) {
  console.error(
    'Missing configuration: set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local.'
  );
  process.exit(1);
}

const admin = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const args = process.argv.slice(2);
const getArg = (name: string) => {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : null;
};

if (args.includes('--help') || args.includes('-h') || args.length === 0) {
  console.log(`Usage:
  node scripts/unlock-user.ts --list
  node scripts/unlock-user.ts --email <address>
  node scripts/unlock-user.ts --id <uuid>`);
  process.exit(0);
}

function isMissingFunction(error: { code?: string; message?: string } | null): boolean {
  return (
    !!error &&
    (error.code === 'PGRST202' ||
      error.code === '42883' ||
      /does not exist|not found in the schema cache/i.test(error.message ?? ''))
  );
}

function isActiveLock(row: {
  is_permanently_locked?: boolean | null;
  locked_until?: string | null;
}): boolean {
  return (
    row.is_permanently_locked === true ||
    (!!row.locked_until && new Date(row.locked_until).getTime() > Date.now())
  );
}

type LockedRow = {
  id: string;
  full_name: string | null;
  email: string;
  role: string;
  account_status: string;
  login_security:
    | {
        failed_attempts: number | null;
        lockout_level: number | null;
        locked_until: string | null;
        is_permanently_locked: boolean | null;
        locked_at: string | null;
        last_failed_login_ip: string | null;
      }
    | null;
};

async function listLocked() {
  // The nested select needs migration 0026; fall back to the legacy columns.
  let { data, error } = await admin
    .from('profiles')
    .select(
      'id, full_name, email, role, account_status, login_security(failed_attempts, lockout_level, locked_until, is_permanently_locked, locked_at, last_failed_login_ip)'
    )
    .order('email');

  if (error) {
    const legacy = await admin
      .from('profiles')
      .select('id, full_name, email, role, account_status, login_security(failed_attempts, locked_until)')
      .order('email');
    data = legacy.data as typeof data;
    error = legacy.error;
  }

  if (error) throw new Error(error.message);

  const locked = ((data ?? []) as unknown as LockedRow[]).filter((row) =>
    isActiveLock(row.login_security ?? {})
  );

  if (locked.length === 0) {
    console.log('No active lockouts.');
    return;
  }

  console.table(
    locked.map((row) => ({
      email: row.email,
      name: row.full_name ?? '',
      role: row.role,
      status: row.account_status,
      permanent: row.login_security?.is_permanently_locked ? 'yes' : 'no',
      lockedUntil: row.login_security?.locked_until ?? '—',
      attempts: row.login_security?.failed_attempts ?? 0,
      lastIp: row.login_security?.last_failed_login_ip ?? '—',
    }))
  );
}

async function findProfile() {
  const id = getArg('--id');
  const email = getArg('--email');

  let query = admin
    .from('profiles')
    .select('id, full_name, email, role, account_status, login_security(*)');
  if (id) query = query.eq('id', id);
  else query = query.ilike('email', email as string);

  const { data, error } = await query.maybeSingle();
  if (error) {
    // Pre-0026 databases cannot select the new columns; retry with the basics.
    let fallback = admin.from('profiles').select('id, full_name, email, role, account_status');
    fallback = id ? fallback.eq('id', id) : fallback.ilike('email', email as string);
    const retry = await fallback.maybeSingle();
    if (retry.error) throw new Error(retry.error.message);
    return retry.data as unknown as (LockedRow & { login_security?: null }) | null;
  }
  return data as unknown as LockedRow | null;
}

async function clearLock(userId: string, email: string, before: LockedRow['login_security']) {
  const { error: rpcError } = await admin.rpc('admin_clear_lockout', { p_user_id: userId });
  if (rpcError) {
    if (!isMissingFunction(rpcError)) throw new Error(rpcError.message);

    const { error: updateError } = await admin
      .from('login_security')
      .update({ failed_attempts: 0, lockout_level: 0, locked_until: null })
      .eq('user_id', userId);
    if (updateError) throw new Error(updateError.message);
  }

  // Revoke every refresh token so an already-issued session cannot act.
  const { error: signOutError } = await admin.auth.admin.signOut(userId);
  if (signOutError && !/not found/i.test(signOutError.message ?? '')) {
    console.warn('Could not revoke sessions:', signOutError.message);
  }

  const { data: profile } = await admin
    .from('profiles')
    .select('account_status')
    .eq('id', userId)
    .maybeSingle();
  if (profile?.account_status === 'locked') {
    await admin.from('profiles').update({ account_status: 'approved' }).eq('id', userId);
  }

  await admin.from('audit_logs').insert({
    actor_id: null,
    target_user_id: userId,
    action: 'lockout_cleared',
    details: {
      email,
      by: 'recovery-script',
      unlocked_at: new Date().toISOString(),
      was_permanent: before?.is_permanently_locked === true,
      failed_attempts: before?.failed_attempts ?? 0,
      locked_at: before?.locked_at ?? null,
      last_failed_login_ip: before?.last_failed_login_ip ?? null,
    },
  });

  const { data: after } = await admin
    .from('login_security')
    .select('failed_attempts, lockout_level, locked_until, is_permanently_locked')
    .eq('user_id', userId)
    .maybeSingle();

  console.log(`Unlocked ${email} (${userId}).`);
  console.log('Current state:', after ?? { note: 'no login_security row (already clear)' });
}

async function main() {
  if (args.includes('--list')) {
    await listLocked();
    return;
  }

  const email = getArg('--email');
  const id = getArg('--id');
  if (!email && !id) {
    console.error('Provide --email <address>, --id <uuid> or --list.');
    process.exit(1);
  }

  const profile = await findProfile();
  if (!profile) {
    console.error(`No profile found for ${id ?? email}.`);
    process.exit(1);
  }

  const before = profile.login_security;
  if (before && !isActiveLock(before)) {
    console.log(
      `${profile.email} has no active lockout (attempts: ${before.failed_attempts ?? 0}). Clearing the counters anyway.`
    );
  }
  await clearLock(profile.id, profile.email, before);
}

main().catch((error) => {
  console.error('Unlock failed:', error instanceof Error ? error.message : error);
  process.exit(1);
});
