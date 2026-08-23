const client = require("../config/database");
const { normalizeDecision } = require("../utils/decisionHelper");

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
            if (masked.first_name !== undefined) masked.first_name = `subnom${personId}`;
            if (masked.last_name !== undefined) masked.last_name = `cognom${personId}`;
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

async function getConferenceHealth(conferenceId = null) {
    // If no conferenceId provided, pick the most recently uploaded one
    const cidQuery = conferenceId
        ? `SELECT $1::int AS id`
        : `SELECT id FROM conference ORDER BY uploaded_at DESC LIMIT 1`;
    const cidResult = await client.query(cidQuery, conferenceId ? [conferenceId] : []);
    const cid = cidResult.rows[0]?.id;
    if (!cid) return null;

    const query = `
        SELECT 
            (SELECT COUNT(*) FROM paper WHERE conference_id = $1 AND is_deleted = false) as total_papers,
            (SELECT COUNT(*) FROM program_committee_member WHERE conference_id = $1) as total_reviewers,
            (SELECT COUNT(*) FROM review r JOIN paper p ON r.paper_id = p.id WHERE p.conference_id = $1 AND r.is_superseded = false) as total_reviews,
            (SELECT COUNT(*) FROM assignment a JOIN paper p ON a.paper_id = p.id WHERE p.conference_id = $1) as total_assignments,
            (SELECT ROUND(AVG(r.total_score), 2) FROM review r JOIN paper p ON r.paper_id = p.id WHERE p.conference_id = $1 AND r.is_superseded = false) as average_score,
            (SELECT COUNT(*) FROM program_committee_member WHERE conference_id = $1 AND role = 'Sub-reviewer') as total_sub_reviewers,
            (SELECT name FROM conference WHERE id = $1) as conference_name,
            (SELECT year FROM conference WHERE id = $1) as conference_year
    `;
    const result = await client.query(query, [cid]);
    return { ...result.rows[0], conferenceId: cid };
}

