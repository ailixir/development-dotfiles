# STUDIO-OBS-008: implementation and wave plan (prep 2026-10-16)

- **Author:** Aria (@architect). Preparation only. Implementation stays held until STUDIO-OBS-015 is Done (independent QA PASS, PO closure, root CLI verification), per the story's GO conditions.
- **Writes:** this file and `lanes.json` in the same directory. I made no source, contract, story, lifecycle or git changes, and ran no tests, builds, installs or database commands. All commands below were read-only (`ls`, `grep`, `shasum`, `node -e` parsing YAML/JSON).
- **Builds on, does not replace:** `docs/qa/evidence/STUDIO-OBS-008/execution-20261015/` (architect rulings P1–P7, ownership, test delta, projection schema; UX plan; QA design readiness with no blocking findings; PO scope readiness). Where this plan changes a prior choice, it says so and why.
- **Sources read:** story `STUDIO-OBS-008.story.md` v0.3.8 (all Change Log placements, including item g and KL-015-Q4), `claude-feasibility-008-011.md`, `aria008-intent.txt`, the files under `frontend/src/**` listed below, `docs/specs/studio/openapi.yaml`, `docs/specs/studio-observed-authoring/contracts/v3/*`, `backend/build.gradle.kts`, and the 015 collector scripts.

## 0. Baseline verified today, and what changed since the 2026-10-15 rulings

| # | Fact (verified by the command noted) | Consequence |
|---|---|---|
| B1 | STUDIO-OBS-015 Status **InProgress** (story line 6); 008 **Ready** | Whole plan gated at W0 |
| B2 | `openapi.yaml` sha256 now `c053a7f75656…`. The P1–P7 ruling snapshot recorded `afec6c04cdd5…`. `session-view.schema.json` (`378ab88d0abe…`) and `result.schema.json` (`7accd138c4b8…`) are unchanged | OpenAPI drifted under 015. Rulings must be re-validated against the final 015 tree (W0-4) |
| B3 | OpenAPI has 43 operations, 35 public and 8 `x-internal` (node + js-yaml parse). No `/tests/{id}/capabilities`. All 8 public guided routes exist, including `getGuidedSessionVideo` | P7 count 43→44 still holds today; re-measure after 015 |
| B4 | `PublicSession` has no `progress`; result has no `explanation`/`progress`. `REPLAYING_PREFIX`, `baseRevisionId`/`firstLearnStepId` and `relearnedFrom` exist | C-int P2/P3 additions are still required |
| B5 | `GuidedIdempotencyKey` is `required: true` on start, clarify, cancel and finalize. Execute requires a UUID key | Client sends a stable key on **all four** guided mutations, not only execute/finalize |
| B6 | `clarify` body is closed `{schemaVersion, clarificationId, choiceId, generation}`. No "none" choice exists in `clarification.schema.json` | "None of these — I'll edit step N" cannot submit a choice (see AD-3) |
| B7 | `grep -rn "guided-sessions\|guidedSession" frontend/src` → 0. `STUDIO_CAPABILITIES` readers: `ChecksStudioPage.tsx:84,1268,1282`, `UiTestConfig.tsx:2,132,140` | Matches the story |
| B8 | Class-A allowlist: `studioContract.test.ts:508-518` (10 entries). Base MSW `/tests` routes: `handlers.ts:388` (GET), `:397` (POST), `:437` (PUT). No secrets MSW handlers exist | Item g1 and the allowlist removal both land in L2a |
| B9 | Page keeps `useState<string[]>` (`ChecksStudioPage.tsx:209`) and renders "Running step {currentStep+1} of {testSteps.length}" from local Redux `currentStep` (`:1174`, badge `:878`) | Guided copy must come from server `progress`, never from this counter |
| B10 | No `frontend/playwright.config.ts`, no `frontend/e2e/`, no `@playwright/test`. `studio-runner` has `playwright` **1.63.0**. `vitest.config.ts` has no `include`, so Vitest's default include would collect `e2e/*.spec.ts`. `tsconfig.json` includes only `src/**`; `.eslintrc.json` lints `src` | The harness lane also owns `vitest.config.ts` (exclude `e2e/**`) and a new `e2e/tsconfig.json`. Neither was in the prior ownership |
| B11 | Lockfiles: `frontend/package-lock.json`, `studio-runner/package-lock.json`, root `package-lock.json`. No `pnpm-lock.yaml` or `pnpm-workspace.yaml`. `pnpm` 10.33.0 is installed | Conflicts with the pnpm preference for the one dependency add. Decision D3 |
| B12 | **Replay public gap.** Public `ExecutionErrorCode` has no `LOGIN_REQUIRED` and no `POLICY_DENIED`. Its description says runner codes outside the set "never reach `ExecutionSnapshot.errorCode`". `LoginRequiredDetail` is only on internal `RunOutcome` (`internal/dto/RunOutcome.java:28`). `grep` finds no other backend consumer of that detail. That it is not persisted is my **inference** | AC-4 replay half and AC-3 replay drift have no public trigger. Decision D1 |
| B13 | `PASSWORD_TARGET_*` appear only in internal `bridge.schema.json:896-897`. Guided `result.failure.code` has no `POLICY_DENIED`, and `errorCode` is an open string. PO record: a session-level `POLICY_DENIED` is governed only | AC-3 secret-fill copy has no public discriminator. Decision D2 |
| B14 | The 015 collector `run-backend-tasked.py` / `run-backend.py` hard-code their output to `docs/qa/evidence/STUDIO-OBS-015/execution-20261015/execution` and `JAVA_HOME=/opt/homebrew/opt/openjdk@21/...` | Root makes an 008 copy (output path only) at W0 |
| B15 | `application-local.yml` uses `LocalDevAuthFilter`, a header identity | A local real-backend authoring smoke is technically feasible (D5) |
| B16 | `tools/build-studio-observed-schemas.cjs` roots do not include `session-view` or `result` | The P2/P3 schema additions should not change runner generated outputs. C-int still runs `check()` to prove it |

### 0.1 Reconciliation with Pax's concurrent PO delta (story 0.3.9, `po-delta-validation.md` in this directory)

Pax reached the same gaps independently. The plan maps them as follows (lane owner in parentheses):

| Pax | This plan | Placement |
|---|---|---|
| A1 replay `LOGIN_REQUIRED`/drift | D1 (B12) | @architect at T0; my recommendation is A (§5) |
| A2 password-refusal discriminator | D2 (B13) | @architect at T0 (Pax frames it as resolvable inside 008 C-int); my recommendation is B unless carried by D1-A |
| A3 "None of these" | AD-3 | `cancelGuidedSession` with `reason: userRequested`, then focus step N. The same applies to a declined side-effect confirmation (L2b client, L5a/L5b UI) |
| D-1 keys on all four mutations | B5 | L2b |
| D-3 "positioned after k" ⇒ `FIRST_LEARN_STEP_NARROWED` | AC-2 | L2b/L5b: never send a `firstLearnStepId` other than the server's; render the 409 as a refusal |
| D-4 `BASE_IDENTITY_INCOMPLETE` copy | AC-2/AC-3 | L5a copy (Uma; must not claim the author changed steps); L5b sends the first step explicitly on the user's action |
| D-8 `secretId` required, pattern-valid, no name fallback | AC-5 | L2a: `handlers.ts:173` fallback removed. W2 baton: `ChecksStudioPage.tsx:122` must never write `secretId: null`. L4: the picker inserts `<secret ID>` by `secretId` |
| D-9 `getTest(id)` takes no parameter; the FE v1 `TestRequest` is not the OpenAPI v2 one; `csiId` required on create; revisions required on update | V2-b | L2a |
| D-10 action seek only from `kind: action` timings with video `AVAILABLE`; KL-015-R1/H9 may give absent or partial video | AC-7 | L5a: no stamp means no button; null status means the unavailable narrative |
| D-11 a zero-step draft gets no start (`409 RUNTIME_INCOMPATIBLE`, no cause) | AC-2 | L5b gate: Run is disabled for zero steps; the refusal copy names no cause |
| D-5, D-12 | AC-3, AD-3 | As above |

## 1. Per-AC design notes and exact files

Lane codes are defined in §2. "(new)" means a new file. All frontend paths are under `frontend/`.

### Interface drop W2.0 (L2b publishes first; others code against it)

