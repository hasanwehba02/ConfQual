-- Phase 2: CoI — keep paper-level (EasyChair via bidding CONFLICT) + prepare person-level (HotCRP future)
-- Author <-> Evaluator directional, with reason

CREATE TABLE IF NOT EXISTS person_conflict (
    id SERIAL PRIMARY KEY,
    edition_id INT NOT NULL REFERENCES edition(id) ON DELETE CASCADE,
    author_participant_id INT NOT NULL REFERENCES author_participant(participant_id) ON DELETE CASCADE,
    evaluator_participant_id INT NOT NULL REFERENCES evaluator(participant_id) ON DELETE CASCADE,
    declarant TEXT NOT NULL CHECK (declarant IN ('author','evaluator')),
    reason TEXT,
    UNIQUE(edition_id, author_participant_id, evaluator_participant_id, declarant),
    CHECK (author_participant_id <> evaluator_participant_id)
);