async function getReviewerQuality(options = {}) {
    const cid = await resolveConferenceId(options.conferenceId);
    const settings = options.settings || await getAnonymizationSettings(cid);

    const values = [cid];
    let paramIdx = 2;

    let filterClause = '';
    if (options.filterMode === 'no_comments') {
        filterClause = `AND COALESCE(rc.total_comments, 0) = 0`;
    } else if (options.filterMode === 'has_comments') {
        filterClause = `AND COALESCE(rc.total_comments, 0) > 0`;
    } else if (options.filterMode === 'high_variance') {
        filterClause = `AND ABS(rcal.calibration_index) > 1.5`;
    }

    const { clause: orderClause } = buildOrderBy(options.sortBy, options.sortOrder, 'avg_word_count DESC NULLS LAST');

    const limitVal = parseInt(options.limit) || 'ALL';
    const offsetVal = parseInt(options.offset) || 0;
    let limitClause;
    if (limitVal === 'ALL') {
        limitClause = 'LIMIT ALL';
    } else {
        limitClause = `LIMIT $${paramIdx}`;
        values.push(limitVal);
        paramIdx++;
    }
    const offsetClause = `OFFSET $${paramIdx}`;
    values.push(offsetVal);

    const query = `
        WITH PaperStats AS (
            SELECT r.paper_id, SUM(r.total_score) as sum_score, COUNT(r.id) as review_count
            FROM review r
            JOIN paper p ON r.paper_id = p.id AND p.is_deleted = false
            WHERE r.is_superseded = false AND p.is_deleted = false AND p.conference_id = $1
            GROUP BY r.paper_id
        ),
        ReviewerCalibration AS (
            SELECT 
                pcm.id as program_committee_member_id,
                ROUND(AVG(
                    CASE 
                        WHEN ps.review_count <= 1 THEN r.total_score
                        ELSE ((ps.sum_score - r.total_score) / (ps.review_count - 1))
                    END
                ), 2) as peers_avg,
                ROUND(AVG(
                    CASE 
                        WHEN ps.review_count <= 1 THEN 0
                        ELSE r.total_score - ((ps.sum_score - r.total_score) / (ps.review_count - 1))
                    END
                ), 2) as calibration_index
            FROM review r
            JOIN program_committee_member pcm ON (pcm.id = r.program_committee_member_id OR pcm.external_person_id = r.sub_reviewer_person_id)
            JOIN PaperStats ps ON r.paper_id = ps.paper_id
            WHERE r.is_superseded = false
            GROUP BY pcm.id
            HAVING COUNT(r.id) > 1
        ),
        ReviewerBidding AS (
            SELECT 
                a.program_committee_member_id,
                CASE 
                    WHEN EXISTS (SELECT 1 FROM bid WHERE program_committee_member_id = a.program_committee_member_id AND LOWER(bid) IN ('yes', 'maybe'))
                    THEN ROUND(COUNT(b.id) * 100.0 / NULLIF(COUNT(a.id), 0), 2)
                    ELSE NULL
                END as bidding_match_percentage
            FROM assignment a
            LEFT JOIN bid b ON a.paper_id = b.paper_id 
                AND a.program_committee_member_id = b.program_committee_member_id 
                AND LOWER(b.bid) IN ('yes', 'maybe')
            GROUP BY a.program_committee_member_id
        ),
        ReviewerComments AS (
            SELECT program_committee_member_id, COUNT(*) as total_comments
            FROM comment
            GROUP BY program_committee_member_id
        ),
        ConferenceStats AS (
            SELECT AVG(r.total_score) AS conf_mean, STDDEV(r.total_score) AS conf_std
            FROM review r
            JOIN paper p ON r.paper_id = p.id
            WHERE r.is_superseded = false AND p.is_deleted = false AND p.conference_id = $1
        )
        SELECT 
            COUNT(*) OVER() as full_count,
            pcm.id,
            pcm.external_person_id as reviewer_id,
            pcm.first_name,
            pcm.last_name,
            pcm.role,
            pcm.email,
            COUNT(DISTINCT r.id) as total_reviews_completed,
            ROUND(AVG(cardinality(regexp_split_to_array(trim(r.review_text), '\\s+'))), 0) as avg_word_count,
            ROUND(AVG(r.total_score), 2) as avg_score_given,
            ROUND(STDDEV(r.total_score), 2) as reviewer_std,
            rcal.peers_avg,
            COALESCE(rc.total_comments, 0) as total_comments,
            rb.bidding_match_percentage,
            rcal.calibration_index,
            MAX(cs.conf_mean) AS conf_mean,
            MAX(cs.conf_std) AS conf_std
        FROM program_committee_member pcm
        LEFT JOIN review r ON (pcm.id = r.program_committee_member_id OR pcm.external_person_id = r.sub_reviewer_person_id) AND r.is_superseded = false
        LEFT JOIN ReviewerComments rc ON pcm.id = rc.program_committee_member_id
        LEFT JOIN ReviewerBidding rb ON pcm.id = rb.program_committee_member_id
        LEFT JOIN ReviewerCalibration rcal ON pcm.id = rcal.program_committee_member_id
        CROSS JOIN ConferenceStats cs
        WHERE pcm.conference_id = $1
        ${filterClause}
        GROUP BY pcm.id, pcm.external_person_id, pcm.first_name, pcm.last_name, pcm.role, rc.total_comments, rb.bidding_match_percentage, rcal.peers_avg, rcal.calibration_index
        ${orderClause}
        ${limitClause} ${offsetClause}
    `;
    const result = await client.query(query, values);
    return maskNames(result.rows, settings, 'id');
}

