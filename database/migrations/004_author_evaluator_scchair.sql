-- Phase 1: Author / Evaluator / SC Chair specializations + Paper-Author order
-- Author and Evaluator are non-exclusive specializations of Participant; SC Chair is 3rd specialization

CREATE TABLE IF NOT EXISTS author_participant (
    participant_id INT PRIMARY KEY REFERENCES participant_new(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS evaluator (
    participant_id INT PRIMARY KEY REFERENCES participant_new(id) ON DELETE CASCADE,
    evaluator_role TEXT NOT NULL CHECK (evaluator_role IN ('pc_chair','pc_member','subreviewer')),
    is_senior BOOLEAN NOT NULL DEFAULT false,
    CHECK (is_senior = false OR evaluator_role = 'pc_member')
);

CREATE TABLE IF NOT EXISTS sc_chair (
    participant_id INT PRIMARY KEY REFERENCES participant_new(id) ON DELETE CASCADE,
    mandate_start_year INT NOT NULL,
    mandate_end_year INT NOT NULL,
    CHECK (mandate_end_year >= mandate_start_year)
);

-- Paper-Author ordering: ensure column exists (already in schema, keep is_corresponding there)
ALTER TABLE paper_author ADD COLUMN IF NOT EXISTS author_order INT;

-- Backfill author_participant from authors via participant_new
INSERT INTO author_participant (participant_id)
SELECT DISTINCT pn.id
FROM author a
JOIN paper_author pa ON pa.author_id = a.id
JOIN paper p ON p.id = pa.paper_id
JOIN conference c ON c.id = p.conference_id
JOIN edition e ON e.conference_id = (SELECT id FROM conference_series WHERE name=c.name) AND e.year = c.year
JOIN researcher r ON LOWER(TRIM(r.first_name))=LOWER(TRIM(a.first_name)) AND LOWER(TRIM(r.last_name))=LOWER(TRIM(a.last_name))
JOIN participant_new pn ON pn.researcher_id = r.id AND pn.edition_id = e.id
ON CONFLICT DO NOTHING;

-- Backfill evaluator from program_committee_member with role normalization
INSERT INTO evaluator (participant_id, evaluator_role, is_senior)
SELECT pn.id,
       CASE
         WHEN LOWER(TRIM(pcm.role)) IN ('pc member','pc_member') THEN 'pc_member'
         WHEN LOWER(TRIM(pcm.role)) IN ('subreviewer','sub-reviewer','sub reviewer') THEN 'subreviewer'
         WHEN LOWER(TRIM(pcm.role)) IN ('chair','pc chair','pc_chair') THEN 'pc_chair'
         WHEN LOWER(TRIM(pcm.role)) IN ('senior pc member','senior_pc_member') THEN 'pc_member'
         ELSE 'pc_member'
       END,
       CASE WHEN LOWER(TRIM(pcm.role)) = 'senior pc member' THEN true ELSE false END
FROM program_committee_member pcm
JOIN conference c ON c.id = pcm.conference_id
JOIN edition e ON e.conference_id = (SELECT id FROM conference_series WHERE name=c.name) AND e.year = c.year
JOIN researcher r ON LOWER(TRIM(r.first_name))=LOWER(TRIM(pcm.first_name)) AND LOWER(TRIM(r.last_name))=LOWER(TRIM(pcm.last_name))
JOIN participant_new pn ON pn.researcher_id = r.id AND pn.edition_id = e.id
ON CONFLICT DO NOTHING;

-- Backfill paper_author.author_order where NULL (use row order per paper)
WITH ordered AS (
  SELECT pa.paper_id, pa.author_id,
         ROW_NUMBER() OVER (PARTITION BY pa.paper_id ORDER BY pa.paper_id, pa.author_id) AS rn
  FROM paper_author pa WHERE pa.author_order IS NULL
)
UPDATE paper_author pa SET author_order = o.rn FROM ordered o
WHERE pa.paper_id = o.paper_id AND pa.author_id = o.author_id AND pa.author_order IS NULL;
