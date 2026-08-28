# ConfQual: Academic Conference Quality Analytics Platform

ConfQual is a local-first analytics platform designed for academic Program Chairs and steering committees to evaluate peer-review quality, reviewer scoring calibration, topic expertise matching, multi-edition conference tracking, and conference compliance with standards such as CORE and GII-GRIN-SCIE.

---

## Data Privacy Architecture

ConfQual processes confidential peer-review data with strict privacy guarantees:

- **Zero Cloud LLM Dependencies**: No text or metadata is transmitted to external AI APIs (OpenAI, Anthropic, Google, etc.).
- **In-Process Local NLP**: Textual sentiment analysis is performed locally on the CPU using a quantized DistilBERT transformer model through `@xenova/transformers` and the ONNX runtime.
- **No Third-Party Telemetry**: The application runs without tracking scripts, external log collectors, or third-party analytical beacons.
- **Database-Level Anonymization Mode**: An optional anonymization toggle masks reviewer identities, author identities, and institutional affiliations directly within SQL queries before data reaches the presentation layer.

---

## Technology Stack

- **Backend Runtime**: Node.js 20+ and Express 5
- **Database**: PostgreSQL 14+ (compatible with Supabase or self-hosted PostgreSQL)
- **Database Access**: `pg` client with connection pooling, parameterized queries, and transactional upserts
- **Natural Language Processing**: `@xenova/transformers` (local ONNX DistilBERT pipeline)
- **Document Export**: Puppeteer (headless PDF rendering)
- **Spreadsheet Parsing**: `exceljs` and `multer`
- **Frontend**: Vanilla JavaScript (ES Modules), Chart.js, Phosphor Icons, CSS3

---

## Architecture & Core Modules

### 1. Multi-Edition Conference Data Model
ConfQual separates conference series from specific year runs to support longitudinal analytics across editions:
- **Conference Series & Editions**: A conference series (e.g., *CAiSE*) groups multiple editions (e.g., *CAiSE 2025*, *CAiSE 2026*).
- **Global Researchers & Edition Participants**: A centralized `researcher` registry tracks academic personas across years, bridged to each edition via role-specific `participant` records.
- **Role Specializations**:
  - **Authors**: Maps researchers to submissions with explicit author sequence ordering (`author_order`).
  - **Evaluators**: Distinguishes Program Committee members, track chairs, and sub-reviewers.
  - **Steering Committee Chairs**: Tracks governance across conference series.
- **Person-Level Conflicts of Interest (CoI)**: Explicit dual-model tracking between researchers and submissions.
- **Non-Destructive Re-Import**: Idempotent `UPSERT` ingestion architecture preserves user-authored notes, decisions, and customized thresholds when re-importing updated EasyChair datasets.

### 2. Edition Configuration & Alert Rules
- **11 Typed Configuration Parameters per Edition**:
  - Review deadlines, score minimum/maximum limits, reviewer expertise scale.
  - Default reviewers per paper (`nb_reviewers`), accepted paper types (full, short, demo), bidding types, meta-reviewer recommendation scales, and co-located event metadata.
- **Dynamic Alert Thresholds**:
  - Configurable alert rules per conference with toggle switches (score spread, unanimous accept/reject thresholds, calibration deviation, outlier scores).
  - The configured `nb_reviewers` directly drives under-reviewed paper alerts and table indicators.

### 3. Scoped Notes & Memory System
- **Series & Edition Scoping**:
  - **Conference Notes**: Shared across all editions of the same conference series (e.g., notes recorded in CAiSE 2025 remain accessible in CAiSE 2026).
  - **Edition Notes**: Strictly scoped to a single conference year.
- **Per-Concept Private Notes**:
  - Attach private notes to Papers, Reviewers/Participants, Reviews, Comments, and Topics.
  - Cross-edition history allows chairs to review historical notes on returning PC members.
- **Settings Drawer & Deep Linking**:
  - Centralized note audit with inline editing, deletion, and bulk purging.
  - Clickable note references that automatically open target paper or reviewer drawers.
  - Private notes are automatically compiled into exported Reviewer Dossier PDFs.

### 4. Local Sentiment Analysis & Mismatch Detection
- Preprocesses EasyChair review structures by isolating academic evaluation sections (`(OVERALL EVALUATION)`, `(DETAILED COMMENTS)`, `(COMMENTS TO AUTHORS)`) from summary text.
- Scores textual sentiment on a continuous scale from `-10.00` (strongly critical) to `+10.00` (strongly positive).
- Flags sentiment mismatches where numerical scores contradict the qualitative review text (such as low scores paired with high sentiment or high scores paired with severe criticism).

### 5. Reviewer Calibration & Bias Normalization
- **Calibration Index**: Measures the difference between a reviewer's awarded score and the peer average for each submission ($score - \text{peer\_average}$).
- **Z-Score Normalization**: Standardizes scores to account for individual reviewer harshness or leniency:
  $$\text{Normalized Score} = \mu_{\text{conf}} + \left(\frac{\text{Score} - \mu_{\text{reviewer}}}{\sigma_{\\text{reviewer}}}\right) \times \sigma_{\text{conf}}$$
- Categorizes reviewers into transparent profiles based on deviations from the conference mean: Calibrated, Lenient, Strict, or Extreme Outlier.

