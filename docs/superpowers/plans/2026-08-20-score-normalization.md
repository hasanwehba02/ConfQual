# Score Normalization / Bias Correction Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a z-score normalized ("bias-corrected") paper score column and per-reviewer bias labels so chairs see fairer paper quality.

**Architecture:** Per-reviewer mean/std computed in SQL CTEs (conference-scoped, external-person-id identity), re-scaled to the -3..+3 scale via conference-wide stats, exposed as `adjusted_score` on papers and `bias_label` on reviewers. A pure-JS util mirrors the formula for testability.

**Tech Stack:** Node.js, Express, PostgreSQL (`pg`), vanilla JS frontend (no framework), Node built-in test runner (`node:test`).

---

## File Structure

| File | Responsibility |
|---|---|
| `backend/utils/scoreNormalization.js` (create) | Pure JS: `computeReviewerStats`, `applyNormalization`, `deriveBiasLabel` |
| `backend/repositories/analyticsRepository.js` (modify) | SQL CTEs for `adjusted_score` (getPaperDebates) + reviewer stats (getReviewerQuality) + sort whitelist |
| `backend/services/analyticsService.js` (modify) | Derive `bias_label` from SQL-provided stats |
| `backend/public/index.html` (modify) | Static `<th>` headers + sort dropdown `<option>`s |
| `backend/public/js/renderers.js` (modify) | Bias badge color/class helpers |
| `backend/public/js/main.js` (modify) | `<td>` cells, highlight, tooltip, badge rendering |
| `backend/tests/scoreNormalization.test.js` (create) | Unit tests for the pure JS functions |

---

## Task 1: scoreNormalization.js util (TDD)

**Files:**
- Create: `backend/utils/scoreNormalization.js`
- Test: `backend/tests/scoreNormalization.test.js`

- [ ] **Step 1: Write the failing test**

Create `backend/tests/scoreNormalization.test.js`:

