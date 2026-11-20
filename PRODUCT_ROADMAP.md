# ConfQual product roadmap

Status: proposal for stakeholder review · 10 November 2026

## Vision

ConfQual will help research groups run conferences from submission through review, decision, and eventually the event itself. It should combine privacy, simple workflows, and evidence that helps chairs make informed decisions. Chairs retain responsibility for decisions; analytics must not recommend acceptance or rejection.

The first audience is the project stakeholder and professors in his research network. The product is initially free. The roadmap is a proposed order, not a delivery schedule; the stakeholder can challenge priorities and requirements before each phase is planned in detail.

## Current starting point

The application already imports conference data and offers review analytics, alerts, configurable thresholds, notes, cross-edition comparisons, and reviewer reports. It has workspace roles and uses Supabase authentication. It is not yet a complete submission and review system. Some pages load third-party assets. Neither the existing role model nor the existing deployment should be assumed to satisfy the privacy requirements below without verification.

## Product commitments

- Offer a service hosted on infrastructure operated by ConfQual and, later, an installation operated by the customer. Conference data stays within that installation and its explicitly approved backup storage; rented hosting is acceptable. Account identities, papers, author and reviewer names, reviews, comments, and analysis stay private. Avoid third-party cloud processing of conference data.
- Run sentiment analysis locally. Enable it by default with a conference-level option to disable it. Evaluate the existing model for usefulness, speed, resource usage, and offline operation before selecting it. Use a tested local fallback, identify its results, and notify the chair if both methods fail. Preserve existing results and permit retry.
- Support local-network operation without internet after installation, including authentication, imports, reviewing, analytics, and model inference. Email and updates may wait for connectivity.
- Limit support access to a customer-authorized scope and duration, using a revocable token and an access record. Design and document the difference between application permissions and the technical access of a hosted server operator.
- Use clear defaults and progressive configuration. Track decisions and thresholds, show underlying evidence, preserve raw scores, and avoid automatic paper decisions or assertions that reviewers are biased.
- Keep the existing MIT license in place for now; review ownership, contributor rights, existing license grants, and commercial licensing before any future change.

## Phase 1 — Private and reliable foundation

**Goal:** Make the existing analytics product suitable for carefully controlled use with confidential data.

**Current scope decision (2026-11-20):** Hosted Supabase Auth is the interim
acceptance target for synthetic hosted-auth checks. Home-server deployment,
self-hosted authentication, and offline acceptance are deferred until the home
server is set up; this deferral does not waive those Phase 1 finish criteria.
Phase 1 remains incomplete and real conference data is out of scope until the
remaining security, deployment, backup, and recovery criteria pass.

**Requirements and finish criteria:**

| ID | Required capability | Evidence required to finish |
|---|---|---|
| P1-01 | Document the data boundary for identities, content, files, analysis, logs, email, backups, support, and model installation. Choose a local authentication deployment. | A reviewed data-flow inventory names every external destination and its purpose. With internet blocked after installation, users can sign in and use existing core workflows. Captured application traffic demonstrates no unexpected external connection or confidential payload leaving the deployment. Email is tested separately as intentional external communication. |
| P1-02 | Harden authentication, sessions, and authorization; deny access unless explicitly permitted. | Automated checks cover invalid/expired sessions, logout, recovery, brute-force protection, cross-workspace requests, direct record identifiers, exports, reports, and error responses. Privileged accounts support stronger authentication; reset and invitation tokens expire and cannot be replayed. Browser/session protections match the selected authentication design, including CSRF defenses where cookies authorize writes. No credentials or sensitive records appear in ordinary logs. Existing-data migrations cannot let an arbitrary new account claim legacy conference data. |
| P1-03 | Make deployments and files private by default. | A documented Linux setup uses TLS for remote access, exposes only intended services, isolates database/storage, keeps secrets out of source control, and applies resource limits. Temporary upload/report files are removed after success and failure. Define retention for logs, backups, support records, and uploaded temporary data before confidential use. Third-party browser assets and runtime model downloads are removed from core operation. |
| P1-04 | Provide scoped, temporary, customer-authorized support access. | Grant, expiry, revocation, and out-of-scope denial are demonstrated. Tokens are not placed in URLs or ordinary logs, and do not provide reusable unrestricted customer login. Every support session is attributable and recorded without copying confidential content into the audit record. Read-only is the default; any write access requires a distinct authorized scope. |
| P1-05 | Back up and recover the database, files, configuration, and required local model assets. Protect backup keys separately. | Restore an encrypted backup into a clean isolated environment and verify record counts, relationships, file hashes, authentication, and representative reports. Record actual recovery time and recovered-data age against agreed recovery targets. Verify that the team can obtain the keys during recovery. |
| P1-06 | Establish an honest security and quality baseline using existing tools. | Inventory existing hooks and checks; assess Gitleaks, Knip, jscpd, OSV-Scanner, and independent CI checks. Record current findings and tool limitations rather than deleting code or hiding findings to achieve green output. Security-critical authorization/privacy failures block release. Document ownership and resolution for remaining findings. |

