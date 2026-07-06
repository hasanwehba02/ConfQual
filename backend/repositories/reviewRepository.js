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
            is_superseded
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
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
        reviewData.isSuperseded
    ];

    const result = await client.query(query, values);

    if (result.rows.length === 0) {
        return null;
    }

    return result.rows[0];
}

module.exports = {
    createReview
};
