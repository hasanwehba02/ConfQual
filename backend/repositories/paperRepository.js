const client = require("../config/database");

async function createPaper(paper) {
    const query = `
        INSERT INTO paper (
            conference_id,
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
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
        ON CONFLICT (conference_id, external_submission_id)
        DO UPDATE SET 
            decision_category = EXCLUDED.decision_category
        RETURNING *;
    `;

    const values = [
        paper.conferenceId,
        paper.externalSubmissionId,
        paper.title,
        paper.submittedAt,
        paper.lastUpdatedAt,
        paper.decision,
        paper.decisionCategory,
        paper.notified,
        paper.reviewsSent,
        paper.isDeleted || false
    ];

    const result = await client.query(query, values);

    if (result.rows.length === 0) {
        return null;
    }

    return result.rows[0];
}

async function findByExternalSubmissionId(externalSubmissionId) {
    const query = `
        SELECT *
        FROM paper
        WHERE external_submission_id = $1
    `;
    const values = [externalSubmissionId];
    const result = await client.query(query, values);
    return result.rows.length ? result.rows[0] : null;
}

async function getIdMap(conferenceId) {
    const query = `SELECT external_submission_id, id FROM paper WHERE conference_id = $1`;
    const result = await client.query(query, [conferenceId]);
    const map = {};
    for (const row of result.rows) {
        map[row.external_submission_id] = row.id;
    }
    return map;
}

module.exports = {
    createPaper,
    findByExternalSubmissionId,
    getIdMap
};