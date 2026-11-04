#!/usr/bin/env node
/**
 * Development-only seeder for the issued-file return workflow.
 *
 * It creates a small, clearly labelled set of synthetic checkouts owned by one
 * staff account so that overdue / due-today / upcoming statuses, the four
 * Issued Files summary cards, the return-date extension flow and the due-date
 * notifications can be exercised against the real database.
 *
 *   node scripts/seed-return-test-data.js            # read-only report
 *   node scripts/seed-return-test-data.js --apply    # create / refresh rows
 *   node scripts/seed-return-test-data.js --remove   # delete only these rows
 *
 * Safety rules enforced here:
 *   - Nothing is written unless --apply or --remove is given.
 *   - The staff account must already exist; the script never creates or edits
 *     an account, a password or a role.
 *   - Every row it writes carries the TEST_FILE_NO_PREFIX marker, and --remove
 *     deletes only rows carrying that marker.
 *   - Re-running --apply updates the same rows instead of duplicating them.
 *   - Dates are relative to today in Asia/Colombo, recalculated on each run.
 */

const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

const TARGET_EMAIL = 'ureshanchilly28@gmail.com';
const TEST_FILE_NO_PREFIX = 'TEST-RETURN-';
const TEST_NAME_PREFIX = '[TEST] ';
const MARKER_NOTE =
  'Synthetic test record created by scripts/seed-return-test-data.js — safe to delete.';

const envPath = path.resolve(__dirname, '../.env.local');
if (!fs.existsSync(envPath)) {
  console.error('Missing .env.local — this seeder only runs against a local dev environment.');
  process.exit(1);
}

const env = {};
fs.readFileSync(envPath, 'utf8')
  .split(/\r?\n/)
  .forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) return;
    const idx = trimmed.indexOf('=');
    if (idx !== -1) env[trimmed.substring(0, idx).trim()] = trimmed.substring(idx + 1).trim();
  });

if (!env.NEXT_PUBLIC_SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
  console.error('.env.local must define NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.');
  process.exit(1);
}

const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const mode = process.argv.includes('--apply')
  ? 'apply'
  : process.argv.includes('--remove')
    ? 'remove'
    : 'check';

/** "YYYY-MM-DD" for today in Sri Lanka, plus day offsets from it. */
function sriLankaToday() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Colombo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

function shiftDays(isoDate, days) {
  const base = Date.parse(`${isoDate.slice(0, 10)}T00:00:00Z`);
  return new Date(base + days * 86400000).toISOString().slice(0, 10);
}

function timestampAt(date, timeIso) {
  return `${date.slice(0, 10)}T${(timeIso || '09:00:00')}Z`;
}

const TODAY = sriLankaToday();

/**
 * One row per state the pages and cards can display. `extension` adds an
 * approved history entry, which is what makes a file count as EXTENDED.
 */
function scenarios() {
  return [
    {
      key: 'overdue',
      title: 'overdue checkout',
      fileName: 'Annual Audit Minutes 2025 — overdue case',
      requestDate: shiftDays(TODAY, -20),
      durationDays: 10,
      expectedOffset: -10,
    },
    {
      key: 'due-today',
      title: 'due today checkout',
      fileName: 'Cabinet Sub-Committee Papers — due today case',
      requestDate: shiftDays(TODAY, -7),
      durationDays: 7,
      expectedOffset: 0,
    },
    {
      key: 'upcoming',
      title: 'upcoming checkout',
      fileName: 'Tender Evaluation Records — due soon case',
      requestDate: shiftDays(TODAY, -1),
      durationDays: 3,
      expectedOffset: 2,
    },
    {
      key: 'extension-eligible',
      title: 'extension candidate',
      fileName: 'Establishment Register Volume 3 — extension candidate',
      requestDate: shiftDays(TODAY, -3),
      durationDays: 4,
      expectedOffset: 1,
    },
    {
      key: 'extended',
      title: 'admin-extended checkout',
      fileName: 'Legal Division Correspondence — extended case',
      requestDate: shiftDays(TODAY, -30),
      durationDays: 28,
      expectedOffset: -2,
      extendedToOffset: 12,
      extensionReason: 'Volume needed for a parliamentary question (synthetic test reason).',
    },
    {
      key: 'returned',
      title: 'returned checkout',
      fileName: 'Gift Registry 2024 — returned case',
      requestDate: shiftDays(TODAY, -15),
      durationDays: 14,
      expectedOffset: -1,
      returned: true,
    },
    {
      // Scenario A: a genuine PENDING request, waiting in the Admin Pending tab
      // so approve/reject can be exercised through the real UI.
      key: 'pending',
      title: 'pending request',
      fileName: 'Water Usage Assessment Report — pending request case',
      requestDate: TODAY,
      durationDays: 5,
      expectedOffset: 5,
      pending: true,
    },
  ];
}

