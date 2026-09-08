const client = require("../../config/database");
const { resolveEditionId, getAnonymizationSettings, maskNames } = require("./helpers");

async function getExpertiseMismatches(editionId = null, settingsArg = null) {
    const eid = await resolveEditionId(editionId);
    const settings = settingsArg || await getAnonymizationSettings(eid);

    const query = `
        SELECT
            rv.id as review_id,
            p.external_submission_id,
            p.title as paper_title,
            pt.id as reviewer_id,
            r.first_name as reviewer_first_name,
            r.last_name as reviewer_last_name,
            r.email as reviewer_email,
            rv.total_score,
            (SELECT STRING_AGG(t.name, ', ') FROM paper_topic pt2 JOIN topic t ON pt2.topic_id = t.id WHERE pt2.paper_id = p.id) as paper_topics,
            (SELECT STRING_AGG(t.name, ', ') FROM evaluator ev JOIN topic t ON TRUE WHERE ev.participant_id = pt.id) as reviewer_topics
        FROM review rv
        JOIN paper p ON rv.paper_id = p.id
        JOIN participant pt ON rv.participant_id = pt.id
        JOIN researcher r ON r.id = pt.researcher_id
        WHERE rv.is_superseded = false AND p.edition_id = $1
        AND EXISTS (
            SELECT 1 FROM paper_topic pt2 WHERE pt2.paper_id = p.id
        )
    `;
    const result = await client.query(query, [eid]);
    return maskNames(result.rows, settings, 'reviewer_id');
}

async function getCOIViolations(editionId = null, settingsArg = null) {
    const eid = await resolveEditionId(editionId);
    const settings = settingsArg || await getAnonymizationSettings(eid);

    const query = `
        SELECT
            a.id as assignment_id,
            p.external_submission_id,
            p.title as paper_title,
            pt.id as reviewer_id,
            r.first_name as reviewer_first_name,
            r.last_name as reviewer_last_name,
            r.email as reviewer_email
        FROM assignment a
        JOIN conflict c ON a.paper_id = c.paper_id AND a.participant_id = c.participant_id
        JOIN paper p ON a.paper_id = p.id
        JOIN participant pt ON a.participant_id = pt.id
        JOIN researcher r ON r.id = pt.researcher_id
        WHERE p.edition_id = $1
    `;
    const result = await client.query(query, [eid]);
    return maskNames(result.rows, settings, 'reviewer_id');
}

async function getMissingMetareviews(editionId = null, settingsArg = null) {
    const eid = await resolveEditionId(editionId);
    const settings = settingsArg || await getAnonymizationSettings(eid);

    const query = `
        WITH base AS (
            SELECT p.id,
                   p.external_submission_id,
                   p.title,
                   (MAX(rv.total_score) - MIN(rv.total_score)) as score_spread
            FROM paper p
            JOIN review rv ON p.id = rv.paper_id AND rv.is_superseded = false
            LEFT JOIN meta_review mr ON p.id = mr.paper_id
            WHERE mr.id IS NULL AND p.is_deleted = false AND p.edition_id = $1
            GROUP BY p.id, p.external_submission_id, p.title
            HAVING (MAX(rv.total_score) - MIN(rv.total_score)) > 2
        )
        SELECT b.external_submission_id, b.title, b.score_spread,
               pt.id, r.first_name, r.last_name, r.email
        FROM base b
        JOIN (
            SELECT DISTINCT rv.paper_id, rv.participant_id
            FROM review rv
            WHERE rv.is_superseded = false
        ) rd ON rd.paper_id = b.id
        JOIN participant pt ON rd.participant_id = pt.id
        JOIN researcher r ON r.id = pt.researcher_id
    `;
    const result = await client.query(query, [eid]);
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

async function getReviewersForPapers(paperExternalIds, editionId = null, settingsArg = null) {
    const eid = await resolveEditionId(editionId);
    const settings = settingsArg || await getAnonymizationSettings(eid);
    const ids = (paperExternalIds || []).map(Number).filter(Number.isFinite);
    if (ids.length === 0) return [];

    const query = `
        SELECT DISTINCT p.external_submission_id, p.title,
               pt.id as reviewer_id, r.first_name, r.last_name, r.email
        FROM paper p
        JOIN review rv ON rv.paper_id = p.id AND rv.is_superseded = false
        JOIN participant pt ON rv.participant_id = pt.id
        JOIN researcher r ON r.id = pt.researcher_id
        WHERE p.is_deleted = false AND p.edition_id = $1
          AND p.external_submission_id = ANY($2::int[])
    `;
    const result = await client.query(query, [eid, ids]);
    return maskNames(result.rows, settings, 'reviewer_id');
}

async function getSentimentMismatches(editionId = null, settingsArg = null) {
    const eid = await resolveEditionId(editionId);
    const settings = settingsArg || await getAnonymizationSettings(eid);
    const query = `
        SELECT
            rv.id,
            p.external_submission_id,
            p.title as paper_title,
            pt.id as reviewer_id,
            r.first_name || ' ' || r.last_name as reviewer_name,
            r.email as reviewer_email,
            rv.total_score,
            rv.sentiment_score
        FROM review rv
        JOIN paper p ON rv.paper_id = p.id
        JOIN participant pt ON rv.participant_id = pt.id
        JOIN researcher r ON r.id = pt.researcher_id
        WHERE (
            (rv.total_score < 0 AND rv.sentiment_score >= 6.0) OR
            (rv.total_score > 1 AND rv.sentiment_score <= -6.0)
        )
        AND rv.is_superseded = false
        AND p.edition_id = $1
    `;
    const result = await client.query(query, [eid]);
    return maskNames(result.rows, settings, 'reviewer_id');
}

module.exports = {
    getExpertiseMismatches,
    getCOIViolations,
    getMissingMetareviews,
    getReviewersForPapers,
    getSentimentMismatches
};
