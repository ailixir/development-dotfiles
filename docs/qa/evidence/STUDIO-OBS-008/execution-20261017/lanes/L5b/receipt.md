# STUDIO-OBS-008 — lane L5b receipt (page integrator, W3)

- **Executor:** Uma (@ux-design-expert), YOLO. **Wave:** W3. **Date:** 2026-10-17. **Gate:** @dev technical gate.
- **Governing definition:** `prep-20261016/lanes.json` → `w0Refold20261017.lanes[id=L5b]`, plus the 8 binding items in `lanes/L5b/w3-brief-additions.md`. Rulings read: `t0-rulings/ruling.md` A1.6, A2, A3; `w1-confirmations.md` §4–§6; tech gate `lanes/tech-gate-L4-L5a/review.md` (Q2, F-L4-3, F-L5a-*). Story read only, not edited.
- **Status:** **GREEN on every verify row** (§3). One write-set deviation needs root's ratification (§6, DV-1). Open items for root are in §8.
- **Not done by this lane:** no git commit/stash/push/reset; no `pnpm install/add/remove`; no npm/yarn; `.aiox-core/core/permissions/dispatch-governance.js` not touched; no PID signalled; no Playwright, Gradle or backend process; `src/test/a11y/studioWcagAudit.test.tsx` **not run** (it rewrites `axe-results.json`, L6 is the single writer); nothing under `frontend/e2e/**` touched; the frozen interfaces (`studioGuidedTypes.ts`, `studioGuidedApi.ts`, `studioApi.ts`, `studioSlice.ts`, `studioTypes.ts`, `mocks/studio/handlers.ts`, `openapi.yaml`) not edited.
- **Environment:** host Node `v23.10.0`, pnpm `10.33.0`, vitest 1.6.1 (always `--minWorkers=1 --maxWorkers=N`).

## 1. Files (sha256 before → after, `shasum -a 256`)

All 45 baton hashes in `f1/batons.json` were re-measured at lane start and **all matched** (`logs/before-sha256-batons.json`, 0 mismatches). Whole write set before/after: `logs/before-sha256-writeset.txt`, `logs/after-sha256-writeset.txt`.

| File | Baton | Before | After |
|---|---|---|---|
| `frontend/src/pages/ChecksStudioPage/ChecksStudioPage.tsx` | L2a→L5b | `87f141b5edd473efb814334d30aff880195966c64b6b0cd6e44e548f93ad13a0` (= baton) | `095d4d7c2f1fb8f66fa338a818c339d9887f445f06b8b60aa256d33f93781dd0` |
| `frontend/src/pages/ChecksStudioPage/pageAuthoringUx.test.tsx` | L2a→L5b | `1911d4b7…10c7` (= baton) | `16b51603c2e39bf5773d1d2a3dec48a68df3b3ad7beaf54b9edbd4b413933bbe` |
| `frontend/src/pages/ChecksStudioPage/pageRunGate.test.tsx` | L2a→L5b | `410f59c5…68d6` (= baton) | `7b5bcac2df9c5a66f5e01b49fdb9b6b715d57543bfec5d0e979d55f5fe823cbc` |
| `frontend/src/pages/ChecksStudioPage/pageSaveAndStop.test.tsx` | L2a→L5b | `fa4f9328…74d6` (= baton) | `6f82ef342a30d6e5c6a38bd3fa30186bf9ab5cfdb13b8e53f7374a352f86f9ea` |
| `frontend/src/pages/ChecksStudioPage/pageGuidedRun.test.tsx` | — | new | `e91510a8a6a7a98fa264dbd7210032a0ada7f65e069e09a06602a60a67f7789b` |
| `frontend/src/pages/ChecksStudioPage/pageReplayAndReferences.test.tsx` | — | new | `aa6c00c7d23dbf1538e74157e7d6003e067e5ddb13118de6162ea9112d013803` |
| `frontend/src/components/studio/run/useRunGate.ts` | L2a→L5b | `bdde9513f7fe49d569ddf11f19ffc97aefb428495cd439d5bbcc33a84990d72e` (= baton) | `697d034b1764fc8cbd17258a2940dbcd04519d85d5ce81ac971d7f90e08b01d9` |
| `frontend/src/components/studio/run/RunControl.tsx` | — | `5d97d9431e22ea0acc790a34f51a46a4c051240e8ca8a6fb755ecae260002e67` | `2b2e91731d82b3f19db399e09ec4807cf63fc07c155d2c811caa7ef126a12cd8` |
| `frontend/src/components/studio/run/runEnablement.ts` | — | `1f3d8eb643fe6c47f9a46da7d37710e130634fc844b1fc1c7974edb339526f94` | `6c67598587aa10f0b63e42a38d7113ee2c590fef4ad0d4c4592ede67e6b10476` |
| `frontend/src/components/studio/run/executionErrorNarratives.ts` | — | `81d92287185d382f44a3c2ab9ac01d09bca84dd592d9550a13181634ac35fa8f` | `60fa7fbcf81003b665076029249bc174b491e6e41db1e52cda76be1faa2414c2` |
| `frontend/src/components/studio/run/ExecutionProgressView.tsx` | — | `1490093812eb6f64496d7abae2e1353e1ac5781527cf034d30c8427257e315db` | `7b671d6bb168165a7f267b4d7308e4e9a01de9ac8c110568e160a2cf8c39f950` |
| `frontend/src/components/studio/run/executeRefusals.ts` | — | `6e93b7a259af9d56bfccd7ea6d54a5acc69dd6bd99eb59c829f98f0f815a6a77` | `63cca1269edde3d20b6a60961afa8d778926b0db62bf1dadb7d801d5f64f5563` |
| `frontend/src/components/studio/run/index.ts` | — | `6d27660304bf533c0d46bdcdb9771d56c4fb635b34a2d2841e40af2ebffbd56e` | `9b0721c1f759fc253c8ebc9afd979d5506d3a03500924d5c0a1048b880cb4030` |
| `frontend/src/components/studio/run/runGate.test.tsx` | — | `ae0a484c359e9dc3edb4e770b3b5c9fbe8c5dd0ab8ba2a39551b06329ba34dee` | `e123386ef708156e35fdd74d16eb8cac15017b4b2959c03c265aa0c032246b09` |
| `frontend/src/components/studio/run/replayFailure.test.tsx` | — | new | `1121dd2f1006410964ac8171ff3daf91bdd209317302584303e04b8b4e3399d0` |
| `frontend/src/utils/config/studioCapabilities.ts` | L4→L5b | `0200c089e7081767f365c5387c3c24208ba74460eeab96a21811158220cbdaf0` (= baton) | `69779679a733f7ecfb8b4cb8796742bbfecf36caf8327cf87c1492d1f3a0d727` |
| `frontend/src/components/studio/templates/index.ts` | brief item 1 | `2adf0980da8cfc563aa8888e35ba73770db038d7f2673a5de2e59814e48b4172` | `bfeffc4332a118904e7f49892bf53a42e50183d372e4b712da05cd79f30e6ae0` |
| `frontend/src/components/studio/templates/quickStartTemplates.ts` | **DV-1 (outside the write set)** | `a1699b957ae98a442c8fadac9a82174eff92584f76e1f7410009cd71ad44507f` | `ed4b3a91cb895e3be9bfabf981718d17d2de63b0f14257162df2854c8ad0fc8b` |
| `frontend/src/components/studio/templates/quickStartTemplates.test.ts` | **DV-1 (outside the write set)** | `295d78cb6f12a7491e2904cf4a7639fdcce5a612ee23d4a23f06e632c2967be0` | `54c67742c4b622b6e47263232d4f29b1a03138ee7aedb14f963faf6e358af431` |
| `docs/qa/evidence/STUDIO-OBS-008/execution-20261017/lanes/L5b/{receipt.md, receipt.json, logs/*}` | — | new | this receipt |

