# STUDIO-OBS-008 W3 lane L6-author receipt: first E2E and D5 smoke specs (authoring only)

- Agent: @dev (Dex), YOLO. Date: 2026-10-17. Head: 734ad704f (dirty tree; L5b is integrating `ChecksStudioPage` in parallel).
- Exit: **specs written and compiling; NOT executed** (by instruction, W4 runs them on frozen source). Verified: `tsc -p e2e/tsconfig.json` exit 0, `eslint e2e playwright.config.ts` exit 0, `playwright test --list` collects each spec in the right project only, and `--list` started no server.
- Logs: `logs/` next to this file.
- Read-only inputs used: the story (AC-8, AC-9, D5, PO scope decisions 1 and 2), `lanes.json` (L6-author, L6), `implementation-plan.md`, the L3H and L5a receipts, the harness (`playwright.config.ts`, `e2e/start-servers.mjs`, `e2e/mswProxy.ts`, `e2e/harness.spec.ts`, `e2e/tsconfig.json`), the guided components and `guidedNarratives.ts`, the MSW handlers and fixtures under `src/services/mocks/studio/`, `ChecksStudioPage.tsx`, `RunControl.tsx`, `CreateTestDialog.tsx`, the backend `application-local.yml`, `LocalDevAuthFilter`, `CsiOwnershipEvaluator`, `StudioService` (CSI checks). I wrote nothing outside the write set.

## 1. Files

| Path | Action | sha256 |
|---|---|---|
| `frontend/e2e/studio-guided.spec.ts` | new (481 lines; 8 tests in `--list`, from 7 `test()` blocks, one of them inside the login-variant loop) | `8ab624fc40ff8c12e697cdf67070dabfa8b0abb06f65cb3be37f5986bab77db1` |
| `frontend/e2e/studio-authoring-real-backend.spec.ts` | new (231 lines; 2 tests, serial) | `32e904b917771f909b9e8ac4d57da81e066f8f88d1b7f44e5b4a742f7a54ea4c` |
| `docs/qa/evidence/STUDIO-OBS-008/execution-20261017/lanes/L6-author/receipt.md`, `receipt.json`, `logs/*` | new | (this receipt) |

Not touched: `playwright.config.ts`, `e2e/start-servers.mjs`, `e2e/mswProxy.ts`, `e2e/harness.spec.ts`, `e2e/tsconfig.json`, anything under `frontend/src`, the story, `dispatch-governance.js`. No `pnpm install/add/remove`, no Gradle, no backend, no test execution, no commit/stash/push. No PID was signalled (22246, 44737, 13577, 13581 untouched).

IDS: REUSE of the L3H harness patterns (`harness.spec.ts`: proxy URL, `recorded()`, `selectScenario`-style POST to `/__test/scenario`, `RecordedRequest` type import) and of the L5a copy (`guidedNarratives.ts`); CREATE for the two spec files, which the lane defines as new.

## 2. Verify (what I ran and what it returned)

All from `frontend/`, host Node v23.10.0, pnpm.

| # | Command | Result |
|---|---|---|
| V1 | `pnpm exec tsc -p e2e/tsconfig.json --noEmit` | exit 0, no output (`logs/01-tsc-e2e.log`) |
| V2 | `pnpm exec eslint e2e playwright.config.ts --ext .ts,.mjs` | exit 0 (`logs/02-eslint-e2e.log`). The first run found one `no-irregular-whitespace` (a literal U+200B I had typed inside a regex); fixed to the `​` escape and re-run |
| V3 | `pnpm exec playwright test --list` (flag unset) | exit 0, 13 tests in 2 files: the 5 `harness.spec.ts` tests plus 8 from `studio-guided.spec.ts` (the two login variants are 2 of them), all `[msw]`; `studio-authoring-real-backend.spec.ts` absent (`logs/03-list-msw.log`). |
| V4 | `CHECKS_E2E_REAL_BACKEND=1 pnpm exec playwright test --list` | exit 0, 2 tests in 1 file, both `[real-backend]`, only `studio-authoring-real-backend.spec.ts` (`logs/04-list-real-backend.log`) |
| V5 | `pnpm exec playwright test --list --project=real-backend` with the flag unset | exit 1, `Project(s) "real-backend" not found. Available projects: "msw"` (expected; same as L3H) (`logs/05-list-real-backend-project-unset.log`) |
| V6 | `--list` starts no server | `lsof -iTCP:4177 -iTCP:4178 -sTCP:LISTEN` was empty before and after each `--list`, and `ps` showed no `start-servers.mjs`. **Inference** (not a trace): `--list` does not launch `webServer` on this Playwright. The only Chrome processes on the host belong to a `playwright-mcp` session and a studio-runner session, not to me |

