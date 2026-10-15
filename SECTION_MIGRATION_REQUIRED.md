# Section Management Database Migration Required

The Section Management feature requires two additional columns in the `sections` table and proper RLS policies. Please run the following SQL in your Supabase Dashboard.

## Steps to Run Migration

1. Open your Supabase Dashboard: https://supabase.com/dashboard
2. Navigate to your project
3. Go to **SQL Editor** (in the left sidebar)
4. Click **New Query**
5. Copy and paste the SQL below
6. Click **Run** (or press Ctrl+Enter)

## SQL Migration Script

```sql
-- Add new columns
ALTER TABLE public.sections
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'approved'
    CHECK (status IN ('approved', 'pending', 'disabled'));

ALTER TABLE public.sections
  ADD COLUMN IF NOT EXISTS section_lead text;

-- Ensure RLS is enabled
ALTER TABLE public.sections ENABLE ROW LEVEL SECURITY;

-- Ensure public read access (for registration form - IMPORTANT!)
DROP POLICY IF EXISTS "public can read sections" ON public.sections;
CREATE POLICY "public can read sections"
  ON public.sections
  FOR SELECT
  TO anon, authenticated
  USING (true);

-- Allow administrators to insert/update/delete sections
DROP POLICY IF EXISTS "admins can manage sections" ON public.sections;
CREATE POLICY "admins can manage sections"
  ON public.sections
  FOR ALL
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- Update existing sections to have 'approved' status
UPDATE public.sections
SET status = 'approved'
WHERE status IS NULL;
```

## Verification

After running the migration, you can verify it worked by running:

```sql
SELECT id, name, status, section_lead, created_at
FROM public.sections
ORDER BY id;
```

You should see the `status` and `section_lead` columns populated.

## Test Public Access

To verify the public read policy works (this is what the registration form uses):

```sql
-- Test as anonymous user (this simulates what happens on the registration page)
SET request.jwt.claim.sub = '';
SET request.jwt.claim.role = 'anon';

SELECT id, name, status, section_lead
FROM public.sections
LIMIT 5;
```

If this returns data, the public read policy is working correctly.

## What This Migration Does

1. **status column**: Tracks whether a section is 'approved', 'pending', or 'disabled'
   - Default: 'approved' for all existing sections
   - Used to enable/disable sections from the UI

2. **section_lead column**: Stores the name of the section lead/officer
   - Optional field (can be NULL)
   - Used to track who manages each section

3. **Public read policy**: CRITICAL for registration form
   - Allows unauthenticated users to read sections
   - Required for the section dropdown on the registration page
   - Uses `TO anon, authenticated` to cover both cases

4. **Admin management policy**: For write operations
   - Only administrators can create/update/delete sections
   - Read access remains public (for dropdowns)
   - Write operations require admin privileges

## Why This Is Needed for Vercel

On localhost, the app might work without this policy due to different database configurations. On Vercel (production), the Supabase RLS policies are strictly enforced. Without the explicit "public can read sections" policy, unauthenticated requests from the registration form will be denied, causing the dropdown to be empty.

## After Migration

Once you've run this SQL, the Section Management page will work fully:
- ✅ Create new sections
- ✅ Edit section name and lead
- ✅ Disable sections
- ✅ Delete sections (if no users are assigned)
- ✅ View section statistics
- ✅ Filter by status
- ✅ Section dropdown loads on registration page (production)
