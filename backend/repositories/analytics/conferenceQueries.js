const client = require("../../config/database");
const { resolveConferenceId } = require("./helpers");

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

module.exports = {
    getConferenceHealth,
    getAcceptanceRate,
    getGeographicDiversity,
    getThematicCompetence,
    getSystemDistributions,
    getSessionClusters
};
