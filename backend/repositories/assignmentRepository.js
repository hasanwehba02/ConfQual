const client = require("../config/database");
const bulkInsert = require("../utils/bulkInsert");

async function createAssignment(assignment) {
    const query = `
        INSERT INTO assignment (paper_id, program_committee_member_id)
        VALUES ($1, $2)
        ON CONFLICT (paper_id, program_committee_member_id) DO NOTHING
        RETURNING *;
    `;
    const result = await client.query(query, [assignment.paperId, assignment.programCommitteeMemberId]);
    return result.rows.length === 0 ? null : result.rows[0];
}

async function bulkCreateAssignments(assignments) {
    const rows = assignments.map(a => [a.paperId, a.programCommitteeMemberId]);
    return await bulkInsert('assignment', ['paper_id', 'program_committee_member_id'], rows, '(paper_id, program_committee_member_id)');
}

module.exports = { createAssignment, bulkCreateAssignments };
