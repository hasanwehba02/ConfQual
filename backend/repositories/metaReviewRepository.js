const client = require("../config/database");
const bulkInsert = require("../utils/bulkInsert");

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


async function bulkCreateMetaReviews(metaReviews) {
    const rows = metaReviews.map(m => [m.paperId, m.programCommitteeMemberId, m.reviewText, m.reviewDate, m.reviewTime]);
    return await bulkInsert('meta_review', ['paper_id', 'program_committee_member_id', 'review_text', 'review_date', 'review_time'], rows, null);
}


module.exports = {
    bulkCreateMetaReviews,
    createMetaReview
};
