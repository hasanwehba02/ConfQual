const client = require("../../config/database");
const { resolveConferenceId, getAnonymizationSettings, maskNames } = require("./helpers");

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
        WHERE (
            (r.total_score < 0 AND r.sentiment_score >= 6.0) OR
            (r.total_score > 1 AND r.sentiment_score <= -6.0)
        )
        AND r.is_superseded = false
        AND p.conference_id = $1
    `;
    const result = await client.query(query, [cid]);
    return maskNames(result.rows, settings, 'reviewer_id');
}

module.exports = {
    getExpertiseMismatches,
    getCOIViolations,
    getMissingMetareviews,
    getReviewersForPapers,
    getSentimentMismatches
};
