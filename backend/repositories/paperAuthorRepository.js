const bulkInsert = require("../utils/bulkInsert");

async function bulkCreatePaperAuthors(paperAuthors) {
    const rows = paperAuthors.map(pa => [pa.paperId, pa.participantId, pa.authorOrder, pa.corresponding]);
    return await bulkInsert('paper_author_new', ['paper_id', 'participant_id', 'author_order', 'is_corresponding'], rows, '(paper_id, participant_id)');
}

module.exports = { bulkCreatePaperAuthors };
