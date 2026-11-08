const bulkInsert = require("../utils/bulkInsert");

async function bulkCreateBids(bids) {
    const rows = bids.map(b => [b.paperId, b.participantId, b.bid]);
    return await bulkInsert('bid', ['paper_id', 'participant_id', 'bid'], rows, '(paper_id, participant_id)');
}

module.exports = { bulkCreateBids };