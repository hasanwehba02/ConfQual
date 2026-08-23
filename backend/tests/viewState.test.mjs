import { test } from 'node:test';
import assert from 'node:assert/strict';
import { encodePapersHash, parsePapersHash, sanitizePapersState,
         resolveActiveConferenceId, createPresetStore, createPreset,
         PAPERS_DEFAULT } from '../public/js/viewState.mjs';

class MemoryStorage {
  constructor() { this.map = new Map(); }
  getItem(k) { return this.map.has(k) ? this.map.get(k) : null; }
  setItem(k, v) { this.map.set(k, String(v)); }
}

const OPTS = { filterModes: ['all', 'no_comments', 'to_discuss'],
               sortFields: ['external_submission_id', 'total_comments'] };

test('encode omits defaults', () => {
  const h = encodePapersHash({ conferenceId: 3, ...PAPERS_DEFAULT, searchText: '' });
  assert.equal(h, '#/papers?c=3');
});

test('encode with no non-defaults produces bare hash', () => {
  const h = encodePapersHash({ conferenceId: null, ...PAPERS_DEFAULT, searchText: '' });
  assert.equal(h, '#/papers');
});

test('encode includes non-defaults', () => {
  const h = encodePapersHash({ conferenceId: 3, filterMode: 'to_discuss',
    sortBy: 'total_comments', sortOrder: 'ASC', searchText: 'bayes' });
  assert.ok(h.includes('f=to_discuss') && h.includes('s=total_comments')
         && h.includes('o=ASC') && h.includes('q=bayes'));
});

test('round-trip', () => {
  const raw = parsePapersHash(encodePapersHash({ conferenceId: 1,
    filterMode: 'no_comments', sortBy: PAPERS_DEFAULT.sortBy,
    sortOrder: PAPERS_DEFAULT.sortOrder, searchText: 'x' }));
  const s = sanitizePapersState(raw, { ...OPTS, conferenceIds: [1] });
  assert.deepEqual(s, { conferenceId: 1, filterMode: 'no_comments',
    sortBy: PAPERS_DEFAULT.sortBy, sortOrder: PAPERS_DEFAULT.sortOrder, searchText: 'x' });
});

test('parse rejects foreign hashes', () => {
  assert.equal(parsePapersHash('#/reviewers?f=x'), null);
  assert.equal(parsePapersHash(''), null);
  assert.equal(parsePapersHash(null), null);
});

test('sanitize falls back on invalid values', () => {
  const s = sanitizePapersState({ f: 'hack', s: 'evil;drop', o: 'SIDEWAYS' },
    { ...OPTS, conferenceIds: [] });
  assert.equal(s.filterMode, 'all');
  assert.equal(s.sortBy, 'external_submission_id');
  assert.equal(s.sortOrder, 'DESC');
});

test('sanitize accepts case-insensitive order and clamps search text', () => {
  const s = sanitizePapersState({ o: 'asc', q: 'a'.repeat(500) }, { ...OPTS, conferenceIds: [] });
  assert.equal(s.sortOrder, 'ASC');
  assert.equal(s.searchText.length, 200);
});

test('sanitize keeps valid conference id only when listed', () => {
  assert.equal(sanitizePapersState({ c: '7' }, { ...OPTS, conferenceIds: [7] }).conferenceId, 7);
  assert.equal(sanitizePapersState({ c: '7' }, { ...OPTS, conferenceIds: [8] }).conferenceId, null);
});

test('resolveActiveConferenceId branches', () => {
  assert.equal(resolveActiveConferenceId([{ id: 7 }, { id: 2 }], null), 7);
  assert.equal(resolveActiveConferenceId([{ id: 7 }], 2), 2);
  assert.equal(resolveActiveConferenceId([], null), null);
});
