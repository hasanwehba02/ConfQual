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
            notified,
            reviews_sent
        )
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
        ON CONFLICT (conference_id, external_submission_id)
        DO NOTHING
        RETURNING *;
    `;

    const values = [
        paper.conferenceId,
        paper.externalSubmissionId,
        paper.title,
        paper.submittedAt,
        paper.lastUpdatedAt,
        paper.decision,
        paper.notified,
        paper.reviewsSent
    ];

    const result = await client.query(query, values);

    if (result.rows.length === 0) {
        return null;
    }

    return result.rows[0];
}

module.exports = {
    createPaper
};
async function findByExternalSubmissionId(externalSubmissionId) {

    const result = await client.query(

        `

        SELECT *

        FROM paper

        WHERE external_submission_id = $1;

        `,

        [externalSubmissionId]

    );

    return result.rows[0];

}
module.exports = {

    createPaper,

    findByExternalSubmissionId

};