function fileNoFor(index) {
  return `${TEST_FILE_NO_PREFIX}${String(index + 1).padStart(2, '0')}`;
}

async function findStaffProfile() {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, full_name, email, role, account_status, section_id, sections ( name )')
    .eq('email', TARGET_EMAIL)
    .maybeSingle();

  if (error) throw new Error(`profiles lookup failed: ${error.message}`);
  if (!data) return null;

  // profiles has no section_name column; the section comes from the join.
  const sectionRaw = data.sections;
  const sectionName = Array.isArray(sectionRaw)
    ? sectionRaw[0]?.name ?? null
    : sectionRaw?.name ?? null;

  return { ...data, section_name: sectionName };
}

async function findAdminProfile() {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, full_name, email')
    .eq('role', 'Administrator')
    .eq('account_status', 'approved')
    .limit(1)
    .maybeSingle();

  if (error) throw new Error(`administrator lookup failed: ${error.message}`);
  return data;
}

/** Fail early with the exact remediation when the app schema is behind. */
async function assertSchemaReady() {
  const probeDate = shiftDays(TODAY, -1);
  const { error } = await supabase
    .from('staff_file_requests')
    .select('id, original_return_date, expected_return_date, issued_at, returned_at, returned_by')
    .eq('expected_return_date', probeDate)
    .limit(1);

  if (error) {
    throw new Error(
      `staff_file_requests is missing the issuance columns (${error.message}). ` +
        'Apply supabase/migrations/0017 first.',
    );
  }

  const { error: extensionError } = await supabase
    .from('file_request_extensions')
    .select('id')
    .limit(1);
  if (extensionError) {
    throw new Error(
      `file_request_extensions is unavailable (${extensionError.message}). ` +
        'Apply supabase/migrations/0017 first.',
    );
  }

  const { error: notificationError } = await supabase
    .from('notifications')
    .select('id')
    .limit(1);
  if (notificationError) {
    throw new Error(
      `notifications is unavailable (${notificationError.message}). ` +
        'Apply supabase/migrations/0017 first.',
    );
  }
}

async function upsertFileRecord(scenario, index, staff) {
  const fileNo = fileNoFor(index);
  const fileName = `${TEST_NAME_PREFIX}${scenario.fileName}`;

  const { data: existing } = await supabase
    .from('files')
    .select('id, file_no, file_name')
    .eq('file_no', fileNo)
    .maybeSingle();

  const payload = {
    file_no: fileNo,
    file_name: fileName,
    section_name: staff.section_name || 'General Record',
    start_date: scenario.requestDate,
    end_date: shiftDays(scenario.requestDate, scenario.durationDays),
    locker_no: 'TEST-Locker',
    shelf_name: 'TEST-Shelf',
    shelf_position: 'Front',
    archive_repository: 'Central Record Room',
    registrar_name: staff.full_name,
    registrar_role: staff.role,
    registered_by: staff.id,
    created_by: staff.id,
    status: 'APPROVED',
  };

  if (existing) {
    const { data: updated, error } = await supabase
      .from('files')
      .update(payload)
      .eq('id', existing.id)
      .select('id, file_no, file_name')
      .single();
    if (error) throw new Error(`files update failed: ${error.message}`);
    return { row: updated, created: false };
  }

  const { data: created, error } = await supabase
    .from('files')
    .insert([payload])
    .select('id, file_no, file_name')
    .single();
  if (error) throw new Error(`files insert failed: ${error.message}`);
  return { row: created, created: true };
}

