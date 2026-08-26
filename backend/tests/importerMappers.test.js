const test = require('node:test');
const assert = require('node:assert');
const mapAuthor = require('../importer/mappers/authorMapper');
const mapPaper = require('../importer/mappers/paperMapper');
const mapReview = require('../importer/mappers/reviewMapper');
const mapComment = require('../importer/mappers/commentMapper');
const mapBid = require('../importer/mappers/bidMapper');
const mapAssignment = require('../importer/mappers/assignmentMapper');
const mapConflict = require('../importer/mappers/conflictMapper');
const mapProgramCommitteeMember = require('../importer/mappers/programCommitteeMapper');
const { mapPcTopic, mapSubmissionTopic } = require('../importer/mappers/topicMapper');
const mapMetaReview = require('../importer/mappers/metaReviewMapper');

function cell(value) {
    return value === undefined ? null : { value };
}

function row(values) {
    const cells = {};
    for (const [col, val] of Object.entries(values)) {
        cells[Number(col)] = cell(val);
    }
    return {
        getCell(n) {
            if (this._missing) this._missing.push(n);
            return cells[n] === undefined ? cell(null) : cells[n];
        },
        _missing: []
    };
}

test('mapAuthor maps fixed columns without headerMap', () => {
    const r = row({ 2: 'Jane', 3: 'Doe', 4: 'jane@x.com', 5: 'US', 6: 'MIT', 7: 42 });
    assert.deepStrictEqual(mapAuthor(r), {
        externalPersonId: 42,
        firstName: 'Jane',
        lastName: 'Doe',
        email: 'jane@x.com',
        country: 'US',
        affiliation: 'MIT'
    });
});

test('mapAuthor uses headerMap when provided', () => {
    const headerMap = { 'person #': 1, 'first name': 2, 'last name': 3, email: 4, country: 5, affiliation: 6, 'web page': 9 };
    const r = row({ 1: 7, 2: 'Ada', 3: 'L', 4: 'a@b.c', 5: 'UK', 6: 'Ox', 9: 'http://a' });
    assert.deepStrictEqual(mapAuthor(r, headerMap), {
        externalPersonId: 7,
        firstName: 'Ada',
        lastName: 'L',
        email: 'a@b.c',
        country: 'UK',
        affiliation: 'Ox',
        webPage: 'http://a'
    });
});

test('mapAuthor falls back to fixed columns for missing header entries', () => {
    const r = row({ 2: 'Ann', 7: 5 });
    const mapped = mapAuthor(r, {});
    assert.strictEqual(mapped.firstName, 'Ann');
    assert.strictEqual(mapped.externalPersonId, 5);
    assert.strictEqual(mapped.webPage, null);
});

test('mapAuthor returns nulls for empty row', () => {
    const mapped = mapAuthor(row({}));
    assert.strictEqual(mapped.email, null);
    assert.strictEqual(mapped.externalPersonId, null);
});

test('mapPaper maps happy path with decision category', () => {
    const r = row({ 1: 11, 2: 'Title', 4: '2026-01-01', 5: '2026-01-02', 8: 'Accept', 9: '✔', 10: 'yes' });
    const mapped = mapPaper(r, 'conf1', -1);
    assert.deepStrictEqual(mapped, {
        conferenceId: 'conf1',
        externalSubmissionId: 11,
        title: 'Title',
        submittedAt: '2026-01-01',
        lastUpdatedAt: '2026-01-02',
        decision: 'Accept',
        decisionCategory: 'accept',
        notified: true,
        reviewsSent: true,
        isDeleted: false
    });
});

test('mapPaper handles deleted column variants', () => {
    for (const [val, expected] of [['yes', true], ['Yes', true], ['true', true], ['1', true], ['no', false], ['', false], ['maybe', false]]) {
        const mapped = mapPaper(row({ 15: val }), 'c', 15);
        assert.strictEqual(mapped.isDeleted, expected, `deleted="${val}"`);
    }
});

test('mapPaper ignores deleted flag when no deleted column', () => {
    assert.strictEqual(mapPaper(row({}), 'c').isDeleted, false);
});

