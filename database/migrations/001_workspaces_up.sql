BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'confqual_app') THEN
        CREATE ROLE confqual_app NOLOGIN NOSUPERUSER NOBYPASSRLS;
    END IF;
END
$$;

GRANT confqual_app TO CURRENT_USER;
GRANT USAGE ON SCHEMA public TO confqual_app;

CREATE TABLE IF NOT EXISTS workspace (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_user_id UUID UNIQUE,
    name TEXT NOT NULL,
    is_legacy BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS workspace_member (
    workspace_id UUID NOT NULL REFERENCES workspace(id) ON DELETE CASCADE,
    user_id UUID NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('admin', 'chair', 'viewer')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (workspace_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_workspace_member_user
    ON workspace_member(user_id);

CREATE OR REPLACE FUNCTION confqual_current_workspace_id()
RETURNS UUID
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
    SELECT COALESCE(
        NULLIF(current_setting('app.current_workspace_id', true), '')::UUID,
        (
            SELECT id
            FROM workspace
            ORDER BY is_legacy DESC, created_at ASC
            LIMIT 1
        )
    )
$$;

-- Preserve existing data inside one unclaimed workspace. First authenticated
-- user claims this workspace; later users receive empty private workspaces.
-- Fallback also keeps old application instances writing safely during rollout.
INSERT INTO workspace (name, is_legacy)
SELECT 'Legacy ConfQual data', true
WHERE NOT EXISTS (SELECT 1 FROM workspace);

DO $$
DECLARE
    table_name TEXT;
    legacy_workspace UUID;
    domain_tables TEXT[] := ARRAY[
        'conference_series', 'edition', 'researcher', 'anonymised_researcher',
        'participant', 'author_participant', 'evaluator', 'sc_chair',
        'person_conflict', 'configuration_information', 'alert_rule', 'topic',
        'paper', 'paper_topic', 'paper_author_new', 'assignment', 'bid',
        'conflict', 'review', 'comment', 'meta_review', 'note',
        'conference_note', 'edition_note', 'topic_note', 'author_note',
        'paper_note', 'researcher_note', 'participant_note', 'assignment_note',
        'review_note', 'comment_note', 'decision_note', 'settings',
        'participant_topic'
    ];
BEGIN
    SELECT id INTO legacy_workspace
    FROM workspace
    ORDER BY is_legacy DESC, created_at ASC
    LIMIT 1;

    FOREACH table_name IN ARRAY domain_tables LOOP
        EXECUTE format(
            'ALTER TABLE %I ADD COLUMN IF NOT EXISTS workspace_id UUID',
            table_name
        );

        IF legacy_workspace IS NOT NULL THEN
            EXECUTE format(
                'UPDATE %I SET workspace_id = $1 WHERE workspace_id IS NULL',
                table_name
            ) USING legacy_workspace;
        END IF;

        EXECUTE format(
            'ALTER TABLE %I ALTER COLUMN workspace_id SET DEFAULT confqual_current_workspace_id()',
            table_name
        );
        EXECUTE format(
            'ALTER TABLE %I ALTER COLUMN workspace_id SET NOT NULL',
            table_name
        );

        IF NOT EXISTS (
            SELECT 1
            FROM pg_constraint
            WHERE conname = 'fk_' || table_name || '_workspace'
        ) THEN
            EXECUTE format(
                'ALTER TABLE %I ADD CONSTRAINT %I FOREIGN KEY (workspace_id) REFERENCES workspace(id) ON DELETE CASCADE',
                table_name,
                'fk_' || table_name || '_workspace'
            );
        END IF;

        EXECUTE format(
            'CREATE INDEX IF NOT EXISTS %I ON %I(workspace_id)',
            'idx_' || table_name || '_workspace',
            table_name
        );

        EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', table_name);
        EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', table_name);
        EXECUTE format('DROP POLICY IF EXISTS workspace_isolation ON %I', table_name);
        EXECUTE format(
            'CREATE POLICY workspace_isolation ON %I FOR ALL TO confqual_app USING (workspace_id = confqual_current_workspace_id()) WITH CHECK (workspace_id = confqual_current_workspace_id())',
            table_name
        );
        EXECUTE format(
            'GRANT SELECT, INSERT, UPDATE, DELETE ON %I TO confqual_app',
            table_name
        );
    END LOOP;
END
$$;

CREATE OR REPLACE FUNCTION confqual_enforce_workspace_fk()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
    local_value TEXT;
    parent_workspace UUID;
BEGIN
    local_value := to_jsonb(NEW) ->> TG_ARGV[0];
    IF local_value IS NULL THEN
        RETURN NEW;
    END IF;

    EXECUTE format(
        'SELECT workspace_id FROM %s WHERE %I::text = $1',
        TG_ARGV[1]::regclass,
        TG_ARGV[2]
    )
    INTO parent_workspace
    USING local_value;

    IF parent_workspace IS NULL OR parent_workspace <> NEW.workspace_id THEN
        RAISE EXCEPTION 'workspace boundary violation on %.%', TG_TABLE_NAME, TG_ARGV[0]
            USING ERRCODE = '23503';
    END IF;

    RETURN NEW;
END
$$;

-- PostgreSQL foreign keys validate identity, but not tenant ownership. Add one
-- trigger per single-column domain FK so guessed IDs cannot create cross-workspace
-- links that leak data or block another workspace from deleting its own rows.
DO $$
DECLARE
    table_name TEXT;
    fk RECORD;
    trigger_name TEXT;
    domain_tables TEXT[] := ARRAY[
        'conference_series', 'edition', 'researcher', 'anonymised_researcher',
        'participant', 'author_participant', 'evaluator', 'sc_chair',
        'person_conflict', 'configuration_information', 'alert_rule', 'topic',
        'paper', 'paper_topic', 'paper_author_new', 'assignment', 'bid',
        'conflict', 'review', 'comment', 'meta_review', 'note',
        'conference_note', 'edition_note', 'topic_note', 'author_note',
        'paper_note', 'researcher_note', 'participant_note', 'assignment_note',
        'review_note', 'comment_note', 'decision_note', 'settings',
        'participant_topic'
    ];
BEGIN
    FOREACH table_name IN ARRAY domain_tables LOOP
        FOR fk IN
            SELECT
                constraint_row.oid,
                child_column.attname AS child_column,
                constraint_row.confrelid::regclass::text AS parent_table,
                parent_column.attname AS parent_column
            FROM pg_constraint constraint_row
            JOIN pg_attribute child_column
              ON child_column.attrelid = constraint_row.conrelid
             AND child_column.attnum = constraint_row.conkey[1]
            JOIN pg_attribute parent_column
              ON parent_column.attrelid = constraint_row.confrelid
             AND parent_column.attnum = constraint_row.confkey[1]
            WHERE constraint_row.contype = 'f'
              AND constraint_row.conrelid = to_regclass(table_name)
              AND constraint_row.confrelid <> to_regclass('workspace')
              AND array_length(constraint_row.conkey, 1) = 1
        LOOP
            trigger_name := 'confqual_ws_fk_' || substr(md5(fk.oid::text), 1, 16);
            EXECUTE format('DROP TRIGGER IF EXISTS %I ON %I', trigger_name, table_name);
            EXECUTE format(
                'CREATE TRIGGER %I BEFORE INSERT OR UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION confqual_enforce_workspace_fk(%L, %L, %L)',
                trigger_name,
                table_name,
                fk.child_column,
                fk.parent_table,
                fk.parent_column
            );
        END LOOP;
    END LOOP;
END
$$;

GRANT EXECUTE ON FUNCTION confqual_enforce_workspace_fk() TO confqual_app;

GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO confqual_app;
GRANT EXECUTE ON FUNCTION confqual_current_workspace_id() TO confqual_app;

ALTER TABLE conference_series DROP CONSTRAINT IF EXISTS uq_conference_series_name;
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'uq_conference_series_workspace_name') THEN
        ALTER TABLE conference_series
            ADD CONSTRAINT uq_conference_series_workspace_name UNIQUE (workspace_id, name);
    END IF;
END
$$;

DROP INDEX IF EXISTS uq_researcher_email;
CREATE UNIQUE INDEX IF NOT EXISTS uq_researcher_workspace_email
    ON researcher(workspace_id, email)
    WHERE email IS NOT NULL AND email <> 'hidden';

ALTER TABLE topic DROP CONSTRAINT IF EXISTS topic_name_key;
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'uq_topic_workspace_name') THEN
        ALTER TABLE topic
            ADD CONSTRAINT uq_topic_workspace_name UNIQUE (workspace_id, name);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'uq_settings_workspace') THEN
        ALTER TABLE settings
            ADD CONSTRAINT uq_settings_workspace UNIQUE (workspace_id);
    END IF;
END
$$;

COMMIT;
