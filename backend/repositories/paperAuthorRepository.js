const client = require("../config/database");
const bulkInsert = require("../utils/bulkInsert");

async function createPaperAuthor(paperId, participantId, authorOrder, isCorresponding) {
    const query = `
        INSERT INTO paper_author_new (paper_id, participant_id, author_order, is_corresponding)
        VALUES ($1,$2,$3,$4)
        ON CONFLICT (paper_id, participant_id) DO NOTHING
        RETURNING *;
    `;
    const result = await client.query(query, [paperId, participantId, authorOrder, isCorresponding]);
    return result.rows.length === 0 ? null : result.rows[0];
}

async function bulkCreatePaperAuthors(paperAuthors) {
    const rows = paperAuthors.map(pa => [pa.paperId, pa.participantId, pa.authorOrder, pa.corresponding]);
    return await bulkInsert('paper_author_new', ['paper_id', 'participant_id', 'author_order', 'is_corresponding'], rows, '(paper_id, participant_id)');
}

module.exports = { bulkCreatePaperAuthors, createPaperAuthor };
