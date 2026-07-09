# ConfQual - Conference Quality Proof-of-Concept

ConfQual is a decision-support analytics dashboard designed for academic Program Chairs. It parses raw conference data (e.g., EasyChair exports) to audit the scientific review process, flag critical issues, and calculate scientific quality scores.

## Technology Stack

The project relies on a full-stack architecture running locally:

*   **Backend:** Node.js and Express.js handle the REST API and serve the static frontend.
*   **Database:** PostgreSQL stores the normalized schema (papers, reviewers, reviews, comments).
*   **Data Parsing:** `exceljs` robustly parses complex `.xlsx` datasets, resolving formula errors and handling raw values.
*   **Frontend:** Vanilla JavaScript, HTML5, and Vanilla CSS3 ensure high performance without heavy client-side frameworks. Google Fonts (Outfit) and Phosphor Icons are used for UI aesthetics.
*   **Infrastructure:** Docker is used to run the PostgreSQL database locally.

## Core Features & Analytics

The dashboard is split into several core analytical modules:

### 1. Action Center (System Analytics)
Provides an overview of the conference's metrics and flags urgent administrative issues:
*   **COI Violations:** Flags instances where a reviewer was assigned to a paper despite a registered Conflict of Interest.
*   **Missing Meta-Reviews:** Highlights papers lacking a final decision metareview.
*   **Expertise Mismatches:** Flags potential misalignments between a reviewer's declared topics and their assigned paper's topics using fuzzy string matching.

### 2. Paper Explorer
Investigates individual submissions to identify controversial or neglected papers.
*   Tracks Average Score, Score Variance, and Total Discussion Comments.
*   Features custom filters for **High Variance (>1.0)**, **High Agreement (<0.2)**, **Unanimous Rejects** (Avg <= -1.5), and **Unanimous Accepts** (Avg >= 1.5).

### 3. Reviewer Explorer
Evaluates the performance and strictness of the Program Committee.
*   Tracks Total Reviews, Average Word Count, and Total Comments.
*   Calculates the **Reviewer Calibration Index**, comparing a reviewer's average score against the peer average for the exact same papers to identify harsh or lenient reviewers.

### 4. Review Submissions Timeline
A temporal view of the review process tracking when reviews are submitted.
*   Tracks submission timestamps and scores.
*   Filters available for **High Scores (>= 2)** and **Low Scores (<= -2)** based on a -3 to +3 grading scale.

### 5. Quality Profile
Evaluates the conference against broader academic standards (e.g., CORE/GII-GRIN-SCIE).
*   Calculates the true **Acceptance Rate**, strictly excluding withdrawn or desk-rejected papers (`is_deleted=true`) to maintain statistical integrity.

## Scripts & Utilities

*   **Data Anonymization Pipeline:** Includes a Node.js script (`scripts/anonymizeData.js`) that safely masks names and emails in the raw dataset while maintaining relational integrity.
*   **Robust Importer:** The `importer/` module is capable of intelligently tracking sub-reviewer delegations across columns.

## Setup & Installation

### Prerequisites
- [Docker](https://www.docker.com/) and Docker Compose (to run the PostgreSQL database)
- [Node.js](https://nodejs.org/) (v16+ recommended)

### 1. Start the Database
The project includes a `docker-compose.yml` file to quickly spin up a PostgreSQL instance.
```bash
docker-compose up -d
```

### 2. Install Dependencies
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
1.  Upon starting, the server initializes the database schema (running `database/schema.sql`).
2.  Use the included test scripts or the web UI to import `.xlsx` conference datasets.
3.  The dashboard will automatically generate actionable insights and analytics.
