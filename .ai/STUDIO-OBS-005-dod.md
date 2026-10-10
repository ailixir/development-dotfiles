# STUDIO-OBS-005 development self-assessment

This is the developer's review handoff, not an independent QA verdict. Source of checklist: `.aiox-core/product/checklists/story-dod-checklist.md`.

1. Requirements
   - [x] AC-1: production locked current source/configuration snapshot, authored-source policy, exact source selection/materialization, server-issued obligations and cumulative dependency admission implemented.
   - [x] AC-2: positive model projection and actual provider HTTP byte privacy verified; authored nonsecret canaries allowed, resolved saved/secret/runtime canaries excluded.
   - [x] AC-3: separate typed guided gateway, bounded reservations/repairs, durable single-send attempts, schema pins, reported thought/tool usage and immutable late accounting implemented. Existing FULL/PATCH remains separate.
   - [x] AC-4: stale identity checks precede server authority construction; real bridge admission/dispatch, immutable obligation association and mandatory deterministic completion implemented. Joined lost-result/restart scenario records one submit even after repeated model selection.
   - [x] AC-5: source and observed questions, immutable original meanings, public answer/restart/fresh correspondence and both independently observed field choices verified.
   - [x] AC-6: controlled provider HTTP, actual PostgreSQL and authenticated runner/Chromium evidence, semantic mutation cases, strict wire checks, and both-provider no-runtime-LLM oracles executed.

2. Coding standards and structure
   - [x] Java 21/Spring/JDBC and existing package/data boundaries retained; no new dependency.
   - [x] Closed schemas, typed projection, role/owner/fence checks, bounded provider input, strict raw-body validation, safe failure codes and immutable database constraints implemented.
   - [x] Scoped Checkstyle and Google Java Format checks pass for all 41 owned Java files; `git diff --check` passes. No global formatting or guard exclusions.
   - [x] Inline transaction/authority notes and source/session README document non-obvious behavior.

3. Testing
   - [x] Required unit, migration/race/direct-SQL, production composition, HTTP/provider and browser integration tests implemented.
   - [x] Final affected correction run: 200 tests, 199 pass, one explicitly unavailable live-provider skip, zero failures. Includes all Guided tests, legacy gateway, credential/config, no-runtime and readiness tests.
   - [x] Broad regression evidence retained honestly: 1726 tests, one stale V31 foundation expectation failure, 19 skips; separate cross-replica 2/2 pass. The foundation fixture now targets V31; both its corrected suite and independent fresh V32 migration suite pass in the correction run. No passing final-source unfiltered broad run is claimed.
   - [x] Runner: 1269 unit passes/29 existing skips and 273 browser fixture passes/10 existing skips; unchanged worker's 236 files match closed OBS-004 and final build.
   - [x] Coverage gate passes from preserved broad/cross-replica plus current affected execution data, using current class identities: overall 88.06%, guided translation 90.31%; all existing package thresholds unchanged. Exact data/method/logs archived.

4. Functionality and verification
   - [x] Actual authenticated planning/public-answer requests drive a real worker/Chromium against a controlled application and independently recorded receipts. This is automated API/browser execution, not a claimed manual UI inspection.
   - [x] Source drift, stale tuples, wrong semantic input/target, duplicate effect, restarts, unsupported responses, malformed repair, late/unknown usage, overbudget thoughts, missing declarations and private-value canaries exercised.
   - [N/A] Frontend UX: no frontend change in this story.

5. Story administration
   - [x] Implementation tasks and File List updated; accepted architecture/model-interface refinements and historical NO-GO are retained.
   - [x] Development record, source/build/worker manifests, exact result archives, decision log and this checklist completed.
   - [ ] Independent QA remains pending; story is InReview, not Done. Coordinator owns review dispatch and lifecycle verification.

6. Dependencies, build and configuration
   - [x] Backend assemble, SpotBugs, migration parity, anti-regression and Testcontainers alignment pass; runner build/type-check/lint/pins pass.
   - [x] New opt-in translation settings, controller origin, policy allowlists and optional verification documented; production composition tests cover enabled/disabled wiring.
   - [N/A] No added dependencies or new dependency vulnerability claim.
   - [x] CodeRabbit availability checked: unavailable, no PASS invented; independent review is the configured fallback.

7. Documentation and limitations
   - [x] Translation design, source/session README, schemas/output contract, additive OpenAPI and structural checker updated. Contract checks: v1 124 cases/109 examples; v2 219 cases/57 examples/31 schemas/6 vectors; OBS-005 26 additional fixtures.
   - [x] Controlled default flow records eight provider calls (one source plan, seven next-action selections including clarification and repeated-selection recovery), zero optional verification, zero repair, 124722 reserved input and 16384 reserved output; five actions and one independent submit. These are protocol integration measurements, not live-model cost/token/accuracy benchmarks.
   - [x] Account connection OBS-007 and publication OBS-006 remain explicit later fail-closed boundaries. Live provider credentials/corpus were unavailable and evaluation is skipped. Local pin checker does not assert a container image/Chromium build; actual local Chromium was exercised. No arbitrary-English guarantee, universal secret detection, real-model benchmark, production deployment or QA approval is claimed.

