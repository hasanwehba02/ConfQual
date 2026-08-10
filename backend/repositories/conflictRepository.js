const client = require("../config/database");

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

async function batchCreateConflicts(conflicts) {
    if (conflicts.length === 0) return [];
    
    let query = `
        INSERT INTO conflict (
            paper_id,
            program_committee_member_id
        ) VALUES 
    `;
    
    const values = [];
    const valueStrings = [];
    let idx = 1;
    
    for (const c of conflicts) {
        valueStrings.push(`($${idx}, $${idx+1})`);
        values.push(c.paperId, c.programCommitteeMemberId);
        idx += 2;
    }
    
    query += valueStrings.join(', ') + ' ON CONFLICT (paper_id, program_committee_member_id) DO NOTHING RETURNING *;';
    const result = await client.query(query, values);
    return result.rows;
}

module.exports = {
    createConflict,
    batchCreateConflicts
};