The two DV-1 "before" hashes were not taken at lane start (the files were not in my write set). They were **reconstructed** by re-inserting exactly the lines I deleted and hashing the result; both equal L4's recorded after-hashes (`lanes/L4/receipt.md` §1), which shows the edit was a pure deletion.

**Unchanged on purpose** (hash identical before and after): every L5a file under `guided/**` and `evidence/**`, `useGuidedSession.ts` and its test, `pageEvidence.test.tsx`, `pageStepTimeout.test.tsx`, `studioRunTransport.node.test.tsx`, `saveErrorMessage.*`, all of `runs/**`, `tests/testListPresentation.ts`, `scheduling/schedulePresentation.ts`. Re-exporting `useGuidedSession` from `guided/index.ts` (brief item 5): **not done** — the page imports it from its own module, as the tech gate said is fine; `index.ts` is unchanged.

## 2. What was delivered (content list of the refold)

| Content | Where | How |
|---|---|---|
| **Three Run modes** (AC-2) | `runEnablement.ts` (`RUN_MODE`/`runModeFor`: `READY`→replay, `UNLEARNED`→learn, `NEEDS_RELEARN`→relearn, `LEARNING`→busy, total, throws on a fifth value; `RUN_ACTION` kept for the contract test), `useRunGate.ts`, `RunControl.tsx` | Run saves if dirty, re-reads `GET /tests/{id}`, and the fresh read decides. Learn modes then read `GET /tests/{id}/capabilities` **directly** (brief item 4, P6; `useStudioCapabilities` is not used for the start), require `testId`/revisions/`environmentId` to equal the fresh read, and pass the context unchanged to `useGuidedSession().startLearn`. `NEEDS_RELEARN` adds `baseRevisionId = confirmedRevisionId`, `firstLearnStepId = firstChangedStepId` (D-3), or the first current step for `BASE_IDENTITY_INCOMPLETE` (D-4). `guidedStart.available: false` → existing refusal via `GuidedStartFeedback`, no request. D-11: zero steps → no start. `LEARNING` → Run disabled. The interim `LEARNING_UNAVAILABLE_REASON`, its live region and the "not yet available in this build" clause of `LEARN_REQUIRED` are deleted. |
| **Auto-finalize** (AC-2) | the page mounts `useGuidedSession(testId, options)` once | The L2b hook finalizes at `FINALIZING`; the page shows "Saving what this run learned…" and then the receipt. After the session ends the page re-reads the test (a read, never a run) so the chip and gate update. Pending re-authentication / not-ready / a refused finalize read "Steps not ready to repeat.", never "Completed". |
| **`executionErrorNarratives`: replayFailure precedence** (A1.6) | `executionErrorNarratives.ts` (`replayFailureNarrative`, `learnAgainOffered`), `ExecutionProgressView.tsx` (`replayContext`) | A non-null `replayFailure` is rendered before `status`/`errorCode` (drift no longer reads as the unnamed `ERROR`). Login uses L5a's `LoginRequiredNotice` through `loginNoticeFrom`. Nothing is read from `stepResults[].message`, logs or status. Without an editor (runs drawer) the cause is worded with the snapshot's own numbering and no action. |
| **Drift "Learn again" only under A1** | `learnAgainOffered` + `useRunGate.learnFrom({kind:'drift'})` | Offered only when `readiness === READY`, `snapshot.revisionId === confirmedRevisionId` and the step is in the current draft; the gate re-checks all three on its fresh read before sending, then starts with `baseRevisionId`, `firstLearnStepId = replayFailure.stepId` and a fresh key (the hook mints it). |
| **A3: cancel, then focus step N** (no CANCELLED variant) | page `noneOfThese` | "None of these" and a declined confirmation call the hook's `cancel()` (one stable key, body `{schemaVersion:3, reason:"userRequested"}`), then request focus on step N by stable ID; focus is applied once the editor unlocks. The existing `CANCELLED` narrative is shown unchanged. |
| **"Go to step N" focuses the editor row** | page `requestStepFocus` | Guided and replay login notices; drops the request if the step is gone. |
| **`STUDIO_CAPABILITIES` deleted; `PRODUCTION_ALPHA_TEMPLATES` deleted** | `studioCapabilities.ts`, `templates/index.ts` (+DV-1) | Page reads `useStudioCapabilities(testId)` once: Variables dialog Secret type/`SecretInput`, the unavailability sentence (`secretsUnavailableText`), `OnboardingCoach capabilities`, `availableQuickStartTemplates(vaultSecretsEnabled(caps))`. All "alpha" copy is gone. |
| **AC-5 editor wiring** | page | "Insert reference" (L4 `ReferencePicker`) inserts at the caret of the last-edited step or of "Add a test step"; an inserted `<secret ID>` gets a `secretRef` declaration with `secretId = ID` if none exists. D-8: a secret row with no chosen secret is not sent (never null/empty/alias); a template's secret row is written with `secretId = name` (tech-gate note). |
| **AC-6 / AC-7 on the page** | page | `PlanExplanation` and the guided `VideoEvidencePanel` + `GuidedSeekControls` (with `useVideoSeek().recordingDurationMs`); replay `PASSED` shows "Completed — saved steps replayed." via `GuidedCompletion {kind:'replay'}`; `GuidedCompletion` gets the session's `firstLearnStepId` (brief item 3 / Q2). |

## 3. Verify rows (what I ran, from `frontend/`, and what it returned)

| # | Command | Result | Log |
|---|---|---|---|
| baseline | `pnpm exec vitest run src/pages/ChecksStudioPage src/components/studio/run src/components/studio/runs src/components/studio/guided src/components/studio/evidence src/components/studio/templates --minWorkers=1 --maxWorkers=3` (before any edit, 19:55) | exit 0, 24 files, **512 passed** | `logs/baseline-vitest-l5b.log` |
| V1 | same command (20:23, final tree) | **exit 0, 27 files, 565 passed**, 0 failed, 0 skipped (180 s) | `logs/v1-vitest-l5b.log` |
| V2a | `pnpm run type-check` | **exit 0** | `logs/v2-type-check.log` |
| V2b | `pnpm run lint` | **exit 0, 0 errors, 308 warnings** (= the 308 baseline) | `logs/v2-lint.log` |
| V3 | `grep -rn "STUDIO_CAPABILITIES" frontend/src` (repo root) | **0 hits** (grep exit 1) | `logs/v3-grep-studio-capabilities.log` |
| V4 | `grep -rn "PRODUCTION_ALPHA_TEMPLATES" frontend/src` (repo root) | **0 hits** (grep exit 1) | `logs/v4-grep-production-alpha-templates.log` |
| V5 | `pnpm exec vitest run --minWorkers=1 --maxWorkers=4 --exclude 'src/test/a11y/**'` (started 20:27:18) | **exit 0, 67 files, 1253 passed**, 0 failed (202 s). `studioWcagAudit.test.tsx` was not collected; `docs/qa/accessibility/axe-results.json` mtime is still 16:16:58, so this lane did not write it. F1's figure was 1200; the +53 are this lane's (see V1). | `logs/v5-vitest-full.log` |

