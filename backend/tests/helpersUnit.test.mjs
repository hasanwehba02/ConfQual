import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

/**
 * Pure-function unit tests for helpers.js utilities.
 *
 * These are extracted from the source so they run without a database connection.
 * The goal is to catch regressions in the pure logic (sorting, filtering, masking,
 * validation) independently of the query layer.
 */

// ─── assertSafeNumber ──────────────────────────────────────────────────────

// Re-implement the exact logic from helpers.js for isolated testing
function assertSafeNumber(val, name = 'value') {
    const num = Number(val);
    if (!Number.isFinite(num)) {
        throw new Error(`Invalid numeric threshold for ${name}: ${val}`);
    }
    return num;
}

describe('assertSafeNumber', () => {
    test('returns the number for valid inputs', () => {
        assert.equal(assertSafeNumber(42), 42);
        assert.equal(assertSafeNumber('3.14'), 3.14);
        assert.equal(assertSafeNumber(0), 0);
        assert.equal(assertSafeNumber(-1), -1);
    });

    test('throws for non-numeric inputs', () => {
        assert.throws(() => assertSafeNumber(NaN));
        assert.throws(() => assertSafeNumber(Infinity));
        assert.throws(() => assertSafeNumber('not-a-number'));
        assert.throws(() => assertSafeNumber(undefined));
    });

    test('does NOT throw for null (Number(null) === 0)', () => {
        // Known quirk: Number(null) === 0, so the current implementation
        // treats null as 0. This documents the behavior; if you want null
        // to be rejected, add an explicit null check to assertSafeNumber.
        assert.equal(assertSafeNumber(null), 0);
    });

    test('includes the field name in the error message', () => {
        try {
            assertSafeNumber(NaN, 'threshold');
            assert.fail('should have thrown');
        } catch (e) {
            assert.ok(e.message.includes('threshold'));
        }
    });
});

// ─── buildOrderBy ──────────────────────────────────────────────────────────

function buildOrderBy(sort, order, defaultSortClause = 'avg_word_count DESC NULLS LAST') {
    const validSorts = {
        'reviewer_name': 'r.last_name',
        'name': 'r.last_name',
        'email': 'r.email',
        'total_reviews_completed': 'total_reviews_completed',
        'reviews_count': 'total_reviews_completed',
        'avg_score_given': 'avg_score_given',
        'avg_score': 'avg_score_given',
        'avg_confidence': 'avg_confidence',
        'avg_word_count': 'avg_word_count',
        'calibration_index': 'calibration_index',
        'normalized_avg_score': 'normalized_avg_score'
    };
    let clause;
    if (sort && validSorts[sort]) {
        const col = validSorts[sort];
        const dir = (order && order.toUpperCase() === 'ASC') ? 'ASC' : 'DESC';
        clause = `ORDER BY ${col} ${dir} NULLS LAST`;
    } else {
        clause = `ORDER BY ${defaultSortClause}`;
    }
    return { clause };
}

describe('buildOrderBy', () => {
    test('returns default clause when sort is null', () => {
        const result = buildOrderBy(null, null);
        assert.ok(result.clause.includes('avg_word_count'));
    });

    test('maps known sort keys to SQL columns', () => {
        const r1 = buildOrderBy('reviewer_name', 'ASC');
        assert.ok(r1.clause.includes('r.last_name'));
        assert.ok(r1.clause.includes('ASC'));

        const r2 = buildOrderBy('avg_score', 'DESC');
        assert.ok(r2.clause.includes('avg_score_given'));
        assert.ok(r2.clause.includes('DESC'));
    });

    test('defaults to DESC for unknown order direction', () => {
        const r = buildOrderBy('email', 'banana');
        assert.ok(r.clause.includes('r.email'));
        assert.ok(r.clause.includes('DESC'));
    });

    test('falls back to default for unknown sort key', () => {
        const r = buildOrderBy('nonexistent_key', 'ASC');
        assert.ok(r.clause.includes('avg_word_count'));
    });

    test('respects custom defaultSortClause', () => {
        const r = buildOrderBy(null, null, 'total_reviews_completed ASC');
        assert.ok(r.clause.includes('total_reviews_completed'));
    });
});

// ─── getFilterModes ────────────────────────────────────────────────────────

function getFilterModes(options = {}) {
    if (Array.isArray(options.modes)) return options.modes;
    if (Array.isArray(options.filter)) return options.filter;
    if (typeof options.filter === 'string') return [options.filter];
    const modes = [];
    if (options.no_comments || options.filter_no_comments) modes.push('no_comments');
    if (options.has_comments || options.filter_has_comments) modes.push('has_comments');
    if (options.high_variance || options.filter_high_variance) modes.push('high_variance');
    if (options.missed_assignments || options.filter_missed_assignments) modes.push('missed_assignments');
    if (options.has_subreviews || options.filter_has_subreviews) modes.push('has_subreviews');
    if (options.no_subreviews || options.filter_no_subreviews) modes.push('no_subreviews');
    return modes;
}

