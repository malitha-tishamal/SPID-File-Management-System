const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const envContent = fs.readFileSync('.env.local', 'utf8');
const env = {};
envContent.split('\n').forEach(line => {
  const match = line.match(/^([^=]+)=(.*)$/);
  if (match) env[match[1].trim()] = match[2].trim();
});

const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

async function check() {
  const { data, error } = await supabase.from('files').select('*').limit(1);
  if (error) {
    console.error('Error selecting from files:', error);
    return;
  }
  console.log('Sample file record columns:', data.length > 0 ? Object.keys(data[0]) : 'No records, columns:');
  
  // Test update with dry run or check what happens
  if (data.length > 0) {
    console.log('Record 0:', data[0]);
  }
}

check();
