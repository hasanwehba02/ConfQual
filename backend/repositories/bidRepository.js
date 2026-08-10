const client = require("../config/database");
const bulkInsert = require("../utils/bulkInsert");

async function createBid(bidData) {
    const query = `
        INSERT INTO bid (
            paper_id,
            program_committee_member_id,
            bid
        )
        VALUES ($1, $2, $3)
        ON CONFLICT (paper_id, program_committee_member_id)
        DO NOTHING
        RETURNING *;
    `;

    const values = [
        bidData.paperId,
        bidData.programCommitteeMemberId,
        bidData.bid
    ];

    const result = await client.query(query, values);

    if (result.rows.length === 0) {
        return null;
    }

    return result.rows[0];
}


async function bulkCreateBids(bids) {
    const rows = bids.map(b => [b.paperId, b.programCommitteeMemberId, b.bid]);
    return await bulkInsert('bid', ['paper_id', 'program_committee_member_id', 'bid'], rows, '(paper_id, program_committee_member_id)');
}


module.exports = {
    bulkCreateBids,
    createBid
};