test('mapPaper normalizes decision categories and empty flags', () => {
    const mapped = mapPaper(row({ 2: 'T', 8: 'Withdrawn', 9: '', 10: null }), 'c');
    assert.strictEqual(mapped.decisionCategory, 'withdrawn');
    assert.strictEqual(mapped.notified, false);
    assert.strictEqual(mapped.reviewsSent, false);

    const desk = mapPaper(row({ 8: 'Desk Reject' }), 'c');
    assert.strictEqual(desk.decisionCategory, 'desk reject');

    const none = mapPaper(row({ 8: 123 }), 'c');
    assert.strictEqual(none.decisionCategory, 'no decision');
});

test('mapReview parses ids and scores from a standard row', () => {
    const r = row({
        2: '10', 3: '20', 4: 'John Smith', 5: '3', 6: '2',
        7: 'Good paper', 8: 'overall:4', 9: '4.0',
        10: 'Sub', 11: 'Rev', 12: 'sub@x.com', 13: '99',
        14: '2026-02-01', 15: '10:00', 16: 'yes'
    });
    assert.deepStrictEqual(mapReview(r), {
        externalSubmissionId: 10,
        externalPersonId: 20,
        memberName: 'John Smith',
        subReviewerPersonId: 99,
        subReviewerFirstName: 'Sub',
        subReviewerLastName: 'Rev',
        subReviewerEmail: 'sub@x.com',
        reviewNumber: 3,
        version: 2,
        reviewText: 'Good paper',
        scores: 'overall:4',
        totalScore: 4.0,
        reviewDate: '2026-02-01',
        reviewTime: '10:00',
        hasAttachment: true
    });
});

test('mapReview defaults missing numeric fields to null/1/empty', () => {
    const mapped = mapReview(row({ 4: 'Reviewer' }));
    assert.strictEqual(mapped.externalSubmissionId, null);
    assert.strictEqual(mapped.externalPersonId, null);
    assert.strictEqual(mapped.reviewNumber, 1);
    assert.strictEqual(mapped.version, 1);
    assert.strictEqual(mapped.reviewText, '');
    assert.strictEqual(mapped.scores, null);
    assert.strictEqual(mapped.totalScore, null);
    assert.strictEqual(mapped.hasAttachment, false);
});

test('mapReview rejects malformed numeric values as null', () => {
    const mapped = mapReview(row({ 2: 'abc', 3: '', 9: 'not-a-number' }));
    assert.strictEqual(mapped.externalSubmissionId, null);
    assert.strictEqual(mapped.externalPersonId, null);
    assert.strictEqual(mapped.totalScore, null);
});

test('mapReview detects shifted columns when reviewer name is in col 4 and number in col 5', () => {
    const r = row({
        2: '1', 3: '2', 4: 30, 5: 'reviewer30', 6: '5', 7: '1',
        8: 'text here', 9: 'scores', 10: '4.5'
    });
    const mapped = mapReview(r);
    assert.strictEqual(mapped.memberName, 'reviewer30');
    assert.strictEqual(mapped.reviewNumber, 5);
    assert.strictEqual(mapped.version, 1);
    assert.strictEqual(mapped.reviewText, 'text here');
    assert.strictEqual(mapped.scores, 'scores');
    assert.strictEqual(mapped.totalScore, 4.5);
});

test('mapReview accepts checkmark as attachment indicator', () => {
    assert.strictEqual(mapReview(row({ 16: '✔' })).hasAttachment, true);
    assert.strictEqual(mapReview(row({ 17: '✔', 4: 1, 5: 'n' })).hasAttachment, true); // shifted
});

test('mapComment maps submission, person, text, date and time', () => {
    const r = row({ 1: 3, 2: 4, 4: 'Please clarify', 5: '2026-03-01', 6: '09:30' });
    assert.deepStrictEqual(mapComment(r), {
        externalSubmissionId: 3,
        externalPersonId: 4,
        commentText: 'Please clarify',
        commentDate: '2026-03-01',
        commentTime: '09:30'
    });
});

test('mapComment skips column 3 and tolerates empties', () => {
    const mapped = mapComment(row({ 1: 3 }));
    assert.strictEqual(mapped.commentText, null);
    assert.strictEqual(mapped.commentDate, null);
    assert.strictEqual(mapped.commentTime, null);
});

test('mapBid maps positional row without headerMap', () => {
    assert.deepStrictEqual(mapBid(row({ 1: 5, 2: 6, 3: 'willing' })), {
        externalPersonId: 5,
        externalSubmissionId: 6,
        bid: 'willing'
    });
});

