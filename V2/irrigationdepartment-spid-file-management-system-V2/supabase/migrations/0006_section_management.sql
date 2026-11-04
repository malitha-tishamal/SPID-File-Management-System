-- ======================================================================
-- SPID Section Management Migration
-- Run this in: https://supabase.com/dashboard/project/axyzfozlxefppchivfbn/sql/new
-- ======================================================================

-- Add new columns
ALTER TABLE public.sections
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'approved'
    CHECK (status IN ('approved', 'pending', 'disabled'));

ALTER TABLE public.sections
  ADD COLUMN IF NOT EXISTS section_lead text;

-- Ensure RLS is enabled
ALTER TABLE public.sections ENABLE ROW LEVEL SECURITY;

-- Ensure public read access (for registration form)
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
