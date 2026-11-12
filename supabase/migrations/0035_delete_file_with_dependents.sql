-- ===========================================================================
-- SPID File Management System — 0035: Permanent file deletion with
-- dependent rows, in one transaction.
--
-- staff_file_requests.file_id references files(id) ON DELETE RESTRICT, and
-- file_request_extensions.request_id references staff_file_requests(id)
-- ON DELETE CASCADE. Deleting a file therefore has to remove extension
-- requests first, then staff requests, then the file. PostgREST cannot open a
-- multi-statement transaction from the JS client, so the whole sequence lives
-- in one function: any failure rolls every step back.
--
-- The FK constraints stay exactly as they are — no cascade is added to
-- files. A child table this function does not know about still blocks the
-- delete with 23503, which the API maps to a clear response.
--
-- Idempotent: safe to paste into the Supabase SQL Editor and re-run.
-- ===========================================================================

create or replace function public.delete_file_with_dependents(
  p_file_id bigint,
  p_actor_id uuid,
  p_actor_name text default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_file public.files%rowtype;
  v_request_count bigint := 0;
  v_extension_count bigint := 0;
  v_audit_id bigint;
begin
  -- Blocks a concurrent child insert until this transaction ends: an FK
  -- insert takes a KEY SHARE lock on the parent, which conflicts with this.
  select * into v_file
  from public.files
  where id = p_file_id
  for update;

  if not found then
    return jsonb_build_object('outcome', 'not_found');
  end if;

  select count(*)
  into v_extension_count
  from public.file_request_extensions as e
  join public.staff_file_requests as r on r.id = e.request_id
  where r.file_id = p_file_id;

  select count(*)
  into v_request_count
  from public.staff_file_requests
  where file_id = p_file_id;

  -- Nested FK first, then its parent, then the file.
  delete from public.file_request_extensions as e
  using public.staff_file_requests as r
  where e.request_id = r.id
    and r.file_id = p_file_id;

  delete from public.staff_file_requests
  where file_id = p_file_id;

  delete from public.files
  where id = p_file_id;

  -- Same transaction: a delete can never commit without its audit trail.
  insert into public.audit_logs (actor_id, action, details)
  values (
    p_actor_id,
    'file.deleted',
    jsonb_build_object(
      'file_id', v_file.id,
      'file_no', v_file.file_no,
      'file_name', v_file.file_name,
      'section', v_file.section_name,
      'deleted_by', p_actor_name,
      'deleted_at', now(),
      'deleted_file_requests', v_request_count,
      'deleted_file_request_extensions', v_extension_count
    )
  )
  returning id into v_audit_id;

  return jsonb_build_object(
    'outcome', 'deleted',
    'file_id', v_file.id,
    'file_no', v_file.file_no,
    'file_name', v_file.file_name,
    'deleted_file_requests', v_request_count,
    'deleted_file_request_extensions', v_extension_count,
    'audit_id', v_audit_id
  );
end;
$$;

-- Server-only callable: the function trusts p_actor_id, so browser roles must
-- never be able to invoke it.
revoke all on function public.delete_file_with_dependents(bigint, uuid, text)
  from public;
revoke all on function public.delete_file_with_dependents(bigint, uuid, text)
  from anon, authenticated;
grant execute on function public.delete_file_with_dependents(bigint, uuid, text)
  to service_role;

notify pgrst, 'reload schema';
