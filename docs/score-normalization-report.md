# Score Normalization / Bias Correction — Feature Report

**Branch:** `feature-github` · **Date:** 2026-08-20

## What the feature does

Reviewers rate papers on different personal scales — some are lenient, some strict. A paper's average score can therefore be misleading. This feature corrects for reviewer bias:

- Papers get an **ADJ. AVG** (adjusted average) column: what the paper's score *would* be if all its reviewers scored "normally."
- Reviewers get a **BIAS** column: a label (`calibrated`, `lenient`, `strict`, `extreme`) describing how far each reviewer's average sits from the conference average.

## How it's calculated

**Per reviewer** (for each reviewer with ≥ 3 reviews):

```
z = (review_score − reviewer_mean) / reviewer_std
```

**Per paper** — each review is converted to a z-score, then re-scaled back to the conference's −3…+3 scale:

```
adjusted_score = conf_mean + z × conf_std
```

where:

| Term | Meaning |
|---|---|
| `reviewer_mean` / `reviewer_std` | average & std of one reviewer's scores |
| `conf_mean` / `conf_std` | average & std of *all* valid scores in the conference |

**Fallbacks:**

- Reviewer has < 3 reviews → raw score is kept (no correction)
- Reviewer has zero variance (always scores the same) → raw score is kept
- Paper with no reviews → `-`

**Bias label** (per reviewer, vs. conference average):

| \|reviewer mean − conf mean\| | Label | Meaning |
|---|---|---|
| ≤ 0.5 | `calibrated` | scores close to conference norm |
| 0.5 – 1.5 | `lenient` / `strict` | scores noticeably high / low |
| > 1.5 | `extreme` | scores far from the norm |
| < 3 reviews | (none) | not enough data → `-` |

## What changed

| Area | Change |
|---|---|
| `backend/utils/scoreNormalization.js` (new) | Pure JS math: stats, normalization, bias label (+ 12 unit tests) |
| `backend/repositories/analyticsRepository.js` | Papers query: 4 CTEs computing `adjusted_score`; reviewers query: `reviewer_std` + conference stats; `adjusted_score` sortable |
| `backend/services/analyticsService.js` | Derives `bias_label` per reviewer (all API paths: explorer, dashboard, system) |
| `backend/public/index.html` | ADJ. AVG + BIAS columns; "Adj Avg" sort options |
| `backend/public/js/main.js` | Renders the new cells (amber highlight when correction ≥ 0.5) |
| `backend/public/js/renderers.js` | Bias badge styling (green/amber/red) |

## Verification

- 23/23 unit tests pass (12 new)
- Live data: 81/83 papers get an adjusted score; 40/91 reviewers get a bias label; sorting by ADJ. AVG works end-to-end
- Full feature passed an independent code review