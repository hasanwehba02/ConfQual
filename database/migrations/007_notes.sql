-- Phase 5: Notes — general + 11 per-concept tables, {disjoint, complete}, ordered, survive re-import

CREATE TABLE IF NOT EXISTS note (
    id SERIAL PRIMARY KEY,
    text TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    author_participant_id INT NOT NULL REFERENCES participant_new(id),
    edition_id INT NOT NULL REFERENCES edition(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_note_edition_created ON note(edition_id, created_at, id);

CREATE TABLE IF NOT EXISTS conference_note   (note_id INT PRIMARY KEY REFERENCES note(id) ON DELETE CASCADE, conference_id INT NOT NULL REFERENCES conference_series(id) ON DELETE RESTRICT);
CREATE TABLE IF NOT EXISTS edition_note      (note_id INT PRIMARY KEY REFERENCES note(id) ON DELETE CASCADE, edition_id INT NOT NULL REFERENCES edition(id) ON DELETE RESTRICT);
CREATE TABLE IF NOT EXISTS topic_note        (note_id INT PRIMARY KEY REFERENCES note(id) ON DELETE CASCADE, topic_id INT NOT NULL REFERENCES topic(id) ON DELETE RESTRICT);
CREATE TABLE IF NOT EXISTS author_note       (note_id INT PRIMARY KEY REFERENCES note(id) ON DELETE CASCADE, author_participant_id INT NOT NULL REFERENCES author_participant(participant_id) ON DELETE RESTRICT);
CREATE TABLE IF NOT EXISTS paper_note        (note_id INT PRIMARY KEY REFERENCES note(id) ON DELETE CASCADE, paper_id INT NOT NULL REFERENCES paper(id) ON DELETE RESTRICT);
CREATE TABLE IF NOT EXISTS researcher_note   (note_id INT PRIMARY KEY REFERENCES note(id) ON DELETE CASCADE, researcher_id INT NOT NULL REFERENCES researcher(id) ON DELETE RESTRICT);
CREATE TABLE IF NOT EXISTS participant_note  (note_id INT PRIMARY KEY REFERENCES note(id) ON DELETE CASCADE, participant_id INT NOT NULL REFERENCES participant_new(id) ON DELETE RESTRICT);
CREATE TABLE IF NOT EXISTS assignment_note   (note_id INT PRIMARY KEY REFERENCES note(id) ON DELETE CASCADE, assignment_id INT NOT NULL REFERENCES assignment(id) ON DELETE RESTRICT);
CREATE TABLE IF NOT EXISTS review_note       (note_id INT PRIMARY KEY REFERENCES note(id) ON DELETE CASCADE, review_id INT NOT NULL REFERENCES review(id) ON DELETE RESTRICT);
CREATE TABLE IF NOT EXISTS comment_note      (note_id INT PRIMARY KEY REFERENCES note(id) ON DELETE CASCADE, comment_id INT NOT NULL REFERENCES comment(id) ON DELETE RESTRICT);
CREATE TABLE IF NOT EXISTS decision_note     (note_id INT PRIMARY KEY REFERENCES note(id) ON DELETE CASCADE, paper_id INT NOT NULL REFERENCES paper(id) ON DELETE RESTRICT);