```js
const test = require('node:test');
const assert = require('node:assert');
const { computeReviewerStats, applyNormalization, deriveBiasLabel } = require('../utils/scoreNormalization');

test('computeReviewerStats returns mean/std/count per eligible reviewer', () => {
    const reviews = [
        { reviewerId: 1, totalScore: 1 },
        { reviewerId: 1, totalScore: 2 },
        { reviewerId: 1, totalScore: 3 },
        { reviewerId: 2, totalScore: -1 },
        { reviewerId: 2, totalScore: 1 }
    ];
    const stats = computeReviewerStats(reviews);
    assert.deepStrictEqual(stats.get(1), { mean: 2, std: 1, count: 3 });
    assert.strictEqual(stats.has(2), false); // only 2 reviews -> ineligible
});

test('computeReviewerStats excludes reviewers with fewer than 3 reviews', () => {
    const reviews = [
        { reviewerId: 1, totalScore: 1 },
        { reviewerId: 1, totalScore: 2 }
    ];
    const stats = computeReviewerStats(reviews);
    assert.strictEqual(stats.size, 0);
});

test('applyNormalization rescales a known z-score to the conference scale', () => {
    const reviews = [
        { reviewerId: 1, totalScore: 1 },
        { reviewerId: 1, totalScore: 2 },
        { reviewerId: 1, totalScore: 3 }
    ];
    const stats = computeReviewerStats(reviews); // {1: {mean:2, std:1, count:3}}
    const confStats = { mean: 0, std: 2 };
    const adjusted = applyNormalization(reviews, stats, confStats);
    // z = (1-2)/1 = -1 -> 0 + (-1)*2 = -2
    // z = (2-2)/1 = 0  -> 0 + 0*2   = 0
    // z = (3-2)/1 = 1  -> 0 + 1*2   = 2
    assert.deepStrictEqual(adjusted, [-2, 0, 2]);
});

test('applyNormalization passes raw scores through for ineligible reviewers', () => {
    const reviews = [
        { reviewerId: 1, totalScore: 2 },
        { reviewerId: 1, totalScore: 4 },
        { reviewerId: 2, totalScore: 3 }
    ];
    const stats = computeReviewerStats(reviews); // no reviewer has >= 3 reviews
    const adjusted = applyNormalization(reviews, stats, { mean: 0, std: 1 });
    assert.deepStrictEqual(adjusted, [2, 4, 3]);
});

test('applyNormalization passes raw score through when reviewer std is zero', () => {
    const reviews = [
        { reviewerId: 1, totalScore: 3 },
        { reviewerId: 1, totalScore: 3 },
        { reviewerId: 1, totalScore: 3 },
        { reviewerId: 2, totalScore: -2 }
    ];
    const stats = computeReviewerStats(reviews); // reviewer 1: std=0 -> still eligible but std=0
    const adjusted = applyNormalization(reviews, stats, { mean: 0, std: 1 });
    assert.strictEqual(adjusted[0], 3); // raw fallback
    assert.strictEqual(adjusted[1], 3);
    assert.strictEqual(adjusted[2], 3);
    assert.strictEqual(adjusted[3], -2); // reviewer 2 ineligible -> raw
});

test('applyNormalization handles negative scores correctly', () => {
    const reviews = [
        { reviewerId: 1, totalScore: -3 },
        { reviewerId: 1, totalScore: -2 },
        { reviewerId: 1, totalScore: -1 }
    ];
    const stats = computeReviewerStats(reviews); // mean=-2, std=1
    const adjusted = applyNormalization(reviews, stats, { mean: 1, std: 1 });
    // z = (-3-(-2))/1 = -1 -> 1 + (-1)*1 = 0
    // z = (-2-(-2))/1 = 0  -> 1 + 0*1   = 1
    // z = (-1-(-2))/1 = 1  -> 1 + 1*1   = 2
    assert.deepStrictEqual(adjusted, [0, 1, 2]);
});

test('applyNormalization yields conf_mean for all when conf_std is zero (no NaN/Infinity)', () => {
    const reviews = [
        { reviewerId: 1, totalScore: 1 },
        { reviewerId: 1, totalScore: 2 },
        { reviewerId: 1, totalScore: 3 }
    ];
    const stats = computeReviewerStats(reviews);
    const adjusted = applyNormalization(reviews, stats, { mean: 0, std: 0 });
    assert.deepStrictEqual(adjusted, [0, 0, 0]);
    adjusted.forEach(a => assert.ok(Number.isFinite(a)));
});

test('deriveBiasLabel returns calibrated for near-zero bias', () => {
    assert.strictEqual(deriveBiasLabel(0.3, 0.0, 5), 'calibrated');
    assert.strictEqual(deriveBiasLabel(-0.4, 0.0, 5), 'calibrated');
});

test('deriveBiasLabel returns lenient/strict for moderate bias', () => {
    assert.strictEqual(deriveBiasLabel(0.8, 0.0, 5), 'lenient');
    assert.strictEqual(deriveBiasLabel(-1.2, 0.0, 5), 'strict');
});

test('deriveBiasLabel returns extreme for strong bias', () => {
    assert.strictEqual(deriveBiasLabel(1.6, 0.0, 5), 'extreme');
    assert.strictEqual(deriveBiasLabel(-2.0, 0.0, 5), 'extreme');
});

test('deriveBiasLabel returns null for fewer than 3 reviews or missing stats', () => {
    assert.strictEqual(deriveBiasLabel(0.8, 0.0, 2), null);
    assert.strictEqual(deriveBiasLabel(null, 0.0, 5), null);
    assert.strictEqual(deriveBiasLabel(0.8, null, 5), null);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && node --test tests/scoreNormalization.test.js`
Expected: FAIL with `Cannot find module '../utils/scoreNormalization'`

- [ ] **Step 3: Write minimal implementation**

Create `backend/utils/scoreNormalization.js`:

