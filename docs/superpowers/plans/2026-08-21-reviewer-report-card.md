# Implementation Plan: Reviewer Report Card (PDF Export)

**Spec:** `docs/superpowers/specs/2026-08-21-reviewer-report-card-design.md`
**Date:** 2026-08-21
**Branch:** feature-github
**Workflow:** Subagent-driven development — one implementer per task, then spec-compliance review, then code-quality review, fix issues, re-review.

---

## Task 1: Install puppeteer

- [x] Run `npm i puppeteer` in `backend/` (downloads bundled Chromium ~170MB, one-time)
- [x] Smoke-test launch: `node -e "require('puppeteer').launch({headless: 'new'}).then(async b => { console.log('puppeteer OK'); await b.close(); }).catch(e => { console.error(e.message); process.exit(1); })"` (from `backend/`, wait ~30-60s for first Chromium run)
- [x] Commit: `chore: add puppeteer for pdf export` (package.json + package-lock.json only)

## Task 2: `getReviewerStatsById(reviewerId)` in analyticsRepository.js

- [x] New function (place near `getReviewerQuality`): single-row query for ONE reviewer's aggregate stats:
  - [x] `ReviewerCalibration` CTE → `peers_avg`, `calibration_index` — formula copied EXACTLY from getReviewerQuality (analyticsRepository.js:151-171), filtered to this reviewer
  - [x] `ReviewerBidding` CTE → `bidding_match_percentage` (same pattern as lines 173+)
  - [x] `ConferenceStats` CTE → `conf_mean`, `conf_std` (AVG/STDDEV over non-superseded, non-deleted, conference-scoped reviews)
  - [x] Main SELECT: `COUNT(DISTINCT r.id) AS total_reviews_completed`, `ROUND(AVG(r.total_score),2) AS avg_score_given`, `ROUND(STDDEV(r.total_score),2) AS reviewer_std`, plus CTE values
  - [x] Reviewer identified by `(pcm.id = r.program_committee_member_id OR pcm.external_person_id = r.sub_reviewer_person_id)` — same identity rule as everywhere else
  - [x] `WHERE pcm.id = $1 AND pcm.conference_id = $2` (conference from reviewer's row); join on paper for conference scoping like ConferenceStats
  - [x] Returns `null` when reviewer id not found; aggregates may be null (no reviews) — fine
  - [x] No `maskNames` (no PII returned)
- [x] Export from module (add to `module.exports` at bottom, ~line 793)
- [x] Verify against live DB with temp script (delete after): fetch stats for an existing reviewer id, print all fields
- [x] Commit: `feat: add single-reviewer stats query`

## Task 3: `services/reportService.js` (TDD)

**Tests first** — `backend/tests/reportService.test.js`:

- [x] **Escaping test (FIRST — mandatory):** `buildReportHtml` renders paper title containing `<script>alert(1)</script>` and `</td><td>` inert (no raw `<`, no breaking table structure)
- [x] Sections test: output contains header (name/role/email/date), stats row (reviews, avg given, std, calibration, bid match, bias badge), papers table, bids list
- [x] Toggle test: `includeReviewText: true` → review text + comments present; `false`/absent → absent
- [x] Null-safe test: null stats fields → `-`; null given_score → `PENDING`; empty assignments/bids → empty-state text, no crash
- [x] `buildReportData` merge test: stubbed repo returns details + stats → merged object has `reviewer`, `stats`, `biasLabel` derived via `deriveBiasLabel(avg_score_given, conf_mean, total_reviews_completed)`; reviewer `null` → `null`
- [x] Run tests: `cd backend && node --test tests/reportService.test.js`

**Then implement** `backend/services/reportService.js`:

- [x] Module-private `escapeHtml(str)` — escapes `& < > " '`
- [x] `buildReportData(reviewerId)` — calls `getReviewerDetails` (existing; `null` → return null) + `getReviewerStatsById`; derives `biasLabel` via `scoreNormalization.deriveBiasLabel(avg_score_given, conf_mean, total_reviews_completed)` — **3-param signature, count handled inside function; do NOT pre-check count at call site**
- [x] `buildReportHtml(data, { includeReviewText })` — pure function returning full standalone HTML document:
  - [x] Inline CSS matching dashboard palette (hex colors from `style.css`; `Roboto Mono` for numbers; same green/amber/red badge colors as renderers.js bias badges)
  - [x] Header: name (masked values pass through as-is), role, email, generated date/time
  - [x] Stats row: reviews completed · avg score given · reviewer std · calibration index · bid match % · bias badge (`-` when null)
  - [x] Papers table: #ID, title, score given (or `PENDING`), paper avg, bid status (or `NO BID`) — **raw scores only, NO adjusted_score column**
  - [x] Review text + comments per paper ONLY when `includeReviewText` true (toggle), escaped
  - [x] Submitted bids list (yes/maybe/no/conflict)
  - [x] EVERY user-supplied string escaped (titles, review text, comments, names, bid status)
- [x] Commit: `feat: add report card service with tests`

## Task 4: `utils/pdfRenderer.js`

- [x] Lazy singleton: `getBrowser()` — `puppeteer.launch({ headless: 'new' })` on first call, reuse; if `browser.isConnected()` false → relaunch
- [x] `renderPdf(html)`:
  - [x] `page.setContent(html, { waitUntil: 'networkidle0' })` → `page.pdf({ format: 'A4', printBackground: true })`
  - [x] `Promise.race` with 30s timeout → rejects `PdfTimeoutError`; `page.close()` in try/finally ALWAYS
  - [x] Errors propagate as typed errors (browser crash → relaunch next call)
- [x] No user data touches the network — render is purely local
- [x] Commit: `feat: add puppeteer pdf renderer`

## Task 5: Controller + route

- [x] `analyticsController.getReviewerReport`:
  - [x] Parse `includeReviewText`: `=== '1' || === 'true'` (case-insensitive) → boolean; anything else → false. No other values.
  - [x] `buildReportData(id)` → `null` → 404 `{ error: "Reviewer not found" }`
  - [x] `buildReportHtml` → `renderPdf` → 200 with `Content-Type: application/pdf`, `Content-Disposition: attachment; filename="Reviewer_<id>_report.pdf"`
  - [x] `PdfTimeoutError` → 503 `{ error: "PDF generation timed out" }`
  - [x] Other render errors → 500 `{ error: "Failed to generate PDF" }` (log error server-side)
- [x] Route: `router.get("/reviewers/:id/report", analyticsController.getReviewerReport)` in analyticsRoutes.js (order relative to `/reviewers/:id` is safe — different segment count; place with the drill-down routes)
- [x] Verify with curl: `curl -s -o /tmp/report.pdf -w "%{http_code} %{content_type}" "http://localhost:3000/api/analytics/reviewers/<id>/report"` (server must be running; report both toggle states, a bad id → 404)
- [x] Commit: `feat: add reviewer report pdf endpoint`

## Task 6: Frontend — Export PDF in reviewer drawer

- [x] In `openReviewerModal` (main.js:315), add to drawer:
  - [x] "Export PDF" button + "Include review text" checkbox (styled like existing controls)
  - [x] On click: `fetch('/api/analytics/reviewers/<id>/report?includeReviewText=' + (checked ? '1' : ''))` → `res.ok` ? blob → `URL.createObjectURL` → `<a download>` click → revoke URL : error toast
  - [x] Filename from `Content-Disposition` when possible
  - [x] Disable button while exporting; re-enable after
- [x] Verify: `node --check backend/public/js/main.js`
- [x] Commit: `feat: add export pdf button to reviewer drawer`

## Task 7: Full verification

- [x] `cd backend && node --test tests/` — ALL suites pass (23 existing + new report tests)
- [x] `npm run lint` — no new errors
- [x] Live E2E: start server; export PDF with toggle OFF → open → verify header/stats/papers/bids, NO review text; export with toggle ON → review text + comments present; anonymization ON → masked names in PDF
- [x] Verify no temp scripts left; `git status` clean
- [x] Commit any fixes

## Task 8: Final review + finish

- [ ] Independent final code review over full branch diff (spec compliance + quality)
- [ ] Fix findings, re-review
- [ ] User decides: merge to main / PR / keep branch

---

## Verification commands

```bash
cd backend && node --test tests/
cd backend && node --test tests/reportService.test.js
cd backend && node --check public/js/main.js
cd backend && npm run lint
curl -s -o /tmp/report.pdf -w "%{http_code} %{content_type}\n" "http://localhost:3000/api/analytics/reviewers/<id>/report?includeReviewText=1"
```
