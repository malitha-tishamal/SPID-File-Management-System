-- ======================================================================
-- SPID Section Management Migration
-- Run this in: https://supabase.com/dashboard/project/axyzfozlxefppchivfbn/sql/new
-- ======================================================================

ALTER TABLE public.sections
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'approved'
    CHECK (status IN ('approved', 'pending', 'disabled'));

ALTER TABLE public.sections
  ADD COLUMN IF NOT EXISTS section_lead text;

-- Allow administrators to insert/update/delete sections (read is already public)
DROP POLICY IF EXISTS "admins can manage sections" ON public.sections;
CREATE POLICY "admins can manage sections"
  ON public.sections
  FOR ALL
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());
