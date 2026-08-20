# Implementation Plan: Reviewer Report Card (PDF Export)

**Spec:** `docs/superpowers/specs/2026-08-21-reviewer-report-card-design.md`
**Date:** 2026-08-21
**Branch:** feature-github
**Workflow:** Subagent-driven development — one implementer per task, then spec-compliance review, then code-quality review, fix issues, re-review.

---

## Task 1: Install puppeteer

- [ ] Run `npm i puppeteer` in `backend/` (downloads bundled Chromium ~170MB, one-time)
- [ ] Smoke-test launch: `node -e "require('puppeteer').launch({headless: 'new'}).then(async b => { console.log('puppeteer OK'); await b.close(); }).catch(e => { console.error(e.message); process.exit(1); })"` (from `backend/`, wait ~30-60s for first Chromium run)
- [ ] Commit: `chore: add puppeteer for pdf export` (package.json + package-lock.json only)

## Task 2: `getReviewerStatsById(reviewerId)` in analyticsRepository.js

- [ ] New function (place near `getReviewerQuality`): single-row query for ONE reviewer's aggregate stats:
  - [ ] `ReviewerCalibration` CTE → `peers_avg`, `calibration_index` — formula copied EXACTLY from getReviewerQuality (analyticsRepository.js:151-171), filtered to this reviewer
  - [ ] `ReviewerBidding` CTE → `bidding_match_percentage` (same pattern as lines 173+)
  - [ ] `ConferenceStats` CTE → `conf_mean`, `conf_std` (AVG/STDDEV over non-superseded, non-deleted, conference-scoped reviews)
  - [ ] Main SELECT: `COUNT(DISTINCT r.id) AS total_reviews_completed`, `ROUND(AVG(r.total_score),2) AS avg_score_given`, `ROUND(STDDEV(r.total_score),2) AS reviewer_std`, plus CTE values
  - [ ] Reviewer identified by `(pcm.id = r.program_committee_member_id OR pcm.external_person_id = r.sub_reviewer_person_id)` — same identity rule as everywhere else
  - [ ] `WHERE pcm.id = $1 AND pcm.conference_id = $2` (conference from reviewer's row); join on paper for conference scoping like ConferenceStats
  - [ ] Returns `null` when reviewer id not found; aggregates may be null (no reviews) — fine
  - [ ] No `maskNames` (no PII returned)
- [ ] Export from module (add to `module.exports` at bottom, ~line 793)
- [ ] Verify against live DB with temp script (delete after): fetch stats for an existing reviewer id, print all fields
- [ ] Commit: `feat: add single-reviewer stats query`

## Task 3: `services/reportService.js` (TDD)

**Tests first** — `backend/tests/reportService.test.js`:

- [ ] **Escaping test (FIRST — mandatory):** `buildReportHtml` renders paper title containing `<script>alert(1)</script>` and `</td><td>` inert (no raw `<`, no breaking table structure)
- [ ] Sections test: output contains header (name/role/email/date), stats row (reviews, avg given, std, calibration, bid match, bias badge), papers table, bids list
- [ ] Toggle test: `includeReviewText: true` → review text + comments present; `false`/absent → absent
- [ ] Null-safe test: null stats fields → `-`; null given_score → `PENDING`; empty assignments/bids → empty-state text, no crash
- [ ] `buildReportData` merge test: stubbed repo returns details + stats → merged object has `reviewer`, `stats`, `biasLabel` derived via `deriveBiasLabel(avg_score_given, conf_mean, total_reviews_completed)`; reviewer `null` → `null`
- [ ] Run tests: `cd backend && node --test tests/reportService.test.js`

**Then implement** `backend/services/reportService.js`:

- [ ] Module-private `escapeHtml(str)` — escapes `& < > " '`
- [ ] `buildReportData(reviewerId)` — calls `getReviewerDetails` (existing; `null` → return null) + `getReviewerStatsById`; derives `biasLabel` via `scoreNormalization.deriveBiasLabel(avg_score_given, conf_mean, total_reviews_completed)` — **3-param signature, count handled inside function; do NOT pre-check count at call site**
- [ ] `buildReportHtml(data, { includeReviewText })` — pure function returning full standalone HTML document:
  - [ ] Inline CSS matching dashboard palette (hex colors from `style.css`; `Roboto Mono` for numbers; same green/amber/red badge colors as renderers.js bias badges)
  - [ ] Header: name (masked values pass through as-is), role, email, generated date/time
  - [ ] Stats row: reviews completed · avg score given · reviewer std · calibration index · bid match % · bias badge (`-` when null)
  - [ ] Papers table: #ID, title, score given (or `PENDING`), paper avg, bid status (or `NO BID`) — **raw scores only, NO adjusted_score column**
  - [ ] Review text + comments per paper ONLY when `includeReviewText` true (toggle), escaped
  - [ ] Submitted bids list (yes/maybe/no/conflict)
  - [ ] EVERY user-supplied string escaped (titles, review text, comments, names, bid status)
- [ ] Commit: `feat: add report card service with tests`

## Task 4: `utils/pdfRenderer.js`

- [ ] Lazy singleton: `getBrowser()` — `puppeteer.launch({ headless: 'new' })` on first call, reuse; if `browser.isConnected()` false → relaunch
- [ ] `renderPdf(html)`:
  - [ ] `page.setContent(html, { waitUntil: 'networkidle0' })` → `page.pdf({ format: 'A4', printBackground: true })`
  - [ ] `Promise.race` with 30s timeout → rejects `PdfTimeoutError`; `page.close()` in try/finally ALWAYS
  - [ ] Errors propagate as typed errors (browser crash → relaunch next call)
- [ ] No user data touches the network — render is purely local
- [ ] Commit: `feat: add puppeteer pdf renderer`

## Task 5: Controller + route

- [ ] `analyticsController.getReviewerReport`:
  - [ ] Parse `includeReviewText`: `=== '1' || === 'true'` (case-insensitive) → boolean; anything else → false. No other values.
  - [ ] `buildReportData(id)` → `null` → 404 `{ error: "Reviewer not found" }`
  - [ ] `buildReportHtml` → `renderPdf` → 200 with `Content-Type: application/pdf`, `Content-Disposition: attachment; filename="Reviewer_<id>_report.pdf"`
  - [ ] `PdfTimeoutError` → 503 `{ error: "PDF generation timed out" }`
  - [ ] Other render errors → 500 `{ error: "Failed to generate PDF" }` (log error server-side)
- [ ] Route: `router.get("/reviewers/:id/report", analyticsController.getReviewerReport)` in analyticsRoutes.js (order relative to `/reviewers/:id` is safe — different segment count; place with the drill-down routes)
- [ ] Verify with curl: `curl -s -o /tmp/report.pdf -w "%{http_code} %{content_type}" "http://localhost:3000/api/analytics/reviewers/<id>/report"` (server must be running; report both toggle states, a bad id → 404)
- [ ] Commit: `feat: add reviewer report pdf endpoint`

## Task 6: Frontend — Export PDF in reviewer drawer

- [ ] In `openReviewerModal` (main.js:315), add to drawer:
  - [ ] "Export PDF" button + "Include review text" checkbox (styled like existing controls)
  - [ ] On click: `fetch('/api/analytics/reviewers/<id>/report?includeReviewText=' + (checked ? '1' : ''))` → `res.ok` ? blob → `URL.createObjectURL` → `<a download>` click → revoke URL : error toast
  - [ ] Filename from `Content-Disposition` when possible
  - [ ] Disable button while exporting; re-enable after
- [ ] Verify: `node --check backend/public/js/main.js`
- [ ] Commit: `feat: add export pdf button to reviewer drawer`

## Task 7: Full verification

- [ ] `cd backend && node --test tests/` — ALL suites pass (23 existing + new report tests)
- [ ] `npm run lint` — no new errors
- [ ] Live E2E: start server; export PDF with toggle OFF → open → verify header/stats/papers/bids, NO review text; export with toggle ON → review text + comments present; anonymization ON → masked names in PDF
- [ ] Verify no temp scripts left; `git status` clean
- [ ] Commit any fixes

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