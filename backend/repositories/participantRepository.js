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
 * Bulk find-or-create participants for a single edition.
 * Returns a Map: externalPersonId → participant row.
 *
 * @param {Array<{researcherId, editionId, externalPersonId}>} items
 * @returns {Promise<Map<number, Object>>}
 */
async function bulkFindOrCreateParticipants(items) {
    if (!items || items.length === 0) return new Map();

    const researcherIds   = items.map(p => p.researcherId);
    const editionIds      = items.map(p => p.editionId);
    const externalIds     = items.map(p => p.externalPersonId || null);

    // Single upsert — handles both unique constraints (researcher_id,edition_id) and (edition_id,external_person_id)
    // Use DO NOTHING for any conflict, then coalesce external_person_id where missing
    await client.query(`
        INSERT INTO participant (researcher_id, edition_id, external_person_id)
        SELECT * FROM unnest($1::int[], $2::int[], $3::int[])
        ON CONFLICT DO NOTHING
    `, [researcherIds, editionIds, externalIds]);

    // Backfill external_person_id where we inserted with NULL or conflict skipped it
    await client.query(`
        UPDATE participant SET external_person_id = v.ext
        FROM (SELECT * FROM unnest($1::int[], $2::int[], $3::int[]) AS t(rid, eid, ext)) v
        WHERE participant.researcher_id = v.rid AND participant.edition_id = v.eid
          AND participant.external_person_id IS NULL AND v.ext IS NOT NULL
    `, [researcherIds, editionIds, externalIds]);

    // Fetch back by both researcher and external id to handle either conflict path
    const editionId = items[0].editionId;
    const fetched = await client.query(
        `SELECT id, researcher_id, external_person_id
         FROM participant
         WHERE edition_id = $1 AND (researcher_id = ANY($2::int[]) OR external_person_id = ANY($3::int[]))`,
        [editionId, researcherIds, externalIds.filter(Boolean)]
    );

    const resultMap = new Map();
    const byResearcher = new Map(fetched.rows.map(r => [r.researcher_id, r]));
    const byExternal = new Map(fetched.rows.filter(r => r.external_person_id != null).map(r => [r.external_person_id, r]));

    for (const item of items) {
        let row = byResearcher.get(item.researcherId);
        if (!row && item.externalPersonId) row = byExternal.get(item.externalPersonId);
        if (row && item.externalPersonId) resultMap.set(item.externalPersonId, row);
        else if (row) resultMap.set(item.researcherId, row);
    }

    return resultMap;
}

module.exports = {
    findOrCreateParticipant,
    bulkFindOrCreateParticipants,
    getParticipantIdMap,
    bulkCreateAuthorParticipants,
};

