const bulkInsert = require("../utils/bulkInsert");

async function bulkCreateAssignments(assignments) {
    const rows = assignments.map(a => [a.paperId, a.participantId]);
    return await bulkInsert('assignment', ['paper_id', 'participant_id'], rows, '(paper_id, participant_id)');
}

module.exports = { bulkCreateAssignments };
