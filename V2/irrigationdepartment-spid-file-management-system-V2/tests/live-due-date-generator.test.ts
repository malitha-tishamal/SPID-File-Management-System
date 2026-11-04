/**
 * Live check of the due-date notification generator, for the period where
 * migration 0018 is not yet applied to the project the app talks to.
 *
 * It writes nothing unless asked:
 *   LIVE_DB=1 npx vitest run tests/live-due-date-generator.test.ts
 *
 * The only rows it can create are the notifications the notification bell
 * itself already creates when a staff member opens it, so re-running is safe
 * — the (user_id, dedupe_key) index makes the second run a no-op.
 */
import fs from 'fs';
import path from 'path';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it } from 'vitest';
import { NotificationRepository } from 'models/NotificationRepository';
import { sriLankaTodayInput } from 'lib/datetime';

const LIVE = process.env.LIVE_DB === '1';

function readEnv(): Record<string, string> {
  const envPath = path.resolve(__dirname, '../.env.local');
  const env: Record<string, string> = {};
  if (!fs.existsSync(envPath)) return env;
  fs.readFileSync(envPath, 'utf8')
    .split(/\r?\n/)
    .forEach((line) => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) return;
      const i = trimmed.indexOf('=');
      if (i !== -1) env[trimmed.slice(0, i).trim()] = trimmed.slice(i + 1).trim();
    });
  return env;
}

let client: SupabaseClient | null = null;
function adminClient(): SupabaseClient {
  if (!client) {
    const env = readEnv();
    client = createClient(
      env.NEXT_PUBLIC_SUPABASE_URL as string,
      env.SUPABASE_SERVICE_ROLE_KEY as string,
      { auth: { persistSession: false } },
    );
  }
  return client;
}

describe.skipIf(!LIVE)('due-date notifications against the live database', () => {
  it('produces the expected buckets and never duplicates them', async () => {
    const today = sriLankaTodayInput();
    const repo = new NotificationRepository(adminClient());

    const first = await repo.generateReturnDueNotifications(today);
    const second = await repo.generateReturnDueNotifications(today);

    const { data: rows, error } = await adminClient()
      .from('notifications')
      .select('id, user_id, title, body, type, link, dedupe_key')
      .like('dedupe_key', 'return-due:%')
      .order('id');
    expect(error).toBeNull();

    console.log(
      `\ntoday=${today} firstRunInserted=${first} secondRunInserted=${second} ` +
        `storedDueRows=${rows?.length ?? 0}`,
    );
    (rows ?? []).forEach((row: any) =>
      console.log(`  ${row.dedupe_key}  [${row.type}]  ${row.title}  -> ${row.link}`),
    );

    // Idempotence is the whole point of the dedupe key.
    expect(second).toBe(0);

    const overdue = (rows ?? []).filter((r: any) => r.dedupe_key.endsWith(':overdue'));
    const dueToday = (rows ?? []).filter((r: any) => r.dedupe_key.endsWith(':due-today'));
    expect(overdue.every((r: any) => r.type === 'error')).toBe(true);
    expect(dueToday.every((r: any) => r.type === 'warning')).toBe(true);
    expect((rows ?? []).every((r: any) => /\/staff\/your-requests\?request=\d+$/.test(r.link ?? ''))).toBe(true);

    const keys = (rows ?? []).map((r: any) => `${r.user_id}|${r.dedupe_key}`);
    expect(new Set(keys).size).toBe(keys.length);
  }, 120_000);
});