test('mapBid resolves via headerMap aliases', () => {
    const headerMap = { 'reviewer #': 1, 'paper id': 2, 'bid status': 3 };
    const mapped = mapBid(row({ 1: 7, 2: 8, 3: 'conflict' }), headerMap);
    assert.deepStrictEqual(mapped, {
        externalPersonId: 7,
        externalSubmissionId: 8,
        bid: 'conflict'
    });
});

test('mapBid falls back to positions when headerMap has no matches', () => {
    const mapped = mapBid(row({ 1: 1, 2: 2, 3: 'none' }), {});
    assert.deepStrictEqual(mapped, { externalPersonId: 1, externalSubmissionId: 2, bid: 'none' });
});

test('mapAssignment maps member and submission ids', () => {
    assert.deepStrictEqual(mapAssignment(row({ 1: 12, 2: 34 })), {
        externalPersonId: 12,
        externalSubmissionId: 34
    });
    assert.deepStrictEqual(mapAssignment(row({})), { externalPersonId: null, externalSubmissionId: null });
});

test('mapConflict resolves via headerMap then position fallback', () => {
    const mapped = mapConflict(row({ 3: 100, 4: 200 }), { 'submission #': 3, 'paper #': 4, 'member #': 5 });
    assert.deepStrictEqual(mapped, { externalPersonId: null, externalSubmissionId: 100 });

    const positional = mapConflict(row({ 1: 100, 2: 300 }));
    assert.deepStrictEqual(positional, { externalPersonId: 100, externalSubmissionId: 300 });
});

test('mapProgramCommitteeMember maps fields and defaults unknown role', () => {
    const full = mapProgramCommitteeMember(
        row({ 2: 1, 3: 'A', 4: 'B', 5: 'a@b.c', 6: 'DE', 7: 'Uni', 8: 'Chair' }),
        'conf9'
    );
    assert.deepStrictEqual(full, {
        conferenceId: 'conf9',
        externalPersonId: 1,
        firstName: 'A',
        lastName: 'B',
        email: 'a@b.c',
        country: 'DE',
        affiliation: 'Uni',
        role: 'Chair'
    });

    const empty = mapProgramCommitteeMember(row({}), 'conf9');
    assert.strictEqual(empty.role, 'Unknown');
    assert.strictEqual(empty.email, null);
});

test('mapProgramCommitteeMember honours custom roleIndex', () => {
    const mapped = mapProgramCommitteeMember(row({ 10: 'Reviewer' }), 'c', 10);
    assert.strictEqual(mapped.role, 'Reviewer');
});

test('topicMapper maps pc and submission topics', () => {
    assert.deepStrictEqual(mapPcTopic(row({ 1: 9, 3: 'ML' })), { externalPersonId: 9, topicName: 'ML' });
    assert.deepStrictEqual(mapPcTopic(row({})), { externalPersonId: null, topicName: null });
    assert.deepStrictEqual(mapSubmissionTopic(row({ 1: 4, 2: 'NLP' })), { externalSubmissionId: 4, topicName: 'NLP' });
    assert.deepStrictEqual(mapSubmissionTopic(row({})), { externalSubmissionId: null, topicName: null });
});

test('mapMetaReview maps positional row', () => {
    const r = row({ 1: 2, 2: 3, 4: 'Accept', 5: 'Solid work', 7: '2026-04-01', 8: '12:00' });
    assert.deepStrictEqual(mapMetaReview(r), {
        externalSubmissionId: 2,
        externalPersonId: 3,
        recommendation: 'Accept',
        reviewText: 'Solid work',
        reviewDate: '2026-04-01',
        reviewTime: '12:00'
    });
});

test('mapMetaReview resolves via headerMap and falls back to positions', () => {
    const headerMap = { 'submission #': 1, 'member #': 2, recommendation: 3, text: 4, date: 5, time: 6 };
    const mapped = mapMetaReview(row({ 1: 2, 2: 3, 3: 'Reject', 4: 'Weak', 5: 'd', 6: 't' }), headerMap);
    assert.deepStrictEqual(mapped, {
        externalSubmissionId: 2,
        externalPersonId: 3,
        recommendation: 'Reject',
        reviewText: 'Weak',
        reviewDate: 'd',
        reviewTime: 't'
    });

    const fallback = mapMetaReview(row({ 1: 2, 2: 3 }), {});
    assert.strictEqual(fallback.recommendation, null);
    assert.strictEqual(fallback.reviewText, null);
});
