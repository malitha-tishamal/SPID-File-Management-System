-- ===========================================================================
-- SPID File Management System — 0004: Storage buckets & policies
-- - profile-images   : public bucket, own-folder uploads, approved users only
-- - official-documents: PRIVATE bucket, own-folder access, admins unrestricted
-- Private reads use server-generated signed URLs.
-- Run order: 0001 -> 0002 -> 0003 -> 0004
-- ===========================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'profile-images', 'profile-images', true, 5242880,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do nothing;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'official-documents', 'official-documents', false, 20971520,
  array['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
)
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- profile-images (public bucket)
-- ---------------------------------------------------------------------------
drop policy if exists "approved users upload own profile image" on storage.objects;
create policy "approved users upload own profile image"
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'profile-images'
    and (storage.foldername(name))[1] = auth.uid()::text
    and public.is_approved()
  );

drop policy if exists "approved users update own profile image" on storage.objects;
create policy "approved users update own profile image"
  on storage.objects
  for update
  to authenticated
  using (
    bucket_id = 'profile-images'
    and (storage.foldername(name))[1] = auth.uid()::text
    and public.is_approved()
  );

drop policy if exists "users delete own profile image or admin" on storage.objects;
create policy "users delete own profile image or admin"
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'profile-images'
    and ((storage.foldername(name))[1] = auth.uid()::text or public.is_admin())
  );

-- ---------------------------------------------------------------------------
-- official-documents (private bucket) — approved users, own folder only
-- ---------------------------------------------------------------------------
drop policy if exists "approved users upload own documents" on storage.objects;
create policy "approved users upload own documents"
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'official-documents'
    and (storage.foldername(name))[1] = auth.uid()::text
    and public.is_approved()
  );

drop policy if exists "own documents readable or admin" on storage.objects;
create policy "own documents readable or admin"
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'official-documents'
    and ((storage.foldername(name))[1] = auth.uid()::text or public.is_admin())
  );

drop policy if exists "own documents updatable" on storage.objects;
create policy "own documents updatable"
  on storage.objects
  for update
  to authenticated
  using (
    bucket_id = 'official-documents'
    and (storage.foldername(name))[1] = auth.uid()::text
    and public.is_approved()
  );

drop policy if exists "own documents deletable or admin" on storage.objects;
create policy "own documents deletable or admin"
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'official-documents'
    and ((storage.foldername(name))[1] = auth.uid()::text or public.is_admin())
  );
