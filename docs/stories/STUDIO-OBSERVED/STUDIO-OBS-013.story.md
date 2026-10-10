# Story STUDIO-OBS-013 — Record the learning run: video, step offsets and seek for the guided first Run

| Field | Value |
|---|---|
| Story ID | STUDIO-OBS-013 |
| Status | **Ready** |
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

5. **AC-5 — Masked-dots disclosure for password fills.** The manifest/disclosure line states that password fills are rendered as masked dots (the password-only rule) and that a page later echoing a secret in plain text is not protected by video (design R3 §4 "Video" residual); the manual "masked dots only" inspection remains an OBS-009 gate (C-17). [design R3 §4 "Video"; §7 C-17]

6. **AC-6 — Proof.** Joined IT (real backend + PostgreSQL + runner guided mode + Chromium, as in `GuidedPublicationReplayIT`): a guided learn run on the OBS-007 login fixture yields video `AVAILABLE`, an authenticated 206 range read, one offset per step and per dispatched action, and a manifest with zero canary hits; the published plan then replays with the existing replay recording unchanged (regression: OBS-006 `GuidedPublicationReplayIT` video path); recording failure mid-session yields `UNAVAILABLE` evidence and a session that still reaches its terminal state (no fake video); runner fixtures tier `recording-coverage.test.ts` extended to the guided mode; `confinement.test.ts` still proves the sandbox and no `tracing`/`recordHar`/`screenshot` (OBS-007 AC-10 static test unchanged). [OBS-006 AC-7 precedent; design R3 §7 SEC-3; ADR-SC-005 "Tests"]

## Tasks / Subtasks

- [ ] **T0 — Reconcile.** Confirm OBS-012A Done; read `recording.ts`/`evidenceUpload.ts`/`manifest.ts`/`ExecutionVideoController` seams; agree the contract-edit order with OBS-014/015 owners; @architect confirms the clock-origin binding (ADR-002 §11.6); root reconciles the File List.
- [ ] **T1 — Runner (AC-1, AC-2, AC-5).** Recorded guided context on the OBS-007 persistent profile; `BrowserHandle` parity with the observed adapter; offsets per step/action; disclosure line; stop at terminal state.
- [ ] **T2 — Backend (AC-3, AC-4).** Guided session evidence key, upload acknowledgement, video route reusing `ExecutionVideoController`, result3/session-view3 references, SSE snapshots, pins re-anchored.
- [ ] **T3 — Proof (AC-6).** Joined IT, fixtures-tier extension, regressions; record counts and unavailable services honestly.
- [ ] **T4 — Record and submit** to independent @qa; only QA can set Done.

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

- [ ] Applicable pre-commit checks and focused review recorded.
- [ ] Independent SDC QA review with requirement-to-evidence mapping.
- [ ] Any eventual PR/push is handed to @devops with verified gates.

### Self-Healing and Focus Areas

QA full review: three iterations, 30 minutes. Focus: no second recording implementation, masked-dots invariant intact, authorization reuse (no new unguarded route), honest unavailable states, contract ownership sequencing. Record an unavailable CodeRabbit tool and use the configured independent review fallback.

## File List

Proposed ownership; root reconciles before dispatch.

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

Not started. Draft preparation only; no implementation evidence yet.

## QA Results

Not reviewed. No quality verdict assigned.

## Change Log

| Date | Version | Change | Author |
|---|---|---|---|
| 2026-10-09 | 0.1.0 | Draft created from ADR-SC-005 (Consequences "Evidence … for the first Run too", placement map row OBS-013), the UX panel finding that the guided worker records no video, design R3 §4 "Video"/F-3 row, ADR-002 §11.6 clock origin and the OBS-006 Range/206 semantics; 6 ACs; Status Draft | @sm (River) |
| 2026-10-10 | 0.1.1 | Validated GO (9/10) — Status: Draft → Ready. Report `.ai/STUDIO-OBS-013-po-validation-sp.json` | @po |