565 = 512 + 10 (`runGate.test.tsx` 21→31) − 1 (`quickStartTemplates.test.ts` 26→25, the stand-in test) + 14 (`replayFailure.test.tsx`) + 21 (`pageGuidedRun.test.tsx`) + 9 (`pageReplayAndReferences.test.tsx`).

**Not run:** `src/test/a11y/studioWcagAudit.test.tsx` (forbidden here; L6 owns it in W4). Playwright, build, backend. See §8 Q5 for the audit risk.

## 4. AC-9 flow → test (one row per named flow)

Files: **GR** = `pages/ChecksStudioPage/pageGuidedRun.test.tsx`, **RR** = `pages/ChecksStudioPage/pageReplayAndReferences.test.tsx`, **RF** = `components/studio/run/replayFailure.test.tsx`, **RG** = `components/studio/run/runGate.test.tsx`. Test names are the `it` titles verbatim (prefix shown).

| AC-9 flow | Test (file › it) |
|---|---|
| First guided Run through auto-finalize | GR › `first guided Run through auto-finalize: one start, one finalize, no execute, "Completed — learned from this run." and the plan as learned` |
| Later replay | RR › `later replay: a READY test replays through one execute, starts no guided session, and says "Completed — saved steps replayed."` |
| `NEEDS_RELEARN` mixed-mode start, prefix then learning copy | GR › `NEEDS_RELEARN mixed-mode start: the start names the base and step k, then "Repeating saved steps 1–(k-1)…" and "Learning from step k"` |
| D-4 `BASE_IDENTITY_INCOMPLETE` (chip, start body, 409 feedback) | GR › `D-4 BASE_IDENTITY_INCOMPLETE: the chip says saved learning cannot be reused, Run starts from step 1, and the 409 offers an explicit "Learn again from step 1"`; RG › `(d) D-4: …`, `(e) D-4: …` |
| One focused clarification incl. an untrusted page-derived label | GR › `one focused clarification incl. an untrusted page-derived label: answered once, then the Run continues to completion` |
| Blocked by login, both variants, both actions (guided) | GR › `blocked-by-login (loginStepsPresent false): …`, `blocked-by-login (loginStepsPresent true): …` |
| Unknown outcome (no Run-again) | GR › `unknown outcome (no Run-again): "Stopped — submission outcome unknown." and no Run-again control anywhere` |
| Publication conflict | GR › `publication conflict: "Run completed; steps not ready to repeat.", one finalize and no retry, never shown as learned` |
| Replay drift → Learn again from step N | RR › `replay drift → Learn again from step N: the drift sentence, a seek on the existing replay path, and exactly that guided start (base, step, fresh key)` |
| Governed `POLICY_DENIED` (inherited 014 d) | GR › `inherited OBS-014 a: a governed POLICY_DENIED gets its own narrative, never the struck secret-fill copy` |
| A2 negative: `INVALID_CONTRACT` never shows the secret-fill copy | GR › `ruling A2 negative: an INVALID_CONTRACT result gets the generic narrative and never "Secrets can only be typed into a password box."` |
| `BUDGET_EXCEEDED` | GR › `BUDGET_EXCEEDED: the session ends with the budget narrative, and nothing starts again on its own`; GR › `BUDGET_EXCEEDED start refusal (per CSI): …` |
| Reference insert for `<var>` and `<secret>` | RR › `reference insert for <var> and <secret>: tokens land at the caret, and an inserted secret is declared by its Vault name (D-8)` |
| D-8 (missing `secretId` writes nothing; picked/template Vault name written) | RR › `D-8: a secret row with no chosen secret is not written, and a template secret is written under its Vault name` |
| Capability off / on | RR › `capability off: …`, `capability on: …`; component level: L4 `referencePicker.test.tsx` › `useStudioCapabilities (P1: off / on / unknown / error)` |
| Never-echo canaries | GR › `never-echo canary (P6 pointer): the only browser-held guided state is IDs, keys and the closed start body` (page). Clarification/result/explanation canaries: L5a `guided.test.tsx` › `never-echo (AC-5(c); I-B6/I-C11): …` (F-L5a-1). Picker/SecretInput/MSW canaries: L4 `referencePicker.test.tsx`, `SecretInput.test.tsx`. |
| Reconnect without double-submit | GR › `reconnect without double-submit: a reload mid-session resumes by GET only, then finalizes once`; replay transport reconnect: existing `studioRunTransport.node.test.tsx` |
| Narrow layout (375×812 page case) | RR › `narrow layout (375×812): header, panels, the guided login notice and its actions stack at full width; Run stays reachable` |
| Inherited 014 b: side-effect confirmation confirmed through to continuation | GR › `inherited OBS-014 b: a side-effect confirmation is a confirmation, confirmed once, and the Run continues` |
| Inherited `POLICY_NOT_APPROVED` start feedback | GR › `inherited POLICY_NOT_APPROVED: the policy needs approval before learning, with no session, poll or finalize` |
| AC-2 not-ready, never published (409 / 503 at finalize) | GR › `finalize refused by rejected validation (409): …`, `finalize refused by unavailable Core (503): …` |

**T0 ruling A1.6, the seven cases:**

| # | Case | Test |
|---|---|---|
| 1 | Replay login, `false` and `true`, both actions | RF › `loginStepsPresent false: …`, `loginStepsPresent true: …`; page: RR › `A1.6 replay login (loginRequiredNoLoginSteps): …`, `A1.6 replay login (loginRequiredLoginStepsFailed): …` |
| 2 | Login with a deleted step: no "Go to step" | RF › `omits "Go to step N", keeps "Open Variables", and uses the step-less wording` |
| 3 | Drift on READY, matching revision: exactly that start body and key | RF › `offers it, and hands back exactly the drifted step and the replayed revision`; RR › `replay drift → Learn again from step N: …`; RG › `(j) A1.6: …` |
| 4 | Superseded revision or `NEEDS_RELEARN`: no action | RF › `the test needs relearning: the drift sentence stands alone`, `the replayed revision was superseded: …`, `the drifted step is no longer in the draft: …`; RG › `(j)` second half |
| 5 | Negative control (`TARGET_DRIFT` in a message, `replayFailure: null`) | RF › `an ERROR snapshot whose step message says TARGET_DRIFT, with replayFailure null, shows no drift copy` (+ the login twin) |
| 6 | No field → generic narrative | RF › `no replayFailure key at all: the existing unnamed-error narrative, unchanged` |
| 7 | "Seek to step N" via the existing replay seek | RF › `seeks to the failing step’s own offsetMs through onSeekStep, and only with an available recording`; RR drift test (`video.currentTime ≈ 1.61`) |

