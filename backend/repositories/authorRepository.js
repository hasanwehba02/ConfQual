const client = require("../config/database");
const researcherRepository = require("./researcherRepository");

async function createAuthor(author) {
    try {
        const researcher = await researcherRepository.findOrCreateResearcher({
            firstName: author.firstName,
            lastName: author.lastName,
            email: author.email,
            country: author.country,
            affiliation: author.affiliation,
            webPage: author.webPage
        });
        return researcher;
    } catch (err) {
        console.error('Error creating author:', err);
        return null;
    }
}

async function findByExternalPersonId(externalPersonId) {
    const result = await client.query(
        `SELECT r.* FROM researcher r
         JOIN participant pt ON pt.researcher_id = r.id
         WHERE pt.external_person_id = $1
         LIMIT 1`,
        [externalPersonId]
    );
    return result.rows[0];
}

async function getIdMap(_editionId) {
    // This is a compatibility shim - in the new model, author IDs are researcher IDs
    const query = `SELECT id, id as researcher_id FROM researcher`;
    const result = await client.query(query);
    const map = {};
    for (const row of result.rows) {
        map[row.researcher_id] = row.id;
    }
    return map;
}

async function bulkCreateAuthors(authors) {
    let count = 0;
    for (const a of authors) {
        try {
            await researcherRepository.findOrCreateResearcher({
                firstName: a.firstName,
                lastName: a.lastName,
                email: a.email,
                country: a.country,
                affiliation: a.affiliation,
                webPage: a.webPage
            });
            count++;
        } catch (err) {
            console.error('Error bulk creating author:', err);
        }
    }
    return count;
}

module.exports = {
    getIdMap,
    bulkCreateAuthors,
    createAuthor,
    findByExternalPersonId
};
