-- Fix the "Acconting" typo in existing sample section data.
-- Idempotent: after the rename, the WHERE clause matches no rows.
update public.sections
set name = regexp_replace(name, 'acconting', 'Accounting', 'gi')
where name ~* 'acconting';
