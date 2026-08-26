const client = require("../../config/database");
const { normalizeDecision } = require("../../utils/decisionHelper");
const { resolveConferenceId, getAnonymizationSettings, maskNames, buildOrderBy } = require("./helpers");

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
            r.review_time,
            r.is_superseded
        FROM review r
        JOIN paper p ON r.paper_id = p.id
        JOIN program_committee_member pcm ON r.program_committee_member_id = pcm.id
        WHERE p.is_deleted = false AND p.conference_id = $1
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

async function getPaperDetails(externalSubmissionId, conferenceId = null) {
    const cid = conferenceId ? parseInt(conferenceId) : await resolveConferenceId(null);
    const settings = await getAnonymizationSettings(cid);

    const query = `
        SELECT p.id, p.title, p.external_submission_id,
               (SELECT STRING_AGG(t.name, ', ')
                FROM paper_topic pt
                JOIN topic t ON pt.topic_id = t.id
                WHERE pt.paper_id = p.id) as topics,
               EXISTS(
                SELECT 1 FROM meta_review mr
                WHERE mr.paper_id = p.id
               ) as has_metareview
        FROM paper p
        WHERE p.external_submission_id = $1 AND p.is_deleted = false AND p.conference_id = $2
    `;
    const paperRes = await client.query(query, [externalSubmissionId, cid]);
    if (paperRes.rows.length === 0) return null;
    
    const paper = paperRes.rows[0];

    const reviewsQuery = `
        SELECT r.id, pcm.id as reviewer_id, pcm.first_name, pcm.last_name, pcm.role,
               COALESCE(NULLIF(pcm.email, ''), CASE WHEN pcm.role = 'Sub-reviewer' THEN CONCAT('subreviewer_', pcm.id, '@example.com') ELSE CONCAT('reviewer_', pcm.id, '@example.com') END) as email,
               r.total_score, r.review_text,
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
        SELECT c.id, pcm.id as reviewer_id, pcm.first_name, pcm.last_name, pcm.role,
               COALESCE(NULLIF(pcm.email, ''), CASE WHEN pcm.role = 'Sub-reviewer' THEN CONCAT('subreviewer_', pcm.id, '@example.com') ELSE CONCAT('reviewer_', pcm.id, '@example.com') END) as email,
               c.comment_text
        FROM comment c
        JOIN program_committee_member pcm ON c.program_committee_member_id = pcm.id
        WHERE c.paper_id = $1
    `;
    const commentsRes = await client.query(commentsQuery, [paper.id]);
    paper.comments = maskNames(commentsRes.rows, settings, 'reviewer_id');

    return paper;
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

module.exports = {
    getSubmissions,
    getPaperDebates,
    getPaperDetails,
    updatePaperDecision,
    getTopPapers
};
