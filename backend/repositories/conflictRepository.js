const client = require("../config/database");
const bulkInsert = require("../utils/bulkInsert");

async function createConflict(conflictData) {
    const query = `
        INSERT INTO conflict (
            paper_id,
            program_committee_member_id
        )
        VALUES ($1, $2)
        ON CONFLICT (paper_id, program_committee_member_id)
        DO NOTHING
        RETURNING *;
    `;

    const values = [
        conflictData.paperId,
        conflictData.programCommitteeMemberId
    ];

    const result = await client.query(query, values);

    if (result.rows.length === 0) {
        return null;
    }

    return result.rows[0];
}

async function bulkCreateConflicts(conflicts) {
    const rows = conflicts.map(c => [c.paperId, c.programCommitteeMemberId]);
    return await bulkInsert('conflict', ['paper_id', 'program_committee_member_id'], rows, '(paper_id, program_committee_member_id)');
}

async function batchCreateConflicts(conflicts) {
    return await bulkCreateConflicts(conflicts);
}

module.exports = {
    createConflict,
    bulkCreateConflicts,
    batchCreateConflicts
};
