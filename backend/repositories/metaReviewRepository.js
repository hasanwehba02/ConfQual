const client = require("../config/database");

async function createMetaReview(metaReviewData) {
    const query = `
        INSERT INTO meta_review (
            paper_id,
            program_committee_member_id,
            recommendation,
            review_text,
            review_date,
            review_time
        )
        VALUES ($1, $2, $3, $4, $5, $6)
        ON CONFLICT (paper_id)
        DO NOTHING
        RETURNING *;
    `;

    const values = [
        metaReviewData.paperId,
        metaReviewData.programCommitteeMemberId,
        metaReviewData.recommendation,
        metaReviewData.reviewText,
        metaReviewData.reviewDate,
        metaReviewData.reviewTime
    ];

    const result = await client.query(query, values);

    if (result.rows.length === 0) {
        return null;
    }

    return result.rows[0];
}

module.exports = {
    createMetaReview
};