Not run (by instruction): any spec execution, `vitest`, Gradle, `bootRun`, the a11y audit.

Count check for V3: `studio-guided.spec.ts` lists first-Run (1), clarification (2), login x2 variants (2), READY replay (1), mixed mode (1), narrow layout (1) = 8. The 13 total is 5 + 8. The 7 `test()` blocks are first-Run, 2 clarification, the login test (run once per variant), replay, mixed mode and narrow layout.

## 3. Flow to test mapping

AC-9 E2E sentence: "`frontend/e2e/studio-guided.spec.ts` drives author → Run → clarification → login-required against MSW". Plan sentence (AC-9): "covers author → Run → clarification (with a PAGE label) → login-required (both actions), plus learn → auto-finalize → replay → mixed mode, with request counts".

| AC-9 / plan item | Test (file) | What it asserts |
|---|---|---|
| author (edit, add, reorder, save, stable IDs) | `author edits, adds and reorders steps with stable IDs, then a first Run learns and finalizes on its own` (`studio-guided.spec.ts`) | Edits step 3, adds a step, moves it up, saves through the page. Reads the draft back from the proxy: the order is right, the three surviving steps keep their fixture IDs, the inserted step has a new UUID |
| Run, learn, auto-finalize, request counts | same test | Start body has `schemaVersion: 3`, the draft's `testId` and a non-empty `Idempotency-Key`. Status lines appear in order (`Preparing your steps.`, `Understanding this page — step 1 of 4.`, `Running step 1 of 4.`, `Running step 4 of 4.`, `Saving what this run learned…`). Ends on `Completed — learned from this run.` The proxy log has exactly start 1, finalize 1, clarify 0, cancel 0, and no unhandled `/api/v1/studio/` request |
| clarification with a PAGE label | `a page-derived choice is shown as untrusted text, answered once, and the Run completes` | The question `Step 2 says: '…'. Which one did you mean?`; two choices with `Page-derived` markers, `role: textbox` x2, `region: region-main` x1; 3 radios; Continue disabled until a choice; nothing sent before the answer; one `clarify` with `choiceId: choice-1` and a key; ends complete; counts 1/1/0/1 |
| "None of these" (A3; focus is a kept flow behaviour) | `"None of these" cancels once, sends no answer, and moves focus to that step` | One `cancel` with `reason: userRequested`, zero `clarify`, zero `finalize`; the existing CANCELLED title `The run was stopped on request`; no success text; `Step 2` editor focused |
| login-required, both variants, both actions | `blocked by login (...) › names step 1, offers both actions, finalizes nothing` x2 | `loginNoLoginSteps` / `loginStepsFailed` sentence naming step 1; `Go to step 1` focuses the Step 1 editor; `Open Variables` shows the Variables dialog heading; no success text; finalize 0 |
| later replay, request counts | `a later Run of a READY test replays: one execute, no guided session` | Chip `Learned · ready to repeat`; one POST `/execute` with a key; zero guided starts. The mock keeps the accepted execution `PENDING` (no runner), so counts are the proof, not an outcome |
| mixed mode | `mixed mode: a changed draft repeats the saved prefix, learns from the changed step and finalizes` | Chip `Steps changed — next Run learns from step 2`; lines `Repeating saved steps 1–1…`, `Learning from step 2`, `Saving what this run learned…`; ends `Completed — steps 2–4 learned again.`; start 1, finalize 1 |
| narrow layout (AC-8 a; AC-9 "narrow layout") | `narrow layout, 375x812 › the blocked-by-login actions stay inside the viewport width` | Both buttons have a bounding box within `[0, 375]` horizontally. Real layout only exists in a browser, which is why it is here as well as in Vitest |
| D5: create | `create a draft, then add, edit and reorder steps and save: step IDs stay stable` (`studio-authoring-real-backend.spec.ts`) | Creates via the New UI Test dialog against the real backend |
| D5: edit, reorder, save, stable IDs, getTest | same test | 3 steps added and saved: 3 distinct UUIDs. Then step 2 edited, a 4th step added, moved up, saved: texts in the new order, the 3 original IDs unchanged and in order, the inserted ID new, `sourceRevision` increased. Reload: order, values and IDs identical |
| D5: capabilities | same test, last step | `GET /studio/tests/{id}/capabilities` is 200 with boolean `vaultSecrets` and boolean `guidedStart.available` (shape only; availability needs a runner and a gateway) |
| D5: preconditions | `preconditions: the backend answers, Studio is on, and a CSI is registered` | `/actuator/health` reachable, `UI_TEST` source and `STUDIO` feature enabled, at least one CSI listed. Fails with a message naming the missing one; the next test is serial and skips if it fails |

