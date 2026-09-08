const client = require("../config/database");

/**
 * editionRepository.js
 * Manages editions and conference series (replaces old conference table)
 * conference_series = recurring conference (e.g., "CAiSE")
 * edition = year-specific instance (e.g., "CAiSE 2025")
 */

/**
 * Find or create conference series by name
 */
async function findOrCreateConferenceSeries({ name, acronym }) {
    const existing = await client.query(
        `SELECT * FROM conference_series WHERE name = $1`,
        [name]
    );

    if (existing.rows.length > 0) {
        return existing.rows[0];
    }

    const result = await client.query(
        `INSERT INTO conference_series (name, acronym)
         VALUES ($1, $2)
         RETURNING *`,
        [name, acronym || null]
    );

    return result.rows[0];
}

/**
 * Find or create edition for a conference series and year
 */
async function findOrCreateEdition({ conferenceId, year, submissionDeadline }) {
    const existing = await client.query(
        `SELECT * FROM edition WHERE conference_id = $1 AND year = $2`,
        [conferenceId, year]
    );

    if (existing.rows.length > 0) {
        return existing.rows[0];
    }

    const result = await client.query(
        `INSERT INTO edition (conference_id, year, submission_deadline, uploaded_at)
         VALUES ($1, $2, $3, CURRENT_TIMESTAMP)
         RETURNING *`,
        [conferenceId, year, submissionDeadline || null]
    );

    return result.rows[0];
}

/**
 * List all editions with their series info
 */
async function listEditions() {
    const result = await client.query(`
        SELECT
            e.id,
            e.year,
            e.submission_deadline,
            e.uploaded_at,
            cs.name AS conference_name,
            cs.acronym AS short_name,
            (SELECT COUNT(*) FROM paper WHERE edition_id = e.id AND is_deleted = false) AS total_papers,
            (SELECT COUNT(DISTINCT p.id) FROM participant p
             JOIN evaluator ev ON ev.participant_id = p.id
             WHERE p.edition_id = e.id) AS total_reviewers
        FROM edition e
        JOIN conference_series cs ON cs.id = e.conference_id
        ORDER BY e.uploaded_at DESC
    `);
    return result.rows;
}

/**
 * Get edition by ID with series info
 */
async function getEditionById(editionId) {
    const result = await client.query(`
        SELECT e.*, cs.name AS conference_name, cs.acronym
        FROM edition e
        JOIN conference_series cs ON cs.id = e.conference_id
        WHERE e.id = $1
    `, [editionId]);
    return result.rows[0];
}

/**
 * Get comparison metrics for all editions
 */
async function getComparisonMetrics() {
    const result = await client.query(`
        SELECT
            e.id,
            cs.name,
            cs.acronym AS short_name,
            e.year,
            e.uploaded_at,
            COUNT(DISTINCT p.id) FILTER (WHERE p.is_deleted = false) AS total_papers,
            COUNT(DISTINCT p.id) FILTER (WHERE p.decision_category = 'accept') AS accepted_papers,
            COUNT(DISTINCT part.id) FILTER (WHERE ev.participant_id IS NOT NULL) AS total_reviewers,
            COUNT(DISTINCT r.id) FILTER (WHERE r.is_superseded = false) AS total_reviews,
            ROUND(AVG(r.total_score) FILTER (WHERE r.is_superseded = false), 2) AS avg_review_score,
            ROUND(AVG(LENGTH(r.review_text) - LENGTH(REPLACE(r.review_text, ' ', '')) + 1)
                FILTER (WHERE r.is_superseded = false AND r.review_text IS NOT NULL), 1) AS avg_word_count
        FROM edition e
        JOIN conference_series cs ON cs.id = e.conference_id
        LEFT JOIN paper p ON p.edition_id = e.id
        LEFT JOIN participant part ON part.edition_id = e.id
        LEFT JOIN evaluator ev ON ev.participant_id = part.id
        LEFT JOIN review r ON r.paper_id = p.id
        GROUP BY e.id, cs.name, cs.acronym, e.year, e.uploaded_at
        ORDER BY e.year ASC NULLS LAST, e.uploaded_at ASC
    `);
    return result.rows;
}

/**
 * Delete edition (and all its data via CASCADE)
 */
async function deleteEdition(editionId) {
    return await client.withTransaction(async () => {
        // Delete papers first (which cascades to reviews, assignments, etc.)
        await client.query(`DELETE FROM paper WHERE edition_id = $1`, [editionId]);

        // Delete participants (which cascades to evaluator, author_participant, etc.)
        await client.query(`DELETE FROM participant WHERE edition_id = $1`, [editionId]);

        // Finally delete the edition
        const res = await client.query(`DELETE FROM edition WHERE id = $1 RETURNING id`, [editionId]);
        return res.rows.length > 0;
    });
}

/**
 * Update edition
 */
async function updateEdition(editionId, { year, submissionDeadline }) {
    const result = await client.query(
        `UPDATE edition
         SET year = COALESCE($1, year),
             submission_deadline = COALESCE($2, submission_deadline)
         WHERE id = $3
         RETURNING *`,
        [year, submissionDeadline, editionId]
    );
    return result.rows[0];
}

/**
 * Update conference series
 */
async function updateConferenceSeries(seriesId, { name, acronym }) {
    const result = await client.query(
        `UPDATE conference_series
         SET name = COALESCE($1, name),
             acronym = COALESCE($2, acronym)
         WHERE id = $3
         RETURNING *`,
        [name, acronym, seriesId]
    );
    return result.rows[0];
}

module.exports = {
    findOrCreateConferenceSeries,
    findOrCreateEdition,
    listEditions,
    getEditionById,
    getComparisonMetrics,
    deleteEdition,
    updateEdition,
    updateConferenceSeries
};
