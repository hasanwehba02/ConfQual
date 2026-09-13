import { describe, test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import app from '../app.js';
import db from '../config/database.js';
import helpers from '../repositories/analytics/helpers.js';
import configRepo from '../repositories/configurationRepository.js';
import alertDefaults from '../config/alertRuleDefaults.js';

const { getAlertRules, ensureAlertRulesForEdition, resolveEditionId, getAnonymizationSettings } = helpers;

/**
 * Tests for the per-edition alert thresholds (alert_rule) and Configuration
 * Information (configuration_information). Runs against the live database with
 * a fully isolated edition that is created up front and torn down afterwards,
 * so `npm test` runs it safely each time. HTTP tests go through the real app
 * so the visible threshold labels are covered end-to-end.
 */
describe('Alert thresholds & per-edition configuration', () => {
    let server;
    let baseUrl;
    let dbAvailable = false;
    let confSeriesId;
    let editionId;

    before(async () => {
        try {
            const check = await db.query('SELECT 1');
            dbAvailable = !!check;
        } catch {
            dbAvailable = false;
        }

        await new Promise((resolve) => {
            server = http.createServer(app).listen(0, '127.0.0.1', () => {
                baseUrl = `http://127.0.0.1:${server.address().port}`;
                resolve();
            });
        });

        if (!dbAvailable) return;

        // Fully isolated conference series + edition (random name / year so it
        // never collides with real data or other parallel test runs).
        const cs = await db.query(
            "INSERT INTO conference_series (name, acronym) VALUES ('AlertConfig Test ' || random(), 'ACT') RETURNING id"
        );
        confSeriesId = cs.rows[0].id;
        const year = 1000 + Math.floor(Math.random() * 9000);
        const ed = await db.query(
            'INSERT INTO edition (conference_id, year) VALUES ($1, $2) RETURNING id',
            [confSeriesId, year]
        );
        editionId = ed.rows[0].id;
    });

    after(async () => {
        if (dbAvailable) {
            try {
                if (editionId) await db.query('DELETE FROM edition WHERE id = $1', [editionId]);
                if (confSeriesId) await db.query('DELETE FROM conference_series WHERE id = $1', [confSeriesId]);
            } catch (err) {
                console.error('Cleanup error in alertThresholdsAndConfig.test.mjs:', err);
            }
        }
        if (server) {
            await new Promise((resolve) => server.close(resolve));
        }
    });

    test('alert rule defaults are well-formed (numeric default, readable label, valid domain)', (_t) => {
        const keys = Object.keys(alertDefaults);
        assert.ok(keys.length >= 5, 'expected at least 5 alert rule defaults');
        for (const [key, def] of Object.entries(alertDefaults)) {
            assert.equal(typeof def.default, 'number', `${key} must have a numeric default`);
            assert.ok(typeof def.label === 'string' && def.label.trim() !== '', `${key} must have a non-empty readable label`);
            assert.ok(def.label !== key, `${key} label should be human-readable, not the raw key`);
            assert.ok(['papers', 'reviewers'].includes(def.domain), `${key} domain must be papers or reviewers`);
        }
    });

    test('ensureAlertRulesForEdition seeds every default and is idempotent', async (t) => {
        if (!dbAvailable) {
            t.skip('Database unavailable in this environment');
            return;
        }
        await ensureAlertRulesForEdition(editionId);
        await ensureAlertRulesForEdition(editionId); // second call must not duplicate
        const rules = await getAlertRules(editionId);
        for (const key of Object.keys(alertDefaults)) {
            assert.ok(rules[key], `rule "${key}" should be seeded for the edition`);
            // A plain default-only row reports the config default when nothing has been overridden.
            assert.equal(
                rules[key].value,
                alertDefaults[key].default,
                `rule "${key}" should default to ${alertDefaults[key].default}`
            );
            assert.equal(rules[key].enabled, true, `rule "${key}" should be enabled by default`);
        }
    });

    test('alert rule threshold and enabled flag persist after an update', async (t) => {
        if (!dbAvailable) {
            t.skip('Database unavailable in this environment');
            return;
        }
        await ensureAlertRulesForEdition(editionId);
        const key = Object.keys(alertDefaults)[0];
        await db.query(
            `INSERT INTO alert_rule (edition_id, rule_key, threshold_value, is_enabled)
             VALUES ($1, $2, $3, $4)
             ON CONFLICT (edition_id, rule_key) DO UPDATE SET
                threshold_value = EXCLUDED.threshold_value,
                is_enabled = EXCLUDED.is_enabled`,
            [editionId, key, 9.5, false]
        );
        const rules = await getAlertRules(editionId);
        assert.equal(rules[key].value, 9.5);
        assert.equal(rules[key].enabled, false);
    });

    test('GET /api/analytics/alert-rules returns readable labels (not raw keys)', async (t) => {
        if (!dbAvailable) {
            t.skip('Database unavailable in this environment');
            return;
        }
        await ensureAlertRulesForEdition(editionId);
        const res = await fetch(`${baseUrl}/api/analytics/alert-rules?conferenceId=${editionId}`);
        assert.equal(res.status, 200);
        const data = await res.json();
        assert.ok(Array.isArray(data));
        assert.equal(data.length, Object.keys(alertDefaults).length);
        for (const item of data) {
            assert.ok(item.key, 'each rule has a key');
            assert.ok(typeof item.label === 'string' && item.label.trim() !== '', 'each rule has a readable label');
            assert.notEqual(item.label, item.key, 'the displayed label must not be the raw machine key');
            assert.ok(Object.prototype.hasOwnProperty.call(item, 'default'), 'each rule exposes the default');
            assert.ok(Object.prototype.hasOwnProperty.call(item, 'value'), 'each rule exposes the value');
            assert.ok(Object.prototype.hasOwnProperty.call(item, 'enabled'), 'each rule exposes the enabled flag');
        }
    });

    test('POST /api/analytics/alert-rules persists an updated threshold and GET reflects it', async (t) => {
        if (!dbAvailable) {
            t.skip('Database unavailable in this environment');
            return;
        }
        await ensureAlertRulesForEdition(editionId);
        const key = Object.keys(alertDefaults)[0];
        const post = await fetch(`${baseUrl}/api/analytics/alert-rules?conferenceId=${editionId}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ rules: [{ key, threshold: 4.2, enabled: false }] })
        });
        assert.equal(post.status, 200, 'POST alert-rules should accept updates');

        const get = await fetch(`${baseUrl}/api/analytics/alert-rules?conferenceId=${editionId}`);
        assert.equal(get.status, 200);
        const data = await get.json();
        const updated = data.find((r) => r.key === key);
        assert.ok(updated, 'updated rule should be returned');
        assert.equal(updated.value, 4.2);
        assert.equal(updated.enabled, false);
    });

    test('configurationRepository getConfig/upsertConfig round-trip', async (t) => {
        if (!dbAvailable) {
            t.skip('Database unavailable in this environment');
            return;
        }
        assert.equal(await configRepo.getConfig(editionId), null, 'fresh edition has no config row');

        const inserted = await configRepo.upsertConfig(editionId, {
            nb_reviewers: 3,
            min_score: -3,
            max_score: 3,
            min_expertise: 1,
            max_expertise: 5,
            paper_types: ['full', 'short'],
            possible_cois_authors: ['coi_a', 'coi_b']
        });
        assert.equal(inserted.nb_reviewers, 3);
        assert.deepEqual(inserted.paper_types, ['full', 'short']);
        assert.deepEqual(inserted.possible_cois_authors, ['coi_a', 'coi_b']);

        // Update: existing row should merge, empty string coerced to null.
        const updated = await configRepo.upsertConfig(editionId, {
            nb_reviewers: 5,
            review_deadline: '',
            min_score: -2,
            max_score: 2
        });
        assert.equal(updated.nb_reviewers, 5);
        assert.equal(updated.review_deadline, null, 'empty string deadline should become NULL');
        assert.deepEqual(updated.paper_types, ['full', 'short'], 'untouched fields are preserved');

        const fetched = await configRepo.getConfig(editionId);
        assert.equal(fetched.nb_reviewers, 5);
        assert.equal(fetched.min_score, -2);
    });

    test('HTTP GET/PUT /api/analytics/configuration round-trips', async (t) => {
        if (!dbAvailable) {
            t.skip('Database unavailable in this environment');
            return;
        }
        const put = await fetch(`${baseUrl}/api/analytics/configuration?conferenceId=${editionId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ nb_reviewers: 4, min_score: -2, max_score: 2 })
        });
        assert.equal(put.status, 200, 'PUT configuration should upsert');

        const get = await fetch(`${baseUrl}/api/analytics/configuration?conferenceId=${editionId}`);
        assert.equal(get.status, 200);
        const cfg = await get.json();
        assert.equal(cfg.nb_reviewers, 4);
        assert.equal(cfg.min_score, -2);
        assert.equal(cfg.max_score, 2);
    });

    test('resolveEditionId resolves by id, string, and option object', async (t) => {
        if (!dbAvailable) {
            t.skip('Database unavailable in this environment');
            return;
        }
        assert.equal(await resolveEditionId(editionId), editionId);
        assert.equal(await resolveEditionId(String(editionId)), editionId);
        assert.equal(await resolveEditionId({ editionId }), editionId);
        assert.equal(await resolveEditionId({ conferenceId: editionId }), editionId);
        assert.equal(await resolveEditionId({ edition_id: editionId }), editionId);
    });

    test('getAnonymizationSettings returns a stable structure for the edition', async (t) => {
        if (!dbAvailable) {
            t.skip('Database unavailable in this environment');
            return;
        }
        const s = await getAnonymizationSettings(editionId);
        assert.equal(typeof s.is_anonymized, 'boolean');
        assert.equal(typeof s.decision_editing_enabled, 'boolean');
        assert.equal(typeof s.anonymization_prefix, 'string');
    });

    test('alert pipeline returns a well-formed response for a configured edition', async (t) => {
        if (!dbAvailable) {
            t.skip('Database unavailable in this environment');
            return;
        }
        const res = await fetch(`${baseUrl}/api/analytics/alerts?conferenceId=${editionId}`);
        assert.equal(res.status, 200);
        const data = await res.json();
        assert.ok(Array.isArray(data), 'alerts endpoint must return an array');
    });
});