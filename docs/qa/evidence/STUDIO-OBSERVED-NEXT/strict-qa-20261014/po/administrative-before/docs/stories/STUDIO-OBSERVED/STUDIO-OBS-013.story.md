# Story STUDIO-OBS-013 — Record the learning run: video, step offsets and seek for the guided first Run

| Field | Value |
|---|---|
| Story ID | STUDIO-OBS-013 |
| Status | **Done** |
| Epic | Studio observed authoring |
| Depends on | STUDIO-OBS-012A |
| Dependency notes | Parallel with OBS-012B and OBS-014 (no shared files with 012B; with 014 only the result3/session-view3 contract files — one contract owner sequences those edits, ADR-SC-005). OBS-015 depends on this story: the guided browser must be the recorded `BrowserHandle` the observed adapter needs for prefix replay. OBS-008 renders the video this story produces. |
| Source | docs/architecture/ADR-SC-005-single-path-observed-authoring.md (Consequences "Evidence: … for the first Run too"; placement map row OBS-013; "Order and parallelism") · UX panel 2026-10-09 ("guided worker records NO video today → OBS-013 must add recording + step offsets (actionTimings → seek)"; per-action seek buttons) · docs/specs/studio-observed-authoring/secret-login-design.md R3 §4 "Video" row, §10 rows OBS-007 (F-3 "OBS-013 later makes the same context recorded") and OBS-013 · docs/architecture/ADR-002-internal-contract-surface.md §11.6 (clock origin) · docs/runbooks/studio-guided-authoring.md (existing Range/206/expiry semantics) |
| Size | M |

executor: "dev"
quality_gate: "architect"
sdc_reviewer: "qa"
quality_gate_tools: [code-review, requirements-traceability, targeted-tests]

## Story

As a Studio author, I want the first Run — the one that learns my steps on the live page — to produce the same video proof as every later Run, with each step and action seekable, so that "From Checklist to Reality" is true from the very first Run and I can see what Studio actually did while it learned.

## Acceptance Criteria

Fact at HEAD (verified 2026-10-09): `grep -rln "video\|recording" studio-runner/src/guided` → 0; the guided worker records nothing; OBS-006's runbook defers the first guided recording; replay video exists through `recording.ts`/`evidenceUpload.ts`/`manifest.ts` with authenticated Range/206 reads (OBS-006 QA record).

