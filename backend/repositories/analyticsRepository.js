const client = require("../config/database");

function buildOrderBy(sortBy, sortOrder, defaultOrder, allowedSortCols) {
    if (sortBy && allowedSortCols.includes(sortBy)) {
        const dir = (sortOrder && sortOrder.toUpperCase() === 'ASC') ? 'ASC' : 'DESC';
        return `ORDER BY ${sortBy} ${dir} NULLS LAST`;
    }
    return `ORDER BY ${defaultOrder}`;
}

async function getConferenceHealth() {
    const query = `
        SELECT 
            (SELECT COUNT(*) FROM paper WHERE is_deleted = false) as total_papers,
            (SELECT COUNT(*) FROM program_committee_member) as total_reviewers,
            (SELECT COUNT(*) FROM review WHERE is_superseded = false) as total_reviews,
            (SELECT COUNT(*) FROM assignment) as total_assignments,
            (SELECT ROUND(AVG(total_score), 2) FROM review WHERE is_superseded = false) as average_score,
            (SELECT COUNT(*) FROM program_committee_member WHERE role = 'Sub-reviewer') as total_sub_reviewers
    `;
    const result = await client.query(query);
    return result.rows[0];
}

async function getReviewerQuality(options = {}) {
    const query = `
        WITH PaperStats AS (
            SELECT r.paper_id, SUM(r.total_score) as sum_score, COUNT(r.id) as review_count
            FROM review r
            JOIN paper p ON r.paper_id = p.id AND p.is_deleted = false
            WHERE r.is_superseded = false AND p.is_deleted = false
            GROUP BY r.paper_id
        ),
        ReviewerCalibration AS (
            SELECT 
                r.program_committee_member_id,
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
            JOIN PaperStats ps ON r.paper_id = ps.paper_id
            WHERE r.is_superseded = false
            GROUP BY r.program_committee_member_id
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
        )
        SELECT 
            pcm.id,
            pcm.first_name,
            pcm.last_name,
            pcm.role,
            COUNT(DISTINCT r.id) as total_reviews_completed,
            ROUND(AVG(cardinality(regexp_split_to_array(trim(r.review_text), '\\s+'))), 0) as avg_word_count,
            ROUND(AVG(r.total_score), 2) as avg_score_given,
            rcal.peers_avg,
            COALESCE(rc.total_comments, 0) as total_comments,
            rb.bidding_match_percentage,
            rcal.calibration_index
        FROM program_committee_member pcm
        LEFT JOIN review r ON pcm.id = r.program_committee_member_id AND r.is_superseded = false
        LEFT JOIN ReviewerComments rc ON pcm.id = rc.program_committee_member_id
        LEFT JOIN ReviewerBidding rb ON pcm.id = rb.program_committee_member_id
        LEFT JOIN ReviewerCalibration rcal ON pcm.id = rcal.program_committee_member_id
        WHERE 1=1
        ${options.filterMode === 'no_comments' ? 'AND COALESCE(rc.total_comments, 0) = 0' : ''}
        ${options.filterMode === 'has_comments' ? 'AND COALESCE(rc.total_comments, 0) > 0' : ''}
        ${options.filterMode === 'high_variance' ? 'AND ABS(rcal.calibration_index) > 1.5' : ''}
        GROUP BY pcm.id, pcm.first_name, pcm.last_name, pcm.role, rc.total_comments, rb.bidding_match_percentage, rcal.peers_avg, rcal.calibration_index
        ${buildOrderBy(options.sortBy, options.sortOrder, 'avg_word_count DESC NULLS LAST', ['id', 'first_name', 'last_name', 'total_reviews_completed', 'avg_word_count', 'avg_score_given', 'total_comments', 'calibration_index', 'peers_avg'])}
    `;
    const result = await client.query(query);
    return result.rows;
}

async function getSubmissions(options = {}) {
    const query = `
        SELECT 
            p.id,
            p.external_submission_id as paper_id,
            p.title as paper_title,
            pcm.first_name || ' ' || pcm.last_name as reviewer_name,
            r.total_score,
            r.review_date,
            r.review_time
        FROM review r
        JOIN paper p ON r.paper_id = p.id
        JOIN program_committee_member pcm ON r.program_committee_member_id = pcm.id
        WHERE r.is_superseded = false AND p.is_deleted = false
        ${options.filterMode === 'high_score' ? 'AND r.total_score >= 2' : ''}
        ${options.filterMode === 'low_score' ? 'AND r.total_score <= -2' : ''}
        ${buildOrderBy(options.sortBy, options.sortOrder, 'r.review_date DESC NULLS LAST, r.review_time DESC NULLS LAST', ['id', 'review_date', 'total_score'])}
    `;
    const result = await client.query(query);
    return result.rows;
}

