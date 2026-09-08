const client = require("../config/database");
const bulkInsert = require("../utils/bulkInsert");

async function createComment(commentData) {
    const query = `
        INSERT INTO comment (paper_id, participant_id, comment_text, comment_date, comment_time)
        VALUES ($1,$2,$3,$4,$5)
        RETURNING *;
    `;
    const values = [
        commentData.paperId,
        commentData.participantId,
        commentData.commentText,
        commentData.commentDate,
        commentData.commentTime
    ];
    const result = await client.query(query, values);
    return result.rows.length === 0 ? null : result.rows[0];
}

async function bulkCreateComments(comments) {
    const rows = comments.map(c => [c.paperId, c.participantId, c.commentText, c.commentDate, c.commentTime]);
    return await bulkInsert('comment', ['paper_id', 'participant_id', 'comment_text', 'comment_date', 'comment_time'], rows, null);
}

module.exports = { bulkCreateComments, createComment };