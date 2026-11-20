# Phase 1 checkpoint — 2026-11-10

## Resume update — 2026-11-20 (latest)

The hosted Supabase Auth work now includes an operator-supervised setup and
recovery flow. Privileged requests require AAL2, signed TOTP authentication,
and the active Supabase session's factor ID to match the exact factor approved
in current user metadata. The database lookup uses the base connection role
outside workspace-scoped transactions; `DATABASE_URL` must target the same
Supabase project as `SUPABASE_URL`. Viewers can complete an authorized setup,
and recovery clears approval even if the lost factor is already absent.

The full backend suite passed **256/256 tests with no skips** against a
disposable local PostgreSQL database. ESLint passed. jscpd reported 31 clones
and 2.45% duplicated lines, below the 5% limit. Knip remains advisory: one
unused dependency, 161 unused exports and four unused files. OSV-Scanner found
no issues in 434 npm and 9 Python packages. The hosted factor-binding path and
operator setup/recovery have not yet been exercised against the live Supabase
project. Phase 1 remains incomplete pending hosted acceptance, backup/recovery,
and home-server/offline criteria. No real conference data was used.

## Resume update — 2026-11-20

The synthetic hosted Supabase/Heroku sign-in, password reset, TOTP enrollment,
valid challenge and invalid-code rejection were verified earlier. A local
trusted setup and lost-factor workflow is now implemented but is not deployed:
an operator authorizes setup after separate identity verification, supervises
enrollment, and approves the specific verified TOTP factor before data access.
The backend checks current Supabase user metadata for immediate approval
revocation. Migration 004 removes Supabase Data API access to application tables
and the workspace helper function; it was verified against a disposable local
PostgreSQL database, not applied to the hosted project.

The backend suite passed all 255 tests with no skips against a disposable local
PostgreSQL database. ESLint passed. jscpd reported 2.30%, under the 5% limit;
Knip findings remain advisory (1 unused dependency, 161 unused exports, 3
unused files); OSV-Scanner reported no known issues. These checks do not complete
the Phase 1 deployment, recovery, backup-key, or home-server/offline acceptance
criteria. No real conference data was used.

## Resume update — 2026-11-19

The owner confirmed hosted Supabase Auth as the Phase 1 target. Home-server,
self-hosted authentication and offline acceptance are deferred until the home
server is set up. The current development environment has an HTTPS Supabase URL,
publishable key and database URL configured; only presence and URL scheme were
checked, not provider settings or production credentials. The recovery flow uses
`/reset-password.html`; the final deployed origin still needs to be allowlisted
in Supabase Auth. The backend suite passed 251 tests, with three skipped and no
failures, against the local test database. `git diff --check` passed.

Next hosted-auth acceptance work: verify the real project's Auth, MFA, email and
URL configuration without exposing credentials. In particular, confirm public
sign-up is disabled at the provider: ConfQual intentionally has no public signup
page, and a new authenticated user is bootstrapped as admin of a private
workspace. Choose a trusted first-factor provisioning and lost-factor recovery
process, then exercise those flows using synthetic accounts. Do not use real
participant data until the remaining Phase 1 security and deployment gates pass.

Hosted Supabase / Heroku synthetic smoke test: the owner confirmed public
sign-up is disabled, the recovery email opened the deployed reset page, a new
password was accepted, and sign-in succeeded. After commit `7cc7cea` was
deployed, the owner enrolled TOTP and reached the account. Browser checks
confirmed `/mfa.html` is served and redirects a signed-out visitor to login, and
that the reset page hides password/MFA forms without a valid link. The owner
then signed out and back in and confirmed a fresh MFA challenge was required
and accepted. The owner also tried multiple incorrect codes; none granted
access. This completes the hosted authentication smoke test for this synthetic
account. It does not establish trusted first-factor provisioning, lost-factor
recovery, or readiness for real participant data.

## Resume update — 2026-11-11

The interrupted reviewer-edition anonymization fix and privileged MFA flow
have been reviewed and tested. A synthetic local browser test covered TOTP
enrollment, AAL1 denial, AAL2 access, wrong codes, logout and a fresh challenge.
Synthetic provider invitation and recovery links were single-use and rejected
after their timestamps were aged beyond the configured expiry. A password-reset
UI was then added and tested in a synthetic browser: enrolled users must pass
TOTP, the old password and used link were rejected, and the new password still
required MFA. Trusted first-factor provisioning, lost-factor recovery, and
production provider settings remain open. The exact deployment reset URL must
be allowlisted in Supabase Auth.

