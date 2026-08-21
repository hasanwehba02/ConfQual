const client = require("../config/database");

async function createReview(reviewData) {
    const query = `
        INSERT INTO review (
            paper_id,
            program_committee_member_id,
            review_number,
            version,
            review_text,
            scores,
            total_score,
            review_date,
            review_time,
            has_attachment,
            is_superseded,
            sub_reviewer_person_id,
            sub_reviewer_first_name,
            sub_reviewer_last_name,
            sub_reviewer_email,
            sentiment_score
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
        RETURNING *;
    `;

    const subId = reviewData.subReviewerPersonId ? parseInt(reviewData.subReviewerPersonId, 10) || null : null;
    const values = [
        reviewData.paperId,
        reviewData.programCommitteeMemberId,
        reviewData.reviewNumber || 1,
        reviewData.version || 1,
        reviewData.reviewText || '',
        reviewData.scores || null,
        reviewData.totalScore !== null && reviewData.totalScore !== undefined && !isNaN(reviewData.totalScore) ? reviewData.totalScore : null,
        reviewData.reviewDate || null,
        reviewData.reviewTime || null,
        Boolean(reviewData.hasAttachment),
        Boolean(reviewData.isSuperseded),
        subId,
        reviewData.subReviewerFirstName || null,
        reviewData.subReviewerLastName || null,
        reviewData.subReviewerEmail || null,
        reviewData.sentimentScore !== null && reviewData.sentimentScore !== undefined ? reviewData.sentimentScore : null
    ];

    const result = await client.query(query, values);

    if (result.rows.length === 0) {
        return null;
    }

    return result.rows[0];
}

async function batchCreateReviews(reviews) {
    if (reviews.length === 0) return [];
    
    let query = `
        INSERT INTO review (
            paper_id, program_committee_member_id, review_number, version, review_text,
            scores, total_score, review_date, review_time, has_attachment, is_superseded,
            sub_reviewer_person_id, sub_reviewer_first_name, sub_reviewer_last_name, sub_reviewer_email, sentiment_score
        ) VALUES 
    `;
    
    const values = [];
    const valueStrings = [];
    let idx = 1;
    
    for (const review of reviews) {
        valueStrings.push(`($${idx}, $${idx+1}, $${idx+2}, $${idx+3}, $${idx+4}, $${idx+5}, $${idx+6}, $${idx+7}, $${idx+8}, $${idx+9}, $${idx+10}, $${idx+11}, $${idx+12}, $${idx+13}, $${idx+14}, $${idx+15})`);
        const subId = review.subReviewerPersonId ? parseInt(review.subReviewerPersonId, 10) || null : null;
        values.push(
            review.paperId,
            review.programCommitteeMemberId,
            review.reviewNumber || 1,
            review.version || 1,
            review.reviewText || '',
            review.scores || null,
            review.totalScore !== null && review.totalScore !== undefined && !isNaN(review.totalScore) ? review.totalScore : null,
            review.reviewDate || null,
            review.reviewTime || null,
            Boolean(review.hasAttachment),
            Boolean(review.isSuperseded),
            subId,
            review.subReviewerFirstName || null,
            review.subReviewerLastName || null,
            review.subReviewerEmail || null,
            review.sentimentScore !== null && review.sentimentScore !== undefined ? review.sentimentScore : null
        );
        idx += 16;
    }
    
    query += valueStrings.join(', ') + ' RETURNING *;';
    const result = await client.query(query, values);
    return result.rows;
}

module.exports = {
    createReview,
    batchCreateReviews
};
