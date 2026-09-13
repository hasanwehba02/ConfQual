const client = require("../../config/database");
const { resolveEditionId, getAnonymizationSettings, maskNames } = require("./helpers");

async function getSummaryMetrics(editionId = null) {
    const eid = await resolveEditionId(editionId);
    const query = `
        SELECT
            (SELECT COUNT(*) FROM paper WHERE is_deleted = false AND edition_id = $1) as total_submissions,
            (SELECT COUNT(*) FROM paper WHERE decision_category = 'accept' AND is_deleted = false AND edition_id = $1) as accepted_submissions,
            (SELECT COUNT(*) FROM paper WHERE decision_category = 'reject' AND is_deleted = false AND edition_id = $1) as rejected_submissions,
            (SELECT COUNT(*) FROM paper WHERE decision_category = 'desk_reject' AND is_deleted = false AND edition_id = $1) as desk_reject_submissions,
            (SELECT COUNT(*) FROM paper WHERE decision_category = 'withdrawn' AND is_deleted = false AND edition_id = $1) as withdrawn_submissions,
            (SELECT COUNT(*) FROM paper WHERE (decision_category = 'no_decision' OR decision_category IS NULL) AND is_deleted = false AND edition_id = $1) as no_decision_submissions,
            (SELECT COUNT(*) FROM participant WHERE edition_id = $1) as total_pc_members,
            (SELECT COUNT(*) FROM review r JOIN paper p ON r.paper_id = p.id WHERE r.is_superseded = false AND p.edition_id = $1) as total_reviews,
            (SELECT ROUND(AVG(total_score), 2) FROM review r JOIN paper p ON r.paper_id = p.id WHERE r.is_superseded = false AND p.edition_id = $1) as overall_avg_score,
            (SELECT ROUND(STDDEV(total_score), 2) FROM review r JOIN paper p ON r.paper_id = p.id WHERE r.is_superseded = false AND p.edition_id = $1) as score_std_dev,
            (SELECT COUNT(*) FROM alert_rule WHERE is_enabled = true AND edition_id = $1) as total_alerts_configured
    `;
    const result = await client.query(query, [eid]);
    return result.rows[0];
}

async function getConferenceHealth(editionId = null) {
    const eid = await resolveEditionId(editionId);
    if (!eid) return null;

    const query = `
        SELECT
            e.id as "conferenceId",
            cs.name as conference_name,
            e.year as conference_year,
            (SELECT COUNT(*) FROM paper WHERE is_deleted = false AND edition_id = e.id) as total_papers,
            (SELECT COUNT(DISTINCT participant_id) FROM assignment a JOIN paper p ON a.paper_id = p.id WHERE p.edition_id = e.id) as total_reviewers,
            (SELECT COUNT(*) FROM review r JOIN paper p ON r.paper_id = p.id WHERE r.is_superseded = false AND p.edition_id = e.id) as total_reviews,
            (SELECT COUNT(*) FROM assignment a JOIN paper p ON a.paper_id = p.id WHERE p.edition_id = e.id) as total_assignments,
            (SELECT COUNT(DISTINCT ev.participant_id) FROM evaluator ev JOIN participant pt ON ev.participant_id = pt.id WHERE ev.evaluator_role = 'subreviewer' AND pt.edition_id = e.id) as total_sub_reviewers,
            (SELECT ROUND(AVG(r.total_score), 2) FROM review r JOIN paper p ON r.paper_id = p.id WHERE r.is_superseded = false AND p.edition_id = e.id) as average_score
        FROM edition e
        JOIN conference_series cs ON cs.id = e.conference_id
        WHERE e.id = $1
    `;
    const result = await client.query(query, [eid]);
    return result.rows[0] || null;
}

async function getAcceptanceRate(editionId = null) {
    const eid = await resolveEditionId(editionId);
    const query = `
        SELECT
            COUNT(*) as total,
            COUNT(CASE WHEN decision_category = 'accept' THEN 1 END) as accepted,
            COUNT(CASE WHEN decision_category = 'reject' THEN 1 END) as rejected
        FROM paper
        WHERE is_deleted = false AND edition_id = $1
    `;
    const result = await client.query(query, [eid]);
    const row = result.rows[0] || { total: 0, accepted: 0, rejected: 0 };
    const total = parseInt(row.total) || 0;
    const accepted = parseInt(row.accepted) || 0;
    const rate = total > 0 ? (accepted / total) * 100 : 0;
    return {
        total_submissions: total,
        accepted_submissions: accepted,
        rejected_submissions: parseInt(row.rejected) || 0,
        acceptance_rate: parseFloat(rate.toFixed(2))
    };
}