Escaping was added to several imported-content views, including projector,
awards, quality-profile and reviewer-bid views. Proxy headers are now ignored
unless a trusted loopback proxy is explicitly configured. Migration 003 was
applied twice against both old and fresh disposable schemas, and an integration
test verified retained audit events after grant and workspace deletion.

The resumed full test run passed 248 tests with two gated integration tests
skipped; those two passed separately. This full run predates the subsequent
proxy-trust, password-recovery and database-diagnostic changes, which were
checked separately. The focused post-change run passed 12 tests, lint and
`git diff --check`; a synthetic browser also verified the password-reset flow.
The full-schema synthetic restore rehearsal is recorded in
`docs/PHASE_1_BACKUP_RECOVERY.md`. Four pre-existing model duplicates were
confirmed identical and moved intact to
`backend/models/confqual-duplicate-quarantine-20261111/`; the model verifier
then passed. A further synthetic encrypted restore verified
MFA-authenticated PDF generation and cross-workspace denial using installed
system Chrome via `PUPPETEER_EXECUTABLE_PATH`; Puppeteer's expected bundled
Chrome was unavailable locally. The restore did not verify independent key
retrieval, remote copies or recovery targets.
The database diagnostic now uses the application's TLS configuration instead of
unconditionally disabling certificate checks. The trial Supabase and PostgreSQL
services were stopped after verification; the unrelated Docker project was left
untouched.

The remainder of this checkpoint records the earlier pause and may describe
work that the resume update above has since completed.

Work paused at the user's request. All changes are uncommitted. Preserve the
existing untracked roadmap, `skills/`, and `tests/`; they predate this work.
Do not use real participant data yet.

## Completed and checked before the pause

- Removed automatic claiming of legacy workspace data, isolated dashboard cache
  keys by workspace, added scoped read-only support grants and audit records,
  localized browser assets, tightened logging and upload cleanup, and added
  direct-record authorization checks. Support audit rows now survive deletion
  of their grant or workspace; retention and privileged retrieval remain open.
- The broader synthetic-database suite passed 241 tests, with two intentionally
  gated integration tests skipped. Both gated tests also passed separately on
  a disposable database. This run occurred **before the unfinished MFA edits**.
  Lint and `git diff --check` passed before the final interrupted work;
  `git diff --check` also passed at the checkpoint.
- A local synthetic Supabase trial using CLI 3.1.0 rejected invalid credentials
  and invalid tokens, allowed a signed-in user to access the conferences API,
  rejected token replay after logout, and reached AAL2 with TOTP enabled. The
  test account and its workspace were deleted. This was not an offline network
  capture, recovery test, or proof of application-level MFA enforcement.
- A limited synthetic database backup/restore rehearsal passed counts and a
  foreign key check. It did not verify the application, authenticated
  encryption, independent key retrieval, off-site storage, or recovery targets.
- `QUALITY_BASELINE.md` records scanner results. Gitleaks identified a
  credential-like value in ignored `backend/.env`; its validity and exposure
  are unknown. Assess privately and rotate/revoke if warranted; do not print it.
- CI was updated to apply migration 002 and enable the direct-ID and support
  integration tests. GitHub execution and branch protection remain unverified.

## Earlier interrupted work — resolved locally; hosted checks remain open

The MFA implementation, trusted setup/recovery workflow, and related tests
described above were finished and verified locally after this interruption.
The hosted factor-binding path and operator recovery still need acceptance
against the configured Supabase project before real data is used.

The `getReviewerDetails` edition-anonymization fix was also completed and has
a regression test in `backend/tests/reviewerAnonymizationEdition.test.js`.

Support audit currently records successful access at API-area granularity; it
does not record denied attempts, and an already authorized request can finish
after revocation. Decide whether further audit detail is required. Existing
databases that applied the earlier uncommitted form of migration 002 still have
cascading audit foreign keys; the amended migration applies only on fresh
databases and an upgrade migration is needed if such a database is retained.

## Local environment and next steps

The isolated Supabase trial and disposable PostgreSQL server were stopped at
the checkpoint. Docker Desktop was started for the trial; an unrelated local
Supabase project was already running after Docker started and was not stopped.
The trial's temporary setup is under `/private/tmp/confqual-local-auth-trial-2`;
its `status.env` contains local-only credentials and must not be published.
Disposable PostgreSQL data remains under `/private/tmp/confqual-test-pg.G1z3hh`.

The Phase 1 documents under `docs/`, including the support, local-auth,
security, deployment and backup guides, are ignored by Git and need explicit
inclusion if committed. The home-server deployment, private networking, offline
traffic capture, retention decisions and full isolated recovery drill remain
pending. Finish local authorization, MFA, privacy and quality checks first.