async function getReviewerStatsById(reviewerId) {
    const query = `
        WITH PaperStats AS (
            SELECT r.paper_id, SUM(r.total_score) as sum_score, COUNT(r.id) as review_count
            FROM review r
            JOIN paper p ON r.paper_id = p.id AND p.is_deleted = false
            WHERE r.is_superseded = false AND p.is_deleted = false AND p.conference_id = (SELECT conference_id FROM program_committee_member WHERE id = $1)
            GROUP BY r.paper_id
        ),
        ReviewerCalibration AS (
            SELECT 
                pcm.id as program_committee_member_id,
                ROUND(AVG(
                    CASE 
                        WHEN ps.review_count <= 1 THEN r.total_score
                        ELSE ((ps.sum_score - r.total_score) / (ps.review_count - 1))
                    END
                ), 2) as peers_avg,
                ROUND(AVG(
                    CASE 
                        WHEN ps.review_count <= 1 THEN 0
                        ELSE r.total_score - ((ps.sum_score - r.total_score) / (ps.review_count - 1))
                    END
                ), 2) as calibration_index
            FROM review r
            JOIN program_committee_member pcm ON (pcm.id = r.program_committee_member_id OR pcm.external_person_id = r.sub_reviewer_person_id)
            JOIN PaperStats ps ON r.paper_id = ps.paper_id
            WHERE r.is_superseded = false
            GROUP BY pcm.id
            HAVING COUNT(r.id) > 1
        ),
        ReviewerBidding AS (
            SELECT 
                a.program_committee_member_id,
                CASE 
                    WHEN EXISTS (SELECT 1 FROM bid WHERE program_committee_member_id = a.program_committee_member_id AND LOWER(bid) IN ('yes', 'maybe'))
                    THEN ROUND(COUNT(b.id) * 100.0 / NULLIF(COUNT(a.id), 0), 2)
                    ELSE NULL
                END as bidding_match_percentage
            FROM assignment a
            LEFT JOIN bid b ON a.paper_id = b.paper_id 
                AND a.program_committee_member_id = b.program_committee_member_id 
                AND LOWER(b.bid) IN ('yes', 'maybe')
            GROUP BY a.program_committee_member_id
        ),
        ConferenceStats AS (
            SELECT AVG(r.total_score) AS conf_mean, STDDEV(r.total_score) AS conf_std
            FROM review r
            JOIN paper p ON r.paper_id = p.id
            WHERE r.is_superseded = false AND p.is_deleted = false AND p.conference_id = (SELECT conference_id FROM program_committee_member WHERE id = $1)
        )
        SELECT 
            COUNT(DISTINCT r.id)::int as total_reviews_completed,
            ROUND(AVG(r.total_score), 2) as avg_score_given,
            ROUND(STDDEV(r.total_score), 2) as reviewer_std,
            MAX(rcal.peers_avg) as peers_avg,
            MAX(rcal.calibration_index) as calibration_index,
            MAX(rb.bidding_match_percentage) as bidding_match_percentage,
            MAX(cs.conf_mean) as conf_mean,
            MAX(cs.conf_std) as conf_std
        FROM program_committee_member pcm
        LEFT JOIN review r ON (pcm.id = r.program_committee_member_id OR pcm.external_person_id = r.sub_reviewer_person_id) AND r.is_superseded = false
        LEFT JOIN ReviewerCalibration rcal ON pcm.id = rcal.program_committee_member_id
        LEFT JOIN ReviewerBidding rb ON pcm.id = rb.program_committee_member_id
        CROSS JOIN ConferenceStats cs
        WHERE pcm.id = $1
        GROUP BY pcm.id
    `;
    const result = await client.query(query, [reviewerId]);
    return result.rows[0] || null;
}

async function getSubmissions(options = {}) {
    const cid = await resolveConferenceId(options.conferenceId);
    const settings = await getAnonymizationSettings(cid);

    const values = [cid];
    let paramIdx = 2;

    let filterClause = '';
    if (options.filterMode === 'high_score') {
        filterClause = 'AND r.total_score >= 2';
    } else if (options.filterMode === 'low_score') {
        filterClause = 'AND r.total_score <= -2';
    }

    const { clause: orderClause } = buildOrderBy(options.sortBy, options.sortOrder, 'r.review_date DESC NULLS LAST, r.review_time DESC NULLS LAST');

    const limitVal = parseInt(options.limit) || 'ALL';
    const offsetVal = parseInt(options.offset) || 0;
    let limitClause;
    if (limitVal === 'ALL') {
        limitClause = 'LIMIT ALL';
    } else {
        limitClause = `LIMIT $${paramIdx}`;
        values.push(limitVal);
        paramIdx++;
    }
    const offsetClause = `OFFSET $${paramIdx}`;
    values.push(offsetVal);

    const query = `
        SELECT 
            COUNT(*) OVER() as full_count,
            p.id,
            p.external_submission_id,
            p.title,
            pcm.id as reviewer_id,
            pcm.first_name,
            pcm.last_name,
            r.total_score,
            r.review_date,
            r.review_time
        FROM review r
        JOIN paper p ON r.paper_id = p.id
        JOIN program_committee_member pcm ON r.program_committee_member_id = pcm.id
        WHERE r.is_superseded = false AND p.is_deleted = false AND p.conference_id = $1
        ${filterClause}
        ${orderClause}
        ${limitClause} ${offsetClause}
    `;
    const result = await client.query(query, values);
    return maskNames(result.rows, settings, 'reviewer_id');
}