AC-9 items that are Vitest cases and are **not** in this E2E (not claimed): unknown outcome, publication conflict, replay drift, `POLICY_DENIED`, `BUDGET_EXCEEDED`, reference insert, capability off/on, never-echo canaries, reconnect without double-submit, the `POLICY_NOT_APPROVED` start feedback.

## 4. Selectors marked "reconcile in W4"

Each assumes L5b's final page. They are marked `RECONCILE(W4)` in the code unless noted.

| # | Selector or assumption | Where | Assumption |
|---|---|---|---|
| R1 | `getByRole('button', {name: 'Run Test', exact: true})` enabled for an `UNLEARNED` and a `NEEDS_RELEARN` draft | every Run | Today `RunControl` keeps Run disabled for those states ("learning unavailable in this build"). L5b must enable it and keep the label `RUN_LABEL` = `Run Test`. If L5b renames it, change `runButton` (one place) |
| R2 | Guided status lines, completion text, question, login sentences and chips are rendered **in the page** with the exact L5a copy | all MSW tests | The page mounts `GuidedRunStatus`, `GuidedClarification`, `GuidedCompletion`/`LoginRequiredNotice`, `ReadinessChip`. No `ChecksStudioPage` import of them existed when I read it (`grep guided` = 0 hits), so this is the largest assumption |
| R3 | Status-line recorder (`watchStatusLines`) | first-Run and mixed-mode tests | Timing-sensitive: it reads `document.body.innerText` through a `MutationObserver` and expects each line to appear as the hook polls (1 s). It asserts order only, not presence of every line. If L5b renders status somewhere that is not in `innerText` (hidden tab), it will miss |
| R4 | `getByTestId('studio-save-state')` has text `Saved` | first-Run test, D5 test | An existing id on the save chip (`ChecksStudioPage.tsx`). No role exists for it. I added no id |
| R5 | `getByRole('heading', {name: 'Variables'})` after `Open Variables` | login tests | L5b wires `onOpenVariables` to the page's existing Variables dialog (`DialogTitle` renders an `h2`) |
| R6 | `getByRole('textbox', {name: 'Step N', exact: true})` focused after `Go to step N` and after `None of these` | login and clarification tests | L5b focuses `inputProps.id = stepInputId(index)` of that row (existing `aria-label` is `Step N`) |
| R7 | The page clears a `CANCELLED` session to the existing `The run was stopped on request` narrative | None-of-these test | Ruling A3: the existing narrative, unchanged |
| R8 | `getByRole('radio', {name: /^Reference/})`, `Continue`, and `/^None of these/` | clarification tests | Accessible names come from the `FormControlLabel` text; `Reference` choice name starts with `Reference` |
| R9 | `unhandledStudioPaths(...) == []` after a full learn | first-Run and clarification tests | No `/api/v1/studio/` request falls through the mocks while the page runs. A request L5b adds that no handler serves would fail this. `/api/v1/csi` and `/api/v1/features` are not under that prefix |
| R10 | The mixed-mode test seeds `a0000000-0000-0000-0000-000000000004` into the mock list by a no-op `PUT` through the proxy | mixed-mode test | Relies on the mock's authoring store (an unchanged body keeps `NEEDS_RELEARN` and writes the draft, which puts it in the list). A proxy scenario that seeds the list would replace it |
| R11 | The start body carries no assertion on `firstLearnStepId`/`baseRevisionId` | both learn tests | I did not assert the hints because the story leaves them to L5b/L2b (D-4 sends `firstLearnStepId` only for `BASE_IDENTITY_INCOMPLETE`) |

## 5. Requirements for W4 and root

### 5.1 Proxy scenarios (blocking for 5 of the 8 MSW tests)

`mswProxy.ts` is not in L6's write set and only has `default`. The default guided script is a plain full learn: no question, no login failure. `selectScenario` fails a test loudly (naming the scenario) if the name is unknown; it never skips.

