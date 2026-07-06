# ConfQual

ConfQual is a decision-support analytics dashboard for academic Program Chairs. It parses conference data to audit the scientific review process.

The system ingests raw academic conference data via EasyChair Excel exports and translates it into an interactive dashboard. The dashboard flags critical issues, calculates scientific quality scores, and provides tools to drill down into specific reviewers and papers.

## Technology Stack

The project relies on a full-stack architecture running locally.

Backend:
- Node.js and Express.js handle the REST API and serve the static frontend.
- PostgreSQL stores the relationships between papers, reviewers, bids, conflicts, and scores.
- Docker is used to run the PostgreSQL database.
- ExcelJS and SheetJS parse the multi-sheet EasyChair Excel files.
- Multer handles multipart/form-data for file uploads.

Frontend:
- Vanilla JavaScript manages client-side routing, API fetching, and DOM manipulation.
- HTML5 and Vanilla CSS3 handle layouts and custom styles.
- Chart.js generates data visualizations.
- Phosphor Icons provides SVG iconography.
- Google Fonts (Outfit) handles typography.

## Analytics and Metrics

The system tracks several metrics to audit the reviewing process.

Action Center Alerts flag the following issues:
- Conflict of Interest Violations when a reviewer is assigned to a paper they declared a conflict with.
- Missing Reviews for papers with fewer than 3 reviews.
- Missing Metareviews for debated papers (score variance > 1.0) lacking a conclusive metareview.
- Unresolved Debates for papers with high score variance but zero discussion comments.
- Expertise Mismatches for reviews assigned to members who share no common topics with the paper.
- Low Effort Reviewers with an average review length under 50 words.
- Low Bidding Satisfaction for reviewers whose assignments match less than 50% of their bids.

The Quality Scorecard grades the conference out of 100% across four dimensions. Deductions are calculated as a percentage of the total pool:
- Review Coverage checks if papers are receiving sufficient peer review.
- Conflict Integrity audits the fairness of the assignment process.
- Bidding Satisfaction measures reviewer workload fairness.
- Discussion Health measures the depth of academic discourse.

The Academic Quality Profile maps the conference data against international scientific standards:
- Selectivity calculates the Acceptance Rate and categorizes the conference against CORE A/A* (<25%) and CORE B (25%-35%) baselines.
- Review Rigor measures the percentage of submissions that meet the European baseline of having 3 or more independent external reviews.
- Internationalization evaluates geographic diversity to classify the Program Committee according to GII-GRIN-SCIE definitions.
- Thematic Competence identifies expertise gaps by mapping submitted topics against PC member specializations.

Reviewer Calibration compares individual scores against the average score a paper received from others. Negative values indicate a harsh reviewer, while positive values indicate a lenient reviewer.

## Setup & Installation

### Prerequisites
- [Docker](https://www.docker.com/) and Docker Compose (to run the PostgreSQL database)
- [Node.js](https://nodejs.org/) (v16+ recommended)

### 1. Start the Database
The project includes a `docker-compose.yml` file to quickly spin up a PostgreSQL instance.
```bash
docker-compose up -d
```

### 2. Install Backend Dependencies
```bash
cd backend
npm install
```

### 3. Run the Server
```bash
npm run dev
```
The application will be available at `http://localhost:3000`.

## Usage

When the backend server starts, it initializes the database schema (and drops existing tables to ensure a clean state).

Users can upload an EasyChair Excel file through the dashboard either by clicking the **"Import Data"** button or by simply **dragging and dropping** the Excel file anywhere on the dashboard. The backend parses the sheets (Submissions, PC, Reviews, Bids, Conflicts) and populates the database. 

The dashboard provides an Action Center where users can click on alerts to filter the Explorer tables. Clicking on specific papers or reviewers opens a modal with review texts, scores, and bidding statuses. Table views can be exported to CSV.