```js
/**
 * Computes per-reviewer mean, sample std, and count for reviewers with >= 3 reviews.
 * @param {Array<{reviewerId: number, totalScore: number}>} reviews
 * @returns {Map<number, {mean: number, std: number, count: number}>}
 */
function computeReviewerStats(reviews) {
    const grouped = new Map();
    for (const r of reviews) {
        if (r.totalScore == null) continue;
        if (!grouped.has(r.reviewerId)) {
            grouped.set(r.reviewerId, { sum: 0, sumSq: 0, count: 0 });
        }
        const g = grouped.get(r.reviewerId);
        g.sum += r.totalScore;
        g.sumSq += r.totalScore * r.totalScore;
        g.count += 1;
    }

    const stats = new Map();
    for (const [reviewerId, g] of grouped) {
        if (g.count < 3) continue;
        const mean = g.sum / g.count;
        const variance = g.count > 1
            ? (g.sumSq - (g.sum * g.sum) / g.count) / (g.count - 1)
            : 0;
        stats.set(reviewerId, {
            mean,
            std: Math.sqrt(Math.max(variance, 0)),
            count: g.count
        });
    }
    return stats;
}

/**
 * Maps each review to its bias-corrected score on the conference scale.
 * @param {Array<{reviewerId: number, totalScore: number}>} reviews
 * @param {Map<number, {mean: number, std: number, count: number}>} reviewerStats
 * @param {{mean: number, std: number}} confStats
 * @returns {number[]} one adjusted score per review (in input order)
 */
function applyNormalization(reviews, reviewerStats, confStats) {
    return reviews.map((r) => {
        const st = reviewerStats.get(r.reviewerId);
        if (st && st.std > 0) {
            const z = (r.totalScore - st.mean) / st.std;
            return confStats.mean + z * confStats.std;
        }
        return r.totalScore;
    });
}

/**
 * Classifies a reviewer's bias from their mean vs the conference mean.
 * @param {number|null} reviewerMean
 * @param {number|null} confMean
 * @param {number|null} reviewCount
 * @returns {string|null} 'calibrated' | 'lenient' | 'strict' | 'extreme' | null
 */
function deriveBiasLabel(reviewerMean, confMean, reviewCount) {
    if (reviewerMean == null || confMean == null || reviewCount == null || reviewCount < 3) return null;
    const diff = reviewerMean - confMean;
    const absDiff = Math.abs(diff);
    if (absDiff <= 0.5) return 'calibrated';
    if (absDiff <= 1.5) return diff > 0 ? 'lenient' : 'strict';
    return 'extreme';
}

module.exports = {
    computeReviewerStats,
    applyNormalization,
    deriveBiasLabel
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && node --test tests/scoreNormalization.test.js`
Expected: PASS — all tests green

- [ ] **Step 5: Commit**

```bash
git add backend/utils/scoreNormalization.js backend/tests/scoreNormalization.test.js
git commit -m "feat: add score normalization utility functions"
```

---

## Task 2: getPaperDebates — adjusted_score CTEs

**Files:**
- Modify: `backend/repositories/analyticsRepository.js` (ALLOWED_SORT_COLUMNS ~line 73; getPaperDebates query ~lines 331-352)

- [ ] **Step 1: Add adjusted_score to the sort whitelist**

In `ALLOWED_SORT_COLUMNS` (line 73), add `'adjusted_score'`:

```js
const ALLOWED_SORT_COLUMNS = new Set([
    'id', 'external_submission_id', 'title', 'total_reviews', 'average_score',
    'score_spread', 'total_comments', 'reviewer_id', 'first_name', 'last_name',
    'total_reviews_completed', 'avg_word_count', 'avg_score_given', 'total_comments',
    'calibration_index', 'peers_avg', 'review_date', 'total_score', 'adjusted_score'
]);
```

- [ ] **Step 2: Add normalization CTEs and adjusted_score to getPaperDebates**

In `getPaperDebates`, replace the `const query = \`...\`;` block (lines 331-352) so it begins with the CTEs and adds `adjusted_score`:

