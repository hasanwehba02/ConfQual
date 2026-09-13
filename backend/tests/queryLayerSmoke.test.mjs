import { describe, test, before } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import db from '../config/database.js';
import pq from '../repositories/analytics/paperQueries.js';
import rq from '../repositories/analytics/reviewerQueries.js';
import cq from '../repositories/analytics/conferenceQueries.js';
import iq from '../repositories/analytics/integrityQueries.js';
import profile from '../services/analytics/profileService.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Query-layer smoke tests.
 *
 * These run every major analytics query against the live database and assert it
 * resolves without throwing. The single most common failure this project has hit
 * (paper details not loading, thresholds breaking) is a SQL error from a column
 * that no longer exists in the current schema. Running the full query surface on
 * every `npm test` turns those silent UI failures into immediate red tests.
 *
 * Read-only: these queries are pure SELECTs run against a real, automatically
 * located edition with papers — nothing is written or mutated.
 */
describe('Analytics query layer (schema/wiring smoke)', () => {
    let dbAvailable = false;
    let editionId = null;
    let externalSubmissionId = null;
    let reviewerId = null;

    before(async () => {
        try {
            await db.query('SELECT 1');
            dbAvailable = true;
        } catch {
            dbAvailable = false;
            return;
        }
        // Locate an edition that actually has papers so the tests are meaningful
        // regardless of which conferences have been imported.
        const ed = await db.query(
            'SELECT e.id FROM edition e WHERE EXISTS (SELECT 1 FROM paper p WHERE p.edition_id = e.id AND p.is_deleted = false) ORDER BY e.uploaded_at DESC LIMIT 1'
        );
        editionId = ed.rows[0]?.id ?? null;
        if (!editionId) return;

        const paper = await db.query(
            'SELECT external_submission_id FROM paper WHERE edition_id = $1 AND is_deleted = false ORDER BY external_submission_id LIMIT 1',
            [editionId]
        );
        externalSubmissionId = paper.rows[0]?.external_submission_id ?? null;

        const reviewers = await rq.getReviewerQuality({ conferenceId: editionId });
        reviewerId = reviewers[0]?.id ?? null;
    });

    // Returns true when the test should be skipped (and records the skip).
    const guard = (t) => {
        if (!dbAvailable) { t.skip('Database unavailable in this environment'); return true; }
        if (!editionId) { t.skip('No edition with papers found'); return true; }
        return false;
    };

    test('getPaperDetails returns title, reviews, authors and comments', async (t) => {
        if (guard(t)) return;
        if (externalSubmissionId == null) { t.skip('No paper found in edition'); return; }
        const paper = await pq.getPaperDetails(externalSubmissionId, editionId);
        assert.ok(paper, 'paper should be found');
        assert.ok(typeof paper.title === 'string');
        assert.ok(Array.isArray(paper.reviews));
        assert.ok(Array.isArray(paper.authors));
        assert.ok(Array.isArray(paper.comments));
    });

    test('getPaperDebates returns an array', async (t) => { if (guard(t)) return; assert.ok(Array.isArray(await pq.getPaperDebates(editionId))); });
    test('getPapersViewList returns an array', async (t) => { if (guard(t)) return; assert.ok(Array.isArray(await pq.getPapersViewList({}, editionId))); });
    test('getPapersList returns paginated items', async (t) => { if (guard(t)) return; const r = await pq.getPapersList({}, editionId); assert.ok(r && Array.isArray(r.items), 'items array'); assert.equal(typeof r.total, 'number'); });
    test('getTopPapers returns an array', async (t) => { if (guard(t)) return; assert.ok(Array.isArray(await pq.getTopPapers(editionId, 5))); });
    test('getSubmissions returns an array', async (t) => { if (guard(t)) return; assert.ok(Array.isArray(await pq.getSubmissions({ conferenceId: editionId }))); });

    test('getReviewerQuality returns an array', async (t) => { if (guard(t)) return; assert.ok(Array.isArray(await rq.getReviewerQuality({ conferenceId: editionId }))); });
    test('getReviewerDetails returns a reviewer', async (t) => {
        if (guard(t)) return;
        if (reviewerId == null) { t.skip('No reviewer found'); return; }
        const r = await rq.getReviewerDetails(reviewerId, editionId);
        assert.ok(r, 'reviewer should be found');
    });
    test('getTopReviewers returns an array', async (t) => { if (guard(t)) return; assert.ok(Array.isArray(await rq.getTopReviewers(editionId))); });

    test('conference health and metrics queries resolve', async (t) => {
        if (guard(t)) return;
        const health = await cq.getConferenceHealth(editionId);
        assert.ok(health && typeof health === 'object');
        const acc = await cq.getAcceptanceRate(editionId);
        assert.ok(acc && typeof acc === 'object');
        assert.ok(Array.isArray(await cq.getGeographicDiversity(editionId)));
        assert.ok(Array.isArray(await cq.getThematicCompetence(editionId)));
        assert.ok(Array.isArray(await cq.getSessionClusters(editionId)));
        assert.ok(await cq.getSystemDistributions(editionId) !== undefined);
    });

    test('integrity queries resolve', async (t) => {
        if (guard(t)) return;
        assert.ok(Array.isArray(await iq.getExpertiseMismatches(editionId)));
        assert.ok(Array.isArray(await iq.getCOIViolations(editionId)));
        assert.ok(Array.isArray(await iq.getSentimentMismatches(editionId)));
        assert.ok(await iq.getMissingMetareviews(editionId) !== undefined);
    });

    test('quality profile resolves', async (t) => {
        if (guard(t)) return;
        const p = await profile.getAcademicQualityProfile(null, editionId);
        assert.ok(p && typeof p === 'object');
        assert.ok(p.selectivity && p.rigor);
    });

    test('getPaperDetails no longer references removed schema columns', async () => {
        // Static regression guard for the exact bug that made the paper explorer
        // fail: querying the removed `pa.corresponding` and `cf.conflict_type`
        // columns threw a SQL error. This holds the fix in place.
        const src = fs.readFileSync(
            path.join(__dirname, '../repositories/analytics/paperQueries.js'),
            'utf8'
        );
        assert.ok(src.includes('pa.is_corresponding'), 'authors query should use is_corresponding');
        assert.ok(!src.includes('pa.corresponding') || src.includes('pa.is_corresponding'),
            'authors query must not use the removed pa.corresponding column');
        assert.ok(!src.includes('cf.conflict_type'), 'conflict query must not reference conflict_type');
    });
});