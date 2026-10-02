-- Rollback removes isolation metadata but preserves domain rows.
-- Run only after stopping application and confirming no two workspaces contain
-- conflicting conference names, researcher emails, or topic names.
BEGIN;

DO $$
DECLARE
    table_name TEXT;
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
        EXECUTE format('DROP POLICY IF EXISTS workspace_isolation ON %I', table_name);
        EXECUTE format('ALTER TABLE %I DISABLE ROW LEVEL SECURITY', table_name);
        EXECUTE format('ALTER TABLE %I DROP COLUMN IF EXISTS workspace_id CASCADE', table_name);
    END LOOP;
END
$$;

DROP FUNCTION IF EXISTS confqual_enforce_workspace_fk() CASCADE;

ALTER TABLE conference_series
    ADD CONSTRAINT uq_conference_series_name UNIQUE (name);
CREATE UNIQUE INDEX uq_researcher_email
    ON researcher(email)
    WHERE email IS NOT NULL AND email <> 'hidden';
ALTER TABLE topic
    ADD CONSTRAINT topic_name_key UNIQUE (name);

DROP FUNCTION IF EXISTS confqual_current_workspace_id();
DROP TABLE IF EXISTS workspace_member;
DROP TABLE IF EXISTS workspace;
REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA public FROM confqual_app;
REVOKE ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public FROM confqual_app;
REVOKE USAGE ON SCHEMA public FROM confqual_app;
REVOKE confqual_app FROM CURRENT_USER;
DROP ROLE IF EXISTS confqual_app;

COMMIT;
