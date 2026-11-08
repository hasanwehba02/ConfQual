import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('comparison actions select and edit the selected dataset under a strict CSP', async () => {
    const data = [
        { id: 1, name: "A 'quoted' conference", short_name: 'A&B', year: 2025 },
        { id: 2, name: 'Second', short_name: null, year: 2026 }
    ];
    const calls = [];
    const tbody = { innerHTML: '', onclick: null, contains: () => true };
    globalThis.document = { getElementById: () => tbody };
    globalThis.window = {
        selectConference: (...args) => calls.push(['view', ...args]),
        openEditConferenceDrawer: (...args) => calls.push(['edit', ...args])
    };
    globalThis.comparisonMocks = {
        fetchComparison: async () => data,
        escapeHtml: value => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;'),
        renderComparisonCharts: () => {}
    };
    let source = await readFile(new URL('../public/js/comparisonView.js', import.meta.url), 'utf8');
    source = source.replace(/^import .*;\n/gm, '')
        .replace('export async function', 'async function');
    source = `const { fetchComparison, escapeHtml, renderComparisonCharts } = globalThis.comparisonMocks;\n${source}\nexport { loadComparisonTab };`;
    const { loadComparisonTab } = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
    await loadComparisonTab();
    assert.doesNotMatch(tbody.innerHTML, /\sonclick=/i);
    assert.equal(typeof tbody.onclick, 'function');
    const click = (action, index) => tbody.onclick({ target: { closest: () => ({ dataset: { action, index: String(index) } }) } });
    click('view', 1);
    click('edit', 0);
    assert.deepEqual(calls, [['view', 2], ['edit', 1, "A 'quoted' conference", 'A&B', 2025]]);
});
