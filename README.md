# ConfQual - Conference Quality Proof-of-Concept

ConfQual is a decision-support analytics dashboard designed for academic Program Chairs. It parses raw conference data (e.g., EasyChair exports) to audit the scientific review process, flag critical issues, and calculate scientific quality scores.

## Technology Stack

The project relies on a full-stack architecture running locally:

*   **Backend:** Node.js and Express.js handle the REST API and serve the static frontend.
*   **Database:** PostgreSQL (hosted on [Neon](https://neon.tech/)) stores the normalized schema (papers, reviewers, reviews, comments, settings, etc.).
*   **Data Parsing:** `exceljs` robustly parses complex `.xlsx` datasets, resolving formula errors and handling raw values.
*   **Frontend:** Vanilla JavaScript, HTML5, and Vanilla CSS3 ensure high performance without heavy client-side frameworks. Google Fonts (Outfit, Roboto Mono) and Phosphor Icons are used for UI aesthetics. Chart.js is used for data visualization.

## Core Features & Analytics

The dashboard is split into several core analytical modules:

### 1. System Analytics
Provides a macroscopic overview of the conference's health and distribution metrics:
*   **Health Scorecard:** Flags urgent administrative issues like Missing Reviews, Expertise Mismatches, and Low Bidding Satisfaction.
*   **Score & Decision Distributions:** Visualizes the breakdown of scores (-3 to +3) and decisions (Accept, Reject, Desk Reject, etc.) using Chart.js.
*   **Reviewer Workload & Top Debates:** Highlights the balance between Primary PC members and Sub-reviewers, and surfaces papers with the highest score variance.

### 2. Paper Explorer
Investigates individual submissions to identify controversial or neglected papers.
*   **Live Decision Editing:** Chairs can enable decision editing in Settings to temporarily override decisions (e.g., changing a "No Decision" to an "Accept") directly from the table.
*   **One-Click Summary (Projector Mode):** A clean, distraction-free view designed for PC meetings that shows the paper title, reviewer scores side-by-side, and specific review comments (Key Disagreements) to facilitate live discussions.
*   **Smart Filters:** Features custom filters for **Borderline (-0.5 to 0.5)**, **To Discuss (Borderline OR Spread > 2)**, **Unanimous Rejects**, and **Unanimous Accepts**.

### 3. Reviewer Explorer
Evaluates the performance and strictness of the Program Committee.
*   Tracks Total Reviews, Average Word Count, and Total Comments.
*   Calculates the **Reviewer Calibration Index**, comparing a reviewer's average score against the peer average for the exact same papers to identify harsh or lenient reviewers.

### 4. Quality Profile
Evaluates the conference against broader academic standards (e.g., CORE/GII-GRIN-SCIE).
*   **Selectivity:** Calculates the true Acceptance Rate, excluding withdrawn or desk-rejected papers.
*   **Internationalization:** Tracks geographic diversity and international representation percentage.
*   **Rigor & Thematic Competence:** Measures average reviews per paper and expert availability per topic.

### 5. Awards & Highlights
Automatically surfaces top-performing entities based on analytics:
*   Identifies the most thorough reviewers based on word count, activity, and calibration (Outstanding Reviewer Nominees).
*   Highlights top-rated papers for potential awards based on average score and spread (Best Paper Nominees).
*   Provides session planning insights by clustering accepted papers by topic.

### 6. Settings & Data Management
*   **Anonymization:** A toggle that safely masks names and emails in the dataset while maintaining relational integrity (useful for publishing datasets).
*   **Chair Permissions:** Toggle to unlock Live Decision Editing.
*   **Data Purge:** Allows purging the entire dataset to import a new conference dataset from a clean state.

## Setup & Installation

### Prerequisites
- [Node.js](https://nodejs.org/) (v16+ recommended)
- A [Neon](https://neon.tech/) PostgreSQL Database (or any PostgreSQL instance)

### 1. Configure the Environment
Create a `.env` file in the `backend/` directory and add your Neon Database Connection string:
```env
DATABASE_URL=postgres://user:password@endpoint.neon.tech/dbname?sslmode=require
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
1.  Upon starting, the server initializes the database schema (running `database/confqual_schema.sql`).
2.  Use the slide-out **Upload Dataset** drawer to drag and drop your `.xlsx` conference dataset.
3.  The backend `importer/` module will process papers, authors, bids, reviews, and comments.
4.  The dashboard will automatically generate actionable insights and analytics.