async function getPaperDebates(options = {}) {
    const cid = await resolveConferenceId(options.conferenceId);

    const values = [cid];
    let paramIdx = 2;

    const excludeDeskNoDecision = !['rejected', 'desk_rejected', 'no_decision'].includes(options.filterMode)
        ? `AND (p.decision_category IS NULL OR (p.decision_category != 'desk reject' AND p.decision_category != 'no decision'))`
        : '';

    let havingClause = 'HAVING 1=1';
    if (options.filterMode === 'no_comments' || options.noComments === 'true') {
        havingClause += ` AND COALESCE((SELECT COUNT(*) FROM comment c WHERE c.paper_id = p.id), 0) = 0`;
    }
    if (options.filterMode === 'high_variance') {
        havingClause += ` AND (MAX(r.total_score) - MIN(r.total_score)) > 2`;
    }
    if (options.filterMode === 'low_variance') {
        havingClause += ` AND (MAX(r.total_score) - MIN(r.total_score)) = 0`;
    }
    if (options.filterMode === 'unanimous_reject') {
        havingClause += ` AND AVG(r.total_score) <= -1.5`;
    }
    if (options.filterMode === 'unanimous_accept') {
        havingClause += ` AND AVG(r.total_score) >= 1.5`;
    }
    if (options.filterMode === 'borderline') {
        havingClause += ` AND AVG(r.total_score) >= -0.5 AND AVG(r.total_score) <= 0.5`;
    }
    if (options.filterMode === 'to_discuss') {
        havingClause += ` AND ((AVG(r.total_score) >= -0.5 AND AVG(r.total_score) <= 0.5) OR (MAX(r.total_score) - MIN(r.total_score)) > 2)`;
    }

    let whereExtra = '';
    if (options.filterMode === 'rejected') {
        whereExtra = `AND MAX(p.decision_category) = 'reject'`;
    } else if (options.filterMode === 'desk_rejected') {
        whereExtra = `AND MAX(p.decision_category) = 'desk reject'`;
    } else if (options.filterMode === 'no_decision') {
        whereExtra = `AND MAX(p.decision_category) = 'no decision'`;
    }

    const { clause: orderClause } = buildOrderBy(options.sortBy, options.sortOrder, 'external_submission_id DESC NULLS LAST');

    const limitVal = parseInt(options.limit) || 'ALL';
    const offsetVal = parseInt(options.offset) || 0;
    let limitClause;
    if (limitVal === 'ALL') {
        limitClause = 'LIMIT ALL';
    } else {
        limitClause = `LIMIT $${paramIdx}`;
        values.push(limitVal);
        paramIdx++;
    }
    const offsetClause = `OFFSET $${paramIdx}`;
    values.push(offsetVal);

    const query = `
        WITH ReviewIdentity AS (
            SELECT r.id AS review_id, r.paper_id, r.total_score,
                   COALESCE(r.sub_reviewer_person_id, pcm.external_person_id) AS reviewer_person_id
            FROM review r
            JOIN program_committee_member pcm ON pcm.id = r.program_committee_member_id
            JOIN paper p ON r.paper_id = p.id
            WHERE r.is_superseded = false
              AND p.is_deleted = false
              AND p.conference_id = $1
        ),
        ReviewerZStats AS (
            SELECT reviewer_person_id,
                   COUNT(*)::int AS review_count,
                   AVG(total_score) AS reviewer_mean,
                   STDDEV(total_score) AS reviewer_std
            FROM ReviewIdentity
            GROUP BY reviewer_person_id
            HAVING COUNT(*) >= 3
        ),
        ConferenceStats AS (
            SELECT AVG(total_score) AS conf_mean, STDDEV(total_score) AS conf_std
            FROM ReviewIdentity
        ),
        NormalizedReviews AS (
            SELECT ri.review_id,
                   CASE WHEN rz.reviewer_std IS NOT NULL AND rz.reviewer_std > 0
                        THEN cs.conf_mean + ((ri.total_score - rz.reviewer_mean) / rz.reviewer_std) * cs.conf_std
                        ELSE ri.total_score
                   END AS adjusted_score
            FROM ReviewIdentity ri
            LEFT JOIN ReviewerZStats rz USING (reviewer_person_id)
            CROSS JOIN ConferenceStats cs
        )
        SELECT 
            COUNT(*) OVER() as full_count,
            p.id,
            p.external_submission_id,
            p.title,
            p.decision,
            p.decision_category,
            COUNT(DISTINCT r.id) as total_reviews,
            ROUND(AVG(r.total_score), 2) as average_score,
            (MAX(r.total_score) - MIN(r.total_score)) as score_spread,
            COALESCE((SELECT COUNT(*) FROM comment c WHERE c.paper_id = p.id), 0) as total_comments,
            ROUND(AVG(nr.adjusted_score), 2) as adjusted_score
        FROM paper p
        LEFT JOIN review r ON p.id = r.paper_id AND r.is_superseded = false
        LEFT JOIN NormalizedReviews nr ON nr.review_id = r.id
        WHERE p.is_deleted = false AND p.conference_id = $1
        ${excludeDeskNoDecision}
        GROUP BY p.id
        ${havingClause}
        ${whereExtra}
        ${orderClause}
        ${limitClause} ${offsetClause}
    `;
    const result = await client.query(query, values);
    return result.rows;
}

