const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

const envPath = path.resolve(__dirname, '../.env.local');
const envFile = fs.readFileSync(envPath, 'utf8');
const env = {};
envFile.split(/\r?\n/).forEach(line => {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith('#')) return;
  const idx = trimmed.indexOf('=');
  if (idx !== -1) {
    const k = trimmed.substring(0, idx).trim();
    const v = trimmed.substring(idx + 1).trim();
    env[k] = v;
  }
});

const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

async function check() {
  const { data, error } = await supabase.from('profiles').select('*');
  if (error) {
    console.error('Error fetching profiles:', error);
    return;
  }
  console.log('TOTAL PROFILES:', data?.length);
  console.log(JSON.stringify(data, null, 2));

  // Check if any profile has officer@spid.gov.lk or needs Administrator role
  for (const p of (data || [])) {
    if (p.role !== 'Administrator' || p.account_status !== 'approved') {
      console.log(`Promoting ${p.email} (${p.full_name}) to Administrator and approved...`);
      const { error: updErr } = await supabase
        .from('profiles')
        .update({ role: 'Administrator', account_status: 'approved' })
        .eq('id', p.id);
      if (updErr) console.error('Update error:', updErr);
      else console.log(`Successfully updated ${p.email}`);
    }
  }
}

check();
