# ConfQual — Conference Quality Analytics Platform

A full-stack analytics dashboard for academic Program Chairs to evaluate review quality, reviewer calibration, expertise matching, and conference compliance with CORE/GII-GRIN-SCIE standards.

## Technology Stack

| Layer | Technology |
|-------|-----------|
| Runtime | Node.js 20 + Express 5 |
| Database | PostgreSQL (hosted on [Neon](https://neon.tech/)) |
| DB Driver | `pg` (raw SQL, no ORM) |
| Excel Parsing | `exceljs` |
| Sentiment Analysis | `sentiment` |
| Frontend | Vanilla JS (ES modules), Chart.js, Phosphor Icons |
| File Upload | `multer` |

## Core Features & Analytics

### 1. Dashboard Overview

Single API call (`GET /api/analytics/dashboard`) loads all data and renders:

- **Alerts bar** — actionable issues requiring chair attention
- **Quality Scorecard** — 4-dimension scoring (Coverage, Integrity, Satisfaction, Discussion)
- **Key metrics** — papers, reviewers, reviews, average score
- **Charts** — PC composition doughnut, debate distribution, decision distribution, score distribution

### 2. Alert System (8 Alert Types)

| Type | Trigger | Severity |
|------|---------|----------|
| Sentiment Mismatch | Review text is positive but score is low (or vice versa) | warning |
| Missing Meta-reviews | Papers with high score spread (>2) and no meta-review | danger |
| Missing Reviews | Papers with fewer than 3 reviews | warning |
| Unresolved Debates | Papers with high score variance and 0 comments | danger |
| Expertise Mismatch | Reviewer topics don't overlap paper topics at all | danger |
| COI Violations | Reviewer assigned to a paper they declared a conflict on | danger |
| Low Bidding Satisfaction | Fewer than 50% of assignments match reviewer bids | warning |
| Low Effort Reviews | Reviewer's average review is under 50 words | warning |

Each alert includes `affectedIds` for click-through filtering.

### 3. Quality Scorecard

Four dimensions scored 0–100 with deduction breakdowns:

- **Coverage** — papers with <3 reviews (CORE baseline: 3 reviews per paper)
- **Integrity** — COI violations, expertise mismatches, sentiment mismatches
- **Satisfaction** — reviewer bidding satisfaction, assignment coverage
- **Discussion** — missing meta-reviews, unresolved debates, low comment coverage

### 4. Paper Explorer

- Sortable by score spread, average score, review count, comments
- Filterable: high variance, low variance, unanimous reject/accept, borderline, to discuss, no comments, rejected, desk rejected, no decision
- Click any paper to open detail drawer with full reviews, comments, and mismatch badges
- Decision dropdown editing (toggled via settings)
- Zero-activity filter (papers with 0 reviews and 0 comments)
- CSV export

### 5. Reviewer Explorer

- Metrics per reviewer: reviews completed, average word count, average score given, peers average, calibration index, bidding match percentage
- Calibration sparkline visualization
- Filterable by comment activity, high variance
- Click to open reviewer detail drawer (assignments, scores, bids)
- CSV export

### 6. Review Submissions Timeline

- All individual reviews with paper title, reviewer name, score, date
- Sortable by score, date
- Filterable by high/low score

### 7. System Analytics

- Quality scorecard (see above)
- 4 Chart.js visualizations:
  - PC composition (main reviewers vs sub-reviewers)
  - Debate distribution (papers by number of reviews)
  - Decision distribution (accept/reject/no decision)
  - Score distribution (histogram of review scores)
- Top 5 papers by score
- Top 5 reviewers by reviews + word count
- Session planning clusters (accepted papers grouped by topic)

### 8. Quality Profile (CORE/GII-GRIN-SCIE Compliance)

- **Selectivity ranking**: CORE A/A* (≤25%), CORE B (≤35%), Below CORE B (>35%)
- **Review density**: average reviews per paper, European baseline percentage (papers with ≥3 reviews)
- **PC internationalization**: country diversity, domestic vs international ratio
- **Thematic competence**: topic coverage table (papers per topic vs reviewers per topic)
- **Gap topics**: topics with papers but few/no reviewers
- **Compatibility statement**: auto-generated prose summarizing compliance

### 9. Awards & Highlights

- Top 5 reviewers by review count + word count
- Top 5 papers by average score (filtered: avg ≥1.5, spread ≤2)
- Session planning: accepted papers grouped by topic cluster

### 10. Multi-Conference Management

- Import multiple conferences from EasyChair .xlsx files
- Conference selector in the header
- Edit conference metadata (name, short name, year)
- Delete conference with cascading removal
- Cross-conference comparison table with trend charts

### 11. Data Import Pipeline

Uploads an EasyChair .xlsx export and imports all data in a single database transaction:

1. Conference metadata (auto-detected from workbook)
2. Program committee members
3. Submissions
4. Authors + paper-author relationships
5. Assignments
6. Bids (if sheet exists)
7. Conflicts
8. Reviews (with automatic sentiment analysis)
9. Comments
10. Meta-reviews
11. Topics (PC topics + submission topics)

### 12. Anonymization

- Toggle to mask reviewer names (e.g., "Reviewer 42")
- Configurable prefix via settings
- Applied at the repository layer before returning data
- Sub-reviewer names only masked when anonymization is enabled

### 13. Decision Editing

- Toggle to enable/disable paper decision editing from the UI
- When enabled, chairs can change decisions via dropdown in paper detail
- Disabled by default; protected by settings check

### 14. Projector View

- Distraction-free paper presentation for PC meetings
- Shows paper title, authors, topics, reviews, and scores
- Opens in a clean overlay

### 15. Expertise Mismatch Detection

Two-level matching:

1. **Exact match**: Check if any paper topic appears in reviewer topics
2. **Fuzzy match**: Tokenize both, remove stop words, check for word overlap
3. If neither matches → flagged as expertise mismatch

### 16. Sentiment Analysis

- Each review gets a sentiment score during import (via `sentiment` npm package)
- Alerts flag reviews where sentiment contradicts the numerical score
- Used in the Integrity dimension of the quality scorecard

### 17. Calibration Index

Per-reviewer metric measuring how much their scores deviate from peer reviewers on the same papers:

- For each review: `calibration = reviewer_score - peers_average`
- Aggregated as mean absolute calibration across all reviews
- Low calibration = consistent with peers; High calibration = outlier

### 18. Settings & Data Management

- **Anonymization:** A toggle that safely masks names and emails in the dataset while maintaining relational integrity (useful for publishing datasets)
- **Chair Permissions:** Toggle to unlock Live Decision Editing
- **Data Purge:** Allows purging the entire dataset to import a new conference dataset from a clean state

## Setup & Installation

### Prerequisites

- [Node.js](https://nodejs.org/) v20+
- A [Neon](https://neon.tech/) PostgreSQL database (or any PostgreSQL instance)

### 1. Configure the Environment

Create a `.env` file in the `backend/` directory:

```env
DATABASE_URL=postgresql://user:password@endpoint.neon.tech/dbname?sslmode=require
```

Additional optional variables for local PostgreSQL fallback:

```env
DB_HOST=localhost
DB_PORT=5432
DB_NAME=conference_quality
DB_USER=hasan
DB_PASSWORD=password
```

### 2. Install Dependencies

```bash
cd backend
npm install
```

### 3. Run the Server

```bash
npm start        # production
npm run dev      # development with nodemon
```

The application will be available at `http://localhost:3000`.

### 4. Import Data

Upload an EasyChair `.xlsx` file through the UI, or import via CLI:

```bash
node importer/runImporter.js ../excel/easychair-gran.xlsx
```

## Project Structure

```
conference-quality-poc/
├── backend/
│   ├── config/database.js          # PostgreSQL pool with AsyncLocalStorage transactions
│   ├── controllers/
│   │   ├── analyticsController.js  # 22 analytics + conference endpoints
│   │   └── settingsController.js   # Anonymization and decision-editing toggles
│   ├── services/
│   │   ├── analyticsService.js     # Core business logic (515 lines)
│   │   └── reviewService.js        # Review creation during import
│   ├── repositories/               # Raw SQL query layer
│   │   ├── analyticsRepository.js  # 18+ query functions (759 lines)
│   │   ├── paperRepository.js
│   │   ├── reviewRepository.js
│   │   ├── programCommitteeRepository.js
│   │   ├── conferenceRepository.js
│   │   ├── assignmentRepository.js
│   │   ├── bidRepository.js
│   │   ├── conflictRepository.js
│   │   ├── commentRepository.js
│   │   ├── metaReviewRepository.js
│   │   ├── authorRepository.js
│   │   ├── paperAuthorRepository.js
│   │   └── topicRepository.js
│   ├── importer/                   # EasyChair Excel import pipeline
│   │   ├── runImporter.js          # Orchestrates full import in single transaction
│   │   ├── workbookReader.js       # AsyncLocalStorage-based file path context
│   │   └── importers/              # Individual sheet importers (11 files)
│   ├── utils/
│   │   ├── bulkInsert.js           # Generic multi-row INSERT builder
│   │   ├── topicMatcher.js         # Fuzzy expertise mismatch detection
│   │   ├── analyticsMath.js        # Sentiment analysis, calibration index
│   │   ├── excelHelper.js          # Safe ExcelJS cell value extraction
│   │   ├── resetDatabase.js        # Drop + recreate all tables
│   │   └── decisionHelper.js       # Normalize decision strings
│   ├── routes/
│   │   ├── analyticsRoutes.js      # 22 API routes
│   │   └── settingsRoutes.js       # 2 settings routes
│   ├── public/                     # Frontend SPA
│   │   ├── index.html
│   │   ├── style.css
│   │   └── js/
│   │       ├── main.js             # App logic (1529 lines)
│   │       ├── api.js              # API client functions
│   │       ├── renderers.js        # Score badge styling
│   │       └── utils.js            # HTML escaping, CSV export
│   ├── tests/
│   │   ├── decisionNormalizer.test.js
│   │   └── topicMatcher.test.js
│   ├── server.js                   # Express app entry point
│   └── package.json
├── database/
│   ├── confqual_schema.sql         # Full schema (14 tables)
│   └── migrations/
│       └── 001_multi_conference.sql
├── excel/                          # Sample EasyChair exports
│   ├── easychair-gran.xlsx
│   └── conf2_data.xlsx
└── DOCUMENTATION.md                # Full technical documentation
```

## Database Schema

14 tables with `ON DELETE CASCADE` foreign keys:

| Table | Purpose |
|-------|---------|
| `conference` | Conference metadata (name, short_name, year, submission_deadline) |
| `program_committee_member` | PC members with roles (PC member, Sub-reviewer, Chair) |
| `paper` | Submissions with decisions, deletion flags |
| `topic` | Global topic pool (shared across conferences) |
| `program_committee_member_topic` | Reviewer expertise topics |
| `paper_topic` | Paper-submitted topics |
| `assignment` | Paper-reviewer assignments |
| `bid` | Reviewer bidding preferences (yes/maybe/no/conflict) |
| `conflict` | Declared conflicts of interest |
| `review` | Reviews with scores, text, sentiment, sub-reviewer fields |
| `comment` | Discussion comments on papers |
| `meta_review` | Meta-reviews (AC recommendations) |
| `settings` | Global anonymization and decision-editing toggles |
| `author` + `paper_author` | Paper authors with corresponding flag |

## API Endpoints

### Analytics (`/api/analytics/`)

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/dashboard` | Full dashboard payload |
| `GET` | `/conference-health` | Aggregate stats |
| `GET` | `/reviewer-quality` | Per-reviewer metrics |
| `GET` | `/paper-debates` | Papers with review stats |
| `GET` | `/expertise-match` | Expertise mismatch details |
| `GET` | `/alerts` | Actionable alerts |
| `GET` | `/papers` | Paper explorer (sort/filter/pagination) |
| `GET` | `/reviewers` | Reviewer explorer |
| `GET` | `/submissions` | Review submission timeline |
| `GET` | `/system-analytics` | Scorecard, distributions, top papers/reviewers |
| `GET` | `/quality-profile` | CORE/GII-GRIN-SCIE compliance |
| `GET` | `/late-submissions` | Papers submitted after deadline |
| `GET` | `/conferences` | List all conferences |
| `GET` | `/comparison` | Cross-conference comparison |
| `GET` | `/papers/:id` | Paper detail (reviews + comments) |
| `GET` | `/reviewers/:id` | Reviewer detail (assignments + bids) |
| `PUT` | `/papers/:id/decision` | Update paper decision |
| `PUT` | `/conferences/:id` | Update conference metadata |
| `DELETE` | `/conferences/:id` | Delete conference (cascading) |
| `POST` | `/process-conference` | Upload .xlsx and import |
| `POST` | `/reset` | Drop and recreate all tables |
| `POST` | `/log` | Frontend error logging |

### Settings (`/api/settings/`)

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/` | Get settings |
| `POST` | `/` | Update settings |

## Testing

```bash
cd backend
npm test           # 11 tests (decision normalizer + topic matcher)
npm run lint       # ESLint (0 errors)
```

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | Yes | PostgreSQL connection string |
| `DB_HOST` | No | Local PostgreSQL host (fallback) |
| `DB_PORT` | No | Local PostgreSQL port (fallback) |
| `DB_NAME` | No | Local database name (fallback) |
| `DB_USER` | No | Local database user (fallback) |
| `DB_PASSWORD` | No | Local database password (fallback) |