**Scope boundary:** This phase secures current capabilities. New conference roles and submission permissions are designed and tested in Phases 3–4. Successful local testing alone does not approve public hosting.

**Entry decisions:** Authentication approach, threat model, backup location, recovery targets, and the intended home-server access model must be documented before their corresponding work is accepted.

**Depends on:** Existing app and schema assessment. Validate locally on a home server with synthetic data first; decide later whether the stakeholder and colleagues receive private access. The laptop's final specifications and deployment setup remain open.

## Phase 2 — Imports and trustworthy analytics

**Goal:** Make existing conference data useful and understandable, including migration from other systems.

**Requirements and finish criteria:**

| ID | Required capability | Evidence required to finish |
|---|---|---|
| P2-01 | Publish a supported-format matrix with source versions, expected sheets/columns, file limits, and representative fixtures. | Every advertised adapter reconciles expected imported, rejected, and skipped counts and relationships. Fixtures include missing/renamed columns, mixed score scales, blank cells, non-English text, malformed files, and missing linked records. Unknown formats receive an actionable mapping path rather than a success claim. |
| P2-02 | Provide guided mapping, preview, typed custom fields, explicit exclusions, and reusable mappings. | A chair imports an unfamiliar supported file type through the UI, resolves ambiguous mappings, previews values/errors, chooses field visibility, and confirms exclusions before saving. Custom fields can be viewed, filtered, and exported only by permitted roles. Imported content cannot execute scripts or spreadsheet formulas through display/export. File parsing enforces size, expansion, and processing limits, with success/failure cleanup, so malformed uploads cannot exhaust the server. |
| P2-03 | Make imports recoverable, scoped, and repeatable. | Duplicate records and repeat uploads follow a documented merge/skip/reject policy. A failed or cancelled import leaves no unexplained partial dataset. Re-running a completed import does not silently multiply records. Progress survives refresh; restart behavior, provenance, validation errors, and a final reconciliation report are demonstrated. |
| P2-04 | Make analytics reproducible and uncertainty visible. | Golden fixtures verify raw/normalized scores, missing-data handling, small-sample behavior, alert boundaries, and cross-edition comparisons. Each indicator explains its inputs, scope, and limits; missing information is not presented as zero or proof of bias. Original scores remain available. |
| P2-05 | Give authorized conference chairs control over shared flag settings and an action queue. | Create/change/disable rules in the UI; verify boundary values, permissions, recalculation, and that all chairs receive the current configuration after refresh. History records old/new settings and actor/time. Assign/resolve/reopen flags without losing prior resolutions or incorrectly reusing them for a different underlying issue. |
| P2-06 | Evaluate and run local sentiment analysis with a local fallback and controlled retry. | A representative, privacy-safe evaluation documents language/domain coverage, quality, latency, and peak resource use on named hardware against targets agreed before implementation. Test primary success, primary failure/fallback success, both failing, and recovery. Store method/version with results, identify fallback output, preserve existing results on failure, notify the chair without blocking other work, and allow authorized retry without duplicate jobs. |

**Scope boundary:** Support declared formats and guided mapping for supported file types; arbitrary binary formats and perfect automatic interpretation are not promised. No automatic accept/reject recommendations or claims that sentiment proves reviewer bias.

**Entry decisions:** Agree supported adapters, merge semantics, upload limits, representative evaluation data, and model acceptance targets. Access to sensitive fields follows Phase 1 permissions until the richer role model is delivered.

**Depends on:** Phase 1 privacy and isolation. Obtain representative exports and stakeholder feedback without assuming every possible file can be automatically interpreted.

## Phase 3 — Conference setup, identities, and submission

**Goal:** Let a chair configure a conference and authors submit directly to ConfQual.

**Requirements and finish criteria:**

