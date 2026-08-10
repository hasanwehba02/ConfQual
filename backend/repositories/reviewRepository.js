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

    const values = [
        reviewData.paperId,
        reviewData.programCommitteeMemberId,
        reviewData.reviewNumber,
        reviewData.version,
        reviewData.reviewText,
        reviewData.scores,
        reviewData.totalScore,
        reviewData.reviewDate,
        reviewData.reviewTime,
        reviewData.hasAttachment,
        reviewData.isSuperseded,
        reviewData.subReviewerPersonId,
        reviewData.subReviewerFirstName,
        reviewData.subReviewerLastName,
        reviewData.subReviewerEmail,
        reviewData.sentimentScore
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
        values.push(
            review.paperId, review.programCommitteeMemberId, review.reviewNumber, review.version, review.reviewText,
            review.scores, review.totalScore, review.reviewDate, review.reviewTime, review.hasAttachment, review.isSuperseded,
            review.subReviewerPersonId, review.subReviewerFirstName, review.subReviewerLastName, review.subReviewerEmail, review.sentimentScore
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
