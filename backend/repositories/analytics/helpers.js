const client = require("../../config/database");

// Helper: resolve editionId — defaults to most recently uploaded edition
async function resolveEditionId(editionId) {
    if (typeof editionId === 'object' && editionId !== null) {
        editionId = editionId.editionId || editionId.edition_id || editionId.conferenceId || editionId.conference_id || null;
    }
    if (editionId !== null && editionId !== undefined && editionId !== '') {
        const parsed = parseInt(editionId, 10);
        if (!isNaN(parsed)) return parsed;
    }
    const result = await client.query(
        `SELECT id FROM edition ORDER BY uploaded_at DESC LIMIT 1`
    );
    return result.rows[0]?.id || null;
}

// Backward-compatible alias
async function resolveConferenceId(editionId) {
    return resolveEditionId(editionId);
}

function assertSafeNumber(val, name = 'value') {
    const num = Number(val);
    if (!Number.isFinite(num)) {
        throw new Error(`Invalid numeric threshold for ${name}: ${val}`);
    }
    return num;
}

async function getAlertRules(editionId = null) {
    try {
        const eid = await resolveEditionId(editionId);
        const res = await client.query(
            `SELECT rule_key, threshold_value as value, is_enabled FROM alert_rule WHERE (edition_id = $1 OR edition_id IS NULL)`,
            [eid]
        );
        const rules = {};
        for (const row of res.rows) {
            rules[row.rule_key] = { value: Number(row.value), enabled: row.is_enabled };
        }
        return rules;
    } catch {
        return {};
    }
}

// Seed the alert_rule table for an edition with the configured defaults.
// Used when an edition is created (importer) so rules exist before first view.
async function ensureAlertRulesForEdition(editionId) {
    if (!editionId) return;
    let defaults;
    try {
        defaults = require("../../config/alertRuleDefaults");
    } catch {
        return;
    }
    for (const [key, def] of Object.entries(defaults)) {
        const value = typeof def.default === 'number' ? def.default : 0;
        await client.query(
            `INSERT INTO alert_rule (edition_id, rule_key, threshold_value, is_enabled)
             VALUES ($1, $2, $3, true)
             ON CONFLICT (edition_id, rule_key) DO NOTHING`,
            [editionId, key, value]
        );
    }
}

async function getAnonymizationSettings(editionId = null) {
    try {
        const res = await client.query('SELECT is_anonymized, decision_editing_enabled FROM settings LIMIT 1');
        const settings = res.rows[0] || { is_anonymized: false, decision_editing_enabled: false };
        settings.anonymization_prefix = '';

        if (settings.is_anonymized) {
            const eid = await resolveEditionId(editionId);
            if (eid) {
                const confRes = await client.query(`
                    SELECT cs.name, cs.acronym, e.year
                    FROM edition e
                    JOIN conference_series cs ON cs.id = e.conference_id
                    WHERE e.id = $1
                `, [eid]);
                if (confRes.rows.length > 0) {
                    const c = confRes.rows[0];
                    const name = c.acronym || c.name;
                    settings.anonymization_prefix = name ? `${name}_${c.year || ''}`.replace(/_+$/, '').replace(/\s+/g, '_') : '';
                }
            }
        }
        return settings;
    } catch {
        return { is_anonymized: false, anonymization_prefix: '', decision_editing_enabled: false };
    }
}

function maskNames(rows, settings, idKey = 'id') {
    const isAnonymized = settings && settings.is_anonymized;
    const prefix = (settings && settings.anonymization_prefix) ? `${settings.anonymization_prefix}_` : '';

    const shortenSubName = (value) =>
        typeof value === 'string'
            ? value.replace(/Sub-reviewer\s*#?(\d+)/gi, 'Sub #$1')
            : value;

    const maskRow = (row) => {
        if (!row || typeof row !== 'object') return row;
        const newRow = { ...row };

        if (isAnonymized) {
            const role = (newRow.role || newRow.evaluator_role || '').toLowerCase();
            const isSub = role === 'sub-reviewer' || role === 'subreviewer';
            const subId = newRow.external_person_id || newRow[idKey] || newRow.reviewer_id || newRow.id;
            const regId = newRow[idKey] || newRow.reviewer_id || newRow.participant_id || newRow.author_participant_id || newRow.id;

            if (isSub) {
                newRow.first_name = `subnom${subId}`;
                newRow.last_name = `cognom${subId}`;
                newRow.email = `subreviewer_${subId}@example.com`;
                if ('reviewer_name' in newRow) newRow.reviewer_name = `${newRow.first_name} ${newRow.last_name}`;
                if ('reviewer_email' in newRow) newRow.reviewer_email = newRow.email;
            } else {
                newRow.first_name = `${prefix}Reviewer_${regId}`;
                newRow.last_name = '';
                newRow.email = `${prefix}reviewer_${regId}@example.com`;
                if ('reviewer_name' in newRow) newRow.reviewer_name = `${newRow.first_name} ${newRow.last_name}`;
                if ('reviewer_email' in newRow) newRow.reviewer_email = newRow.email;
            }
        } else {
            if (newRow.first_name) newRow.first_name = shortenSubName(newRow.first_name);
            if (newRow.last_name) newRow.last_name = shortenSubName(newRow.last_name);
            if (newRow.reviewer_name) newRow.reviewer_name = shortenSubName(newRow.reviewer_name);
        }
        return newRow;
    };

    if (Array.isArray(rows)) {
        return rows.map(maskRow);
    }
    return maskRow(rows);
}

function buildOrderBy(sort, order, defaultSortClause = 'avg_word_count DESC NULLS LAST') {
    const validSorts = {
        'reviewer_name': 'r.last_name',
        'name': 'r.last_name',
        'email': 'r.email',
        'total_reviews_completed': 'total_reviews_completed',
        'reviews_count': 'total_reviews_completed',
        'avg_score_given': 'avg_score_given',
        'avg_score': 'avg_score_given',
        'avg_confidence': 'avg_confidence',
        'avg_word_count': 'avg_word_count',
        'calibration_index': 'calibration_index',
        'normalized_avg_score': 'normalized_avg_score'
    };

    let clause;
    if (sort && validSorts[sort]) {
        const col = validSorts[sort];
        const dir = (order && order.toUpperCase() === 'ASC') ? 'ASC' : 'DESC';
        clause = `ORDER BY ${col} ${dir} NULLS LAST`;
    } else {
        clause = `ORDER BY ${defaultSortClause}`;
    }
    return { clause };
}

function getFilterModes(options = {}) {
    if (Array.isArray(options.modes)) return options.modes;
    if (Array.isArray(options.filter)) return options.filter;
    if (typeof options.filter === 'string') return [options.filter];
    const modes = [];
    if (options.no_comments || options.filter_no_comments) modes.push('no_comments');
    if (options.has_comments || options.filter_has_comments) modes.push('has_comments');
    if (options.high_variance || options.filter_high_variance) modes.push('high_variance');
    if (options.missed_assignments || options.filter_missed_assignments) modes.push('missed_assignments');
    if (options.has_subreviews || options.filter_has_subreviews) modes.push('has_subreviews');
    if (options.no_subreviews || options.filter_no_subreviews) modes.push('no_subreviews');
    return modes;
}

module.exports = {
    resolveEditionId,
    resolveConferenceId,
    assertSafeNumber,
    getAlertRules,
    ensureAlertRulesForEdition,
    getAnonymizationSettings,
    maskNames,
    buildOrderBy,
    getFilterModes
};
