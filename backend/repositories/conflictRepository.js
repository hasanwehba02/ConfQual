const client = require("../config/database");
const bulkInsert = require("../utils/bulkInsert");

async function createConflict(conflictData) {
    const query = `
        INSERT INTO conflict (paper_id, participant_id)
        VALUES ($1, $2)
        ON CONFLICT (paper_id, participant_id) DO NOTHING
        RETURNING *;
    `;
    const result = await client.query(query, [conflictData.paperId, conflictData.participantId]);
    return result.rows.length === 0 ? null : result.rows[0];
}

async function bulkCreateConflicts(conflicts) {
    const rows = conflicts.map(c => [c.paperId, c.participantId]);
    return await bulkInsert('conflict', ['paper_id', 'participant_id'], rows, '(paper_id, participant_id)');
}

async function batchCreateConflicts(conflicts) {
    return await bulkCreateConflicts(conflicts);
}

module.exports = { createConflict, bulkCreateConflicts, batchCreateConflicts };