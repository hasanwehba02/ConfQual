-- ConfQual Consolidated Database Schema
-- Multi-conference, multi-edition, researcher-centric normalized model

CREATE TABLE conference_series (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    acronym TEXT,
    CONSTRAINT uq_conference_series_name UNIQUE (name)
);

CREATE TABLE edition (
    id SERIAL PRIMARY KEY,
    conference_id INT NOT NULL,
    year INT NOT NULL,
    submission_deadline TIMESTAMP,
    uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_edition_conference
        FOREIGN KEY (conference_id)
        REFERENCES conference_series(id)
        ON DELETE CASCADE,
    CONSTRAINT uq_edition_conference_year UNIQUE (conference_id, year)
);

CREATE TABLE researcher (
    id SERIAL PRIMARY KEY,
    first_name TEXT NOT NULL,
    last_name TEXT NOT NULL,
    email TEXT,
    country TEXT,
    affiliation TEXT,
    web_page TEXT
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_researcher_email ON researcher(email) WHERE email IS NOT NULL AND email <> 'hidden';

CREATE TABLE anonymised_researcher (
    researcher_id INT PRIMARY KEY,
    anon_name TEXT NOT NULL,
    CONSTRAINT fk_anon_researcher
        FOREIGN KEY (researcher_id)
        REFERENCES researcher(id)
        ON DELETE CASCADE
);

CREATE TABLE participant (
    id SERIAL PRIMARY KEY,
    researcher_id INT NOT NULL,
    edition_id INT NOT NULL,
    external_person_id INT,
    CONSTRAINT fk_participant_researcher
        FOREIGN KEY (researcher_id)
        REFERENCES researcher(id)
        ON DELETE CASCADE,
    CONSTRAINT fk_participant_edition
        FOREIGN KEY (edition_id)
        REFERENCES edition(id)
        ON DELETE CASCADE,
    CONSTRAINT uq_participant_researcher_edition UNIQUE (researcher_id, edition_id),
    CONSTRAINT uq_participant_edition_person UNIQUE (edition_id, external_person_id)
);

CREATE TABLE author_participant (
    participant_id INT PRIMARY KEY,
    CONSTRAINT fk_author_participant
        FOREIGN KEY (participant_id)
        REFERENCES participant(id)
        ON DELETE CASCADE
);

CREATE TABLE evaluator (
    participant_id INT PRIMARY KEY,
    evaluator_role TEXT NOT NULL CHECK (evaluator_role IN ('pc_chair', 'pc_member', 'subreviewer')),
    is_senior BOOLEAN NOT NULL DEFAULT false,
    CONSTRAINT fk_evaluator_participant
        FOREIGN KEY (participant_id)
        REFERENCES participant(id)
        ON DELETE CASCADE,
    CONSTRAINT chk_senior_role CHECK (is_senior = false OR evaluator_role = 'pc_member')
);

CREATE TABLE sc_chair (
    participant_id INT PRIMARY KEY,
    mandate_start_year INT NOT NULL,
    mandate_end_year INT NOT NULL,
    CONSTRAINT fk_sc_chair_participant
        FOREIGN KEY (participant_id)
        REFERENCES participant(id)
        ON DELETE CASCADE,
    CONSTRAINT chk_mandate_years CHECK (mandate_end_year >= mandate_start_year)
);

CREATE TABLE person_conflict (
    id SERIAL PRIMARY KEY,
    edition_id INT NOT NULL,
    author_participant_id INT NOT NULL,
    evaluator_participant_id INT NOT NULL,
    declarant TEXT NOT NULL CHECK (declarant IN ('author', 'evaluator')),
    reason TEXT,
    CONSTRAINT fk_pc_edition
        FOREIGN KEY (edition_id)
        REFERENCES edition(id)
        ON DELETE CASCADE,
    CONSTRAINT fk_pc_author
        FOREIGN KEY (author_participant_id)
        REFERENCES author_participant(participant_id)
        ON DELETE CASCADE,
    CONSTRAINT fk_pc_evaluator
        FOREIGN KEY (evaluator_participant_id)
        REFERENCES evaluator(participant_id)
        ON DELETE CASCADE,
    CONSTRAINT uq_person_conflict UNIQUE (edition_id, author_participant_id, evaluator_participant_id, declarant),
    CONSTRAINT chk_conflict_distinct CHECK (author_participant_id <> evaluator_participant_id)
);

CREATE TABLE configuration_information (
    id SERIAL PRIMARY KEY,
    edition_id INT NOT NULL UNIQUE,
    review_deadline DATE,
    min_score INT,
    max_score INT,
    min_expertise INT,
    max_expertise INT,
    nb_reviewers INT,
    possible_cois_authors TEXT[],
    possible_cois_papers TEXT[],
    paper_types TEXT[] NOT NULL DEFAULT '{}',
    metareviewer_recommendations TEXT[] NOT NULL DEFAULT '{}',
    bidding_types TEXT[] NOT NULL DEFAULT '{}',
    other_events TEXT[],
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT fk_config_edition
        FOREIGN KEY (edition_id)
        REFERENCES edition(id)
        ON DELETE CASCADE
);

CREATE TABLE alert_rule (
    id SERIAL PRIMARY KEY,
    edition_id INT NOT NULL,
    rule_key TEXT NOT NULL,
    threshold_value NUMERIC NOT NULL,
    is_enabled BOOLEAN NOT NULL DEFAULT true,
    CONSTRAINT fk_alert_edition
        FOREIGN KEY (edition_id)
        REFERENCES edition(id)
        ON DELETE CASCADE,
    CONSTRAINT uq_alert_edition_rule UNIQUE (edition_id, rule_key)
);

CREATE TABLE topic (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL UNIQUE
);

CREATE TABLE paper (
    id SERIAL PRIMARY KEY,
    edition_id INT NOT NULL,
    external_submission_id INT,
    title TEXT NOT NULL,
    submitted_at TIMESTAMP,
    last_updated_at TIMESTAMP,
    decision TEXT,
    decision_category TEXT,
    notified BOOLEAN,
    reviews_sent BOOLEAN,
    is_deleted BOOLEAN DEFAULT FALSE,
    CONSTRAINT fk_paper_edition
        FOREIGN KEY (edition_id)
        REFERENCES edition(id)
        ON DELETE CASCADE,
    CONSTRAINT uq_paper_edition_submission UNIQUE (edition_id, external_submission_id)
);

CREATE TABLE paper_topic (
    paper_id INT NOT NULL,
    topic_id INT NOT NULL,
    PRIMARY KEY (paper_id, topic_id),
    CONSTRAINT fk_pt_paper
        FOREIGN KEY (paper_id)
        REFERENCES paper(id)
        ON DELETE CASCADE,
    CONSTRAINT fk_pt_topic
        FOREIGN KEY (topic_id)
        REFERENCES topic(id)
        ON DELETE CASCADE
);

CREATE TABLE paper_author_new (
    paper_id INT NOT NULL,
    participant_id INT NOT NULL,
    author_order INT,
    is_corresponding BOOLEAN DEFAULT FALSE,
    PRIMARY KEY (paper_id, participant_id),
    CONSTRAINT fk_pan_paper
        FOREIGN KEY (paper_id)
        REFERENCES paper(id)
        ON DELETE CASCADE,
    CONSTRAINT fk_pan_participant
        FOREIGN KEY (participant_id)
        REFERENCES participant(id)
        ON DELETE CASCADE
);

CREATE TABLE assignment (
    id SERIAL PRIMARY KEY,
    paper_id INT NOT NULL,
    participant_id INT NOT NULL,
    CONSTRAINT fk_assignment_paper
        FOREIGN KEY (paper_id)
        REFERENCES paper(id)
        ON DELETE CASCADE,
    CONSTRAINT fk_assignment_participant
        FOREIGN KEY (participant_id)
        REFERENCES participant(id)
        ON DELETE CASCADE,
    CONSTRAINT uq_assignment UNIQUE (paper_id, participant_id)
);

CREATE TABLE bid (
    id SERIAL PRIMARY KEY,
    paper_id INT NOT NULL,
    participant_id INT NOT NULL,
    bid TEXT,
    CONSTRAINT fk_bid_paper
        FOREIGN KEY (paper_id)
        REFERENCES paper(id)
        ON DELETE CASCADE,
    CONSTRAINT fk_bid_participant
        FOREIGN KEY (participant_id)
        REFERENCES participant(id)
        ON DELETE CASCADE,
    CONSTRAINT uq_bid UNIQUE (paper_id, participant_id)
);

CREATE TABLE conflict (
    id SERIAL PRIMARY KEY,
    paper_id INT NOT NULL,
    participant_id INT NOT NULL,
    CONSTRAINT fk_conflict_paper
        FOREIGN KEY (paper_id)
        REFERENCES paper(id)
        ON DELETE CASCADE,
    CONSTRAINT fk_conflict_participant
        FOREIGN KEY (participant_id)
        REFERENCES participant(id)
        ON DELETE CASCADE,
    CONSTRAINT uq_conflict UNIQUE (paper_id, participant_id)
);

CREATE TABLE review (
    id SERIAL PRIMARY KEY,
    paper_id INT NOT NULL,
    participant_id INT NOT NULL,
    review_number INT,
    version INT,
    review_text TEXT,
    scores TEXT,
    total_score DECIMAL(5,2),
    review_date DATE,
    review_time TIME,
    has_attachment BOOLEAN,
    is_superseded BOOLEAN DEFAULT FALSE,
    sub_reviewer_person_id INT,
    sub_reviewer_first_name TEXT,
    sub_reviewer_last_name TEXT,
    sub_reviewer_email TEXT,
    sentiment_score DECIMAL(5,2),
    CONSTRAINT fk_review_paper
        FOREIGN KEY (paper_id)
        REFERENCES paper(id)
        ON DELETE CASCADE,
    CONSTRAINT fk_review_participant
        FOREIGN KEY (participant_id)
        REFERENCES participant(id)
        ON DELETE CASCADE
);

CREATE TABLE comment (
    id SERIAL PRIMARY KEY,
    paper_id INT NOT NULL,
    participant_id INT NOT NULL,
    comment_text TEXT,
    comment_date DATE,
    comment_time TIME,
    CONSTRAINT fk_comment_paper
        FOREIGN KEY (paper_id)
        REFERENCES paper(id)
        ON DELETE CASCADE,
    CONSTRAINT fk_comment_participant
        FOREIGN KEY (participant_id)
        REFERENCES participant(id)
        ON DELETE CASCADE
);

CREATE TABLE meta_review (
    id SERIAL PRIMARY KEY,
    paper_id INT NOT NULL,
    participant_id INT NOT NULL,
    recommendation TEXT,
    review_text TEXT,
    review_date DATE,
    review_time TIME,
    CONSTRAINT fk_meta_review_paper
        FOREIGN KEY (paper_id)
        REFERENCES paper(id)
        ON DELETE CASCADE,
    CONSTRAINT fk_meta_review_participant
        FOREIGN KEY (participant_id)
        REFERENCES participant(id)
        ON DELETE CASCADE,
    CONSTRAINT uq_meta_review UNIQUE (paper_id)
);

CREATE TABLE note (
    id SERIAL PRIMARY KEY,
    text TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    author_participant_id INT NOT NULL,
    edition_id INT NOT NULL,
    CONSTRAINT fk_note_author_participant
        FOREIGN KEY (author_participant_id)
        REFERENCES participant(id)
        ON DELETE CASCADE,
    CONSTRAINT fk_note_edition
        FOREIGN KEY (edition_id)
        REFERENCES edition(id)
        ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_note_edition_created ON note(edition_id, created_at, id);

CREATE TABLE conference_note (
    note_id INT PRIMARY KEY,
    conference_id INT NOT NULL,
    CONSTRAINT fk_cn_note
        FOREIGN KEY (note_id)
        REFERENCES note(id)
        ON DELETE CASCADE,
    CONSTRAINT fk_cn_conference
        FOREIGN KEY (conference_id)
        REFERENCES conference_series(id)
        ON DELETE RESTRICT
);

CREATE TABLE edition_note (
    note_id INT PRIMARY KEY,
    edition_id INT NOT NULL,
    CONSTRAINT fk_en_note
        FOREIGN KEY (note_id)
        REFERENCES note(id)
        ON DELETE CASCADE,
    CONSTRAINT fk_en_edition
        FOREIGN KEY (edition_id)
        REFERENCES edition(id)
        ON DELETE RESTRICT
);

CREATE TABLE topic_note (
    note_id INT PRIMARY KEY,
    topic_id INT NOT NULL,
    CONSTRAINT fk_tn_note
        FOREIGN KEY (note_id)
        REFERENCES note(id)
        ON DELETE CASCADE,
    CONSTRAINT fk_tn_topic
        FOREIGN KEY (topic_id)
        REFERENCES topic(id)
        ON DELETE RESTRICT
);

CREATE TABLE author_note (
    note_id INT PRIMARY KEY,
    author_participant_id INT NOT NULL,
    CONSTRAINT fk_an_note
        FOREIGN KEY (note_id)
        REFERENCES note(id)
        ON DELETE CASCADE,
    CONSTRAINT fk_an_author
        FOREIGN KEY (author_participant_id)
        REFERENCES author_participant(participant_id)
        ON DELETE RESTRICT
);

CREATE TABLE paper_note (
    note_id INT PRIMARY KEY,
    paper_id INT NOT NULL,
    CONSTRAINT fk_pn_note
        FOREIGN KEY (note_id)
        REFERENCES note(id)
        ON DELETE CASCADE,
    CONSTRAINT fk_pn_paper
        FOREIGN KEY (paper_id)
        REFERENCES paper(id)
        ON DELETE RESTRICT
);

CREATE TABLE researcher_note (
    note_id INT PRIMARY KEY,
    researcher_id INT NOT NULL,
    CONSTRAINT fk_rn_note
        FOREIGN KEY (note_id)
        REFERENCES note(id)
        ON DELETE CASCADE,
    CONSTRAINT fk_rn_researcher
        FOREIGN KEY (researcher_id)
        REFERENCES researcher(id)
        ON DELETE RESTRICT
);

CREATE TABLE participant_note (
    note_id INT PRIMARY KEY,
    participant_id INT NOT NULL,
    CONSTRAINT fk_ptn_note
        FOREIGN KEY (note_id)
        REFERENCES note(id)
        ON DELETE CASCADE,
    CONSTRAINT fk_ptn_participant
        FOREIGN KEY (participant_id)
        REFERENCES participant(id)
        ON DELETE RESTRICT
);

CREATE TABLE assignment_note (
    note_id INT PRIMARY KEY,
    assignment_id INT NOT NULL,
    CONSTRAINT fk_asn_note
        FOREIGN KEY (note_id)
        REFERENCES note(id)
        ON DELETE CASCADE,
    CONSTRAINT fk_asn_assignment
        FOREIGN KEY (assignment_id)
        REFERENCES assignment(id)
        ON DELETE RESTRICT
);

CREATE TABLE review_note (
    note_id INT PRIMARY KEY,
    review_id INT NOT NULL,
    CONSTRAINT fk_rvn_note
        FOREIGN KEY (note_id)
        REFERENCES note(id)
        ON DELETE CASCADE,
    CONSTRAINT fk_rvn_review
        FOREIGN KEY (review_id)
        REFERENCES review(id)
        ON DELETE RESTRICT
);

CREATE TABLE comment_note (
    note_id INT PRIMARY KEY,
    comment_id INT NOT NULL,
    CONSTRAINT fk_cmn_note
        FOREIGN KEY (note_id)
        REFERENCES note(id)
        ON DELETE CASCADE,
    CONSTRAINT fk_cmn_comment
        FOREIGN KEY (comment_id)
        REFERENCES comment(id)
        ON DELETE RESTRICT
);

CREATE TABLE decision_note (
    note_id INT PRIMARY KEY,
    paper_id INT NOT NULL,
    CONSTRAINT fk_dcn_note
        FOREIGN KEY (note_id)
        REFERENCES note(id)
        ON DELETE CASCADE,
    CONSTRAINT fk_dcn_paper
        FOREIGN KEY (paper_id)
        REFERENCES paper(id)
        ON DELETE RESTRICT
);

CREATE TABLE settings (
    id SERIAL PRIMARY KEY,
    is_anonymized BOOLEAN DEFAULT false,
    anonymization_prefix TEXT DEFAULT 'CAiSE_26_Tech',
    decision_editing_enabled BOOLEAN DEFAULT false
);
