const client = require("../config/database");

async function bulkCreatePapers(papers) {
    if (!papers || papers.length === 0) return [];
    const values = [];
    const placeholders = [];
    let paramIndex = 1;

    for (const paper of papers) {
        placeholders.push(`($${paramIndex++}, $${paramIndex++}, $${paramIndex++}, $${paramIndex++}, $${paramIndex++}, $${paramIndex++}, $${paramIndex++}, $${paramIndex++}, $${paramIndex++}, $${paramIndex++})`);
        values.push(
            paper.editionId,
            paper.externalSubmissionId,
            paper.title,
            paper.submittedAt,
            paper.lastUpdatedAt,
            paper.decision,
            paper.decisionCategory,
            paper.notified,
            paper.reviewsSent,
            paper.isDeleted || false
        );
    }

    const query = `
        INSERT INTO paper (
            edition_id,
            external_submission_id,
            title,
            submitted_at,
            last_updated_at,
            decision,
            decision_category,
            notified,
            reviews_sent,
            is_deleted
        )
        VALUES ${placeholders.join(', ')}
        ON CONFLICT (edition_id, external_submission_id)
        DO UPDATE SET
            decision_category = EXCLUDED.decision_category
        RETURNING *;
    `;

    const result = await client.query(query, values);
    return result.rows;
}

async function getIdMap(editionId) {
    const query = `SELECT external_submission_id, id FROM paper WHERE edition_id = $1`;
    const result = await client.query(query, [editionId]);
    const map = {};
    for (const row of result.rows) {
        map[row.external_submission_id] = row.id;
    }
    return map;
}

module.exports = { bulkCreatePapers, getIdMap };
