const test = require('node:test');
const assert = require('node:assert/strict');

test('direct reviewer details use their own edition for anonymized names', async () => {
    const dbPath = require.resolve('../config/database');
    const helpersPath = require.resolve('../repositories/analytics/helpers');
    const reviewerPath = require.resolve('../repositories/analytics/reviewerQueries');
    const previous = [dbPath, helpersPath, reviewerPath].map(path => require.cache[path]);
    const queried = [];

    require.cache[dbPath] = { id: dbPath, filename: dbPath, loaded: true, exports: {
        async query(sql, values) {
            queried.push({ sql, values });
            if (sql.includes('WHERE pt.id = $1 AND')) {
                const row = { id: 7, external_person_id: 70, first_name: 'Private', last_name: 'Name', email: 'private@example.test' };
                if (sql.slice(0, sql.indexOf('FROM participant pt')).includes('pt.edition_id')) row.edition_id = 11;
                return { rows: [row] };
            }
            if (sql.includes('FROM settings LIMIT 1')) return { rows: [{ is_anonymized: true }] };
            if (sql.includes('SELECT id FROM edition WHERE id = $1')) return { rows: [{ id: values[0] }] };
            if (sql.includes('ORDER BY uploaded_at DESC LIMIT 1')) return { rows: [{ id: 99 }] };
            if (sql.includes('FROM edition e')) return { rows: [{ acronym: values[0] === 11 ? 'OWN' : 'LATEST', year: 2025 }] };
            if (sql.includes('FROM (\n            SELECT paper_id FROM assignment') || sql.includes('FROM bid b')) return { rows: [] };
            throw new Error('Unexpected query');
        }
    } };
    delete require.cache[helpersPath];
    delete require.cache[reviewerPath];
    try {
        const { getReviewerDetails } = require(reviewerPath);
        const reviewer = await getReviewerDetails(7);
        assert.equal(reviewer.first_name, 'OWN_2025_Reviewer_7');
        assert.equal(reviewer.email, 'OWN_2025_reviewer_7@example.com');
        assert.equal(queried.some(({ sql }) => sql.includes('ORDER BY uploaded_at DESC LIMIT 1')), false);
    } finally {
        for (const [index, file] of [dbPath, helpersPath, reviewerPath].entries()) {
            if (previous[index]) require.cache[file] = previous[index];
            else delete require.cache[file];
        }
    }
});
