const client = require("../config/database");

async function createAssignment(assignment) {
    const query = `
        INSERT INTO assignment (
            paper_id,
            program_committee_member_id
        )
        VALUES ($1, $2)
        ON CONFLICT (paper_id, program_committee_member_id)
        DO NOTHING
        RETURNING *;
    `;

    const values = [
        assignment.paperId,
        assignment.programCommitteeMemberId
    ];

    const result = await client.query(query, values);

    if (result.rows.length === 0) {
        return null;
    }

    return result.rows[0];
}

module.exports = {
    createAssignment
};
