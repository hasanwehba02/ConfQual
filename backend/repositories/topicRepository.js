const client = require("../config/database");
const bulkInsert = require("../utils/bulkInsert");

async function ensureTopicExists(topicName) {
    const query = `
        INSERT INTO topic (name)
        VALUES ($1)
        ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name
        RETURNING id;
    `;
    const result = await client.query(query, [topicName]);
    return result.rows[0].id;
}

async function createPcTopic(pcmId, topicId) {
    const query = `
        INSERT INTO program_committee_member_topic (
            program_committee_member_id,
            topic_id
        )
        VALUES ($1, $2)
        ON CONFLICT (program_committee_member_id, topic_id)
        DO NOTHING
        RETURNING *;
    `;
    const result = await client.query(query, [pcmId, topicId]);
    return result.rows.length > 0 ? result.rows[0] : null;
}

async function createPaperTopic(paperId, topicId) {
    const query = `
        INSERT INTO paper_topic (
            paper_id,
            topic_id
        )
        VALUES ($1, $2)
        ON CONFLICT (paper_id, topic_id)
        DO NOTHING
        RETURNING *;
    `;
    const result = await client.query(query, [paperId, topicId]);
    return result.rows.length > 0 ? result.rows[0] : null;
}


async function bulkCreatePcTopics(topics) {
    const rows = topics.map(t => [t.pcmId, t.topicId]);
    return await bulkInsert('program_committee_member_topic', ['program_committee_member_id', 'topic_id'], rows, '(program_committee_member_id, topic_id)');
}
async function bulkCreatePaperTopics(topics) {
    const rows = topics.map(t => [t.paperId, t.topicId]);
    return await bulkInsert('paper_topic', ['paper_id', 'topic_id'], rows, '(paper_id, topic_id)');
}


module.exports = {
    bulkCreatePcTopics,
    bulkCreatePaperTopics,
    ensureTopicExists,
    createPcTopic,
    createPaperTopic
};
