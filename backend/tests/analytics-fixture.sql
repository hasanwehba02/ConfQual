-- Load only into a disposable test database after the workspace migration.
DO $$
DECLARE
    series_id integer;
    edition_id integer;
    researcher_id integer;
    participant_id integer;
    paper_id integer;
    paper_topic_id integer;
    reviewer_topic_id integer;
BEGIN
    INSERT INTO conference_series (name, acronym)
    VALUES ('Test conference', 'TEST') RETURNING id INTO series_id;
    INSERT INTO edition (conference_id, year)
    VALUES (series_id, 2026) RETURNING id INTO edition_id;
    INSERT INTO researcher (first_name, last_name, email)
    VALUES ('Test', 'Reviewer', 'reviewer@example.test') RETURNING id INTO researcher_id;
    INSERT INTO participant (researcher_id, edition_id, external_person_id)
    VALUES (researcher_id, edition_id, 1) RETURNING id INTO participant_id;
    INSERT INTO evaluator (participant_id, evaluator_role) VALUES (participant_id, 'pc_member');
    INSERT INTO paper (edition_id, external_submission_id, title)
    VALUES (edition_id, 1, 'Test paper') RETURNING id INTO paper_id;
    INSERT INTO topic (name) VALUES ('Paper topic') RETURNING id INTO paper_topic_id;
    INSERT INTO topic (name) VALUES ('Reviewer topic') RETURNING id INTO reviewer_topic_id;
    INSERT INTO paper_topic (paper_id, topic_id) VALUES (paper_id, paper_topic_id);
    INSERT INTO participant_topic (participant_id, topic_id) VALUES (participant_id, reviewer_topic_id);
    INSERT INTO assignment (paper_id, participant_id) VALUES (paper_id, participant_id);
    INSERT INTO review (paper_id, participant_id, review_number, review_text, total_score)
    VALUES (paper_id, participant_id, 1, 'A test review.', 3);
END $$;
