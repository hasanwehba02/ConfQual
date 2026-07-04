const client = require("../config/database");

async function createPaperAuthor(paperId, authorId, authorOrder, isCorresponding) {
    const query = `
        INSERT INTO paper_author (
            paper_id,
            author_id,
            author_order,
            is_corresponding
        )
        VALUES ($1,$2,$3,$4)
        ON CONFLICT (paper_id, author_id)
        DO NOTHING
        RETURNING *;
    `;

    const values = [
        paperId,
        authorId,
        authorOrder,
        isCorresponding
    ];

    const result = await client.query(query, values);

    if (result.rows.length === 0) {
        return null;
    }

    return result.rows[0];
}

module.exports = {
    createPaperAuthor
};