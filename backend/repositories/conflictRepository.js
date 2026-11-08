const bulkInsert = require("../utils/bulkInsert");

async function bulkCreateConflicts(conflicts) {
    const rows = conflicts.map(c => [c.paperId, c.participantId]);
    return await bulkInsert('conflict', ['paper_id', 'participant_id'], rows, '(paper_id, participant_id)');
}

module.exports = { bulkCreateConflicts };