```js
    const query = `
        WITH ReviewIdentity AS (
            SELECT r.id AS review_id, r.paper_id, r.total_score,
                   COALESCE(r.sub_reviewer_person_id, pcm.external_person_id) AS reviewer_person_id
            FROM review r
            JOIN program_committee_member pcm ON pcm.id = r.program_committee_member_id
            JOIN paper p ON r.paper_id = p.id
            WHERE r.is_superseded = false
              AND p.is_deleted = false
              AND p.conference_id = $1
        ),
        ReviewerZStats AS (
            SELECT reviewer_person_id,
                   COUNT(*)::int AS review_count,
                   AVG(total_score) AS reviewer_mean,
                   STDDEV(total_score) AS reviewer_std
            FROM ReviewIdentity
            GROUP BY reviewer_person_id
            HAVING COUNT(*) >= 3
        ),
        ConferenceStats AS (
            SELECT AVG(total_score) AS conf_mean, STDDEV(total_score) AS conf_std
            FROM ReviewIdentity
        ),
        NormalizedReviews AS (
            SELECT ri.review_id,
                   CASE WHEN rz.reviewer_std IS NOT NULL AND rz.reviewer_std > 0
                        THEN cs.conf_mean + ((ri.total_score - rz.reviewer_mean) / rz.reviewer_std) * cs.conf_std
                        ELSE ri.total_score
                   END AS adjusted_score
            FROM ReviewIdentity ri
            LEFT JOIN ReviewerZStats rz USING (reviewer_person_id)
            CROSS JOIN ConferenceStats cs
        )
        SELECT 
            COUNT(*) OVER() as full_count,
            p.id,
            p.external_submission_id,
            p.title,
            p.decision,
            p.decision_category,
            COUNT(DISTINCT r.id) as total_reviews,
            ROUND(AVG(r.total_score), 2) as average_score,
            (MAX(r.total_score) - MIN(r.total_score)) as score_spread,
            COALESCE((SELECT COUNT(*) FROM comment c WHERE c.paper_id = p.id), 0) as total_comments,
            ROUND(AVG(nr.adjusted_score), 2) as adjusted_score
        FROM paper p
        LEFT JOIN review r ON p.id = r.paper_id AND r.is_superseded = false
        LEFT JOIN NormalizedReviews nr ON nr.review_id = r.id
        WHERE p.is_deleted = false AND p.conference_id = $1
        ${excludeDeskNoDecision}
        GROUP BY p.id
        ${havingClause}
        ${whereExtra}
        ${orderClause}
        ${limitClause} ${offsetClause}
    `;
```

> **Important:** The CTE `WHERE p.conference_id = $1` reuses the SAME `$1` placeholder as the outer query — no parameter reordering needed. Do not add a new placeholder.

- [ ] **Step 3: Verify the query runs against the database**

Create a temp verification script `backend/verify-adjusted.js`:

```js
require('dotenv').config();
const analyticsRepository = require('./repositories/analyticsRepository');

(async () => {
    try {
        const rows = await analyticsRepository.getPaperDebates({ limit: 5 });
        console.log('adjusted_score:', rows.map(x => x.adjusted_score));
        console.log('average_score :', rows.map(x => x.average_score));
    } catch (e) {
        console.error('ERR', e.message);
        process.exit(1);
    }
})();
```

