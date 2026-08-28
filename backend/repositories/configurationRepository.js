const db = require('../config/database');

async function getEditionId(conferenceId) {
    if (!conferenceId) return null;
    // conferenceId may be old conference.id or new edition.id; try both
    const byEdition = await db.query('SELECT id FROM edition WHERE id=$1', [conferenceId]);
    if (byEdition.rows.length) return conferenceId;
    const byConf = await db.query('SELECT e.id FROM edition e JOIN conference c ON c.name=(SELECT name FROM conference_series WHERE id=e.conference_id) AND c.year=e.year WHERE c.id=$1', [conferenceId]);
    if (byConf.rows.length) return byConf.rows[0].id;
    // fallback: most recent edition
    const fallback = await db.query('SELECT id FROM edition ORDER BY id DESC LIMIT 1');
    return fallback.rows[0]?.id || null;
}

async function getConfig(editionId) {
    const eid = await getEditionId(editionId);
    if (!eid) return null;
    const r = await db.query('SELECT * FROM configuration_information WHERE edition_id=$1', [eid]);
    return r.rows[0] || null;
}

async function upsertConfig(editionId, data) {
    const eid = await getEditionId(editionId);
    if (!eid) throw new Error('Edition not found');
    const fields = ['review_deadline','min_score','max_score','min_expertise','max_expertise','nb_reviewers','possible_cois_authors','possible_cois_papers','paper_types','metareviewer_recommendations','bidding_types','other_events'];
    const cols = ['edition_id'];
    const vals = [eid];
    const sets = [];
    for (const f of fields) if (data[f] !== undefined) {
        let v = data[f];
        if (v === '') v = null;
        if (f === 'review_deadline' && v === '') v = null;
        cols.push(f); vals.push(v);
        sets.push(`${f} = EXCLUDED.${f}`);
    }
    if (cols.length === 1) return getConfig(eid);
    const q = `INSERT INTO configuration_information (${cols.join(',')}) VALUES (${cols.map((_,i)=>`$${i+1}`).join(',')}) ON CONFLICT (edition_id) DO UPDATE SET ${sets.join(', ')} RETURNING *`;
    const r = await db.query(q, vals);
    return r.rows[0];
}

module.exports = { getConfig, upsertConfig, getEditionId };
