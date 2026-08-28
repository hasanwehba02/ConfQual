-- Phase 3: Configuration Information per Edition (11 explicit typed attributes, per UML)
-- Some values imported from EasyChair (score, expertise, topics), rest PC-Chair-defined; manual values survive re-import (ask confirmation if imported values change)

CREATE TABLE IF NOT EXISTS configuration_information (
    id SERIAL PRIMARY KEY,
    edition_id INT NOT NULL REFERENCES edition(id) ON DELETE CASCADE UNIQUE,
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
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
