
-- Ask PostgREST to reload its schema cache so the app sees the new
-- columns/table without restarting the project.
notify pgrst, 'reload schema';