**T0 ruling A3, the three cases:** GR › `A3 "None of these": exactly one cancel with reason userRequested and no clarify, the existing CANCELLED narrative, then focus on step N`; GR › `A3 declined side-effect confirmation: the same single cancel and no clarify, then focus on step N`; GR › `A3 cancel/expiry race: the server answers with the session already EXPIRED; the page shows that, sends no second cancel, and still moves focus`.

**How the narrow-layout case is measured.** jsdom has no layout engine and its `getComputedStyle` ignores `@media`, while MUI emits even `xs` styles inside `@media (min-width:0px)`. The test therefore evaluates the cascade at a given width from the page's own CSSOM (`styleAtWidth`: plain rules, plus media rules whose `min-width`/`max-width` hold), at 375 px with a 1440 px control for every assertion (header `flex-direction` column/row, both panels `max-width` 100%/50%, login actions column/row, action buttons `width` 100%/auto, text `overflow-wrap: anywhere`). It is not a real-browser rendering; that belongs to the Playwright lane.

## 5. Visible strings, roles and hooks the AC-9 flows rely on (for L6)

| Surface | Selector the tests use | Visible text |
|---|---|---|
| Run control | `button` name **"Run Test"**; `data-run-mode` = `loading`/`replay`/`learn`/`relearn`/`busy` | "Run Test"; busy "Saving…" / "Starting…"; while running **"Stop"** → "Stopping…" (Stop during a guided session cancels it) |
| Readiness chip | `data-testid="guided-readiness-chip"` (was `readiness-chip`) | "Learned · ready to repeat" · "Steps changed — next Run learns from step k" · "Saved learning cannot be reused — next Run learns from step 1" |
| Guided run on the Proof tab | `data-testid="guided-run"`; status `guided-run-status-line`, `guided-run-status-learning-from` | "Preparing your steps." · "Understanding this page — step N of M." · "Running step N of M." · "Repeating saved steps 1–(k-1)…" · "Learning from step k" · "Saving what this run learned…" |
| Pending / not ready | `data-testid="guided-pending"` | "Steps not ready to repeat." |
| Clarification | `guided-clarification`, question `guided-question`, `role=radio` per choice, last radio name **"None of these — I'll edit step N"**, button **"Continue"**, `page-derived-label` + chip "Page-derived", "role: X · region: Y", `guided-expiry-warning` | "Step N says: '<step text>'. Which one did you mean?" |
| Side-effect confirmation | `guided-confirmation`; buttons **"Continue"**, **"None of these — I'll edit step N"** | "Confirm this action before it runs." · "Step N says: '<text>'. Continue with this action?" |
| Completion | `guided-completion` with `data-kind` (`succeeded`, `saving`, `notReady`, `unknownOutcome`, `cancelled`, `expired`, `login`, `policyDenied`, `failed`, `failedUnnamed`, `replayed`); `guided-completion-code` | "Completed — learned from this run." · "Completed — steps k–n learned again." · "Completed — saved steps replayed." · "Run completed; steps not ready to repeat." · "Stopped — submission outcome unknown." · "The run was stopped on request" (CANCELLED title) · "This run expired before it finished, so it stopped. You will need to Run again." |
| Login notice (guided and replay) | `login-required-notice` (`data-variant` = `no-login-steps`/`login-steps-failed`), `login-required-actions`; buttons **"Go to step N"**, **"Open Variables"** | "This page asks you to sign in. Add login steps before step N using your secrets (`<secret NAME>`), then Run again" · "Your login steps did not sign you in; check the secret and the steps before step N" |
| Replay cause | `replay-failure` (`data-kind` `login`/`drift`), `replay-drift`, `replay-failure-actions`, `replay-failure-seek`; buttons **"Learn again from step N"**, **"Seek to step N"** | "Step N no longer matches the page…" |
| Start feedback | `guided-start-feedback`, `guided-start-feedback-code`, `guided-start-mismatch`; button **"Learn again from step 1"** | L5a copy rows 59–69 (policy, budget, revision, references, origin) |
| Plan and video | `plan-explanation` ("Steps as learned"); buttons **"Seek to step N"**, **"Seek to action: <safe label>"** | |
| Step editor (focus target) | `role=textbox` name **"Step N"**; `data-step-id` = stable step ID | |
| References | button **"Insert reference"**; `role=menu`; `menuitem` per variable/secret name (secondary `<var NAME>`/`<secret ID>`), **"New secret…"**; field `textbox` **"Add a test step"** | capability off: "Vault is not connected for this environment." (`data-testid="secrets-availability"`, and `variables-secrets-availability` in the dialog) |
| Variables dialog | `dialog` with title "Variables"; button "Add variable"; `textbox` "Variable N name"; `combobox` "Variable N type" (options "Plain", "Secret") | "Use in steps as: <var NAME>" or "… or <secret SECRET_ID>" |
| Templates | button "Templates"; button "Use this template" | "Daily sign-on check" offered only with Vault on |

No `aria-live`, `aria-current`, keyboard shortcut, reduced-motion or contrast work was added (ADR-SC-006). The one live region in `RunControl` belonged to the deleted interim sentence and went with it.

## 6. Deviations and decisions

- **DV-1 (needs ratification): two files outside the write set.** Brief item 1 says "delete the stand-in" and item 2 requires `grep PRODUCTION_ALPHA_TEMPLATES` = 0, but the stand-in is defined in `templates/quickStartTemplates.ts` and pinned by one test in `quickStartTemplates.test.ts`; neither file is in the refold write set. L4 (the owner, exited at W2) documented the deletion as L5b's. I deleted exactly the export with its doc comment, and the one test "keeps the page's interim set equal to the secrets-off set until L5b reads the capability" with its import. Nothing else in either file changed (before hashes reconstructed = L4's after hashes). No other lane writes these files in W3.
- **[AUTO-DECISION] The Run gate stays the single activation path.** Learn modes, the drift "Learn again" and the D-4 "Learn again from step 1" all go through `useRunGate` (`run()` / `learnFrom()`), driven by tokens from the page like `runRequest`, so every start passes the same save → read → capability → context check. `RunControl` gained `startLearn`, `guidedStartRefusal`, `onOpenVariables`, `learnRequest` props; without `startLearn` a learn-mode Run is disabled.
- **[AUTO-DECISION] Stop during a guided session cancels it** (`reason: userRequested`, the hook's one key), because AC-2 requires cancellation not to double-submit and the control already reads "Stop" while running. It sends one cancel; "Stopping…" until the session is terminal.
- **[AUTO-DECISION] Capability-context mismatch copy.** When the capability's context disagrees with the fresh read (a save landed in between), the gate sends nothing and shows the L5a `revisionNotReady` sentence ("… so nothing was started. Press Run again to start from the latest saved steps."). Its first clause says "from that step", which is slightly loose for a full learn; no new copy was written.
- **[AUTO-DECISION] Capability read failure at start**: 403 → the existing execute-forbidden narrative; any other failure or a malformed body → the existing fallback "The run could not be started". Never simulated.
- **[AUTO-DECISION] Replay without an editor** (runs drawer): the cause is worded with `stepIndex + 1`, the numbering of the step list in the same view, with no actions. The step-less wording ("…no longer in your steps") would be false there.
- **[AUTO-DECISION] Replay per-step seek label unchanged.** The existing per-step control keeps "Show in recording" (accessible name "Jump to step N in the recording") to avoid churn on existing tests and selectors; the replay cause carries the AC-7-named "Seek to step N". Root/PO may want the generic replay control renamed too (§8 Q3).
- **[AUTO-DECISION] Chip test id** changed from `readiness-chip` to L5a's `guided-readiness-chip` (one chip, L5a's component).
- **[AUTO-DECISION] `data-run-mode`** on the Run button: a test/selector hook naming the gate's mode; not an a11y attribute.
- **[AUTO-DECISION] Guided view vs replay view** on the Proof tab is derived (the latest of the two), not set in an effect, so the first guided state renders with its first read.
- **Optional page prop** `guidedOptions` (`useGuidedSession` timing) so tests can poll every 5 ms; the routed page passes none.
- **Existing tests changed** (in the write set): `runGate.test.tsx` rewritten for the three modes (+10 tests; interim and live-region cases removed with the interim state); `pageRunGate.test.tsx` unlearned case now expects Run enabled; `pageSaveAndStop.test.tsx` Variables case sets Vault off and expects the capability sentence instead of the "alpha" copy; `pageAuthoringUx.test.tsx` uses `availableQuickStartTemplates(false)` with Vault off.
- **Not run, although appended to my prompt as skills:** the SYNAPSE diagnostics task and `checklist-runner` (no checklist was named). The mission defines the verify rows above.

