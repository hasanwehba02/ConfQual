const client = require("../config/database");
const bulkInsert = require("../utils/bulkInsert");

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


async function bulkCreateComments(comments) {
    const rows = comments.map(c => [c.paperId, c.programCommitteeMemberId, c.commentText, c.commentDate, c.commentTime]);
    return await bulkInsert('comment', ['paper_id', 'program_committee_member_id', 'comment_text', 'comment_date', 'comment_time'], rows, null); // assuming no simple conflict target or just omit DO NOTHING if not needed. Wait, createComment does NOT have ON CONFLICT DO NOTHING. So conflictTarget = null.
}


module.exports = {
    bulkCreateComments,
    createComment
};
