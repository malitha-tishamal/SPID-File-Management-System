# Section Management Database Migration Required

The Section Management feature requires two additional columns in the `sections` table. Please run the following SQL in your Supabase Dashboard.

## Steps to Run Migration

1. Open your Supabase Dashboard: https://supabase.com/dashboard
2. Navigate to your project
3. Go to **SQL Editor** (in the left sidebar)
4. Click **New Query**
5. Copy and paste the SQL below
6. Click **Run** (or press Ctrl+Enter)

## SQL Migration Script

```sql
-- Add status column with constraint
ALTER TABLE public.sections
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'approved'
    CHECK (status IN ('approved', 'pending', 'disabled'));

-- Add section_lead column (optional)
ALTER TABLE public.sections
  ADD COLUMN IF NOT EXISTS section_lead text;

-- Create/Update admin policy for sections management
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

## What This Migration Does

1. **status column**: Tracks whether a section is 'approved', 'pending', or 'disabled'
   - Default: 'approved' for all existing sections
   - Used to enable/disable sections from the UI

2. **section_lead column**: Stores the name of the section lead/officer
   - Optional field (can be NULL)
   - Used to track who manages each section

3. **Policy**: Ensures only administrators can create/update/delete sections
   - Read access remains public (for dropdowns)
   - Write operations require admin privileges

## After Migration

Once you've run this SQL, the Section Management page will work fully:
- ✅ Create new sections
- ✅ Edit section name and lead
- ✅ Disable sections
- ✅ Delete sections (if no users are assigned)
- ✅ View section statistics
- ✅ Filter by status