async function getExpertiseMismatches(conferenceId = null, settingsArg = null) {
    const cid = await resolveConferenceId(conferenceId);
    const settings = settingsArg || await getAnonymizationSettings(cid);

    const query = `
        SELECT 
            r.id as review_id,
            p.external_submission_id,
            p.title as paper_title,
            pcm.id as reviewer_id,
            pcm.first_name as reviewer_first_name,
            pcm.last_name as reviewer_last_name,
            pcm.email as reviewer_email,
            r.total_score,
            (SELECT STRING_AGG(t.name, ', ') FROM paper_topic pt JOIN topic t ON pt.topic_id = t.id WHERE pt.paper_id = p.id) as paper_topics,
            (SELECT STRING_AGG(t.name, ', ') FROM program_committee_member_topic pcmt JOIN topic t ON pcmt.topic_id = t.id WHERE pcmt.program_committee_member_id = pcm.id) as reviewer_topics
        FROM review r
        JOIN paper p ON r.paper_id = p.id
        JOIN program_committee_member pcm ON r.program_committee_member_id = pcm.id
        WHERE r.is_superseded = false AND p.conference_id = $1
        AND EXISTS (
            SELECT 1 FROM paper_topic pt WHERE pt.paper_id = p.id
        )
        AND EXISTS (
            SELECT 1 FROM program_committee_member_topic pcmt WHERE pcmt.program_committee_member_id = pcm.id
        )
    `;
    const result = await client.query(query, [cid]);
    return maskNames(result.rows, settings, 'reviewer_id');
}

async function getCOIViolations(conferenceId = null, settingsArg = null) {
    const cid = await resolveConferenceId(conferenceId);
    const settings = settingsArg || await getAnonymizationSettings(cid);

    const query = `
        SELECT 
            a.id as assignment_id,
            p.external_submission_id,
            p.title as paper_title,
            pcm.id as reviewer_id,
            pcm.first_name as reviewer_first_name,
            pcm.last_name as reviewer_last_name,
            pcm.email as reviewer_email
        FROM assignment a
        JOIN conflict c ON a.paper_id = c.paper_id AND a.program_committee_member_id = c.program_committee_member_id
        JOIN paper p ON a.paper_id = p.id
        JOIN program_committee_member pcm ON a.program_committee_member_id = pcm.id
        WHERE p.conference_id = $1
    `;
    const result = await client.query(query, [cid]);
    return maskNames(result.rows, settings, 'reviewer_id');
}
async function getMissingMetareviews(conferenceId = null, settingsArg = null) {
    const cid = await resolveConferenceId(conferenceId);
    const settings = settingsArg || await getAnonymizationSettings(cid);

    const query = `
        WITH base AS (
            SELECT p.id,
                   p.external_submission_id,
                   p.title,
                   (MAX(r.total_score) - MIN(r.total_score)) as score_spread
            FROM paper p
            JOIN review r ON p.id = r.paper_id AND r.is_superseded = false
            LEFT JOIN meta_review mr ON p.id = mr.paper_id
            WHERE mr.id IS NULL AND p.is_deleted = false AND p.conference_id = $1
            GROUP BY p.id, p.external_submission_id, p.title
            HAVING (MAX(r.total_score) - MIN(r.total_score)) > 2
        )
        SELECT b.external_submission_id, b.title, b.score_spread,
               pcm.id, pcm.first_name, pcm.last_name, pcm.email
        FROM base b
        JOIN (
            SELECT DISTINCT r.paper_id, r.program_committee_member_id
            FROM review r
            WHERE r.is_superseded = false
        ) rd ON rd.paper_id = b.id
        JOIN program_committee_member pcm ON rd.program_committee_member_id = pcm.id
    `;
    const result = await client.query(query, [cid]);
    const masked = maskNames(result.rows, settings);
    const byPaper = new Map();
    for (const row of masked) {
        if (!byPaper.has(row.external_submission_id)) {
            byPaper.set(row.external_submission_id, {
                external_submission_id: row.external_submission_id,
                title: row.title,
                score_spread: Number(row.score_spread),
                reviewers: [],
            });
        }
        byPaper.get(row.external_submission_id).reviewers.push({
            id: row.id, first_name: row.first_name, last_name: row.last_name, email: row.email,
        });
    }
    return [...byPaper.values()];
}

