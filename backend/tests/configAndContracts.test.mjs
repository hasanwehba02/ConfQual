import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import analyticsRepository from '../repositories/analyticsRepository.js';
import scorecardService from '../services/analytics/scorecardService.js';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ─── Alert Rule Defaults Config ─────────────────────────────────────────────

import alertDefaults from '../config/alertRuleDefaults.js';

describe('alertRuleDefaults config', () => {
    const keys = Object.keys(alertDefaults);

    test('exports at least one rule', () => {
        assert.ok(keys.length > 0, 'alertRuleDefaults should define rules');
    });

    test('every rule has required fields: default, label, domain', () => {
        for (const [key, def] of Object.entries(alertDefaults)) {
            assert.ok(typeof def.default === 'number', `${key} missing numeric default`);
            assert.ok(typeof def.label === 'string' && def.label.length > 0, `${key} missing label`);
            assert.ok(typeof def.domain === 'string' && def.domain.length > 0, `${key} missing domain`);
        }
    });

    test('no duplicate rule keys across domains', () => {
        const seen = new Set();
        for (const key of keys) {
            assert.ok(!seen.has(key), `duplicate rule key: ${key}`);
            seen.add(key);
        }
    });
});

// ─── Static source checks for known schema bugs ────────────────────────────

describe('source-level regression guards', () => {
    const paperQSrc = fs.readFileSync(
        path.join(__dirname, '../repositories/analytics/paperQueries.js'),
        'utf8'
    );
    const helpersSrc = fs.readFileSync(
        path.join(__dirname, '../repositories/analytics/helpers.js'),
        'utf8'
    );
    const settingsCtrlSrc = fs.readFileSync(
        path.join(__dirname, '../controllers/settingsController.js'),
        'utf8'
    );

    test('paperQueries: does not reference removed pa.corresponding column', () => {
        // The old schema used pa.corresponding; it was renamed to pa.is_corresponding.
        // Any reference to the bare "pa.corresponding" (not is_corresponding) is a bug.
        const lines = paperQSrc.split('\n');
        for (const line of lines) {
            if (line.includes('pa.corresponding') && !line.includes('pa.is_corresponding')) {
                assert.fail(`Line references removed column pa.corresponding: ${line.trim()}`);
            }
        }
    });

    test('paperQueries: does not reference removed cf.conflict_type column', () => {
        assert.ok(!paperQSrc.includes('cf.conflict_type'),
            'conflict query must not reference the removed conflict_type column');
    });

    test('settingsController: uses ON CONFLICT for upsert (no duplicate key errors)', () => {
        assert.ok(settingsCtrlSrc.includes('ON CONFLICT'),
            'settings update must use ON CONFLICT to avoid duplicate key errors');
    });

    test('helpers: getAlertRules query uses edition_id column (not conference_id)', () => {
        // The alert_rule table uses edition_id; if the query accidentally uses
        // conference_id it will fail at runtime.
        const alertRuleSection = helpersSrc.substring(
            helpersSrc.indexOf('async function getAlertRules'),
            helpersSrc.indexOf('async function ensureAlertRulesForEdition')
        );
        assert.ok(alertRuleSection.includes('edition_id'),
            'getAlertRules must query on edition_id');
        assert.ok(!alertRuleSection.includes('conference_id'),
            'getAlertRules must not use conference_id');
    });

    test('helpers: ensureAlertRulesForEdition uses ON CONFLICT for idempotent seeding', () => {
        const ensureSection = helpersSrc.substring(
            helpersSrc.indexOf('async function ensureAlertRulesForEdition'),
            helpersSrc.indexOf('async function getAnonymizationSettings')
        );
        assert.ok(ensureSection.includes('ON CONFLICT'),
            'ensureAlertRulesForEdition must use ON CONFLICT to be idempotent');
    });
});

// ─── System analytics data reuse ─────────────────────────────────────────────

