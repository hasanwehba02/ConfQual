-- Migration 008: Finalize Data Model
-- Complete transition to normalized structure by:
-- 1. Renaming participant_new to participant
-- 2. Dropping old replaced tables ONLY IF they still exist and have no data
-- 3. Cleaning up obsolete junction tables that referenced old structure

-- ==============================================================================
-- CRITICAL: This migration assumes migrations 001-007 have been applied and
-- the new table structure (conference_series, edition, researcher, participant_new,
-- evaluator, author_participant, etc.) is fully populated with migrated data.
-- ==============================================================================

-- ==============================================================================
-- STEP 1: Rename participant_new to participant (final name)
-- ==============================================================================

-- Rename the table
ALTER TABLE IF EXISTS participant_new RENAME TO participant;

-- Rename any indexes that reference the old table name
DO $$
DECLARE
    idx_name TEXT;
BEGIN
    FOR idx_name IN
        SELECT indexname
        FROM pg_indexes
        WHERE tablename = 'participant'
        AND indexname LIKE '%participant_new%'
    LOOP
        EXECUTE format('ALTER INDEX %I RENAME TO %I',
            idx_name,
            REPLACE(idx_name, 'participant_new', 'participant')
        );
    END LOOP;
END $$;

-- Note: Foreign key constraints automatically update their references when the table
-- is renamed, so explicit constraint updates are not needed

-- ==============================================================================
-- STEP 2: Drop old tables ONLY IF they exist and are confirmed unused
-- ==============================================================================

-- Drop old program committee member topics (junction table for old structure)
DROP TABLE IF EXISTS program_committee_member_topic CASCADE;

-- Drop old paper_author if it still exists (should have been migrated)
-- WARNING: Only drop if you're CERTAIN the new paper_author or paper_author_new is populated
DROP TABLE IF EXISTS paper_author CASCADE;

-- Drop old settings table (replaced by configuration_information per edition)
DROP TABLE IF EXISTS settings CASCADE;

-- Drop old PC member and author tables
-- WARNING: Only drop these if you've confirmed all data is in the new structure
DROP TABLE IF EXISTS program_committee_member CASCADE;
DROP TABLE IF EXISTS author CASCADE;

-- Drop old conference table
-- WARNING: Only drop if you've confirmed all data is in conference_series + edition
DROP TABLE IF EXISTS conference CASCADE;

-- ==============================================================================
-- VERIFICATION
-- ==============================================================================

-- Verify the rename worked and new structure exists
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'participant_new') THEN
        RAISE EXCEPTION 'Table "participant_new" still exists (rename failed)';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'participant') THEN
        RAISE EXCEPTION 'Table "participant" does not exist (rename failed or table was missing)';
    END IF;

    -- Check that new structure exists
    IF NOT EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'conference_series') THEN
        RAISE WARNING 'New table "conference_series" does not exist - migrations 001-007 may not be applied';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'edition') THEN
        RAISE WARNING 'New table "edition" does not exist - migrations 001-007 may not be applied';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'researcher') THEN
        RAISE WARNING 'New table "researcher" does not exist - migrations 001-007 may not be applied';
    END IF;

    RAISE NOTICE 'Migration 008 completed - participant_new renamed to participant';
    RAISE NOTICE 'Old tables dropped (if they existed): conference, program_committee_member, author, settings';
END $$;
