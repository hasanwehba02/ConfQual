const client = require("../config/database");
const bulkInsert = require("../utils/bulkInsert");

async function createBid(bidData) {
    const query = `
        INSERT INTO bid (paper_id, participant_id, bid)
        VALUES ($1,$2,$3)
        ON CONFLICT (paper_id, participant_id) DO NOTHING
        RETURNING *;
    `;
    const result = await client.query(query, [bidData.paperId, bidData.participantId, bidData.bid]);
    return result.rows.length === 0 ? null : result.rows[0];
}

async function bulkCreateBids(bids) {
    const rows = bids.map(b => [b.paperId, b.participantId, b.bid]);
    return await bulkInsert('bid', ['paper_id', 'participant_id', 'bid'], rows, '(paper_id, participant_id)');
}

module.exports = { bulkCreateBids, createBid };