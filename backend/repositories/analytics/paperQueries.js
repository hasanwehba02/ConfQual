const client = require("../../config/database");
const { resolveEditionId, getAnonymizationSettings, maskNames } = require("./helpers");

async function getPapersList(filters = {}, editionId = null) {
    const eid = await resolveEditionId(editionId || filters);
    const {
        page = 1,
        limit = 50,
        decision,
        hasConflict,
        sortBy = 'p.external_submission_id',
        sortOrder = 'ASC'
    } = filters;

    const offset = (page - 1) * limit;
    const values = [eid];
    let paramIndex = 2;

    let whereClause = `WHERE p.is_deleted = false AND p.edition_id = $1`;

    if (decision) {
        whereClause += ` AND p.decision_category = $${paramIndex}`;
        values.push(decision);
        paramIndex++;
    }

    if (hasConflict === 'true') {
        whereClause += ` AND EXISTS (SELECT 1 FROM conflict c WHERE c.paper_id = p.id)`;
    } else if (hasConflict === 'false') {
        whereClause += ` AND NOT EXISTS (SELECT 1 FROM conflict c WHERE c.paper_id = p.id)`;
    }

    // Dynamic sorting
    const allowedSortColumns = {
        'id': 'p.id',
        'external_submission_id': 'p.external_submission_id',
        'title': 'p.title',
        'decision': 'p.decision_category',
        'avg_score': 'avg_score',
        'review_count': 'review_count'
    };

    const sortCol = allowedSortColumns[sortBy] || 'p.external_submission_id';
    const sortDir = sortOrder.toUpperCase() === 'DESC' ? 'DESC' : 'ASC';

    // Count query
    const countQuery = `
        SELECT COUNT(*) as total
        FROM paper p
        ${whereClause}
    `;

    // Data query with aggregated reviews and authors
    const dataQuery = `
        SELECT
            p.id,
            p.external_submission_id,
            p.title,
            p.decision_category as decision,
            COUNT(DISTINCT r.id) as review_count,
            ROUND(AVG(r.total_score), 2) as avg_score,
            (SELECT COUNT(*) FROM conflict c WHERE c.paper_id = p.id) as conflict_count,
            (SELECT COUNT(*) FROM comment c WHERE c.paper_id = p.id) as comment_count,
            EXISTS(SELECT 1 FROM meta_review mr WHERE mr.paper_id = p.id) as has_metareview,
            (
                SELECT STRING_AGG(t.name, ', ')
                FROM paper_topic pt
                JOIN topic t ON pt.topic_id = t.id
                WHERE pt.paper_id = p.id
            ) as topics
        FROM paper p
        LEFT JOIN review r ON r.paper_id = p.id AND r.is_superseded = false
        ${whereClause}
        GROUP BY p.id
        ORDER BY ${sortCol} ${sortDir}
        LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `;

    values.push(limit, offset);

    const [countRes, dataRes] = await Promise.all([
        client.query(countQuery, values.slice(0, paramIndex - 1)),
        client.query(dataQuery, values)
    ]);

    return {
        total: parseInt(countRes.rows[0].total),
        page: parseInt(page),
        limit: parseInt(limit),
        items: dataRes.rows
    };
}

async function getPaperDebates(editionId = null) {
    const eid = await resolveEditionId(editionId);
    const query = `
        SELECT
            p.id,
            p.external_submission_id,
            p.title,
            p.decision_category,
            COUNT(DISTINCT r.id) as total_reviews,
            COUNT(DISTINCT c.id) as total_comments,
            ROUND(AVG(r.total_score), 2) as average_score,
            ROUND(AVG(r.total_score), 2) as adjusted_score,
            ROUND(STDDEV(r.total_score), 2) as score_std_dev,
            MAX(r.total_score) - MIN(r.total_score) as score_spread,
            ARRAY_AGG(DISTINCT r.total_score) as scores,
            (SELECT COUNT(*) FROM assignment a WHERE a.paper_id = p.id) as total_assigned
        FROM paper p
        JOIN review r ON r.paper_id = p.id AND r.is_superseded = false
        LEFT JOIN comment c ON c.paper_id = p.id
        WHERE p.is_deleted = false AND p.edition_id = $1
        GROUP BY p.id
        HAVING COUNT(DISTINCT r.id) >= 2
        ORDER BY score_spread DESC NULLS LAST
    `;
    const result = await client.query(query, [eid]);
    return result.rows;
}

