const client = require("../config/database");

/**
 * participantRepository.js
 * Manages participants (researchers enrolled in a specific edition)
 * A participant links a researcher to an edition and can have multiple roles
 */

/**
 * Find or create a participant for a researcher in an edition
 */
async function findOrCreateParticipant({ researcherId, editionId, externalPersonId }) {
    // Check if participant already exists by externalPersonId or researcherId in this edition
    let existing;
    if (externalPersonId) {
        existing = await client.query(
            `SELECT * FROM participant
             WHERE edition_id = $1 AND (researcher_id = $2 OR external_person_id = $3)
             LIMIT 1`,
            [editionId, researcherId, externalPersonId]
        );
    } else {
        existing = await client.query(
            `SELECT * FROM participant
             WHERE edition_id = $1 AND researcher_id = $2
             LIMIT 1`,
            [editionId, researcherId]
        );
    }

    if (existing.rows.length > 0) {
        const p = existing.rows[0];
        if (externalPersonId && !p.external_person_id) {
            await client.query(
                `UPDATE participant SET external_person_id = $1 WHERE id = $2`,
                [externalPersonId, p.id]
            );
            p.external_person_id = externalPersonId;
        }
        return p;
    }

    try {
        const result = await client.query(
            `INSERT INTO participant (researcher_id, edition_id, external_person_id)\n             VALUES ($1, $2, $3)\n             RETURNING *`,
            [researcherId, editionId, externalPersonId || null]
        );
        return result.rows[0];
    } catch (err) {
        // In case of concurrent insert or unique constraint hit
        if (err.code === '23505') {
            const fallback = await client.query(
                `SELECT * FROM participant
                 WHERE edition_id = $1 AND (researcher_id = $2 OR ($3::INTEGER IS NOT NULL AND external_person_id = $3))
                 LIMIT 1`,
                [editionId, researcherId, externalPersonId || null]
            );
            if (fallback.rows.length > 0) return fallback.rows[0];
        }
        throw err;
    }
}

/**
 * Get participant by ID
 */
async function getParticipantById(participantId) {
    const result = await client.query(
        `SELECT p.*, r.first_name, r.last_name, r.email, r.country, r.affiliation, r.web_page
         FROM participant p
         JOIN researcher r ON r.id = p.researcher_id
         WHERE p.id = $1`,
        [participantId]
    );
    return result.rows[0];
}

/**
 * Get all participants for an edition
 */
async function getParticipantsByEdition(editionId) {
    const result = await client.query(
        `SELECT p.*, r.first_name, r.last_name, r.email, r.country, r.affiliation, r.web_page
         FROM participant p
         JOIN researcher r ON r.id = p.researcher_id
         WHERE p.edition_id = $1
         ORDER BY r.last_name, r.first_name`,
        [editionId]
    );
    return result.rows;
}

/**
 * Get participant with their roles (evaluator, author, sc_chair)
 */
async function getParticipantWithRoles(participantId) {
    const participant = await getParticipantById(participantId);
    if (!participant) return null;

    // Check if they are an evaluator
    const evaluator = await client.query(
        `SELECT evaluator_role, is_senior FROM evaluator WHERE participant_id = $1`,
        [participantId]
    );

    // Check if they are an author
    const author = await client.query(
        `SELECT 1 FROM author_participant WHERE participant_id = $1`,
        [participantId]
    );

    // Check if they are an SC chair
    const scChair = await client.query(
        `SELECT mandate_start_year, mandate_end_year FROM sc_chair WHERE participant_id = $1`,
        [participantId]
    );

    return {
        ...participant,
        roles: {
            evaluator: evaluator.rows[0] || null,
            author: author.rows.length > 0,
            scChair: scChair.rows[0] || null
        }
    };
}

/**
 * Get participant ID map for an edition (external_person_id -> participant_id)
 */
async function getParticipantIdMap(editionId) {
    const result = await client.query(
        `SELECT external_person_id, id
         FROM participant
         WHERE edition_id = $1 AND external_person_id IS NOT NULL`,
        [editionId]
    );

    const map = {};
    for (const row of result.rows) {
        map[row.external_person_id] = row.id;
    }
    return map;
}

/**
 * Create evaluator role for a participant
 */
async function createEvaluator(participantId, { evaluatorRole, isSenior }) {
    const result = await client.query(
        `INSERT INTO evaluator (participant_id, evaluator_role, is_senior)
         VALUES ($1, $2, $3)
         ON CONFLICT (participant_id) DO UPDATE
         SET evaluator_role = EXCLUDED.evaluator_role,
             is_senior = EXCLUDED.is_senior
         RETURNING *`,
        [participantId, evaluatorRole, isSenior || false]
    );
    return result.rows[0];
}

/**
 * Create author role for a participant
 */
async function createAuthorParticipant(participantId) {
    const result = await client.query(
        `INSERT INTO author_participant (participant_id)
         VALUES ($1)
         ON CONFLICT (participant_id) DO NOTHING
         RETURNING *`,
        [participantId]
    );
    return result.rows[0];
}

/**
 * Bulk create author participant roles
 */
async function bulkCreateAuthorParticipants(participantIds) {
    if (!participantIds || participantIds.length === 0) return 0;
    const uniqueIds = Array.from(new Set(participantIds)).filter(Boolean);
    if (uniqueIds.length === 0) return 0;
    const result = await client.query(
        `INSERT INTO author_participant (participant_id)
         SELECT unnest($1::int[])
         ON CONFLICT (participant_id) DO NOTHING`,
        [uniqueIds]
    );
    return result.rowCount || 0;
}

/**
 * Bulk create participants for an edition
 */
async function bulkCreateParticipants(participants) {
    if (!participants || participants.length === 0) return [];

    const rows = participants.map(p => [
        p.researcherId,
        p.editionId,
        p.externalPersonId || null
    ]);

    const { bulkInsert } = require("../utils/bulkInsert");
    return await bulkInsert(
        'participant',
        ['researcher_id', 'edition_id', 'external_person_id'],
        rows,
        '(researcher_id, edition_id)'
    );
}

module.exports = {
    findOrCreateParticipant,
    getParticipantById,
    getParticipantsByEdition,
    getParticipantWithRoles,
    getParticipantIdMap,
    createEvaluator,
    createAuthorParticipant,
    bulkCreateAuthorParticipants,
    bulkCreateParticipants
};
