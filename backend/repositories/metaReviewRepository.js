const bulkInsert = require("../utils/bulkInsert");

async function bulkCreateMetaReviews(metaReviews) {
    const rows = metaReviews.map(m => [
        m.paperId, m.participantId,
        m.recommendation || null, m.reviewText || '',
        m.reviewDate || null, m.reviewTime || null
    ]);
    return await bulkInsert('meta_review', ['paper_id', 'participant_id', 'recommendation', 'review_text', 'review_date', 'review_time'], rows, '(paper_id)');
}

module.exports = { bulkCreateMetaReviews };