`src/types/studio/studioGuidedTypes.ts` (new). Hand-written types, document-asserted by `studioContract.test.ts` rather than generated (no codegen dependency):
- `GUIDED_SESSION_STATES` (13 literals from `PublicSession.state`), `PublicProgress {stepCount; activeStep: {stepId; number; text} | null}`, `PublicSession` (+`progress`), `GuidedSessionView {schemaVersion:3; session; result|null}`, `GuidedResult` (result.schema plus `progress`, `explanation`), `PublicExplanation` (per `architect-public-projections.schema.json`), `GuidedClarification`, `GuidedStartContext`, `GuidedStartRequest = GuidedStartContext & {baseRevisionId?; firstLearnStepId?}`, `FinalizeRequest {schemaVersion:3; expectedSourceRevision; expectedConfigurationRevision}`, `PublicationReceipt`, `GuidedError` (error.schema: `code`, `messageCode?`, `retryable?`, `reason?`), `StudioCapabilities {vaultSecrets; guidedStart: {available:true; context} | {available:false; code}}`.

`src/services/api/studioGuidedApi.ts` (new). All calls go through `apiClient` (base `/api/v1`). Paths are `/studio/guided-sessions/${encodeURIComponent(id)}/…`:
`startSession(body, key)`, `readSession(id)`, `readResult(id) → {status:'final', result} | {status:'pending', result}` (200/202), `readClarification(id) → GuidedClarification | null` (204), `clarify(id, body, key)`, `cancel(id, key)`, `finalize(id, body, key)`, and `videoPath(id)`. `videoPath` is a string for a native `<video>`, built like `studioVideoUrl.ts`, with no fetch and no token query.

`studioApi.getCapabilities(testId)` in `src/services/api/studioApi.ts` uses `GET /studio/tests/{id}/capabilities` with `__doNotRetry: true` (P1).

Hook signatures (stubs at W2.0; bodies in W2):
- `useGuidedSession(testId: string | null)`: `{view, result, clarification, startRefusal, pending, startLearn(input), answer(choiceId), cancel(), clear()}`.
- `useStudioCapabilities(testId: string | null)`: `{status: 'unknown'|'loading'|'ready'|'unavailable', capabilities}`. It is owned by L4 in `src/utils/config/studioCapabilities.ts`.

### AC-1: typed transport and MSW mirror (L2b, composed by L2a at F1, contract by L0)
- Client and types: as in W2.0. Every guided mutation sends `Idempotency-Key` (B5). Keys are stable per logical operation and persisted per P6 under the sessionStorage key `checks.studio.guided.v1:<testId>`. That entry holds only `{testId, sessionId, startKey, finalizeKey, startRequest}`, with no authored text, values or tokens.
- MSW: `src/services/mocks/studio/guidedHandlers.ts` (new) and `guidedFixtures.ts` (new). Fixtures are built by reading `contracts/v3/fixtures.json` and `publication-fixtures.json` cases plus the C-int-added progress/explanation examples, then validated with the same Ajv harness. No hand-written payload is allowed unless a schema validates it. `src/services/mocks/studio/capabilityHandlers.ts` (new, L2b) serves `GET /tests/:id/capabilities`, including `guidedStart` unavailable variants.
- Contract test: L2a extends `studioContract.test.ts`. The guided route→client-method→handler matrix reads operationIds from the document. The class-A entries go to zero. The capability op is covered by a handler and is never allowlisted. g2 validates handler response bodies against each operation's declared `$ref`. Enum parity covers `state`, `failure.code` and readiness.
- Tests: `src/services/api/studioGuidedApi.test.ts` (new) checks paths, key headers, closed finalize body and the 202/204 branches. `src/services/mocks/studio/guidedHandlers.test.ts` (new).

### AC-2: one Run, three modes, no hidden executions (L2b hook, L5b gate and page)
- `useRunGate.ts` / `runEnablement.ts` (L5b) map readiness from `GET /tests/{id}` (`TestDetailDto.readiness`, `firstChangedStepId`, `confirmedRevisionId`, `readinessReason`):
  - `READY` → `studioApi.executeTest(id, uuidKey)`. This path already exists.
  - `UNLEARNED` → guided start without base or hint.
  - `NEEDS_RELEARN` → guided start with `baseRevisionId = confirmedRevisionId` and `firstLearnStepId = firstChangedStepId`. When `readinessReason = BASE_IDENTITY_INCOMPLETE`, show an explicit full-learn offer and do not start automatically (P4).
  - `LEARNING` → Run disabled and the live state shown.
  - Remove `LEARNING_UNAVAILABLE_REASON` (`runEnablement.ts:79`).
- Start sequence (P6): save → fresh `getTest` → `getCapabilities`. The test ID, source and configuration revisions, and environment must agree exactly, or there is no start. `guidedStart.available === false` shows the existing refusal copy and makes no request. Persist `startRequest` and `startKey` **before** the POST. A lost response retries the exact body and key.
- `useGuidedSession.ts` (`src/components/studio/guided/`, L2b) polls `readSession`. On `AWAITING_CLARIFICATION` it reads the clarification. On `FINALIZING` it calls `finalize` exactly once (promise latch that is StrictMode-safe, stable `finalizeKey`, closed body from `startRequest` revisions). After a terminal state it reads `readResult`.
  - 401 → pending re-authentication, pointer kept, never shown as success. 403 → pointer cleared. 503 or a validation refusal → pending/not ready.
  - Reconnect and reload only GET by `sessionId`. Nothing ever re-POSTs start once a `sessionId` is known.
- Redux keys (`src/store/slices/studioSlice.ts`, L2b): `guidedSessionByTestId`, `guidedSessionViewById`, `guidedResultById`, `guidedClarificationById`. The existing execution keys are untouched. Readiness is never derived in Redux.
- Tests (L5b page level): request counts for start, execute and finalize per mode, from the MSW request log. Save failure blocks start. Rapid click, StrictMode, remount, reconnect and cancel races do not double-submit. 401, Core 503 and rejected validation at `FINALIZING` show not-ready.

### AC-3: states and copy (L5a components, L5b wiring; copy by Uma)
- `src/components/studio/guided/guidedNarratives.ts` (new). One record keyed by state/code. Every string cites its source in a comment: the story AC-3/AC-4 line, or the Uma-owned inherited copy record. At T0 the Dev Agent Record declares AC-3/AC-4 the canonical copy (PO should-fix 1).
- `GuidedRunStatus.tsx` (new). Shows `PREPARING`; merged `OBSERVING`/`PROPOSING` "Understanding this page — step N of M."; `ACTING` "Running step N of M."; and `REPLAYING_PREFIX` "Repeating saved steps 1–(k-1)…" then "Learning from step k". N, M and k come only from `progress` and `session.firstLearnStepId` / `result.relearnedFrom` (P2). The step row `aria-current="step"` is matched by stable `stepId`.
- `GuidedClarification.tsx` (new). Radiogroup with `labelSource === 'PAGE'` styled as untrusted, showing role and region. AUTHORED and SAVED_INPUT labels are never decorated as PAGE. Expiry text at 60 s and 20 s comes from `expiresAt`, not from mount time. `SIDE_EFFECT_CONFIRMATION`/`CONFIRM_ACTION` render as a confirmation with Uma's copy (inherited 014-b).
- `GuidedCompletion.tsx` (new). Shows learned, replay and partial completions, the drift sentence (OBS-015 AC-4), `PUBLICATION_CONFLICT`, `UNKNOWN_OUTCOME` (no Run-again control is rendered at all), `CANCELLED`, `EXPIRED`, `BUDGET_EXCEEDED` (uses `retryable`/Retry-After, never auto-starts), governed `POLICY_DENIED` (inherited 014-a), and the start refusals `POLICY_NOT_APPROVED` (three messageCodes), `REVISION_CONFLICT:BASE_IDENTITY_INCOMPLETE`, `MISSING_SOURCE`/`AUTHORING_REFERENCE_MISSING`, `ORIGIN_NOT_ALLOWED` and `RUNTIME_INCOMPATIBLE`. Each refusal renders inline, with no session and no poll (P4).
- `ReadinessChip.tsx` (new). Reuses `LEARNED_READY_LABEL` and adds the `NEEDS_RELEARN` "Steps changed — next Run learns from step k" (k = position of `firstChangedStepId` in the current v2 steps).
- Reuse `run/executionErrorNarratives.ts` and `evidence/videoEvidenceNarratives.ts` where the state already exists (L5b and L5a respectively).
- Replay drift "Step N no longer matches the page…" → "Learn again from step N", and the AC-3 secret-fill copy, are **blocked on D1/D2** (B12/B13).
- KL-015-Q4 (conditional). At the start of T2, @dev records OBS-009 AUTHORED-ECHO-01 status (Ready today, not landed). The proposed copy key is `guidedNarratives.authoredLiteralTargetNotFound`. The trigger is the landed `failure.code` (`TARGET_MISMATCH`/`AMBIGUOUS_TARGET` are the candidates in `result.schema.json`; which one means "not found" is to be confirmed at T2). If there is no discriminator, use the item-c fallback hint, and record that choice.