async function upsertRequest(scenario, fileRow, staff, admin) {
  // The contractual date. When the scenario is already extended, the approved
  // extension moves the official date forward and the original stays behind.
  const original = shiftDays(TODAY, scenario.expectedOffset);
  const expected =
    scenario.extendedToOffset === undefined
      ? original
      : shiftDays(TODAY, scenario.extendedToOffset);

  const { data: existing } = await supabase
    .from('staff_file_requests')
    .select('id')
    .eq('file_no', fileRow.file_no)
    .eq('requester_id', staff.id)
    .maybeSingle();

  const payload = {
    file_id: fileRow.id,
    file_no: fileRow.file_no,
    file_name: fileRow.file_name,
    section_name: fileRow.section_name || staff.section_name || 'General Record',
    storage_location: 'TEST-Locker / TEST-Shelf / Front',
    requester_id: staff.id,
    requester_name: staff.full_name,
    requester_email: staff.email,
    requester_role: staff.role,
    requester_section: staff.section_name,
    request_date: scenario.requestDate,
    duration_days: scenario.durationDays,
    priority: 'NORMAL',
    status: scenario.pending ? 'PENDING' : 'APPROVED',
    admin_notes: MARKER_NOTE,
    reviewed_by: scenario.pending ? null : admin ? admin.id : staff.id,
    reviewed_at: scenario.pending ? null : timestampAt(scenario.requestDate),
    original_return_date: scenario.pending ? null : original,
    expected_return_date: scenario.pending ? null : expected,
    issued_at: scenario.pending ? null : timestampAt(scenario.requestDate),
    returned_at: scenario.returned ? timestampAt(expected) : null,
    returned_by: scenario.returned ? (admin ? admin.id : staff.id) : null,
  };

  if (existing) {
    const { data: updated, error } = await supabase
      .from('staff_file_requests')
      .update(payload)
      .eq('id', existing.id)
      .select('id, file_no, expected_return_date')
      .single();
    if (error) throw new Error(`staff_file_requests update failed: ${error.message}`);
    return { row: updated, created: false };
  }

  const { data: created, error } = await supabase
    .from('staff_file_requests')
    .insert([payload])
    .select('id, file_no, expected_return_date')
    .single();
  if (error) throw new Error(`staff_file_requests insert failed: ${error.message}`);
  return { row: created, created: true };
}

async function syncExtensionHistory(scenario, requestRow, fileRow, staff, admin) {
  const { error: clearError } = await supabase
    .from('file_request_extensions')
    .delete()
    .eq('request_id', requestRow.id);
  if (clearError) throw new Error(`extension cleanup failed: ${clearError.message}`);

  if (scenario.extendedToOffset === undefined) return null;

  const { data: row, error } = await supabase
    .from('file_request_extensions')
    .insert({
      request_id: requestRow.id,
      file_no: fileRow.file_no,
      file_name: fileRow.file_name,
      previous_return_date: shiftDays(TODAY, scenario.expectedOffset),
      new_return_date: shiftDays(TODAY, scenario.extendedToOffset),
      reason: scenario.extensionReason,
      status: 'APPROVED',
      requested_by: staff.id,
      requested_by_name: staff.full_name,
      reviewed_by: admin ? admin.id : staff.id,
      reviewed_by_name: admin ? admin.full_name : staff.full_name,
      reviewed_at: timestampAt(shiftDays(TODAY, -1)),
      review_note: MARKER_NOTE,
    })
    .select('id, new_return_date')
    .single();
  if (error) throw new Error(`extension history insert failed: ${error.message}`);
  return row;
}

async function reportExisting(staff) {
  const { data: requests } = await supabase
    .from('staff_file_requests')
    .select('id, file_no, status, expected_return_date, returned_at')
    .like('file_no', `${TEST_FILE_NO_PREFIX}%`);

  let notifications = [];
  if (staff) {
    const result = await supabase
      .from('notifications')
      .select('id, title, type, read_at, created_at')
      .eq('user_id', staff.id)
      .order('created_at', { ascending: false })
      .limit(10);
    notifications = result.data ?? [];
  }

  return { requests: requests ?? [], notifications };
}

