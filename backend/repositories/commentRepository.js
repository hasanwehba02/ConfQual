const client = require("../config/database");

async function createComment(commentData) {
    const query = `
        INSERT INTO comment (
            paper_id,
            program_committee_member_id,
            comment_text,
            comment_date,
            comment_time
        )
        VALUES ($1, $2, $3, $4, $5)
        RETURNING *;
    `;

    const values = [
        commentData.paperId,
        commentData.programCommitteeMemberId,
        commentData.commentText,
        commentData.commentDate,
        commentData.commentTime
    ];

    const result = await client.query(query, values);

    if (result.rows.length === 0) {
        return null;
    }

    return result.rows[0];
}

module.exports = {
    createComment
};
