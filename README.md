# ConfQual: Academic Conference Quality Analytics Platform

ConfQual is a local-first analytics platform designed for academic Program Chairs and steering committees to evaluate peer-review quality, reviewer scoring calibration, topic expertise matching, and conference compliance with standards such as CORE and GII-GRIN-SCIE.

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
- **Database Access**: `pg` client with connection pooling and parameterization
- **Natural Language Processing**: `@xenova/transformers` (local ONNX DistilBERT pipeline)
- **Document Export**: Puppeteer (headless PDF rendering)
- **Spreadsheet Parsing**: `exceljs` and `multer`
- **Frontend**: Vanilla JavaScript (ES Modules), Chart.js, Phosphor Icons, CSS3

---

## Architecture & Analysis Modules

### 1. Dashboard & Quality Scorecard
- Aggregates conference-level metrics into a 4-dimension scorecard (0–100 scale):
  - **Coverage**: Evaluates compliance with minimum review baselines (standard: at least 3 reviews per non-desk-rejected submission).
  - **Integrity**: Tracks COI violations, topic expertise mismatches, and sentiment contradictions.
  - **Satisfaction**: Computes reviewer bidding fulfillment rates and workload equity.
  - **Discussion**: Identifies papers with high score variance lacking discussion comments or meta-reviews.
- Provides an Action Center that flags urgent conference anomalies with direct filtering and contextual email actions.

### 2. Local Sentiment Analysis & Mismatch Detection
- Preprocesses EasyChair review structures by isolating academic evaluation sections (`(OVERALL EVALUATION)`, `(DETAILED COMMENTS)`, `(COMMENTS TO AUTHORS)`) from summary text.
- Scores textual sentiment on a continuous scale from `-10.00` (strongly critical) to `+10.00` (strongly positive).
- Flags sentiment mismatches where numerical scores contradict the qualitative review text (such as low scores paired with high sentiment or high scores paired with severe criticism).

### 3. Reviewer Calibration & Bias Normalization
- **Calibration Index**: Measures the difference between a reviewer's awarded score and the peer average for each submission ($score - \text{peer\_average}$).
- **Z-Score Normalization**: Standardizes scores to account for individual reviewer harshness or leniency:
  $$\text{Normalized Score} = \mu_{\text{conf}} + \left(\frac{\text{Score} - \mu_{\text{reviewer}}}{\sigma_{\text{reviewer}}}\right) \times \sigma_{\text{conf}}$$
- Categorizes reviewers into transparent profiles based on deviations from the conference mean: Calibrated, Lenient, Strict, or Extreme Outlier.

### 4. Contextual Email Drafting
- Generates structured draft messages for Program Chairs to address specific conference issues:
  - `silent_debate`: Alerts assigned reviewers to unresolved score spreads with no comments.
  - `expertise_mismatch`: Contacts reviewers assigned outside their declared expertise topics.
  - `missing_metareview`: Requests summary evaluations for completed reviews awaiting decision.
  - `sentiment_mismatch`: Requests clarification when review text and numerical scores diverge.
  - `low_effort`: Inquires about brief reviews below minimum word thresholds.
  - `custom`: Direct chair-to-reviewer messaging.
- Synchronizes subject and body fields to standard `mailto:` links with clipboard copy fallbacks.

### 5. Reviewer Dossier PDF Generation
- Compiles individual reviewer dossiers into downloadable PDF documents via `/api/analytics/reviewer/:id/report.pdf`.
- Summarizes review volume, word counts, bidding match percentages, calibration metrics, and optional review/comment excerpts.

### 6. Submissions & Reviewers Explorers
- **Paper Explorer**: Sort submissions by score variance, raw average, normalized score, review count, and comment activity. Includes filter presets for borderline papers, unanimous decisions, and silent debates.
- **Reviewer Explorer**: Review reviewer workloads, average grades, calibration indexes, and bidding match statistics.
- **URL Deep-Linking & View Presets**: State is synced with the URL hash (`#tab=papers&conf=1&filter=borderline`) and can be saved as named presets in local storage.

### 7. CORE / GII-GRIN-SCIE Compliance Profile
- Computes acceptance selectivity rate thresholds (CORE A/A* $\le 25\%$, CORE B $\le 35\%$).
- Evaluates review density against international conference baselines.
- Calculates geographic diversity metrics across Program Committee members and authors.
- Analyzes topic coverage gaps between submitted papers and available reviewer expertise.

### 8. Data Ingestion & Multi-Conference Support
- Parses EasyChair Excel exports (`.xlsx`) within a single database transaction:
  - Conference metadata, PC members, submissions, authors, review assignments, bids, conflicts of interest, reviews, comments, and topics.
  - Resolves sub-reviewers and maps them to parent PC assignments.
- Supports switching between multiple conferences with comparative metrics and cascading deletion.

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

### 2. Database Initialization
Run the database schema migration using `psql` or your database management console:

```bash
psql $DATABASE_URL -f database/confqual_schema.sql
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
# Run unit and integration tests
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
│   │   └── database.js          # PostgreSQL connection pool
│   ├── controllers/
│   │   └── analyticsController.js # HTTP request handlers
│   ├── importer/
│   │   ├── excelParser.js       # EasyChair XLSX ingestion
│   │   └── importers/           # Entity-specific database importers
│   ├── public/                  # Frontend single-page application
│   │   ├── index.html           # Main user interface
│   │   ├── style.css            # Stylesheet
│   │   └── js/                  # Frontend ES modules
│   ├── repositories/
│   │   └── analyticsRepository.js # SQL queries and data access
│   ├── routes/
│   │   └── analyticsRoutes.js   # Express routing definitions
│   ├── services/
│   │   ├── analyticsService.js  # Analytics and metric calculations
│   │   └── reportService.js     # PDF report generation
│   ├── tests/                   # Automated test suite
│   └── utils/
│       ├── analyticsMath.js     # Statistical and calibration calculations
│       ├── decisionHelper.js    # EasyChair decision normalization
│       └── sentimentEngine.js   # Local ONNX DistilBERT sentiment engine
├── database/
│   └── confqual_schema.sql      # PostgreSQL schema definition
└── README.md
```

---

## License

ISC License.
