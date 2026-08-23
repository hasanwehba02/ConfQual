import test from 'node:test';
import assert from 'node:assert/strict';
import { maskNames } from '../repositories/analyticsRepository.js';

test('maskNames: privacy and anonymization verification', async (t) => {
    await t.test('passes real names through unchanged when anonymization is disabled', () => {
        const rawRows = [
            {
                id: 42,
                first_name: 'Alice',
                last_name: 'Smith',
                email: 'alice.smith@university.edu',
                role: 'PC Member'
            }
        ];
        const settings = { is_anonymized: false, anonymization_prefix: '' };
        const result = maskNames(rawRows, settings, 'id');

        assert.equal(result[0].first_name, 'Alice');
        assert.equal(result[0].last_name, 'Smith');
        assert.equal(result[0].email, 'alice.smith@university.edu');
    });

    await t.test('masks PC member first/last names and email when anonymization is enabled', () => {
        const rawRows = [
            {
                id: 101,
                first_name: 'Bob',
                last_name: 'Jones',
                email: 'bob.jones@lab.org',
                role: 'PC Member'
            }
        ];
        const settings = { is_anonymized: true, anonymization_prefix: 'CONF2026' };
        const result = maskNames(rawRows, settings, 'id');

        assert.equal(result[0].first_name, 'CONF2026_Reviewer_101');
        assert.equal(result[0].last_name, '');
        assert.equal(result[0].email, 'CONF2026_reviewer_101@example.com');
        assert.ok(!JSON.stringify(result[0]).includes('Bob'));
        assert.ok(!JSON.stringify(result[0]).includes('Jones'));
        assert.ok(!JSON.stringify(result[0]).includes('bob.jones@lab.org'));
    });

    await t.test('masks sub-reviewers with subnom/cognom syntax', () => {
        const rawRows = [
            {
                id: 55,
                external_person_id: 88,
                first_name: 'Charlie',
                last_name: 'Brown',
                email: 'charlie@students.edu',
                role: 'Sub-reviewer'
            }
        ];
        const settings = { is_anonymized: true, anonymization_prefix: 'CONF2026' };
        const result = maskNames(rawRows, settings, 'id');

        assert.equal(result[0].first_name, 'subnom88');
        assert.equal(result[0].last_name, 'cognom88');
        assert.equal(result[0].email, 'subreviewer_88@example.com');
        assert.ok(!JSON.stringify(result[0]).includes('Charlie'));
        assert.ok(!JSON.stringify(result[0]).includes('Brown'));
    });

    await t.test('masks compound reviewer fields (reviewer_name, reviewer_email)', () => {
        const rawRows = [
            {
                id: 7,
                reviewer_id: 7,
                reviewer_name: 'Dr. Evelyn Reed',
                reviewer_email: 'evelyn@research.org'
            }
        ];
        const settings = { is_anonymized: true, anonymization_prefix: 'BPM' };
        const result = maskNames(rawRows, settings, 'id');

        assert.equal(result[0].reviewer_name, 'BPM_Reviewer_7 ');
        assert.equal(result[0].reviewer_email, 'BPM_reviewer_7@example.com');
        assert.ok(!JSON.stringify(result[0]).includes('Evelyn'));
    });
});