async function getPaperDebates(options = {}) {
    const query = `
        SELECT 
            p.id,
            p.external_submission_id,
            p.title,
            p.decision,
            COUNT(DISTINCT r.id) as total_reviews,
            ROUND(AVG(r.total_score), 2) as average_score,
            ROUND(VARIANCE(r.total_score), 2) as score_variance,
            COALESCE((SELECT COUNT(*) FROM comment c WHERE c.paper_id = p.id), 0) as total_comments
        FROM paper p
        LEFT JOIN review r ON p.id = r.paper_id AND r.is_superseded = false
        WHERE p.is_deleted = false
        GROUP BY p.id
        HAVING 1=1
        ${options.filterMode === 'no_comments' || options.noComments === 'true' ? 'AND COALESCE((SELECT COUNT(*) FROM comment c WHERE c.paper_id = p.id), 0) = 0' : ''}
        ${options.filterMode === 'high_variance' ? 'AND VARIANCE(r.total_score) > 1.0' : ''}
        ${options.filterMode === 'low_variance' ? 'AND VARIANCE(r.total_score) < 0.2' : ''}
        ${options.filterMode === 'unanimous_reject' ? 'AND AVG(r.total_score) <= -1.5' : ''}
        ${options.filterMode === 'unanimous_accept' ? 'AND AVG(r.total_score) >= 1.5' : ''}
        ${buildOrderBy(options.sortBy, options.sortOrder, 'score_variance DESC NULLS LAST, total_comments DESC', ['id', 'external_submission_id', 'title', 'total_reviews', 'average_score', 'score_variance', 'total_comments'])}
    `;
    const result = await client.query(query);
    return result.rows;
}

async function getExpertiseMismatches() {
    const query = `
        SELECT 
            r.id as review_id,
            p.external_submission_id,
            p.title as paper_title,
            pcm.first_name as reviewer_first_name,
            pcm.last_name as reviewer_last_name,
            r.total_score,
            (SELECT STRING_AGG(t.name, ', ') FROM paper_topic pt JOIN topic t ON pt.topic_id = t.id WHERE pt.paper_id = p.id) as paper_topics,
            (SELECT STRING_AGG(t.name, ', ') FROM program_committee_member_topic pcmt JOIN topic t ON pcmt.topic_id = t.id WHERE pcmt.program_committee_member_id = pcm.id) as reviewer_topics
        FROM review r
        JOIN paper p ON r.paper_id = p.id
        JOIN program_committee_member pcm ON r.program_committee_member_id = pcm.id
        WHERE r.is_superseded = false 
        AND EXISTS (
            SELECT 1 FROM paper_topic pt WHERE pt.paper_id = p.id
        )
        AND EXISTS (
            SELECT 1 FROM program_committee_member_topic pcmt WHERE pcmt.program_committee_member_id = pcm.id
        )
    `;
    const result = await client.query(query);
    return result.rows;
}

async function getCOIViolations() {
    const query = `
        SELECT 
            a.id as assignment_id,
            p.external_submission_id,
            p.title as paper_title,
            pcm.first_name as reviewer_first_name,
            pcm.last_name as reviewer_last_name
        FROM assignment a
        JOIN conflict c ON a.paper_id = c.paper_id AND a.program_committee_member_id = c.program_committee_member_id
        JOIN paper p ON a.paper_id = p.id AND p.is_deleted = false
        JOIN program_committee_member pcm ON a.program_committee_member_id = pcm.id
    `;
    const result = await client.query(query);
    return result.rows;
}

async function getMissingMetareviews() {
    const query = `
        SELECT 
            p.external_submission_id,
            p.title,
            ROUND(VARIANCE(r.total_score), 2) as score_variance
        FROM paper p
        JOIN review r ON p.id = r.paper_id AND r.is_superseded = false
        LEFT JOIN meta_review mr ON p.id = mr.paper_id
        WHERE mr.id IS NULL AND p.is_deleted = false
        GROUP BY p.id, p.external_submission_id, p.title
        HAVING VARIANCE(r.total_score) > 1.0
    `;
    const result = await client.query(query);
    return result.rows;
}

