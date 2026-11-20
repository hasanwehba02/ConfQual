BEGIN;
-- Original 002 installations cascade-deleted audit records with their grant
-- or workspace. Preserve the identifiers as independent audit evidence.
ALTER TABLE support_access_audit
    DROP CONSTRAINT IF EXISTS support_access_audit_grant_id_fkey,
    DROP CONSTRAINT IF EXISTS support_access_audit_workspace_id_fkey;
COMMIT;