Run: `cd backend && node verify-adjusted.js`
Expected: prints arrays of `adjusted_score` and `average_score` values (adjusted may equal average for small samples, that's fine)

Then delete the script: `rm backend/verify-adjusted.js`

- [ ] **Step 4: Commit**

```bash
git add backend/repositories/analyticsRepository.js
git commit -m "feat: add adjusted_score (bias-corrected) to paper debates query"
```

---

## Task 3: getReviewerQuality — reviewer_std + conf stats

**Files:**
- Modify: `backend/repositories/analyticsRepository.js` (getReviewerQuality ~lines 112-219)

- [ ] **Step 1: Add ConferenceStats CTE and reviewer_std to getReviewerQuality**

In `getReviewerQuality`, add a `ConferenceStats` CTE to the `WITH` block (after `ReviewerComments`, before the main SELECT at line 192):

```sql
        ConferenceStats AS (
            SELECT AVG(r.total_score) AS conf_mean, STDDEV(r.total_score) AS conf_std
            FROM review r
            JOIN paper p ON r.paper_id = p.id
            WHERE r.is_superseded = false AND p.is_deleted = false AND p.conference_id = $1
        )
```

In the main SELECT (line 192), add `reviewer_std` after `avg_score_given`, and add `cs.conf_mean`, `cs.conf_std` after `rcal.calibration_index`:

```sql
        SELECT 
            COUNT(*) OVER() as full_count,
            pcm.id,
            pcm.external_person_id as reviewer_id,
            pcm.first_name,
            pcm.last_name,
            pcm.role,
            COUNT(DISTINCT r.id) as total_reviews_completed,
            ROUND(AVG(cardinality(regexp_split_to_array(trim(r.review_text), '\\s+'))), 0) as avg_word_count,
            ROUND(AVG(r.total_score), 2) as avg_score_given,
            ROUND(STDDEV(r.total_score), 2) as reviewer_std,
            rcal.peers_avg,
            COALESCE(rc.total_comments, 0) as total_comments,
            rb.bidding_match_percentage,
            rcal.calibration_index,
            MAX(cs.conf_mean) AS conf_mean,
            MAX(cs.conf_std) AS conf_std
        FROM program_committee_member pcm
        LEFT JOIN review r ON (pcm.id = r.program_committee_member_id OR pcm.external_person_id = r.sub_reviewer_person_id) AND r.is_superseded = false
        LEFT JOIN ReviewerComments rc ON pcm.id = rc.program_committee_member_id
        LEFT JOIN ReviewerBidding rb ON pcm.id = rb.program_committee_member_id
        LEFT JOIN ReviewerCalibration rcal ON pcm.id = rcal.program_committee_member_id
        CROSS JOIN ConferenceStats cs
        WHERE pcm.conference_id = $1
        ${filterClause}
        GROUP BY pcm.id, pcm.external_person_id, pcm.first_name, pcm.last_name, pcm.role, rc.total_comments, rb.bidding_match_percentage, rcal.peers_avg, rcal.calibration_index
        ${orderClause}
        ${limitClause} ${offsetClause}
    `;
```

> **Note:** `STDDEV()` is an aggregate — it goes in the SELECT list only, NOT in GROUP BY. `MAX(cs.conf_mean)`/`MAX(cs.conf_std)` wrap the single-row `ConferenceStats` CTE in an aggregate so PostgreSQL accepts them in the grouped SELECT without adding them to GROUP BY.

- [ ] **Step 2: Verify the query runs against the database**

Create temp script `backend/verify-reviewer-stats.js`:

```js
require('dotenv').config();
const analyticsRepository = require('./repositories/analyticsRepository');

(async () => {
    try {
        const rows = await analyticsRepository.getReviewerQuality({ limit: 5 });
        console.log(rows.map(x => ({
            name: `${x.first_name} ${x.last_name}`,
            avg: x.avg_score_given,
            std: x.reviewer_std,
            conf_mean: x.conf_mean,
            conf_std: x.conf_std
        })));
    } catch (e) {
        console.error('ERR', e.message);
        process.exit(1);
    }
})();
```

Run: `cd backend && node verify-reviewer-stats.js`
Expected: prints sample reviewers with `reviewer_std`, `conf_mean`, `conf_std` populated (std/conf_std may be null when only one review exists — acceptable)

Then delete the script: `rm backend/verify-reviewer-stats.js`

- [ ] **Step 3: Commit**

```bash
git add backend/repositories/analyticsRepository.js
git commit -m "feat: add reviewer_std and conference stats to reviewer quality query"
```

---

## Task 4: Service — derive bias_label

**Files:**
- Modify: `backend/services/analyticsService.js` (imports at top ~lines 1-4; getReviewers ~lines 197-202)

- [ ] **Step 1: Import deriveBiasLabel**

Add to the imports at the top of `backend/services/analyticsService.js`:

```js
const scoreNormalization = require("../utils/scoreNormalization");
```

- [ ] **Step 2: Derive bias_label in getReviewers**

Replace the `getReviewers` function (lines 197-202):

```js
// 3. Reviewer Explorer
async function getReviewers(options) {
    const reviewers = await getReviewerQuality(options);
    for (const reviewer of reviewers) {
        reviewer.bias_label = scoreNormalization.deriveBiasLabel(
            reviewer.avg_score_given,
            reviewer.conf_mean,
            reviewer.total_reviews_completed
        );
    }
    const totalCount = reviewers.length > 0 ? parseInt(reviewers[0].full_count) || reviewers.length : reviewers.length;
    return { items: reviewers, totalCount };
}
```

- [ ] **Step 3: Verify the endpoint returns bias_label**

Create temp script `backend/verify-bias-label.js`:

```js
require('dotenv').config();
const analyticsService = require('./services/analyticsService');

(async () => {
    try {
        const data = await analyticsService.getReviewers({});
        console.log(data.items.slice(0, 5).map(r => ({
            name: r.first_name,
            label: r.bias_label,
            avg: r.avg_score_given,
            conf_mean: r.conf_mean
        })));
    } catch (e) {
        console.error('ERR', e.message);
        process.exit(1);
    }
})();
```

Run: `cd backend && node verify-bias-label.js`
Expected: prints 5 reviewers with `label` (calibrated/lenient/strict/extreme/null), `avg`, and `conf_mean`

Then delete the script: `rm backend/verify-bias-label.js`

- [ ] **Step 4: Commit**

```bash
git add backend/services/analyticsService.js
git commit -m "feat: derive bias_label in reviewer service"
```

---

## Task 5: Frontend — index.html (headers + sort options)

**Files:**
- Modify: `backend/public/index.html`

- [ ] **Step 1: Add ADJ. AVG column header to papers table**

In the papers `<thead>` (line ~123), after the SPREAD `<th>`, add:

```html
<th>ADJ. AVG</th>
```

- [ ] **Step 2: Add BIAS column header to reviewers table**

In the reviewers `<thead>` (line ~187), after the CALIBRATION `<th>`, add:

```html
<th>BIAS</th>
```

- [ ] **Step 3: Add adjusted_score sort options to the paper-sort dropdown**

In the `<select id="paper-sort">` block (lines 83-91), after the existing `average_score` options (line 89), add:

```html
<option value="adjusted_score_desc">Adj. Score (High to Low)</option>
<option value="adjusted_score_asc">Adj. Score (Low to High)</option>
```

- [ ] **Step 4: Commit**

```bash
git add backend/public/index.html
git commit -m "feat: add adj avg and bias columns and sort options to tables"
```

---

## Task 6: Frontend — renderers.js bias badge helpers

**Files:**
- Modify: `backend/public/js/renderers.js`

- [ ] **Step 1: Add bias badge helpers**

Append to `backend/public/js/renderers.js`:

```js
export function getBiasBadgeClass(biasLabel) {
    if (!biasLabel) return 'bg-neutral';
    switch (biasLabel) {
        case 'calibrated': return 'bg-neutral';
        case 'lenient':
        case 'strict': return 'bg-warning-light';
        case 'extreme': return 'bg-danger-light';
        default: return 'bg-neutral';
    }
}

export function getBiasBadgeColor(biasLabel) {
    if (!biasLabel) return 'gray';
    switch (biasLabel) {
        case 'calibrated': return 'green';
        case 'lenient':
        case 'strict': return 'yellow';
        case 'extreme': return 'red';
        default: return 'gray';
    }
}
```

> **Use the project's actual badge classes.** The `.bg-green-50`/`text-green-700` Tailwind-style classes in `getScoreBadgeClass` are unused (no Tailwind CDN). The real badge styles in `style.css` are `bg-neutral`, `bg-danger-light`, `bg-warning-light`. Follow those.

- [ ] **Step 2: Commit**

```bash
git add backend/public/js/renderers.js
git commit -m "feat: add bias badge helpers to renderers"
```

---

## Task 7: Frontend — main.js table cells

**Files:**
- Modify: `backend/public/js/main.js`

- [ ] **Step 1: Import bias badge helper**

Update the import on line 3 of `backend/public/js/main.js`:

```js
import { getScoreBadgeClass, getScoreBadgeColor, getBiasBadgeClass } from './renderers.js';
```

- [ ] **Step 2: Add ADJ. AVG cell to the papers table**

The column order must match the header in index.html: `ID, TITLE, DECISION, REVS, AVG, SPREAD, ADJ. AVG, CMTS`. In the papers table row template (`renderPapersTable`), the ADJ. AVG `<td>` goes **after the SPREAD sparkline `<td>` (line 1058) and before the `total_comments` `<td>` (line 1059)**:

```js
                <td>
                    <div class="sparkline-container">
                        <span style="font-family: 'Roboto Mono', monospace; width: 40px;">${parseFloat(p.score_spread || 0).toFixed(2)}</span>
                        <div style="flex: 1; background: #eee;">
                            <div class="sparkline-bar ${sparkClass}" style="width: ${sprWidth}%"></div>
                        </div>
                    </div>
                </td>
                <td style="font-family: 'Roboto Mono', monospace;"
                    title="Bias-corrected average (z-score normalized per reviewer)"
                    ${formatAdjScoreCell(p)}>${escapeHtml(p.adjusted_score) || '-'}</td>
                <td style="font-family: 'Roboto Mono', monospace;">${escapeHtml(p.total_comments) || '0'}</td>
```

Where `formatAdjScoreCell` computes the highlight style:

```js
function formatAdjScoreCell(p) {
    const adjusted = parseFloat(p.adjusted_score);
    const raw = parseFloat(p.average_score);
    if (Number.isNaN(adjusted) || Number.isNaN(raw)) return '';
    const diff = Math.abs(adjusted - raw);
    if (diff >= 0.5) return 'style="background-color: #fef3c7;"'; // subtle highlight
    return '';
}
```

Add the `formatAdjScoreCell` function near the other helper functions in `main.js` (e.g. just above `renderPapersTable`).

- [ ] **Step 3: Add BIAS cell to the reviewers table**

In the reviewers table row template (`renderReviewersTable`, around lines 1113-1130), add a new `<td>` after the calibration `<td>` (line 1128), before the `total_comments` `<td>`:

```js
                <td>${r.bias_label ? `<span class="badge ${getBiasBadgeClass(r.bias_label)}">${escapeHtml(r.bias_label)}</span>` : '-'}</td>
                <td style="font-family: 'Roboto Mono', monospace;">${escapeHtml(r.total_comments) || '0'}</td>
```

> **Column alignment check:** The papers table now has 8 columns (ID, TITLE, DECISION, REVS, AVG, SPREAD, ADJ. AVG, CMTS) — 8 `<th>` in index.html must match 8 `<td>` in main.js, in the SAME order (ADJ. AVG td goes after the SPREAD td). The reviewers table now has 10 columns (ID, NAME, ROLE, DONE, W/C, AVG, MATCH %, CALIBRATION, BIAS, CMTS) — 10 `<th>` must match 10 `<td>`. The header order in index.html and the `<td>` order in main.js must match exactly.

- [ ] **Step 4: Verify column alignment**

Count headers in each table's `<thead>` and cells in each row template. Both must match. Open the app in a browser and confirm:
- Papers table renders ADJ. AVG values (or `-`)
- Reviewers table renders BIAS badges (or `-`)
- Sorting by "Adj. Score" works

- [ ] **Step 5: Commit**

```bash
git add backend/public/js/main.js
git commit -m "feat: render adj avg and bias columns in tables"
```

---

## Task 8: Full test suite + final verification

**Files:**
- Verify only (no new changes)

- [ ] **Step 1: Run the full test suite**

Run: `cd backend && npm test`
Expected: ALL PASS (existing tests + new scoreNormalization tests), 0 failures

- [ ] **Step 2: Verify the API endpoints**

Start the server: `cd backend && npm start`
Then in another terminal:

```
curl -s 'http://localhost:PORT/api/analytics/papers?limit=5' | grep -o '"adjusted_score":[^,]*' | head
curl -s 'http://localhost:PORT/api/analytics/reviewers?limit=5' | grep -o '"bias_label":[^,]*' | head
```

Expected: `adjusted_score` appears in papers response; `bias_label` appears in reviewers response.

- [ ] **Step 3: Final commit (if any uncommitted changes)**

```bash
git status
```

If there are uncommitted changes from manual verification (e.g. temp scripts that were not deleted), commit or remove them appropriately. Ensure the working tree is clean.

---

## Self-Review Checklist

- **Spec coverage:**
  - [ ] `scoreNormalization.js` util (computeReviewerStats, applyNormalization, deriveBiasLabel) — Task 1
  - [ ] `adjusted_score` in getPaperDebates with conference-scoped CTEs — Task 2
  - [ ] `adjusted_score` in ALLOWED_SORT_COLUMNS — Task 2 Step 1
  - [ ] `reviewer_std` + conf stats in getReviewerQuality — Task 3
  - [ ] `bias_label` derived in service — Task 4
  - [ ] No new routes; existing endpoints return new fields — Tasks 2-4
  - [ ] index.html headers + sort options — Task 5
  - [ ] renderers.js bias badge helpers — Task 6
  - [ ] main.js cells + highlight + tooltip + badges — Task 7
  - [ ] All 7 test cases incl. conf_std=0 — Task 1
  - [ ] Full suite + endpoint verification — Task 8

- **Type/name consistency:**
  - `adjusted_score` (SQL snake_case) ↔ `p.adjusted_score` (frontend) ✓
  - `bias_label` (service) ↔ `r.bias_label` (frontend) ↔ `getBiasBadgeClass(r.bias_label)` ✓
  - `reviewer_std`, `conf_mean`, `conf_std` (SQL) ↔ `r.reviewer_std`, `r.conf_mean` (service) ✓
  - `deriveBiasLabel` (util) ↔ `scoreNormalization.deriveBiasLabel` (service) ✓