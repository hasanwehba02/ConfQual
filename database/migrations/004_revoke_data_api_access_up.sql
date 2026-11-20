BEGIN;

-- ConfQual accesses application data through its backend PostgreSQL role, not
-- through the Supabase Data API. Remove API-role access to existing objects
-- and prevent future tables/sequences created by this migration owner from
-- inheriting those grants.
DO $$
DECLARE
    api_role TEXT;
BEGIN
    FOREACH api_role IN ARRAY ARRAY['anon', 'authenticated'] LOOP
        IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = api_role) THEN
            EXECUTE format(
                'REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA public FROM %I',
                api_role
            );
            EXECUTE format(
                'REVOKE ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public FROM %I',
                api_role
            );
            EXECUTE format(
                'ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL PRIVILEGES ON TABLES FROM %I',
                api_role
            );
            EXECUTE format(
                'ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL PRIVILEGES ON SEQUENCES FROM %I',
                api_role
            );
            EXECUTE format(
                'REVOKE ALL PRIVILEGES ON FUNCTION public.confqual_current_workspace_id() FROM %I',
                api_role
            );
        END IF;
    END LOOP;
END
$$;

REVOKE ALL PRIVILEGES ON FUNCTION public.confqual_current_workspace_id() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.confqual_current_workspace_id() TO confqual_app;

COMMIT;