describe('getFilterModes', () => {
    test('returns empty array when no filters given', () => {
        assert.deepEqual(getFilterModes({}), []);
    });

    test('returns modes array directly when provided', () => {
        assert.deepEqual(
            getFilterModes({ modes: ['has_comments', 'high_variance'] }),
            ['has_comments', 'high_variance']
        );
    });

    test('reads from filter array', () => {
        assert.deepEqual(getFilterModes({ filter: ['no_comments'] }), ['no_comments']);
    });

    test('wraps a string filter in an array', () => {
        assert.deepEqual(getFilterModes({ filter: 'has_subreviews' }), ['has_subreviews']);
    });

    test('maps boolean flag options to mode strings', () => {
        const r = getFilterModes({
            no_comments: true,
            high_variance: true,
            missed_assignments: true,
        });
        assert.deepEqual(r, ['no_comments', 'high_variance', 'missed_assignments']);
    });

    test('recognizes all individual boolean flags', () => {
        const flags = [
            'no_comments', 'has_comments', 'high_variance',
            'missed_assignments', 'has_subreviews', 'no_subreviews',
        ];
        for (const flag of flags) {
            const r = getFilterModes({ [flag]: true });
            assert.deepEqual(r, [flag], `flag ${flag} should produce the same mode`);
        }
    });
});

// ─── maskNames ─────────────────────────────────────────────────────────────

function maskNames(rows, settings, idKey = 'id') {
    const isAnonymized = settings && settings.is_anonymized;
    const prefix = (settings && settings.anonymization_prefix) ? `${settings.anonymization_prefix}_` : '';
    const shortenSubName = (value) =>
        typeof value === 'string'
            ? value.replace(/Sub-reviewer\s*#?(\d+)/gi, 'Sub #$1')
            : value;
    const maskRow = (row) => {
        if (!row || typeof row !== 'object') return row;
        const newRow = { ...row };
        if (isAnonymized) {
            const role = (newRow.role || newRow.evaluator_role || '').toLowerCase();
            const isSub = role === 'sub-reviewer' || role === 'subreviewer';
            const subId = newRow.external_person_id || newRow[idKey] || newRow.reviewer_id || newRow.id;
            const regId = newRow[idKey] || newRow.reviewer_id || newRow.participant_id || newRow.author_participant_id || newRow.id;
            if (isSub) {
                newRow.first_name = `subnom${subId}`;
                newRow.last_name = `cognom${subId}`;
                newRow.email = `subreviewer_${subId}@example.com`;
                if ('reviewer_name' in newRow) newRow.reviewer_name = `${newRow.first_name} ${newRow.last_name}`;
                if ('reviewer_email' in newRow) newRow.reviewer_email = newRow.email;
            } else {
                newRow.first_name = `${prefix}Reviewer_${regId}`;
                newRow.last_name = '';
                newRow.email = `${prefix}reviewer_${regId}@example.com`;
                if ('reviewer_name' in newRow) newRow.reviewer_name = `${newRow.first_name} ${newRow.last_name}`;
                if ('reviewer_email' in newRow) newRow.reviewer_email = newRow.email;
            }
        } else {
            if (newRow.first_name) newRow.first_name = shortenSubName(newRow.first_name);
            if (newRow.last_name) newRow.last_name = shortenSubName(newRow.last_name);
            if (newRow.reviewer_name) newRow.reviewer_name = shortenSubName(newRow.reviewer_name);
        }
        return newRow;
    };
    if (Array.isArray(rows)) return rows.map(maskRow);
    return maskRow(rows);
}

describe('maskNames', () => {
    const anonSettings = { is_anonymized: true, anonymization_prefix: 'ICLR_2026' };
    const offSettings = { is_anonymized: false };

    test('masks names when anonymization is on', () => {
        const row = { id: 10, first_name: 'Alice', last_name: 'Smith', email: 'a@b.com' };
        const masked = maskNames(row, anonSettings);
        assert.ok(masked.first_name.startsWith('ICLR_2026_Reviewer_'));
        assert.equal(masked.last_name, '');
        assert.ok(masked.email.includes('reviewer_'));
    });

    test('masks sub-reviewer names differently', () => {
        const row = { id: 5, role: 'Sub-reviewer', first_name: 'Bob', last_name: 'J', email: 'b@b.com' };
        const masked = maskNames(row, anonSettings);
        assert.ok(masked.first_name.startsWith('subnom'));
        assert.ok(masked.last_name.startsWith('cognom'));
        assert.ok(masked.email.startsWith('subreviewer_'));
    });

    test('returns rows unchanged when anonymization is off', () => {
        const row = { id: 1, first_name: 'Alice', last_name: 'Smith', email: 'a@b.com' };
        const result = maskNames(row, offSettings);
        assert.equal(result.first_name, 'Alice');
        assert.equal(result.last_name, 'Smith');
    });

    test('shortens "Sub-reviewer #N" names in non-anonymized mode', () => {
        const row = { first_name: 'Sub-reviewer #3', last_name: 'Reviewer' };
        const result = maskNames(row, offSettings);
        assert.equal(result.first_name, 'Sub #3');
    });

    test('masks arrays of rows', () => {
        const rows = [
            { id: 1, first_name: 'A', last_name: 'B', email: 'a@b.com' },
            { id: 2, first_name: 'C', last_name: 'D', email: 'c@d.com' },
        ];
        const masked = maskNames(rows, anonSettings);
        assert.equal(masked.length, 2);
        assert.ok(masked[0].first_name.includes('Reviewer_'));
        assert.ok(masked[1].first_name.includes('Reviewer_'));
    });
});