| Scenario name | Must do after the reset | Used by |
|---|---|---|
| `guided-clarification-page` | `setGuidedScenario(learnWithQuestion('PAGE_CHOICE', 1))` | the 2 clarification tests |
| `guided-login-required-no-login-steps` | `setGuidedScenario(loginRequired(false))` | login variant 1, narrow layout |
| `guided-login-required-login-steps-failed` | `setGuidedScenario(loginRequired(true))` | login variant 2 |

`setGuidedScenario` is exported from `src/services/mocks/studio/guidedHandlers.ts`; `learnWithQuestion` and `loginRequired` from `guidedFixtures.ts`. Sketch of the change, for whoever owns `mswProxy.ts` in W4:

```ts
// scenarios: Record<string, { handlers: RequestHandler[]; apply?: () => void }>
//   default: { handlers: studioHandlers as RequestHandler[] }
//   'guided-clarification-page': { handlers: studioHandlers as RequestHandler[], apply: () => setGuidedScenario(learnWithQuestion('PAGE_CHOICE', 1)) }
//   ...
// In POST /__test/scenario: after resetStudioMocks() (which resets the guided scenario to LEARN), call scenarios[name].apply?.()
// getResponse(...) then uses scenarios[scenario].handlers.
```

`apply` must run **after** `resetStudioMocks()`, because `resetGuidedMocks()` puts the guided scenario back to LEARN. The guided scenario is process-global, which is safe because `workers: 1`.

If root prefers not to touch the proxy, the alternative is to run only the 3 tests that need none (first-Run, READY replay, mixed mode) and record the other 5 as not run. I recommend the proxy change.

### 5.2 Other MSW-side facts W4 should know