async function getPaperDetails(externalSubmissionId) {
    const query = `
        SELECT p.id, p.title, p.external_submission_id,
               (SELECT STRING_AGG(t.name, ', ')
                FROM paper_topic pt
                JOIN topic t ON pt.topic_id = t.id
                WHERE pt.paper_id = p.id) as topics
        FROM paper p
        WHERE p.external_submission_id = $1 AND p.is_deleted = false
    `;
    const paperRes = await client.query(query, [externalSubmissionId]);
    if (paperRes.rows.length === 0) return null;
    
    const paper = paperRes.rows[0];

    const reviewsQuery = `
        SELECT r.id, pcm.first_name, pcm.last_name, r.total_score, r.review_text,
               (SELECT STRING_AGG(t.name, ', ')
                FROM program_committee_member_topic pcmt
                JOIN topic t ON pcmt.topic_id = t.id
                WHERE pcmt.program_committee_member_id = pcm.id) as topics
        FROM review r
        JOIN program_committee_member pcm ON r.program_committee_member_id = pcm.id
        WHERE r.paper_id = $1 AND r.is_superseded = false
    `;
    const reviewsRes = await client.query(reviewsQuery, [paper.id]);
    paper.reviews = reviewsRes.rows;

    const commentsQuery = `
        SELECT c.id, pcm.first_name, pcm.last_name, c.comment_text
        FROM comment c
        JOIN program_committee_member pcm ON c.program_committee_member_id = pcm.id
        WHERE c.paper_id = $1
    `;
    const commentsRes = await client.query(commentsQuery, [paper.id]);
    paper.comments = commentsRes.rows;

    return paper;
}

async function getReviewerDetails(reviewerId) {
    const query = `
        SELECT pcm.id, pcm.first_name, pcm.last_name, pcm.role, pcm.email
        FROM program_committee_member pcm
        WHERE pcm.id = $1
    `;
    const reviewerRes = await client.query(query, [reviewerId]);
    if (reviewerRes.rows.length === 0) return null;

    const reviewer = reviewerRes.rows[0];

    const assignmentsQuery = `
        SELECT p.external_submission_id, p.title, 
               r.total_score as given_score, 
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
            SELECT paper_id, program_committee_member_id FROM assignment WHERE program_committee_member_id = $1
            UNION
            SELECT paper_id, program_committee_member_id FROM review WHERE program_committee_member_id = $1 AND is_superseded = false
            UNION
            SELECT paper_id, program_committee_member_id FROM comment WHERE program_committee_member_id = $1
        ) combined
        JOIN paper p ON combined.paper_id = p.id AND p.is_deleted = false
        LEFT JOIN review r ON combined.paper_id = r.paper_id AND combined.program_committee_member_id = r.program_committee_member_id AND r.is_superseded = false
        LEFT JOIN bid b ON combined.paper_id = b.paper_id AND combined.program_committee_member_id = b.program_committee_member_id
    `;
    const assignmentsRes = await client.query(assignmentsQuery, [reviewer.id]);
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

async function getAcceptanceRate() {
    const query = `
        SELECT 
            COUNT(CASE WHEN decision ILIKE '%accept%' THEN 1 END) as accepted_papers,
            COUNT(*) as total_papers
        FROM paper
        WHERE is_deleted = false
    `;
    const result = await client.query(query);
    return result.rows[0];
}

async function getGeographicDiversity() {
    const query = `
        SELECT 
            country, 
            COUNT(*) as member_count 
        FROM program_committee_member 
        WHERE country IS NOT NULL AND country != ''
        GROUP BY country 
        ORDER BY member_count DESC
    `;
    const result = await client.query(query);
    return result.rows;
}

async function getThematicCompetence() {
    const query = `
        SELECT 
            t.name as topic_name, 
            COUNT(DISTINCT pt.paper_id) as submitted_papers,
            COUNT(DISTINCT pcmt.program_committee_member_id) as available_experts
        FROM topic t
        LEFT JOIN paper_topic pt ON t.id = pt.topic_id
        LEFT JOIN program_committee_member_topic pcmt ON t.id = pcmt.topic_id
        GROUP BY t.id, t.name
        HAVING COUNT(DISTINCT pt.paper_id) > 0
        ORDER BY submitted_papers DESC
    `;
    const result = await client.query(query);
    return result.rows;
}

module.exports = {
    getConferenceHealth,
    getReviewerQuality,
    getPaperDebates,
    getExpertiseMismatches,
    getCOIViolations,
    getMissingMetareviews,
    getPaperDetails,
    getReviewerDetails,
    getAcceptanceRate,
    getGeographicDiversity,
    getThematicCompetence,
    getSubmissions
};
