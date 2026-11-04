/**
 * Read-only audit of the return/extension/notification state, used to verify
 * the due-date rules against the live database without touching a browser.
 *
 *   node scripts/verify-return-workflows.js              # read-only
 *   node scripts/verify-return-workflows.js --run-generator
 *
 * `--run-generator` calls generate_return_due_notifications() (needs
 * migration 0018 applied). It is the same call the notification bell makes,
 * and the dedupe index makes repeating it safe.
 */
const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

const envPath = path.join(__dirname, '..', '.env.local');
if (!fs.existsSync(envPath)) {
  console.error('Missing .env.local — run this from a cloned project with credentials.');
  process.exit(1);
}
const env = {};
fs.readFileSync(envPath, 'utf8')
  .split('\n')
  .map((line) => line.trim())
  .filter((line) => line && !line.startsWith('#') && line.includes('='))
  .forEach((line) => {
    const i = line.indexOf('=');
    env[line.slice(0, i).trim()] = line.slice(i + 1).trim().replace(/^["']|["']$/g, '');
  });

const supabase = createClient(
  env.NEXT_PUBLIC_SUPABASE_URL,
  env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } },
);

const TARGET_EMAIL = 'ureshanchilly28@gmail.com';
const RUN = process.argv.includes('--run-generator');

function sriLankaToday() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Colombo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

function dayDiff(laterDate, earlierDate) {
  const later = Date.parse(`${laterDate}T00:00:00Z`);
  const earlier = Date.parse(`${earlierDate}T00:00:00Z`);
  return Math.round((later - earlier) / 86400000);
}

/** Mirrors generate_return_due_notifications(): same filter, same buckets. */
function bucketFor(expectedReturnDate, today) {
  if (expectedReturnDate < today) return 'overdue';
  if (expectedReturnDate === today) return 'due-today';
  if (dayDiff(expectedReturnDate, today) <= 3) return 'due-soon';
  return 'not-due-yet';
}