async function getReviewersForPapers(paperExternalIds, conferenceId = null, settingsArg = null) {
    const cid = await resolveConferenceId(conferenceId);
    const settings = settingsArg || await getAnonymizationSettings(cid);
    const ids = (paperExternalIds || []).map(Number).filter(Number.isFinite);
    if (ids.length === 0) return [];

    const query = `
        SELECT DISTINCT p.external_submission_id, p.title,
               pcm.id as reviewer_id, pcm.first_name, pcm.last_name, pcm.email
        FROM paper p
        JOIN review r ON r.paper_id = p.id AND r.is_superseded = false
        JOIN program_committee_member pcm ON r.program_committee_member_id = pcm.id
        WHERE p.is_deleted = false AND p.conference_id = $1
          AND p.external_submission_id = ANY($2::int[])
    `;
    const result = await client.query(query, [cid, ids]);
    return maskNames(result.rows, settings, 'reviewer_id');
}

async function getPaperDetails(externalSubmissionId, conferenceId = null) {
    const cid = conferenceId ? parseInt(conferenceId) : await resolveConferenceId(null);
    const settings = await getAnonymizationSettings(cid);

    const query = `
        SELECT p.id, p.title, p.external_submission_id,
               (SELECT STRING_AGG(t.name, ', ')
                FROM paper_topic pt
                JOIN topic t ON pt.topic_id = t.id
                WHERE pt.paper_id = p.id) as topics
        FROM paper p
        WHERE p.external_submission_id = $1 AND p.is_deleted = false AND p.conference_id = $2
    `;
    const paperRes = await client.query(query, [externalSubmissionId, cid]);
    if (paperRes.rows.length === 0) return null;
    
    const paper = paperRes.rows[0];

    const reviewsQuery = `
        SELECT r.id, pcm.id as reviewer_id, pcm.first_name, pcm.last_name, r.total_score, r.review_text,
               (SELECT STRING_AGG(t.name, ', ')
                FROM program_committee_member_topic pcmt
                JOIN topic t ON pcmt.topic_id = t.id
                WHERE pcmt.program_committee_member_id = pcm.id) as topics
        FROM review r
        JOIN program_committee_member pcm ON r.program_committee_member_id = pcm.id
        WHERE r.paper_id = $1 AND r.is_superseded = false
    `;
    const reviewsRes = await client.query(reviewsQuery, [paper.id]);
    paper.reviews = maskNames(reviewsRes.rows, settings, 'reviewer_id');

    const commentsQuery = `
        SELECT c.id, pcm.id as reviewer_id, pcm.first_name, pcm.last_name, c.comment_text
        FROM comment c
        JOIN program_committee_member pcm ON c.program_committee_member_id = pcm.id
        WHERE c.paper_id = $1
    `;
    const commentsRes = await client.query(commentsQuery, [paper.id]);
    paper.comments = maskNames(commentsRes.rows, settings, 'reviewer_id');

    return paper;
}

async function getReviewerDetails(reviewerId) {
    const settings = await getAnonymizationSettings();

    const query = `
        SELECT pcm.id, pcm.external_person_id, pcm.first_name, pcm.last_name, pcm.role, pcm.email
        FROM program_committee_member pcm
        WHERE pcm.id = $1
    `;
    const reviewerRes = await client.query(query, [reviewerId]);
    if (reviewerRes.rows.length === 0) return null;

    const reviewer = maskNames(reviewerRes.rows, settings, 'id')[0];

    const assignmentsQuery = `
        SELECT p.external_submission_id, p.title, 
               r.total_score as given_score, 
               r.review_text,
               b.bid as bid_status,
               (
                   SELECT json_agg(c.comment_text)
                   FROM comment c
                   WHERE c.paper_id = p.id AND c.program_committee_member_id = $1
               ) as comments,
               (
                   SELECT AVG(r2.total_score)
                   FROM review r2
                   WHERE r2.paper_id = p.id AND r2.is_superseded = false
               ) as peer_average
        FROM (
            SELECT paper_id FROM assignment WHERE program_committee_member_id = $1
            UNION
            SELECT paper_id FROM review WHERE (program_committee_member_id = $1 OR sub_reviewer_person_id = $2) AND is_superseded = false
            UNION
            SELECT paper_id FROM comment WHERE program_committee_member_id = $1
        ) combined
        JOIN paper p ON combined.paper_id = p.id AND p.is_deleted = false
        LEFT JOIN review r ON combined.paper_id = r.paper_id AND (r.program_committee_member_id = $1 OR r.sub_reviewer_person_id = $2) AND r.is_superseded = false
        LEFT JOIN bid b ON combined.paper_id = b.paper_id AND b.program_committee_member_id = $1
    `;
    const assignmentsRes = await client.query(assignmentsQuery, [reviewer.id, reviewer.external_person_id]);
    reviewer.assignments = assignmentsRes.rows;

    const bidsQuery = `
        SELECT p.external_submission_id, p.title, b.bid
        FROM bid b
        JOIN paper p ON b.paper_id = p.id AND p.is_deleted = false
        WHERE b.program_committee_member_id = $1
    `;
    const bidsRes = await client.query(bidsQuery, [reviewer.id]);
    reviewer.bids = bidsRes.rows;

    return reviewer;
}


