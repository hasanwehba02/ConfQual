const client = require("../config/database");

async function createAuthor(author) {
    const query = `
        INSERT INTO author (
            external_person_id,
            first_name,
            last_name,
            email,
            affiliation,
            country
        )
        VALUES ($1,$2,$3,$4,$5,$6)
        ON CONFLICT (external_person_id)
        DO NOTHING
        RETURNING *;
    `;

    const values = [
        author.externalPersonId,
        author.firstName,
        author.lastName,
        author.email,
        author.affiliation,
        author.country
    ];

    const result = await client.query(query, values);

    if (result.rows.length === 0) {
        return null;
    }

    return result.rows[0];
}

async function findByExternalPersonId(externalPersonId) {
    const result = await client.query(
        `
        SELECT *
        FROM author
        WHERE external_person_id = $1;
        `,
        [externalPersonId]
    );

    return result.rows[0];
}

module.exports = {
    createAuthor,
    findByExternalPersonId
};