async function main() {
  const today = sriLankaToday();
  console.log(`Asia/Colombo today: ${today}\n`);

  const { data: profiles, error: profileError } = await supabase
    .from('profiles')
    .select('id, full_name, email, role, account_status');
  if (profileError) throw profileError;

  const staff = profiles.find((p) => p.email === TARGET_EMAIL);
  if (!staff) {
    console.error(`Staff account ${TARGET_EMAIL} not found.`);
    process.exit(1);
  }
  const admins = profiles.filter(
    (p) => p.role === 'Administrator' && p.account_status === 'approved',
  );
  console.log(
    `Target staff: ${staff.full_name} (${staff.id}) — role "${staff.role}", status "${staff.account_status}"`,
  );
  console.log(`Approved administrators: ${admins.length} (${admins.map((a) => a.full_name).join(', ')})\n`);

  const { data: requests, error: requestError } = await supabase
    .from('staff_file_requests')
    .select('id, file_no, file_name, status, expected_return_date, original_return_date, returned_at, created_at, requester_id')
    .eq('requester_id', staff.id)
    .order('id');
  if (requestError) throw requestError;

  console.log('── Issued rows for the test account ──');
  const active = requests.filter((r) => r.status === 'APPROVED' && !r.returned_at);
  for (const row of requests) {
    const bucket = row.returned_at
      ? 'returned'
      : bucketFor(String(row.expected_return_date).slice(0, 10), today);
    const key =
      bucket === 'not-due-yet' || bucket === 'returned'
        ? '—'
        : `return-due:${row.id}:${String(row.expected_return_date).slice(0, 10)}:${bucket}`;
    console.log(
      `  #${row.id} ${row.file_no.padEnd(16)} ${row.status.padEnd(9)} due ${String(row.expected_return_date).slice(0, 10)}  bucket=${bucket}  dedupe=${key}`,
    );
  }

  const counts = {
    active: active.length,
    overdue: active.filter((r) => String(r.expected_return_date).slice(0, 10) < today).length,
    extended: active.filter(
      (r) =>
        r.original_return_date &&
        String(r.expected_return_date).slice(0, 10) !== String(r.original_return_date).slice(0, 10),
    ).length,
    returned: requests.filter((r) => Boolean(r.returned_at)).length,
  };
  console.log('\n── Issued Files summary cards (this account only) ──');
  console.log(`  ACTIVE ISSUES: ${counts.active}`);
  console.log(`  OVERDUE:       ${counts.overdue}`);
  console.log(`  EXTENDED:      ${counts.extended}`);
  console.log(`  RETURNED:      ${counts.returned}`);

  const { data: allIssued, error: allError } = await supabase
    .from('staff_file_requests')
    .select('id, file_no, expected_return_date, original_return_date, returned_at')
    .eq('status', 'APPROVED');
  if (allError) throw allError;
  const live = allIssued.filter((r) => !r.returned_at);
  console.log('\n── Same rules across every issued file in the database ──');
  console.log(
    `  ACTIVE=${live.length}  OVERDUE=${live.filter((r) => String(r.expected_return_date).slice(0, 10) < today).length}` +
      `  EXTENDED=${live.filter((r) => r.original_return_date && String(r.expected_return_date).slice(0, 10) !== String(r.original_return_date).slice(0, 10)).length}` +
      `  RETURNED=${allIssued.filter((r) => r.returned_at).length}  TOTAL_APPROVED=${allIssued.length}`,
  );

  const { data: extensions, error: extensionError } = await supabase
    .from('file_request_extensions')
    .select('id, request_id, status, previous_return_date, new_return_date, requested_by, reviewed_by')
    .in('request_id', requests.map((r) => r.id))
    .order('id');
  if (extensionError) throw extensionError;
  console.log('\n── Extension requests ──');
  if (!extensions.length) console.log('  none');
  extensions.forEach((e) =>
    console.log(
      `  #${e.id} request=${e.request_id} ${e.status}  ${e.previous_return_date} -> ${e.new_return_date}  requested_by=${e.requested_by === staff.id ? 'test staff' : 'other'}  reviewed_by=${e.reviewed_by || '—'}`,
    ),
  );

  const { data: notifications, error: notificationError } = await supabase
    .from('notifications')
    .select('id, user_id, title, type, link, dedupe_key, read_at, created_at')
    .in('user_id', [staff.id, ...admins.map((a) => a.id)])
    .order('id');
  if (notificationError) throw notificationError;
  console.log('\n── Persisted notifications ──');
  if (!notifications.length) {
    console.log(
      '  none yet — apply migration 0018 then re-run with --run-generator or open the bell.',
    );
  }
  const byDedupe = new Map();
  notifications.forEach((n) => {
    const key = `${n.user_id}|${n.dedupe_key}`;
    byDedupe.set(key, (byDedupe.get(key) || 0) + 1);
  });
  const duplicates = [...byDedupe.entries()].filter(([, c]) => c > 1);
  notifications.forEach((n) => {
    const who = n.user_id === staff.id ? staff.full_name : admins.find((a) => a.id === n.user_id)?.full_name;
    console.log(
      `  #${n.id} [${who}] ${n.type.padEnd(7)} read=${n.read_at ? 'yes' : 'no '}  ${n.title}  (key=${n.dedupe_key})`,
    );
  });
  console.log(
    `\n  unread(test staff)=${notifications.filter((n) => n.user_id === staff.id && !n.read_at).length}` +
      `  unread(administrators)=${notifications.filter((n) => n.user_id !== staff.id && !n.read_at).length}` +
      `  duplicate-dedupe-rows=${duplicates.length}`,
  );

  const shapes = new Map();
  notifications.forEach((n) => {
    const shape = (n.link || '(no link — row only expands)')
      .replace(/[0-9a-f]{8}-[0-9a-f-]+/g, 'id')
      .replace(/\d+/g, 'N');
    shapes.set(shape, (shapes.get(shape) || 0) + 1);
  });
  console.log('\n── Notification destinations ──');
  [...shapes.entries()].forEach(([shape, count]) => {
    console.log(`  ${String(count).padStart(3)} x ${shape}`);
  });

  if (RUN) {
    const { data, error } = await supabase.rpc('generate_return_due_notifications', {
      p_today: today,
    });
    if (error) {
      console.log(`\nGenerator call failed: ${error.code} ${error.message}`);
      console.log('→ Apply supabase/migrations/0018_return_due_notifications.sql first.');
      process.exit(1);
    }
    console.log(`\nGenerator inserted ${data} new notification(s) on this run.`);
    const again = await supabase.rpc('generate_return_due_notifications', { p_today: today });
    console.log(`Second run inserted ${again.data} — 0 proves dedupe works.`);
  }
}

main().catch((err) => {
  console.error('Verification failed:', err.message || err);
  process.exit(1);
});
