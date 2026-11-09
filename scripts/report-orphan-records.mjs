/**
 * Finds records that have lost the account they were attributed to.
 *
 * Before soft deletion (migration 0027) deleting an account cascaded and took
 * the departmental history with it. This report lists what is still on record
 * but points at a user row that no longer exists, so the damage left behind is
 * known, plus every soft-deleted account and what it still owns.
 *
 * Read-only: it never writes, updates or deletes anything.
 *
 * Usage:
 *   1. Fill NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY in .env.local
 *   2. node scripts/report-orphan-records.mjs            # summary + list
 *      node scripts/report-orphan-records.mjs --json      # machine-readable
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

const asJson = process.argv.includes('--json');
const admin = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const PAGE = 1000;

/** Every row of a table, paged so large registries do not hit the 1000-row cap. */
async function fetchAll(table, columns, order = 'id') {
  const rows = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await admin
      .from(table)
      .select(columns)
      .order(order, { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) {
      // A missing column or table is itself a finding: report and move on.
      return { rows, skipped: `${table}: ${error.message}` };
    }
    rows.push(...(data ?? []));
    if ((data ?? []).length < PAGE) break;
  }
  return { rows, skipped: null };
}

/**
 * Attribution columns worth checking. `name` is the snapshot column that still
 * carries the person's name when the account is gone — it is what the UI shows.
 */
const CHECKS = [
  { table: 'files', column: 'registered_by', label: 'files.registered_by', name: 'registrar_name', describe: 'file_no' },
  { table: 'files', column: 'created_by', label: 'files.created_by', name: 'registrar_name', describe: 'file_no' },
  { table: 'files', column: 'approved_by', label: 'files.approved_by', name: 'approved_by_name', describe: 'file_no' },
  { table: 'staff_file_requests', column: 'requester_id', label: 'requests.requester_id', name: 'requester_name', describe: 'file_no' },
  { table: 'staff_file_requests', column: 'reviewed_by', label: 'requests.reviewed_by', name: null, describe: 'file_no' },
  { table: 'staff_file_requests', column: 'returned_by', label: 'requests.returned_by', name: null, describe: 'file_no' },
  { table: 'file_request_extensions', column: 'requested_by', label: 'extensions.requested_by', name: 'requested_by_name', describe: 'file_no' },
  { table: 'file_request_extensions', column: 'reviewed_by', label: 'extensions.reviewed_by', name: 'reviewed_by_name', describe: 'file_no' },
  { table: 'notifications', column: 'user_id', label: 'notifications.user_id', name: null, describe: 'title' },
  { table: 'audit_logs', column: 'actor_id', label: 'audit_logs.actor_id', name: null, describe: 'action' },
  { table: 'audit_logs', column: 'target_user_id', label: 'audit_logs.target_user_id', name: null, describe: 'action' },
  { table: 'login_attempts', column: 'user_id', label: 'login_attempts.user_id', name: null, describe: 'email_attempted' },
  { table: 'profiles', column: 'approved_by', label: 'profiles.approved_by', name: null, describe: 'full_name' },
];

async function main() {
  const { rows: profileRows } = await fetchAll('profiles', 'id, full_name, email, is_deleted, deleted_at');
  const knownProfiles = new Set(profileRows.map((row) => row.id));
  const deletedProfiles = profileRows.filter((row) => row.is_deleted === true);

  const findings = [];
  const cache = new Map();

  for (const check of CHECKS) {
    const key = `${check.table}:${check.column}`;
    if (!cache.has(key)) {
      const columns = [
        'id',
        check.column,
        ...(check.describe ? [check.describe] : []),
        ...(check.name ? [check.name] : []),
      ].join(', ');
      cache.set(key, await fetchAll(check.table, columns));
    }
    const { rows, skipped } = cache.get(key);
    if (skipped) {
      findings.push({ table: check.table, column: check.column, orphans: [], note: skipped });
      continue;
    }

    const orphans = rows
      .filter((row) => row[check.column] && !knownProfiles.has(row[check.column]))
      .map((row) => ({
        id: row.id,
        missingUserId: row[check.column],
        // The snapshot name is the only trace left of the person who did it.
        name: check.name ? row[check.name] ?? null : null,
        detail: row[check.describe] ?? null,
      }));

    findings.push({ table: check.table, column: check.column, orphans });
  }

  // Profiles can only be missing when auth.users was purged directly.
  const { rows: authRows, skipped: authSkipped } = await (async () => {
    try {
      const { data, error } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
      if (error) return { rows: [], skipped: error.message };
      return { rows: data.users ?? [], skipped: null };
    } catch (err) {
      return { rows: [], skipped: err?.message ?? 'listUsers failed' };
    }
  })();

  const authIds = new Set(authRows.map((user) => user.id));
  const orphanProfiles = profileRows.filter((row) => !authSkipped && !authIds.has(row.id));

  const totalOrphans = findings.reduce((sum, item) => sum + item.orphans.length, 0);

  if (asJson) {
    console.log(
      JSON.stringify(
        {
          generatedAt: new Date().toISOString(),
          softDeletedAccounts: deletedProfiles,
          orphanedRecords: findings,
          profilesWithoutAuthUser: orphanProfiles,
          totalOrphanedReferences: totalOrphans,
        },
        null,
        2
      )
    );
    return;
  }

  console.log('\nRecords whose account is missing (damage left by cascade deletes)\n');
  for (const item of findings) {
    const label = `${item.table}.${item.column}`;
    if (item.note) {
      console.log(`  ${label.padEnd(34)} not checked — ${item.note}`);
      continue;
    }
    console.log(`  ${label.padEnd(34)} ${item.orphans.length}`);
    for (const orphan of item.orphans.slice(0, 25)) {
      console.log(
        `      row ${orphan.id} -> missing user ${orphan.missingUserId}` +
          `${orphan.name ? ` (stored name: ${orphan.name})` : ''}` +
          `${orphan.detail ? ` — ${orphan.detail}` : ''}`
      );
    }
    if (item.orphans.length > 25) {
      console.log(`      … ${item.orphans.length - 25} more (run with --json for the full list)`);
    }
  }

  console.log(`\nSoft-deleted accounts (records intentionally kept): ${deletedProfiles.length}`);
  for (const account of deletedProfiles.slice(0, 50)) {
    console.log(`  ${account.full_name} <${account.email}> deleted ${account.deleted_at ?? 'unknown'}`);
  }
  if (deletedProfiles.length > 50) {
    console.log(`  … ${deletedProfiles.length - 50} more`);
  }

  if (authSkipped) {
    console.log(`\nauth.users not checked — ${authSkipped}`);
  } else {
    console.log(`\nProfile rows with no auth user (identity purged directly): ${orphanProfiles.length}`);
    for (const row of orphanProfiles.slice(0, 25)) {
      console.log(`  ${row.id} ${row.full_name} <${row.email}>`);
    }
  }

  console.log(
    totalOrphans === 0
      ? '\nNo orphaned references found: every recorded author still has an account row.\n'
      : `\n${totalOrphans} record reference(s) point at an account that no longer exists. Those rows cannot be relinked automatically — restore them from a database backup (see the report notes), or leave the stored name as the only record of who did it.\n`
  );
}

main().catch((err) => {
  console.error('Report failed:', err?.message ?? err);
  process.exit(1);
});