async function getGeographicDiversity(editionId = null) {
    const eid = await resolveEditionId(editionId);
    const query = `
        SELECT
            COALESCE(r.country, 'Unknown') as country,
            COUNT(DISTINCT p.id) as participant_count
        FROM participant p
        JOIN researcher r ON r.id = p.researcher_id
        WHERE p.edition_id = $1
        GROUP BY COALESCE(r.country, 'Unknown')
        ORDER BY participant_count DESC
    `;
    const result = await client.query(query, [eid]);
    return result.rows;
}

async function getSessionClusters(_editionId = null) {
    return [];
}

async function getReviewerExpertiseSummary(editionId = null) {
    const eid = await resolveEditionId(editionId);
    const settings = await getAnonymizationSettings(eid);

    const query = `
        SELECT
            p.id as reviewer_id,
            r.first_name,
            r.last_name,
            COALESCE(NULLIF(r.email, ''), CASE WHEN ev.evaluator_role = 'subreviewer' THEN CONCAT('subreviewer_', p.id, '@example.com') ELSE CONCAT('reviewer_', p.id, '@example.com') END) as email,
            COUNT(DISTINCT a.paper_id) as total_assignments,
            COUNT(DISTINCT rv.id) as reviews_completed,
            ROUND(AVG(rv.total_score), 2) as reviewer_avg_score,
            (
                SELECT ROUND(AVG(other_rv.total_score), 2)
                FROM review other_rv
                WHERE other_rv.paper_id IN (
                    SELECT paper_id FROM review WHERE participant_id = p.id AND is_superseded = false
                )
                AND other_rv.participant_id != p.id
                AND other_rv.is_superseded = false
            ) as peer_avg_score
        FROM participant p
        JOIN researcher r ON r.id = p.researcher_id
        LEFT JOIN evaluator ev ON ev.participant_id = p.id
        LEFT JOIN assignment a ON a.participant_id = p.id
        LEFT JOIN review rv ON rv.participant_id = p.id AND rv.is_superseded = false
        WHERE p.edition_id = $1
        GROUP BY p.id, r.first_name, r.last_name, r.email, ev.evaluator_role
        HAVING COUNT(DISTINCT rv.id) > 0
    `;
    const result = await client.query(query, [eid]);
    return maskNames(result.rows, settings, 'reviewer_id');
}

async function getThematicCompetence(editionId = null) {
    const eid = await resolveEditionId(editionId);
    const query = `
        SELECT
            t.name as topic_name,
            COUNT(DISTINCT pt.paper_id) as submitted_papers,
            COUNT(DISTINCT pct.participant_id) as available_experts
        FROM topic t
        LEFT JOIN paper_topic pt ON t.id = pt.topic_id
            AND EXISTS (SELECT 1 FROM paper p WHERE p.id = pt.paper_id AND p.edition_id = $1)
        LEFT JOIN participant_topic pct ON pct.topic_id = t.id
            AND EXISTS (SELECT 1 FROM participant pa WHERE pa.id = pct.participant_id AND pa.edition_id = $1)
        GROUP BY t.id, t.name
        HAVING COUNT(DISTINCT pt.paper_id) > 0
        ORDER BY submitted_papers DESC
    `;
    const result = await client.query(query, [eid]);
    return result.rows;
}

async function getSystemDistributions(editionId = null) {
    const eid = await resolveEditionId(editionId);
    const decisionQuery = `
        SELECT
            decision_category as decision,
            COUNT(*) as count
        FROM paper
        WHERE is_deleted = false AND edition_id = $1
        GROUP BY decision_category
    `;

    const scoreQuery = `
        WITH PaperAvgs AS (
            SELECT p.id, ROUND(AVG(r.total_score)) as avg_score
            FROM review r
            JOIN paper p ON r.paper_id = p.id
            WHERE r.is_superseded = false AND p.is_deleted = false AND p.edition_id = $1
            GROUP BY p.id
        )
        SELECT avg_score as score, COUNT(*) as count
        FROM PaperAvgs
        WHERE avg_score IS NOT NULL
        GROUP BY avg_score
        ORDER BY avg_score ASC
    `;

    const [decisions, scores] = await Promise.all([
        client.query(decisionQuery, [eid]),
        client.query(scoreQuery, [eid])
    ]);

    return {
        decisions: decisions.rows,
        scores: scores.rows
    };
}

module.exports = {
    getSummaryMetrics,
    getConferenceHealth,
    getAcceptanceRate,
    getGeographicDiversity,
    getSessionClusters,
    getReviewerExpertiseSummary,
    getThematicCompetence,
    getSystemDistributions
};
