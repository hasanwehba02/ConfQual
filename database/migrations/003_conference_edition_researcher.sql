-- Phase 0: Conference/Edition split + Researcher global + Participant bridge
-- Conference (series) vs Edition (year) per UML; Researcher global; Participant = Researcher x Edition

CREATE TABLE IF NOT EXISTS conference_series (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    acronym TEXT,
    UNIQUE(name)
);

CREATE TABLE IF NOT EXISTS edition (
    id SERIAL PRIMARY KEY,
    conference_id INT NOT NULL REFERENCES conference_series(id) ON DELETE CASCADE,
    year INT NOT NULL,
    submission_deadline TIMESTAMP,
    uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(conference_id, year)
);

CREATE TABLE IF NOT EXISTS researcher (
    id SERIAL PRIMARY KEY,
    first_name TEXT NOT NULL,
    last_name TEXT NOT NULL,
    email TEXT,
    country TEXT,
    affiliation TEXT,
    web_page TEXT
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_researcher_email ON researcher(email) WHERE email IS NOT NULL AND email <> 'hidden';

CREATE TABLE IF NOT EXISTS anonymised_researcher (
    researcher_id INT PRIMARY KEY REFERENCES researcher(id) ON DELETE CASCADE,
    anon_name TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS participant_new (
    id SERIAL PRIMARY KEY,
    researcher_id INT NOT NULL REFERENCES researcher(id) ON DELETE CASCADE,
    edition_id INT NOT NULL REFERENCES edition(id) ON DELETE CASCADE,
    external_person_id INT,
    UNIQUE(researcher_id, edition_id),
    UNIQUE(edition_id, external_person_id)
);

-- Backfill conference_series and edition from conference
INSERT INTO conference_series (name, acronym)
SELECT DISTINCT ON (name) name, short_name FROM conference ON CONFLICT (name) DO NOTHING;

INSERT INTO edition (conference_id, year, submission_deadline, uploaded_at)
SELECT cs.id, c.year, c.submission_deadline, c.uploaded_at
FROM conference c JOIN conference_series cs ON cs.name = c.name
ON CONFLICT (conference_id, year) DO NOTHING;

-- Backfill researcher from program_committee_member and author
INSERT INTO researcher (first_name, last_name, email, country, affiliation, web_page)
SELECT DISTINCT ON (LOWER(TRIM(first_name)) || LOWER(TRIM(last_name)) || COALESCE(LOWER(TRIM(email)),''))
       first_name, last_name, NULLIF(TRIM(email), 'hidden'), country, affiliation, NULL
FROM program_committee_member
ON CONFLICT DO NOTHING;

INSERT INTO researcher (first_name, last_name, email, affiliation, web_page)
SELECT DISTINCT ON (LOWER(TRIM(a.first_name)) || LOWER(TRIM(a.last_name)) || COALESCE(LOWER(TRIM(a.email)),''))
       a.first_name, a.last_name, NULLIF(TRIM(a.email), 'hidden'), a.affiliation, a.web_page
FROM author a
WHERE NOT EXISTS (SELECT 1 FROM researcher r WHERE LOWER(TRIM(r.first_name))=LOWER(TRIM(a.first_name)) AND LOWER(TRIM(r.last_name))=LOWER(TRIM(a.last_name)) AND COALESCE(LOWER(TRIM(r.email)),'')=COALESCE(LOWER(TRIM(a.email)),''))
ON CONFLICT DO NOTHING;

-- Backfill participant_new: one per (researcher, edition) where they appeared
INSERT INTO participant_new (researcher_id, edition_id, external_person_id)
SELECT DISTINCT r.id, e.id, pcm.external_person_id
FROM program_committee_member pcm
JOIN conference c ON c.id = pcm.conference_id
JOIN edition e ON e.conference_id = (SELECT id FROM conference_series WHERE name=c.name) AND e.year = c.year
JOIN researcher r ON LOWER(TRIM(r.first_name))=LOWER(TRIM(pcm.first_name)) AND LOWER(TRIM(r.last_name))=LOWER(TRIM(pcm.last_name)) AND COALESCE(LOWER(TRIM(r.email)),'')=COALESCE(LOWER(TRIM(NULLIF(pcm.email,'hidden'))),'')
ON CONFLICT DO NOTHING;

-- Backfill participants for authors via paper_author -> paper -> edition
INSERT INTO participant_new (researcher_id, edition_id)
SELECT DISTINCT r.id, e.id
FROM author a
JOIN paper_author pa ON pa.author_id = a.id
JOIN paper p ON p.id = pa.paper_id
JOIN conference c ON c.id = p.conference_id
JOIN edition e ON e.conference_id = (SELECT id FROM conference_series WHERE name=c.name) AND e.year = c.year
JOIN researcher r ON LOWER(TRIM(r.first_name))=LOWER(TRIM(a.first_name)) AND LOWER(TRIM(r.last_name))=LOWER(TRIM(a.last_name))
ON CONFLICT DO NOTHING;
