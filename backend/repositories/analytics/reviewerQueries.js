const client = require("../../config/database");
const { resolveEditionId, getAnonymizationSettings, maskNames, buildOrderBy, getFilterModes } = require("./helpers");

async function getReviewerQuality(options = {}) {
    const eid = await resolveEditionId(options.editionId);
    const settings = options.settings || await getAnonymizationSettings(eid);

    const values = [eid];
    let paramIdx = 2;

    let filterClause = '';
    const modes = getFilterModes(options);
    const { getAlertRules: _getRules, assertSafeNumber: _assert } = require("./helpers");
    const _rules = await _getRules(eid);
    const _th = (k) => _assert(_rules[k]?.value ?? require('../../config/alertRuleDefaults')[k].default, k);
    if (modes.includes('no_comments')) {
        filterClause += ` AND COALESCE(rc.total_comments, 0) = 0`;
    }
    if (modes.includes('has_comments')) {
        filterClause += ` AND COALESCE(rc.total_comments, 0) > 0`;
    }
    if (modes.includes('high_variance')) {
        const v = _th('reviewer.high_calibration_abs');
        filterClause += ` AND ABS(rcal.calibration_index) > ${v}`;
    }
    if (modes.includes('missed_assignments')) {
        filterClause += ` AND COALESCE(ast.missed_reviews, 0) > 0`;
    }
    if (modes.includes('has_subreviews')) {
        filterClause += ` AND COALESCE(sc.sub_reviewer_count, 0) > 0`;
    }
    if (modes.includes('no_subreviews')) {
        filterClause += ` AND ev.evaluator_role <> 'subreviewer' AND COALESCE(sc.sub_reviewer_count, 0) = 0`;
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
        WITH PaperStats AS (\n            SELECT r.paper_id, SUM(r.total_score) as sum_score, COUNT(r.id) as review_count
            FROM review r
            JOIN paper p ON r.paper_id = p.id AND p.is_deleted = false
            WHERE r.is_superseded = false AND p.is_deleted = false AND p.edition_id = $1
            GROUP BY r.paper_id
        ),
        ReviewerCalibration AS (
            SELECT
                pt.id as participant_id,
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
            JOIN paper p ON r.paper_id = p.id
            JOIN participant pt ON pt.id = r.participant_id
            JOIN PaperStats ps ON r.paper_id = ps.paper_id
            WHERE r.is_superseded = false
            GROUP BY pt.id
            HAVING COUNT(r.id) > 1
        ),
        ReviewerBidding AS (
            SELECT
                a.participant_id,
                CASE
                    WHEN EXISTS (SELECT 1 FROM bid WHERE participant_id = a.participant_id AND LOWER(bid) IN ('yes', 'maybe'))
                    THEN ROUND(COUNT(b.id) * 100.0 / NULLIF(COUNT(a.id), 0), 2)
                    ELSE NULL
                END as bidding_match_percentage
            FROM assignment a
            JOIN paper abp ON abp.id = a.paper_id AND abp.edition_id = $1
            LEFT JOIN bid b ON a.paper_id = b.paper_id
                AND a.participant_id = b.participant_id
                AND LOWER(b.bid) IN ('yes', 'maybe')
            GROUP BY a.participant_id
        ),
        ReviewerComments AS (
            SELECT participant_id, COUNT(*) as total_comments
            FROM comment
            GROUP BY participant_id
        ),
        ConferenceStats AS (
            SELECT AVG(r.total_score) AS conf_mean, STDDEV(r.total_score) AS conf_std
            FROM review r
            JOIN paper p ON r.paper_id = p.id
            WHERE r.is_superseded = false AND p.is_deleted = false AND p.edition_id = $1
        ),
        SubReviewerParent AS (
            SELECT DISTINCT ON (r.sub_reviewer_person_id)
                r.sub_reviewer_person_id,
                parent.id AS parent_participant_id,
                parent.external_person_id AS parent_reviewer_id,
                pr.first_name AS parent_first_name,
                pr.last_name AS parent_last_name
            FROM review r
            JOIN paper p ON p.id = r.paper_id AND p.edition_id = $1
            JOIN participant parent ON parent.id = r.participant_id
            JOIN researcher pr ON pr.id = parent.researcher_id
            WHERE r.sub_reviewer_person_id IS NOT NULL AND r.is_superseded = false
            ORDER BY r.sub_reviewer_person_id, parent.id
        ),
        SubCounts AS (
            SELECT x.parent_participant_id,
                   COUNT(*) AS sub_reviewer_count,
                   string_agg(x.sub_name, ', ' ORDER BY x.sub_name) AS sub_reviewer_names
            FROM (
                SELECT DISTINCT r.sub_reviewer_person_id, r.participant_id AS parent_participant_id,
                       sr.first_name || ' ' || sr.last_name AS sub_name
                FROM review r
                JOIN paper p ON p.id = r.paper_id AND p.edition_id = $1
                JOIN participant sp ON sp.edition_id = $1 AND sp.external_person_id = r.sub_reviewer_person_id
                JOIN researcher sr ON sr.id = sp.researcher_id
                WHERE r.sub_reviewer_person_id IS NOT NULL AND r.is_superseded = false
            ) x
            GROUP BY x.parent_participant_id
        ),
        AssignStats AS (
            SELECT a.participant_id,
                   COUNT(DISTINCT a.paper_id) AS total_assigned,
                   COUNT(DISTINCT rv.paper_id) AS total_delivered,
                   GREATEST(COUNT(DISTINCT a.paper_id) - COUNT(DISTINCT rv.paper_id), 0) AS missed_reviews
            FROM assignment a
            JOIN paper p ON p.id = a.paper_id AND p.edition_id = $1
            LEFT JOIN review rv ON rv.paper_id = a.paper_id
                AND rv.participant_id = a.participant_id
                AND rv.is_superseded = false
            GROUP BY a.participant_id
        )
        SELECT
            COUNT(*) OVER() as full_count,
            pt.id,
            pt.external_person_id as reviewer_id,
            r.first_name,
            r.last_name,
            ev.evaluator_role as role,
            r.email,
            COUNT(DISTINCT rv.id) as total_reviews_completed,
            ROUND(AVG(cardinality(regexp_split_to_array(trim(rv.review_text), '\\s+'))), 0) as avg_word_count,
            ROUND(AVG(rv.total_score), 2) as avg_score_given,
            ROUND(STDDEV(rv.total_score), 2) as reviewer_std,
            rcal.peers_avg,
            COALESCE(rc.total_comments, 0) as total_comments,
            rb.bidding_match_percentage,
            rcal.calibration_index,
            MAX(cs.conf_mean) AS conf_mean,
            MAX(cs.conf_std) AS conf_std,
            srp.parent_participant_id,
            srp.parent_reviewer_id,
            srp.parent_first_name,
            srp.parent_last_name,
            COALESCE(sc.sub_reviewer_count, 0) AS sub_reviewer_count,
            sc.sub_reviewer_names,
            COALESCE(ast.total_assigned, 0) AS total_assigned,
            COALESCE(ast.missed_reviews, 0) AS missed_reviews
        FROM participant pt
        JOIN researcher r ON r.id = pt.researcher_id
        LEFT JOIN evaluator ev ON ev.participant_id = pt.id
        LEFT JOIN review rv ON (pt.id = rv.participant_id) AND rv.is_superseded = false
        LEFT JOIN ReviewerComments rc ON pt.id = rc.participant_id
        LEFT JOIN ReviewerBidding rb ON pt.id = rb.participant_id
        LEFT JOIN ReviewerCalibration rcal ON pt.id = rcal.participant_id
        LEFT JOIN SubReviewerParent srp ON srp.sub_reviewer_person_id = pt.external_person_id
        LEFT JOIN SubCounts sc ON sc.parent_participant_id = pt.id
        LEFT JOIN AssignStats ast ON ast.participant_id = pt.id
        CROSS JOIN ConferenceStats cs
        WHERE pt.edition_id = $1
        ${filterClause}
        GROUP BY pt.id, pt.external_person_id, r.first_name, r.last_name, ev.evaluator_role, r.email, rc.total_comments, rb.bidding_match_percentage, rcal.peers_avg, rcal.calibration_index,
                 srp.parent_participant_id, srp.parent_reviewer_id, srp.parent_first_name, srp.parent_last_name,
                 sc.sub_reviewer_count, sc.sub_reviewer_names, ast.total_assigned, ast.missed_reviews
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
            WHERE r.is_superseded = false AND p.is_deleted = false
              AND p.edition_id = (SELECT edition_id FROM participant WHERE id = $1)
            GROUP BY r.paper_id
        ),
        ReviewerCalibration AS (
            SELECT
                pt.id as participant_id,
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
            JOIN participant pt ON pt.id = r.participant_id
            JOIN PaperStats ps ON r.paper_id = ps.paper_id
            WHERE r.is_superseded = false
            GROUP BY pt.id
            HAVING COUNT(r.id) > 1
        ),
        ReviewerBidding AS (
            SELECT
                a.participant_id,
                CASE
                    WHEN EXISTS (SELECT 1 FROM bid WHERE participant_id = a.participant_id AND LOWER(bid) IN ('yes', 'maybe'))
                    THEN ROUND(COUNT(b.id) * 100.0 / NULLIF(COUNT(a.id), 0), 2)
                    ELSE NULL
                END as bidding_match_percentage
            FROM assignment a
            LEFT JOIN bid b ON a.paper_id = b.paper_id
                AND a.participant_id = b.participant_id
                AND LOWER(b.bid) IN ('yes', 'maybe')
            GROUP BY a.participant_id
        ),
        ConferenceStats AS (
            SELECT AVG(r.total_score) AS conf_mean, STDDEV(r.total_score) AS conf_std
            FROM review r
            JOIN paper p ON r.paper_id = p.id
            WHERE r.is_superseded = false AND p.is_deleted = false
              AND p.edition_id = (SELECT edition_id FROM participant WHERE id = $1)
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
        FROM participant pt
        LEFT JOIN review r ON (pt.id = r.participant_id) AND r.is_superseded = false
        LEFT JOIN ReviewerCalibration rcal ON pt.id = rcal.participant_id
        LEFT JOIN ReviewerBidding rb ON pt.id = rb.participant_id
        CROSS JOIN ConferenceStats cs
        WHERE pt.id = $1
        GROUP BY pt.id
    `;
    const result = await client.query(query, [reviewerId]);
    return result.rows[0] || null;
}

async function getTopReviewers(editionId = null) {
    const eid = await resolveEditionId(editionId);
    const settings = await getAnonymizationSettings(eid);

    const query = `
        WITH PaperStats AS (
            SELECT r.paper_id, SUM(r.total_score) as sum_score, COUNT(r.id) as review_count
            FROM review r
            JOIN paper p ON r.paper_id = p.id AND p.is_deleted = false
            WHERE r.is_superseded = false AND p.is_deleted = false AND p.edition_id = $1
            GROUP BY r.paper_id
        ),
        AvgScores AS (
            SELECT p.paper_id, (CAST(p.sum_score AS FLOAT) / p.review_count) as avg_score
            FROM PaperStats p
            WHERE p.review_count > 0
        ),
        ReviewerStats AS (
            SELECT
                pt.id as participant_id,
                COUNT(r.id) as reviews_done,
                AVG(array_length(regexp_split_to_array(r.review_text, '\\s+'), 1)) as avg_word_count,
                AVG(r.total_score - a.avg_score) as calibration_index
            FROM review r
            JOIN participant pt ON pt.id = r.participant_id
            JOIN AvgScores a ON r.paper_id = a.paper_id
            WHERE r.is_superseded = false
            GROUP BY pt.id
        )
        SELECT
            pt.id,
            r.first_name,
            r.last_name,
            rs.reviews_done,
            ROUND(CAST(rs.avg_word_count AS NUMERIC), 0) as avg_word_count,
            ROUND(CAST(rs.calibration_index AS NUMERIC), 2) as calibration_index
        FROM ReviewerStats rs
        JOIN participant pt ON rs.participant_id = pt.id
        JOIN researcher r ON r.id = pt.researcher_id
        WHERE ABS(rs.calibration_index) <= 1.5 AND pt.edition_id = $1
        ORDER BY rs.reviews_done DESC, rs.avg_word_count DESC
        LIMIT 5
    `;
    const result = await client.query(query, [eid]);
    return maskNames(result.rows, settings, 'id');
}

async function getReviewerDetails(reviewerId, editionId = null) {
    const settings = await getAnonymizationSettings(editionId);

    const query = `
        SELECT pt.id, pt.external_person_id, r.first_name, r.last_name, ev.evaluator_role as role, r.email
        FROM participant pt
        JOIN researcher r ON r.id = pt.researcher_id
        LEFT JOIN evaluator ev ON ev.participant_id = pt.id
        WHERE pt.id = $1
    `;
    const reviewerRes = await client.query(query, [reviewerId]);
    if (reviewerRes.rows.length === 0) return null;

    const reviewer = maskNames(reviewerRes.rows, settings, 'id')[0];

    const assignmentsQuery = `
        SELECT p.external_submission_id, p.title,
               rv.total_score as given_score,
               rv.review_text,
               b.bid as bid_status,
               (
                   SELECT json_agg(c.comment_text)
                   FROM comment c
                   WHERE c.paper_id = p.id AND c.participant_id = $1
               ) as comments,
               (
                   SELECT AVG(rv2.total_score)
                   FROM review rv2
                   WHERE rv2.paper_id = p.id AND rv2.is_superseded = false
               ) as peer_average
        FROM (
            SELECT paper_id FROM assignment WHERE participant_id = $1
            UNION
            SELECT paper_id FROM review WHERE participant_id = $1 AND is_superseded = false
            UNION
            SELECT paper_id FROM comment WHERE participant_id = $1
        ) combined
        JOIN paper p ON combined.paper_id = p.id AND p.is_deleted = false
        LEFT JOIN review rv ON combined.paper_id = rv.paper_id AND rv.participant_id = $1 AND rv.is_superseded = false
        LEFT JOIN bid b ON combined.paper_id = b.paper_id AND b.participant_id = $1
    `;
    const assignmentsRes = await client.query(assignmentsQuery, [reviewer.id]);
    reviewer.assignments = assignmentsRes.rows;

    const bidsQuery = `
        SELECT p.external_submission_id, p.title, b.bid
        FROM bid b
        JOIN paper p ON b.paper_id = p.id AND p.is_deleted = false
        WHERE b.participant_id = $1
    `;
    const bidsRes = await client.query(bidsQuery, [reviewer.id]);
    reviewer.bids = bidsRes.rows;

    const reviewsWithText = (reviewer.assignments || []).filter(a => a.review_text && typeof a.review_text === "string");
    if (reviewsWithText.length > 0) {
        const totalWords = reviewsWithText.reduce((acc, a) => {
            const words = a.review_text.trim().split(/\s+/).filter(Boolean).length;
            return acc + words;
        }, 0);
        reviewer.avg_word_count = Math.round(totalWords / reviewsWithText.length);
    } else {
        reviewer.avg_word_count = null;
    }

    return reviewer;
}

module.exports = {
    getReviewerQuality,
    getReviewerStatsById,
    getTopReviewers,
    getReviewerDetails
};
