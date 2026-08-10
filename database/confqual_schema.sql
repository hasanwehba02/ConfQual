CREATE TABLE conference (
    id SERIAL PRIMARY KEY,

    name TEXT NOT NULL,

    short_name TEXT,

    year INT,

    submission_deadline TIMESTAMP,

    uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);


CREATE TABLE program_committee_member (
    id SERIAL PRIMARY KEY,

    conference_id INT NOT NULL,

    external_person_id INT,

    first_name TEXT NOT NULL,

    last_name TEXT NOT NULL,

    email TEXT,

    affiliation TEXT,

    country TEXT,

   role TEXT NOT NULL,

    CONSTRAINT fk_pcm_conference
        FOREIGN KEY (conference_id)
        REFERENCES conference(id)
        ON DELETE CASCADE,

    CONSTRAINT uq_pcm_conference_person
        UNIQUE (conference_id, external_person_id)
);


CREATE TABLE paper (
    id SERIAL PRIMARY KEY,

    conference_id INT NOT NULL,

    external_submission_id INT,

    title TEXT NOT NULL,

    submitted_at TIMESTAMP,

    last_updated_at TIMESTAMP,

    decision TEXT,

    decision_category TEXT,

    notified BOOLEAN,

    reviews_sent BOOLEAN,

    is_deleted BOOLEAN DEFAULT FALSE,

    CONSTRAINT fk_paper_conference
        FOREIGN KEY (conference_id)
        REFERENCES conference(id)
        ON DELETE CASCADE,

    CONSTRAINT uq_paper_conference_submission
        UNIQUE (conference_id, external_submission_id)
);


CREATE TABLE topic (
    id SERIAL PRIMARY KEY,

    name TEXT NOT NULL UNIQUE
);


CREATE TABLE program_committee_member_topic (
    program_committee_member_id INT NOT NULL,

    topic_id INT NOT NULL,

    PRIMARY KEY (program_committee_member_id, topic_id),

    CONSTRAINT fk_pcmt_pcm
        FOREIGN KEY (program_committee_member_id)
        REFERENCES program_committee_member(id)
        ON DELETE CASCADE,

    CONSTRAINT fk_pcmt_topic
        FOREIGN KEY (topic_id)
        REFERENCES topic(id)
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
);


CREATE TABLE assignment (
    id SERIAL PRIMARY KEY,

    paper_id INT NOT NULL,

    program_committee_member_id INT NOT NULL,

    CONSTRAINT fk_assignment_paper
        FOREIGN KEY (paper_id)
        REFERENCES paper(id)
        ON DELETE CASCADE,

    CONSTRAINT fk_assignment_pcm
        FOREIGN KEY (program_committee_member_id)
        REFERENCES program_committee_member(id),

    CONSTRAINT uq_assignment
        UNIQUE (paper_id, program_committee_member_id)
);


CREATE TABLE bid (
    id SERIAL PRIMARY KEY,

    paper_id INT NOT NULL,

    program_committee_member_id INT NOT NULL,

    bid TEXT,

    CONSTRAINT fk_bid_paper
        FOREIGN KEY (paper_id)
        REFERENCES paper(id)
        ON DELETE CASCADE,

    CONSTRAINT fk_bid_pcm
        FOREIGN KEY (program_committee_member_id)
        REFERENCES program_committee_member(id),

    CONSTRAINT uq_bid
        UNIQUE (paper_id, program_committee_member_id)
);


CREATE TABLE conflict (
    id SERIAL PRIMARY KEY,

    paper_id INT NOT NULL,

    program_committee_member_id INT NOT NULL,

    CONSTRAINT fk_conflict_paper
        FOREIGN KEY (paper_id)
        REFERENCES paper(id)
        ON DELETE CASCADE,

    CONSTRAINT fk_conflict_pcm
        FOREIGN KEY (program_committee_member_id)
        REFERENCES program_committee_member(id),

    CONSTRAINT uq_conflict
        UNIQUE (paper_id, program_committee_member_id)
);


CREATE TABLE review (
    id SERIAL PRIMARY KEY,

    paper_id INT NOT NULL,

    program_committee_member_id INT NOT NULL,

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

    CONSTRAINT fk_review_pcm
        FOREIGN KEY (program_committee_member_id)
        REFERENCES program_committee_member(id)
);


CREATE TABLE comment (
    id SERIAL PRIMARY KEY,

    paper_id INT NOT NULL,

    program_committee_member_id INT NOT NULL,

    comment_text TEXT,

    comment_date DATE,

    comment_time TIME,

    CONSTRAINT fk_comment_paper
        FOREIGN KEY (paper_id)
        REFERENCES paper(id)
        ON DELETE CASCADE,

    CONSTRAINT fk_comment_pcm
        FOREIGN KEY (program_committee_member_id)
        REFERENCES program_committee_member(id)
);


CREATE TABLE meta_review (
    id SERIAL PRIMARY KEY,

    paper_id INT NOT NULL,

    program_committee_member_id INT NOT NULL,

    recommendation TEXT,

    review_text TEXT,

    review_date DATE,

    review_time TIME,

    CONSTRAINT fk_meta_review_paper
        FOREIGN KEY (paper_id)
        REFERENCES paper(id)
        ON DELETE CASCADE,

    CONSTRAINT fk_meta_review_pcm
        FOREIGN KEY (program_committee_member_id)
        REFERENCES program_committee_member(id),

    CONSTRAINT uq_meta_review
        UNIQUE (paper_id)
);

CREATE TABLE settings (
    id SERIAL PRIMARY KEY,
    is_anonymized BOOLEAN DEFAULT false,
    anonymization_prefix TEXT DEFAULT 'CAiSE_26_Tech',
    decision_editing_enabled BOOLEAN DEFAULT false
);

CREATE TABLE author (
    id SERIAL PRIMARY KEY,
    external_person_id INT,
    first_name TEXT NOT NULL,
    last_name TEXT NOT NULL,
    email TEXT,
    country TEXT,
    affiliation TEXT,
    web_page TEXT
);

CREATE TABLE paper_author (
    paper_id INT NOT NULL,
    author_id INT NOT NULL,
    author_order INT,
    is_corresponding BOOLEAN DEFAULT false,
    PRIMARY KEY (paper_id, author_id),
    CONSTRAINT fk_pa_paper
        FOREIGN KEY (paper_id)
        REFERENCES paper(id)
        ON DELETE CASCADE,
    CONSTRAINT fk_pa_author
        FOREIGN KEY (author_id)
        REFERENCES author(id)
        ON DELETE CASCADE
);
