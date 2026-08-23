import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildEmailDraft } from '../public/js/emailDrafts.mjs';

const coiCtx = {
  recipientName: 'Ada Lovelace', recipientEmail: 'ada@example.com',
  paperId: 42, paperTitle: 'A Study of Analytical Engines',
  conferenceLabel: "CONF '26",
};

test('coi draft fills subject, to, and body', () => {
  const d = buildEmailDraft('coi', coiCtx);
  assert.equal(d.to, 'ada@example.com');
  assert.ok(d.subject.includes('#42'));
  assert.ok(d.body.includes('Ada Lovelace'));
  assert.ok(d.body.includes('A Study of Analytical Engines'));
  assert.ok(d.body.includes("CONF '26"));
  assert.ok(!d.body.includes('undefined'));
});

test('low_effort draft mentions word count', () => {
  const d = buildEmailDraft('low_effort', {
    recipientName: 'Grace Hopper', recipientEmail: 'grace@example.com',
    avgWordCount: 38, conferenceLabel: "CONF '26",
  });
  assert.ok(d.subject.toLowerCase().includes('review'));
  assert.ok(d.body.includes('Grace Hopper'));
  assert.ok(d.body.includes('38'));
  assert.ok(!d.body.includes('undefined'));
});

test('missing optional fields degrade gracefully', () => {
  const d = buildEmailDraft('coi', { recipientName: 'X Y' });
  assert.ok(!d.body.includes('undefined'));
  assert.ok(!d.subject.includes('undefined'));
});

test('unknown kind throws', () => {
  assert.throws(() => buildEmailDraft('nonsense', {}));
});
