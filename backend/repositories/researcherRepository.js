const client = require("../config/database");

/**
 * researcherRepository.js
 * Manages the global researcher table (replaces old author + program_committee_member tables)
 * A researcher is a person who can participate in editions as author, evaluator, or SC chair
 */

/**
 * Find or create a researcher by email (deduplicated globally)
 * @param {Object} data - { firstName, lastName, email, country, affiliation, webPage }
 * @returns {Object} researcher record
 */
async function findOrCreateResearcher({ firstName, lastName, email, country, affiliation, webPage }) {
    // Normalize email for matching (null if hidden or empty)
    const normalizedEmail = email && email.trim() !== '' && email.toLowerCase() !== 'hidden'
        ? email.trim().toLowerCase()
        : null;

    // Try to find existing researcher by email (if provided and valid)
    if (normalizedEmail) {
        const existing = await client.query(
            `SELECT * FROM researcher WHERE LOWER(TRIM(email)) = $1`,
            [normalizedEmail]
        );

        if (existing.rows.length > 0) {
            return existing.rows[0];
        }
    }

    // Try to find by name match (fallback for researchers without email)
    const nameMatch = await client.query(
        `SELECT * FROM researcher
         WHERE LOWER(TRIM(first_name)) = $1
         AND LOWER(TRIM(last_name)) = $2
         AND (email IS NULL OR email = $3)
         LIMIT 1`,
        [firstName.trim().toLowerCase(), lastName.trim().toLowerCase(), normalizedEmail]
    );

    if (nameMatch.rows.length > 0) {
        return nameMatch.rows[0];
    }

    // Create new researcher
    const result = await client.query(
        `INSERT INTO researcher (first_name, last_name, email, country, affiliation, web_page)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING *`,
        [
            firstName.trim(),
            lastName.trim(),
            normalizedEmail,
            country || null,
            affiliation || null,
            webPage || null
        ]
    );

    return result.rows[0];
}

/**
 * Get researcher by ID
 */
async function getResearcherById(researcherId) {
    const result = await client.query(
        `SELECT * FROM researcher WHERE id = $1`,
        [researcherId]
    );
    return result.rows[0];
}

/**
 * Get all researchers (with optional filtering)
 */
async function getAllResearchers({ limit = 100, offset = 0, search } = {}) {
    let query = `SELECT * FROM researcher WHERE 1=1`;
    const params = [];
    let paramCount = 0;

    if (search) {
        paramCount++;
        query += ` AND (
            LOWER(first_name) LIKE $${paramCount} OR
            LOWER(last_name) LIKE $${paramCount} OR
            LOWER(email) LIKE $${paramCount}
        )`;
        params.push(`%${search.toLowerCase()}%`);
    }

    query += ` ORDER BY last_name, first_name LIMIT $${paramCount + 1} OFFSET $${paramCount + 2}`;
    params.push(limit, offset);

    const result = await client.query(query, params);
    return result.rows;
}

/**
 * Update researcher information
 */
async function updateResearcher(researcherId, { firstName, lastName, email, country, affiliation, webPage }) {
    const result = await client.query(
        `UPDATE researcher
         SET first_name = COALESCE($1, first_name),
             last_name = COALESCE($2, last_name),
             email = COALESCE($3, email),
             country = COALESCE($4, country),
             affiliation = COALESCE($5, affiliation),
             web_page = COALESCE($6, web_page)
         WHERE id = $7
         RETURNING *`,
        [firstName, lastName, email, country, affiliation, webPage, researcherId]
    );
    return result.rows[0];
}

/**
 * Bulk create or find researchers (for import)
 * Returns map of { email -> researcherId } or { firstName_lastName -> researcherId }
 */
async function bulkFindOrCreateResearchers(researchers) {
    const map = {};

    for (const data of researchers) {
        const researcher = await findOrCreateResearcher(data);
        const key = data.email || `${data.firstName}_${data.lastName}`;
        map[key] = researcher.id;
    }

    return map;
}

module.exports = {
    findOrCreateResearcher,
    getResearcherById,
    getAllResearchers,
    updateResearcher,
    bulkFindOrCreateResearchers
};