## 7. Inferences, not verified

- A real backend may answer `cancel` with a non-terminal 202 body; then focus waits until the session goes terminal (the editor is locked while it runs). Verified only against the MSW mirror, which answers `CANCELLED` at once, and the race test's `EXPIRED`.
- The page re-reads `GET /tests/{id}` after a guided session ends and assumes the server's readiness has moved (for example to `READY`); the MSW readiness fixtures are static, so this was observed only as a read, not as a readiness change.
- From reading `useGuidedSession.ts` (L2b, not tested here): a `401` on finalize keeps the latch open, so the poll resends finalize (same key) on each tick while the 401 persists.

## 8. Open questions for root

- **Q1 — DV-1 ratification** (`quickStartTemplates.ts`, `quickStartTemplates.test.ts`), §6.
- **Q2 — KL-015-Q4 trigger is not wired.** `GuidedCompletion` has `authoredLiteralHint`, but no page code sets it: the trigger is @dev's T2 record (story conditional item a–c) and is not in L5b's content list. As delivered, the `authoredLiteralTargetNotFound` copy is unreachable on the page. Needs an owner, or an explicit decision.
- **Q3 — AC-7 replay seek naming.** Should the generic replay per-step control ("Show in recording") be renamed "Seek to step N"? Today only the replay-cause seek uses the AC-7 name.
- **Q4 — `LEARNING` with no local session** (another tab or user): Run is disabled with no visible reason, because no sourced sentence exists for it and this page cannot show another client's live state.
- **Q5 — a11y regression guard not run.** The page now renders the readiness chip, an "Insert reference" button and capability captions on audit surfaces 3–7, and `GET /tests/{id}/capabilities` is a new request on those surfaces (served by the composed handlers). I could not run `studioWcagAudit.test.tsx`; L6 should run it in W4 and regenerate the baseline only if it breaks.
- **Q6 — F-L5a-4** (a clarification whose step does not match renders nothing) is unchanged; the page shows no question in that case.
- **Q7 — runtime of the new page files**: `pageGuidedRun.test.tsx` ~125–135 s and `pageReplayAndReferences.test.tsx` ~70–80 s at `--maxWorkers=2` (each page render re-renders per poll). Waits are bounded at 20 s per wait and 60 s per test.
- **Q8 — commit-set note (F-L5a-2) still applies**: the L5a copy-table tests read untracked evidence files; any commit of this lane's tree must carry them.

---

## L5b-F1 addendum (fix unit, 2026-10-17)

- **Instruction:** root's L5b-F1 message (L5b accepted GREEN; three items; same lane rules). Executor Uma (@ux-design-expert), YOLO. Same rules as above: no git write, no install, no story edit, no Playwright/Gradle, `studioWcagAudit.test.tsx` not run, nothing under `frontend/e2e/**`, `playwright.config.ts` or `start-servers.mjs` touched (L6 is editing those), frozen interfaces untouched.
- **Status:** **GREEN** on every verify row (§F1.4).
- **DV-1: RATIFIED by root** (2026-10-17, L5b-F1 message: "the pure deletions in quickStartTemplates.ts and its test are fine, because L4 has exited"). No further change to either file in this unit.

### F1.1 KL-015-Q4 (conditional obligation a–d)

**(a) Trigger record, for the Dev Agent Record.** AUTHORED-ECHO-01 has **not** landed, so items b–d apply.
- Source: `docs/stories/STUDIO-OBSERVED/STUDIO-OBS-009.story.md` (sha256 `af5a3c7e4d1508c196b947b8b2632e0d999a53a9d07b7e3093b13b4d36aabc78` when read), change-log row **0.3.20** and section **"PO T0 outcomes — 2026-10-17"**: row **A10** "AC-7 AE-01 a | Rule AE-1…AE-7. Code is written only after the U13 acknowledgement" (`:774`), and decision R6 "sending the U13 request now … nothing was sent" (`:730`).
- Register: `docs/qa/evidence/STUDIO-OBS-009/prep-20261016/prerequisite-register.json` U13 `"state": "not requested"`.
- So the runner change has not been written; the KL-015-Q4 copy ships in 008, and STUDIO-OBS-009 AUTHORED-ECHO-01 f removes it.

**(b) Copy.** Key **`authoredLiteralTargetNotFound`** in `guided/guidedNarratives.ts` (unchanged L5a row 34, basis delegated): "Studio cannot see page text that matches a value written in this step. Try rewording the step, for example by checking for a longer or different piece of visible text." Rendered by `GuidedCompletion` (`data-testid="guided-authored-literal-hint"`).

**(c) Wiring and the rule used.** `pages/ChecksStudioPage/authoredLiteralHint.ts` (new) sets `GuidedCompletion.authoredLiteralHint`; no contract change. **The story's fallback rule is used**, because the landed data cannot tell the case apart:
- No landed field says a target was withheld because it matched an authored literal (that would be a new field, an @architect contract change).
- `TARGET_MISMATCH` is the contract's `failure.code` for "no element matched", but nothing in result3/session-view3 says which slot's text caused it.
- An unobservable target usually leaves no admitted action, so `explanation` carries no `operationKind` for the failing step (the landed `fixtures.json` `loginResult` has exactly that shape for step 2).
- Rule as implemented: the hint shows when the result is `FAILED`, its cause (`failure.code`, else `errorCode`) is `TARGET_MISMATCH`, and the failing step's **own current draft text** is an assertion, a selection or a typed literal by its leading verb (`check|verify|assert|expect|confirm|ensure`, `select|choose|pick`, `type|enter|fill|input`, followed by something). The failing step is the result's: the explanation step with a `FAILED` action, else the first step reported not completed. Every other cause never shows it.
- **Verified by reading, not run:** the landed backend does not emit `TARGET_MISMATCH` anywhere in `backend/src/main` (grep: 0 hits; it exists only in `error.schema.json`/`result.schema.json`). When the model reports a step it cannot ground (`UNSUPPORTED` with `INSUFFICIENT_EVIDENCE`), `GuidedTranslationService.java:1713-1733` ends the session `RUNTIME_INCOMPATIBLE`, a code that names no cause (D-11), so the hint is not shown there. See Q9.

