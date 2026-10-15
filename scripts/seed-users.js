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
    env[trimmed.substring(0, idx).trim()] = trimmed.substring(idx + 1).trim();
  }
});

const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false }
});

const admins = [
  {
    name: 'Chaminda Rajapaksha',
    email: 'chaminda.r@spid.gov.lk',
    phone: '+94 71 884 9210',
    nic: '198578912345',
    section_id: 2,
    role: 'Administrator',
    status: 'approved'
  },
  {
    name: 'Anura Bandara',
    email: 'anura.b@spid.gov.lk',
    phone: '+94 70 332 9981',
    nic: '199345678912',
    section_id: 3,
    role: 'Administrator',
    status: 'pending'
  },
  {
    name: 'Niluka Dissanayake',
    email: 'niluka.d@spid.gov.lk',
    phone: '+94 77 654 3210',
    nic: '198755679123',
    section_id: 5,
    role: 'Administrator',
    status: 'approved'
  },
  {
    name: 'Samantha Weerasinghe',
    email: 'samantha.w@spid.gov.lk',
    phone: '+94 76 991 1445',
    nic: '197933100299',
    section_id: 6,
    role: 'Administrator',
    status: 'disabled'
  },
  {
    name: 'Dinesh Pathirana',
    email: 'dinesh.p@spid.gov.lk',
    phone: '+94 72 201 5590',
    nic: '199211899234',
    section_id: 2,
    role: 'Administrator',
    status: 'approved'
  },
  {
    name: 'Gamini Jayawardena',
    email: 'gamini.j@spid.gov.lk',
    phone: '+94 71 234 5678',
    nic: '198212345678',
    section_id: 1,
    role: 'Administrator',
    status: 'approved'
  },
  {
    name: 'Sunil Wickramasinghe',
    email: 'sunil.w@spid.gov.lk',
    phone: '+94 77 987 6543',
    nic: '197612345678',
    section_id: 4,
    role: 'Administrator',
    status: 'approved'
  }
];

const staff = [
  {
    name: 'K. L. Kasun Perera',
    email: 'kasun.perera@spid.gov.lk',
    phone: '+94 77 123 4567',
    nic: '199523401328',
    section_id: 7,
    role: 'Staff',
    status: 'approved'
  },
  {
    name: 'R. M. Dilshan Fernando',
    email: 'dilshan.f@spid.gov.lk',
    phone: '+94 71 892 3311',
    nic: '198940901293',
    section_id: 8,
    role: 'Staff',
    status: 'pending'
  },
  {
    name: 'P. G. Nuwan Silva',
    email: 'nuwan.silva@spid.gov.lk',
    phone: '+94 70 445 6789',
    nic: '199678201944',
    section_id: 4,
    role: 'Staff',
    status: 'approved'
  },
  {
    name: 'Tharushi Jayawardena',
    email: 'tharushi.j@spid.gov.lk',
    phone: '+94 78 554 9801',
    nic: '200051200820',
    section_id: 1,
    role: 'Staff',
    status: 'disabled'
  },
  {
    name: 'H. K. Sunil Shantha',
    email: 'sunil.shantha@spid.gov.lk',
    phone: '+94 77 881 2234',
    nic: '197812905341',
    section_id: 9,
    role: 'Staff',
    status: 'approved'
  },
  {
    name: 'M. D. Ruwan Kumara',
    email: 'ruwan.kumara@spid.gov.lk',
    phone: '+94 71 334 8872',
    nic: '198544109822',
    section_id: 8,
    role: 'Staff',
    status: 'approved'
  },
  {
    name: 'S. A. Lalith Gamage',
    email: 'lalith.g@spid.gov.lk',
    phone: '+94 72 201 9868',
    nic: '197508101238',
    section_id: 1,
    role: 'Staff',
    status: 'disabled'
  }
];

async function seed() {
  const usersToCreate = [...admins, ...staff];
  console.log(`Checking ${usersToCreate.length} seed users...`);

  for (const u of usersToCreate) {
    // Check if profile exists
    const { data: existing } = await supabase
      .from('profiles')
      .select('id, email')
      .eq('email', u.email)
      .maybeSingle();

    if (existing) {
      console.log(`User ${u.email} already exists. Updating profile...`);
      await supabase
        .from('profiles')
        .update({
          full_name: u.name,
          role: u.role,
          account_status: u.status,
          nic: u.nic,
          mobile_phone: u.phone,
          section_id: u.section_id
        })
        .eq('id', existing.id);
      continue;
    }

    // Create via auth.admin
    console.log(`Creating auth user: ${u.email}...`);
    const { data: created, error: createErr } = await supabase.auth.admin.createUser({
      email: u.email,
      password: 'SpidUser@2026',
      email_confirm: true,
      user_metadata: {
        full_name: u.name,
        requested_role: u.role,
        section_id: u.section_id,
        nic: u.nic,
        mobile_phone: u.phone
      }
    });

    if (createErr) {
      console.error(`Failed to create ${u.email}:`, createErr.message);
      continue;
    }

    if (created?.user?.id) {
      // Update profile with correct role, status, etc.
      await supabase
        .from('profiles')
        .update({
          full_name: u.name,
          role: u.role,
          account_status: u.status,
          nic: u.nic,
          mobile_phone: u.phone,
          section_id: u.section_id
        })
        .eq('id', created.user.id);
      console.log(`Created & configured ${u.email} (${u.role}, ${u.status})`);
    }
  }

  const { data: all } = await supabase.from('profiles').select('id, full_name, email, role, account_status');
  console.log(`Seeding complete. Total profiles now: ${all?.length}`);
}

seed();
