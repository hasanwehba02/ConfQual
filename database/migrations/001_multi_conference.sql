-- Migration 001: Multi-conference support
-- Converts globally unique external IDs to conference-scoped unique pairs.
-- Safe to run on an existing database; no data is destroyed.

-- 1. program_committee_member: drop global UNIQUE, add composite UNIQUE per conference
ALTER TABLE program_committee_member
    DROP CONSTRAINT IF EXISTS program_committee_member_external_person_id_key;

ALTER TABLE program_committee_member
    ADD CONSTRAINT uq_pcm_conference_person
        UNIQUE (conference_id, external_person_id);

-- 2. paper: drop global UNIQUE, add composite UNIQUE per conference
ALTER TABLE paper
    DROP CONSTRAINT IF EXISTS paper_external_submission_id_key;

ALTER TABLE paper
    ADD CONSTRAINT uq_paper_conference_submission
        UNIQUE (conference_id, external_submission_id);

-- 3. author: drop global UNIQUE on external_person_id (authors can appear across conferences)
ALTER TABLE author
    DROP CONSTRAINT IF EXISTS author_external_person_id_key;

-- 4. author: add web_page column if it doesn't already exist
ALTER TABLE author
    ADD COLUMN IF NOT EXISTS web_page TEXT;

-- 5. conference: add short_name and year columns if not present
ALTER TABLE conference
    ADD COLUMN IF NOT EXISTS short_name TEXT;
ALTER TABLE conference
    ADD COLUMN IF NOT EXISTS year INT;