**(d) Tests** (MSW payloads from the landed v3 fixtures through the L2b mirror's `endsIn`; the unit test varies `fixtures.json` `loginResult`):
- GR › `KL-015-Q4: a target-not-found outcome on "Check the heading says Order confirmed" shows the authored-literal hint`
- GR › `KL-015-Q4 control: the same target-not-found outcome on a step without such a literal shows no hint`
- GR › `KL-015-Q4 control: the literal step ending AMBIGUOUS_TARGET (a different cause in the landed data) shows no hint`, and the same for `ASSERTION_FAILED`
- `pages/ChecksStudioPage/authoredLiteralHint.test.ts` (18 cases: failing-step selection, 5 literal phrasings, 5 non-literal steps, 5 other causes incl. `RUNTIME_INCOMPATIBLE`, step not in the draft, non-FAILED).

### F1.2 AC-7: replay per-step seek label

| | Before | After |
|---|---|---|
| Visible text (`data-testid="step-seek-{i}"`) | "Show in recording" (`SEEK_LABEL`) | **"Seek to step N"** (`guidedCopy('seekToStep', {N})`, cited AC-7 copy, `guidedNarratives.ts` row 57) |
| Accessible name, step with a reading | "Jump to step N in the recording" | **"Seek to step N"** |
| Accessible name, step with no reading (disabled) | "Jump to step N: not attempted" | **"Seek to step N: not attempted"** |
| Export | `SEEK_LABEL` from `components/studio/run` | removed (the label is per step now; `seekControlLabel` still exported) |

Unchanged: the failed step's "Watch the recording at this step" control (VAL-025) and the replay-cause "Seek to step N" (`replay-failure-seek`); the two are never on the same step, so names stay unique. Test: `evidence/stepSeek.test.tsx` › `an attempted step reads and is named "Seek to step N"; one with no reading adds "not attempted"; the retired label is gone`.

### F1.3 LEARNING with no session this page follows

- **Sentence (Uma-authored, one line):** "Another Run is learning this test, so Run is off until that Run ends."
- **Recorded like the L5a rows:** key `learningElsewhere` in `GUIDED_COPY`, basis **delegated**; source ADR-SC-006 (`docs/architecture/ADR-SC-006-accessibility-scope-functional-only.md`) quote "State and consequence stated in visible text"; note citing the AC-3 conventions (state, then consequence) and AC-2 "LEARNING ⇒ Run disabled"; fact quote from `backend/src/main/java/com/citi/put/checks/studio/readiness/ExecutionReadinessService.java` `LEARNING_QUERY` ("SELECT EXISTS(SELECT 1 FROM studio_guided_sessions WHERE test_id = ? AND expires_at > now()"), i.e. LEARNING means an unexpired, non-terminal guided session exists for the test. The copy-table tests enforce both quotes (3 new rows; `guided.test.tsx` 212 → 215).
- **No unverifiable claim:** it names no person, tab, step or time; "until that Run ends" is when `LEARNING_QUERY` stops matching (the session ends or expires). The page does not poll the other session; "Refresh test information" re-reads.
- **Wiring:** `RunControl` shows it as a caption under the disabled Run (`data-testid="run-learning-elsewhere"`) when the gate's mode is `busy`, the control is not running, and the page follows no session for the test (`followsLearningSession`, from the store's `guidedSessionByTestId`, so a page that resumed its own session from the pointer does not show it). No ARIA added.
- **Tests:** RG › `(f2) L5b-F1: LEARNING with no session this page follows says so beside the disabled Run; a followed session does not`; GR › `LEARNING elsewhere: Run is disabled and the state and its consequence are stated beside it; nothing is sent`.

### F1.4 Verify rows (from `frontend/`)

| # | Command | Result | Log |
|---|---|---|---|
| F1-V1 | `pnpm exec vitest run src/pages/ChecksStudioPage src/components/studio/run src/components/studio/runs src/components/studio/guided src/components/studio/evidence src/components/studio/templates --minWorkers=1 --maxWorkers=3` (20:42:57, final tree) | **exit 0, 28 files, 593 passed**, 0 failed (176 s). 593 = 565 + 18 (`authoredLiteralHint.test.ts`) + 3 (copy-table rows for `learningElsewhere`) + 1 (`runGate` f2) + 1 (`stepSeek` AC-7 label) + 5 (`pageGuidedRun`: 4 KL-015-Q4, 1 LEARNING) | `logs/f1-v1-vitest-l5b.log` |
| F1-V2a | `pnpm run type-check` | **exit 0** | `logs/f1-v2-type-check.log` |
| F1-V2b | `pnpm run lint` | **exit 0, 0 errors, 308 warnings** (baseline 308). A first lint run showed 309: exporting the new seek-label helper from the `.tsx` added one `react-refresh/only-export-components` warning, so the helper was made module-private and both type-check and lint were re-run; the F1-V1 run above is on that final tree | `logs/f1-v2-lint.log` |
| F1-V3 | `grep -rn "STUDIO_CAPABILITIES" frontend/src` | **0 hits** | `logs/f1-v3-grep-studio-capabilities.log` |
| F1-V4 | `grep -rn "PRODUCTION_ALPHA_TEMPLATES" frontend/src` | **0 hits** | `logs/f1-v4-grep-production-alpha-templates.log` |
| F1-V5 | `pnpm exec vitest run --minWorkers=1 --maxWorkers=4 --exclude 'src/test/a11y/**'` (20:45:53) | **exit 0, 68 files, 1281 passed**, 0 failed (195 s); 1281 = 1253 + 28. `studioWcagAudit` not collected; `docs/qa/accessibility/axe-results.json` mtime still 16:16:58 | `logs/f1-v5-vitest-full.log` |

**Not run:** `src/test/a11y/studioWcagAudit.test.tsx` (L6 runs it after the source freeze). The changed replay seek name and the new `run-learning-elsewhere` caption render on audit surfaces 6–7 and on no `LEARNING` surface respectively; whether the guard moves is for L6's run.

### F1.5 Files (sha256 before → after this unit)

Before = the L5b receipt's after-hashes (re-measured at unit start, identical: `logs/f1-before-sha256-writeset.txt`); after = `logs/f1-after-sha256-writeset.txt`.

