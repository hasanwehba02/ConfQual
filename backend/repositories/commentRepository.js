const bulkInsert = require("../utils/bulkInsert");

async function bulkCreateComments(comments) {
    const rows = comments.map(c => [c.paperId, c.participantId, c.commentText, c.commentDate, c.commentTime]);
    return await bulkInsert('comment', ['paper_id', 'participant_id', 'comment_text', 'comment_date', 'comment_time'], rows, null);
}

module.exports = { bulkCreateComments };