| ID | Required capability | Evidence required to finish |
|---|---|---|
| P3-01 | Configure conferences/tracks with templates, forms, time zones, deadlines, standard stages, and anonymity policies. | A chair configures two tracks with different forms/deadlines and previews each role with synthetic data. Deadline-boundary and time-zone checks pass; unsafe or contradictory visibility/stage settings are rejected. Required options have usable defaults. |
| P3-02 | Define a conference/track/paper permission matrix supporting multiple simultaneous roles, lead/assisting chairs, or equal chairs. | Automated tests exercise every defined permission across UI, API, file, search, report, and export paths. Conflicts override grants, including for the lead chair's own paper. Another eligible chair handles it; if none exists the system blocks the action and explains how to appoint one. Last-chair removal and self-escalation are prevented. |
| P3-03 | Support approved conference creators and open or invitation-only author submission. | An approved creator opens a conference; authors register/sign in locally and submit according to its policy. Invitations expire and cannot grant unintended roles. Unapproved users cannot create conferences, and users cannot view other authors' private submissions. |
| P3-04 | Manage authors/coauthors, metadata, revisions, withdrawals, and submission receipts. | Create/edit/withdraw within configured rules, retain versions and timestamps, and verify that locked fields and closed deadlines cannot be bypassed by API requests. Coauthor access and identity linking require a documented verification policy; importing an email address alone never grants account access. |
| P3-05 | Validate and protect submission files and anonymous views. | Enforce configured type/size limits, file version access, safe filenames, and private storage/downloads. Test spoofed types, traversal, unassigned access, and outdated file links. Blind views hide protected identities in API fields, filenames, custom fields, notifications, and exports. Document limits of automatic PDF anonymization and provide author guidance/chair checks. |
| P3-06 | Convert imported records into usable native workflows with provenance. | An imported submission is linked safely to verified accounts, missing required information is identified, and the chair can complete it and proceed without duplicate papers/participants. Existing analytics and historical editions remain correct after migration. |

**Scope boundary:** Standard configurable stages and existing participant concepts first; fully arbitrary roles and transitions are a later extension. Role-preview mode must not impersonate real users or expose protected production data.

**Entry decisions:** Stakeholder validates the role/permission matrix, author/coauthor identity rules, deadline behavior, and a representative multi-track workflow.

**Depends on:** Phases 1–2; actual stakeholder workflow and sample forms inform the detailed design.

## Phase 4 — Reviewer management and review

**Goal:** Manage reviewers, assignments, and reviews in ConfQual.

**Requirements and finish criteria:**

| ID | Required capability | Evidence required to finish |
|---|---|---|
| P4-01 | Support the existing chair, committee, senior-member, subreviewer, steering-chair, and author concepts with explicit permissions; settle meta-reviewer/area-chair needs. | Stakeholder reviews the role matrix. Tests verify each role and combinations of roles without assuming seniority grants unrestricted access. |
| P4-02 | Invite reviewers and record acceptance/decline, availability, expertise, bids, and workload. | Invitation expiry, resend, acceptance/decline, withdrawal of availability, and workload changes work. Manual assignments honor configured invitation/acceptance and capacity rules. Bids and profiles respect conference visibility. |
| P4-03 | Record declared and possible conflicts and prevent confirmed conflicted assignments. | Authors, reviewers, and authorized chairs can declare permitted conflicts. Confirmed conflicts block assignment and protected access even through direct requests. A later conflict revokes access; previously downloaded copies cannot be recalled and that limit is documented. Possible conflicts require a recorded chair resolution, not an automatic accusation. |
| P4-04 | Provide versioned review forms, drafts, autosave, submit/revise rules, and deadlines. | Reviewer completes a review, recovers a draft after disconnection, and receives an explicit save status. Concurrent edits do not silently overwrite work. Form changes preserve existing answers and score semantics; submission validates required fields and obeys stage/deadline permissions. |
| P4-05 | Provide configurable subreviewer approval and delegation limits per reviewer and per paper. | Test delegation disabled, approval pending/denied/accepted, limit boundaries, concurrent invitations, expiry/revocation, and conflicts. A subreviewer sees only authorized assigned content. The assigning reviewer and chairs see contributions as configured; the assigned reviewer owns the final review. No chain of delegation is allowed unless separately specified. |
| P4-06 | Manage missing reviews without autonomous reassignment. | Overdue status, configurable reminders, chair extensions, and chair reassignment work without duplicate reminders or lost history. Revoked reviewers cannot fetch the paper or private review work. Reassignment preserves attributed prior work under the configured visibility rules. |