All applicable development obligations are addressed for independent review. No commit, push, deployment, budget increase or closed-story evidence mutation was performed. Whole-wave USD500 ceiling is retained; actual spend telemetry is unavailable.

## QA remediation R1 — 2026-10-09

The preceding checklist is the historical initial development self-assessment. Independent QA subsequently returned FAIL for SEC-001, REL-001, REL-002 and TEST-001. That verdict is retained; this section records the developer's remediation handoff, not QA approval.

- [x] Inventoried all four high findings and read actual failing probes; recorded design and obtained independent architecture approval with mandatory conditions at `.ai/STUDIO-OBS-005-fix-design-review-r1.json`.
- [x] SEC-001 exact chosen use, richer immutable meanings, coordinate-keyed re-question refusal and complete schema pins implemented; both actual destination choices and adversarial unused-reference rejection pass.
- [x] REL-001 durable stages and real scanner recovery implemented; six actual interruption windows, callback/metadata acknowledgement, repeated READY plans and direct-route/pin/ambient guards pass.
- [x] REL-002 atomic accounting/reserve/claim correction implemented; receipt races, combined input/output/proposal refusal, terminal and pin-error persistence pass. Numeric thought/tool/cache rules retained.
- [x] TEST-001 frozen hostile current-page corpus, typed malicious reply oracles and actual browser wrong-effect receipts added; opt-in harness shares cases and explicitly skips unavailable live execution.
- [x] Full backend sweep executed: 1755 tests, 1735 passes, one retry-fixture wall timeout, 19 skips; cross-replica 2/2 passes. Retry test passed unchanged at3.723s; a fixture-only20s allowance preserves exact three-call/three-attempt assertions and the full legacy gateway suite passes24/24. Original broad FAIL retained; no unfiltered final PASS claim.
- [x] Current R1 coverage/static/build gates pass with exact current-source execution data:88.47% overall/92.67% translation; no thresholds lowered. All32 new joined cases, nine PG persistence cases,22 raw provider privacy tests and5+8 ordinary-execution guards pass.
- [x] Scoped41-file style checks and42 OBS-005 structural cases pass. Current236-file worker bytes match previous tested2d44b410e04a12af930b6f2ecd20a7d4ecefeb27a4e4596307312e8d16c9688b; prior unchanged runner evidence reused explicitly.
- [x] Runtime source/schemas and production limits are frozen; only documentation and the named test's wall allowance differ from the full-test source snapshot. Exact artifacts and provenance are recorded under `docs/qa/evidence/STUDIO-OBS-005/fixes-r1/`.
- [ ] Root apply_qa_fixes verification, executor InReview metadata handoff and independent QA re-review remain pending. Story stays InProgress. No Done or QA Results/gate edit.

All assigned remediation implementation work is complete for coordinator verification. Remaining review is independent; CodeRabbit/live provider remain unavailable. No commit/push/deploy, runner/migration change, policy exception, production limit increase or extra user permission request.

## QA remediation R2 — 2026-10-09

R1 independently resolved SEC-001, REL-002 and TEST-001 but retained REL-001 for a genuine delayed older callback granting READY without current metadata delivery. Prior self-assessments and QA records remain historical.

- [x] Inventoried the complete current gate and read the actual twice-reproduced callback probe/evidence; documented the narrow acknowledgement remediation before implementation.
- [x] Removed callback-arrival inference. Exact pending/current identity and context are checked around actual metadata delivery; acknowledgement plus authentic initial evidence atomically establishes READY.
- [x] Private versioned proof protects READY fast paths. Old unproved READY refuses without browser reconstruction/replay; legitimate repetitions remain harmless. Lost replies retry the same metadata within three committed attempts and existing deadlines.
- [x] Four real delayed-callback timing/lost-response cases prove final metadata acknowledgement, one callback/source-plan call, stable context and one navigation. Old-READY, retry-bound, post-ACK allocation-change and all six prior scanner windows pass.
- [x] Complete affected group: 232 tests, 231 passes, one unavailable live-provider skip, no failures/errors; 40 actual joined cases. All independently resolved boundaries were retained and rerun.
- [x] Coverage/static/build/style/contracts pass: 88.52% overall and 92.89% translation, no reduced thresholds. Exact reuse verifies 616 unchanged production classes; changed service/record use current execution data. No historical broad FAIL relabelled.
- [x] Current tested/closed/R1 worker bytes all match across 236 files. Unchanged runner checks are reused with explicit provenance; current joined tests execute the same worker.
- [x] R2 records/source/build/worker manifests and raw results are separate under `fixes-r2/`; earlier QA and development archives remain byte-identical. No migration, runner, wire/schema, production budget or privacy-policy change.
- [ ] Coordinator apply_qa_fixes verification, later executor InReview metadata and independent R2 re-review remain pending. Story stays InProgress; QA Results and FAIL gate remain unchanged.
