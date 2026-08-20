# Reviewer Report Card (PDF Export) — Design Spec

**Date:** 2026-08-21
**Status:** Approved
**Branch:** feature-github (continues after score normalization feature)

## Purpose

Auto-generate a per-reviewer PDF summary the chair can share internally: the reviewer's assigned papers, scores given, calibration index, and bid match. Everything runs locally — no LLM, no external services. The only network activity is the one-time `npm i puppeteer` (Chromium binary download) and the existing Supabase-hosted Postgres connection the whole app already uses.

## Decision: PDF engine

**Approach A — `puppeteer` with bundled Chromium** (approved).
- Rationale: report is written as normal HTML/CSS reusing dashboard styling; Chrome's print engine handles layout. Self-contained and deterministic.
- Verified: puppeteer is **NOT** currently installed (checked `backend/package.json` deps and `node_modules`). Install task is required.
- Rejected: `puppeteer-core` + Arc's Chromium (fragile — consumer browser, version drift); `pdfmake` (not HTML-to-PDF); browser print (not auto-generated).

## Architecture

```
Reviewer drawer (main.js:315)
  └─ "Export PDF" button + "Include review text" checkbox
       └─ GET /api/analytics/reviewers/:id/report?includeReviewText=1
            └─ analyticsController.getReviewerReport
                 └─ reportService.buildReportData(reviewerId)   → data object
                      ├─ analyticsRepository.getReviewerDetails(reviewerId)   [EXISTING, unchanged]
                      │    → profile (masked per anonymization), assignments
                      │      (#id, title, given_score, review_text, bid_status, peer_average, comments), bids
                      └─ analyticsRepository.getReviewerStatsById(reviewerId) [NEW]
                           → total_reviews_completed, avg_score_given, reviewer_std,
                             calibration_index, peers_avg, bidding_match_percentage,
                             conf_mean, conf_std
                      └─ scoreNormalization.deriveBiasLabel(avg_score_given, conf_mean, total_reviews_completed)
                 └─ reportService.buildReportHtml(data, { includeReviewText })  → HTML string (pure)
                 └─ pdfRenderer.renderPdf(html)                                  → PDF buffer
            → 200 application/pdf, Content-Disposition: attachment; filename="Reviewer_<id>_report.pdf"
```

## Components

| # | File | Responsibility |
|---|---|---|
| 1 | `backend/package.json` | `npm i puppeteer` (bundled Chromium) |
| 2 | `backend/repositories/analyticsRepository.js` | NEW `getReviewerStatsById(reviewerId)` — single-row aggregate stats only |
| 3 | `backend/services/reportService.js` | NEW `buildReportData` + `buildReportHtml` (pure, unit-tested) + module-private `escapeHtml` |
| 4 | `backend/utils/pdfRenderer.js` | NEW puppeteer lazy singleton: `renderPdf(html)` |
| 5 | `backend/controllers/analyticsController.js` | NEW `getReviewerReport` handler |
| 6 | `backend/routes/analyticsRoutes.js` | NEW `router.get("/reviewers/:id/report", ...)` |
| 7 | `backend/public/js/main.js` | Export PDF button + checkbox in `openReviewerModal` (line 315) |
| 8 | `backend/tests/reportService.test.js` | NEW unit tests |

## Data

### `getReviewerStatsById(reviewerId)` (new, aggregates ONLY)

Single-row query. No assignments, no bids, no PII → no `maskNames` needed. Formulas identical to `getReviewerQuality` (same CTE patterns):

- `ReviewerCalibration` CTE → `calibration_index`, `peers_avg` (exact formula from analyticsRepository.js:151-171)
- `ReviewerBidding` CTE → `bidding_match_percentage`
- `ConferenceStats` CTE → `conf_mean`, `conf_std` (all valid conference reviews, same scope as normalization feature)
- Reviewer aggregates: `COUNT(DISTINCT r.id) AS total_reviews_completed`, `ROUND(AVG(r.total_score), 2) AS avg_score_given`, `ROUND(STDDEV(r.total_score), 2) AS reviewer_std`
- Returns `null` when the reviewer id doesn't exist.

### `buildReportData(reviewerId)` (new)