async function getAcceptanceRate(conferenceId = null) {
    const cid = await resolveConferenceId(conferenceId);

    const query = `
        SELECT 
            COUNT(CASE WHEN decision_category = 'accept' THEN 1 END) as accepted_papers,
            COUNT(*) as total_papers
        FROM paper
        WHERE is_deleted = false AND conference_id = $1
    `;
    const result = await client.query(query, [cid]);
    return result.rows[0];
}

async function getGeographicDiversity(conferenceId = null) {
    const cid = await resolveConferenceId(conferenceId);
    const query = `
        SELECT 
            country, 
            COUNT(*) as member_count 
        FROM program_committee_member 
        WHERE country IS NOT NULL AND country != '' AND conference_id = $1
        GROUP BY country 
        ORDER BY member_count DESC
    `;
    const result = await client.query(query, [cid]);
    return result.rows;
}

async function getThematicCompetence(conferenceId = null) {
    const cid = await resolveConferenceId(conferenceId);
    const query = `
        SELECT 
            t.name as topic_name, 
            COUNT(DISTINCT pt.paper_id) as submitted_papers,
            COUNT(DISTINCT pcmt.program_committee_member_id) as available_experts
        FROM topic t
        LEFT JOIN paper_topic pt ON t.id = pt.topic_id
        LEFT JOIN program_committee_member_topic pcmt ON t.id = pcmt.topic_id
        WHERE (pt.paper_id IS NULL OR EXISTS (
            SELECT 1 FROM paper p WHERE p.id = pt.paper_id AND p.conference_id = $1
        ))
        AND (pcmt.program_committee_member_id IS NULL OR EXISTS (
            SELECT 1 FROM program_committee_member pcm WHERE pcm.id = pcmt.program_committee_member_id AND pcm.conference_id = $1
        ))
        GROUP BY t.id, t.name
        HAVING COUNT(DISTINCT pt.paper_id) > 0
        ORDER BY submitted_papers DESC
    `;
    const result = await client.query(query, [cid]);
    return result.rows;
}

async function getSystemDistributions(conferenceId = null) {
    const cid = await resolveConferenceId(conferenceId);
    const decisionQuery = `
        SELECT 
            decision_category as decision, 
            COUNT(*) as count
        FROM paper 
        WHERE is_deleted = false AND conference_id = $1
        GROUP BY decision_category
    `;
    
    const scoreQuery = `
        WITH PaperAvgs AS (
            SELECT p.id, ROUND(AVG(r.total_score)) as avg_score
            FROM review r
            JOIN paper p ON r.paper_id = p.id
            WHERE r.is_superseded = false AND p.is_deleted = false AND p.conference_id = $1
            GROUP BY p.id
        )
        SELECT 
            avg_score as rounded_score,
            COUNT(*) as count
        FROM PaperAvgs
        GROUP BY avg_score
    `;
    
    const decisionsResult = await client.query(decisionQuery, [cid]);
    const scoresResult = await client.query(scoreQuery, [cid]);
    
    return {
        decisions: decisionsResult.rows,
        scores: scoresResult.rows
    };
}

async function updatePaperDecision(paperId, newDecision) {
    const query = `
        UPDATE paper 
        SET decision = $1, decision_category = $2
        WHERE id = $3 
        RETURNING *;
    `;
    const result = await client.query(query, [newDecision, normalizeDecision(newDecision), paperId]);
    return result.rows[0];
}

async function getSessionClusters(conferenceId = null) {
    const cid = await resolveConferenceId(conferenceId);
    const query = `
        SELECT 
            t.name as topic_name, 
            p.id as paper_id, 
            p.title as paper_title
        FROM paper p
        JOIN paper_topic pt ON p.id = pt.paper_id
        JOIN topic t ON pt.topic_id = t.id
        WHERE p.decision_category = 'accept' AND p.is_deleted = false AND p.conference_id = $1
        ORDER BY t.name ASC, p.id ASC
    `;
    const result = await client.query(query, [cid]);
    
    // Group by topic_name
    const clusters = {};
    result.rows.forEach(row => {
        if (!clusters[row.topic_name]) {
            clusters[row.topic_name] = [];
        }
        clusters[row.topic_name].push({ id: row.paper_id, title: row.paper_title });
    });
    
    return clusters;
}

