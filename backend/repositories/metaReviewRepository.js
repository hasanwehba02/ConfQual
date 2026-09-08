const client = require("../config/database");
const bulkInsert = require("../utils/bulkInsert");

async function createMetaReview(metaReviewData) {
    const query = `
        INSERT INTO meta_review (paper_id, participant_id, recommendation, review_text, review_date, review_time)
        VALUES ($1,$2,$3,$4,$5,$6)
        ON CONFLICT (paper_id) DO NOTHING
        RETURNING *;
    `;
    const values = [
        metaReviewData.paperId,
        metaReviewData.participantId,
        metaReviewData.recommendation || null,
        metaReviewData.reviewText || '',
        metaReviewData.reviewDate || null,
        metaReviewData.reviewTime || null
    ];
    const result = await client.query(query, values);
    return result.rows.length === 0 ? null : result.rows[0];
}

async function bulkCreateMetaReviews(metaReviews) {
    const rows = metaReviews.map(m => [
        m.paperId, m.participantId,
        m.recommendation || null, m.reviewText || '',
        m.reviewDate || null, m.reviewTime || null
    ]);
    return await bulkInsert('meta_review', ['paper_id', 'participant_id', 'recommendation', 'review_text', 'review_date', 'review_time'], rows, '(paper_id)');
}

module.exports = { bulkCreateMetaReviews, createMetaReview };