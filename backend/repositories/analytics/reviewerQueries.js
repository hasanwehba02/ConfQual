const client = require("../../config/database");
const { resolveConferenceId, getAnonymizationSettings, maskNames, buildOrderBy } = require("./helpers");

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
