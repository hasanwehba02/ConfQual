import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

test('projector renders review content and reviewer names as text', async () => {
    const nodes = Object.fromEntries(['projector-title', 'projector-scores', 'projector-disagreements', 'projector-modal'].map(id => [id, {
        innerHTML: '', textContent: '', style: {}, classList: { remove() {} }
    }]));
    const context = {
        window: {}, document: { getElementById: id => nodes[id] }, console,
        fetch: async () => ({ ok: true, json: async () => ({ title: 'Synthetic', reviews: [
            { first_name: '<img src=x onerror=alert(1)>', total_score: 2, review_text: '<svg onload=alert(1)>' },
            { first_name: 'Reviewer', total_score: -2, review_text: 'Other' }
        ] }) }),
        alert() { throw new Error('Projector failed'); }
    };
    vm.createContext(context);
    const utils = fs.readFileSync(new URL('../public/js/utils.js', import.meta.url), 'utf8').replace('export function escapeHtml', 'function escapeHtml');
    const projector = fs.readFileSync(new URL('../public/js/projector.js', import.meta.url), 'utf8')
        .replace(/^import .*?;\s*/m, '').replace('export function wireProjectorModalClose', 'function wireProjectorModalClose');
    vm.runInContext(`${utils}\n${projector}`, context);
    await context.window.openProjectorView(1);
    assert.doesNotMatch(nodes['projector-scores'].innerHTML, /<img/i);
    assert.doesNotMatch(nodes['projector-disagreements'].innerHTML, /<svg|<img/i);
    assert.match(nodes['projector-disagreements'].innerHTML, /&lt;svg/);
});
