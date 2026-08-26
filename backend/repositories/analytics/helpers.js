const client = require("../../config/database");

// Helper: resolve conferenceId — defaults to most recently uploaded conference
async function resolveConferenceId(conferenceId) {
    if (conferenceId) return parseInt(conferenceId);
    const result = await client.query(
        `SELECT id FROM conference ORDER BY uploaded_at DESC LIMIT 1`
    );
    return result.rows[0]?.id || null;
}

async function getAnonymizationSettings(conferenceId = null) {
    try {
        const res = await client.query('SELECT is_anonymized, decision_editing_enabled FROM settings LIMIT 1');
        const settings = res.rows[0] || { is_anonymized: false, decision_editing_enabled: false };
        settings.anonymization_prefix = '';
        
        if (settings.is_anonymized) {
            const cId = await resolveConferenceId(conferenceId);
            if (cId) {
                const confRes = await client.query('SELECT short_name, name, year FROM conference WHERE id = $1', [cId]);
                if (confRes.rows.length > 0) {
                    const c = confRes.rows[0];
                    const name = c.short_name || c.name;
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
    const isAnonymized = settings.is_anonymized;
    const prefix = settings.anonymization_prefix ? `${settings.anonymization_prefix}_` : '';
    
    return rows.map(row => {
        const id = row[idKey];
        const personId = row.reviewer_id || row.external_person_id || id;
        const masked = { ...row };

        if (masked.role === 'Sub-reviewer') {
            if (isAnonymized && masked.first_name !== undefined) masked.first_name = `subnom${personId}`;
            if (isAnonymized && masked.last_name !== undefined) masked.last_name = `cognom${personId}`;
            if (isAnonymized && masked.email !== undefined) masked.email = `subreviewer_${personId}@example.com`;
        } else if (isAnonymized) {
            if (masked.first_name !== undefined) masked.first_name = `${prefix}Reviewer_${id}`;
            if (masked.last_name !== undefined) masked.last_name = '';
            if (masked.email !== undefined) masked.email = `${prefix}reviewer_${id}@example.com`;
        }

        if (isAnonymized) {
            if (masked.reviewer_first_name !== undefined) masked.reviewer_first_name = `${prefix}Reviewer_${id}`;
            if (masked.reviewer_last_name !== undefined) masked.reviewer_last_name = '';
            if (masked.reviewer_name !== undefined) masked.reviewer_name = `${prefix}Reviewer_${id} `;
            if (masked.reviewer_email !== undefined) masked.reviewer_email = `${prefix}reviewer_${id}@example.com`;
        }
        
        // Handle sub-reviewer in review object
        if (masked.sub_reviewer_first_name && isAnonymized) {
            const subId = masked.sub_reviewer_person_id || personId;
            masked.sub_reviewer_first_name = `subnom${subId}`;
            masked.sub_reviewer_last_name = `cognom${subId}`;
            masked.sub_reviewer_email = `subreviewer_${subId}@example.com`;
        }
        
        return masked;
    });
}

const ALLOWED_SORT_COLUMNS = new Set([
    'id', 'external_submission_id', 'title', 'total_reviews', 'average_score',
    'score_spread', 'total_comments', 'reviewer_id', 'first_name', 'last_name',
    'total_reviews_completed', 'avg_word_count', 'avg_score_given', 'total_comments',
    'calibration_index', 'peers_avg', 'review_date', 'total_score', 'adjusted_score'
]);

function buildOrderBy(sortBy, sortOrder, defaultOrder) {
    if (sortBy && ALLOWED_SORT_COLUMNS.has(sortBy)) {
        const dir = (sortOrder && sortOrder.toUpperCase() === 'ASC') ? 'ASC' : 'DESC';
        return { clause: `ORDER BY ${sortBy} ${dir} NULLS LAST`, param: null };
    }
    return { clause: `ORDER BY ${defaultOrder}`, param: null };
}

module.exports = {
    resolveConferenceId,
    getAnonymizationSettings,
    maskNames,
    buildOrderBy
};
