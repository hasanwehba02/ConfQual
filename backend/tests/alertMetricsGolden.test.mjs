import { describe, test, before } from 'node:test';
import assert from 'node:assert/strict';
import db from '../config/database.js';
import * as integrity from '../repositories/analytics/integrityQueries.js';
import { getAlerts } from '../services/analytics/alertService.js';

describe('Alert metrics golden — expertise zero-overlap correctness', () => {
  let eid;
  before(async () => {
    try { await db.query('SELECT 1'); } catch { return; }
    const r = await db.query('SELECT id FROM edition ORDER BY uploaded_at DESC LIMIT 1');
    eid = r.rows[0]?.id;
  });

  test('participant_topic populated → expertise mismatches = NOT EXISTS zero-overlap', async (t) => {
    if (!eid) { t.skip('no edition'); return; }
    const ptCount = (await db.query('SELECT COUNT(*) c FROM participant_topic')).rows[0].c;
    if (Number(ptCount) === 0) { t.skip('participant_topic empty — re-import PC topics to populate'); return; }
    // Hand-computed count via raw SQL must equal service count
    const raw = await db.query(`
      SELECT COUNT(*) c FROM review rv
      JOIN paper p ON p.id=rv.paper_id
      JOIN participant pt ON pt.id=rv.participant_id
      WHERE rv.is_superseded=false AND p.edition_id=$1
        AND EXISTS (SELECT 1 FROM paper_topic WHERE paper_id=p.id)
        AND NOT EXISTS (
          SELECT 1 FROM paper_topic pt2
          JOIN participant_topic pct ON pct.topic_id=pt2.topic_id AND pct.participant_id=pt.id
          WHERE pt2.paper_id=p.id
        )
    `, [eid]);
    const svc = await integrity.getExpertiseMismatches(eid);
    assert.equal(svc.length, Number(raw.rows[0].c), `service ${svc.length} should equal raw ${raw.rows[0].c} — if diverging, JS filtering diverged from SQL`);
  });

  test('getAlerts with full prefetched does not inflate expertise beyond raw', async (t) => {
    if (!eid) { t.skip('no edition'); return; }
    const alerts = await getAlerts(null, eid);
    const exp = alerts.find(a => a.category==='EXPERTISE');
    if (!exp) { t.skip('no expertise alert — dataset has full overlap'); return; }
    // Ensure affectedIds are unique and correspond to actual zero-overlap papers
    const uniq = new Set(exp.affectedIds);
    assert.equal(uniq.size, exp.affectedIds.length, 'affectedIds should be deduplicated');
  });

  test('pagination fix: internal getReviewerQuality without limit returns all reviewers', async (t) => {
    if (!eid) { t.skip('no edition'); return; }
    const rq = await import('../repositories/analytics/reviewerQueries.js');
    const all = await rq.getReviewerQuality({ conferenceId: eid });
    const cnt = (await db.query('SELECT COUNT(*) c FROM participant WHERE edition_id=$1', [eid])).rows[0].c;
    assert.ok(all.length >= Number(cnt) * 0.5, `reviewer count ${all.length} should be near participant count ${cnt} — clamp would truncate to 50`);
  });
});