async function getTopPapers(conferenceId = null) {
    const cid = await resolveConferenceId(conferenceId);
    const query = `
        SELECT 
            p.id, 
            p.title, 
            ROUND(AVG(r.total_score), 2) as avg_score,
            (MAX(r.total_score) - MIN(r.total_score)) as spread
        FROM paper p
        JOIN review r ON p.id = r.paper_id AND r.is_superseded = false
        WHERE p.is_deleted = false AND p.conference_id = $1
        GROUP BY p.id, p.title
        HAVING AVG(r.total_score) >= 1.5 AND (MAX(r.total_score) - MIN(r.total_score)) <= 2
        ORDER BY AVG(r.total_score) DESC, (MAX(r.total_score) - MIN(r.total_score)) ASC
        LIMIT 5
    `;
    const result = await client.query(query, [cid]);
    return result.rows;
}

async function getTopReviewers(conferenceId = null) {
    const cid = await resolveConferenceId(conferenceId);
    const settings = await getAnonymizationSettings(cid);
    
    const query = `
        WITH PaperStats AS (
            SELECT r.paper_id, SUM(r.total_score) as sum_score, COUNT(r.id) as review_count
            FROM review r
            JOIN paper p ON r.paper_id = p.id AND p.is_deleted = false
            WHERE r.is_superseded = false AND p.is_deleted = false AND p.conference_id = $1
            GROUP BY r.paper_id
        ),
        AvgScores AS (
            SELECT p.paper_id, (CAST(p.sum_score AS FLOAT) / p.review_count) as avg_score
            FROM PaperStats p
            WHERE p.review_count > 0
        ),
        ReviewerStats AS (
            SELECT 
                pcm.id as reviewer_id,
                COUNT(r.id) as reviews_done,
                AVG(array_length(regexp_split_to_array(r.review_text, '\\s+'), 1)) as avg_word_count,
                AVG(r.total_score - a.avg_score) as calibration_index
            FROM review r
            JOIN program_committee_member pcm ON (pcm.id = r.program_committee_member_id OR pcm.external_person_id = r.sub_reviewer_person_id)
            JOIN AvgScores a ON r.paper_id = a.paper_id
            WHERE r.is_superseded = false
            GROUP BY pcm.id
        )
        SELECT 
            pcm.id,
            pcm.first_name,
            pcm.last_name,
            rs.reviews_done,
            ROUND(CAST(rs.avg_word_count AS NUMERIC), 0) as avg_word_count,
            ROUND(CAST(rs.calibration_index AS NUMERIC), 2) as calibration_index
        FROM ReviewerStats rs
        JOIN program_committee_member pcm ON rs.reviewer_id = pcm.id
        WHERE ABS(rs.calibration_index) <= 1.5 AND pcm.conference_id = $1
        ORDER BY rs.reviews_done DESC, rs.avg_word_count DESC
        LIMIT 5
    `;
    const result = await client.query(query, [cid]);
    return maskNames(result.rows, settings, 'id');
}

async function getSentimentMismatches(conferenceId = null, settingsArg = null) {
    const cid = await resolveConferenceId(conferenceId);
    const settings = settingsArg || await getAnonymizationSettings(cid);
    const query = `
        SELECT 
            r.id,
            p.external_submission_id,
            p.title as paper_title,
            pcm.id as reviewer_id,
            pcm.first_name || ' ' || pcm.last_name as reviewer_name,
            pcm.email as reviewer_email,
            r.total_score,
            r.sentiment_score
        FROM review r
        JOIN paper p ON r.paper_id = p.id
        JOIN program_committee_member pcm ON r.program_committee_member_id = pcm.id
        WHERE r.total_score <= 1 AND r.sentiment_score >= 10 AND r.is_superseded = false
        AND p.conference_id = $1
    `;
    const result = await client.query(query, [cid]);
    return maskNames(result.rows, settings, 'reviewer_id');
}

module.exports = {
    getConferenceHealth,
    getReviewerQuality,
    getReviewerStatsById,
    getSubmissions,
    getPaperDebates,
    getExpertiseMismatches,
    getCOIViolations,
    getMissingMetareviews,
    getPaperDetails,
    getReviewerDetails,
    getAcceptanceRate,
    getGeographicDiversity,
    getThematicCompetence,
    getSystemDistributions,
    updatePaperDecision,
    getSessionClusters,
    getTopPapers,
    getTopReviewers,
    getSentimentMismatches,
    getReviewersForPapers,
    getAnonymizationSettings
};
