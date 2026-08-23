-- The service role could not write anything.
--
-- Grants were given to `authenticated` only, so every table the application
-- reaches through the service key — the one path that can mint an auth user —
-- was refused at the grant layer before RLS was ever consulted. Adding an
-- employee failed with "permission denied for table profiles" and had done
-- since it was written.
--
-- Nothing caught it because every check creates people directly in SQL as the
-- database owner. The one action that needs elevated rights was the one action
-- never exercised the way a person exercises it.
--
-- The service role bypasses RLS by design; it still needs table grants, and
-- granting them is what Supabase's own defaults do.
grant usage on schema public to service_role;
grant all privileges on all tables    in schema public to service_role;
grant all privileges on all sequences in schema public to service_role;
grant all privileges on all functions in schema public to service_role;

-- Anything created later inherits the same, so a new table does not silently
-- break employee creation again.
alter default privileges in schema public grant all on tables    to service_role;
alter default privileges in schema public grant all on sequences to service_role;
alter default privileges in schema public grant all on functions to service_role;
