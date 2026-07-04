CREATE TABLE conference (
    id SERIAL PRIMARY KEY,

    name VARCHAR(255) NOT NULL,

    short_name VARCHAR(100),

    year INT,

    uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);


CREATE TABLE program_committee_member (
    id SERIAL PRIMARY KEY,

    conference_id INT NOT NULL,

    external_person_id INT UNIQUE,

    first_name VARCHAR(100) NOT NULL,

    last_name VARCHAR(100) NOT NULL,

    email VARCHAR(255),

    affiliation VARCHAR(255),

    country VARCHAR(100),

   role VARCHAR(100) NOT NULL,

    CONSTRAINT fk_pcm_conference
        FOREIGN KEY (conference_id)
        REFERENCES conference(id)
        ON DELETE CASCADE
);


CREATE TABLE paper (
    id SERIAL PRIMARY KEY,

    conference_id INT NOT NULL,

    external_submission_id INT UNIQUE,

    title TEXT NOT NULL,

    submitted_at TIMESTAMP,

    last_updated_at TIMESTAMP,

    decision VARCHAR(100),

    notified BOOLEAN,

    reviews_sent BOOLEAN,

    CONSTRAINT fk_paper_conference
        FOREIGN KEY (conference_id)
        REFERENCES conference(id)
        ON DELETE CASCADE
);


CREATE TABLE author (
    id SERIAL PRIMARY KEY,

    external_person_id INT UNIQUE,

    first_name VARCHAR(100) NOT NULL,

    last_name VARCHAR(100) NOT NULL,

    email VARCHAR(255),

    affiliation VARCHAR(255),

    country VARCHAR(100)
);


CREATE TABLE paper_author (
    paper_id INT NOT NULL,

    author_id INT NOT NULL,

    author_order INT,

    is_corresponding BOOLEAN DEFAULT FALSE,

    PRIMARY KEY (paper_id, author_id),

    CONSTRAINT fk_pa_paper
        FOREIGN KEY (paper_id)
        REFERENCES paper(id)
        ON DELETE CASCADE,

    CONSTRAINT fk_pa_author
        FOREIGN KEY (author_id)
        REFERENCES author(id)
);


CREATE TABLE topic (
    id SERIAL PRIMARY KEY,

    name VARCHAR(255) NOT NULL UNIQUE
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

    bid VARCHAR(50),

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

    recommendation VARCHAR(100),

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