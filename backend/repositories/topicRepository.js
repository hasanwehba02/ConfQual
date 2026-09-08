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

async function createParticipantTopic(_participantId, _topicId) {
    // Note: participant-level topics are tracked via evaluator or author_participant
    // This is a placeholder - in the new model, topics may be tracked differently
    return null;
}

async function bulkCreatePaperTopics(topics) {
    const rows = topics.map(t => [t.paperId, t.topicId]);
    return await bulkInsert('paper_topic', ['paper_id', 'topic_id'], rows, '(paper_id, topic_id)');
}

async function bulkCreateParticipantTopics(topics) {
    // Placeholder for participant topics - may need schema support
    return topics.length;
}

module.exports = {
    ensureTopicExists,
    createPaperTopic,
    createParticipantTopic,
    bulkCreatePaperTopics,
    bulkCreateParticipantTopics
};