### 6. Interactive Explorers & Advanced Filtering
- **Paper Explorer**: Sort submissions by score variance, raw average, normalized score, review count, and comment activity. Includes filter presets for borderline papers, unanimous decisions, and silent debates.
- **Reviewer Explorer**: Audit reviewer workloads, completed/missed reviews, sub-reviewer delegations (with hover breakdowns), and calibration indexes.
- **Clickable Header Sorting & Multi-Criteria Filtering**: Interactive column sorting arrows and multi-select filter dropdowns across all tables.
- **Custom Tooltips (~120ms)**: Fast contextual tooltips explaining metrics, formulas, and alert conditions.
- **URL Deep-Linking & View Presets**: State is synced with the URL hash (`#tab=papers&conf=1&filter=borderline`) and can be saved as named presets in local storage.

### 7. Dashboard & Quality Scorecard
- Aggregates conference-level metrics into a 4-dimension scorecard (0–100 scale):
  - **Coverage**: Evaluates compliance with minimum review baselines (standard: at least 3 reviews per non-desk-rejected submission).
  - **Integrity**: Tracks COI violations, topic expertise mismatches, and sentiment contradictions.
  - **Satisfaction**: Computes reviewer bidding fulfillment rates and workload equity.
  - **Discussion**: Identifies papers with high score variance lacking discussion comments or meta-reviews.
- Provides an Action Center that flags urgent conference anomalies with direct filtering and contextual email actions.

### 8. Contextual Email Drafting & Dossier PDF Export
- Generates structured draft messages for Program Chairs (`silent_debate`, `expertise_mismatch`, `missing_metareview`, `sentiment_mismatch`, `low_effort`, `custom`) with `mailto:` and clipboard integration.
- Generates comprehensive reviewer dossiers in PDF format via `/api/analytics/reviewer/:id/report.pdf`, including workload stats, calibration data, and private chair notes.

---

## Getting Started

### Prerequisites
- Node.js 20 or higher
- PostgreSQL 14+ or a Supabase PostgreSQL instance

### 1. Environment Setup
Create a `.env` file in the `backend/` directory:

```env
DATABASE_URL=postgresql://postgres:[PASSWORD]@[HOST]:[PORT]/postgres?sslmode=require
PORT=3000
```

### 2. Database Initialization & Migrations
Run the base schema and incremental migrations using `psql` or your database console:

```bash
# 1. Base schema
psql $DATABASE_URL -f database/confqual_schema.sql

# 2. Incremental feature migrations
psql $DATABASE_URL -f database/migrations/001_multi_conference.sql
psql $DATABASE_URL -f database/migrations/002_alert_rules.sql
psql $DATABASE_URL -f database/migrations/003_conference_edition_researcher.sql
psql $DATABASE_URL -f database/migrations/004_author_evaluator_scchair.sql
psql $DATABASE_URL -f database/migrations/005_coi_person_level.sql
psql $DATABASE_URL -f database/migrations/006_configuration_information.sql
psql $DATABASE_URL -f database/migrations/007_notes.sql
```

Verify connection status:
```bash
cd backend
node test-db.js
```

### 3. Install Dependencies
```bash
cd backend
npm install
```

### 4. Running the Application
```bash
# Start server in production mode
npm start

# Start server with file watching for development
npm run dev
```

The application will be accessible at `http://localhost:3000`.

### 5. Running Tests & Linting
```bash
# Run complete test suite (unit + integration + scoping tests)
npm test

# Run ESLint validation
npm run lint
```

---

## Directory Structure

```text
conference-quality-poc/
├── .github/
│   └── workflows/
│       └── ci.yml               # GitHub Actions CI workflow
├── backend/
│   ├── app.js                   # Express application configuration
│   ├── server.js                # Server entry point
│   ├── config/
│   │   ├── alertRuleDefaults.js # Default alert threshold definitions
│   │   └── database.js          # PostgreSQL connection pool
│   ├── controllers/
│   │   ├── analyticsController.js # Analytics & ingestion HTTP handlers
│   │   └── settingsController.js  # Global settings HTTP handlers
│   ├── importer/
│   │   ├── workbookReader.js    # Excel (.xlsx) file streaming
│   │   ├── mappers/             # Raw row-to-entity transformers
│   │   └── importers/           # Transactional upsert database importers
│   ├── public/                  # Frontend single-page application
│   │   ├── index.html           # Main user interface & modals
│   │   ├── style.css            # Stylesheet & design tokens
│   │   └── js/                  # Frontend ES modules (explorers, drawers, views)
│   ├── repositories/
│   │   ├── analytics/           # Paper, reviewer & overview SQL queries
│   │   ├── configurationRepository.js # Edition configuration queries
│   │   └── noteRepository.js    # Scoped notes CRUD queries
│   ├── routes/
│   │   ├── analyticsRoutes.js   # Analytics & notes API routes
│   │   └── settingsRoutes.js    # Settings API routes
│   ├── services/
│   │   ├── analytics/           # Scorecard, bias, and alert logic
│   │   └── reportService.js     # Puppeteer PDF dossier generation
│   ├── tests/                   # Automated Node.js test suite
│   └── utils/
│       ├── analyticsMath.js     # Normalization & statistical calculations
│       └── sentimentEngine.js   # Local ONNX DistilBERT sentiment engine
├── database/
│   ├── confqual_schema.sql      # Initial base schema
│   └── migrations/              # Incremental SQL migrations (001-007)
└── README.md
```

---

## License

ISC License.
