# Score Normalization / Bias Correction

**Date:** 2026-08-20
**Branch:** feature-github

## Overview

Reviewers use the -3..+3 scale inconsistently — a lenient reviewer's "+1" may be a strict reviewer's "+3". This feature adds a z-score normalized ("bias-corrected") view of paper scores, correcting per-reviewer bias before averaging, so chairs see a fairer picture of paper quality. Raw scores remain untouched and always visible for comparison.

## Math

- Per reviewer: mean (μ_r) and sample standard deviation (σ_r) over their non-superseded, non-deleted reviews **in the current conference only**.
- Per review: `z = (score − μ_r) / σ_r`
- Rescale to the familiar -3..+3 scale: `adjusted = conf_mean + z × conf_std`, where conf stats are computed over **all** valid conference reviews (the true conference-wide distribution — the rescaling axis is never shifted by which reviewers happened to qualify).

### Guardrails

| Case | Behavior |
|---|---|
| Reviewer with < 3 reviews | Scores pass through raw (bias cannot be estimated reliably) |
| Reviewer with σ_r = 0 (all identical scores) | Raw fallback (no divide-by-zero) |
| Paper with 0 reviews | `adjusted_score = NULL` |

## Reviewer Identity

`COALESCE(r.sub_reviewer_person_id, pcm.external_person_id)` — the external person id, so sub-reviewer scores are attributed to the sub-reviewer, not the primary PCM. Explicit `p.conference_id = $1` in the identity CTE prevents cross-conference bleed (a sub-reviewer who reviewed in multiple conferences cannot leak stats into this one).

## Changes

### 1. New util — `backend/utils/scoreNormalization.js`

Pure, side-effect-free functions mirroring the SQL formula (used for unit tests and for the Reviewer Explorer bias labels):

- `computeReviewerStats(reviews)` → per-reviewer `{ mean, std, count }` (eligible only if count ≥ 3)
- `applyNormalization(reviews, stats, confStats)` → per-review adjusted score with raw fallback
- `deriveBiasLabel(reviewerMean, confMean)` → `calibrated | lenient | strict | extreme | null`

### 2. Repository — `backend/repositories/analyticsRepository.js`

**`getPaperDebates()`** gains CTEs:

```sql
ReviewIdentity AS (
    SELECT r.id AS review_id, r.paper_id, r.total_score,
           COALESCE(r.sub_reviewer_person_id, pcm.external_person_id) AS reviewer_person_id
    FROM review r
    JOIN program_committee_member pcm ON pcm.id = r.program_committee_member_id
    JOIN paper p ON r.paper_id = p.id
    WHERE r.is_superseded = false AND p.is_deleted = false AND p.conference_id = $1
),
ReviewerZStats AS (
    SELECT reviewer_person_id,
           COUNT(*)::int AS review_count,
           AVG(total_score) AS reviewer_mean,
           STDDEV(total_score) AS reviewer_std   -- PG sample stddev
    FROM ReviewIdentity
    GROUP BY reviewer_person_id
    HAVING COUNT(*) >= 3
),
ConferenceStats AS (
    SELECT AVG(total_score) AS conf_mean, STDDEV(total_score) AS conf_std
    FROM ReviewIdentity                          -- inherits all filters; over ALL valid reviews
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
```

Paper-level aggregation joins one row per review (no row multiplication):

```sql
LEFT JOIN NormalizedReviews nr ON nr.review_id = r.id
...
ROUND(AVG(nr.adjusted_score), 2) AS adjusted_score
```

Raw `average_score`, `score_spread`, filters, and existing sorting are unchanged.

Add `'adjusted_score'` to `ALLOWED_SORT_COLUMNS` so backend sort whitelist accepts it (otherwise `buildOrderBy` silently falls back to the default sort).

**`getReviewerQuality()`**:

- `reviewer_mean` already exists as `avg_score_given` (AVG over the reviewer's scores in the group).
- Add `ROUND(STDDEV(r.total_score), 2) AS reviewer_std` to the SELECT list.
- Add a `ConferenceStats` CTE and `CROSS JOIN` it once so each row carries `conf_mean`/`conf_std`.
- No change to existing per-reviewer joins or GROUP BY keys.

### 3. Service — `backend/services/analyticsService.js`

- `getPapers()` → `adjusted_score` flows through from the repository.
- `getReviewers()` → derive `bias_label` per reviewer via `deriveBiasLabel(avg_score_given, conf_mean)`; keep `reviewer_std` passthrough. Mask-aware: bias stats are shown, names are masked via existing `maskNames()`.

### 4. Routes — `backend/routes/analyticsRoutes.js`

No new routes. Existing endpoints return the new fields:

- `GET /api/analytics/papers` → includes `adjusted_score`
- `GET /api/analytics/reviewers` → includes `reviewer_std` + `bias_label`

### 5. Frontend

**`backend/public/index.html`:**

- Papers `<thead>`: add `<th>ADJ. AVG</th>` after the SPREAD column.
- Reviewers `<thead>`: add `<th>BIAS</th>` after the CALIBRATION column.
- `<select id="paper-sort">`: add
  ```html
  <option value="adjusted_score_desc">Adj. Score (High to Low)</option>
  <option value="adjusted_score_asc">Adj. Score (Low to High)</option>
  ```

**`backend/public/js/main.js`:**

- Papers table: new `<td>` for Adj. Avg with `+`/`-` formatting and a tooltip "Bias-corrected average (z-score normalized per reviewer)". Subtle highlight when `|adjusted − average| ≥ 0.5`.
- Reviewer Explorer: new `<td>` for the Bias column with colored badge (green = calibrated, orange = lenient/strict, red = extreme; "—" when null).
- The existing sort parser (`substring` on last underscore) already converts `adjusted_score_desc` → `sortBy=adjusted_score&sortOrder=DESC`.

### 6. Tests — `backend/tests/scoreNormalization.test.js` (`node:test`)

1. Known-fixture z-rescaling (exact expected values)
2. Threshold: < 3 reviews excluded from normalization
3. Zero-variance reviewer (σ_r = 0) → raw fallback
4. Sub-reviewer attribution (sub scores grouped under sub's external id)
5. Single-review paper → adjusted equals raw
6. Negative scores correctness
7. Conference-wide zero variance (conf_std = 0) → all adjusted scores equal `conf_mean`, no NaN/Infinity

## Verification

1. `cd backend && node --test tests/scoreNormalization.test.js`
2. `npm test` (full suite, no regression)
3. Manual:
   - `/api/analytics/papers` includes `adjusted_score`
   - `/api/analytics/reviewers` includes `bias_label` and `reviewer_std`
   - Papers table renders Adj. Avg + highlight; column alignment intact
   - Reviewer Explorer shows bias badges
   - Sorting by "Adj. Score" works end-to-end

## Out of Scope

- Schema changes, new tables, settings toggles
- Separate rankings page
- Persisted normalized scores in DB
- Separate reviewer-biases endpoint