async function main() {
  console.log(`Mode: ${mode}   Today (Asia/Colombo): ${TODAY}\n`);

  const staff = await findStaffProfile();
  if (!staff) {
    console.error(
      `No profile found for ${TARGET_EMAIL}.\n` +
        'The seeder will not create accounts. Approve the staff registration through the ' +
        'application (or scripts/seed-users.js for the demo directory) and re-run.',
    );
    process.exitCode = 1;
    return;
  }

  console.log(
    `Staff account: ${staff.full_name} <${staff.email}> — role "${staff.role}", ` +
      `status "${staff.account_status}", section "${staff.section_name || '—'}"`,
  );

  await assertSchemaReady();
  console.log('Schema check: 0017 issuance / extension / notification tables are present.');

  const existing = await reportExisting(staff);
  console.log(`Existing test requests: ${existing.requests.length}`);
  existing.requests.forEach((row) => {
    console.log(
      `  #${row.id} ${row.file_no} ${row.status} due ${row.expected_return_date}` +
        `${row.returned_at ? ' (returned)' : ''}`,
    );
  });

  if (mode === 'check') {
    console.log('\nRead-only run. Use --apply to create or refresh the test rows.');
    return;
  }

  if (mode === 'remove') {
    const requestIds = existing.requests.map((row) => row.id);
    if (requestIds.length > 0) {
      const { error } = await supabase
        .from('file_request_extensions')
        .delete()
        .in('request_id', requestIds);
      if (error) throw new Error(`extension removal failed: ${error.message}`);
    }

    const { data: removedRequests, error: requestError } = await supabase
      .from('staff_file_requests')
      .delete()
      .like('file_no', `${TEST_FILE_NO_PREFIX}%`)
      .select('id, file_no');
    if (requestError) throw new Error(`request removal failed: ${requestError.message}`);

    const ids = (removedRequests ?? []).map((row) => row.id);
    for (const id of ids) {
      for (const pattern of [`return-due:${id}:%`, `admin-overdue:${id}:%`]) {
        const { error } = await supabase
          .from('notifications')
          .delete()
          .like('dedupe_key', pattern);
        if (error) console.warn(`notification cleanup skipped (${pattern}): ${error.message}`);
      }
    }

    const { data: removedFiles, error: fileError } = await supabase
      .from('files')
      .delete()
      .like('file_no', `${TEST_FILE_NO_PREFIX}%`)
      .select('id, file_no');
    if (fileError) throw new Error(`file removal failed: ${fileError.message}`);

    console.log(
      `\nRemoved ${(removedRequests ?? []).length} test requests and ` +
        `${(removedFiles ?? []).length} test file records. Nothing else was touched.`,
    );
    return;
  }

  const admin = await findAdminProfile();
  console.log(
    admin
      ? `Return events recorded against administrator ${admin.full_name}.`
      : 'No approved administrator found; test rows will record the staff id as the handler.',
  );

  const created = [];
  const reused = [];

  const list = scenarios();
  for (let index = 0; index < list.length; index += 1) {
    const scenario = list[index];
    const fileResult = await upsertFileRecord(scenario, index, staff);
    const requestResult = await upsertRequest(scenario, fileResult.row, staff, admin);
    await syncExtensionHistory(
      scenario,
      requestResult.row,
      fileResult.row,
      staff,
      admin,
    );

    const summary = {
      scenario: scenario.key,
      file_no: fileResult.row.file_no,
      request_id: requestResult.row.id,
      expected_return_date: requestResult.row.expected_return_date,
    };
    (requestResult.created ? created : reused).push(summary);
    console.log(
      `  ${requestResult.created ? 'created' : 'updated'} ${summary.file_no} ` +
        `(${scenario.key}) ` +
        (scenario.pending
          ? 'awaiting an admin decision'
          : `due ${summary.expected_return_date}`),
    );
  }

  console.log(
    `\nDone. ${created.length} new request(s), ${reused.length} refreshed. ` +
      'Open /admin/issued-files and /staff/your-requests to see the statuses.',
  );
  console.log(
    'Due-date notifications are produced by generate_return_due_notifications() ' +
      '(migration 0018); the bell generates them on read when pg_cron is unavailable.',
  );
  console.log('Remove everything this script added with: node scripts/seed-return-test-data.js --remove');
}

main().catch((err) => {
  console.error(`\nSeed failed: ${err.message}`);
  process.exitCode = 1;
});
