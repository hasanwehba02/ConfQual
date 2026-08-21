const client = require("../config/database");

async function listConferences() {
    const result = await client.query(`
        SELECT id, name, short_name, year, uploaded_at,
            (SELECT COUNT(*) FROM paper WHERE conference_id = c.id AND is_deleted = false) AS total_papers,
            (SELECT COUNT(*) FROM program_committee_member WHERE conference_id = c.id) AS total_reviewers
        FROM conference c
        ORDER BY uploaded_at DESC
    `);
    return result.rows;
}

async function getComparisonMetrics() {
    const result = await client.query(`
        SELECT
            c.id,
            c.name,
            c.short_name,
            c.year,
            c.uploaded_at,
            COUNT(DISTINCT p.id) FILTER (WHERE p.is_deleted = false) AS total_papers,
            COUNT(DISTINCT p.id) FILTER (WHERE p.decision_category = 'accept') AS accepted_papers,
            COUNT(DISTINCT pcm.id) AS total_reviewers,
            COUNT(DISTINCT r.id) FILTER (WHERE r.is_superseded = false) AS total_reviews,
            ROUND(AVG(r.total_score) FILTER (WHERE r.is_superseded = false), 2) AS avg_review_score,
            ROUND(AVG(LENGTH(r.review_text) - LENGTH(REPLACE(r.review_text, ' ', '')) + 1) 
                FILTER (WHERE r.is_superseded = false AND r.review_text IS NOT NULL), 1) AS avg_word_count
        FROM conference c
        LEFT JOIN paper p ON p.conference_id = c.id
        LEFT JOIN program_committee_member pcm ON pcm.conference_id = c.id
        LEFT JOIN review r ON r.paper_id = p.id
        GROUP BY c.id, c.name, c.short_name, c.year, c.uploaded_at
        ORDER BY c.year ASC NULLS LAST, c.uploaded_at ASC
    `);
    return result.rows;
}

async function deleteConference(id) {
    return await client.withTransaction(async () => {
        // Since some FKs on review, assignment, etc. reference program_committee_member without CASCADE,
        // but DO have CASCADE on paper, deleting all papers first safely removes those dependent rows.
        await client.query(`DELETE FROM paper WHERE conference_id = $1`, [id]);
        
        // Now it's safe to delete reviewers and their remaining cascaded relations (e.g. topics)
        await client.query(`DELETE FROM program_committee_member WHERE conference_id = $1`, [id]);
        
        // Finally delete the conference itself
        const res = await client.query(`DELETE FROM conference WHERE id = $1 RETURNING id`, [id]);
        return res.rows.length > 0;
    });
}

async function updateConference(id, { name, shortName, year }) {
    const result = await client.query(
        `UPDATE conference
         SET name = COALESCE($1, name),
             short_name = COALESCE($2, short_name),
             year = COALESCE($3, year)
         WHERE id = $4
         RETURNING *`,
        [name, shortName, year, id]
    );
    return result.rows[0];
}

module.exports = {
    listConferences,
    getAllConferences: listConferences,
    getComparisonMetrics,
    deleteConference,
    updateConference
};
