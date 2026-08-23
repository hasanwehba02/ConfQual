import test from 'node:test';
import assert from 'node:assert/strict';
import { extractEvaluationText } from '../utils/sentimentEngine.js';

test('extractEvaluationText: academic review structure variations', async (t) => {
    await t.test('extracts from (OVERALL EVALUATION) section', () => {
        const text = `
(PAPER SUMMARY)
This paper proposes a deep learning model for detecting defects in manufacturing.
The authors evaluate on 3 benchmarks.

(OVERALL EVALUATION)
The methodology has serious flaws. The evaluation baseline is outdated and results are unreproducible. Reject.
        `;
        const result = extractEvaluationText(text);
        assert.ok(result.includes('The methodology has serious flaws'));
        assert.ok(!result.includes('(PAPER SUMMARY)'));
    });

    await t.test('extracts from (DETAILED COMMENTS) section', () => {
        const text = `
(PAPER SUMMARY)
Overview of quantum algorithms for graph coloring.

(DETAILED COMMENTS)
Outstanding contribution. The mathematical proofs in Section 4 are rigorous and elegant.
        `;
        const result = extractEvaluationText(text);
        assert.ok(result.includes('Outstanding contribution'));
        assert.ok(!result.includes('(PAPER SUMMARY)'));
    });

    await t.test('extracts from (COMMENTS TO AUTHORS) section', () => {
        const text = `
(SUMMARY)
Summary of the paper.

(COMMENTS TO AUTHORS)
The paper is well written, but lacks comparison with recent 2024 baselines.
        `;
        const result = extractEvaluationText(text);
        assert.ok(result.includes('The paper is well written, but lacks comparison'));
    });

    await t.test('extracts from (STRENGTHS AND WEAKNESSES) section', () => {
        const text = `
(ABSTRACT RECAP)
Good recap.

(STRENGTHS AND WEAKNESSES)
Strengths: Novel approach.
Weaknesses: Limited empirical validation.
        `;
        const result = extractEvaluationText(text);
        assert.ok(result.includes('Strengths: Novel approach'));
    });

    await t.test('falls back to full text if no recognized section header exists', () => {
        const text = 'This is a short unstructured review. Overall good work.';
        const result = extractEvaluationText(text);
        assert.equal(result, 'This is a short unstructured review. Overall good work.');
    });

    await t.test('handles empty, null, and non-string values gracefully', () => {
        assert.equal(extractEvaluationText(null), '');
        assert.equal(extractEvaluationText(undefined), '');
        assert.equal(extractEvaluationText(''), '');
        assert.equal(extractEvaluationText('   '), '');
        assert.equal(extractEvaluationText(123), '');
        assert.equal(extractEvaluationText({}), '');
    });
});
