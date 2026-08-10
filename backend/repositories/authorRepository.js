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


// getIdMap: returns {externalPersonId -> authorId} scoped to authors
// that have papers in the given conference
async function getIdMap(conferenceId) {
    const query = `
        SELECT DISTINCT a.external_person_id, a.id
        FROM author a
        JOIN paper_author pa ON pa.author_id = a.id
        JOIN paper p ON p.id = pa.paper_id
        WHERE p.conference_id = $1
    `;
    const result = await client.query(query, [conferenceId]);
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