const client = require("../config/database");
const bulkInsert = require("../utils/bulkInsert");

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


async function getIdMap() {
    const query = `SELECT external_person_id, id FROM author`;
    const result = await client.query(query);
    const map = {};
    for (const row of result.rows) {
        map[row.external_person_id] = row.id;
    }
    return map;
}
async function bulkCreateAuthors(authors) {
    const rows = authors.map(a => [a.externalPersonId, a.firstName, a.lastName, a.email, a.country, a.organization, a.webPage]);
    return await bulkInsert('author', ['external_person_id', 'first_name', 'last_name', 'email', 'country', 'organization', 'web_page'], rows, '(external_person_id)');
}


module.exports = {
    getIdMap,
    bulkCreateAuthors,
    createAuthor,
    findByExternalPersonId
};