### AC-4: login required (L5a component, L5b actions)
- `LoginRequiredNotice.tsx` (new). Two variants keyed on `failure.detail.loginStepsPresent` / `detail.loginStepsPresent`. "Go to step N" resolves `detail.stepId` to the current editor row by stable ID and focuses it. "Open Variables" opens the existing saved-inputs dialog in the page. The page passes callbacks; the component holds no page state.
- The guided half is fully specified. The **replay half is blocked on D1**: no public replay field carries `LOGIN_REQUIRED` (B12).

### AC-5: references, capability, never-echo (L1 backend, L0 contract, L4 frontend)
- (a) Backend per P1. `secrets/StudioSecretsCapabilityController.java` (new) and `secrets/StudioCapabilitiesService.java` (new) serve `GET /api/v1/studio/tests/{id}/capabilities` → `StudioCapabilities`. `vaultSecrets = provider is not DisabledStudioVaultProvider`, with no Vault call. canRead runs before any lookup. Absent and denied both answer 403. The response is `Cache-Control: no-store`. `guidedStart` is computed per P6 from the persisted test row, governed policy scopes, `GuidedTranslationProperties` and `ObservedReplayPins`.
- Frontend (L4): `useStudioCapabilities` in `src/utils/config/studioCapabilities.ts` is keyed by persisted test ID. It resets on selection change, 401/403 or error. Every non-ready status means unavailable, never simulated. `UiTestConfig.tsx` migrates in W2 (`formData.uiTestId`). The page migrates in W3 (L5b), and L5b then deletes the `STUDIO_CAPABILITIES` constant (baton, §3).
- (b) `src/components/studio/references/ReferencePicker.tsx` (new) is an insert menu of declared variable names and of names from `secretsApi.listSecrets(testId)`. `referenceTokens.ts` (new) provides pure `varToken(name)`, `secretToken(name)` and `insertAtSelection(text, start, end, token)`. `index.ts` (new). "New secret…" opens the existing `SecretInput.tsx` (password, `autoComplete="new-password"`) and keeps only `{name, version, allowedOrigins}`. There is no autocomplete on `<` (post-GA).
- (c) Never-echo. `SecretInput` clears on success and on failure. The MSW create handler `src/services/mocks/studio/secretsHandlers.ts` (new, L4) returns `{name, version, allowedOrigins}` only. Canaries assert the value is absent from the DOM, accessible names, clarification, result, explanation, MSW responses, sessionStorage and console, and that the ID is present.
- `quickStartTemplates.ts` and `OnboardingCoach.tsx` take the capability state as a prop or parameter from the hook, never from a build constant.

### AC-6: plan explanation and honest evidence (L1 projector, L0 schema, L5a component)
- Backend per P3. `guided/session/GuidedPublicPresentationProjector.java` (new) is shared by `GuidedSessionService` (session-view `progress`) and `GuidedPublicationResultProjector` (result `progress` and `explanation`). It is installed through `GuidedSessionConfiguration` and `GuidedPublicationConfiguration`. Read-only; it never borrows the current head for failed or conflicted runs.
- `src/components/studio/guided/PlanExplanation.tsx` (new) replaces the removed Code tab. Per step it shows the action `safeLabel` (from the P3 controlled vocabulary), `referenceIds` (IDs only), reference flows ("X from step 2 → Y in step 4"), and `learnedFromThisRun`/`reusedFrom`/`relearnedAfterDrift`. `PUBLISHED` history and `currentReadiness` render as separate facts. Receipt reads after expiry use `readResult` only.

