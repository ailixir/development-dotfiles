# STUDIO-OBS-008 T0 rulings A1, A2, A3

- **Author:** Aria (@architect). **Date:** 2026-10-16 (written 2026-10-17T02:23Z). **Mode:** YOLO, autonomous.
- **Status:** RULED. Implementation stays held until STUDIO-OBS-015 is Done and root releases 008 (P0 / H-1). These rulings bind the 008 C-int unit (L0), backend lane (L1), a new @data-engineer migration slot, and the frontend lanes (L2a, L5a, L5b).
- **Writes:** this file and `manifest.json` in this directory. Nothing else.
- **What I ran:** read-only commands only (`shasum -a 256`, `grep`, `sed`, `ls`, and `node -e` that reads JSON schemas). No build, test, install, database, or git write. Nothing under `backend/`, `frontend/`, `studio-runner/`, `tools/`, `docs/specs/` or `.github/` was edited.
- **User decisions applied:** A1 adds a public replay field (decided by the user). The secret-fill refusal copy is recorded as not renderable unless it is trivially derivable (decided by the user). I found it is not trivially derivable (A2).
- **Inputs:** story `STUDIO-OBS-008.story.md` (sha256 `a35e1466…`, including Pax's D-1…D-12 amendment), `po-delta-validation.md`, `implementation-plan.md`, `lanes.json`, `obligations.json`, `openapi.yaml` `c053a7f7…`, and the v3 contracts. Source files are listed with hashes in `manifest.json`.

## 0. What the code does today (verified by reading the source)

| # | Fact | Where |
|---|---|---|
| F1 | During replay, a learned-step drift is the runner `ObservedRefusal('TARGET_DRIFT')`. The step reports `status: FAIL` with `failure: 'TARGET_DRIFT'`. | `studio-runner/src/executor/observedReplay.ts:395-398`, `run/launcher.ts:444` |
| F2 | The run outcome for drift is `failureKind: 'run-fault'`, so `{result: ERROR, errorCode: RUN_ERROR, errorMessage: 'TARGET_DRIFT'}`. Only `ASSERTION_FAILED` maps to `'step'` (`FAILED`/`STEP_FAILED`). | `run/launcher.ts:514`, `server/runCoordinator.ts:697-706`, `run/errors.ts:156` |
| F3 | Replay login is `{result: FAILED, errorCode: LOGIN_REQUIRED, errorMessage: null, detail: {stepId, loginStepsPresent}}`. `detail.stepId` is the action's `coordinate.stepId`. | `observedReplay.ts:367-368`, `runCoordinator.ts:709` |
| F4 | The backend accepts `RunOutcome.detail` (`internal/dto/RunOutcome.java:24-35`) and then **drops** it. `RunnerReportProjection.Projected` has no slot for it. `diagnostic()` writes only `runnerErrorCode=LOGIN_REQUIRED` into an API log line. No other `.detail()` consumer of the login detail exists; the only grep hit, `StudioDispatcher.java:570`, is the dispatch outcome. So the login detail is **not persisted**. This was an inference in the plan (B12); it is now verified. | `RunnerReportProjection.java:177-192, 543-558`, `ProgressReportService.java:232-243, 652-660` |
| F5 | `ExecutionErrorCode` is API-assigned, sits next to `status: ERROR`, and is null on every other status (`x-assigned-by`; the two vocabularies intersect only at `TIMEOUT`/`CANCELLED`). Login is a `FAILED` status, so adding `LOGIN_REQUIRED` to that enum would break the enum's own definition. | `openapi.yaml:3824-3897`, `:45-53` |
| F6 | `StepResult.message` copies the runner `failure` verbatim. A drift step's public message is therefore already the literal text `TARGET_DRIFT`. It is text: D-7 forbids the UI from parsing it, and this ruling keeps that ban. | `RunnerReportProjection.java:435-438` |
| F7 | On the observed FINAL path the backend already parses the confirmed revision's replay artifact, which carries `steps[]` with `stepIndex`/`stepId`. | `ProgressReportService.java:200-229` |
| F8 | A guided start on a `READY` test (unchanged draft) accepts any current step's ID as `firstLearnStepId`. `FIRST_LEARN_STEP_NARROWED` applies only when the draft changed and the requested step is after k. An ID not in the current draft gets `FIRST_LEARN_STEP_UNKNOWN`. | `GuidedIncrementalStore.java:38-58` |
| F9 | Guided password refusals carry the bridge `reason` `PASSWORD_TARGET_ABSENT`, `PASSWORD_TARGET_AMBIGUOUS`, `PASSWORD_FORM_ACTION_NOT_ALLOWED` or `PASSWORD_CONTROL_READ_REFUSED`. `stopRejected` ends all of them as `INVALID_CONTRACT`. Only a governed reason ends as `POLICY_DENIED`. | `GuidedTranslationService.java:1948-1963`, `bridge.schema.json:893-901` |
| F10 | Replay `PASSWORD_CONTROL_READ_REFUSED` is raised when the plan tries to **read** or assert the value of a password box (`observedReplay.ts:29`). That is a different condition from "a secret typed into a non-password box". | `observedReplay.ts:29`, `runCoordinator.ts:711` |
| F11 | `cancel` is the closed body `{schemaVersion: 3, reason: userRequested|policyRevoked}`, `Idempotency-Key` required, answer `202`. `clarify` requires a server `choiceId`, and `clarification.schema.json` has no "none" choice. | `commands.schema.json`, `openapi.yaml` `cancelGuidedSession` |
| F12 | `ui_test_executions` is range-partitioned. The Flyway head in this tree is `V21__guided_session_replaying_prefix.sql`. | `db/migration/V7…:18-32`, `ls db/migration` |

---

## A1 — public replay failure field (RULED: add `ExecutionSnapshot.replayFailure`)

### A1.1 Contract shape (exact)

Add one schema component and one property to `ExecutionSnapshot`. No operation, status code, `required` list, `ExecutionErrorCode` member, `x-assigned-by`, `x-runner-error-codes` or v3 byte changes.

```yaml
# components.schemas.ExecutionSnapshot.properties (append after `streamComplete`; NOT added to `required`)
        replayFailure:
          $ref: '#/components/schemas/ReplayFailure'

# components.schemas (new, placed directly after ExecutionSnapshot)
    ReplayFailure:
      type: object
      nullable: true
      additionalProperties: false
      required: [ code, stepId, stepIndex ]
      description: |
        The one named cause of a replay that stopped at a learned step, derived by the API from the
        runner's terminal report (STUDIO-OBS-008 T0 ruling A1). Value-free by construction: a closed
        code, the confirmed revision's stable step ID, its 0-based position, and for login one
        boolean. It never carries page text, URLs, selectors, observation data, diagnostic text or
        any secret or variable value.

        Null, or absent, means the API names no such cause. That covers every non-terminal snapshot,
        every PASSED run, every run with a non-null `errorCode` (an API-assigned cause always wins),
        reaped, reconciled and pre-Ready rows, legacy history, and any terminal report outside the
        two derivation rules below. A client never derives it from `stepResults[].message`, `logs`
        or `status`.

        | `code` | Derived when (all must hold; FINAL report only) | `status` it appears with |
        |---|---|---|
        | `LOGIN_REQUIRED` | `outcome.result = FAILED`, runner code `LOGIN_REQUIRED` and its `detail` present; `detail.stepId` is a step of the confirmed revision; that step reported `FAIL` | `FAILED` |
        | `TARGET_DRIFT` | `outcome.result = ERROR`, runner code `RUN_ERROR`, runner reason exactly `TARGET_DRIFT`; exactly one step reported `FAIL` and its runner failure code is exactly `TARGET_DRIFT` | `ERROR` |

        `stepId` is the stable authoring step ID of the confirmed revision that ran (`revisionId`).
        `stepIndex` is in the same index space as `StepResult.stepIndex`, and
        `stepResults[stepIndex].status` is `FAIL`. Written once, with the terminal status, and
        never rewritten.
      properties:
        code: { type: string, enum: [ LOGIN_REQUIRED, TARGET_DRIFT ] }
        stepId: { type: string, minLength: 1, maxLength: 256 }
        stepIndex: { type: integer, minimum: 0 }
        loginStepsPresent:
          type: boolean
          description: Present exactly when `code` is `LOGIN_REQUIRED`. True when an earlier step of this run filled a secret.
      allOf:
        - if: { type: object, properties: { code: { const: LOGIN_REQUIRED } }, required: [ code ] }
          then: { type: object, required: [ loginStepsPresent ] }
          else: { type: object, properties: { loginStepsPresent: { not: {} } } }
      x-assigned-by:
        LOGIN_REQUIRED: [ report-projection ]
        TARGET_DRIFT: [ report-projection ]
```

Field and type rationale:
- **Name `replayFailure`.** It is not `failure` (that would read as a sibling of the guided `result.failure` and invite merging it with `errorCode`) and not a new `errorCode` member (F5).
- **Flat object, not `{code, detail}`.** The UI adapter for `LoginRequiredNotice` takes `{stepId, loginStepsPresent}` from either the guided `failure.detail` or `replayFailure`. Neither surface gets a second nesting pattern.
- **`stepId` as string 1..256, no `uuid` format.** It is the same type as `LoginRequiredDetail.stepId` and v3 `result.failure.detail.stepId`. Membership in the revision is enforced server-side, which is stronger than a format check.
- **`stepIndex` included.** It joins to `stepResults` and to the replay video's per-step seek without the UI needing the executed revision's step IDs, which `StepResult` does not carry.
- **Optional, not in `required`.** This follows the `testName` precedent (story 10.46). Existing examples, the SSE scripted frames, and older fixtures stay valid. Absent is equivalent to null.
- **Name `TARGET_DRIFT`, not `TARGET_MISMATCH`.** The guided `TARGET_MISMATCH` is a learn-time proposal mismatch and is the KL-015-Q4 trigger candidate. Reusing it would conflate the two.
- **`PASSWORD_CONTROL_READ_REFUSED` and `REFERENCE_MISMATCH` are deliberately excluded.** No AC copy is keyed on them, and F10 shows the first one is not the secret-fill condition. The enum is closed. Widening it later is a new architect ruling (ADR-002 §12, "Loosening is never a story's call").

Routes affected (all through the single DTO, architecture §5.5): `GET /executions/{id}`, the items of `GET /executions`, and the SSE `execution.snapshot` frames. No new route.

### A1.2 Backend derivation (L1, sole backend writer)

In `RunnerReportProjection.project(...)`:
1. Add a `replayFailure` component (a new `dto/ReplayFailure` record) to `Projected`.
2. Add a parameter carrying the confirmed revision's ordered step IDs, `List<String> revisionStepIds`. `ProgressReportService` passes it from the artifact it already parses on the observed path (F7). Non-observed or legacy rows pass an empty list, which yields `null`.
3. Derive the value only when `report.kind() == FINAL` and `terminalErrorCode == null` (the API-assigned `CANCELLED`, `AUTHORIZATION_REVOKED` and `TIMEOUT` win).
   - **LOGIN_REQUIRED:** `outcome.result == "FAILED"`, `outcome.errorCode == "LOGIN_REQUIRED"` and `detail != null`. Set `i = revisionStepIds.indexOf(detail.stepId)`.
     - If `i < 0`, or no reported step `i` has status `FAIL`, refuse with `400 INVALID_REPORT`. This is the same class as "step index outside the confirmed revision" (`:402-411`): a runner coordinate the revision does not have is a divergence, not a cause.
     - Otherwise the value is `{LOGIN_REQUIRED, detail.stepId, i, detail.loginStepsPresent}`.
   - **TARGET_DRIFT:** `outcome.result == "ERROR"`, `outcome.errorCode == "RUN_ERROR"` and `"TARGET_DRIFT".equals(outcome.errorMessage)`, with exactly one reported step `FAIL`, and that step's `failure` exactly `"TARGET_DRIFT"`. The value is `{TARGET_DRIFT, revisionStepIds.get(i), i, null}`. Any other shape gives `null`, never a refusal.
   - Anything else gives `null`.
4. This is exact equality against the runner protocol's closed reason codes (StepFinished3 `errorCode` and the observed reason). It is not parsing text. Precedent: `OBSERVED_PRE_READY_REASONS` exact membership on `errorMessage` (012A R8.2, `:98-139`). If the redactor ever altered the reason, the result is `null` ("no cause named"), which is fail-closed and honest.
5. A pre-Ready `TARGET_DRIFT` (initial context mismatch, every step `SKIPPED`) gives `null`. No step owns it, and naming step 1 would be invented. This is recorded as limitation KL-A1-1.
6. Persistence: the FINAL `UPDATE` in `StudioDispatchLedgerStatements.applyFinal` (`:593`) writes the new columns in the **same statement** as status and `error_code`.
   - `applyObservedPreReadyFailure`, the reapers, the cancel route and `FinalizationReconciler` write nothing; the columns stay null.
   - A duplicate FINAL delivery (`applied = false`) changes nothing.
7. Read: `UITestExecution` gets the fields, and `ExecutionSnapshotMapper` maps them into a new `ExecutionSnapshotDto.replayFailure` component. GET, list and SSE share that mapper. @dev greps `getErrorCode()` consumers for any native row mapper of `ui_test_executions` and maps it the same way.
8. Security:
   - Same authorization as the snapshot it is part of. The step ID is already readable through `GET /tests/{id}` by the same principals.
   - `loginStepsPresent` reveals only that a secret fill happened earlier in the run. The guided surface already exposes that fact.
   - No value, DOM, URL or diagnostic text is copied. The diagnostic log line stays unchanged.

### A1.3 Persistence (delegated DDL: @data-engineer, one migration)

- Next free Flyway version, re-measured at W0. Today it would be `V22__execution_replay_failure.sql` (F12). OBS-015 may still move the head.
- Add four nullable columns to the partitioned parent `ui_test_executions`: `replay_failure_code text`, `replay_failure_step_id text`, `replay_failure_step_index integer`, `replay_failure_login_steps_present boolean`. Adding a column to the parent propagates to the partitions.
- Add one table CHECK that admits exactly three shapes:
  - all four null;
  - `LOGIN_REQUIRED` with `step_id` (1..256 characters), `step_index >= 0` and `login` not null;
  - `TARGET_DRIFT` with `step_id`, `step_index` and `login` null.
- No backfill. The login detail was never stored (F4), and inventing it would be dishonest. Historical rows read `null`.
- Dara owns the lock and validation analysis for the CHECK on a partitioned table (`NOT VALID` support, scan cost) and the `PartitionManager` future-partition inheritance check. It is a forward-only migration with no down-migration, per repo convention.

### A1.4 OpenAPI, examples, generators, pins (L0 C-int: single contract owner)

- **One writer:** L0 C-int (@dev contract integrator), in the **same W1 unit as P1–P3**, so there is one re-anchor and no second pin churn. ADR-002 §12 says a pin must not be re-anchored in a PR whose subject is something else; A1 is part of this unit's subject.
- **`openapi.yaml` edits:**
  - The `ReplayFailure` component and the `ExecutionSnapshot.replayFailure` property, as in A1.1.
  - Three examples under `components.examples`, referenced from `getExecution`: `SnapshotLoginRequiredNoLoginSteps` (`loginStepsPresent: false`), `SnapshotLoginRequiredLoginStepsFailed` (`true`), and `SnapshotTargetDrift` (`status: ERROR`, `errorCode: null`). Each has consistent `stepResults` (FAIL at `stepIndex`, later steps SKIPPED with null timings).
  - Add `replayFailure: null` to `SnapshotFailed`. This is optional, but recommended so the "no cause" case is visible.
- **ADR-002 §13 changelog row:** class **C** (public surface), "ruled by @architect, 008 T0 A1; applied by @dev C-int". Old and new digests are measured with `shasum -a 256`.
- **Pins:** re-anchor `StudioContractTest.BASE_SHA256` (`backend/src/test/java/com/citi/put/checks/studio/StudioContractTest.java:82-83`) and `studio-runner/test/run/confinement.test.ts:287` from `c053a7f75656…0f5d70f` to the measured digest of the W1 document. Each comment cites "STUDIO-OBS-008 C-int W1 (P1–P3 + T0 A1)" with old and new values quoted, as the 015 comments do.
- **Generators:** no impact expected, and I verified the inputs.
  - `tools/build-studio-observed-schemas.cjs` builds only from v3 roots, and A1 touches no v3 file. So `observedSchemas.json`, `OBSERVED_SCHEMA_BUNDLE_HASH` and the `GuidedContracts` epochs are unchanged.
  - C-int still runs `check()` and `node tools/check-studio-observed-contracts.cjs` to prove it. Expected: the operation count is set by P1 alone (43 → 44), A1 adds 0 operations, plus 1 component and 3 examples.
  - The runner's `errors.test.ts` (`x-runner-error-codes`) is unaffected.
- **Not touched:** v3 contracts (Pax's v3 hash quotes stay valid), `ExecutionErrorCode`, `RunOutcome`, `RunnerReport`/`RunnerStepState` (no runner-produced body changes, so no Class B), and the runner source.

### A1.5 Backend tests (L1; all PLANNED_NOT_RUN)

Unit tests, `RunnerReportProjectionTest` (extend):
1. A login FINAL gives `{LOGIN_REQUIRED, id, i, false}`. The `true` variant also gets a test.
2. A login whose `detail.stepId` is not in the revision gives `400 INVALID_REPORT`.
3. A login whose step `i` is not `FAIL` gives `400 INVALID_REPORT`.
4. A drift FINAL gives `{TARGET_DRIFT, revisionStepIds[i], i}` with no `loginStepsPresent`.
5. These give `null`: drift with `errorMessage` ≠ `TARGET_DRIFT`; two FAIL steps; FAIL failure ≠ `TARGET_DRIFT`.
6. These give `null`: `ASSERTION_FAILED` (FAILED/`STEP_FAILED`), `PASSWORD_CONTROL_READ_REFUSED`, `REFERENCE_MISMATCH`, `RUN_ERROR` with another reason.
7. These give `null`: a recorded cancel with runner `CANCELLED`, revocation, and a parent `TIMEOUT` kill.
8. `STARTED`/`PROGRESS` give `null`. Pre-Ready `TARGET_DRIFT` gives `null`. A non-observed (empty step list) row gives `null`.
9. Value canary: a report whose `errorMessage`, step `failure` and logs contain a secret canary. The serialized `replayFailure` contains no canary byte, and its keys are exactly the declared ones.

Integration tests, the observed FINAL IT (extend the existing ProgressReport/observed IT):
10. The persisted columns round-trip. `GET /executions/{id}`, the `GET /executions` item and the SSE `execution.snapshot` frame carry an identical `replayFailure`.
11. A duplicate FINAL does not change it. A reaped (`STALE`) row reads `null`.
12. The I4 identity check: `replayFailure.stepId` equals the confirmed revision's authoring step ID at `stepIndex`. That artifact `stepId` equals the authoring step ID is my **inference** from `GuidedIncrementalStore`'s prefix selection by authoring IDs. This test turns it into a verified fact.

Learn-again acceptance:
13. A guided start on a `READY` test with `baseRevisionId = confirmedRevisionId` and `firstLearnStepId = replayFailure.stepId` is accepted (F8). Reuse an existing 015 case if one already covers it, and cite it.

Contract test, `StudioContractTest`:
14. The existing `assertSchemaMatchesRecord("ExecutionSnapshot", …)` covers the new component automatically.
15. Add `assertSchemaMatchesRecord("ReplayFailure", ReplayFailure.class)`.
16. The three new examples deserialize into `ExecutionSnapshotDto`.
17. Optionally, the `x-assigned-by` keys of `ReplayFailure` equal its `code` enum.

Migration, owned by @data-engineer:
18. The Flyway head migrates. The CHECK rejects mixed shapes (for example login without boolean, drift with boolean). A future partition inherits the columns.

### A1.6 Frontend (types, MSW, UI)

**Types, L2a, `types/studio/studioTypes.ts`:**
```ts
export const REPLAY_FAILURE_CODES = ['LOGIN_REQUIRED', 'TARGET_DRIFT'] as const;
export type ReplayFailure =
  | { code: 'LOGIN_REQUIRED'; stepId: string; stepIndex: number; loginStepsPresent: boolean }
  | { code: 'TARGET_DRIFT'; stepId: string; stepIndex: number };
// on ExecutionSnapshot:
  /** T0 A1. Absent/null = no named cause; never derive from stepResults[].message, logs or status. */
  replayFailure?: ReplayFailure | null;
```

**MSW and contract harness, L2a:**
- `services/mocks/studio/executionFixtures.ts`: add three snapshots matching the three OpenAPI examples. They are validated by the existing `componentValidator('ExecutionSnapshot')` and "no undeclared field" tests.
- `executionScenarios.ts`: three named scenarios so a replay Run can end in each case. Serve them through `handlers.ts` (`GET /executions/{id}`, list) and the class-B scripted stream frames (10.11b).
- `studioContract.test.ts`: enum parity `REPLAY_FAILURE_CODES` against the document's `ReplayFailure.code` enum, read from the document. Plus one negative fixture: `replayFailure` with `TARGET_DRIFT` and `loginStepsPresent` fails validation.

**UI behaviour, L5b `run/executionErrorNarratives.ts` and page; L5a `LoginRequiredNotice`:**
- Precedence: when `replayFailure` is non-null it selects the narrative before `status`/`errorCode`. Otherwise the existing narratives apply unchanged.
- **Login:** use the same `LoginRequiredNotice` as guided, through one adapter `loginNoticeFrom({stepId, loginStepsPresent})`. N is the 1-based position of `stepId` in the **current** draft.
  - If the step no longer exists in the draft, omit "Go to step N" and keep "Open Variables". @ux-design-expert words the step-less variant; it is not a new state.
- **Drift:** "Step N no longer matches the page…" (AC-3). Offer **"Learn again from step N"** only when all of these hold: `test.readiness === 'READY'`, `snapshot.revisionId === test.confirmedRevisionId`, and `stepId` is in the current draft.
  - The action starts a guided session with `baseRevisionId = confirmedRevisionId`, `firstLearnStepId = replayFailure.stepId` and a fresh stable `Idempotency-Key` (D-1, D-3; F8).
  - In every other case (`NEEDS_RELEARN`, a superseded revision, a missing step), show the narrative without the action. The ordinary Run already learns from the server's k. The client never sends a step after k.
  - Never repair automatically.
- **Status note for Uma:** drift arrives as `status: ERROR` (F2). The UI keys on `replayFailure`, never on status. Whether drift should be `FAILED` is a runner classification outside 008, recorded as observation OBS-A1-2 and not placed.

**AC-9 tests (Vitest + MSW):**
1. Replay login: the `false` and `true` variants, both actions.
2. Login with a deleted step: no "Go to step".
3. Drift on `READY` with a matching revision: Learn again sends exactly that start body and key.
4. Drift with a superseded revision or `NEEDS_RELEARN`: no action.
5. Negative control: an `ERROR` snapshot with `stepResults[i].message === 'TARGET_DRIFT'` and `replayFailure: null` shows **no** drift copy. This proves nothing is parsed from text.
6. A snapshot without the field shows the generic narrative.
7. Video: "Seek to step N" for `stepIndex` uses the existing replay seek. No new seek source.

### A1.7 Ownership deltas (root folds these into `lanes.json` at W0; I did not edit it)

| Lane | Adds |
|---|---|
| L0 C-int | `openapi.yaml` (A1.1, A1.4); `StudioContractTest.java` pin lines; `confinement.test.ts` pin line; `docs/architecture/ADR-002-internal-contract-surface.md` §13 row |
| @data-engineer (new single-file slot, serialized before L1's IT) | `backend/src/main/resources/db/migration/V{next}__execution_replay_failure.sql` |
| L1 Backend | `internal/RunnerReportProjection.java`, `internal/ProgressReportService.java`, `dispatch/StudioDispatchLedgerStatements.java` (`applyFinal` only), `entity/UITestExecution.java`, `ExecutionSnapshotMapper.java`, `dto/ExecutionSnapshotDto.java`, `dto/ReplayFailure.java` (new); tests `RunnerReportProjectionTest`, the observed FINAL IT, `ExecutionSnapshotMapperTest`. At F1, under a baton from L0, the non-pin `ReplayFailure` parity line in `StudioContractTest` |
| L2a | `studioTypes.ts`, `executionFixtures.ts`, `executionScenarios.ts`, `handlers.ts`, `studioContract.test.ts` |
| L5a | `LoginRequiredNotice.tsx` (shared adapter) |
| L5b | `run/executionErrorNarratives.ts`, page wiring, AC-9 replay flows |

**Expected-red ledger additions (W1 → F1):**
- `StudioContractTest` `ExecutionSnapshot` record parity stays red until L1 adds the DTO component.
- Frontend `studioContract.test.ts` stays green: the new property is optional, and the parity test lands with the type in L2a.
- If root prefers a tree that is never red, merge W1 and F1 (plan §3).

---

## A2 — "Secrets can only be typed into a password box." (RULED: drop it from 008; no new public code)

**Decision:** do not add a public code. The copy is recorded as **not renderable** on the 008 contract and does not appear in `guidedNarratives.ts`.

Why the copy is not trivially derivable, so the user's "not renderable" decision applies:
1. **Guided.** The only discriminator is the bridge `reason` (`PASSWORD_TARGET_ABSENT`), and `stopRejected` collapses it into `INVALID_CONTRACT` together with three other reasons (F9). Exposing it means:
   - a new v3 `result.failure.code` / session `errorCode` value (v3 Class B; it changes the v3 bytes 008's P1–P7 are bound to);
   - a change to `GuidedTranslationService.stopRejected` (the file OBS-011 will split, and AR-2 deliberately kept the mapping "so OBS-007 behaviour is unchanged");
   - new backend and runner-parity tests.

   That is a contract change, not a derivation.
2. **Replay.** No replay condition means "secret typed into a non-password box". The learned plan fixes the fill target at learn time, and a changed target at replay is `TARGET_DRIFT` (A1). `PASSWORD_CONTROL_READ_REFUSED` is a read/assert-value refusal (F10). Mapping it to this copy would state something false.
3. Deriving the copy from `INVALID_CONTRACT`, from a `<secret …>` token in the step, or from diagnostic text is forbidden (D-6, P4, ADR-SC-003).

Consequences, mapped to D-6's "If A2 adds none" branch:
- @dev records the copy as unreachable in the Dev Agent Record and cites this ruling.
- AC-9 replaces "`POLICY_DENIED` secret copy" with: (a) the governed `POLICY_DENIED` narrative (inherited 014-a), and (b) a negative assertion that an `INVALID_CONTRACT` result never renders "Secrets can only be typed into a password box."
- **PO action (Pax owns the AC text):** an append-only amendment to AC-3 that strikes the secret-fill `POLICY_DENIED` sentence for 008, citing this ruling. I take no PO option. Until Pax records it, the copy stays an OPEN item and is never passed by omission.
- **Follow-up candidate, not placed:** a public guided code (for example `SECRET_TARGET_NOT_PASSWORD`), if UX evidence after OBS-009's live runs shows authors hit this refusal. It needs its own architect ruling (v3 Class B plus the `stopRejected` mapping).

Trade-off: the author sees the generic `INVALID_CONTRACT` narrative instead of a precise hint, for a refusal that only triggers when a step types a `<secret>` into a non-password control. The precise hint costs a v3 contract break in 008's critical path.

---

## A3 — "None of these — I'll edit step N" (RULED: confirm Pax's D-12 default)

**Decision:** the option calls `cancelGuidedSession` with body `{schemaVersion: 3, reason: "userRequested"}` and a stable cancel `Idempotency-Key`, then moves focus to step N's editor row. It never sends a fabricated `choiceId`. Declining a `SIDE_EFFECT_CONFIRMATION` behaves the same way.

Rules:
1. **Order:** cancel first, then focus. Editing a draft while the session holds a frozen source would desync the source. After the edit, readiness becomes `NEEDS_RELEARN` with the server's k, and the next Run learns from there. The client never computes k.
2. **Cancel outcomes:**
   - `202`: poll until terminal `CANCELLED`, and show the existing `CANCELLED` narrative.
   - A refusal, or a session that has already gone terminal (expired, or finalizing after a race): show the server's state as it is, and still move focus.
   - Never retry the cancel with a new key. Never start a session automatically.
3. **Copy:** @ux-design-expert may word the `CANCELLED` narrative for the user-initiated case (for example "Stopped so you can edit step N"). It is a presentation of `CANCELLED`, not a new state (AC-3 "no state beyond this list").
4. **Focus target:** step N is the clarification's own step (`activeStep.stepId` from P2 progress), resolved by stable ID in the current draft.
5. **AC-9 test:**
   - Choosing "None of these" sends exactly one cancel with `reason: userRequested`, no `clarify`, and moves focus to the step row.
   - A declined side-effect confirmation does the same.
   - A cancel/expiry race shows the server terminal state without a second cancel.

Rejected alternatives:
- **A server "none" choice:** v3 Class B on `clarification` and `commands` plus new server semantics, and the net effect is the same terminal stop under a different code.
- **Leaving the question to expire:** holds a worker and budget, and makes the author wait for the 60 s and 20 s warnings for an outcome they already chose.
- **Editing during the live session:** source desync.

---

## Limitations and observations (not placed)

- **KL-A1-1:** a pre-Ready drift (initial page context) carries no `replayFailure`; the author sees the generic error narrative.
- **KL-A1-2:** rows reconciled from a manifest after a lost FINAL carry `null`, because the manifest has no cause.
- **OBS-A1-2:** replay drift is `status: ERROR` because the runner classifies it as a run fault (F2). Reclassifying it as `FAILED` would be a runner change, out of scope here.
- **Optional follow-up OBS-A1-3:** a structured `RunnerStepState.code` would replace exact-match on the `failure` carrier (Class B runner body change). It is not needed for correctness.

## Not claimed

No contract, source, story, lanes or lifecycle edit. No test, build or migration was run. Every test above is PLANNED_NOT_RUN. These rulings do not release 008. H-1 (015 Done) and H-2 (post-015 re-baseline; any OpenAPI drift from `c053a7f7…` re-opens A1.4's pin values only, not the design) still hold.