- `GET /api/v1/csi` and `GET /api/v1/features` are not served by the studio handlers (502 from the proxy; the app falls back to defaults for features). Consequence: the Create Test dialog cannot offer a system in the `msw` project, so "author" there edits an existing fixture draft. Creating a draft is covered only by D5. If W4 wants create in the MSW E2E, the proxy needs a `/csi` handler; not added.
- The mock keeps an accepted replay execution `PENDING` forever, so the replay test asserts counts, not an outcome.
- Fixture IDs used (all in `demoFixtures.ts`/`readinessFixtures.ts`, in the default list's first page): `d0000000-0000-4000-8000-000000000003` (UNLEARNED, 3 steps), `d0000000-0000-4000-8000-000000000001` (READY), `a0000000-0000-0000-0000-000000000004` (NEEDS_RELEARN, seeded into the list by test code). If the demo list grows past 20 newer items, the `d…03`/`d…01` rows could leave the first page (the page selects only from page 1). I checked the `updatedAt`-desc order by reading the fixtures: `d…03` is about 3rd and `d…01` about 8th among the readable drafts.
- Timing: the hook polls once a second and the mock moves one script step per read, so a 4-step full learn is about 13 reads plus finalize (roughly 15 to 20 s); tests set `test.setTimeout(90_000 to 120_000)` and wait up to 45 to 60 s for terminal text. The global timeout in `playwright.config.ts` is 60 s, so the config is not changed.
- Run with: `cd frontend && pnpm exec playwright test e2e/studio-guided.spec.ts` (one worker, port 4177/4178).

### 5.3 D5: real-backend run

Command, from the L6 brief: `cd frontend && CHECKS_E2E_REAL_BACKEND=1 pnpm exec playwright test --project=real-backend e2e/studio-authoring-real-backend.spec.ts`. The flag name in `lanes.json` L6 (`STUDIO_E2E_REAL_BACKEND`) is stale; L3H chose `CHECKS_E2E_REAL_BACKEND`.

bootRun preconditions (checked from code, **not** by running the backend):

| Need | Why | Source |
|---|---|---|
| `./gradlew bootRun` with the `local` profile, the only Gradle process, node 24 on PATH as in `lanes.json` | Local Postgres is embedded; the profile enables `LocalDevAuthFilter` (identity `bb12345`, role `checks-admin`) | `application-local.yml`, `LocalDevAuthFilter.java` |
| `CHECKS_SOURCE_UI_TEST=true` in the bootRun environment | `checks.sources.UI_TEST` is `${CHECKS_SOURCE_UI_TEST:false}`, and the Studio page renders "not available in this environment" otherwise | `application-local.yml`, `ChecksStudioPage.tsx:1475-1480` |
| At least one registered CSI, e.g. `FLYWAY_LOCATIONS=classpath:db/migration,classpath:db/seed` | A draft's CSI must be registered (`requireRegisteredCsi`, `ck_ui_tests_csi_registered`). The local profile uses `FLYWAY_LOCATIONS` default `classpath:db/migration`, which has no CSI rows. `db/seed/R__sample_data.sql` inserts 178672, 285614, 396705 | `StudioService.createTest`, `application.yml:20`, `application-dev.yml`, `R__sample_data.sql` |
| `checks-admin` may write any CSI | `CsiOwnershipEvaluator.canWrite` returns true for `checks-admin`, so the dev identity needs no ownership rows | `CsiOwnershipEvaluator.java` |
| Backend on `http://127.0.0.1:8080` or `CHECKS_E2E_BACKEND_URL` | Vite's `/api/v1` proxy targets it | `e2e/start-servers.mjs` |
| No runner, no model gateway, no Vault | D5 starts no guided session and reads only the capabilities shape | plan §4 |

**Unverified, W4 must confirm:** (a) the seed `R__sample_data.sql` still applies cleanly on top of migrations V1..V22 (it is used by the `dev` profile, not by `local`); if it does not, insert one `csi_systems` row by SQL instead; (b) the shape of `GET /api/v1/csi` (the precondition test accepts an array, `{data: []}` or `{content: []}`); (c) that `Idempotency-Key` is not required of the browser's `POST /studio/tests` beyond what `apiClient` already sends; (d) that the local DB is left tidy: the test deletes the draft it created in `afterAll` (best effort, ignores a failure), and names it `E2E D5 authoring smoke <timestamp>`.

D5 is non-gating local evidence. It must be reported as "local real-backend authoring smoke, not OBS-009". Evidence for W4: the `bootRun` log plus the Playwright report, per the plan (R3).

## 6. Deviations and decisions

1. **[AUTO-DECISION] Fail, don't skip, on a missing proxy scenario.** Reason: a skip would let the clarification and login flows (the heart of AC-9) disappear from a green run unnoticed. The cost is that 5 tests are red until §5.1 lands.
2. **[AUTO-DECISION] "author" edits an existing fixture draft in the MSW E2E**, not a newly created one, because `GET /api/v1/csi` is unhandled by the mocks and the dialog would have no system to pick. Create is covered by D5 on the real backend.
3. **[AUTO-DECISION] Mixed mode via a no-op PUT** to put the `NEEDS_RELEARN` fixture into the list (R10), because the readiness fixtures are deliberately outside the list and the page selects from the list.
4. **[AUTO-DECISION] One narrow-layout test added** (375x812, boundingBox within the viewport). AC-8 a and AC-9 "narrow layout" are Vitest cases in the story, but jsdom has no layout, so the browser is the only place the claim is real. It is small, and not an a11y check (ADR-SC-006). Root may drop it.
5. **Existing test ids.** I read the save chip through its existing `data-testid="studio-save-state"` (R4) because it has no role. No id was added. Everything else is role, label or visible text.
6. **D5 scope.** Create, edit, add, reorder, save, stable step IDs, reload, getTest (the API read), capabilities shape. I did not add a "v1 body is refused" negative: that is OBS-015 backend behaviour, not in the D5 list.
7. **Flag name.** `lanes.json` L6 says `STUDIO_E2E_REAL_BACKEND=1`; the harness uses `CHECKS_E2E_REAL_BACKEND=1` ("flag name is L3's choice"). The specs rely on the project filter only and do not read the flag.

## 7. What is verified versus inferred

- **Verified by running:** V1 to V5. The two specs compile, lint clean, and are collected only in their own project.
- **Verified by reading code:** every copy string (from `guidedNarratives.ts`), fixture IDs and counts (`demoFixtures.ts`, `readinessFixtures.ts`), proxy and mock behaviour (`mswProxy.ts`, `guidedHandlers.ts`, `guidedFixtures.ts`, `authoringHandlers.ts`, `capabilityHandlers.ts`, `handlers.ts`), the page's current selectors (`Step N`, `Add a test step`, `Add step`, `Move step N up`, `Save`, `studio-save-state`), the New UI Test dialog labels, and the backend preconditions in §5.3.
- **Inferred, not tested:** that L5b renders the guided UI with the L5a components and copy (R2); that the status-line recorder sees each transition (R3); the radio accessible names (R8); that MUI `Radio.check()` works on these controls; the exact `n` in `Completed — steps 2–4 learned again.`; that `--list` starts no server (V6).
- **Nothing was executed**, so every assertion above is a design, not a result.
