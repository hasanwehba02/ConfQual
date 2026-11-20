# ConfQual

ConfQual is a local analytics tool for academic Program Chairs, Track Chairs, and Steering Committees. It provides statistical insights, reviewer calibration analysis, and quality auditing from peer-review data exported by systems like EasyChair.

> Technical architecture, database schemas, and API documentation are available in the [System Architecture Guide](docs/ARCHITECTURE.md) — recently updated for `participant_topic` expertise, corrected `paper.decision_category` (`desk_reject`), shared normalization CTEs (`AVG` vs `ADJ AVG`), and `202` async import with `GET /import-status` polling.

---

## Key Features

- **Reviewer Calibration & Bias Correction**: Calculates variance and z-score normalized grades to identify consistently harsh or lenient reviewers.
- **Local Text Sentiment Analysis**: Runs an in-process quantized MiniLM transformer model via `@huggingface/transformers` (ONNX on CPU) as a heuristic signal for contradictions between review text and numerical scores.
- **Multi-Edition Tracking & Scoped Notes**: Groups annual editions under a parent conference series, tracks returning researchers, and manages chair notes across years.
- **Configurable Alert Thresholds**: Evaluates under-reviewed submissions, high score spreads, missing discussions, and unassigned submissions based on edition configuration.
- **Reviewer Dossier Export**: Compiles reviewer performance metrics, calibration stats, and private notes into downloadable PDF reports.
- **Local analysis**: Sentiment processing does not use a cloud AI API. Authentication uses the configured Supabase service, which may be hosted externally.

---

## Tech Stack

- **Backend**: Node.js 22+, Express 5
- **Database**: PostgreSQL 14+ (`pg` client with connection pooling)
- **Local NLP**: `@huggingface/transformers` (quantized ONNX MiniLM)
- **PDF Export**: Puppeteer (headless Chrome)
- **Spreadsheet Parsing**: `exceljs`, `multer`
- **Frontend**: Vanilla JavaScript (ES Modules), Chart.js, Phosphor Icons, CSS3

---

## Setup & Installation

### Prerequisites
- Node.js 22+
- PostgreSQL 14+
- A compatible Chrome or Chromium executable for PDF reports. If Puppeteer's
  bundled browser is unavailable, set `PUPPETEER_EXECUTABLE_PATH` to a trusted
  installed browser and verify report generation.

### 1. Environment Configuration
Create `backend/.env`:

```env
DATABASE_URL=postgresql://postgres:password@localhost:5432/confqual
PORT=3000
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_PUBLISHABLE_KEY=your-publishable-key
```

Create users through Supabase Authentication. Public signup is not exposed by
ConfQual. Each new user receives a private workspace and becomes its admin.
Workspace memberships hold `admin`, `chair`, or `viewer` roles.

Admins, chairs and temporary support users must authenticate with a TOTP
factor before accessing workspace data. Enable TOTP enrollment and verification
in the chosen Supabase deployment. Disable public signup at the provider too:
omitting a signup page does not prevent direct use of its authentication API.
Every account needs operator-authorized setup and approval before workspace
access. The backend reads these flags from the current Supabase user record,
not a potentially stale JWT. The operator-only tool uses Supabase's secret key;
never add it to Heroku, the browser, or Git. Privileged access requires both
`aal2`, Supabase's signed `amr` claim for a verified TOTP method, and the
current session's factor ID matching the exact TOTP factor approved by the
operator. `DATABASE_URL` must point to the PostgreSQL database for the same
Supabase project as `SUPABASE_URL`; its base connection role must be able to
read `auth.sessions` so the backend can verify the active factor. The scoped
`confqual_app` role does not receive access to Supabase's auth schema.

For initial approval, independently verify the person through a previously
known channel (for example, a phone number confirmed in person). Email access
alone is not identity verification. Set `SUPABASE_URL` and `SUPABASE_SECRET_KEY`
in your local shell using a secret manager. First authorize setup:

```bash
node backend/scripts/manageTrustedAuth.js setup <supabase-user-id>
```

Stay with the identity-verified user through authenticator enrollment and code
verification. Then list their verified factor IDs and approve the exact factor
they enrolled:

```bash
node backend/scripts/manageTrustedAuth.js factors <supabase-user-id>

node backend/scripts/manageTrustedAuth.js approve <supabase-user-id> <verified-totp-factor-id>
```

If an authenticator is lost, verify the person again through that separate
channel. This clears access and setup approval and removes any remaining
factors, including when the lost factor is already absent:

```bash
node backend/scripts/manageTrustedAuth.js recover <supabase-user-id>
```

Then repeat `setup`, supervise replacement enrollment, and run `approve` with
the new verified factor ID. Recovery clears both approval flags before factor
deletion; Supabase also signs out active sessions when a verified factor is
deleted. If a factor removal fails, access remains blocked. Keep the secret key
in a local secret manager or temporary shell environment, never in the
application or its deployment configuration.
For password recovery, allowlist the deployment's exact HTTPS
`/reset-password.html` URL in Supabase Auth and configure its email delivery.
An enrolled MFA factor is still required to reset the password.

### 2. Database Setup
Initialize the consolidated schema:

```bash
psql "$DATABASE_URL" -f database/confqual_schema.sql
psql "$DATABASE_URL" -f database/migrations/001_workspaces_up.sql
psql "$DATABASE_URL" -f database/migrations/002_support_access_up.sql
psql "$DATABASE_URL" -f database/migrations/003_preserve_support_audit_up.sql
psql "$DATABASE_URL" -f database/migrations/004_revoke_data_api_access_up.sql
```

The workspace migration preserves existing rows inside a legacy workspace.
New users receive separate private workspaces; the legacy workspace is never
assigned automatically. An administrator must explicitly provision membership
for the intended user after verifying their identity. Run the migration before
deploying workspace-aware code.

The support-access migration adds scoped, temporary support grants and audit
records. Apply it before using the support API. For an existing database that
already ran migration 002, apply migration 003 once before deploying the audit
retention change; it is safe to rerun. It removes the original audit foreign
keys so deleting a grant or workspace preserves its audit records. It cannot
restore audit records already deleted by the old cascading constraints. There
is no automatic downgrade: restoring those constraints could delete retained
audit records or fail when their referenced records no longer exist.

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

## Private deployment posture

ConfQual contains confidential conference-review data and is intentionally not a public, indexable website. Production pages send `noindex` metadata and `robots.txt` blocks crawlers. The project intentionally does not publish a sitemap, public structured data, Open Graph promotion metadata, or `llms.txt`. Add canonical or social-preview metadata only if a stable custom domain and a separate public landing page are introduced.

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
│   └── confqual_schema.sql      # Consolidated database schema
├── LICENSE                      # MIT License
└── README.md
```

---

## License

MIT