```js
const reviewer = await getReviewerDetails(reviewerId);   // existing — null if not found
if (!reviewer) return null;
const stats = await getReviewerStatsById(reviewerId);
const biasLabel = scoreNormalization.deriveBiasLabel(
    stats.avg_score_given, stats.conf_mean, stats.total_reviews_completed   // 3-param signature, same as Reviewer Explorer
);
return { reviewer, stats, biasLabel };
```

**deriveBiasLabel signature (LOCKED):** `deriveBiasLabel(reviewerMean, confMean, reviewCount)` — 3 params, count check inside the function (scoreNormalization.js:61-62). This is the implemented signature from the normalization feature; ALL callers (Reviewer Explorer via `enrichReviewerBias`, report card) use it identically. Do NOT change it.

### `buildReportHtml(data, { includeReviewText })` (new, PURE)

Returns a standalone HTML document string with inline CSS (hex colors matching `style.css`: neutral/green/amber/red palette, `Roboto Mono` for numbers). Sections:

1. **Header** — reviewer name (as returned, already masked if anonymization on), role, email, generated date/time
2. **Stats row** — reviews completed · avg score given · reviewer std · calibration index · bid match % · bias badge (`calibrated`/`lenient`/`strict`/`extreme`; `-` when null)
3. **Assigned papers table** — #ID, title, score given (or `PENDING`), paper avg, bid status (or `NO BID`). **RAW scores only — NO adjusted_score column** (decision B: PDF is a reviewer audit, not paper ranking; adjusted scores belong to the Paper Explorer)
4. **Review text + comments** per paper — **ONLY when `includeReviewText` is true** (the toggle)
5. **Submitted bids** — yes/maybe/no/conflict list

**SECURITY REQUIREMENT (mandatory):** every user-supplied string (paper titles, review text, comments, reviewer names, bid status) MUST be HTML-escaped via the module-private `escapeHtml` before interpolation. A `<script>` tag or `</td>` in a title must render inert.

## PDF rendering (`pdfRenderer.renderPdf(html)`)

- Lazy singleton browser (`puppeteer.launch()` on first call; reuse across requests)
- `page.setContent(html)` → `page.pdf({ format: 'A4', printBackground: true })`
- `Promise.race` with **30s timeout** → rejects with typed `PdfTimeoutError`; page closed on timeout
- Page closed after every render (try/finally); if browser is closed/crashed, relaunch on next request

## Endpoint contract

`GET /api/analytics/reviewers/:id/report?includeReviewText=1`

| Query param | Accepted values | Else |
|---|---|---|
| `includeReviewText` | `'1'` or `'true'` (case-insensitive) → on | anything else / absent → off |

| Status | Body |
|---|---|
| 200 | `application/pdf`, `Content-Disposition: attachment; filename="Reviewer_<id>_report.pdf"` |
| 404 | `{ error: "Reviewer not found" }` |
| 503 | `{ error: "PDF generation timed out" }` (30s) |
| 500 | `{ error: "Failed to generate PDF" }` (render failure) |

## Anonymization

Respected automatically: names/emails come from `getReviewerDetails`, which already applies `maskNames` per the anonymize setting. The report shows whatever the drawer shows. No extra masking code.

## Frontend (main.js `openReviewerModal`, line 315)

- "Export PDF" button + "Include review text" checkbox in the drawer
- On click: `fetch('/api/analytics/reviewers/<id>/report?includeReviewText=' + (checked ? '1' : ''))` → blob → object-URL download (filename from Content-Disposition)
- Fetch failure / non-200 → error toast, no download

## Non-goals (YAGNI)

- Bulk "export all reviewers" — per-reviewer only for now
- Adjusted scores in the PDF papers table (decision B)
- Custom fonts / images / branding in the PDF
- pdfmake / other PDF engines
- Any LLM involvement — everything local

## Testing

- **Unit (`backend/tests/reportService.test.js`):**
  1. **Escaping test (FIRST):** title containing `<script>alert(1)</script>` and `</td><td>` renders inert
  2. `buildReportHtml` includes all 5 sections
  3. `includeReviewText: true` includes review text + comments; `false`/absent excludes them
  4. Null-safe: missing stats / null scores / empty assignments render `-`/`PENDING`/empty states, no crash
  5. `buildReportData` merges details + stats + biasLabel correctly (repo stubbed)
- **Full suite:** `cd backend && node --test tests/`
- **Live E2E:** export PDF with toggle off AND on; open both PDFs; verify sections, layout, no broken markup; `npm run lint` clean