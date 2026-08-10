# ConfQual — Project Documentation

ConfQual is a **decision-support analytics dashboard for academic Program Chairs**. It ingests a raw conference dataset (typically an EasyChair `.xlsx` export), normalizes it into a relational schema, and surfaces actionable insights about the scientific review process — covering everything from health scorecards to reviewer calibration and award nominations.

This document explains the entire project: architecture, data model, import pipeline, analytics engine, API surface, frontend, and operational details.

---

## Table of Contents

1. [Technology Stack](#technology-stack)
2. [High-Level Architecture](#high-level-architecture)
3. [Directory Layout](#directory-layout)
4. [Data Model (PostgreSQL Schema)](#data-model-postgresql-schema)
5. [Import Pipeline (EasyChair → Database)](#import-pipeline-easychair--database)
6. [Analytics Engine](#analytics-engine)
7. [REST API](#rest-api)
8. [Frontend](#frontend)
9. [Settings, Anonymization & Data Management](#settings-anonymization--data-management)
10. [Setup & Running](#setup--running)
11. [Testing, Linting & CI](#testing-linting--ci)
12. [Known Issues & Ongoing Work](#known-issues--ongoing-work)

---

## Technology Stack

| Layer      | Technology |
|------------|------------|
| Backend    | Node.js + Express.js (REST API + static file server) |
| Database   | PostgreSQL (Neon serverless, or any local Postgres) |
| Parsing    | `exceljs` — robust `.xlsx` parsing (resolves formula cells, handles raw values) |
| Frontend   | Vanilla JS (ES Modules), HTML5, Vanilla CSS3 |
| Charts     | Chart.js (CDN) |
| Icons      | Phosphor Icons (CDN) |
| Fonts      | Google Fonts (Inter, Roboto Mono) |
| NLP        | `sentiment` — lexicon-based sentiment scoring of review text |
| Misc       | `multer` (file uploads), `dotenv`, `pg` (PostgreSQL driver) |
| Dev tooling| `eslint`, `nodemon`, Node's built-in `node:test` runner |

---

## High-Level Architecture

```
                 ┌─────────────────────────────┐
                 │         Browser (Frontend)  │
                 │  Vanilla JS ES Modules      │
                 │  Chart.js + Phosphor icons  │
                 └──────────────┬──────────────┘
                                │  HTTP (JSON)
                 ┌──────────────▼──────────────┐
                 │   Express.js Server         │
                 │   server.js                 │
                 │   routes/  →  controllers/  │
                 │   services/  →  repositories│
                 └──────────────┬──────────────┘
                                │  SQL (pg Pool)
                 ┌──────────────▼──────────────┐
                 │   PostgreSQL (Neon)         │
                 │   database/confqual_schema  │
                 └──────────────┬──────────────┘
                                ▲
                 ┌──────────────┴──────────────┐
                 │   Import Pipeline           │
                 │   importer/ (workbook →     │
                 │   mappers → repositories)   │
                 └──────────────┬──────────────┘
                                │
                 ┌──────────────▼──────────────┐
                 │   EasyChair .xlsx dataset   │
                 └─────────────────────────────┘
```

The server performs two roles:

1. **Analytics API** — serves JSON analytics payloads to the frontend.
2. **Static host** — serves the vanilla frontend from `backend/public/`.

The import pipeline runs **within a single transaction** (`AsyncLocalStorage`-routed transaction client), so an import either fully succeeds or fully rolls back.

---

## Directory Layout

```
conference-quality-poc/
├── README.md                      # Short user-facing overview
├── PROJECT.md                     # This document
├── .github/workflows/ci.yml       # CI: lint + tests on Node 18/20
├── database/
│   └── confqual_schema.sql        # Canonical PostgreSQL schema
├── excel/                         # Local sample datasets (gitignored)
├── backend/
│   ├── server.js                  # Express entry point
│   ├── config/database.js         # pg Pool + AsyncLocalStorage tx proxy
│   ├── routes/                    # Express route definitions
│   │   ├── analyticsRoutes.js
│   │   └── settingsRoutes.js
│   ├── controllers/               # HTTP handlers (req/res)
│   │   ├── analyticsController.js
│   │   └── settingsController.js
│   ├── services/                  # Business logic / analytics composition
│   │   ├── analyticsService.js
│   │   └── reviewService.js
│   ├── repositories/              # SQL access layer
│   │   ├── analyticsRepository.js # (largest — all analytic queries)
│   │   └── <entity>Repository.js  # CRUD per entity
│   ├── importer/                  # Excel → DB pipeline
│   │   ├── runImporter.js         # Orchestrates the full import
│   │   ├── workbookReader.js      # ExcelJS workbook loader
│   │   ├── mappers/               # Sheet row → DTO mappers
│   │   └── importers/             # Per-sheet importers
│   ├── utils/
│   │   ├── analyticsMath.js       # sentiment + calibration math
│   │   ├── bulkInsert.js          # parameterized batch INSERT helper
│   │   ├── decisionHelper.js      # decision → category normalization
│   │   ├── decisionNormalizer.js  # UI-facing decision normalization
│   │   ├── topicMatcher.js        # fuzzy topic-overlap matching
│   │   ├── excelHelper.js         # formula-aware cell extraction
│   │   └── resetDatabase.js       # drop + recreate schema
│   ├── scripts/anonymizeData.js   # destructive PII masking script
│   ├── tests/                     # node:test unit tests
│   ├── public/                    # Frontend (static)
│   │   ├── index.html
│   │   ├── style.css
│   │   └── js/
│   │       ├── main.js            # App logic (single-page dashboard)
│   │       ├── api.js             # fetch wrappers
│   │       ├── renderers.js       # badge helpers
│   │       └── utils.js           # escapeHtml, CSV export
│   └── package.json
```

---

## Data Model (PostgreSQL Schema)

The canonical schema lives in `database/confqual_schema.sql` and is re-applied on every reset/import.

### Entities

| Table | Purpose | Key fields |
|-------|---------|-----------|
| `conference` | One conference edition | `name`, `short_name`, `year`, `submission_deadline` |
| `program_committee_member` | PC member / reviewer | `external_person_id`, names, `email`, `affiliation`, `country`, `role` (e.g., `Sub-reviewer`) |
| `paper` | Submitted paper | `external_submission_id`, `title`, `submitted_at`, `decision`, `decision_category`, `is_deleted` |
| `topic` | Conference topics | `name` (unique) |
| `program_committee_member_topic` | PC member ↔ topic (expertise) | composite PK |
| `paper_topic` | Paper ↔ topic | composite PK |
| `assignment` | PC member assigned to paper | unique `(paper_id, pcm_id)` |
| `bid` | PC member bidding on a paper | `bid` value (`yes`/`maybe`/`no`/`conflict`), unique `(paper_id, pcm_id)` |
| `conflict` | Declared conflicts | unique `(paper_id, pcm_id)` |
| `review` | Review on a paper | `review_text`, `scores`, `total_score`, `review_date/time`, `sentiment_score`, `is_superseded`, sub-reviewer fields |
| `comment` | Discussion comment | `comment_text`, date/time |
| `meta_review` | Area-chair metareview | `recommendation`, `review_text`, unique `(paper_id)` |
| `author` | Paper author | `external_person_id`, names, `email`, `country`, `affiliation` |
| `paper_author` | Paper ↔ author | `author_order`, `is_corresponding` |
| `settings` | App-wide flags | `is_anonymized`, `anonymization_prefix`, `decision_editing_enabled` (single row, id=1) |

### Design notes

- **Deleted papers** are soft-marked with `is_deleted = true` rather than removed, and nearly all analytics queries filter `WHERE is_deleted = false`.
- **Superseded reviews** (re-submissions of an older version) are kept for provenance but excluded from analytics via `is_superseded = false`.
- Foreign keys cascade on delete, and the schema is rebuilt wholesale by `resetDatabase.js` before each import.
- `decision` stores the raw decision string; `decision_category` stores a normalized value (`accept` / `reject` / `desk reject` / `no decision` / `withdrawn`) used by analytics and filters.

---

## Import Pipeline (EasyChair → Database)

The pipeline is orchestrated by `importer/runImporter.js`. It opens a **transaction**, truncates all tables, then imports each EasyChair sheet in dependency order.

### Execution order

1. `TRUNCATE conference CASCADE` — wipe prior data
2. `conferenceImporter` → `conference`
3. `programCommitteeImporter` → PC members + their topics
4. `submissionImporter` → `paper` (skips rows without ID/title)
5. `authorImporter` → `author` + `paper_author`
6. `assignmentImporter` → `assignment`
7. `bidImporter` → `bid`
8. `conflictImporter` → `conflict`
9. `reviewImporter` → `review` (+ sentiment scoring; handles superseded sheet separately)
10. `commentImporter` → `comment`
11. `metaReviewImporter` → `meta_review`
12. `topicImporter` → `topic` + topic join tables

### Architecture: mappers + importers + repositories

Each sheet is handled by three small units:

- **Mapper** (`importer/mappers/<x>Mapper.js`) — converts a raw ExcelJS row into a DTO. Mappers handle EasyChair's column layout quirks (e.g., `reviewMapper.js` detects a 1-column offset when a reviewer ID appears in an unexpected position).
- **Importer** (`importer/importers/<x>Importer.js`) — reads the workbook, maps rows, resolves external IDs to internal FK IDs, and batches inserts.
- **Repository** (`repositories/<x>Repository.js`) — performs the actual SQL (often using `utils/bulkInsert.js` for efficient multi-row inserts).

Key supporting utilities:

| Utility | Role |
|---------|------|
| `workbookReader.js` | Caches the current file path and loads an `exceljs` workbook; falls back to `excel/easychair-gran.xlsx` for local testing |
| `excelHelper.js` | `extractValue` resolves Excel formula objects to their evaluated result and safely returns raw values |
| `bulkInsert.js` | Builds a parameterized `INSERT ... VALUES (...),(...)... ON CONFLICT DO NOTHING` from row arrays |
| `reviewService.js` | Legacy service that auto-creates PC members found in reviews but missing from the PC sheet |

---

## Analytics Engine

All analytics live in `services/analyticsService.js`, which composes results from `repositories/analyticsRepository.js` (the source of every SQL query) and `utils/analyticsMath.js`.

### The dashboard aggregation

`getDashboardData()` is the single entry point the frontend loads on startup. It prefetches all base datasets **once** and reuses them across the composite analytics:

```
health, papers, reviewers, mismatches, coiViolations,
missingMetareviews, topReviewers, distributions, diversity, submissions
→ alerts, systemAnalytics, qualityProfile, papers, reviewers, submissions
```

### Alerts / Action Center

`getAlerts()` inspects the prefetched data and emits severity-tagged alerts, each with a deep-link into the affected papers/reviewers:

- **Sentiment mismatches** — positive review text scored low numerically
- **COI violations** — assignments to PC members who declared a conflict
- **Missing metareviews** — debated papers (variance > 1.0) without a metareview
- **Missing reviews** — papers with fewer than 3 completed reviews
- **Unresolved debates** — high variance + zero comments
- **Expertise mismatches** — zero overlapping topics between reviewer and paper
- **Low bidding satisfaction** — ≤50% of workload matched the reviewer's bids
- **Low effort reviewers** — average review under 50 words

### Quality Scorecard

`getQualityScorecard()` scores four dimensions from 100, applying itemized deductions:

| Dimension | What it measures | Deduction source |
|-----------|------------------|------------------|
| **Coverage** | % of valid papers with ≥3 reviews | papers < 3 reviews |
| **Integrity** | Conflict-free + expertise-aligned assignments | COIs (weighted 3×), expertise mismatches |
| **Satisfaction** | Bidding match | reviewers ≤50% bid match |
| **Discussion** | Debates resolved via comments + metareviews | debated papers w/ 0 comments or missing metareviews |

Each deduction links back to the affected records (papers/reviewers) for one-click drill-down.

### Reviewer Calibration

`getReviewerQuality()` computes, per reviewer:

- `avg_word_count` — average words across review texts
- `avg_score_given` — average total score
- `peers_avg` — what the reviewer's peers scored on the *same* papers
- `calibration_index` — reviewer's score minus peer average (positive = lenient, negative = harsh)
- `bidding_match_percentage` — % of assignments matched to a `yes`/`maybe` bid

### Quality Profile (CORE / GII-GRIN-SCIE)

`getAcademicQualityProfile()` computes:

- **Selectivity** — true acceptance rate + a coarse rank (CORE A/A*, B, or below)
- **Rigor** — average reviews per paper + % meeting the European baseline of 3+ reviews
- **Internationalization** — country counts, host-country assumption (largest PC country), international %
- **Thematic competence** — top topics vs. available expert count, flagging expertise gaps (<3 experts)
- A human-readable **compatibility statement** summarizing all of the above

### Awards & Highlights

- **Top reviewers** — most reviews, high word count, well-calibrated (`|calibration_index| ≤ 1.5`)
- **Best papers** — unanimous high scores (`avg ≥ 1.5`, spread ≤ 2)
- **Session clusters** — accepted papers grouped by topic for session planning

### Other endpoints

- **Late submissions** — papers submitted after the conference deadline
- **Submissions timeline** — every review row with date/time for time-series analysis
- **Paper / reviewer details** — deep drill-downs with reviews, comments, assignments, and bids

---

## REST API

Base URL: `http://localhost:3000`. All analytics routes are prefixed `/api/analytics`; settings under `/api/settings`.

### Analytics routes (`routes/analyticsRoutes.js`)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/analytics/conference-health` | Totals: papers, reviewers, reviews, assignments, sub-reviewers, avg score |
| GET | `/api/analytics/reviewer-quality` | Reviewer metrics (calibration, workload, bidding match) with sort/filter |
| GET | `/api/analytics/paper-debates` | Paper spread/variance/comment stats |
| GET | `/api/analytics/expertise-match` | Expertise mismatch count + details |
| GET | `/api/analytics/dashboard` | **Main payload** — everything for the initial page load |
| GET | `/api/analytics/alerts` | Action Center alerts |
| GET | `/api/analytics/papers` | Paper list with `sortBy`, `sortOrder`, `filterMode`, `limit`, `offset` |
| GET | `/api/analytics/reviewers` | Reviewer list with same query params |
| GET | `/api/analytics/submissions` | Review-submission list |
| GET | `/api/analytics/system-analytics` | Health, scorecard, distributions, top reviewers/papers, clusters |
| GET | `/api/analytics/quality-profile` | Academic quality profile |
| GET | `/api/analytics/late-submissions` | Papers past the submission deadline |
| GET | `/api/analytics/papers/:id` | Paper detail (reviews + comments, mismatch-flagged) |
| PUT | `/api/analytics/papers/:id/decision` | Override a paper's decision (requires `decision_editing_enabled`) |
| GET | `/api/analytics/reviewers/:id` | Reviewer detail (assignments, bids, comments) |
| POST | `/api/analytics/reset` | Drop + recreate the schema (purge) |
| POST | `/api/analytics/process-conference` | **Upload** `.xlsx` (multipart `excelFile`), reset, and re-import |
| POST | `/api/analytics/log` | Frontend error logging (rate-limited to 20/min/IP) |

### Settings routes (`routes/settingsRoutes.js`)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/settings` | Fetch current settings |
| POST | `/api/settings` | Update anonymization + decision-editing flags (validates prefix `[A-Za-z0-9_-]{0,50}`) |

### Pagination & filtering

List endpoints accept `sortBy`, `sortOrder` (`asc`/`desc`), `filterMode`, `limit`, and `offset`. Allowed sort columns are whitelisted server-side to prevent SQL injection. Frontend currently requests `limit=2000`.

Paper filter modes: `no_comments`, `high_variance`, `low_variance`, `unanimous_reject`, `unanimous_accept`, `borderline`, `to_discuss`, `rejected`, `desk_rejected`, `no_decision`.

---

## Frontend

The frontend is a single-page vanilla JS dashboard served from `backend/public/`. It intentionally avoids heavy frameworks.

### Files

| File | Responsibility |
|------|----------------|
| `index.html` | Page shell, all 6 tabs, drawers, projector modal, overlays |
| `style.css` | All styling (dark projector view, scorecards, charts, drawers) |
| `js/main.js` | App orchestration: tabs, filters, tables, modals, charts, upload/settings handlers |
| `js/api.js` | Typed fetch wrappers for the REST API |
| `js/renderers.js` | Score badge class/color helpers |
| `js/utils.js` | `escapeHtml`, CSV export helpers |

### Tabs

1. **Paper Explorer** — sortable/filterable table; inline decision dropdown (when editing is enabled); click-to-open detail drawer; CSV export.
2. **Reviewer Explorer** — workload, word count, calibration sparkline, bidding-match; click-to-open detail drawer.
3. **Review Submissions** — chronological review submissions with date/time.
4. **System Analytics** — Quality Scorecard (4 dimensions with drill-down links), 4 metric cards, and 4 Chart.js visualizations (PC composition, debate distribution, decision distribution, score distribution).
5. **Quality Profile** — compatibility statement, acceptance/rigor/internationalization metrics, thematic competence table, geographic diversity.
6. **Awards & Highlights** — top reviewer/paper nominee tables and session-planning topic clusters.

### Key interactions

- **Action Center** (left sidebar) — alert cards deep-link to the affected papers/reviewers and activate a filter banner.
- **Detail drawer** — paper and reviewer drill-downs; reviews are flagged `MISMATCH` when reviewer expertise doesn't overlap the paper's topics.
- **Projector Mode** — full-screen dark view for PC meetings showing scores side-by-side and key disagreements (highest/lowest review quotes).
- **Global drag & drop** — dropping an `.xlsx` anywhere on the page auto-submits the upload flow.
- **CSV export** — table exports and a system-analytics summary export.

---

## Settings, Anonymization & Data Management

The settings drawer exposes three controls persisted in the `settings` table:

| Control | Behavior |
|---------|----------|
| **Anonymize Data** | When on, `maskNames()` in `analyticsRepository.js` rewrites reviewer first/last names and emails to `{prefix}_Reviewer_{id}` / `{prefix}_reviewer_{id}@example.com` **at query time**, preserving relational integrity without mutating the DB. |
| **Enable Decision Editing** | Unlocks the inline decision dropdown in Paper Explorer. The API enforces this server-side (`updatePaperDecision` returns 403 if disabled). |
| **Anonymization Prefix** | Custom prefix for masked identifiers (default `CAiSE_26_Tech`). Validated `[A-Za-z0-9_-]{0,50}`. |

**Data lifecycle:**

- **Upload** (`process-conference`) → resets the schema, then imports the new `.xlsx`.
- **Purge Data** (header button) → `POST /api/analytics/reset` drops + recreates the schema.
- **Standalone script** `scripts/anonymizeData.js` → destructive PII masking (also drops `author`/`paper_author` tables) for publishing datasets.

---

## Setup & Running

### Prerequisites

- Node.js (v18+ recommended; CI tests 18.x and 20.x)
- A PostgreSQL database (Neon recommended) or a local instance

### 1. Configure environment

Create `backend/.env`:

```env
DATABASE_URL=postgres://user:password@endpoint.neon.tech/dbname?sslmode=require
```

Alternatively use discrete `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD`.

### 2. Install & run

```bash
cd backend
npm install
npm run dev        # or: npm start
```

The app is served at `http://localhost:3000`. On startup the pool connects but the schema is **not** auto-created — it is applied via `resetDatabase.js` when you upload a dataset (or by running `npm start` flow / the reset endpoint).

### 3. Load data

- Click **Upload Dataset** → drag & drop the `.xlsx` (or use the global drag overlay).
- The backend resets the schema, runs the full import pipeline inside a transaction, and the dashboard renders.

---

## Testing, Linting & CI

### Unit tests (`node:test`)

```bash
cd backend
npm test
```

Current coverage (`backend/tests/`):

- `topicMatcher.test.js` — word extraction, exact/fuzzy/complete mismatch cases, null handling
- `decisionNormalizer.test.js` — decision → normalized category for various input strings

### Linting (ESLint)

```bash
cd backend
npm run lint
```

**Note:** linting currently fails because `eslint.config.js` requires `@eslint/js`, which is missing from `devDependencies`. This is a known issue (see below).

### CI (`.github/workflows/ci.yml`)

On push/PR to `main`, the workflow:

1. Checks out the repo
2. Installs dependencies (`npm ci`) in `backend/`
3. Runs `npm run lint`
4. Runs `npm test`

Matrix: Node 18.x and 20.x on Ubuntu.

---

## Known Issues & Ongoing Work

The repo is on the `new-features` branch with an in-progress refactor. Notable items:

1. **Broken lint** — `eslint.config.js` imports `@eslint/js` but the package isn't installed; CI fails until `@eslint/js` is added to devDependencies (or the config is simplified).
2. **Legacy service files removed** — the per-entity service layer was deleted in favor of importer/repository style, but `reviewService.js` still requires `./paperService` and `./programCommitteeService`, which no longer exist; its import path is not wired into the current importer flow.
3. **Stray dev files** — `fixPromiseAll.js`, `testUpload.js` (root + `backend/`), `backend/scratch_bulk.js`, and `backend/server.log` are scratch artifacts that should be removed or gitignored.
4. **Unused dependencies** — `jsdom` is never imported; `puppeteer` is only used by the scratch `testUpload.js` scripts.
5. **Duplicate decision normalizers** — both `utils/decisionHelper.js` (used in repos) and `utils/decisionNormalizer.js` (tested) exist with overlapping logic; they differ in casing (`'no decision'` vs `'No Decision'`) and should be reconciled.
6. **Upload hardening** — `multer` currently has no file-size or type restrictions on `/process-conference`.
7. **Frontend size** — `main.js` (1,340 lines) is a single monolith; `checkMismatch`/`extractWords` are duplicated inside it and in `utils/topicMatcher.js`.
8. **Performance** — `/dashboard` runs ~10 sequential queries per load, and every decision edit triggers a full dashboard reload.
