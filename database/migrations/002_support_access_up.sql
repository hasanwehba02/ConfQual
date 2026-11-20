BEGIN;

CREATE TABLE support_grant (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES workspace(id) ON DELETE CASCADE,
    support_user_id UUID NOT NULL,
    created_by_user_id UUID NOT NULL,
    token_hash BYTEA NOT NULL UNIQUE,
    scopes TEXT[] NOT NULL CHECK (array_length(scopes, 1) BETWEEN 1 AND 2
        AND scopes <@ ARRAY['analytics:read', 'settings:read']::TEXT[]),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    expires_at TIMESTAMPTZ NOT NULL,
    revoked_at TIMESTAMPTZ,
    CHECK (expires_at > created_at AND expires_at <= created_at + INTERVAL '1 hour')
);

CREATE INDEX support_grant_workspace_idx ON support_grant(workspace_id, created_at DESC);

CREATE TABLE support_access_audit (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    -- Keep IDs independently of grants and workspaces so the audit trail
    -- survives deletion of the records it describes.
    grant_id UUID NOT NULL,
    workspace_id UUID NOT NULL,
    actor_user_id UUID NOT NULL,
    event TEXT NOT NULL CHECK (event IN ('grant', 'access', 'revoke')),
    scope TEXT,
    method TEXT,
    path TEXT,
    occurred_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX support_access_audit_workspace_idx
    ON support_access_audit(workspace_id, occurred_at DESC);

ALTER TABLE support_grant ENABLE ROW LEVEL SECURITY;
CREATE POLICY support_grant_workspace ON support_grant TO confqual_app
    USING (workspace_id = confqual_current_workspace_id())
    WITH CHECK (workspace_id = confqual_current_workspace_id());
GRANT SELECT, INSERT ON support_grant TO confqual_app;
GRANT UPDATE (revoked_at) ON support_grant TO confqual_app;

ALTER TABLE support_access_audit ENABLE ROW LEVEL SECURITY;
CREATE POLICY support_audit_workspace ON support_access_audit TO confqual_app
    USING (workspace_id = confqual_current_workspace_id())
    WITH CHECK (workspace_id = confqual_current_workspace_id());
GRANT SELECT, INSERT ON support_access_audit TO confqual_app;
GRANT USAGE, SELECT ON SEQUENCE support_access_audit_id_seq TO confqual_app;

COMMIT;
