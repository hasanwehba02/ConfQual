import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const payload = '<img src=x onerror=alert(1)>';
const utils = fs.readFileSync(new URL('../public/js/utils.js', import.meta.url), 'utf8')
    .replace('export function escapeHtml', 'function escapeHtml');

test('awards and quality profile escape imported names, titles, topics, and country', () => {
    const nodes = new Map();
    const element = () => ({ innerHTML: '', textContent: '', style: {}, children: [], appendChild(child) { this.children.push(child); }, contains() { return true; } });
    const document = { getElementById(id) { if (!nodes.has(id)) nodes.set(id, element()); return nodes.get(id); }, createElement: element };
    const calls = [];
    const context = { document, window: { openReviewerModal: (...args) => calls.push(['reviewer', ...args]), openPaperModal: (...args) => calls.push(['paper', ...args]) }, state: {} };
    vm.createContext(context);
    const source = fs.readFileSync(new URL('../public/js/tables.js', import.meta.url), 'utf8')
        .replace(/^import .*;\s*/gm, '').replace(/export (async )?function/g, '$1function');
    vm.runInContext(`${utils}\nfunction getBiasBadgeClass() { return ''; }\n${source}`, context);

    context.renderAwardsTab({ topReviewers: [{ id: 7, first_name: payload, last_name: 'Reviewer', reviews_done: 1 }], topPapers: [{ id: 8, title: payload }], sessionClusters: {} });
    const reviewers = nodes.get('top-reviewers-body');
    const papers = nodes.get('top-papers-body');
    assert.doesNotMatch(reviewers.innerHTML + papers.innerHTML, /<img|\sonclick=/i);
    assert.match(reviewers.innerHTML, /&lt;img/);
    assert.match(papers.innerHTML, /&lt;img/);
    reviewers.onclick({ target: { closest: () => ({ dataset: { index: '0' } }) } });
    papers.onclick({ target: { closest: () => ({ dataset: { index: '0' } }) } });
    assert.deepEqual(calls, [['reviewer', 7, `${payload} Reviewer`], ['paper', 8]]);

    context.renderQualityProfile({
        compatibilityStatement: '', selectivity: { acceptanceRate: 0, rank: '' }, rigor: { avgReviewsPerPaper: 0 },
        internationalization: { internationalPercentage: 0, domesticCount: 1, internationalCount: 0, totalCountries: 1, domesticCountry: payload },
        thematicCompetence: [{ topic_name: payload, submitted_papers: 1, available_experts: 1 }], gapTopics: []
    });
    const topicHtml = nodes.get('thematic-competence-body').children[0].innerHTML;
    const countryHtml = nodes.get('geographic-breakdown').innerHTML;
    assert.doesNotMatch(topicHtml + countryHtml, /<img/i);
    assert.match(topicHtml + countryHtml, /&lt;img/);
});

test('reviewer drawer escapes imported bid values', async () => {
    const drawerBody = { innerHTML: '', querySelector: () => null };
    const drawer = { classList: { add() {}, remove() {} } };
    const document = { getElementById(id) { return { 'detail-drawer': drawer, 'detail-drawer-title': { textContent: '' }, 'detail-drawer-body': drawerBody }[id] || null; } };
    const context = {
        document, window: {}, state: { activeConferenceId: null, isCurrentAnonymized: true }, console,
        fetch: async url => ({ ok: true, json: async () => url.includes('/notes') ? [] : {
            role: 'reviewer', email: '', assignments: [{ external_submission_id: 1, title: 'Paper', bid_status: payload }],
            bids: [{ external_submission_id: 1, title: 'Paper', bid: payload }]
        } })
    };
    vm.createContext(context);
    const source = fs.readFileSync(new URL('../public/js/drawers.js', import.meta.url), 'utf8')
        .replace(/^import .*;\s*/gm, '').replace(/export (async )?function/g, '$1function');
    vm.runInContext(`${utils}\nfunction buildEmailDraft() {}\n${source}`, context);
    await context.window.openReviewerModal(7, 'Reviewer');
    assert.doesNotMatch(drawerBody.innerHTML, /<img/i);
    assert.match(drawerBody.innerHTML, /&lt;img/);
});