async function getSubmissions(options = {}) {
    const eid = await resolveEditionId(options);
    const settings = await getAnonymizationSettings(eid);

    const values = [eid];
    let paramIdx = 2;

    // Support filterMode params passed by the frontend (high_score / low_score)
    let filterClause = '';
    const rawModes = options.modes || options.filter || [];
    const subModes = Array.isArray(rawModes) ? rawModes : [rawModes];
    if (subModes.includes('high_score')) {
        filterClause += ' AND r.total_score >= 2';
    }
    if (subModes.includes('low_score')) {
        filterClause += ' AND r.total_score <= -2';
    }

    // Sorting by review date/time by default (matches frontend 'review_date_desc')
    let orderClause = 'ORDER BY r.review_date DESC NULLS LAST, r.review_time DESC NULLS LAST';
    const sort = options.sortBy;
    const order = options.sortOrder;
    if (sort) {
        const validSorts = {
            review_date: 'r.review_date',
            review_time: 'r.review_time',
            total_score: 'r.total_score',
            reviewer_name: 'r.last_name',
            external_submission_id: 'p.external_submission_id'
        };
        if (validSorts[sort]) {
            const dir = (order && order.toUpperCase() === 'ASC') ? 'ASC' : 'DESC';
            orderClause = `ORDER BY ${validSorts[sort]} ${dir} NULLS LAST`;
        }
    }

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
            pt.id as reviewer_id,
            r.id as review_id,
            res.first_name,
            res.last_name,
            r.total_score,
            r.review_date,
            r.review_time,
            r.is_superseded
        FROM review r
        JOIN paper p ON r.paper_id = p.id
        JOIN participant pt ON r.participant_id = pt.id
        JOIN researcher res ON pt.researcher_id = res.id
        WHERE p.is_deleted = false AND p.edition_id = $1
        ${filterClause}
        ${orderClause}
        ${limitClause} ${offsetClause}
    `;
    const result = await client.query(query, values);
    return maskNames(result.rows, settings, 'reviewer_id');
}

async function getTopPapers(editionId = null, limit = 5) {
    const eid = await resolveEditionId(editionId);
    const query = `
        SELECT
            p.id,
            p.external_submission_id,
            p.title,
            p.decision_category as decision,
            ROUND(AVG(r.total_score), 2) as avg_score,
            COUNT(DISTINCT r.id) as review_count
        FROM paper p
        JOIN review r ON r.paper_id = p.id AND r.is_superseded = false
        WHERE p.is_deleted = false AND p.edition_id = $1
        GROUP BY p.id
        ORDER BY avg_score DESC NULLS LAST
        LIMIT $2
    `;
    const result = await client.query(query, [eid, limit]);
    return result.rows;
}

async function updatePaperDecision(paperId, decisionCategory) {
    const query = `
        UPDATE paper
        SET decision_category = $1
        WHERE id = $2
        RETURNING *
    `;
    const result = await client.query(query, [decisionCategory, paperId]);
    return result.rows[0] || null;
}

async function getPapersViewList(params = {}, editionId = null) {
    const eid = await resolveEditionId(editionId || params);
    const {
        sort = 'submission',
        order = 'asc',
        limit = 50,
        offset = 0,
        search = '',
        filter_spread = false,
        filter_reviews = false,
        filter_conflict = false,
        filter_metareview = false,
        filter_discussion = false,
        filter_outlier = false,
        filter_author_bias = false,
        filter_single_perspective = false,
        filter_uncalibrated = false,
        hide_desk_no_decision = false,
    } = params;

    const values = [eid];
    let paramIdx = 2;

    const conditions = [];
    if (search) {
        conditions.push(`(p.title ILIKE $${paramIdx} OR CAST(p.external_submission_id AS TEXT) ILIKE $${paramIdx})`);
        values.push(`%${search}%`);
        paramIdx++;
    }

    const havingConditions = [];
    if (filter_spread) {
        havingConditions.push(`(MAX(rv.total_score) - MIN(rv.total_score)) >= 1.5`);
    }
    if (filter_reviews) {
        havingConditions.push(`COUNT(DISTINCT rv.id) < 3`);
    }
    if (filter_conflict) {
        havingConditions.push(`EXISTS (SELECT 1 FROM conflict c WHERE c.paper_id = p.id)`);
    }
    if (filter_metareview) {
        havingConditions.push(`NOT EXISTS (SELECT 1 FROM meta_review mr WHERE mr.paper_id = p.id)`);
    }
    if (filter_discussion) {
        havingConditions.push(`(MAX(rv.total_score) - MIN(rv.total_score)) >= 1.5 AND (SELECT COUNT(*) FROM comment cm WHERE cm.paper_id = p.id) = 0`);
    }
    if (filter_outlier) {
        havingConditions.push(`EXISTS (
            SELECT 1 FROM review r_sub
            WHERE r_sub.paper_id = p.id AND r_sub.is_superseded = false
            AND ABS(r_sub.total_score - (
                SELECT AVG(r_other.total_score) FROM review r_other
                WHERE r_other.paper_id = p.id AND r_other.id != r_sub.id AND r_other.is_superseded = false
            )) >= 2.0
        )`);
    }
    if (filter_author_bias) {
        havingConditions.push(`EXISTS (
            SELECT 1 FROM paper_author_new pa
            JOIN participant p_author ON p_author.id = pa.participant_id
            WHERE pa.paper_id = p.id
            AND EXISTS (
                SELECT 1 FROM person_conflict pc
                WHERE (pc.person1_id = p_author.researcher_id OR pc.person2_id = p_author.researcher_id)
            )
        )`);
    }
    if (filter_single_perspective) {
        havingConditions.push(`(
            SELECT COUNT(DISTINCT res.country)
            FROM review r_sub
            JOIN participant pt_sub ON r_sub.participant_id = pt_sub.id
            JOIN researcher res ON res.id = pt_sub.researcher_id
            WHERE r_sub.paper_id = p.id AND r_sub.is_superseded = false AND res.country IS NOT NULL AND res.country != ''
        ) = 1 AND COUNT(DISTINCT rv.id) >= 2`);
    }
    if (filter_uncalibrated) {
        havingConditions.push(`EXISTS (
            SELECT 1 FROM review r_sub
            JOIN NormalizedReviews nr_sub ON nr_sub.review_id = r_sub.id
            WHERE r_sub.paper_id = p.id AND r_sub.is_superseded = false
            AND ABS(r_sub.total_score - nr_sub.normalized_score) >= 1.0
        )`);
    }

    const sortMap = {
        submission: 'p.external_submission_id',
        title: 'p.title',
        authors: 'authors',
        avg_score: 'avg_score',
        normalized_avg: 'normalized_avg',
        review_count: 'review_count',
        assignment_count: 'assignment_count',
        spread: 'spread',
        decision: 'p.decision_category'
    };
    const sortField = sortMap[sort] || 'p.external_submission_id';
    const sortDirection = (order && order.toLowerCase() === 'desc') ? 'DESC' : 'ASC';
    const orderClause = `ORDER BY ${sortField} ${sortDirection} NULLS LAST`;

    const limitClause = limit ? `LIMIT $${paramIdx++}` : '';
    if (limit) values.push(limit);
    const offsetClause = offset ? `OFFSET $${paramIdx}` : '';
    if (offset) values.push(offset);

    const whereExtra = conditions.length > 0 ? `AND ${conditions.join(' AND ')}` : '';
    const havingClause = havingConditions.length > 0 ? `HAVING ${havingConditions.join(' AND ')}` : '';

    const excludeDeskNoDecision = hide_desk_no_decision
        ? `AND p.decision_category NOT IN ('desk_reject', 'no_decision', 'withdrawn')`
        : '';

    const query = `
        WITH ReviewerStats AS (
            SELECT
                r.participant_id,
                AVG(r.total_score) as rev_mean,
                STDDEV_SAMP(r.total_score) as rev_std,
                COUNT(r.id) as rev_count
            FROM review r
            JOIN paper p ON r.paper_id = p.id
            WHERE r.is_superseded = false AND p.is_deleted = false AND p.edition_id = $1
            GROUP BY r.participant_id
            HAVING COUNT(r.id) >= 3 AND STDDEV_SAMP(r.total_score) > 0
        ),
        ConfStats AS (
            SELECT
                AVG(r.total_score) as conf_mean,
                STDDEV_SAMP(r.total_score) as conf_std
            FROM review r
            JOIN paper p ON r.paper_id = p.id
            WHERE r.is_superseded = false AND p.is_deleted = false AND p.edition_id = $1
        ),
        NormalizedReviews AS (
            SELECT
                r.id as review_id,
                r.paper_id,
                r.total_score as raw_score,
                CASE
                    WHEN rs.rev_count >= 3 AND rs.rev_std > 0 AND cs.conf_std > 0 THEN
                        ROUND(CAST(cs.conf_mean + ((r.total_score - rs.rev_mean) / rs.rev_std) * cs.conf_std AS numeric), 2)
                    ELSE r.total_score
                END as normalized_score
            FROM review r
            JOIN paper p ON r.paper_id = p.id
            CROSS JOIN ConfStats cs
            LEFT JOIN ReviewerStats rs ON r.participant_id = rs.participant_id
            WHERE r.is_superseded = false AND p.is_deleted = false AND p.edition_id = $1
        )
        SELECT
            p.id,
            p.external_submission_id,
            p.title,
            p.decision_category as decision_category,
            COUNT(DISTINCT a.id) as assignment_count,
            COUNT(DISTINCT rv.id) as review_count,
            ROUND(AVG(rv.total_score), 2) as avg_score,
            ROUND(AVG(nr.normalized_score), 2) as normalized_avg,
            (MAX(rv.total_score) - MIN(rv.total_score)) as spread,
            (
                SELECT STRING_AGG(CONCAT(res.first_name, ' ', res.last_name), ', ')
                FROM paper_author_new pa
                JOIN participant pt ON pa.participant_id = pt.id
                JOIN researcher res ON res.id = pt.researcher_id
                WHERE pa.paper_id = p.id
            ) as authors
        FROM paper p
        LEFT JOIN assignment a ON a.paper_id = p.id
        LEFT JOIN review rv ON p.id = rv.paper_id AND rv.is_superseded = false
        LEFT JOIN NormalizedReviews nr ON nr.review_id = rv.id
        WHERE p.is_deleted = false AND p.edition_id = $1
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

async function getPaperDetails(externalSubmissionId, editionId = null) {
    const eid = await resolveEditionId(editionId);
    const settings = await getAnonymizationSettings(eid);

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
        WHERE p.external_submission_id = $1 AND p.is_deleted = false AND p.edition_id = $2
    `;
    const paperRes = await client.query(query, [externalSubmissionId, eid]);
    if (paperRes.rows.length === 0) return null;

    const paper = paperRes.rows[0];

    const reviewsQuery = `
        SELECT rv.id, pt.id as reviewer_id, r.first_name, r.last_name, ev.evaluator_role as role,
               COALESCE(NULLIF(r.email, ''), CASE WHEN ev.evaluator_role = 'subreviewer' THEN CONCAT('subreviewer_', pt.id, '@example.com') ELSE CONCAT('reviewer_', pt.id, '@example.com') END) as email,
               rv.total_score, rv.review_text,
               NULL as topics
        FROM review rv
        JOIN participant pt ON rv.participant_id = pt.id
        JOIN researcher r ON r.id = pt.researcher_id
        LEFT JOIN evaluator ev ON ev.participant_id = pt.id
        WHERE rv.paper_id = $1 AND rv.is_superseded = false
    `;
    const reviewsRes = await client.query(reviewsQuery, [paper.id]);
    paper.reviews = maskNames(reviewsRes.rows, settings, 'reviewer_id');

    const commentsQuery = `
        SELECT c.id, pt.id as reviewer_id, r.first_name, r.last_name, ev.evaluator_role as role,
               COALESCE(NULLIF(r.email, ''), CASE WHEN ev.evaluator_role = 'subreviewer' THEN CONCAT('subreviewer_', pt.id, '@example.com') ELSE CONCAT('reviewer_', pt.id, '@example.com') END) as email,
               c.comment_text
        FROM comment c
        JOIN participant pt ON c.participant_id = pt.id
        JOIN researcher r ON r.id = pt.researcher_id
        LEFT JOIN evaluator ev ON ev.participant_id = pt.id
        WHERE c.paper_id = $1
    `;
    const commentsRes = await client.query(commentsQuery, [paper.id]);
    paper.comments = maskNames(commentsRes.rows, settings, 'reviewer_id');

    const authorsQuery = `
        SELECT res.first_name, res.last_name, res.email, res.country, res.affiliation, pa.author_order, pa.is_corresponding
        FROM paper_author_new pa
        JOIN participant pt ON pa.participant_id = pt.id
        JOIN researcher res ON res.id = pt.researcher_id
        WHERE pa.paper_id = $1
        ORDER BY pa.author_order ASC
    `;
    const authorsRes = await client.query(authorsQuery, [paper.id]);
    paper.authors = maskNames(authorsRes.rows, settings);

    const conflictsQuery = `
        SELECT res.first_name, res.last_name, res.email
        FROM conflict cf
        JOIN participant pt ON cf.participant_id = pt.id
        JOIN researcher res ON res.id = pt.researcher_id
        WHERE cf.paper_id = $1
    `;
    const conflictsRes = await client.query(conflictsQuery, [paper.id]);
    paper.conflicts = maskNames(conflictsRes.rows, settings);

    return paper;
}

module.exports = {
    getPapersList,
    getPaperDebates,
    getSubmissions,
    getTopPapers,
    updatePaperDecision,
    getPapersViewList,
    getPaperDetails
};
