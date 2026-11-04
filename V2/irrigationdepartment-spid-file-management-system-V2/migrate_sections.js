/**
 * One-time migration script: adds status and section_lead columns to sections table.
 * Run with: node --env-file=.env.local migrate_sections.js
 */
const { createClient } = require('@supabase/supabase-js');

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !key) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(url, key);

async function runMigration() {
  console.log('Running sections table migration...');

  // Step 1: Create the exec_sql helper function first (SECURITY DEFINER, so it can run DDL)
  const createFnBody = `
    CREATE OR REPLACE FUNCTION public.exec_sql(sql text)
    RETURNS void
    LANGUAGE plpgsql
    SECURITY DEFINER
    SET search_path = ''
    AS $$
    BEGIN
      EXECUTE sql;
    END;
    $$;
  `;

  // We can't run DDL directly, but we can try to use an existing function
  // or create one via a specially crafted insert that triggers a function
  // Actually, the service role client via supabase-js uses the REST API which cannot run DDL.
  // 
  // WORKAROUND: Use the Supabase Data API with special headers to execute raw SQL
  // by exploiting the fact that service role bypasses RLS
  //
  // The REAL solution for Supabase cloud: use the Management API with a PAT token.
  // Since we don't have that, we'll use the columns we already have and implement
  // the section management feature to store status/lead in the existing columns
  // OR we'll add the columns manually via a migration Next.js API route.

  console.log('\n⚠️  Cannot run DDL via supabase-js REST API directly.');
  console.log('\nPlease run the following SQL in your Supabase Dashboard SQL Editor:');
  console.log('\n--- COPY SQL BELOW ---\n');
  console.log(`ALTER TABLE public.sections 
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'approved' 
    CHECK (status IN ('approved', 'pending', 'disabled'));

ALTER TABLE public.sections 
  ADD COLUMN IF NOT EXISTS section_lead text;

-- Also add an admin-only write policy for sections
DROP POLICY IF EXISTS "admins can manage sections" ON public.sections;
CREATE POLICY "admins can manage sections"
  ON public.sections
  FOR ALL
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());`);
  console.log('\n--- END SQL ---\n');

  // Try to verify if the columns already exist
  const { data, error } = await supabase.from('sections').select('id, name').limit(1);
  if (error) {
    console.error('Error accessing sections:', error.message);
  } else {
    console.log('Current sections table accessible ✓');
    const firstRow = data?.[0];
    if (firstRow && 'status' in firstRow) {
      console.log('✅ status column already exists!');
    } else {
      console.log('❌ status column not found - please run the SQL above in Supabase Dashboard');
    }
  }
}

runMigration().catch(console.error);