**Scope boundary:** Manual assignment is required. Automatic matching is a later Phase 6 increment, with conflict and workload rules already established here. No automatic reassignment for missed deadlines.

**Entry decisions:** Approve review form versioning, delegation counting/approval rules, conflict rules, and stage visibility before accepting implementation.

**Depends on:** Phase 3 identity, tracks, files, and role enforcement.

## Phase 5 — Discussion, decisions, and chair collaboration

**Goal:** Complete the peer-review lifecycle with evidence and accountable decisions.

**Requirements and finish criteria:**

| ID | Required capability | Evidence required to finish |
|---|---|---|
| P5-01 | Run configurable discussion, rebuttal, meta-review, decision, and release stages. | A synthetic conference completes the entire lifecycle, including tracks with optional stages disabled. Transition checks enforce dates, prerequisites, and field visibility; reopening a stage leaves a history and does not silently unpublish information already released. |
| P5-02 | Enforce review/identity visibility throughout the lifecycle. | Tests cover single-blind, double-blind, and open policies, visibility before/after submitting one's review, subreviewers, conflicted chairs, and author/reviewer role combinations. No protected content leaks through feeds, search, email, preview, API, reports, or exports. |
| P5-03 | Help chairs examine evidence and collaborate without directing outcomes. | Chairs compare reviews, inspect source-linked flags, assign/resolve issues, add scoped notes, and record their own rationale. No generated acceptance/rejection recommendation is present. Concurrent edits return a visible conflict or preserve both changes; refresh shows the current shared state. |
| P5-04 | Prepare and release decisions safely, individually or in batches. | Preview matches the exact recipient-visible content. Confirming a batch sends/releases only selected authorized records. Partial delivery, retry, cancellation before release, and duplicate requests have documented behavior and do not duplicate decision releases. Any later correction is separately attributed and communicated. |
| P5-05 | Send minimal, previewable, queued notifications. | Templates expose only permitted variables; recipients and content follow permissions. Test network outage, recovery, retries, duplicate prevention, and delivery failures. The application works while email is unavailable; links require authentication and do not act as unrestricted data-access tokens. |
| P5-06 | Demonstrate usable and reliable core conference operation. | Stakeholder can complete agreed author/reviewer/chair scenarios on representative sample data. Record keyboard/form/error-state accessibility results and load-test measurements against pre-agreed conference size, concurrency, and response targets. Rehearse an interrupted service and recovery; authorization/privacy regressions block acceptance. |

**Scope boundary:** A supported conference can run its core review lifecycle after this phase. Candidate replacement status requires stakeholder validation, not simply feature presence. Live updates and arbitrary workflow engines remain later work.

**Entry decisions:** Approve decision release/correction rules, representative conference scenarios, performance targets, and permitted notification content.

**Depends on:** Phases 3–4. Completion makes the core review workflow a candidate EasyChair replacement for supported conference types.

## Phase 6 — Conference operations and portability

**Goal:** Extend ConfQual beyond review and make it practical to operate over multiple editions.

**Requirements and finish criteria:**

Phase 6 is delivered as separate increments. An increment can be accepted on its own; the whole phase is not marked complete while a committed increment is unfinished. Stakeholder-approved deferrals must be explicit in the roadmap.

| ID | Required capability | Evidence required to finish |
|---|---|---|
| P6-01 | Archive/reopen, export, apply retention/deletion, and reuse selected edition settings. | Archived records reject writes until authorized reopening. Exports include a documented schema, relationships, provenance, and file checksums. Deletion removes or schedules all relevant copies according to policy, including backup expiry and derived data; restore does not silently resurrect deleted records. Edition reuse copies selected settings or committee data only after an explicit preview. |
| P6-02 | Build program sessions and schedules. | Schedule accepted papers with session chairs, times, and rooms; detect overlapping presenter/session assignments; preview and export the program. Published output excludes confidential reviews and unpublished participant details. |
| P6-03 | Collect camera-ready versions and generate proceedings metadata. | Only eligible accepted submissions can provide required final files; validation and version history work. Named export formats are validated against agreed samples and their documented specifications. Publishing requires an authorized action and does not expose private submission history. |
| P6-04 | Add attendee registration; decide separately whether to support payments. | Registration supports agreed fields, capacity, confirmation, cancellation, and private attendee access. Payment work cannot start until provider/data-flow/refund decisions are approved; if adopted, verify payment status, retries, and refunds without storing card credentials. A deferred payment feature is explicitly labeled as deferred. |
| P6-05 | Package self-hosted installation, upgrades, backup, and recovery. | Demonstrate a fresh supported Linux installation, offline core operation after setup, and a customer-chosen upgrade from a prior release. Rehearse failed migration recovery with data and files intact; publish supported versions, configuration, minimum measured hardware, release notes, and rollback limits. |
| P6-06 | Add optional assignment assistance using established constraints. | Chairs can preview suggested assignments, inspect expertise/bid/workload inputs and unmet constraints, change suggestions, and explicitly apply them. Confirmed conflicts and hard capacity limits are never bypassed; infeasible assignments are explained. No external data service receives participant identities or paper content. |
| P6-07 | Evaluate fully custom roles/stages and live updates as later extensions. | Before implementation, approve a permission and transition model that retains conflict precedence and anonymity. If adopted, test equivalent core scenarios and unauthorized custom grants. Otherwise record these as deferred; they are not advertised as delivered. |