1. **AC-1 — Recorded guided browser.** The guided browser (`launchGuidedBrowser` / `guidedBrowser.ts`) launches the OBS-007 persistent context (pre-written `Preferences`, session scratch) **as a recorded context** reusing `run/recording.ts`, `run/evidenceUpload.ts` and `run/manifest.ts` — no second recording implementation. The `BrowserHandle` the guided mode exposes is the same recorded handle type the observed replay adapter consumes (`observedReplayAdapter.ts`), proven by a test that runs the observed adapter against a guided-mode handle (OBS-015's prefix replay depends on this). Recording start/stop is bound to the session: one recording per guided session, stopped at `FINALIZING`/terminal state, never on finalize (finalize performs no browser action, OBS-006 AC-4). Security invariants from OBS-007 hold unchanged: password fills show masked dots only; `knownSecrets`/inventory wiping and the profile canary scan still pass with recording on. [ADR-SC-005 placement map row OBS-013; design R3 §4 "Video", §10 F-3 row; OBS-006 AC-4]

2. **AC-2 — Step and action offsets on the guided timeline.** Every dispatched action and every step boundary is stamped against the recording's clock origin per ADR-002 §11.6 (the same origin replay uses), producing `actionTimings`/step offsets the UI can seek to (UX panel: "actionTimings → seek"; per-action seek buttons). Offsets for clarification waits and prefix-replayed steps (OBS-015) are representable without contract change (reserved fields named here, filled later). Offsets never embed observation text, labels or values — IDs and times only. [UX panel 2026-10-09; ADR-002 §11.6; ADR-SC-005 placement map row OBS-013]

3. **AC-3 — Upload and video route.** The recording and manifest are uploaded under a **guided session key** through the existing object-store path (`objectStore.ts`/`s3ObjectStore.ts`; Sonic in deployed environments, GA plan ED-03) and served by `GET /api/v1/studio/guided-sessions/{id}/video` with the **existing** Range/206/expiry semantics and CSI authorization of `ExecutionVideoController` (reuse, do not fork); retention follows `studio.execution.evidence-retention`; an expired or absent recording returns the existing unavailable envelope, never a fake success. The route is added to the one public OpenAPI (OBS-012A's document) with `StudioContractTest` op-count and `confinement.test.ts` `BASE_SHA256` re-anchored, old/new quoted. [ADR-SC-005 placement map row OBS-013, defaults "Public API"; ADR-002 (video 503 envelope); OBS-006 runbook]

4. **AC-4 — Evidence references in result3/session-view3.** `result` and `session-view` (v3) gain the evidence reference (video availability state, manifest reference, offsets) with the same honesty split OBS-006 established: learned-from-execution evidence (this story) is recorded separately from later replay-verified evidence and never conflated; SSE snapshots carry the reference. Generated bundles regenerated via `tools/build-studio-observed-schemas.cjs`; fixtures extended. **Contract ownership:** OBS-014 (`labelSource`) and OBS-015 (`relearnedFrom`) also edit these two schemas — one owner lands the three edits in sequence (ADR-SC-005 "Order and parallelism"). [ADR-SC-005 Consequences "Evidence"; OBS-006 AC-4; "Order and parallelism"]

   **AC-4 clarification — the "SSE snapshots carry the reference" clause is N/A (@po (Pax) 2026-10-13; record `docs/qa/evidence/STUDIO-OBSERVED-NEXT/po-ar2-notes.json` note 3; source architect AR-1 `ar-1-obs013.json` verifiedFacts and planCorrections). Clarifies applicability only; the AC-4 text above is unchanged.** No guided SSE stream exists. A grep for `SseEmitter|text/event-stream` over `backend/src/main` matches only `studio/sse/ExecutionEventsController` (`GET /api/v1/studio/executions/{id}/events`, the replay execution stream) plus its `sse/` helpers and `ChecksExceptionHandler`. Nothing in `studio/guided/**` emits SSE, and no `guided-sessions` operation in `docs/specs/studio/openapi.yaml` is an event stream (verified by @po at HEAD `734ad704f` plus the working tree). The guided first Run's state is read through `result` and `session-view`.

   a. **Applicability:** the clause "SSE snapshots carry the reference" has nothing to apply to for the guided session. QA records it as **N/A with this rationale**. It is not a FAIL and not a PASS. The same applies to the "SSE snapshots" words in T2.

   b. **What carries the obligation instead:** the evidence reference rides the `result` and `session-view` (v3) reads, which the rest of AC-4 already requires, with the learned-from-execution vs replay-verified split unchanged.

   c. **Not created here:** this story does not add a guided SSE stream to satisfy the clause. Doing so would be a new public surface with no AC behind it.

   d. **Replay stream untouched:** the replay execution stream (`ExecutionEventsController`) is not in scope for this clause. The published plan's later Runs keep their existing replay video/evidence behaviour, which AC-6 guards as a regression.

   e. **Reopens if:** a guided SSE stream is added by any story before OBS-013 is Done. Then the clause applies to it again, and @po re-rules.

5. **AC-5 — Masked-dots disclosure for password fills.** The manifest/disclosure line states that password fills are rendered as masked dots (the password-only rule) and that a page later echoing a secret in plain text is not protected by video (design R3 §4 "Video" residual); the manual "masked dots only" inspection remains an OBS-009 gate (C-17). [design R3 §4 "Video"; §7 C-17]

6. **AC-6 — Proof.** Joined IT (real backend + PostgreSQL + runner guided mode + Chromium, as in `GuidedPublicationReplayIT`): a guided learn run on the OBS-007 login fixture yields video `AVAILABLE`, an authenticated 206 range read, one offset per step and per dispatched action, and a manifest with zero canary hits; the published plan then replays with the existing replay recording unchanged (regression: OBS-006 `GuidedPublicationReplayIT` video path); recording failure mid-session yields `UNAVAILABLE` evidence and a session that still reaches its terminal state (no fake video); runner fixtures tier `recording-coverage.test.ts` extended to the guided mode; `confinement.test.ts` still proves the sandbox and no `tracing`/`recordHar`/`screenshot` (OBS-007 AC-10 static test unchanged). [OBS-006 AC-7 precedent; design R3 §7 SEC-3; ADR-SC-005 "Tests"]

## Tasks / Subtasks

- [x] **T0 — Reconcile.** Confirm OBS-012A Done; read `recording.ts`/`evidenceUpload.ts`/`manifest.ts`/`ExecutionVideoController` seams; agree the contract-edit order with OBS-014/015 owners; @architect confirms the clock-origin binding (ADR-002 §11.6); root reconciles the File List.
- [x] **T1 — Runner (AC-1, AC-2, AC-5).** Recorded guided context on the OBS-007 persistent profile; `BrowserHandle` parity with the observed adapter; offsets per step/action; disclosure line; stop at terminal state.
- [x] **T2 — Backend (AC-3, AC-4).** Guided session evidence key, upload acknowledgement, video route reusing `ExecutionVideoController`, result3/session-view3 references, SSE snapshots, pins re-anchored.
- [x] **T3 — Proof (AC-6).** Joined IT, fixtures-tier extension, regressions; record counts and unavailable services honestly.
- [x] **T4 — Record and submit** to independent @qa; only QA can set Done.

## Dev Notes

- What exists: replay recording pipeline (`run/recording.ts`, `evidenceUpload.ts`, `manifest.ts`, `timeline.ts`, `objectStore.ts`, `s3ObjectStore.ts`), `ExecutionVideoController` with Range/206/expiry and CSI checks, `ExecutionVideoContractTest`, runner `test/fixtures-tier/recording-coverage.test.ts`. Guided browser launch is `launchGuidedBrowser` in `run/browser.ts`/`guidedBrowser.ts`, made a persistent context with `Preferences` by OBS-007 AC-11. No guided recording, no guided video route, no guided offsets.
- The guided worker is still a separate process until OBS-009 folds it into the one runner (ADR default); this story's recording must work in both the standalone guided worker and the folded mode — keep it behind the shared `BrowserHandle` abstraction, not the entrypoint.
- Clock origin: ADR-002 §11.6 defines the recording clock origin replay stamps against; the guided timeline must use the same origin so OBS-015's merged plan (prefix replayed, suffix learned) seeks consistently.
- Secrets: a recorded login shows masked dots only because the password-only rule fills only `type=password` controls (OBS-007 AC-5). Nothing here loosens that.
- Repository conventions as OBS-007; never mark an unavailable store (Sonic) as passed — local object store is the test target, Sonic is OBS-009/ED-03.

### Out of scope here

UI playback and per-action seek buttons (OBS-008). Manual video-masking gate and Sonic lifecycle (OBS-009; GA plan F-1/F-2 tracked in the GA plan). Prefix-replay offsets' population (OBS-015). Governance of what the recording may contain beyond OBS-007's masking (OBS-014 compliance approval covers page-metadata export; video retention acceptance is GA plan F-2).

## Testing

Runner: fixtures tier with real Chromium (`recording-coverage.test.ts` guided case; adapter-parity test), default tier for offsets/manifest; static sink test unchanged. Backend: `ExecutionVideoContractTest` extended for the guided route; joined IT per AC-6 on Testcontainers PostgreSQL with the OBS-007 fixture; `StudioContractTest`/`confinement.test.ts` pins re-anchored. Contract tool green after regeneration.

## CodeRabbit Integration

### Story Type Analysis

Primary: Feature/integration (runner + backend). Secondary: API contract (video route, result3). Complexity: medium.

### Specialized Agents

@dev owns execution; @architect provides the technical gate (clock origin, contract ownership); independent @qa owns the SDC verdict and Done transition; @ux-design-expert is consulted on the offsets shape OBS-008 needs.

### Quality Gates

- [x] Applicable pre-commit checks and focused review recorded.
- [x] Independent SDC QA review with requirement-to-evidence mapping.
- [ ] Any eventual PR/push is handed to @devops with verified gates.

### Self-Healing and Focus Areas

QA full review: three iterations, 30 minutes. Focus: no second recording implementation, masked-dots invariant intact, authorization reuse (no new unguarded route), honest unavailable states, contract ownership sequencing. Record an unavailable CodeRabbit tool and use the configured independent review fallback.

## File List

Original ownership proposal, reconciled against the lane ledgers in the final handoff below. Unused proposed names do not claim a source edit.

- `studio-runner/src/run/guidedBrowser.ts`, `browser.ts` (recorded guided context), `browserFactory.ts`, `recording.ts`, `evidenceUpload.ts`, `manifest.ts`, `timeline.ts`, `observedReplayAdapter.ts` (handle parity only)
- `studio-runner/src/guided/runtime.ts` (action/step offset stamping), `studio-runner/src/guided/evidence.ts` (new: session recording lifecycle, upload under the session key, evidence acknowledgement through the existing callback client — `transport.ts` itself is OBS-014's and is not edited here)
- `studio-runner/test/fixtures-tier/recording-coverage.test.ts`, `guided-recording.test.ts` (new), `studio-runner/test/guided/runtime.test.ts`, `evidence.test.ts` (new), `studio-runner/test/run/manifest.test.ts`
- `backend/src/main/java/com/citi/put/checks/studio/guided/evidence/GuidedSessionEvidenceService.java` (new: evidence key, offsets persistence in a dedicated table/column set, decided with @data-engineer at T0 — forward-only migration if needed), `GuidedSessionVideoController.java` (new, mapped under `/api/v1/studio/guided-sessions/{id}/video`, delegating to the `ExecutionVideoController` machinery), `GuidedSessionEvidenceRepository.java` (new)
- `backend/src/main/java/com/citi/put/checks/studio/evidence/**` (shared Range/206/expiry reuse; no fork)
- `backend/src/main/java/com/citi/put/checks/studio/guided/publication/GuidedPublicationResultProjector.java` (result3 evidence reference), `internal/ProgressReportService.java` (guided evidence callback)
- **Shared, contract-owner sequenced (ADR-SC-005):** `docs/specs/studio-observed-authoring/contracts/v3/result.schema.json`, `session-view.schema.json`, `fixtures.json`, `publication-fixtures.json`, generated bundles (gen), `docs/specs/studio/openapi.yaml` (video route), `studio-runner/test/run/confinement.test.ts` (pin), `backend/src/test/java/com/citi/put/checks/studio/StudioContractTest.java` (op-count) — edited only by the one contract owner shared with OBS-014/015, in sequence
- `backend/src/test/java/com/citi/put/checks/studio/evidence/ExecutionVideoContractTest.java`, `backend/src/test/java/com/citi/put/checks/studio/guided/publication/GuidedPublicationReplayIT.java` (regression), `backend/src/test/java/com/citi/put/checks/studio/guided/evidence/GuidedSessionVideoIT.java` (new)
- `docs/runbooks/studio-guided-authoring.md` (one-line correction of the "first guided recording deferred" sentence only; full runbook is OBS-010)
- `docs/stories/STUDIO-OBSERVED/STUDIO-OBS-013.story.md`

Not owned here: `frontend/src/**` (OBS-008); `GuidedSessionService.java`, `GuidedSessionController.java`, `GuidedContracts.java`, `studio-runner/src/guided/transport.ts`, `RateLimitClassifier`/policy (OBS-014 — parallel story, no shared edits); publication merge and `relearnedFrom` (OBS-015); `Dockerfile`/Helm/Sonic (OBS-009). If T0 finds that the session state machine must change for recording lifecycle (not expected: start/stop hang off existing state transitions), the coordinator sequences that single edit after OBS-014 rather than making the stories overlap.


**Actual shared strict-batch file additions/changes — final executor appendix.** Preserve every original proposal, lane ledger and historical File List above. This is the concrete 013/014 integration-batch delta; shared validation dependencies are not silently reassigned to one story. Every path exists and its exact final bytes are listed in `docs/qa/evidence/STUDIO-OBSERVED-NEXT/strict-qa-20261014/backend-remediation/final-executor-handoff/actual-file-inventory.json`.

backend:
- `backend/src/main/java/com/citi/put/checks/studio/evidence/ExecutionVideoException.java`
- `backend/src/main/java/com/citi/put/checks/studio/evidence/VideoObjectServer.java`
- `backend/src/test/java/com/citi/put/checks/studio/evidence/VideoObjectServerTest.java`
- `backend/src/test/java/com/citi/put/checks/studio/guided/GuidedRecordingMigrationIT.java`
- `backend/src/test/java/com/citi/put/checks/studio/guided/evidence/GuidedSessionEvidenceTest.java`
- `backend/src/test/java/com/citi/put/checks/studio/guided/evidence/GuidedSessionVideoIT.java`
- `backend/src/test/java/com/citi/put/checks/studio/guided/evidence/RecordedGuidedEvidenceProjectionTest.java`
- `backend/src/test/java/com/citi/put/checks/studio/guided/publication/GuidedPublicationReplayIT.java`
- `backend/src/test/java/com/citi/put/checks/studio/guided/translation/GuidedPlanningIntegrationTest.java`

runner:
- `studio-runner/src/guided/evidence.ts`
- `studio-runner/src/run/browser.ts`
- `studio-runner/src/run/guidedMain.ts`
- `studio-runner/src/run/guidedShutdown.ts`
- `studio-runner/src/run/recordingScratch.ts`
- `studio-runner/test/fixtures-tier/browser-profile-safety.test.ts`
- `studio-runner/test/fixtures-tier/guided-recording-kill.test.ts`
- `studio-runner/test/fixtures-tier/guided-recording.test.ts`
- `studio-runner/test/fixtures-tier/native-blank-surface-controls.test.ts`
- `studio-runner/test/fixtures-tier/nativeBlankVideo.ts`
- `studio-runner/test/fixtures-tier/observed-bootstrap-process-tree.test.ts`
- `studio-runner/test/fixtures-tier/observed-bootstrap-video.test.ts`
- `studio-runner/test/guided/evidence.test.ts`
- `studio-runner/test/guided/runtime.test.ts`
- `studio-runner/test/guided/transport.test.ts`
- `studio-runner/test/helpers/nativeBlankSurface.ts`
- `studio-runner/test/helpers/nativeControlReadiness.ts`
- `studio-runner/test/helpers/profileSafetyFixture.ts`
- `studio-runner/test/helpers/recordingScratchWorker.mjs`
- `studio-runner/test/nativeBlankSurface.test.ts`
- `studio-runner/test/nativeControlReadiness.test.ts`
- `studio-runner/test/profileSafetyFixture.test.ts`
- `studio-runner/test/run/recordingScratch.test.ts`

shared-document:
- `docs/specs/studio-observed-authoring/guided-data-flow.md`

Evidence-only manual mounted-worker harness: `docs/qa/evidence/STUDIO-OBSERVED-NEXT/strict-qa-20261014/backend-remediation/live-original-proofs/mounted-process-harness.cjs`; its logs/config-delta hashes and process proofs are evidence, not new product scope. Root/architecture/Quinn evidence artifacts are indexed separately. No frontend, frozen migration/schema, Docker/Helm or OBS-015 production edit is attributed to this strict appendix.

## PO Validation (2026-10-10) — single path

**Verdict: GO (9/10) — Status: Draft → Ready.** Report `.ai/STUDIO-OBS-013-po-validation-sp.json`. Validated by Pax (@po) against ADR-SC-005 (placement map row OBS-013; Consequences "Evidence … for the first Run too"; "Order and parallelism").

**10-point checklist:** 1–7, 9, 10 PASS; 8 (risks) PARTIAL — residuals are stated inside AC-5 and Dev Notes (standalone worker vs folded runner; recording failure ⇒ `UNAVAILABLE`), not as a named risk list.

**Anchors spot-checked at HEAD (working tree 2026-10-10):** `grep -rln "video\|recording" studio-runner/src/guided` → 0 (AC fact holds); `run/recording.ts`, `evidenceUpload.ts`, `manifest.ts`, `timeline.ts`, `objectStore.ts`, `s3ObjectStore.ts`, `observedReplayAdapter.ts`, `test/fixtures-tier/recording-coverage.test.ts` exist; `launchGuidedBrowser` is `run/browser.ts:464` (imported by `guidedMain.ts:5`); `ExecutionVideoController.java` carries the Range/206 path and `ExecutionVideoContractTest.java` exists; `studio.execution.evidence-retention` is `application.yml:261` (single source, `:266`); ADR-002 §11.6 clock origin exists; runbook `:3` still defers "first guided recording"; OBS-006 AC-4 wording matches.

**Should-fix (non-blocking, before T2):**
1. **Migration number.** The File List defers "forward-only migration if needed" to T0, but parallel OBS-014 already reserves `V19__guided_governance`. Two parallel stories must not both mint V19: @data-engineer/coordinator assign this story V20 or fold the offsets columns into `V14__guided_sessions` through OBS-012A before 012A closes. Record the decision in the Dev Agent Record.
2. **AC-2 reserved fields.** Name the reserved offset kinds at T1 (e.g. step / action / clarification-wait / prefix-replay) in the Dev Agent Record so OBS-015 fills, not invents, them.
3. Add a one-line Risks entry (recording in both standalone guided worker and folded runner; failure path never fakes video).

**GO conditions:** T0 agrees the result3/session-view3 edit order with the OBS-014/015 contract owner before any schema edit; migration number assigned before T2; only independent @qa sets Done.

## Dev Agent Record

### Lane B13 (backend), 2026-10-13 — historical checkpoints (superseded by final handoff)

Authority: architect ruling AR-1 (`docs/qa/evidence/STUDIO-OBSERVED-NEXT/ar-1-obs013.json`) and its addendum `ar-1-c1-deviations.json`. Ledger: `docs/qa/evidence/STUDIO-OBS-013/b13/ledger.json`.

- **T2 backend, written:** `studio/evidence/VideoObjectServer` is the key-based server extracted from `ExecutionVideoService`. It is not a fork: execution steps 1–3 are unchanged and call it. The `studio/guided/evidence/**` package holds the projection seam (`GuidedEvidenceProjection`, `NONE`), the R1-table projection on the DB clock, the V20 repository, key derivation, timing checks with backend step derivation, the `recording-evidence` internal route and service, `GET /api/v1/studio/guided-sessions/{id}/video`, and the configuration. The publication result projector uses the projection.
- **SC-1 verified, not triggered:** `stop()` never writes `document.owner`. Materialization and assignment `stop()` only set `live=false`. So the evidence service compares the materialized context without the `live` filter.
- **Queued for B14 (S3):** `GuidedSessionService` gets `installEvidence` plus the two `result()` literals. Patch: `docs/qa/evidence/STUDIO-OBS-013/b13/queued-B14-GuidedSessionService.patch`. After that hunk lands, B13 wires `installEvidence` in `GuidedEvidenceConfiguration`.
- **Blocker found (data lane / architect):** the V20 CHECK `recording_id ~ '^[A-Za-z0-9_-]{1,256}$'` is invalid in PostgreSQL, whose regex bounds max out at 255. Every insert fails. Seven inserting `GuidedSessionEvidenceTest` cases are red for this reason; the other 6 pass.
- **Runs (Gradle, under the lock):** run1 had 53 tests with 7 failed, all from the V20 regex. run2 had 40 tests with 0 failed: `ExecutionVideoContractTest` 21, timings 7, keys 4, projection 8. `GuidedSessionVideoIT` is written but was not run; it belongs to the root S1/S3 window.
- **Reserved offset kinds (PO SF-2):** `step`, `action`, `clarificationWait`, `prefixReplay`. OBS-013 emits only `action` (from the runner) and `step` (derived by the backend). The other two are refused on the callback until OBS-015.
- **Risks (PO SF-3):** recording must work in both the standalone guided worker and the folded runner (R13). A failed recording reports `FAILED` or `UNAVAILABLE` and never fakes `AVAILABLE`. An absent fact turns `UNAVAILABLE` once the DB clock passes `expires_at + settle-grace`.
- **S2 update:** C2a landed and V20's regex was fixed by the data lane. `ExecutionVideoContractTest` now has claimAdmission removed from its pins (callback count 4 → 3) and a strict same-`$ref` check across both video routes. run3, under the lock: 59 tests with 0 failed. That covers `ExecutionVideoContractTest` 21, the 6 `ExecutionVideoEvidenceIT` cases that use `expiredCodeFromContract`, `GuidedSessionEvidenceTest` 13/13, timings 7, keys 4 and projection 8.
- **F-1 (product bug, fixed):** `GuidedSessionVideoIT` failed in root's S1+S2 window. A same-key resend of `recording-evidence` returned the stored echo in jsonb key order, while the first response used request order. That breaks AR-1's "identical stored echo". Both paths now answer in canonical-v1 key order. run4, under the lock: `GuidedSessionVideoIT` 6/6, `GuidedSessionEvidenceTest` 13/13.
- **S3 wiring done:** `GuidedEvidenceConfiguration` installs the one projection into `GuidedSessionService` (B14's hunk) and into the publication projector. A new `GuidedSessionVideoIT` case shows `GuidedSessionService.result()` emitting a non-null `evidence.video` that validates `v3/result` (AVAILABLE, PROCESSING, UNAVAILABLE and FAILED). run5, under the lock: `GuidedSessionEvidenceTest` 13/13, `RecordedGuidedEvidenceProjectionTest` 8/8, `GuidedSessionVideoIT` 7/7.
- **Not in B13:** runner AC-1/AC-2/AC-5 (R13/R14); the AC-6 joined learn run (S3).

### Final executor handoff — 2026-10-14

Root recovered the interrupted session and independently reproduced the S4c identity `af26d1b1a2a31702f23715d5529fa194426709a4ce8b25e2eca2d42b7d959137` before any metadata edits. The earlier queued/blocker/not-run statements above are historical. B13 `qaFixTEST001.regression` and `s4bFlake`, R13 `qaFixSec001Tightening`, C1/C2 contract ledgers and the data-lane ledger carry the final implementation; source hashes and the independent JUnit recount are in `docs/qa/evidence/STUDIO-OBSERVED-NEXT/resume-20261014/s4c-reverification.json` and adjacent `reviewed-source-manifest.json`.

- T0: OBS-012A is Done/closed; AR-1 and `s0-plan-refresh.json` assigned recording, V20, clock origin and the sequential C1/C2 contract edits. OBS-015 remains outside this integration window.
- T1–T2: recorded guided browser, evidence lifecycle, shared object-store/range serving, action offsets and backend-derived step offsets are integrated. V20 and the `installEvidence` handoff are applied. Guided SSE is N/A under the PO AC-4 clarification; no stream is claimed.
- AC-3 contract pins: C1 `BASE_SHA256` changed from `f502160e0c7475eb5356d11c5644cea1b01e10b8d242ca747872b38b17e823e6` to `d40c744d924ceb3d90f1711d53c6d714105e95a37a85c54a0a270687cdf1608e`; operation count 38 → 39. Later OBS-014 C2a/C2b units re-anchored both consumers to current `afec6c04cdd5bcc19e42b83f83656a342165c5e04407e90a7206de0b40c46183` and 43 operations; their ledgers retain each measured intermediate pair.
- T3: final S4c `clean check` executed 2,084 tests, 0 failures/errors, 25 skips, with JaCoCo verification passed; runner unit 1,351 passed/29 skipped, fixtures 225 passed/9 skipped, deployment 313 passed. Skips are uncredited. The 40-case `GuidedPublicationReplayIT` includes the exact recorded-login video/206/timing/manifest oracle and the separate recorder-fault oracle. The fault uses the plain fixture because two secret-login observers in one worker conflict; it preserves all fault assertions, while the recorded login retains its separate secret-canary evidence. This deviation is submitted to independent QA, not represented as the original fixture choice.
- SEC-001: the probe page/video is discarded before the recorded app page. Architect-approved oracle A includes the 10% region caps and per-run chrome-page positive control; B only proves seek alignment. Fix-reverted runs fail A. R13 reports one unexplained pre-oracle CONTEXT_LOST under load; it remains a disclosed reliability concern, not a passed case.
- T4: submitted to independent QA after recording these final facts. CodeRabbit was unavailable; independent review is the configured fallback. No live provider, Sonic, manual masking or deployment proof is claimed.

**Actual File List reconciliation.** The B13 `filesCreated`/`filesModified` and R13 `fileList` entries are the exact lane inventory (evidence-only paths excluded from production scope). Additional actual files beyond the proposal are `studio-runner/src/run/objectStoreFactory.ts`, `childRuntime.ts`, `studio-runner/src/server/config.ts`, `application.ts`, `studio-runner/test/run/objectStoreFactory.test.ts`, `recording.test.ts`, `studio-runner/test/server/evidenceConfig.test.ts`, the full backend `guided/evidence/` package and tests, `studio/evidence/VideoObjectServer.java`, `ExecutionSnapshotMapper.java`, `guided/session/GuidedInternalSecurity.java`, `evidence/ContractDocument.java`, `ExecutionVideoEvidenceIT.java`, and `V20__guided_session_recording.sql`. The former recording fixture coverage is carried by `guided-recording.test.ts`; no edit to a deleted `recording-coverage.test.ts` is claimed. `GuidedSessionService` and guided worker composition were applied by their designated B14/R14 owners in sequence, as the shared-file plan requires. The contract and generated-file lists are C1/C2 ledgers. The original scope bullets remain for history and are superseded by these actual inventories.

### Strict revalidation executor record — 2026-10-14

The user requires every planned local QA check to execute green before completion. The earlier CONCERNS closure is historical. This record is an executor handoff, not an approval.

The shared video-store server now logs only the fixed unavailable message and safe resource identity. Metadata and range failures have captured full-throwable tests for both execution and guided subjects. Additional production-path tests cover an unwired evidence projector, expired evidence with a disabled store, authorization on successive ranges/downloads, duplicate identity after the settle window, and PostgreSQL recording-ID boundaries. The focused backend run passed 46 tests with zero skips.

Recording scratch now uses a private worker/incarnation namespace and bounded, ownership-verified startup recovery. It preserves live or uncertain owners and external symlink targets, fences active cleanup processes, and recovers interrupted cleanup. The worker owns SIGINT/SIGTERM; guided Chromium no longer terminates ahead of settlement. Technical trust and portability limits are disclosed in the architecture addenda and data-flow document. Actual Linux helper checks and three real Chromium kill/signal cases passed; the final full fixture tier still needs to complete against the final source.

Actual File List additions/changes for this revalidation: `backend/src/main/java/com/citi/put/checks/studio/evidence/{VideoObjectServer,ExecutionVideoException}.java`; `backend/src/test/java/com/citi/put/checks/studio/evidence/VideoObjectServerTest.java`; `guided/evidence/{RecordedGuidedEvidenceProjectionTest,GuidedSessionEvidenceTest,GuidedSessionVideoIT}.java` and `guided/GuidedRecordingMigrationIT.java` under the backend test package; `studio-runner/src/run/{recordingScratch,guidedShutdown,guidedMain,browser}.ts`; `studio-runner/src/guided/evidence.ts`; `studio-runner/test/run/recordingScratch.test.ts`; `studio-runner/test/guided/{evidence,runtime}.test.ts`; `studio-runner/test/fixtures-tier/{guided-recording,guided-recording-kill}.test.ts`; `studio-runner/test/helpers/recordingScratchWorker.mjs`; and the shared `docs/specs/studio-observed-authoring/guided-data-flow.md`. Ownership manifests and exact patches are in the adjacent backend/runner remediation evidence.

The first complete native fixture attempt is retained as **226 passes, two failures and nine uncredited skips**. Two existing replay tests conflated white app pixels with native gray encoder padding. The architect approved a test-only, full-resolution correction with exact WHITE/PAD classification, unchanged original timing/ownership/outcome checks, and four same-frame information-bearing probe rejection controls. Its 27 pure tests and independent source reviews passed; actual native controls and corrected cases remain unexecuted. Additional actual File List entries are `studio-runner/test/helpers/nativeBlankSurface.ts`, `studio-runner/test/nativeBlankSurface.test.ts`, and `studio-runner/test/fixtures-tier/{nativeBlankVideo.ts,native-blank-surface-controls.test.ts,observed-bootstrap-process-tree.test.ts,observed-bootstrap-video.test.ts}`. No runtime, SDK pin, profile, clock or contract changed for this correction.

The backend clean check is running while those six disjoint runner test files are completed. Every executed Java, runtime, build, configuration, specification, shared-tool, fixture-page and generated-runner input stays frozen. The exact test-only exclusions and per-input hashes are recorded in `execution/backend-input-scope-rationale.json`; this is not a claim that the entire repository stayed unchanged. Final runner validation must cover the final six test files separately before approval.

Current final runner gates: 1,384 unit passes, zero failures, 29 explicitly uncredited existing skips; coverage thresholds, type check and full lint passed. Failed attempts and their fixes remain recorded. Full native fixtures, deployment tests and backend clean check/JaCoCo remain pending. Independent Quinn owns the final verdict. Evidence: `docs/qa/evidence/STUDIO-OBSERVED-NEXT/strict-qa-20261014/` and this story's `strict-qa/`.


### Final strict executor handoff — 2026-10-14

This dated entry supersedes the pending statements in the preceding strict executor checkpoint while preserving all lane history, failed attempts, prior CONCERNS review and administrative rows. It records implementation and actual execution only; independent Quinn owns the final verdict.

The shared video server emits a fixed unavailable diagnostic and safe identity without raw exception/cause logging; metadata/range × execution/guided captured-throwable canaries passed. The actual Java NONE/unwired-result rejection and installed projector control, repeated range/download authorization, authority-unavailable denial, identity-before-duplicate including post-window echo and stale materialization, expired+disabled-store precedence, and actual PostgreSQL ID boundary probes are present and passed in the focused 46-case backend execution. A13-1 through A13-5 are explicitly ratified in `architecture/addendum.md`; repeated-read load cost remains OBS-008, without weakening authorization or claiming throughput. V1–V20 and frozen contracts remain unchanged.

The worker uses bounded ownership-verified recording namespaces and dead-incarnation recovery, preserves live/uncertain/foreign owners and external symlink targets, and owns cooperative shutdown. Actual parent-only SIGKILL/restart controls with external-symlink false/true and a real SIGINT path passed in the final native suite; SIGTERM success is checked in the kill cases. These verify cleanup by a later owner, never SIGKILL executing finally. The separate Linux Node22 helper smoke executed four filesystem cases as a read-only non-root container, including the Linux descriptor branch; it is not a Linux browser/deployment proof. Scope, portable inode/UID fences and same-UID trust limits are ratified in `architecture/portability-addendum.md` and the data-flow document. Evidence: `execution/linux-recording-scratch-smoke-results.json`, `execution/integration-profile-full-native-proof.json`, and `runner-remediation/implementation-receipt.json` under the strict evidence directory.

The six native padding files classify exact WHITE/PAD at full decoded resolution without changing application timing/ownership/outcome assertions; all four PREFS/VERSION same-frame information-bearing controls reject the probe at both geometries. Three readiness files require actual paint before recording; three profile files prove a handed-off live filesystem attack, actual single production close and first observed process-tree death, without fixture fallback cleanup earning the deadline. Final profile diagnostics cannot invoke accessor/inherited/proxy getters or retain raw errors. The original SEC-001 oracle A retains its region caps and positive control; B is alignment evidence only. Final A has zero offending startup frames and the actual chrome-page positive control flags all 41 frames; this is separate from the retained historical unknown CONTEXT_LOST/503 attempts. Current native artifacts are uniquely archived and old evidence bytes restored, as the final native proof records. The startup-oracle, padding, readiness and profile architecture rulings/source reviews approve these exact test boundaries; they do not supply execution pass credit themselves.

Recorded-login video/206/offset/manifest/secret-canary proof, recorder loss, adapter parity and later replay-video assertions remain required in the final **40/40 passed** executed Replay cases. The recorder-fault joined case still uses the plain fixture to avoid the single-use secret observer collision while the recorded login retains its separate canary proof. Retired `recording-coverage.test.ts` applicability is carried by existing `guided-recording.test.ts`; no deleted-file edit or coverage waiver is claimed. Guided SSE stays N/A under the original PO clarification, never an SSE pass.

The final runner gates actually completed on source digest `cd2c9609d6ba90536deff2528797a7e7686d27c3f75411a34c538ef8ce55e467` and ignored dist digest `af2cf70c5ac7edbaeea8f7f3e2090a8e52a5a0f8136dfe6aab5b18197fe438f2`: **1,529 unit passes / 29 historical uncredited skips**, coverage thresholds green, full TypeScript and lint exit 0, profile file **10 passes**, full native fixtures **232 passes / nine unchanged historical uncredited skips**, and deployment **313 passes / zero skips**. Exact commands, exit receipts, raw-report hashes and before/after inputs are indexed in `docs/qa/evidence/STUDIO-OBSERVED-NEXT/strict-qa-20261014/backend-remediation/final-executor-handoff/runner-completed-gates.json`. Independent preaudits are `qa013/final-evidence-preaudit.json` and `qa014/final-evidence-preaudit.json`; these are evidence review, not final story approval.

**Final backend completed and archived.** Normal unfiltered `./gradlew check --continue --console=plain` result: exit **0**; standard test task **2,077 passed / 0 failed / 0 errors / 25 named uncredited skips**; `crossReplicaTest` **2 passed / 0 failed / 0 skipped, freshly executed**; all Test-task inventory **docs/qa/evidence/STUDIO-OBSERVED-NEXT/strict-qa-20261014/execution/backend-final-normal-check-attempt02-all-test-tasks-receipt.json SHA256 e8ececd65e50991a79811f0f0ca0c47f722b94b52882b459bba94a3073e7a7f1; /testTaskGroups binds both test and crossReplicaTest archives and fresh exact testcase names**; final task outcomes/freshness **docs/qa/evidence/STUDIO-OBSERVED-NEXT/strict-qa-20261014/execution/backend-final-normal-check-attempt02-all-test-tasks-receipt.json SHA256 e8ececd65e50991a79811f0f0ca0c47f722b94b52882b459bba94a3073e7a7f1; /taskOutcomeMatrix, /staticOutcomeBindings and /qualityAndXmlArtifacts preserve natural UP-TO-DATE outcomes; pre-existing disabled spotbugsTest is SKIPPED and receives no pass credit**; JaCoCo report and unchanged threshold verification **fresh jacocoTestReport and jacocoTestCoverageVerification executed successfully; archived XML SHA256 628101f7aa5eac26fe5ca3233a2b0238488e9c2eaba6358be920537c615fc8c9; global LINE 18,987/21,237 =89.405% >=70%, with scope applicability and legacy selector limits below**. All required local cases must actually run green, and skipped criteria receive no pass credit. Final source/dist equality and archive binding: **source cd2c9609d6ba90536deff2528797a7e7686d27c3f75411a34c538ef8ce55e467 /dist af2cf70c5ac7edbaeea8f7f3e2090a8e52a5a0f8136dfe6aab5b18197fe438f2 unchanged across all seven final commands; docs/qa/evidence/STUDIO-OBSERVED-NEXT/strict-qa-20261014/execution/backend-final-normal-check-attempt02-all-test-tasks-receipt.json SHA256 e8ececd65e50991a79811f0f0ca0c47f722b94b52882b459bba94a3073e7a7f1**. Final four-class names/counts: Planning **57/57 passed**, Replay **40/40 passed**, Session **44/44 passed**, Bridge **37/37 passed**. Actual guard tallies, named planted reasons, before/after testcase reconciliation and zero removed/skipped local oracles: **docs/qa/evidence/STUDIO-OBSERVED-NEXT/strict-qa-20261014/execution/integration-final-guard-reconciliation.json SHA256 3d9b196100333ccdde4315a76f0c469b0c0b5d55a4697d99e0361aef5e732026; Planning 7 admitted clicks, 6 SIDE_EFFECT_DENIED +2 UNGROUNDED_TARGET +1 DESTRUCTIVE_VERB planted refusals, 2 confirmations; Replay 55 admitted clicks /0 refusal; all prior exact names retained and the new context-refusal case contributes zero guard decisions**. All counts above are observed from completed fresh archives, not forecasts or credit from a running command.

The prior `clean check` remains a failed aggregate: its standard runtime task had 2,076 passes and 25 named skips, and its separate cross-replica task passed two cases, while Checkstyle/Spotless failed. Approved exact-value string layout corrections and 46-class executable equivalence are diagnostics; they do not convert that attempt into a successful final gate. Earlier native attempts **226/2/9**, **231/1/9**, **231/1/9**, focused/unit failures and rejected profile-helper candidate bytes remain archived. The profile attempt-02 accessor/privacy source was rejected before native credit; final own-data-descriptor-only diagnostic handling and its 67 pure checks are separately source-approved. No failed attempt or rejected candidate is erased or called green.

CodeRabbit was not installed at the configured executable and no automated scan passed. The explicit configured `graceful_degradation.skip_if_not_installed: true` plus this story's independent-review fallback is used; Aria's bounded source/security rulings and separate Quinn review supply the actual manual alternative. The final exact-story independent QA verdict is still required. No commit, push, deployment, installation, user database recreation or external approval is claimed. OBS-012B's strict closure stays unchanged; OBS-015 production is unstarted. Status remains **InReview** until independent Quinn authoritatively reviews the final story/source/evidence and performs any PASS/Done transition.

The source-input bridge checks all 1,583 final inputs with zero read-only drift, including all inherited frontend inputs matching the original resume manifest; this batch made no frontend code edits. Exact strict-batch file hashes, evidence and carry-forward anchors are in this handoff directory's `actual-file-inventory.json`, `source-input-bridge.json`, `evidence-index.json` and `carry-forward-inventory.json`. The 20 source-anchored Pax dispositions remain pending administrative reconciliation after independent PASS/Done; completed local checks must not remain deferred downstream. Manual masking C-17, real Sonic/provider/gateway/Vault/SIEM/staging/folded deployment, compliance and representative reliability are unclaimed. Preserve the unexplained historical production-style failures and all external gates; no change here proves F01–F04 implementation or approval.


**Actual coverage scope and platform.** Independent `qa013/coverage-scope-applicability.json` (SHA256 982fb5d69589be7456d8d087dd406e1296798eeb5f28bd806d1a3f8a0fd900c2) and `qa014/coverage-scope-applicability.json` (SHA256 f627e1dd5776e8d043b2769a5f30382830cf78ec3aef802706a0f5a443b1f67f) reparse the final actual XML against the original ADR-SC-005 / OBS-012A AC-1 responsibility mapping. Global LINE is 18,987/21,237 (89.405%) >=70%; the four active 75% package scopes pass: dispatch 959/1,110, internal 672/739, recovery 232/261 and SSE 237/256. The surviving shared gateway package has unique LINE 393/424 (92.689%) >=80%; the nine strictly ported sources have 368/394 and five surviving compile-responsibility sources 88/96 as supplementary source-file proof. Nested-class line overlap 395/426 is not used as the package denominator. Both legacy `compile`/`compile.gateway` selector literals have NO_CURRENT_CLASSES and are not called matched 80% passes. The old repair/confirmation/sweep compiler was explicitly retired. Retention 29/43 (67.442%) is diagnostic only; no new retention-specific threshold is invented. No threshold/configuration/test selection was changed or waived. Future CI still does not automatically enforce current gateway 80% through those retired selector literals; that enforcement limitation is explicit and unimplemented. Actual native platform was controlled macOS 14.5 arm64 / Node v23.10.0 / Playwright 1.63.0 / Chromium 153.0.8010.12, with the separate Linux filesystem-helper proof scoped as stated above; no signed deployed production-image claim is made.

## QA Results

### Review Date: 2026-10-14 — resumed final gate

**Reviewed By:** Quinn (independent QA-013)

**Reviewed Revision:** `s4c-worktree:sha256:af26d1b1a2a31702f23715d5529fa194426709a4ce8b25e2eca2d42b7d959137` (uncommitted working tree on HEAD `734ad704f`). Independent comparison of all 1,556 backend/runner/frontend/tools/spec files in the frozen manifest found zero hash mismatches. Executor bookkeeping was reconciled before this review; source/test files were not changed by QA.

Gate: CONCERNS → docs/qa/gates/STUDIO-OBS-013-record-the-learning-run-video-step-offsets-and-seek.yml

All applicable ACs are met. AC-4's SSE clause is **N/A**, neither passed nor waived, under the existing PO ruling. Exact joined proof now covers the recorded login, authenticated 206 range read, per-action/per-step offsets, canary-clean manifest and unchanged later replay videos. The separate joined recorder-fault case settles UNAVAILABLE and still finalizes; its plain-fixture host avoids the worker's single-use secret observer, while the happy login and runner fault tests retain login/canary coverage. This preserves AC-6's obligations.

Independent evidence audit: backend **2,059 passed / 25 skipped / 0 failed or errored** across 285 suites; the 15 relevant suites contribute **289 passes and no skips**, including GuidedPublicationReplayIT **40/40**. Runner default **1,351 passed / 29 skipped**; fixtures **225 passed / 9 skipped**, including guided-recording **4/4**; deployment **313 passed**. JaCoCo verification, runner type/lint/pins, and both independent read-only contract/codegen checks passed. Skips are uncredited. CodeRabbit was unavailable; this is the configured independent review fallback, not an automated-review pass.

Closed draft findings: TEST-001, TEST-002, SEC-001 and DOC-001. The startup-video fix and architect-tightened content oracle are verified; the seek-alignment oracle B is not counted as security evidence. Remaining nonblocking concerns have explicit owners and placements in the gate: unexplained launch CONTEXT_LOST and SIGKILL recording residue (**@dev/@architect, OBS-009**); range-read cost (**@architect/@dev, OBS-008**); architecture/logging/DDL ratifications (**@architect, OBS-013/010**); fixture substitution note (**@po, OBS-013**); neutral error wording (**@dev, OBS-008/010**). No waiver was granted.

Real Sonic/ingress, manual masked-dots approval, deployed folded-runner reliability, OBS-008 playback UX and OBS-015 populated prefix offsets remain their explicitly assigned gates; this review does not claim them. The unrelated useUrlListState work was preserved within the frozen source identity.

Source-bound manifest, all prior-finding dispositions, Given/When/Then traceability, raw-log/XML hashes and named backend skips: `docs/qa/evidence/STUDIO-OBS-013/resume-qa/review-manifest.json`, `verification.json`, and `review-report.json`. No full gate rerun, product refactor, commit, push or deployment was performed.

### Review Date: 2026-10-14 — strict final PASS

**Reviewed By:** Quinn (independent QA-013)

**Reviewed Revision:** `strict-review:sha256:76cfd1310ab814e48cbf3b095b45e79ade5a373156c796e6fd800699fd13ec47`. The reviewed executor story is version 0.2.7, SHA256 `6ed94664407dc2593c4409f5bc302a86c652b7517a52d59409b4f5f37135a1b0`; source SHA256 `cd2c9609d6ba90536deff2528797a7e7686d27c3f75411a34c538ef8ce55e467`, ignored runner dist SHA256 `af2cf70c5ac7edbaeea8f7f3e2090a8e52a5a0f8136dfe6aab5b18197fe438f2`. All 1,583 source inputs and 238 dist files matched the completed execution freeze. This entry supersedes the historical CONCERNS review above; that review and its closure history remain preserved.

Gate: PASS → docs/qa/gates/STUDIO-OBS-013-record-the-learning-run-video-step-offsets-and-seek.yml

Reviewed By: Quinn
Reviewed Revision: strict-review:sha256:76cfd1310ab814e48cbf3b095b45e79ade5a373156c796e6fd800699fd13ec47

Every originally planned applicable local validation is complete and green: six ACs, 35 original AR-1 negative groups and 18 requirement rows. AC-4's guided SSE clause remains N/A under the original PO ruling, never an SSE pass. No local waiver, new exclusion or deferred local check supplies this PASS.

The completed normal, unfiltered backend check exited 0: **2,077 standard passes, zero failures/errors, 25 unchanged historical uncredited skips**, plus **two freshly executed cross-replica passes**. All XML is fresh for that run; every prior case invocation is retained, with one additional live context-forgery case. Ordered publication/replay is **40/40**, including recorded login, authenticated 206 reads, exact action/step offsets, canary-clean manifest, recorder-fault UNAVAILABLE with terminal completion, and two actual model-free ordinary replays after pruning. Current scoped tests also prove rendered-log privacy, actual NONE-result refusal, identity before duplicate echo, repeated range/download authorization, expired-plus-disabled-store precedence and PostgreSQL ID boundaries. Natural UP-TO-DATE static results are bound to unchanged inputs and their prior actual green execution; pre-existing disabled spotbugsTest receives no credit.

Final runner results are **1,529 unit passes / 29 unchanged historical uncredited skips**, coverage thresholds green, full TypeScript/lint exit 0, **10/10 actual profile cases**, **232 native passes / nine unchanged historical uncredited skips**, and **313 deployment passes / zero skips**. All original names are retained. The four actual probe controls independently satisfy same-frame information-bearing and FINAL-frame WebM assertions; their source-frame barriers are synchronization only. SEC-001 A has zero offending frames, T1 caps remain <=10%, the actual T2 control flags 41/41 frames, and B is +24ms alignment only; C and adapter parity execute. Actual kill/restart/signal and ownership/PID/scratch/capacity cases pass. The profile attack is live and complete, production invokes real close once, the FIRST post-SDK observation finds all seven owned PIDs absent, and canary/root cleanup succeeds without fallback or errors. Fixture PID scheduling is not claimed as unmodified production descendant-quiescence proof. The accessor privacy finding is closed by own-data-descriptor extraction and all 67 meaningful pure controls. Linux proof remains the four actual filesystem-helper cases; native browser proof is the controlled macOS catalog.

Actual JaCoCo coverage and both independent applicability reviews are accepted: global LINE 18,987/21,237 >=70%, four active package bars >=75%, and responsibility-mapped gateway LINE 393/424 >=80%. The two retired compiler selector literals match NO_CURRENT_CLASSES and are never called matched passes; the old compiler was explicitly removed. The future automatic-selector enforcement limitation is disclosed, with no threshold/configuration change or invented retention/all-guided 80% criterion.

Closed local findings include LOG/WIRING/KILL/RATIFY, startup-content proof and its non-vacuity, strict padding/readiness/profile fixture defects, and diagnostic accessor privacy. Earlier static-red backend runs, native/unit failures, rejected source candidates and unexplained historical CONTEXT_LOST remain failed or unexplained history. The previous canonical CONCERNS gate is preserved at `docs/qa/evidence/STUDIO-OBSERVED-NEXT/strict-qa-20261014/qa013/historical-concerns-gate-20261014.yml`. CodeRabbit is absent; the story's explicit independent-review fallback and core-config graceful degradation apply. No automated CodeRabbit pass is claimed.

Real Sonic/provider/Vault/SIEM/ingress, manual masked-dots C-17, staging seek, deployed folded-runner reliability, Security/Compliance approval, OBS-008 playback and OBS-015 prefix population retain their original downstream scope and are not obtained here. F01-F04 and artifact-HMAC limitations remain unchanged. Trusted host/service UID, conservative liveness, Linux descriptor/macOS checked-path and cooperative syscall limits remain explicit; no malicious same-UID race-proof claim is made. OBS-012B remains unchanged and OBS-015 production is unstarted.

Full source/story/protected bindings, raw artifact/XML recount, original requirement trace, skip identities, coverage decisions and historical dispositions are in `docs/qa/evidence/STUDIO-OBSERVED-NEXT/strict-qa-20261014/qa013/final-story-review.json`. QA changed only this story's QA/lifecycle/changelog metadata, its canonical gate and own evidence; no runtime/source/config/dist/test/build/native/process/CLI change occurred. Pax administration and root CLI/wave verification remain subsequent roles.

## Change Log

| Date | Version | Change | Author |
|---|---|---|---|
| 2026-10-09 | 0.1.0 | Draft created from ADR-SC-005 (Consequences "Evidence … for the first Run too", placement map row OBS-013), the UX panel finding that the guided worker records no video, design R3 §4 "Video"/F-3 row, ADR-002 §11.6 clock origin and the OBS-006 Range/206 semantics; 6 ACs; Status Draft | @sm (River) |
| 2026-10-10 | 0.1.1 | Validated GO (9/10) — Status: Draft → Ready. Report `.ai/STUDIO-OBS-013-po-validation-sp.json` | @po |
| 2026-10-13 | 0.2.0 | Status: Ready → InProgress. Lane B13 (backend) started under architect ruling AR-1 (`docs/qa/evidence/STUDIO-OBSERVED-NEXT/ar-1-obs013.json`); lanes C1/D/R13/R14/B14 run in parallel per `s0-plan-refresh.json`. | @dev (Dex, B13) |
| 2026-10-13 | 0.2.1 | AC-4 clarification a–e from architect AR-1 (`docs/qa/evidence/STUDIO-OBSERVED-NEXT/ar-1-obs013.json`, "recorded for @po"). The clause "SSE snapshots carry the reference" is N/A: no guided SSE stream exists (the only SSE producer is the replay `ExecutionEventsController`, verified). QA records it as N/A with this rationale, not FAIL. The reference rides `result`/`session-view` v3, and no guided stream is created to satisfy the clause. Record `docs/qa/evidence/STUDIO-OBSERVED-NEXT/po-ar2-notes.json` note 3. AC text and meaning, tasks and Status (**InProgress**) are unchanged | @po (Pax) |

| 2026-10-14 | 0.2.2 | Final executor handoff reconciled from applied lane ledgers and independently recounted frozen S4c evidence; tasks and actual File List updated. Status: InProgress → InReview. No product/test source changed; independent QA verdict pending. | Codex coordinator |
| 2026-10-14 | 0.2.3 | QA Gate CONCERNS — Status: InReview → Done. Applicable ACs verified against frozen S4c source; nonblocking owned follow-ups retained, no waiver. | @qa (Quinn) |
| 2026-10-14 | 0.2.4 | Administrative closure after independent Quinn CONCERNS; exact source and story provenance verified. Status Done remains QA-owned and unchanged. Nonblocking findings placed with owners in OBS-008/009/010/011; `.ai/STUDIO-OBS-013-close.json` and `resume-20261014/po-closure-placements.json` record verification and limits. No AC or external approval waived. [closure-key: STUDIO-OBS-013:digest:s4c-worktree:sha256:af26d1b1a2a31702f23715d5529fa194426709a4ce8b25e2eca2d42b7d959137] | @po (Pax) |
| 2026-10-14 | 0.2.5 | User-directed strict QA reopening — Status: Done → InReview. Prior CONCERNS and administrative closure are historical; completion now requires every planned QA validation executed and green, with no substituted downstream deferral. Independent plan audit pending. | Codex coordinator |
| 2026-10-14 | 0.2.6 | Strict revalidation executor handoff: local findings remediated, actual file inventory and executed focused proof recorded; final full shared gates pending. Status remains InReview; independent QA owns approval. | Codex coordinator |


| 2026-10-14 | 0.2.7 | Final strict executor handoff: actual code/evidence inventory, completed final runner/native/privacy/live-process proofs and completed backend exit 0, 2,077 standard passes / 25 uncredited historical skips plus two cross-replica passes reconciled with final inputs. Prior failures and external limits retained; independent QA verdict pending. Status remains InReview; no commit or lifecycle approval. | @dev (Dex), coordinated by Orion |

| 2026-10-14 | 0.2.8 | Strict independent QA PASS — Status: InReview → Done. Every originally planned applicable local validation is executed green on the final source/dist and reconciled executor revision; prior failures, uncredited skips and original external gates remain explicit. Gate and complete proof: qa013/final-story-review.json. | @qa (Quinn) |

## Administrative closure notes — 2026-10-14

All applicable ACs accepted. Applicability: the retired `recording-coverage.test.ts` references in AC-6/Testing are satisfied by `studio-runner/test/fixtures-tier/guided-recording.test.ts` (four real-browser cases including adapter parity and recorder loss); no guided coverage is waived. AC-4 SSE remains N/A under the existing PO ruling, never an SSE pass. The joined recorder-fault case uses the plain fixture because of the single-use secret observer, while the runner fault still uses the login fixture; QA verified the unchanged assertions. CONTEXT_LOST/scratch cleanup are in OBS-009, range-cost/ratification in OBS-008, logging in OBS-010, normative regex documentation in OBS-011. Manual masking/Sonic remain external or downstream.

The coordinator accepts the documented nonblocking concerns only for this story’s scoped completion. See [`po-closure-placements.json`](../../qa/evidence/STUDIO-OBSERVED-NEXT/resume-20261014/po-closure-placements.json) for owners and completion conditions. Outstanding follow-ups remain open. No commit, push, deployment, database recreation or external communication occurred.
