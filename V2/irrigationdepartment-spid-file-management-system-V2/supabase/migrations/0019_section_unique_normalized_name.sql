-- Section name uniqueness (case- and whitespace-insensitive).
--
-- NOT APPLIED. Review existing data before running:
--   SELECT lower(regexp_replace(btrim(name), '\s+', ' ', 'g')) AS normalized,
--          count(*)
--   FROM public.sections
--   GROUP BY normalized
--   HAVING count(*) > 1;
-- Merge/rename any pre-existing duplicates first, then apply this migration.
-- The API and UI already reject new duplicates; this index closes the race.

CREATE UNIQUE INDEX IF NOT EXISTS sections_name_normalized_key
  ON public.sections (lower(regexp_replace(btrim(name), '\s+', ' ', 'g')));
