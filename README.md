# ConfQual

ConfQual is a local analytics tool for academic Program Chairs, Track Chairs, and Steering Committees. It provides statistical insights, reviewer calibration analysis, and quality auditing from peer-review data exported by systems like EasyChair.

> Technical architecture, database schemas, and API documentation are available in the [System Architecture Guide](docs/ARCHITECTURE.md).

---

## Key Features

- **Reviewer Calibration & Bias Correction**: Calculates variance and z-score normalized grades to identify consistently harsh or lenient reviewers.
- **Local Text Sentiment Analysis**: Runs an in-process quantized DistilBERT transformer model via `@xenova/transformers` (ONNX on CPU) to detect contradictions between review text and numerical scores.
- **Multi-Edition Tracking & Scoped Notes**: Groups annual editions under a parent conference series, tracks returning researchers, and manages chair notes across years.
- **Configurable Alert Thresholds**: Evaluates under-reviewed submissions, high score spreads, missing discussions, and unassigned submissions based on edition configuration.
- **Reviewer Dossier Export**: Compiles reviewer performance metrics, calibration stats, and private notes into downloadable PDF reports.
- **Privacy First**: Runs entirely on localhost with no cloud AI API dependencies, external tracking, or telemetry.

---

## Tech Stack

- **Backend**: Node.js 20+, Express 5
- **Database**: PostgreSQL 14+ (`pg` client with connection pooling)
- **Local NLP**: `@xenova/transformers` (quantized ONNX DistilBERT)
- **PDF Export**: Puppeteer (headless Chrome)
- **Spreadsheet Parsing**: `exceljs`, `multer`
- **Frontend**: Vanilla JavaScript (ES Modules), Chart.js, Phosphor Icons, CSS3

---

## Setup & Installation

### Prerequisites
- Node.js 20+
- PostgreSQL 14+

### 1. Environment Configuration
Create `backend/.env`:

```env
DATABASE_URL=postgresql://postgres:password@localhost:5432/confqual
PORT=3000
```

### 2. Database Migrations
Run the base schema and incremental migrations:

```bash
# Base schema
psql $DATABASE_URL -f database/confqual_schema.sql

# Incremental migrations
psql $DATABASE_URL -f database/migrations/001_multi_conference.sql
psql $DATABASE_URL -f database/migrations/002_alert_rules.sql
psql $DATABASE_URL -f database/migrations/003_conference_edition_researcher.sql
psql $DATABASE_URL -f database/migrations/004_author_evaluator_scchair.sql
psql $DATABASE_URL -f database/migrations/005_coi_person_level.sql
psql $DATABASE_URL -f database/migrations/006_configuration_information.sql
psql $DATABASE_URL -f database/migrations/007_notes.sql
```

Verify connection:
```bash
cd backend
node test-db.js
```

### 3. Install & Run
```bash
cd backend
npm install

# Development server
npm run dev

# Production server
npm start
```

The application runs at `http://localhost:3000`.

### 4. Running Tests
```bash
cd backend
npm test
npm run lint
```

---

## Project Structure

```text
conference-quality-poc/
├── docs/
│   └── ARCHITECTURE.md          # Detailed architecture & API reference
├── backend/
│   ├── app.js                   # Express application setup
│   ├── server.js                # Server entry point
│   ├── config/                  # Database pool & alert defaults
│   ├── controllers/             # HTTP route handlers
│   ├── importer/                # Excel streaming parser and importers
│   ├── public/                  # Frontend static files (HTML, CSS, JS)
│   ├── repositories/            # SQL queries & database access
│   ├── routes/                  # Express route definitions
│   ├── services/                # Analytics math & PDF reporting
│   ├── tests/                   # Automated test suite
│   └── utils/                   # Sentiment engine & statistical math
├── database/
│   ├── confqual_schema.sql      # Initial database schema
│   └── migrations/              # Incremental SQL migrations (001-007)
├── LICENSE                      # MIT License
└── README.md
```

---

## License

MIT
