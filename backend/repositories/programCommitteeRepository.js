const client = require("../config/database");

async function createProgramCommitteeMember(member) {
    const query = `
        INSERT INTO program_committee_member (
            conference_id,
            external_person_id,
            first_name,
            last_name,
            email,
            affiliation,
            country,
            role
        )
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
        ON CONFLICT (external_person_id)
        DO NOTHING
        RETURNING *;
    `;

    const values = [
        member.conferenceId,
        member.externalPersonId,
        member.firstName,
        member.lastName,
        member.email,
        member.affiliation,
        member.country,
        member.role
    ];

    const result = await client.query(query, values);

    if (result.rows.length === 0) {
        return null;
    }

    return result.rows[0];
}

async function findByExternalPersonId(externalPersonId) {
    const query = `
        SELECT * FROM program_committee_member
        WHERE external_person_id = $1
    `;
    const result = await client.query(query, [externalPersonId]);
    return result.rows.length > 0 ? result.rows[0] : null;
}

module.exports = {
    createProgramCommitteeMember,
    findByExternalPersonId
};