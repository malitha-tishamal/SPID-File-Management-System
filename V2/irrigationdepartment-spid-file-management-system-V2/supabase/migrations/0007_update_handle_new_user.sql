-- ===========================================================================
-- SPID File Management System — 0007: Update handle_new_user trigger
-- Ensures public registration assigns the selected role ('Staff' or 'Administrator')
-- from registration metadata while keeping account_status as 'pending'
-- ===========================================================================

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_section_id bigint;
  v_role text;
  v_requested_role text;
begin
  begin
    if new.raw_user_meta_data->>'section_id' is not null then
      v_section_id := (new.raw_user_meta_data->>'section_id')::bigint;
    end if;
  exception when others then
    v_section_id := null;
  end;

  v_role := case
    when new.raw_user_meta_data->>'role' in ('Staff', 'Administrator')
      then new.raw_user_meta_data->>'role'
    when new.raw_user_meta_data->>'requested_role' in ('Staff', 'Administrator')
      then new.raw_user_meta_data->>'requested_role'
    else 'Staff'
  end;

  v_requested_role := case
    when new.raw_user_meta_data->>'requested_role' in ('Staff', 'Administrator')
      then new.raw_user_meta_data->>'requested_role'
    when new.raw_user_meta_data->>'role' in ('Staff', 'Administrator')
      then new.raw_user_meta_data->>'role'
    else 'Staff'
  end;

  insert into public.profiles (
    id, full_name, email, role, requested_role, section_id,
    nic, mobile_phone, account_status
  )
  values (
    new.id,
    coalesce(nullif(new.raw_user_meta_data->>'full_name', ''), split_part(new.email, '@', 1)),
    new.email,
    v_role,
    v_requested_role,
    v_section_id,
    nullif(new.raw_user_meta_data->>'nic', ''),
    nullif(new.raw_user_meta_data->>'mobile_phone', ''),
    'pending'
  )
  on conflict (id) do update set
    role = excluded.role,
    requested_role = excluded.requested_role;

  return new;
end;
$$;