**Scope boundary:** Event operations, portability, and advanced configuration are distinct increments. Registration/payments, custom workflows, and external publication integrations require separate specifications rather than an undefined claim to handle every conference.

**Entry decisions:** Stakeholder prioritizes the increments and approves retention/backup expiry, publication permissions, export formats, event scenarios, and any external provider. Packaging may be brought forward if a customer needs self-hosting sooner, after applicable privacy and recovery gates pass.

**Depends on:** Core lifecycle in Phase 5. Scope and priority of event features require stakeholder feedback.

## How a phase is accepted

All phase requirements are **planned, not implemented or verified** by this document. Each requirement ID must link to implementation work and an acceptance record. Existing behavior receives credit only after it passes the same checks.

Before starting a phase, prepare its implementation specification: affected data/API/UI, permission and visibility matrix, migrations, failure handling, dependencies, test fixtures, acceptance targets, and recovery procedure. Resolve its entry decisions. Numeric targets for dataset size, concurrent users, response times, memory, model quality, and recovery must be agreed for named hardware before the relevant work is accepted; an unfilled target is a blocker, not a pass. Do not invent targets without measurements and stakeholder needs.

Every phase must also pass these common gates:

- **Traceability:** Every requirement has evidence, an owner, actual result, and a pass/fail status; include passed/failed/skipped checks. Skipped or unavailable checks do not count as passed.
- **Data safety:** Migration and recovery are rehearsed on disposable representative data; existing records and previously delivered features remain usable. New sensitive surfaces receive negative authorization and disclosure checks.
- **Quality:** Relevant automated tests, lint, security checks, keyboard operation, clear validation/save/error states, and agreed resource/load targets pass. Findings from audit tools are investigated, not suppressed to make a report green.
- **Operations:** Installation, configuration, retry/failure behavior, monitoring without confidential payloads, and support instructions are updated. Backups and audit records are covered by privacy/retention rules.
- **Acceptance:** Record a stakeholder demonstration or review against the agreed scenarios. Privacy breaches, broken conflict/anonymity enforcement, data loss, and unmet mandatory finish criteria block phase completion. Lower-risk findings may be tracked only if they do not contradict those criteria.
- **Scope changes:** Amend a requirement explicitly with its reason and stakeholder agreement before treating it as deferred. Never declare an incomplete phase finished because time ran out.

The home server begins with synthetic data and restricted access. Real-data use and internet exposure require the deployment/privacy gates for that use; a home test is not evidence that a rented production server has been secured. Progress is measured by accepted requirements, not a delivery date.

## Questions for the stakeholder

1. What are the actual roles, tracks, review stages, deadlines, and decision rules for your next conference? Is a separate area chair or meta-reviewer role necessary?
2. Which EasyChair exports and other formats must work first? Can you provide representative synthetic or anonymized examples and forms?
3. Which parts of running a conference take the most time, and which current analytics or proposed alerts would help?
4. Are the proposed privacy, anonymity, conflict, subreviewer, and support-access rules suitable for your conferences?
5. Should conference creation require operator approval initially? Who should participate in private testing on the home server?
6. Which program, proceedings, and registration capabilities are essential, and how should the phases be reordered?

## Open decisions

- Hosting and operational responsibilities, hardware sizing, home-server access, backup retention, and customer support procedures.
- Exact authentication deployment and account recovery; self-hosted Supabase is an option to evaluate.
- Real supported import formats and any limits for unknown formats or custom fields.
- Final model and fallback after offline, performance, and usefulness evaluation.
- Commercial model and future licensing; initially free. No dates or prices have been committed.
