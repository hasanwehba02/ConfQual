# Security and quality baseline — 2026-11-10

## Update — 2026-11-20

The full backend suite passed 256 tests with no skips against the disposable
local PostgreSQL database; ESLint passed. Current scans: Knip reported one
unused dependency, 161 unused exports and four unused files (advisory); jscpd
reported 31 clones and 2.45% duplicated lines (below the 5% threshold); and
OSV-Scanner reported no issues in 434 npm and 9 Python packages. Gitleaks' staged
check is run by the pre-commit hook after the intended Phase 1 files are staged.
The ignored `backend/.env` finding below remains unverified; do not print its
value.

Measured on Node 26.8.2 against the working tree based on `142c667`, including uncommitted changes. Findings are observations, not proof of release readiness. Owners below are responsible roles to assign, not named assignees.

| Check | Result | Owner and resolution |
| --- | --- | --- |
| Gitleaks 8.30.1, working directory | One redacted `generic-api-key` finding in ignored `backend/.env:2`. Its presence alone does not establish that it is valid or exposed. | Project/security owner: privately verify whether it is a real credential and whether it was exposed; rotate or revoke it if warranted. Never publish its value or the unredacted report. |
| Gitleaks, Git history | 313 commits scanned; no findings. Staged scan examined zero bytes because nothing was staged. | Project/security owner: maintain the staged redacted check and investigate future findings. A clean scan is not a guarantee that no secrets exist. |
| Knip 6.44.1 | One unused dependency and 163 unused exports reported; command exits 1. Some are demonstrably false positives: `@phosphor-icons/web` is dynamically resolved in `backend/app.js`, and controller exports are used in `backend/routes/analyticsRoutes.js`. | Backend maintainer: triage each remaining finding against actual runtime and test use, resolve true dead code and investigate tool recognition before considering a blocking gate. Do not delete code or suppress findings solely to pass. |
| jscpd 5.4.2 | 28 clones, 351 duplicated lines (2.45% of 14,336 lines across 145 JavaScript files); below the configured 5% threshold. Examples include importer pairs and production/test helper code. | Backend maintainer: review clones for meaningful maintenance risk and address opportunistically; retain intentional duplication where appropriate. |
| OSV-Scanner 2.7.0 | No issues reported for 434 npm and 9 Python packages from the lockfile and requirements file. This is a point-in-time scan, not a guarantee of safety. | Dependency maintainer: review future findings and apply separately reviewed fixes; rerun before release. |

Existing Lefthook pre-commit runs staged Gitleaks with redaction; pre-push runs Knip in advisory mode, jscpd and OSV-Scanner. Installed pre-commit and pre-push hooks invoke Lefthook. Independent GitHub Actions workflows exist for Gitleaks, Knip, jscpd, and OSV-Scanner; Knip is advisory in CI, while jscpd uses the 5% threshold and the OSV PR workflow enables failure on vulnerabilities. CI results and repository branch-protection settings were not checked in this local assessment. No thresholds, exclusions, dependencies, or hooks were changed.

Security-critical authorization and privacy failures block release regardless of these scanner results. Their assessment and resolution belong to the security and application owners; this baseline does not establish that those checks pass.

The main CI workflow now applies the support migration and enables the direct-ID
and support-access integration tests against its disposable PostgreSQL service.
The migration and tests were run locally, but the workflow's GitHub run and
branch protection have not yet been verified.
