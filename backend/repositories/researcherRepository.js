const client = require("../config/database");

/**
 * researcherRepository.js
 * Manages the global researcher table (replaces old author + program_committee_member tables)
 * A researcher is a person who can participate in editions as author, evaluator, or SC chair
 */

const emailCache = new Map();
const nameCache = new Map();

function clearResearcherCache() {
    emailCache.clear();
    nameCache.clear();
}

function cacheResearcher(researcher) {
    if (!researcher) return;
    if (researcher.email) {
        emailCache.set(researcher.email.trim().toLowerCase(), researcher);
    }
    if (researcher.first_name || researcher.last_name) {
        const key = `${(researcher.first_name || '').trim().toLowerCase()}::${(researcher.last_name || '').trim().toLowerCase()}`;
        nameCache.set(key, researcher);
    }
}

/**
 * Find or create a researcher by email (deduplicated globally)
 * @param {Object} data - { firstName, lastName, email, country, affiliation, webPage }
 * @returns {Object} researcher record
 */
async function findOrCreateResearcher({ firstName, lastName, email, country, affiliation, webPage }) {
    const fn = (firstName || '').trim();
    const ln = (lastName || '').trim();
    const normalizedEmail = email && email.trim() !== '' && email.toLowerCase() !== 'hidden'
        ? email.trim().toLowerCase()
        : null;

    if (normalizedEmail && emailCache.has(normalizedEmail)) {
        return emailCache.get(normalizedEmail);
    }

    const nameKey = `${fn.toLowerCase()}::${ln.toLowerCase()}`;
    if (!normalizedEmail && nameCache.has(nameKey)) {
        return nameCache.get(nameKey);
    }

    // Try to find existing researcher by email (if provided and valid)
    if (normalizedEmail) {
        const existing = await client.query(
            `SELECT * FROM researcher WHERE LOWER(TRIM(email)) = $1`,
            [normalizedEmail]
        );

        if (existing.rows.length > 0) {
            cacheResearcher(existing.rows[0]);
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
        [fn.toLowerCase(), ln.toLowerCase(), normalizedEmail]
    );

    if (nameMatch.rows.length > 0) {
        cacheResearcher(nameMatch.rows[0]);
        return nameMatch.rows[0];
    }

    // Create new researcher
    const result = await client.query(
        `INSERT INTO researcher (first_name, last_name, email, country, affiliation, web_page)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING *`,
        [
            fn,
            ln,
            normalizedEmail,
            country || null,
            affiliation || null,
            webPage || null
        ]
    );

    const created = result.rows[0];
    cacheResearcher(created);
    return created;
}

/**
 * Find researcher by email
 */
async function findByEmail(email) {
    if (!email) return null;
    const result = await client.query(
        `SELECT * FROM researcher WHERE LOWER(TRIM(email)) = LOWER(TRIM($1))`,
        [email]
    );
    return result.rows.length > 0 ? result.rows[0] : null;
}

/**
 * Find researcher by ID
 */
async function findById(id) {
    const result = await client.query(
        `SELECT * FROM researcher WHERE id = $1`,
        [id]
    );
    return result.rows.length > 0 ? result.rows[0] : null;
}

/**
 * Search researchers by name or email
 */
async function searchResearchers(query, limit = 20) {
    const result = await client.query(
        `SELECT * FROM researcher
         WHERE first_name ILIKE $1 OR last_name ILIKE $1 OR email ILIKE $1
         ORDER BY last_name, first_name
         LIMIT $2`,
        [`%${query}%`, limit]
    );
    return result.rows;
}

/**
 * Bulk find-or-create researchers.
 * Returns a Map keyed by the input index → researcher row.
 *
 * Strategy:
 *   - Rows WITH email   → single INSERT … ON CONFLICT DO UPDATE, then fetch all by email
 *   - Rows WITHOUT email → per-row name-match fallback (rare, preserves dedup correctness)
 *
 * @param {Array<{firstName,lastName,email,country,affiliation,webPage}>} items
 * @returns {Promise<Map<number, Object>>} index → researcher
 */
async function bulkFindOrCreateResearchers(items) {
    const resultMap = new Map(); // index → researcher

    const withEmail = [];
    const withoutEmail = [];

    for (let i = 0; i < items.length; i++) {
        const it = items[i];
        const normalizedEmail = it.email && it.email.trim() !== '' && it.email.toLowerCase() !== 'hidden'
            ? it.email.trim().toLowerCase()
            : null;
        if (normalizedEmail) {
            withEmail.push({ index: i, ...it, normalizedEmail });
        } else {
            withoutEmail.push({ index: i, ...it });
        }
    }

    // --- Bulk path for rows that have an email ---
    if (withEmail.length > 0) {
        const firstNames   = withEmail.map(r => (r.firstName  || '').trim());
        const lastNames    = withEmail.map(r => (r.lastName   || '').trim());
        const emails       = withEmail.map(r => r.normalizedEmail);
        const countries    = withEmail.map(r => r.country    || null);
        const affiliations = withEmail.map(r => r.affiliation || null);
        const webPages     = withEmail.map(r => r.webPage    || null);

        // Single upsert — inserts new rows, updates name/affiliation on conflict
        await client.query(`
            INSERT INTO researcher (first_name, last_name, email, country, affiliation, web_page)
            SELECT * FROM unnest(
                $1::text[], $2::text[], $3::text[], $4::text[], $5::text[], $6::text[]
            )
            ON CONFLICT (email) WHERE email IS NOT NULL AND email <> 'hidden'
            DO UPDATE SET
                first_name  = COALESCE(NULLIF(EXCLUDED.first_name,  ''), researcher.first_name),
                last_name   = COALESCE(NULLIF(EXCLUDED.last_name,   ''), researcher.last_name),
                country     = COALESCE(EXCLUDED.country,     researcher.country),
                affiliation = COALESCE(EXCLUDED.affiliation, researcher.affiliation),
                web_page    = COALESCE(EXCLUDED.web_page,    researcher.web_page)
        `, [firstNames, lastNames, emails, countries, affiliations, webPages]);

        // Fetch all by email in one query
        const fetched = await client.query(
            `SELECT * FROM researcher WHERE LOWER(TRIM(email)) = ANY($1::text[])`,
            [emails]
        );
        const byEmail = new Map(fetched.rows.map(r => [r.email.trim().toLowerCase(), r]));

        for (const item of withEmail) {
            const row = byEmail.get(item.normalizedEmail);
            if (row) {
                cacheResearcher(row);
                resultMap.set(item.index, row);
            }
        }
    }

    // --- Sequential fallback for rows without email ---
    for (const item of withoutEmail) {
        const researcher = await findOrCreateResearcher(item);
        resultMap.set(item.index, researcher);
    }

    return resultMap;
}

module.exports = {
    findOrCreateResearcher,
    bulkFindOrCreateResearchers,
    findByEmail,
    findById,
    searchResearchers,
    clearResearcherCache
};

