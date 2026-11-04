-- ===========================================================================
-- SPID File Management System — 0011: Add avatar_url to profiles table
-- Stores permanent public URL / storage key of the user's avatar.
-- Run in Supabase SQL editor:
-- ===========================================================================

alter table public.profiles add column if not exists avatar_url text;
