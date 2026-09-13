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

async function ensureTopicsExist(topicNames) {
    const uniq = [...new Set(topicNames.filter(Boolean))];
    if (uniq.length === 0) return {};
    await client.query(
        `INSERT INTO topic (name) SELECT unnest($1::text[]) ON CONFLICT (name) DO NOTHING`,
        [uniq]
    );
    const res = await client.query(`SELECT id, name FROM topic WHERE name = ANY($1::text[])`, [uniq]);
    const map = {};
    for (const r of res.rows) map[r.name] = r.id;
    return map;
}

async function createPaperTopic(paperId, topicId) {
    const query = `
        INSERT INTO paper_topic (paper_id, topic_id)
        VALUES ($1, $2)
        ON CONFLICT (paper_id, topic_id) DO NOTHING
        RETURNING *;
    `;
    const result = await client.query(query, [paperId, topicId]);
    return result.rows.length > 0 ? result.rows[0] : null;
}

async function createParticipantTopic(participantId, topicId) {
    const query = `INSERT INTO participant_topic (participant_id, topic_id) VALUES ($1,$2) ON CONFLICT DO NOTHING RETURNING *`;
    const result = await client.query(query, [participantId, topicId]);
    return result.rows.length > 0 ? result.rows[0] : null;
}

async function bulkCreatePaperTopics(topics) {
    const rows = topics.map(t => [t.paperId, t.topicId]);
    return await bulkInsert('paper_topic', ['paper_id', 'topic_id'], rows, '(paper_id, topic_id)');
}

async function bulkCreateParticipantTopics(topics) {
    const rows = topics.map(t => [t.participantId, t.topicId]);
    return await bulkInsert('participant_topic', ['participant_id', 'topic_id'], rows, '(participant_id, topic_id)');
}

module.exports = {
    ensureTopicExists,
    ensureTopicsExist,
    createPaperTopic,
    createParticipantTopic,
    bulkCreatePaperTopics,
    bulkCreateParticipantTopics
};