### AC-7: video with seek (L5a)
- `evidence/VideoEvidencePanel.tsx` takes a discriminated input `{kind:'replay', snapshot} | {kind:'guided', sessionId, result}` and never fabricates a replay `PASSED` snapshot for guided runs. `evidence/studioVideoUrl.ts` gains a guided path builder. `evidence/useVideoSeek.ts` and `seekEligibility.ts` add per-action seek from `result.actionTimings` joined by `admissionId`/`stepId`/ordinal to the explanation actions (P3). Buttons are named "Seek to step N" and "Seek to action: <safeLabel>"; a null or absent offset disables the button.
- Unavailable or expired video uses the existing narrative, with Uma's neutral recording wording (PLAYBACK-COPY).
- PLAYBACK-COST: `GuidedPlaybackLoadIT.java` (new, L1) runs at W4 in its own backend window (see the ruling's measurement recipe).

### AC-8: accessibility (L5a/L5b components, L6 audit)
- One polite live region (assertive for terminal states) owned by `GuidedRunStatus`, so there is one announcer per page. Clarification takes focus on entry, and the radiogroup supports arrow keys, Tab and Escape with focus returning. `prefers-reduced-motion` disables the progress animation (`sx` with a `@media` query). The narrow layout works at 375×812.
- `src/test/a11y/studioWcagAudit.test.tsx` (L6): surfaces 4 and 5 are rewritten to Run-in-flight and clarification, entered via Run. Baseline keys are regenerated, and `color-contrast` and `target-size` are enabled. A browser companion `e2e/studio-guided-accessibility.spec.ts` (new) covers desktop and narrow layouts. FE-A11Y carried items: busy label-in-name, tooltip keyboard reach, and Add-a-step `aria-describedby`.

### AC-9: tests and first E2E (all lanes, L6 for Playwright)
- Vitest + MSW flows live in the page test files (L5b). Each named story flow gets one `it`, and the trace table goes in the Dev Agent Record.
- Playwright per P5. `playwright.config.ts` (new). `e2e/start-servers.mjs` (new) runs the real Vite app on 127.0.0.1:4177 with `VITE_API_URL=http://127.0.0.1:4178`. `e2e/mswProxy.ts` (new) is a Node MSW HTTP proxy loaded through Vite `ssrLoadModule`; unhandled requests get 502; it exposes `/__test/scenario` and `/__test/requests`. `e2e/fixtures/studio-run.webm` (new, generated, non-secret).
- `e2e/studio-guided.spec.ts` (new) covers author → Run → clarification (with a PAGE label) → login-required (both actions), plus learn → auto-finalize → replay → mixed mode, with request counts. MSW proof is never claimed as live integration.

### Inherited obligations (placement)

| Obligation | Lane | Files / proof |
|---|---|---|
| V2-a stable IDs | L2a | `tests/CreateTestDialog.tsx`; `ChecksStudioPage.tsx` step model `string[]` → `AuthoringStep[]` (W2 baton). Preserve the ID on edit and reorder; mint `crypto.randomUUID()` on insert, copy and template; drop on delete. Test: IDs survive edit and reorder; insert and copy get new IDs |
| V2-b one signature | L2a | `services/api/studioAuthoringTransport.ts` (+test); delete `types/studio/legacyStudioAuthoringAdapter.ts` (+test); legacy cases in `studioContextContract.test.ts` |
| V2-c readers | L2a | `run/useRunGate.ts` (reader type only in W2), `scheduling/StudioScheduleDialog.tsx`, `pages/CreateCheckPage/CreateCheckPage.tsx`, page |
| V2-d / g1 MSW | L2a | `authoringHandlers.ts`, `authoringState.ts`, `handlers.ts:388-437`. A v1 body gets `400 INVALID_AUTHORING` with zero state write; no fallthrough |
| V2-e fixtures | L0 (C-int-2 at F1) | `docs/specs/studio/examples/context-authoring-valid.json` (`legacy-empty-context`), `context-authoring-invalid.json` (mixed-legacy). Co-lands with V2-b |
| V2-f M12 | L2a, then root | `grep -rn -i "legacy" backend/src/main/java/com/citi/put/checks/studio studio-runner/src frontend/src`; record the `frontend/src` hits = 0 or classified |
| g2 schema validation | L2a | `studioContract.test.ts`: handler bodies for getTest/createTest/updateTest validate against the operation's `$ref` |
| 014-a governed POLICY_DENIED | L5a | `guidedNarratives.ts` (Uma copy); never the secret copy; no reason shown |
| 014-b SIDE_EFFECT_CONFIRMATION | L5a | `GuidedClarification.tsx` confirmation mode; one confirmation → continuation test |
| POLICY_NOT_APPROVED | L5a copy, L2b typed error | Inline start feedback with three messageCodes; no session, poll, finalize or retry |
| KL-015-Q4 (conditional) | L5a | See AC-3 |
| ALLOWLIST | L2a at F1 | Zero class-A entries; the final allowlist (class B `streamExecution`, class C policy) quoted in T5 |
| FE-WORKERS | root at W5 | Default-worker full Vitest run in a dedicated window |
| PLAYBACK-COPY | L5a (Uma) | Neutral guided recording copy; OBS-010 runbook note |
| PLAYBACK-COST | L1 at W4 | `GuidedPlaybackLoadIT` measurement receipt (local only) |

## 2. Lanes and disjoint ownership

One owner per file at any time. A **baton** is a sequential handoff that root records with the file hash at the handover point.

| Lane | Agent | Wave | Owns (exclusive) |
|---|---|---|---|
| **L0 C-int** | @dev (contract integrator), single writer | W1, plus C-int-2 at F1 | `docs/specs/studio/openapi.yaml`; `contracts/v3/session-view.schema.json`, `result.schema.json`, `public-ui-projections.schema.json` (new), `fixtures.json`, `publication-fixtures.json`, `wire-parity.fixtures.json`; `docs/specs/studio/examples/context-authoring-{valid,invalid}.json` (F1 only); `backend/src/test/java/com/citi/put/checks/studio/StudioContractTest.java` (pin lines only); `studio-runner/test/run/confinement.test.ts` (pin only); generator outputs via `tools/build-studio-observed-schemas.cjs` only; `docs/runbooks/studio-guided-authoring.md` (finalize paragraph per P7) |
| **L1 Backend** | @dev backend, **the only backend writer** | W2 (+W4 measurement) | `studio/secrets/StudioSecretsCapabilityController.java` (new), `StudioCapabilitiesService.java` (new); `guided/session/GuidedPublicPresentationProjector.java` (new); `GuidedSessionService.java` (projection wiring only); `GuidedSessionConfiguration.java`; `guided/publication/GuidedPublicationResultProjector.java` (shared projection call only); `GuidedPublicationConfiguration.java`; `guided/policy/ObservationPolicyRepository.java` (read-only scoped query); `guided/publication/ObservedReplayPins.java` (read-only helper, only if needed); tests `secrets/StudioCapabilitiesIT.java`, `guided/session/GuidedPublicPresentationIT.java`, `guided/evidence/GuidedPlaybackLoadIT.java` (all new). Add D1 files here if D1 = A |
| **L2a v2 authoring + mock seam** | @dev frontend | W2, F1 | `services/api/studioAuthoringTransport.ts` (+test); `types/studio/legacyStudioAuthoringAdapter.ts` (+test, delete); `types/studio/studioContextContract.test.ts`; `types/studio/studioTypes.ts`; `services/mocks/studio/handlers.ts`, `authoringHandlers.ts` (+test), `authoringState.ts`, `studioContract.test.ts`, `server.ts`; `components/studio/tests/CreateTestDialog.tsx`; `scheduling/StudioScheduleDialog.tsx` (+test); `pages/CreateCheckPage/CreateCheckPage.tsx`; **baton W2:** `pages/ChecksStudioPage/ChecksStudioPage.tsx` and `pages/ChecksStudioPage/*.test.tsx` (v2 step model only), `run/useRunGate.ts` (reader type only) |
| **L2b guided transport** | @dev frontend | W2.0 interface drop, then W2 | `types/studio/studioGuidedTypes.ts` (new); `services/api/studioGuidedApi.ts` (+test, new); `services/api/studioApi.ts`; `services/mocks/studio/guidedHandlers.ts`, `guidedFixtures.ts`, `capabilityHandlers.ts`, `guidedHandlers.test.ts` (all new); `store/slices/studioSlice.ts`; **baton W2→W3:** `components/studio/guided/useGuidedSession.ts` (+test, new) |
| **L3 Browser harness** | @dev frontend (test infra) | W2, continues as L6 | `playwright.config.ts`, `e2e/start-servers.mjs`, `e2e/mswProxy.ts`, `e2e/tsconfig.json`, `e2e/harness.spec.ts`, `e2e/fixtures/studio-run.webm` (all new); `vitest.config.ts` (exclude `e2e/**`); `package.json` + lockfile (exact `@playwright/test@1.63.0`, D3) |
| **L4 References** | @ux-design-expert with @dev gate | W2 | `components/studio/references/{ReferencePicker.tsx, referenceTokens.ts, index.ts, referencePicker.test.tsx, referenceTokens.test.ts}` (new); `components/studio/SecretInput.tsx` (+test); `services/mocks/studio/secretsHandlers.ts` (new); `checks/wizard/configs/UiTestConfig.tsx`; `studio/templates/quickStartTemplates.ts` (+test); `studio/OnboardingCoach.tsx`; **baton W2→W3:** `utils/config/studioCapabilities.ts` |
| **L5a Guided and evidence components** (my routine addition; see §3) | @ux-design-expert with @dev gate | W2 | `components/studio/guided/{GuidedRunStatus, GuidedClarification, LoginRequiredNotice, GuidedCompletion, ReadinessChip, PlanExplanation}.tsx`, `guidedNarratives.ts`, `index.ts`, and tests `{guided,clarification,loginRequired,planExplanation}.test.tsx` (all new); `components/studio/evidence/**` |
| **L5b Page integrator** | @ux-design-expert (story executor) with @dev gate | W3 | `pages/ChecksStudioPage/**`; `components/studio/run/**`; `components/studio/runs/**`; `tests/testListPresentation.ts`; `scheduling/schedulePresentation.ts`; receives batons for `useGuidedSession.ts` and `studioCapabilities.ts`; may edit L5a files only after a recorded baton at F1 |
| **L6 A11y + E2E** | L3 owner; Uma reviews | W4 | `src/test/a11y/studioWcagAudit.test.tsx`; `docs/qa/accessibility/axe-results.json` (serialized writer); `e2e/studio-guided.spec.ts`, `e2e/studio-guided-accessibility.spec.ts` (new); optional `e2e/studio-authoring-real-backend.spec.ts` (D5) |
| **R Root** | @aiox-master | all | Integration slots, batons, hash manifests, the 008 collector copy, story Dev Agent Record coordination, gate serialization |
| **Q Reviews** | independent @dev, Uma, @qa | W5 | Verdicts only; QA alone sets Done |

**Single-owner shared files:** `openapi.yaml` and every v3 contract file (L0). `handlers.ts`, `studioContract.test.ts` and `server.ts` (L2a, which composes the L2b and L4 handler files at F1). `studioApi.ts` (L2b). `studioSlice.ts` (L2b). `package.json`, lockfile and `vitest.config.ts` (L3). `axe-results.json` (L6). `ChecksStudioPage.tsx` (L2a in W2, then L5b). `StudioContractTest.java` (L0 pins only; L1 must not touch it).

## 3. Waves and ordering

I followed the given order: contract unit, then backend ∥ transport ∥ harness ∥ references, then the page integrator. I made two routine additions and two calls:
- I split transport into L2a/L2b, because `handlers.ts` and the v2 migration must stay one owner.
- I added L5a, presentational guided and evidence components in W2. It touches only new files and `evidence/**`, and it moves most of the copy work off the page critical path. If root wants fewer agents, fold L5a into L5b. That loses parallelism but changes nothing else.
- [AUTO-DECISION] Do L3 and L4, which have no contract dependency, wait for W1? → Yes, they start in W2 as given (reason: follows the stated approach; W1 is short).
- [AUTO-DECISION] Who owns the v2 page step model? → L2a, under a W2 baton (reason: removing the v1 transport signature breaks `type-check` unless page readers move in the same unit; a sequential handoff keeps one owner per file).

| Wave | Content | Exit gate |
|---|---|---|
| **W0 (root, gating)** | (1) 015 independent QA PASS → Done, PO closure, root CLI verification. User decision U1 (015 item 85) is upstream. (2) Re-baseline: sha256 of every file in `lanes.json`, OpenAPI op count, v3 hashes, the 4 frontend files 015 touched. (3) Docker daemon and JDK 21 check for Testcontainers. (4) Root makes the 008 collector copy (output path → `docs/qa/evidence/STUDIO-OBS-008/execution-<date>/execution`, semantics unchanged). (5) Aria re-validates P1–P7 against final 015 sources (B2) and rules P8 if D1 = A. (6) Decisions D1, D2, D3 recorded. (7) T0 Dev Agent Record: capability ruling quote, canonical copy declaration, Redux keys | All of (1)–(7) recorded |
| **W1** | L0 C-int unit 1: capability op + `StudioCapabilities`; `PublicProgress` on session-view and result; `PublicExplanation` on result; examples and fixtures; pins (StudioContractTest + confinement, old/new hashes quoted); runbook finalize paragraph | Contract self-checks green. The **expected-red ledger** (below) is recorded and nothing else is red |
| **W2.0** | L2b interface drop (types, client signatures, hook stubs) | Root integrates it; `type-check` green |
| **W2** | L1 ∥ L2a ∥ L2b ∥ L3 ∥ L4 ∥ L5a. Lanes run focused tests only; Gradle is serialized by root; Vitest uses `--maxWorkers=2` per lane during the parallel window | Each lane's focused commands green on its files |
| **F1 fan-in (root-serialized)** | L2a composes `guidedHandlers`, `capabilityHandlers`, `secretsHandlers`; removes the 10 class-A entries; capability op in the matrix. L0 C-int-2 deletes the two legacy context-authoring cases, in the same slot as L2a's V2-b deletions. L1 focused backend gate. Batons: `ChecksStudioPage.tsx`/`useRunGate.ts` L2a→L5b, `useGuidedSession.ts` L2b→L5b, `studioCapabilities.ts` L4→L5b, L5a components → L5b (edit rights) | Expected-red ledger empty; `type-check`, contract tests and focused suites green |
| **W3** | L5b: three Run modes, auto-finalize wiring, states/copy, login actions, references in the editor, plan explanation, video, `STUDIO_CAPABILITIES` deleted, AC-9 Vitest flows | Page and run suites green; `grep STUDIO_CAPABILITIES src` = 0 |
| **W4** | L6: WCAG rewrite and axe regeneration, Playwright specs. In parallel, a separate backend window: L1 PLAYBACK-COST measurement. Optional D5 real-backend smoke | Browser suites green on frozen source |
| **W5** | Serialized final gates (§4), then independent Dex technical review, Uma UX/a11y review, Quinn QA. Fixes go back to their lane owner and affected checks re-run | QA verdict; QA alone sets Done |

**Expected-red ledger (W1→F1):**
- FE `studioContract.test.ts` P2 fails on `getStudioTestCapabilities` until its handler is composed. P1 forbids an allowlist entry, so this is red, not allowlisted.
- Backend `StudioContractTest` route/implementation parity fails until L1 adds the controller, if the op carries `x-implemented-by`.
- Backend tests that validate session-view or result bodies against the schemas fail until L1's projector lands.

Root must list the exact test names after W1 and require each to turn green at F1, and no other test may go red. If root prefers a tree that is never red, merge W1 into F1 as one atomic slot. That serializes L1 behind contracts but costs no rework.

## 4. Verification commands per lane

All commands run from the repo root `/Users/brunobuger/orca/workspaces/put-checks/ui-studio` unless prefixed `cd frontend`. They use `pnpm run` / `pnpm exec` per the user preference. `pnpm run` against an npm-locked project runs `package.json` scripts with `node_modules/.bin` on PATH. That is my **inference**; root verifies it once at W0 with `cd frontend && pnpm run type-check`. Installs are covered by D3.

| Lane | Focused (during the lane) | Lane exit |
|---|---|---|
| L0 | `node -e "require('./tools/build-studio-observed-schemas.cjs').check()"`; `node tools/check-studio-observed-contracts.cjs` (invoke as 015's cint receipts did); `cd studio-runner && pnpm exec vitest run test/run/confinement.test.ts`; backend `StudioContractTest` via the 008 collector: `python3 .aiox/sdc/STUDIO-OBSERVED-ORCH/execute-008/run-backend-tasked.py c008-pins01 --test-tasks test -- test --tests 'com.citi.put.checks.studio.StudioContractTest'` | Old/new OpenAPI hashes quoted; op count 43→44 measured; expected-red list recorded |
| L1 | `python3 .aiox/sdc/STUDIO-OBSERVED-ORCH/execute-008/run-backend-tasked.py be008-cap01 --test-tasks test -- test --tests 'com.citi.put.checks.studio.secrets.StudioCapabilitiesIT' --tests 'com.citi.put.checks.studio.StudioContractTest'`; `… be008-proj01 --test-tasks test -- test --tests 'com.citi.put.checks.studio.guided.session.GuidedPublicPresentationIT' --tests 'com.citi.put.checks.studio.guided.publication.*'`; W4: `… be008-playback01 --test-tasks test -- test --tests 'com.citi.put.checks.studio.guided.evidence.GuidedPlaybackLoadIT'` | Zero skips unless an approved skips file is supplied; `sourceStable`/`testInputStable` true; the 16 P-test-delta cases mapped |
| L2a | `cd frontend && pnpm exec vitest run src/services/api/studioAuthoringTransport.test.ts src/types/studio src/services/mocks/studio/authoringHandlers.test.ts src/services/mocks/studio/studioContract.test.ts src/components/studio/scheduling src/pages/ChecksStudioPage --maxWorkers=2`; `pnpm run type-check`; `pnpm exec eslint <changed files>`; `grep -rn -i "legacy" frontend/src`; `grep -rn "legacyStudioAuthoringAdapter\|AUTHORING_V2_REQUIRED\|LEGACY_AUTHORING" frontend/src` → 0 | V2 a–g evidence; at F1, zero class-A entries and the allowlist quoted |
| L2b | `cd frontend && pnpm exec vitest run src/services/api/studioGuidedApi.test.ts src/services/mocks/studio/guidedHandlers.test.ts src/components/studio/guided/useGuidedSession.test.ts --maxWorkers=2`; `pnpm run type-check`; `pnpm exec eslint <changed files>` | Key and body assertions; reload/lost-response/StrictMode cases |
| L3 | `cd frontend && pnpm exec playwright test e2e/harness.spec.ts`. Asserts zero service workers registered, an unhandled API request → 502, the page loads through `apiClient`, and a WebM range request → 206. Also `pnpm exec vitest run src/components/providers/realStudioStartup.test.ts`; `pnpm exec vitest list` shows no `e2e/` file; `pnpm exec tsc -p e2e/tsconfig.json --noEmit` | Harness self-test green; production no-mock test green |
| L4 | `cd frontend && pnpm exec vitest run src/components/studio/references src/components/studio/SecretInput.test.tsx src/components/studio/templates src/components/checks/wizard --maxWorkers=2`; `pnpm run type-check`; eslint on changed files | Never-echo canaries; capability off/on/unknown/error |
| L5a | `cd frontend && pnpm exec vitest run src/components/studio/guided src/components/studio/evidence --maxWorkers=2`; `pnpm run type-check`; eslint | Copy table test with source citations; PAGE-label markup rendered as text |
| L5b | `cd frontend && pnpm exec vitest run src/pages/ChecksStudioPage src/components/studio/run src/components/studio/runs --maxWorkers=3`; `pnpm run type-check`; `pnpm run lint`; `grep -rn "STUDIO_CAPABILITIES" frontend/src` → 0 | AC-9 flow list one-to-one with tests |
| L6 | `cd frontend && pnpm exec vitest run src/test/a11y/studioWcagAudit.test.tsx` (serialized: writes `axe-results.json`); `pnpm exec playwright test` | Distinct surfaces 4/5; contrast and target-size enabled; browser a11y at 1440×900 and 375×812 |
| W5 final (root, serialized) | `cd frontend && pnpm run type-check && pnpm run lint && pnpm exec vitest run` (default workers, FE-WORKERS) `&& pnpm run build && pnpm exec playwright test`. Backend: the 015 final-gate recipe in `docs/qa/evidence/STUDIO-OBS-015/execution-20261015/final-gates-runbook01/commands.sh`, re-pointed to the 008 collector. Runner: `cd studio-runner && pnpm run test` (pins). `grep -rn guided-sessions frontend/src` → non-zero (client exists) | All required rows green on one recorded source identity; nothing claimed for OBS-009 |

The real backend is required by no 008 AC (AC-9 is MSW, and live proof is OBS-009). It is used only by the backend ITs above (Testcontainers) and, if D5 is adopted, by a local `./gradlew bootRun` (local profile, `LocalDevAuthFilter` header) authoring smoke. That smoke covers create, edit, reorder, save, getTest and capabilities only. It includes no guided start, which needs the runner and a model.

## 5. Risks and open decisions

### Decisions needing user or PO input

| ID | Decision | Options and trade-offs | My recommendation |
|---|---|---|---|
| **D1** | AC-4 replay `LOGIN_REQUIRED` and AC-3 replay drift ("Learn again from step N") have **no public replay field** (B12) | **A:** an @architect P8 ruling plus C-int adds a closed optional replay failure projection (`{code: LOGIN_REQUIRED \| STEP_DRIFT, stepId, loginStepsPresent?}`) to `ExecutionSnapshot`; L1 maps it. Probably needs persisting `RunOutcome.detail`: an @data-engineer migration and dispatcher/report ingestion files outside the current ownership. Grows 008 scope and the backend lane. **B:** PO amends AC-3/AC-4 so the replay halves move to a follow-up, and the guided halves ship. That weakens explicit AC text. **C:** infer from `stepResults` FAIL. Rejected: it conflates assertion failure with drift and login, which breaks honest evidence | **A**, because the AC text is explicit and Studio is unreleased. @data-engineer confirms persistence at W0. If A cannot fit, then B, explicitly by PO and never by omission |
| **D2** | The AC-3 secret-fill `POLICY_DENIED` copy ("Secrets can only be typed into a password box.") has **no public discriminator** (B13); P4 forbids guessing | **A:** a public discriminator via a contract change (scope growth like D1). **B:** PO records the copy as not renderable on the landed contract. The string stays out of code, and the AC-9 "POLICY_DENIED secret copy" case becomes the governed-copy case plus a negative assertion | **B** unless the PO wants D1-A to carry it too. Either way it is a PO record |
| **D3** | Adding `@playwright/test@1.63.0` with pnpm against npm lockfiles (B11) | **A:** `npm install --save-exact`, which keeps `package-lock.json` (matches the repo and CLAUDE.md, against the pnpm preference). **B:** migrate frontend to pnpm (`pnpm import`, new lockfile, `node_modules` layout change; unrelated churn and risk). **C:** run Playwright from studio-runner's install (couples packages; violates P5) | Ask the user. I lean **A** for the install only and pnpm for running scripts. The global preference says project CLAUDE.md wins on conflict, but the lead named pnpm explicitly |
| **D4** | L5a parallel components lane | Faster (copy and components off the page path) versus one more agent and a baton | Adopt; root can fold it into L5b |
| **D5** | A local real-backend authoring smoke | Cheap proof that MSW is not masking v1/v2 drift (the inherited obligation flags this). Not live integration; needs `bootRun` and a local identity header | Adopt as non-gating evidence; QA cannot credit it as OBS-009 |
| **U1** | 015 item 85 (upstream) | — | User / acceptance-owner decision; blocks everything |

### Autonomous design calls recorded

- **[AUTO-DECISION] AD-1** Should frontend types be generated from v3 or hand-written? → Hand-written and document-asserted (reason: no new dependency; this extends the existing harness).
- **[AUTO-DECISION] AD-2** Where do the capability and secrets MSW handlers live? → In new files owned by L2b and L4, composed by L2a (reason: disjoint ownership; `handlers.ts` keeps one owner).
- **[AUTO-DECISION] AD-3** What does "None of these — I'll edit step N" do, given the contract has no none-choice (B6)? → Cancel the session with its stable cancel key, then focus step N's editor row. No synthetic `choiceId` (reason: honest stop; editing the draft mid-learn would desync the frozen source). Uma and PO should confirm, because it makes that path end `CANCELLED`.
- **[AUTO-DECISION] AD-4** Where are the Redux keys and the sessionStorage key named? → The keys in §1 AC-2 and P6 are the T1 names (PO should-fix 3).

### Risks

| Risk | Mitigation |
|---|---|
| 015 is not Done, or its final contracts shift again (B2) | W0 re-baseline and P1–P7 re-validation before any dispatch; lanes code only against the W1 contract hash |
| Docker/Testcontainers availability conflicts: the 2026-10-16 01:56Z handoff says the socket was unavailable; the 2026-10-15 feasibility pass says it responded | W0 check; backend lanes do not start without it, and an unrun IT is never reported as passed |
| `ChecksStudioPage.tsx` (1,438 lines) is the critical path | New logic goes into L5a components and hooks; the page only wires them; baton timing recorded |
| Vitest collects `e2e/*.spec.ts` (B10) | L3 excludes it in `vitest.config.ts`; L3 exit checks it |
| `axe-results.json` side effect; host CPU contention while lanes run in parallel | One writer (L6), serialized; `--maxWorkers=2` per lane, default workers only in W5 |
| Explicit drift learn-again on a `READY` test (base = confirmed revision, `firstLearnStepId` = drift step) may be refused (`FIRST_LEARN_STEP_UNKNOWN`). I did not verify the 015 server semantics | W0 item for Aria against final `GuidedSessionService`; only matters if D1 = A |
| KL-015-Q4 trigger may have no discriminator | Item-c fallback recorded by @dev |
| StudioContractTest / FE contract test red between W1 and F1 | Expected-red ledger, or atomic W1+F1 (§3) |
| GuidedSessionService is later split by OBS-011 | L1 does projection wiring only; no state-machine change |
| USD 500 ceiling; spend not measurable | No model calls in 008; MSW and fixtures only |

Prior P1–P7 rulings, the QA design checks (57 synthetic schema cases PASS) and the UX copy proposals stay authoritative unless the W0 re-validation finds drift. Every test named here is PLANNED_NOT_RUN.

---

## W0 refold 2026-10-17

- **Author:** Aria (@architect). **Append-only.** Nothing above was deleted. Where this section disagrees with §0–§5, this section governs. The machine-readable form is `lanes.json` → `w0Refold20261017`.
- **Inputs:** story 0.3.13 (sha256 `be87eaac…`, block "PO scope decision — 2026-10-17 (user)"), `t0-rulings/ruling.md` A1.7 (`1127e995…`), root's W0 facts, and the second user scope change of 2026-10-17 on accessibility (relayed by root). Pax recorded that change while this refold was in progress: ADR-SC-006, story `73c09cb2…`; see R5.
- **What I ran:** read-only `ls`, `grep`, `shasum`, `git status`, `node -e` JSON reads, and the overlap script in R.7. No build, test, install, database or git write. No source file edited.
- **Also edited:** `obligations.json` gates G-1…G-5 now have an appended `amended20261017` field (npm → pnpm). The original text is kept and `storySha256` is unchanged. One `amendments` entry was added.

### R.1 W0 facts

| Fact | Source | Consequence |
|---|---|---|
| STUDIO-OBS-015 Done (QA CONCERNS) | root | H-1 closed |
| Flyway head V21 | root; also `ls db/migration \| sort -V` | A1 migration is `V22__execution_replay_failure.sql` |
| openapi `c053a7f7`, session-view `378ab88d`, result `7accd138`, commands `7a8dbc6c`, publication.schema `f5314de5`, action-timing `d2cb597f`, versions `02bc1bbc` | root; I re-hashed all seven and they match | The A1.4 pin "from" value stands; the "to" value is measured at W1 |
| Six backend tests pin the Flyway head at `"21"`: `InferenceMigrationLatestIT:100`, `ErrorCodeConstraintMigrationIT:73`, `guided/GuidedGovernanceMigrationIT:974`, `guided/GuidedRecordingMigrationIT:53`, `guided/GuidedReplayingPrefixMigrationIT:962-969`, `guided/publication/GuidedPublicationMigrationTest:1337` | `grep` | They go red at V22. They join the @data-engineer unit, landing in the same unit as V22 |
| The collectors hash `backend/ frontend/ studio-runner/ tools/ docs/specs/ .github/`, the root package files and `AGENTS.md` before and after each run | `strict-qa-20261014/capture-manifest.py` | A frontend edit during a backend run makes `sourceStable` false. See R1 |
| Both collectors write to `docs/qa/evidence/STUDIO-OBS-015/execution-20261015/execution/` | `run-backend-tasked.py:92`, `run-runner.py` | See R2 |
| `frontend/package.json` has no `packageManager` field. `studio-runner/package.json` declares `npm@11.3.0` | `grep` | Frontend: plain `pnpm run` before and after U2. Runner: use 015's `node node_modules/vitest/vitest.mjs` recipe, or `pnpm --config.package-manager-strict=false exec …` |
| No `msw:init` script and no `public/mockServiceWorker.js` | `grep`, `ls` | U2's "msw:init" verify step is recorded as a finding. Nothing is created (P5 forbids a browser worker) |
| Chromium revision 1243 is cached and matches `playwright-core` 1.63.0 | `ls ~/Library/Caches/ms-playwright`, runner `browsers.json` | No browser download is needed |
| Vite proxies `/api/v1` to `VITE_API_URL`. `LocalDevAuthFilter` injects a fixed dev identity with no header | `vite.config.ts:14-17`, `LocalDevAuthFilter.java` | The D5 smoke is same-origin through Vite. It needs no CORS and no header injection |
| No test constructs `ExecutionSnapshotDto` directly. `EvidenceRetentionTest.java:112` calls `RunnerReportProjection.project(...)` | `grep` | L1-A adds an overload and keeps the existing ones |

### R.2 Scope folded in

- **IN:**
  - A1, without the optional `replayFailure: null` example on `SnapshotFailed`.
  - A2: the copy is struck, plus the negative assertion.
  - A3: cancel, then focus step N, with **no** user-initiated `CANCELLED` wording variant.
  - U2 (the pnpm migration).
  - **D5 is IN** (it was optional before).
  - The F4/R4 note.
  - FE-CONSUMERS and FE-WORKERS.
- **Accessibility, kept** because each item is functional, a security measure or a project convention:
  - focus moves to step N's editor row for "None of these" and for "Go to step N";
  - expiry warnings are shown as text;
  - seek buttons have visible labels;
  - PAGE labels get untrusted styling;
  - the narrow, responsive layout (the AC-9 narrow-layout case, 375×812);
  - the existing jsdom `studioWcagAudit.test.tsx` stays green as a **regression guard only**. There is no surface rewrite and no rule change. Its baseline is regenerated only if 008's UI breaks it.
- **REMOVED.** Each item is reported as "descoped by the user, 2026-10-17", never as PASS, N/A or waived:
  - PLAYBACK-COST: the `GuidedPlaybackLoadIT` lane and its W4 backend window;
  - PLAYBACK-COPY;
  - the screen-reader pass, 320 px/200% reflow, forced-colors and the video text alternative;
  - the live region and its announcements;
  - clarification focus-on-entry, and radiogroup keyboard handling and tests beyond MUI defaults;
  - `aria-current="step"`;
  - `prefers-reduced-motion`;
  - the CLN-11 surface 4/5 rewrite;
  - the contrast and target-size rules;
  - `e2e/studio-guided-accessibility.spec.ts`;
  - the FE-A11Y items;
  - the accessibility part of Uma's W5 review (her UX and copy review stays);
  - the WCAG 2.1 AA target.
- **Prior decisions closed:**
  - D1 → A1.
  - D2 → A2.
  - D3 → U2 (option B).
  - D4 adopted.
  - D5 IN.
  - U1 closed.

### R.3 Environment rules for every lane

- `N24` = `PATH=$HOME/.local/share/fnm/node-versions/v24.20.0/installation/bin:$PATH`. It goes on **every runner command and every backend Gradle command**, because the backend ITs spawn host node. Frontend lanes use the host default (23.10) and record `node --version`.
- **Backend.** Run from the repo root: `N24 python3 .aiox/sdc/STUDIO-OBSERVED-ORCH/execute-015-008/run-backend-tasked.py obs008-<lane>-<n> --test-tasks test -- test --tests '<class>' … --no-daemon`. Only one Gradle process runs at a time; root serializes them, and `bootRun` counts.
- **Runner.** Run from the repo root: `N24 python3 .aiox/sdc/STUDIO-OBSERVED-ORCH/execute-015-008/run-runner.py obs008-<label> node node_modules/vitest/vitest.mjs run …`.
- **Frontend:**
  - Plain `pnpm run …` / `pnpm exec …`, only after U2 exits.
  - Each lane installs once with `pnpm install --frozen-lockfile`.
  - Vitest uses `--maxWorkers=2` per lane during the parallel window.
  - Use `pnpm exec vitest run`, never bare `pnpm run test`. The `test` script is bare `vitest`, which starts watch mode on a TTY.
- **`package.json` and lockfile.** U2/L3 is the only writer throughout. Any other lane that needs a dependency or script asks root, and L3 makes the change.
- **Models:**
  - aiox-dev: sonnet, effort high.
  - aiox-qa: sonnet, effort high.
  - aiox-devops: sonnet, effort high.
  - UI copy executor: aiox-ux (Uma).

### R.4 Final waves and lanes

The full write lists, with line-level limits, are in `lanes.json` → `w0Refold20261017.lanes`.

| Wave | Lane | Owner agent | Writes (summary) | Starts when | Narrowest verification |
|---|---|---|---|---|---|
| **W1** | **U2** (L3 core) | aiox-dev | `frontend/package.json`, `pnpm-lock.yaml` (new), `package-lock.json` (delete), `.npmrc` only if needed, with the reason recorded | W0 closed | `cd frontend && pnpm install --frozen-lockfile && pnpm exec playwright --version` (expect 1.63.0) `&& pnpm run type-check && pnpm run lint && pnpm run build && pnpm exec vitest run --maxWorkers=3`. Then both dev servers answer 200. Counts are recorded against 015 |
| W1 | **L0** C-int unit | aiox-dev | `openapi.yaml` (P1 + A1; 43→44 operations); v3 `session-view`, `result`, `public-ui-projections` (new), `fixtures`, `publication-fixtures`, `wire-parity`; pin lines `StudioContractTest:82-83` and `confinement.test.ts:287`; ADR-002 §13 rows; the F4 note at `studio-inference-contract-v1.md:124`; the runbook finalize paragraph | W0 closed | `N24 node -e "require('./tools/build-studio-observed-schemas.cjs').check()"`; `N24 node tools/check-studio-observed-contracts.cjs`; `… run-runner.py obs008-c-confinement01 node node_modules/vitest/vitest.mjs run test/run/confinement.test.ts -t 'pins the entire reviewed OpenAPI document including observed routes' --coverage.enabled=false`; `… run-backend-tasked.py obs008-c-pins01 --test-tasks test -- test --tests 'com.citi.put.checks.studio.StudioContractTest' --no-daemon` (ledger rows only) |
| W1 | **DE** V22 | aiox-data-engineer | `V22__execution_replay_failure.sql` (new); `ExecutionReplayFailureMigrationIT.java` (new); the six head-pin lines (R.1) | W0 closed | `… obs008-db-v22-01 --test-tasks test -- test` with the new IT plus the six head-pinned classes, `--no-daemon` |
| W1 | **L1-A** backend A1 | aiox-dev (the only backend main-source writer) | `RunnerReportProjection`, `ProgressReportService`, `StudioDispatchLedgerStatements` (`applyFinal` only), `UITestExecution`, `ExecutionSnapshotMapper`, `ExecutionSnapshotDto`, `dto/ReplayFailure` (new); tests `RunnerReportProjectionTest`, `ExecutionSnapshotMapperTest`, `internal/ProgressCallbackIT` (the observed FINAL IT), and `sse/SseStreamingIT` only for the SSE frame | W0. The ITs also need DE exit | `… obs008-be-a1-unit01 … --tests '…internal.RunnerReportProjectionTest' --tests '…ExecutionSnapshotMapperTest'`; after DE: `… obs008-be-a1-it01 … --tests '…internal.ProgressCallbackIT' --tests '…sse.SseStreamingIT'` |
| **W2** | **L3H** harness + U2 docs | aiox-dev (L3 owner) | `playwright.config.ts` (an MSW project by default, plus a real-backend project behind an env flag); `e2e/{start-servers.mjs, mswProxy.ts, tsconfig.json, harness.spec.ts, fixtures/studio-run.webm}`; `vitest.config.ts`; the frontend npm lines in `CLAUDE.md`, `AGENTS.md`, `README.md`, `frontend/README.md`, `MFE_GUIDE.md`, `ARCH.md`, `.github/copilot-instructions.md`, `.cursor/rules.md`, `.cursor/rules/development.mdc` and `dev.sh` | U2 exit | `pnpm exec playwright test e2e/harness.spec.ts`; `pnpm exec vitest list` shows no `e2e/`; `pnpm exec tsc -p e2e/tsconfig.json --noEmit`; `pnpm exec vitest run src/components/providers/realStudioStartup.test.ts`; the npm grep over those docs |
| W2 | **L2a** | aiox-dev | The v2 authoring set (§2), plus A1: `studioTypes.ts`, `executionFixtures.ts`, `executionScenarios.ts` (scripted frames), and the matrix tests only if needed; `handlers.ts`, `studioContract.test.ts` (enum parity plus a negative fixture), `server.ts`, `fixtures.ts`, `readinessFixtures.ts`; W2 batons on `ChecksStudioPage.tsx`, its tests and `useRunGate.ts` | U2 exit (v2); L0 exit (A1 parts) | `pnpm exec vitest run src/services/api/studioAuthoringTransport.test.ts src/types/studio src/services/mocks/studio src/components/studio/scheduling src/pages/ChecksStudioPage --maxWorkers=2`; `pnpm run type-check`; eslint on changed files; the legacy greps |
| W2 | **L2b** | aiox-dev | W2.0 drop first: `studioGuidedTypes.ts`, `studioGuidedApi.ts` (+test), `studioApi.ts`, `guidedHandlers`/`guidedFixtures`/`capabilityHandlers` (+test), `studioSlice.ts`, `useGuidedSession.ts` (+test, baton) | U2 + L0 exit | `pnpm exec vitest run src/services/api/studioGuidedApi.test.ts src/services/mocks/studio/guidedHandlers.test.ts src/components/studio/guided/useGuidedSession.test.ts --maxWorkers=2`; `type-check` |
| W2 | **L4** | aiox-ux with @dev gate | `references/**` (new), `SecretInput` (+test), `secretsHandlers.ts` (new), `UiTestConfig.tsx`, `quickStartTemplates` (+test), `OnboardingCoach.tsx`, `studioCapabilities.ts` (baton) | W2.0 integrated | `pnpm exec vitest run src/components/studio/references src/components/studio/SecretInput.test.tsx src/components/studio/templates src/components/checks/wizard --maxWorkers=2`; `type-check` |
| W2 | **L5a** | aiox-ux with @dev gate | `guided/{GuidedRunStatus, GuidedClarification, LoginRequiredNotice (loginNoticeFrom adapter + step-less variant), GuidedCompletion, ReadinessChip, PlanExplanation}.tsx`, `guidedNarratives.ts`, `index.ts`, four tests; `evidence/**` | W2.0 integrated | `pnpm exec vitest run src/components/studio/guided src/components/studio/evidence --maxWorkers=2`; `type-check` |
| W2 | **L1-P** backend P1–P3 | aiox-dev (same agent as L1-A) | `secrets/StudioSecretsCapabilityController`, `StudioCapabilitiesService` (new); `GuidedPublicPresentationProjector` (new); projection wiring in `GuidedSessionService` and the two configurations, plus `GuidedPublicationResultProjector`; read-only `ObservationPolicyRepository` and `ObservedReplayPins`; ITs `StudioCapabilitiesIT` and `GuidedPublicPresentationIT` (new); `StudioContractTest` non-pin lines (baton from L0) | L0 exit, after L1-A | `… obs008-be-cap01 … --tests '…secrets.StudioCapabilitiesIT' --tests '…StudioContractTest'`; `… obs008-be-proj01 … --tests '…guided.session.GuidedPublicPresentationIT' --tests '…guided.publication.ObservedProfileDriftTest' --tests '…guided.publication.GuidedPublicationEvidenceTest'` |
| **F1** | root slot | root | L2a composition and allowlist to zero. L0-F1 (`context-authoring-{valid,invalid}.json`) co-lands with the V2-b deletions. One `obs008-f1-be01` backend run over the union of the L0, DE, L1-A and L1-P selectors. Batons recorded with hashes | W2 exit | Ledger empty; `type-check` and the contract tests green |
| **W3** | **L5b** | aiox-ux (story executor) with @dev gate | `pages/ChecksStudioPage/**`, `run/**` (incl. `executionErrorNarratives` with `replayFailure` precedence), `runs/**`, the two presentation files; batons: `useGuidedSession`, `studioCapabilities`, the L5a files | F1 | `pnpm exec vitest run src/pages/ChecksStudioPage src/components/studio/run src/components/studio/runs src/components/studio/guided --maxWorkers=3`; `pnpm run type-check && pnpm run lint`; `grep -rn STUDIO_CAPABILITIES frontend/src` = 0 |
| W3 | **L6-author** | aiox-dev (L3 owner) | `e2e/studio-guided.spec.ts`, `e2e/studio-authoring-real-backend.spec.ts` (new). Authoring only | F1 | `pnpm exec tsc -p e2e/tsconfig.json --noEmit` |
| **W4** | **L6** | aiox-dev (L3 owner) | The two specs, `playwright.config.ts`, `start-servers.mjs`; `studioWcagAudit.test.tsx` only if 008 broke it (baseline keys only); `axe-results.json` (side effect, single writer) | W3 exit, frozen source | `pnpm exec playwright test e2e/studio-guided.spec.ts`; `cd backend && N24 ./gradlew bootRun --no-daemon` with `pnpm exec playwright test --project=real-backend e2e/studio-authoring-real-backend.spec.ts`; `pnpm exec vitest run src/test/a11y/studioWcagAudit.test.tsx` |
| **W5** | root, then reviews | root, Dex, Uma (UX/copy only), Quinn | — | W4 | `cd frontend && pnpm run type-check && pnpm run lint && pnpm exec vitest run && pnpm run build && pnpm run test:e2e`. Backend final gate through the collector (`obs008-final-*`, N24). Runner pin through `run-runner.py`. QA alone sets Done |

U2 notes for the lane. These are inferences, not run:
- In a non-TTY shell pnpm may refuse to replace an npm-built `node_modules`. Deleting the gitignored `frontend/node_modules` first is the expected fix, and the lane records it.
- pnpm installs `file:../../put-core-components` as a copy, not a symlink. The lane keeps the `file:` spec and records the behaviour.
- No other frontend lane touches `frontend/` until U2 exits.

### R.5 W1 dispatch list

1. **Start immediately, in parallel:**
   - **U2** (aiox-dev)
   - **L0** C-int W1 unit (aiox-dev)
   - **DE** V22 (aiox-data-engineer)
   - **L1-A** backend derivation (aiox-dev)

   L0, DE and L1-A write nothing under `frontend/`, and the four W1 write sets do not overlap. Their collector runs still need R1's source rule while U2 is writing the lockfile.
2. **When U2 exits:** **L2a** (v2 first; its A1 parts wait for L0) and **L3H**.
3. **When U2 and L0 have both exited:** **L2b** W2.0 drop.
   - After root integrates W2.0 (type-check green): L2b body ∥ **L4** ∥ **L5a**.
   - **L1-P** starts after L0 exit and L1-A.

### R.6 Critical path and expected-red ledger

**Critical path:** W0 → max(U2, L0) → L2b W2.0 → W2 frontend lanes → F1 → L5b → L6 → W5.

The backend chain is L0 and DE → L1-A → L1-P. It runs alongside the frontend path and must close by F1. If L1-P slips, it becomes the critical path at F1.

**Expected red, W1 → F1:**
- **R1** `StudioContractTest` `ExecutionSnapshot` record parity. It is red while only one of L0's document or L1-A's DTO has landed. Root takes the receipt after both have landed.
- **R2** Capability-route parity, until the L1-P controller lands.
- **R3** Backend tests that validate session-view and result bodies, if P2/P3 add required fields, until the L1-P projector lands. Candidates are `ObservedProfileDriftTest` and `GuidedObservationPrunerIT`; L0 records the exact names.
- **R4** Frontend `studioContract.test.ts` has no capability handler until F1.

Nothing else may go red. DE lands V22 and the head pins together, so no head-pin red is expected.

### R.7 Write-overlap check

Script: `node refold.cjs docs/qa/evidence/STUDIO-OBS-008/prep-20261016/lanes.json`, from the session scratchpad. It treats `dir/**` and `*` as patterns, and its detector was self-tested on positive and negative cases.

| Group | Lanes | Write entries | Overlaps |
|---|---|---|---|
| W1 | U2, L0, DE, L1-A | 35 | 0 |
| W2 | L3H, L2a, L2b, L4, L5a, L1-P | 92 | 0 |
| F1 | L0-F1, L2a-F1 | 28 | 0 |
| W3 | L5b, L6-author | 23 | 0 |
| W4 | L6 | 6 | 0 |

Files with more than one owner pass between waves only as recorded batons:
- `StudioContractTest` L0@W1 → L1-P@W2 (non-pin lines).
- `useGuidedSession` L2b → L5b.
- `studioCapabilities` L4 → L5b.
- The L5a files and `evidence/**` L5a → L5b.
- `playwright.config.ts` and `start-servers.mjs` L3H → L6 (same agent).
- The two specs L6-author → L6.

### R.8 Root decisions

| ID | Decision | Recommendation |
|---|---|---|
| R1 | The collector manifest covers `frontend/`, so any frontend edit during a backend or runner run makes `sourceStable` false. Option A: a hold window for every run. Option B: focused runs during active editing are non-evidentiary; lane-exit and gate runs are stable, inside hold windows | B |
| R2 | obs008 receipts would land in 015's closed evidence directory. Option A: accept it and cite the path. Option B: copy both collectors, changing only the output path to `docs/qa/evidence/STUDIO-OBS-008/execution-20261017/execution` | B |
| R3 | D5 needs `bootRun`, and the tasked collector runs test tasks only | Run `bootRun` directly as the window's single Gradle process, with N24. Evidence: the bootRun log plus the Playwright JSON report |
| R4 | The 015-Done tree is uncommitted (about 1,247 `git status` entries) | Checkpoint it before W1 so 008's diffs are separable |
| R5 | The PO had not recorded the second scope change (accessibility) when this refold started | **Resolved during the refold.** Pax recorded it as PO scope decision 2: `ADR-SC-006-accessibility-scope-functional-only.md`, story sha256 `73c09cb2…`, and `obligations.json` `amended20261017b` on AC-8, G-7 and FE-A11Y. This refold matches it. L6 records before and after if it regenerates the audit baseline. No root action |

All tests named in this section are PLANNED_NOT_RUN.