describe('getSystemAnalytics data reuse', () => {
    test('reuses prefetched health, papers, reviewers and mismatches instead of refetching', async () => {
        const prefetched = {
            health: { conferenceId: 1 },
            papers: [{ id: 1 }],
            reviewers: [{ id: 1 }],
            mismatches: { totalMismatches: 0, details: [] },
            topPapers: [],
            topReviewers: [],
            distributions: [],
            sessionClusters: [],
            coiViolations: [],
            missingMetareviews: [],
            coveragePapers: [{ id: 1, decision_category: 'accept', total_reviews: 3 }],
            diversity: [],
            submissions: [],
            sentimentMismatches: []
        };
        const calls = [];
        const original = { ...analyticsRepository };
        const mockReturns = {
            getPaperDebates: prefetched.papers,
            getReviewerQuality: prefetched.reviewers,
            getExpertiseMismatches: prefetched.mismatches,
            getTopPapers: prefetched.topPapers,
            getSessionClusters: prefetched.sessionClusters,
            getPaperCoverageStats: prefetched.coveragePapers,
            getCOIViolations: prefetched.coiViolations,
            getMissingMetareviews: prefetched.missingMetareviews,
            getTopReviewers: prefetched.topReviewers,
            getSystemDistributions: prefetched.distributions,
            getGeographicDiversity: prefetched.diversity,
            getSubmissions: prefetched.submissions,
            getSentimentMismatches: prefetched.sentimentMismatches,
            getConferenceHealth: prefetched.health,
            getAcceptanceRate: { total_submissions: 1, accepted_submissions: 0 },
            getThematicCompetence: []
        };
        const mock = (name) => (..._args) => { calls.push(name); return Promise.resolve(mockReturns[name]); };
        // Mock all DB-backed methods to prevent ECONNREFUSED in CI without DB
        Object.assign(analyticsRepository, {
            getPaperDebates: mock('getPaperDebates'),
            getReviewerQuality: mock('getReviewerQuality'),
            getExpertiseMismatches: mock('getExpertiseMismatches'),
            getTopPapers: mock('getTopPapers'),
            getSessionClusters: mock('getSessionClusters'),
            getPaperCoverageStats: mock('getPaperCoverageStats'),
            getCOIViolations: mock('getCOIViolations'),
            getMissingMetareviews: mock('getMissingMetareviews'),
            getTopReviewers: mock('getTopReviewers'),
            getSystemDistributions: mock('getSystemDistributions'),
            getGeographicDiversity: mock('getGeographicDiversity'),
            getSubmissions: mock('getSubmissions'),
            getSentimentMismatches: mock('getSentimentMismatches'),
            getConferenceHealth: mock('getConferenceHealth'),
            getAcceptanceRate: mock('getAcceptanceRate'),
            getThematicCompetence: mock('getThematicCompetence')
        });
        try {
            await scorecardService.getSystemAnalytics(prefetched, 1);
            assert.deepEqual(calls, []);
        } finally {
            Object.assign(analyticsRepository, original);
        }
    });
});

// ─── Profile service: ranking logic unit tests ──────────────────────────────

describe('profileService ranking logic (inline)', () => {
    // Extract the rank logic from profileService so we can test it in isolation
    // without a database connection.
    function classifyRank(acceptanceRate) {
        if (acceptanceRate > 0 && acceptanceRate <= 20) return 'A* / Top-Tier Elite';
        if (acceptanceRate > 20 && acceptanceRate <= 28) return 'A / Leading International';
        if (acceptanceRate > 28 && acceptanceRate <= 38) return 'B / Good International';
        if (acceptanceRate > 38) return 'C / Regional';
        return 'Unranked / Regional';
    }

    test('0% acceptance → Unranked', () => {
        assert.equal(classifyRank(0), 'Unranked / Regional');
    });

    test('15% acceptance → A*', () => {
        assert.equal(classifyRank(15), 'A* / Top-Tier Elite');
    });

    test('25% acceptance → A', () => {
        assert.equal(classifyRank(25), 'A / Leading International');
    });

    test('35% acceptance → B', () => {
        assert.equal(classifyRank(35), 'B / Good International');
    });

    test('50% acceptance → C', () => {
        assert.equal(classifyRank(50), 'C / Regional');
    });

    test('boundary: exactly 20% → A*', () => {
        assert.equal(classifyRank(20), 'A* / Top-Tier Elite');
    });

    test('boundary: 20.1% → A', () => {
        assert.equal(classifyRank(20.1), 'A / Leading International');
    });

    test('boundary: exactly 28% → A', () => {
        assert.equal(classifyRank(28), 'A / Leading International');
    });

    test('boundary: 28.1% → B', () => {
        assert.equal(classifyRank(28.1), 'B / Good International');
    });

    test('boundary: exactly 38% → B', () => {
        assert.equal(classifyRank(38), 'B / Good International');
    });

    test('boundary: 38.1% → C', () => {
        assert.equal(classifyRank(38.1), 'C / Regional');
    });
});

// ─── Importer: conference name detection logic ─────────────────────────────

describe('conference importer name extraction (inline)', () => {
    // The importer extracts years from conference names using this pattern
    function extractYear(name) {
        const match = name.match(/\b(20\d{2})\b/);
        return match ? parseInt(match[1]) : null;
    }

    function extractShortName(name) {
        return name.replace(/\s*\d{4}\s*.*/, '').trim() || name;
    }

    test('extracts year from "ICLR 2026"', () => {
        assert.equal(extractYear('ICLR 2026'), 2026);
    });

    test('extracts year from "NeurIPS 2025 Proceedings"', () => {
        assert.equal(extractYear('NeurIPS 2025 Proceedings'), 2025);
    });

    test('returns null when no year present', () => {
        assert.equal(extractYear('CVPR'), null);
    });

    test('extracts short name by stripping year suffix', () => {
        assert.equal(extractShortName('ICLR 2026'), 'ICLR');
        assert.equal(extractShortName('NeurIPS 2025 Proceedings'), 'NeurIPS');
    });

    test('returns full name when no year to strip', () => {
        assert.equal(extractShortName('CVPR'), 'CVPR');
    });
});
