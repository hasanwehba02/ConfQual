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
            country,
            web_page
        )
        VALUES ($1,$2,$3,$4,$5,$6,$7)
        RETURNING *;
    `;

    const values = [
        author.externalPersonId,
        author.firstName,
        author.lastName,
        author.email,
        author.affiliation,
        author.country,
        author.webPage || null
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

// getIdMap: returns {externalPersonId -> authorId}
async function getIdMap(_conferenceId) {
    const query = `
        SELECT external_person_id, id
        FROM author
    `;
    const result = await client.query(query);
    const map = {};
    for (const row of result.rows) {
        map[row.external_person_id] = row.id;
    }
    return map;
}

async function bulkCreateAuthors(authors) {
    const rows = authors.map(a => [a.externalPersonId, a.firstName, a.lastName, a.email, a.country, a.affiliation, a.webPage || null]);
    return await bulkInsert('author', ['external_person_id', 'first_name', 'last_name', 'email', 'country', 'affiliation', 'web_page'], rows, null);
}

module.exports = {
    getIdMap,
    bulkCreateAuthors,
    createAuthor,
    findByExternalPersonId
};