| File | Before | After |
|---|---|---|
| `frontend/src/pages/ChecksStudioPage/ChecksStudioPage.tsx` | `095d4d7c2f1fb8f66fa338a818c339d9887f445f06b8b60aa256d33f93781dd0` | `8f398ef6d019e9e1b7df836db9d86333b4a67d97918e5704efbe4566ec6dca78` |
| `frontend/src/pages/ChecksStudioPage/authoredLiteralHint.ts` | new | `8a0f6f4f357ff7fb96cb91831a8f3d0f02e209ec3992e5cd5f0ee38187db4343` |
| `frontend/src/pages/ChecksStudioPage/authoredLiteralHint.test.ts` | new | `47e95e9eecf446b074461b0210bdaee9b7a4c356f17a0a60606880376534824f` |
| `frontend/src/pages/ChecksStudioPage/pageGuidedRun.test.tsx` | `e91510a8a6a7a98fa264dbd7210032a0ada7f65e069e09a06602a60a67f7789b` | `29b46ee4cde01021c50ea81f2d3ac951fbc6cd87ef7f833c931e96cc42b431e5` |
| `frontend/src/components/studio/run/ExecutionProgressView.tsx` | `7b671d6bb168165a7f267b4d7308e4e9a01de9ac8c110568e160a2cf8c39f950` | `2c8166953db8f949cde7e0bf0d9ef592b2a8bbc273d12a189e8cbfb10fe92d46` |
| `frontend/src/components/studio/run/RunControl.tsx` | `2b2e91731d82b3f19db399e09ec4807cf63fc07c155d2c811caa7ef126a12cd8` | `293505b5a9ef40ae3b5c2463dad961aa85a72628f3bb73b9579e49786e120729` |
| `frontend/src/components/studio/run/index.ts` | `9b0721c1f759fc253c8ebc9afd979d5506d3a03500924d5c0a1048b880cb4030` | `867e313297fc15a49d3f02514f6ae80da77765eb5a89777a76bf78a5fc53775d` |
| `frontend/src/components/studio/run/runGate.test.tsx` | `e123386ef708156e35fdd74d16eb8cac15017b4b2959c03c265aa0c032246b09` | `fe62b79137b29e6cd244fdc488818caf22c5dfc3e0a45cdcb21ea1866b39dfd1` |
| `frontend/src/components/studio/guided/guidedNarratives.ts` (L5a→L5b baton) | `b1b767b3ee8c0396b7ea386f5eb9c9071ed6036f3a5fe874b0535098eaa75ebc` (= baton) | `f86e5f785b9d0c55169ae7db5d419e87f673dda2b8e95e23d5677aa653640c4d` |
| `frontend/src/components/studio/evidence/stepSeek.test.tsx` (L5a→L5b baton) | `a5e2fb746e8cf796207dd203458cdafb037eae2a174ae401abf71bb249e91ca2` (= baton) | `3d54d715ef560b1b15c29946777c6efdc97855dfa1e5882c404323f95cc93e2f` |

All other write-set files are byte-identical to the L5b receipt.

### F1.6 Changed visible strings, roles and test IDs (for L6)

| What | Before | After |
|---|---|---|
| Replay per-step seek button (`step-seek-{i}`) | text "Show in recording", name "Jump to step N in the recording" / "Jump to step N: not attempted" | text and name **"Seek to step N"** / name **"Seek to step N: not attempted"** |
| New caption beside a disabled Run (server `LEARNING`, no followed session) | — | `data-testid="run-learning-elsewhere"`: **"Another Run is learning this test, so Run is off until that Run ends."** |
| New hint inside a guided failure (`TARGET_MISMATCH` on an assertion/selection/typed step) | — (prop never set by the page) | `data-testid="guided-authored-literal-hint"` inside `guided-completion` (`data-kind="failedUnnamed"`): the `authoredLiteralTargetNotFound` sentence above |

Everything else in §5 is unchanged.

### F1.7 Known items, left unchanged as instructed

- **F-L5a-4:** a clarification whose `activeStep` does not match renders nothing; unchanged.
- **Slow page test files:** in the F1-V5 run `pageGuidedRun.test.tsx` (26 tests) took 166 s and `pageReplayAndReferences.test.tsx` (9 tests) 76 s at `--maxWorkers=4`; bounds unchanged (20 s per wait, 60 s per test).
- **Commit-set note (F-L5a-2) grows by two sources:** the copy-table tests now also read `docs/architecture/ADR-SC-006-accessibility-scope-functional-only.md` (**untracked**) and `backend/src/main/java/com/citi/put/checks/studio/readiness/ExecutionReadinessService.java` (tracked, but the quoted `LEARNING_QUERY` line exists only in the uncommitted working tree, not at HEAD `734ad704f`). Both must be in the same commit as `guidedNarratives.ts`.

### F1.8 Open question added

- **Q9 — KL-015-Q4 on the real backend.** With the fallback rule keyed on `TARGET_MISMATCH`, the hint appears whenever the landed contract's target code arrives. The backend as read today never emits `TARGET_MISMATCH` and ends an ungroundable step `RUNTIME_INCOMPATIBLE`, which names no cause, so on today's backend the hint would not appear for that path. Widening the trigger to `RUNTIME_INCOMPATIBLE` would show an authored-literal explanation for causes the server did not name. @architect/@po decide whether to keep it as delivered, widen it, or add a public discriminator (a contract change, not placed in 008).
- **Closed by this unit:** §8 Q1 (DV-1 ratified), Q2 (KL-015-Q4 wired, with Q9 above), Q3 (replay seek renamed), Q4 (LEARNING-elsewhere sentence). Q5–Q8 stand as written.

---

## L5b-F2 addendum (fix unit after the @dev gate, 2026-10-17)

- **Instruction:** root's L5b-F2 message; gate `lanes/tech-gate-L5b/review.md` (PASS-WITH-FIXES). Same lane rules: no git write, no install, no Playwright, no a11y audit (`axe-results.json` mtime still 16:16:58), nothing under `frontend/e2e/**`, frozen interfaces untouched. Dex's six changed files were re-hashed at unit start (`logs/f2-before-sha256-writeset.txt`) and edited on top of his bytes.
- **Status:** **GREEN** on every verify row (§F2.3).

### F2.1 F-L5b-3: stuck Run after a refused read of a stored session

- **Reproduced first (red).** New page test with Dex's probe: a valid pointer in `sessionStorage` (`sessionId` known, no view), the mirror refusing every `read` with 400 or 409. Before the fix both cases failed with `Unable to find an element by: [data-testid="run-session-unreadable"]` (`logs/f2-red-F-L5b-3.log`); Run was enabled and a press sent nothing.
- **Fix, per the root ruling (keep the pointer, start nothing, say so):**
  - `useGuidedSession.ts`: new result field **`unreadable`**, true when the followed session's read is refused with a status other than 403/503/no response (so 400, 409, 401) **before any view of it loaded**. The pointer is kept (no forget, so no double learn); `startLearn` still starts nothing for a known session. It resets when a read succeeds, on `clear()`, and when the followed session changes. The header comment records the rule.
  - `RunControl.tsx`: prop **`sessionUnreadable`** disables Run (button, `runRequest` and `learnRequest`) and shows the sentence below it.
  - `ChecksStudioPage.tsx`: passes `guided.unreadable`.
