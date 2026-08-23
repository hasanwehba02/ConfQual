# ConfQual — Conference Quality Analytics Platform

A privacy-first, full-stack analytics platform for academic Program Chairs to evaluate review quality, reviewer calibration, expertise matching, and conference compliance with CORE/GII-GRIN-SCIE standards.

---

## 🔒 100% Privacy & Zero Data Egress

ConfQual is designed specifically for confidential peer-review data:
- **Zero External AI/LLM API Calls**: No data is ever sent to OpenAI, Anthropic, Gemini, or any cloud LLM provider.
- **Embedded Local NLP**: Sentiment analysis runs **100% locally in-process** using a quantized DistilBERT neural network (via `@xenova/transformers` ONNX Runtime on CPU).
- **Zero Telemetry / Trackers**: No third-party trackers, analytics, or external logging.
- **Data Sovereignty**: All data remains exclusively within your local environment and your private PostgreSQL/Supabase database.

---

## Technology Stack

| Layer | Technology |
|---|---|
| **Runtime** | Node.js 20+ & Express 5 |
| **Database** | PostgreSQL (hosted on [Supabase](https://supabase.com/) or self-hosted PostgreSQL) |
| **DB Driver** | `pg` (raw SQL, connection pooling, `AsyncLocalStorage` transaction context) |
| **NLP Engine** | `@xenova/transformers` (Local quantized DistilBERT ONNX on CPU) |
| **PDF Reporting** | `puppeteer` (Local headless PDF rendering) |
| **Excel Ingestion** | `exceljs` & `multer` |
| **Frontend** | Vanilla JS (Native ES Modules), Chart.js, Phosphor Icons |

---

## Core Features & Capabilities

### 1. Program Chair Overview & Dashboard
- **Actionable Alerts Bar**: Real-time detection of high-risk conference anomalies with 1-click drill-down filtering and direct email draft actions.
- **Quality Scorecard**: Comprehensive 4-dimension health score (0–100) with detailed deduction breakdowns:
  - **Coverage**: Papers with <3 reviews (CORE standard baseline).
  - **Integrity**: COI violations, expertise mismatches, and sentiment discrepancies.
  - **Satisfaction**: Reviewer bidding satisfaction and assignment distribution.
  - **Discussion**: Missing meta-reviews, unresolved debates, and low comment engagement.
- **Key Metrics & Distributions**: Reviewer pool composition (Chairs vs PC vs Sub-reviewers), debate distribution, decision breakdown, and score histogram.

### 2. Deep-Learning Sentiment Analysis
- Uses an embedded, quantized **DistilBERT** transformer model running on-device to classify review sentiment on a continuous scale (`-10.00` to `+10.00`).
- Understands academic hedging, polite introductions (*"The paper is well written. However, the core theoretical claims are unsupported..."*), and nuanced criticism.
- Flags **Sentiment Mismatches** when positive textual sentiment contradicts low numeric scores (or vice versa).

### 3. Reviewer Calibration & Z-Score Normalization
- **Calibration Index**: Computes how much a reviewer's scores deviate from their peers on the same papers ($score - peer\_average$).
- **Z-Score Normalization**: Evaluates reviewer scoring bias across the conference scale:
  - Calculates per-reviewer mean ($\mu$) and standard deviation ($\sigma$).
  - Rescales individual scores onto the conference distribution: $normalized = \mu_{conf} + \left(\frac{score - \mu_{reviewer}}{\sigma_{reviewer}}\right) \times \sigma_{conf}$.
  - Classifies reviewers into transparent bias profiles: **Calibrated**, **Lenient**, **Strict**, or **Extreme Outlier**.

### 4. Interactive Email Drafting System
- 1-Click contextual email drafting for program chairs from both **Paper Drawer** and **Reviewer Drawer**.
- **Pre-Built Templates**:
  - `silent_debate`: Alerts reviewers of large score spreads on a paper with no discussion.
  - `expertise_mismatch`: Politely notifies reviewers when assigned outside their listed topics.
  - `missing_metareview`: Solicits a meta-review from assigned reviewers when a paper lacks a synthesis.
  - `sentiment_mismatch`: Diplomatically asks for clarification when review text and numerical scores diverge.
  - `low_effort`: Inquires about brief/shallow reviews under minimum word counts.
  - `custom`: Freely editable subject and body for chair-specific communications.
- **Live Editing & Sync**: Fully editable `To` and `Subject` fields with real-time `mailto:` URL synchronization and fallback 1-click **Copy to Clipboard**.

### 5. Reviewer Dossier PDF Export
- Generates publication-ready PDF evaluation reports for individual reviewers (`/api/analytics/reviewer/:id/report.pdf`).
- Includes review counts, word counts, bidding satisfaction, calibration sparklines, bias classification, and optional full review/comment excerpts.
- Rendered in-process with headless Chrome via Puppeteer.

### 6. Paper Explorer
- Multi-column sorting: Score Spread, Average Score, Normalized Score, Review Count, Comment Count.
- Filter presets: High Variance, Low Variance, Unanimous Accept/Reject, Borderline, To Discuss, No Comments, Rejected, Desk Rejected, No Decision, and Zero-Activity.
- Slide-out detail drawer with full review texts, sub-reviewer attributions, discussion comments, and mismatch badges.
- Live decision editing toggle for chairs.

### 7. Reviewer Explorer
- Comprehensive reviewer metrics: Completed reviews, average word count, average score given, peer average, calibration index, and bidding match %.
- Interactive calibration sparklines and bias distribution tags.
- Detail drawer displaying all paper assignments, individual review scores, declared bids, and direct email drafting.

### 8. URL Deep-Linking & Saved View Presets
- Full state synchronization with the URL hash (`#tab=papers&conf=1&filter=borderline&search=graph&sort=spread_desc`).
- Save customized filter/sort combinations as named presets in local storage for quick access during PC meetings.

### 9. CORE / GII-GRIN-SCIE Compliance Profile
- **Selectivity Ranking**: Automatic classification (CORE A/A* $\le$ 25%, CORE B $\le$ 35%, Below CORE B > 35%).
- **Review Density**: Percentage of papers satisfying the European baseline ($\ge$ 3 reviews).
- **Internationalization**: Country diversity index and domestic vs. international PC member ratios.
- **Thematic Competence**: Matrix of paper topic submissions versus reviewer expertise coverage, automatically flagging gap topics.
- **Automated Statement**: Generates formal compliance text ready for conference auditing bodies.

### 10. Multi-Conference Management & Data Ingestion
- Upload and parse EasyChair `.xlsx` exports in a single database transaction:
  - Conference metadata, PC members, submissions, authors, assignments, bids, conflicts, reviews, comments, and topics.
  - Automatic sub-reviewer detection and mapping.
- Multi-conference switcher with cross-conference comparison tables and cascading deletion.

---

## Setup & Installation

### Prerequisites
- [Node.js](https://nodejs.org/) v20+
- A [Supabase](https://supabase.com/) PostgreSQL database (or any self-hosted PostgreSQL 14+ instance)

### 1. Environment Configuration
Create a `.env` file in the `backend/` directory:

```env
# Supabase / PostgreSQL Connection String
DATABASE_URL=postgresql://postgres:[YOUR-PASSWORD]@db.[YOUR-PROJECT-REF].supabase.co:5432/postgres?sslmode=require

# Optional fallback variables for local development
PORT=3000
```

### 2. Database Schema Initialization
Execute the SQL schema in your Supabase SQL Editor or via `psql`:

```bash
psql $DATABASE_URL -f database/confqual_schema.sql
```

You can verify database connectivity and schema readiness at any time:
```bash
cd backend
node test-db.js
```

### 3. Install Dependencies
```bash
cd backend
npm install
```

### 4. Run the Application
```bash
# Production mode
npm start

# Development mode with hot-reloading
npm run dev
```

Open your browser at `http://localhost:3000`.

### 5. Run the Test Suite
```bash
# Run unit & integration tests (59 tests)
npm test

# Run ESLint validation
npm run lint
```

---

## Project Structure

```
conference-quality-poc/
├── backend/
│   ├── config/
│   │   └── database.js               # PostgreSQL pool with AsyncLocalStorage transactions
│   ├── controllers/
│   │   ├── analyticsController.js     # Dashboard, papers, reviewers, compliance, PDF export
│   │   └── settingsController.js      # Anonymization and decision-editing toggles
│   ├── services/
│   │   ├── analyticsService.js        # Core analytics, scorecard, alerts, and metrics logic
│   │   ├── reviewerReportService.js   # PDF dossier generation and HTML report builder
│   │   └── reviewService.js           # Review management during import
│   ├── repositories/                  # Clean SQL query layer
│   │   ├── analyticsRepository.js     # Aggregations, scorecard queries, paper/reviewer details
│   │   ├── paperRepository.js
│   │   ├── reviewRepository.js
│   │   ├── programCommitteeRepository.js
│   │   └── conferenceRepository.js
│   ├── utils/
│   │   ├── sentimentEngine.js         # Local Transformers.js (DistilBERT ONNX) engine
│   │   ├── analyticsMath.js           # Normalization, calibration, bias classification
│   │   ├── topicMatcher.js            # Exact & fuzzy topic mismatch detection
│   │   └── bulkInsert.js              # Multi-row parameterized SQL batching
│   ├── importer/                      # EasyChair Excel import pipeline
│   │   ├── runImporter.js             # Atomic import orchestrator
│   │   ├── workbookReader.js          # ExcelJS reader with AsyncLocalStorage context
│   │   └── importers/                 # 11 sheet-specific importers
│   ├── public/                        # Frontend Single-Page Application
│   │   ├── index.html
│   │   ├── style.css
│   │   └── js/
│   │       ├── main.js                # App orchestration & DOM event handling
│   │       ├── api.js                 # REST client endpoints
│   │       ├── emailDrafts.mjs        # 6 Email templates & formatting logic
│   │       ├── urlState.mjs           # URL hash deep linking & parameter sanitation
│   │       ├── presetStore.mjs        # LocalStorage filter preset management
│   │       └── renderers.js           # Badges, sparklines, and scorecard charts
│   ├── tests/                         # Node.js native test suite (59 unit/integration tests)
│   │   ├── sentimentEngine.test.mjs
│   │   ├── emailDrafts.test.mjs
│   │   ├── reviewerReportService.test.mjs
│   │   ├── urlState.test.mjs
│   │   ├── presetStore.test.mjs
│   │   └── topicMatcher.test.js
│   ├── server.js                      # Express application entry point
│   └── package.json
├── database/
│   ├── confqual_schema.sql            # Complete PostgreSQL schema (14 tables)
│   └── migrations/                    # Multi-conference schema updates
└── README.md
```

---

## License

ISC License. Built for conference program chairs and academic review committees.
