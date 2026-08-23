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

test('reviewer_followup draft is polite check-in', () => {
  const d = buildEmailDraft('reviewer_followup', {
    recipientName: 'Tim Berners-Lee', recipientEmail: 'tim@example.com',
    conferenceLabel: "CONF '26",
  });
  assert.equal(d.to, 'tim@example.com');
  assert.ok(d.subject.toLowerCase().includes('follow-up'));
  assert.ok(d.body.includes('Tim Berners-Lee'));
  assert.ok(d.body.includes("CONF '26"));
  assert.ok(!d.body.includes('undefined'));
});

test('missing optional fields degrade gracefully', () => {
  const d = buildEmailDraft('coi', { recipientName: 'X Y' });
  assert.ok(!d.body.includes('undefined'));
  assert.ok(!d.subject.includes('undefined'));
});

test('silent_debate draft references paper and spread', () => {
  const d = buildEmailDraft('silent_debate', {
    recipientName: 'Grace Hopper', recipientEmail: 'grace@example.com',
    paperId: 7, paperTitle: 'Debated Systems', spread: 4, conferenceLabel: "CONF '26",
  });
  assert.ok(d.subject.includes('#7'));
  assert.ok(d.body.includes('Grace Hopper'));
  assert.ok(d.body.includes('Debated Systems'));
  assert.ok(d.body.includes('4'));
  assert.ok(!d.body.includes('undefined'));
});

test('expertise_mismatch draft lists topic gap without accusatory tone', () => {
  const d = buildEmailDraft('expertise_mismatch', {
    recipientName: 'Alan Turing', recipientEmail: 'alan@example.com',
    paperId: 9, paperTitle: 'Morphogenesis',
    paperTopics: 'Biology, Dynamical Systems', reviewerTopics: 'Databases',
    conferenceLabel: "CONF '26",
  });
  assert.ok(d.subject.includes('#9'));
  assert.ok(d.body.includes('Alan Turing'));
  assert.ok(d.body.includes('Biology, Dynamical Systems'));
  assert.ok(d.body.includes('Databases'));
  const lower = d.body.toLowerCase();
  assert.ok(lower.includes('reassign') || lower.includes('flag') || lower.includes('let us know'));
});

test('missing_metareview draft asks for a volunteer', () => {
  const d = buildEmailDraft('missing_metareview', {
    recipientName: 'Edsger Dijkstra', recipientEmail: 'edsger@example.com',
    paperId: 12, paperTitle: 'Go-To Considered Harmful', scoreSpread: 3,
    conferenceLabel: "CONF '26",
  });
  assert.ok(d.subject.includes('#12'));
  assert.ok(d.body.includes('Edsger Dijkstra'));
  const lower = d.body.toLowerCase();
  assert.ok(lower.includes('volunteer') || lower.includes('willing'));
  assert.ok(!d.body.includes('undefined'));
});

test('sentiment_mismatch draft diplomatically flags divergence', () => {
  const d = buildEmailDraft('sentiment_mismatch', {
    recipientName: 'Barbara Liskov', recipientEmail: 'barbara@example.com',
    paperId: 15, paperTitle: 'Data Abstraction', totalScore: -1, sentimentScore: 14,
    conferenceLabel: "CONF '26",
  });
  assert.ok(d.subject.includes('#15'));
  assert.ok(d.body.includes('Barbara Liskov'));
  assert.ok(d.body.includes('-1'));
  assert.ok(d.body.includes('14'));
  assert.ok(!d.body.includes('undefined'));
});

test('custom draft is fully populated and degradation safe', () => {
  const d = buildEmailDraft('custom', {
    recipientName: 'Edsger Dijkstra',
    recipientEmail: 'dijkstra@example.com',
    paperId: 42,
    paperTitle: 'Shortest Path Algorithms',
    conferenceLabel: "CONF '26",
  });
  assert.equal(d.to, 'dijkstra@example.com');
  assert.ok(d.subject.includes('#42'));
  assert.ok(d.body.includes('Edsger Dijkstra'));
  assert.ok(d.body.includes("CONF '26"));
  assert.ok(!d.body.includes('undefined'));
});

test('new kinds degrade gracefully on missing optional fields', () => {
  for (const k of ['silent_debate', 'expertise_mismatch', 'missing_metareview', 'sentiment_mismatch', 'reviewer_followup', 'custom']) {
    const d = buildEmailDraft(k, { recipientName: 'X Y' });
    assert.ok(!d.body.includes('undefined'), `${k} body has undefined`);
    assert.ok(!d.subject.includes('undefined'), `${k} subject has undefined`);
  }
});

test('unknown kind throws', () => {
  assert.throws(() => buildEmailDraft('nonsense', {}));
});