- **Sentence (Uma-authored, one line, recorded like the other rows):** key **`sessionUnreadable`**: "Studio could not read the Run already started for this test, so Run is off until a page reload reads it." Basis delegated; source ADR-SC-006 "State and consequence stated in visible text"; note cites AC-3 conventions, the gate finding and the root ruling; fact quoted from `useGuidedSession.ts`: "once a `sessionId` is known nothing ever re-POSTs start: reload and reconnect only GET". Verifiable claims only: a start was answered (the pointer has a `sessionId`), the read was refused, Run is off, and a reload re-reads that session by GET. It names no cause, because a refused read carries none the page can word. No existing cited string fitted: `notReadyNow` ("Steps not ready to repeat.") does not say Run is off or what changes it.
- **Test (green after the fix):** GR › `read refused with 400: the pointer is kept, Run is off with the situation stated beside it, and nothing starts`, and the same with `409`. Asserts the sentence, Run disabled, a forced click sends no start, the read is not retried on its own (1 read), and the pointer's `sessionId` and `startKey` are unchanged.

### F2.2 F-L5b-4: `insertReference` with a same-name row

- **Real: reproduced first (red).** New page test: `readyDraft` declares a plain `USER_ID`; the Vault also holds a secret named `USER_ID`. Inserting `<secret USER_ID>` and saving wrote **no** `secretRef` with `secretId: USER_ID` (`expected [] to have a length of 1 but got +0`, `logs/f2-red-F-L5b-4.log`), so the token would have been undeclared at run.
- **Fix:** `pages/ChecksStudioPage/secretDeclaration.ts` (new) `declareInsertedSecret(rows, id)`; the page's `insertReference` calls it (the `EditableVariable` type moved there unchanged). A `<secret ID>` resolves by `secretId` only, and the row name is an opaque alias, so:
  1. a secret row with `secretId` = ID already exists: unchanged;
  2. the author's own incomplete secret row named ID: completed with `secretId` = ID;
  3. no row named ID: add `{name: ID, secret, secretId: ID}`;
  4. a row named ID that declares something else (a plain variable, or a secret pointing elsewhere): left untouched, and the `secretRef` is added under the first free alias `ID_2`, `ID_3`, … (kept within 64 characters), because a second row with the same name is a conflicting declaration (`validateTestVariables` "names declared both as a variable and as a secret") and overwriting the author's row would change what their other steps use.
  - D-8 holds: every secret row it writes carries a non-empty `secretId`; `toContractVariables` still drops a secret row without one.
- **Tests:** RR › `F-L5b-4: inserting <secret ID> whose ID is already the NAME of a plain row still declares a secretRef for that ID, and leaves the plain row alone` (red before, green after); `secretDeclaration.test.ts` (7 cases: the four branches, alias skipping a taken name, the 64-character limit, and the D-8 invariant across all cases).

### F2.3 Verify rows (from `frontend/`)

| # | Command | Result | Log |
|---|---|---|---|
| F2-V1 | `pnpm exec vitest run src/pages/ChecksStudioPage src/components/studio/run src/components/studio/runs src/components/studio/guided src/components/studio/evidence src/components/studio/templates --minWorkers=1 --maxWorkers=3` | **exit 0, 29 files, 625 passed**, 0 failed. 625 = 612 (gate) + 2 (read refused 400/409) + 1 (F-L5b-4 page) + 7 (`secretDeclaration.test.ts`) + 3 (copy-table rows for `sessionUnreadable`) | `logs/f2-v1-vitest-l5b.log` |
| F2-V2a | `pnpm run type-check` | **exit 0** | `logs/f2-v2-type-check.log` |
| F2-V2b | `pnpm run lint` | **exit 0, 0 errors, 308 warnings** | `logs/f2-v2-lint.log` |
| F2-V3 | `grep -rn "STUDIO_CAPABILITIES" frontend/src` | **0 hits** | `logs/f2-v3-grep-studio-capabilities.log` |
| F2-V4 | `grep -rn "PRODUCTION_ALPHA_TEMPLATES" frontend/src` | **0 hits** | `logs/f2-v4-grep-production-alpha-templates.log` |
| F2-V5 | `pnpm exec vitest run --minWorkers=1 --maxWorkers=4 --exclude 'src/test/a11y/**'` | **exit 0, 69 files, 1313 passed** (1300 after the gate + 13); `studioWcagAudit` not collected | `logs/f2-v5-vitest-full.log` |

### F2.4 Files (sha256 before → after this unit)

| File | Before (unit start; Dex's bytes where he edited) | After |
|---|---|---|
| `frontend/src/components/studio/guided/useGuidedSession.ts` | `175e5741fd73b8f3ee990ce29df01e80379a0c8e9b8c3c4493379460d631d2f4` | `21bee4dbf4ef28cb74c4a119f2c1cb25c9d3a50da9f869b498e1912b6c9320f2` |
| `frontend/src/components/studio/guided/guidedNarratives.ts` | `f86e5f785b9d0c55169ae7db5d419e87f673dda2b8e95e23d5677aa653640c4d` | `166a2bbbdd8863883d6b5974405c2f4cc9910812762f6aeae57a32f29ec61b26` |
| `frontend/src/components/studio/run/RunControl.tsx` | `293505b5a9ef40ae3b5c2463dad961aa85a72628f3bb73b9579e49786e120729` | `2385d817168b0fb9effb1100ed824fc4b82ace4acc924fa99a2b56c9a7b2498a` |
| `frontend/src/pages/ChecksStudioPage/ChecksStudioPage.tsx` | `8f398ef6d019e9e1b7df836db9d86333b4a67d97918e5704efbe4566ec6dca78` | `3ebc644f069a82502ae6659a44e484873d380b710a7d825c9f5f718aa32fdf9c` |
| `frontend/src/pages/ChecksStudioPage/secretDeclaration.ts` | new | `28d24d00e42a993f2866c8dc2cf7b5e4e6383b0ac74f095c1dad2c50e3fd8f25` |
| `frontend/src/pages/ChecksStudioPage/secretDeclaration.test.ts` | new | `7160c6213b75dff360c1f319a37adb4dede1785f16c9aa4c7adb8c9ed8ea23b8` |
| `frontend/src/pages/ChecksStudioPage/pageGuidedRun.test.tsx` | `2b41024aed3a2023a47a1b60617705d10dda528cf25184d2cf82c084891ee275` | `4db2f6a55a186ecce083bc33dbb01afa722638a5dae8c0c326d522be9560bf88` |
| `frontend/src/pages/ChecksStudioPage/pageReplayAndReferences.test.tsx` | `aa6c00c7d23dbf1538e74157e7d6003e067e5ddb13118de6162ea9112d013803` | `5c393bb62303d5e5568a9107c5b040b7e860c3d31b70dcd6b2de21f4ef7ace16` |

All other write-set files are byte-identical to the gate's final tree (`logs/f2-after-sha256-writeset.txt`).

### F2.5 New or changed visible strings and test IDs (for L6)

| What | Test ID | Visible text |
|---|---|---|
| New caption beside a disabled Run (stored session, read refused before any view) | `run-session-unreadable` | "Studio could not read the Run already started for this test, so Run is off until a page reload reads it." |
| New declaration row when an inserted secret's ID is already another row's name | Variables dialog row, name `ID_2` (`ID_3`, …), type Secret, secret ID | — |

Nothing else visible changed. Open after this unit: F-L5b-5 (refresh wording of the LEARNING sentence; copy note, no change requested) and F-L5b-6/F-L5a-4 stay as the gate left them; the commit-set note (F-L5a-2, plus ADR-SC-006 and the uncommitted `ExecutionReadinessService.java`) still applies, and `useGuidedSession.ts` is now also a copy-table source.
