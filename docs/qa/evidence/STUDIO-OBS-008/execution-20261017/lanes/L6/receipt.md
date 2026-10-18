# STUDIO-OBS-008 W4 lane L6 receipt: MSW E2E, D5 real-backend smoke, audit guard

- Agent: @dev (Dex), YOLO. Date: 2026-10-17. Host Node v23.10.0 (frontend), N24 only for the bootRun shell, pnpm.
- **Status: FINAL. Phase A, Phase B prep and Phase B (section 10) are complete on the frozen source. Audit 7/7, MSW E2E 13/13, D5 2/2 (honest CORS allow-list), no product defects, no file changed vs the freeze manifest.**
- **The Phase A runs are NON-EVIDENTIARY (superseded by section 10)**: `frontend/src` was not frozen (Uma's L5b-F1 fix was being applied; src files changed during the lane, see section 6). Phase B re-runs on the frozen source.
- Logs: `logs/` next to this file.

## 1. Files (sha256 before and after Phase A)

| Path | Before | After (Phase A) | Change |
|---|---|---|---|
| `frontend/e2e/studio-guided.spec.ts` | `8ab624fc40ff8c12e697cdf67070dabfa8b0abb06f65cb3be37f5986bab77db1` | `56a8bb7421ccf4bf5c81e732e1c2b95cbff11f779ae3bf7cb99eae3979b4e45e` | completion receipt scoped by `data-testid="guided-completion"` (`completion()` helper, 3 uses); header comment updated (scenarios now exist) |
| `frontend/e2e/mswProxy.ts` | `f431446dcd153813caeabe7b2ee2c1ead000c3268e9e0be32618049dbccf9aa4` | `d41ce976c7a57a731305159b1b19b24b43fe6d1ec541aa346457469c068ce9f6` | 3 scenarios + `apply()` hook after `resetStudioMocks()` |
| `frontend/e2e/start-servers.mjs` | `00519a46b54b03cb1690c4ef4fad021d9ce296b8252225a1b8d876090fb734a6` | `01b10542e4ea86185ccf0cb2528bb23c33be55acdf59862abcaf60e7091486ea` | real-backend mode only: proxy rewrites `Origin` to the backend origin (see 4.2). **REVERTED in Phase B prep (section 9)** |
| `frontend/e2e/studio-authoring-real-backend.spec.ts` | `32e904b9...a4c` | unchanged | none |
| `frontend/playwright.config.ts` | `fe89cfbb...f5` | unchanged | none |
| `frontend/src/test/a11y/studioWcagAudit.test.tsx` | `64f34778...1050` | unchanged (Phase B) | none yet |
| `docs/qa/accessibility/axe-results.json` | `51c29bb4...961` | unchanged (Phase B) | none yet |

Full lists: `logs/00-sha256-before.txt`, `logs/01-sha256-after-phaseA.txt`, `logs/02-sha256-final-phaseA.txt` (taken after the header-comment edit).
Not touched: `frontend/src` (read only), `backend/`, `studio-runner/`, `docs/specs/`, the story, `dispatch-governance.js`. No `pnpm install/add/remove`, no commit/stash/push.

## 2. Runs (all from `frontend/`)

| # | Command | Exit | Result | Log |
|---|---|---|---|---|
| A1 | `pnpm exec playwright test e2e/studio-guided.spec.ts --reporter=list` (before the fix below) | 1 | 6 passed, **2 failed** (first-Run and clarification-answer tests: strict-mode violation, see 3.1) | `logs/10-msw-guided-run1.log` |
| A2 | same, after the `completion()` fix | 0 | **8 passed**, 0 failed, 0 skipped (1.0 min) | `logs/11-msw-guided-run2.log` |
| A3 | `pnpm exec playwright test e2e/harness.spec.ts --reporter=list` | 0 | **5 passed** (6.3 s) | `logs/12-msw-harness-run1.log` |
| A4 | `pnpm exec playwright test e2e/studio-guided.spec.ts e2e/harness.spec.ts --reporter=list` (after Uma's partial L5b-F1 edits had landed) | 0 | **13 passed**, 0 failed, 0 skipped (1.1 min) | `logs/13-msw-guided-harness-run3-midfix.log` |
| D1 | `CHECKS_E2E_REAL_BACKEND=1 pnpm exec playwright test --project=real-backend e2e/studio-authoring-real-backend.spec.ts` (backend up, before the Origin fix) | 1 | preconditions passed; create test **failed**: `POST /api/v1/studio/tests` answered 403 "Invalid CORS request" (see 4.2) | `logs/21-d5-real-backend-run1.log` |
| D2 | same, after the Origin fix | 0 | **2 passed** (6.9 s) | `logs/22-d5-real-backend-run2.log` |
| D3 | same again (repeatability) | 0 | **2 passed** (5.0 s) | `logs/23-d5-real-backend-run3.log` |
| V | `pnpm exec tsc -p e2e/tsconfig.json --noEmit` ; `pnpm exec eslint e2e playwright.config.ts --ext .ts,.mjs` ; `playwright test --list` | 0 ; 0 ; 0 | clean; 13 tests in 2 files (`msw`) | (inline) |

The A1 failure is my spec's own defect, not a product defect: the receipt text also appears in the plan-explanation history block, so a bare text locator matched two nodes.

## 3. MSW E2E

### 3.1 Reconciliation of R1 to R11 against the running page

| # | Result |
|---|---|
| R1 Run enabled for UNLEARNED/NEEDS_RELEARN, label `Run Test` | Confirmed (first-Run, clarification, login, mixed-mode all click `button "Run Test"`) |
| R2 guided UI rendered in the page with L5a copy | Confirmed (status lines, question, completion, login notice, chips all found) |
| R3 status-line recorder | Confirmed in order: Preparing, Understanding 1/4, Running 1/4, Running 4/4, Saving...; mixed mode: Preparing, Repeating 1-1, Learning from step 2, Saving... |
| R4 `studio-save-state` text `Saved` | Confirmed |
| R5 `Open Variables` shows heading `Variables` | Confirmed |
| R6 focus on `Step N` after `Go to step N` and after `None of these` | Confirmed (both focus assertions pass) |
| R7 CANCELLED shows the existing title | Confirmed |
| R8 radio names, `Continue`, `None of these` | Confirmed (3 radios; `Reference` matches the first) |
| R9 no unhandled `/api/v1/studio/` request in a full learn | Confirmed (`unhandledStudioPaths == []` in both learn tests) |
| R10 mixed mode seeded by no-op PUT | Confirmed (chip `Steps changed — next Run learns from step 2` shows) |
| R11 no assertion on `firstLearnStepId`/`baseRevisionId` | Unchanged (not asserted) |

One spec change was needed: `getByText('Completed — learned from this run.')` is ambiguous (the same sentence is the plan-explanation history line, `data-testid="plan-explanation-history"`). The spec now reads the receipt through `getByTestId('guided-completion')`. Not a product issue; it is existing page behavior.

### 3.2 Proxy scenarios (`frontend/e2e/mswProxy.ts`)

`scenarios` is now `Record<string, { handlers; apply? }>`. `apply()` runs right after `resetStudioMocks()` in `POST /__test/scenario`, because the reset puts the guided script back to a plain full learn. Registered: `guided-clarification-page` = `learnWithQuestion('PAGE_CHOICE', 1)`, `guided-login-required-no-login-steps` = `loginRequired(false)`, `guided-login-required-login-steps-failed` = `loginRequired(true)`. `setGuidedScenario` is imported from `guidedHandlers`, the factories from `guidedFixtures`. The `/__test/scenario` GET `known` list now reports the four names.

## 4. D5 real-backend smoke (local, non-gating; not live, not OBS-009)

### 4.1 Setup actually used

- Precheck: `lsof -nP -iTCP:8080 -sTCP:LISTEN` empty (also 4177/4178). Single-Gradle lock free.
- Command (backgrounded, log in `logs/20-d5-bootrun.log`):
  `export PATH=$HOME/.local/share/fnm/node-versions/v24.20.0/installation/bin:$PATH; export CHECKS_SOURCE_UI_TEST=true FLYWAY_LOCATIONS=classpath:db/migration,classpath:db/seed; cd backend && python3 ../.aiox/sdc/STUDIO-OBSERVED-ORCH/execute-008/with-gradle-lock.py ./gradlew bootRun --no-daemon`
- Profile `local` (the default `spring.profiles.active`); Zonky embedded Postgres (x86_64 binary under emulation, per the WARN in the log); `LocalDevAuthFilter` dev identity.
- **The seed applied cleanly.** Flyway: "Successfully validated 23 migrations" (V1..V22 plus the repeatable `R__sample_data.sql`). `GET /api/v1/csi` returned 3 CSIs (178672, 285614, 396705 expected from the seed; `396705` Developer Portal confirmed). So no SQL insert or API workaround was needed. No backend source or migration touched.
- Readiness: `/actuator/health` answered 200 at the first poll (about 20 s after launch; "Started ChecksApplication in 7.316 seconds"). Health reports `partitions: WARNING` (seed rows in default partitions); unrelated to the smoke.
- PIDs I started: lock python 24675, gradlew wrapper JVM 24677, Gradle build JVM 24709, app JVM 24887 (listener on `*:8080`). No other PID was signalled.
- Stop: `kill -TERM 24887`; all four PIDs gone within seconds; the log ends `BUILD FAILED ... finished with non-zero exit value 143` and `[gradle-lock] released, exit 1`, which is the expected shape of a SIGTERM'd bootRun (143), not a build defect. After stopping: `lsof` on 8080/4177/4178 empty, the lock file is free (verified with a non-blocking `flock`), no `start-servers`/playwright process of mine left. (The Chrome processes on the host belong to the user's own browser.)

### 4.2 CORS on non-GET calls (the Origin rewrite below was REVERTED by root override, see section 9)

D1: `POST /api/v1/studio/tests` from the page answered **403 "Invalid CORS request"** (read from the Playwright trace network record: `Origin: http://127.0.0.1:4177`). Cause (verified from the trace plus `application.yml:113`, `SecurityConfig.buildCorsSource`): browsers add `Origin` to same-origin POST/PUT, Vite's proxy forwards it unchanged, and `checks.cors.allowed-origins` defaults to `localhost` 3000/3002/5173, so port 4177 on `127.0.0.1` is rejected. GETs carry no `Origin`, which is why the preconditions test and every list/read passed.

Fix (in my write set): `start-servers.mjs`, real-backend mode only, passes an inline `server.proxy['/api/v1']` with `configure` that sets the proxied request's `Origin` to the backend's own origin (same-origin to the backend). The backend allow-list is left as it is and no backend env was needed. The MSW mode is unchanged. Alternative that does not touch the harness: start the backend with `CHECKS_CORS_ALLOWED_ORIGINS=http://127.0.0.1:4177`. Root can pick; the harness fix makes the documented command work against a default `bootRun`.

### 4.3 What D2/D3 prove

Create from the New UI Test dialog, add 3 steps and save (3 distinct UUIDs), edit step 2 / add a 4th / move it up / save (original IDs stable and in order, inserted ID new, `sourceRevision` increased), reload (order, values, IDs identical), `getTest` and the capabilities shape. The spec deletes its draft in `afterAll`; after D3 `GET /studio/tests` returned 0 items (checked). D5 started no guided session (no runner, no gateway, no Vault, by design).

## 5. Product defects

None found in `frontend/src` by the MSW E2E (8 of 8, and 13 of 13 with the harness) or by D5 (2 of 2). The one real-backend failure was the harness origin issue in 4.2; as a note for the platform team, a POST from a dev origin outside `checks.cors.allowed-origins` fails with 403 by design.

## 6. Source stability

`frontend/src` changed during Phase A: files newer than my start include `ChecksStudioPage.tsx`, `authoredLiteralHint.ts` (+test), `guidedNarratives.ts`, `RunControl.tsx`, `ExecutionProgressView.tsx`, `runGate.test.tsx`, `run/index.ts`, `stepSeek.test.tsx`, `pageGuidedRun.test.tsx`. Uma's "L5b-F1 addendum" was **not yet present** in `lanes/L5b/receipt.md` when I looked (167 lines, no "addendum"). A4 ran against that partial state and still passed 13 of 13, but it is not evidence of the frozen tree.

## 7. Phase B plan (after "SOURCE FROZEN")

1. `pnpm exec vitest run src/test/a11y/studioWcagAudit.test.tsx --minWorkers=1 --maxWorkers=2` as a regression guard; record before/after of `axe-results.json` (I am its single writer; sha before `51c29bb4...`). Fix only if 008 UI breaks it (regenerate pinned keys with a recorded reason; no surface rewrite, no rule change, no extension, ADR-SC-006).
2. Fix the stale comments at `studioWcagAudit.test.tsx` ~lines 315-334 ("PENDING REWRITE ... STUDIO-OBS-008 AC-8 rewrites surfaces 4 and 5"): ADR-SC-006 rules out the rewrite, so the comments should say the surfaces stay on the not-yet-learned author state as a regression guard. Comment-only.
3. Re-run `studio-guided.spec.ts` plus `harness.spec.ts` on the frozen tree and record counts; optionally D5 again if root wants it on the frozen tree (needs the backend restarted through the lock).

## 8. Deviations and decisions

1. **[AUTO-DECISION] `start-servers.mjs` Origin rewrite** rather than a backend env var, because the lane may not change backend config and the documented D5 command should work against a default `bootRun` (4.2).
2. **[AUTO-DECISION] `completion()` helper** scopes the receipt locator by `data-testid="guided-completion"`; the "does not appear" assertions stay page-wide (stricter).
3. **[AUTO-DECISION] bootRun stopped with SIGTERM to the app JVM**, so Gradle printed `BUILD FAILED` (exit 143). Expected, recorded above.
4. **Not run, although appended to my prompt as skills:** the SYNAPSE diagnostics task, the coderabbit-review skill and checklist-runner (no checklist named); the mission defines the verification.
5. Phase B items are not done; nothing in this receipt claims them.

## 9. Phase B prep (edits only; no Playwright, vitest, audit or bootRun run)

Root override, 1: the Origin rewrite of 4.2 is removed, because it would stop D5 from ever catching a real CORS regression. D2 and D3 above (2 of 2) ran **with** the rewrite and are therefore not valid for the final D5; D5 must be re-run on the frozen source with the honest allow-list below.

**Exact CORS name (verified by grep and read of the source):**

| Item | Value |
|---|---|
| Environment variable | `CHECKS_CORS_ALLOWED_ORIGINS` |
| Property | `checks.cors.allowed-origins` |
| Defined | `backend/src/main/resources/application.yml:112-113`: `allowed-origins: ${CHECKS_CORS_ALLOWED_ORIGINS:http://localhost:3000,http://localhost:3002,http://localhost:5173}` (no override in `application-local.yml` or any other `application*.yml`) |
| Bound by | `backend/src/main/java/com/citi/put/checks/config/CorsProperties.java:7` (`@ConfigurationProperties(prefix = "checks.cors")`, field `allowedOrigins`; its `@DefaultValue` is only a fallback when the property is absent) |
| Used by | `backend/src/main/java/com/citi/put/checks/config/SecurityConfig.java:197` (`config.setAllowedOrigins(corsProps.allowedOrigins())`, source registered for `/api/**` at line 212) |

The name in my earlier recipe was right. D5 bootRun env for the re-run: `CHECKS_SOURCE_UI_TEST=true CHECKS_CORS_ALLOWED_ORIGINS=http://127.0.0.1:4177 FLYWAY_LOCATIONS=classpath:db/migration,classpath:db/seed`, otherwise the command of 4.1. (Setting the variable replaces the default list, which is fine for this smoke; it is not a backend change.)

| File | sha256 before | sha256 after | Change |
|---|---|---|---|
| `frontend/e2e/start-servers.mjs` | `01b10542e4ea86185ccf0cb2528bb23c33be55acdf59862abcaf60e7091486ea` | `2475c0c428d456f2f91e804774c1fb6e582fd50f231d5376f092b58a37f92854` | proxy override removed (the `server:` option is back to the one-line original); header comment now names the required backend env (`CHECKS_CORS_ALLOWED_ORIGINS`, plus `CHECKS_SOURCE_UI_TEST` and the seed `FLYWAY_LOCATIONS`) and says the origin is deliberately not rewritten |
| `frontend/src/test/a11y/studioWcagAudit.test.tsx` | `64f347784be9490c636487adab899f1f65f97fa38d6aafaae162de0e52551050` | `cf00ca4d9f6b75484d73e3f3e081f27fd9da63fd97d0ae8ed51f3a376cf79cc6` | **comments only**: the two "PENDING REWRITE ... AC-8 rewrites surfaces 4 and 5" comments above surfaces 4 and 5 now read "Regression guard only", citing ADR-SC-006 and saying the surfaces are not rewritten. No test logic, name or pinned key changed. `grep -n "AC-8\|PENDING REWRITE"` on the file now returns nothing |

Lint and types (checks, not test runs), from `frontend/`:

| Command | Exit | Log |
|---|---|---|
| `pnpm exec eslint e2e playwright.config.ts --ext .ts,.mjs` | 0 | `logs/04-phaseB-prep-eslint.log` |
| `pnpm exec tsc -p e2e/tsconfig.json --noEmit` | 0 | `logs/05-phaseB-prep-tsc.log` |

`logs/03-sha256-phaseB-prep.txt` holds the two after-hashes. The audit-test edit was not executed; it will be exercised by the Phase B audit run.

Deviation 1 in section 8 (the Origin rewrite) is superseded by this section. The Phase B plan of section 7 stands, with one addition: D5 re-run on the frozen source with the CORS env above, bootRun through the lock, stopped afterwards.

## 10. Phase B on the frozen source (evidentiary)

Freeze: `final-gates/freeze-manifest.json`, source digest `eea9c8de...f2002`, 1705 files, dist `897182d5...`. I re-read `lanes/L5b/receipt.md` first, including the L5b-F1 and L5b-F2 addenda (new IDs: `run-learning-elsewhere`, `run-session-unreadable`, `guided-authored-literal-hint`; replay seek now "Seek to step N"; an `ID_2` alias row can appear). None of those strings is used by my specs.

| # | Command (from `frontend/`) | Exit | Result | Log |
|---|---|---|---|---|
| B1 | `pnpm exec vitest run src/test/a11y/studioWcagAudit.test.tsx --minWorkers=1 --maxWorkers=2` | 0 | **1 file, 7 passed, 0 failed, 0 skipped** (38 s). No baseline regeneration was needed | `logs/31-audit-run1.log` |
| B2 | `pnpm exec playwright test e2e/studio-guided.spec.ts e2e/harness.spec.ts --reporter=list` (project msw) | 0 | **13 passed** (8 `studio-guided` + 5 `harness`), 0 failed, 0 skipped, 0 flaky (1.1 min) | `logs/40-msw-final.log` |
| B3 | `CHECKS_E2E_REAL_BACKEND=1 pnpm exec playwright test --project=real-backend e2e/studio-authoring-real-backend.spec.ts --reporter=list` | 0 | **2 passed**, 0 failed, 0 skipped (5.0 s); 0 leftover drafts afterwards | `logs/51-d5-real-backend-final.log` |
| B4 | `python3 .aiox/sdc/STUDIO-OBSERVED-ORCH/strict-qa-20261014/capture-manifest.py .../lanes/L6/logs/phaseB-after-manifest.json` | 0 | 1705 files, source digest `eea9c8deb62a35aeb24108a71acf5c494f053fb326d1f8202c1a69b8b2c2f002` (**identical to the freeze**), dist digest `897182d5...` (identical) | `logs/60-capture.log` |

### 10.1 Audit (regression guard)

- Result: all 7 surfaces passed against the pinned keys with the 008 UI (readiness chip, "Insert reference", capability captions, the extra capabilities request, "Seek to step N"). **The guard did not break, so no key was regenerated and the audit test was not touched beyond the comment-only edit of section 9** (sha `cf00ca4d...` before and after the run).
- `docs/qa/accessibility/axe-results.json` (the audit's report side effect; I am its single writer): sha256 before `51c29bb491b25aafb91240a1b7f875bd4670b980adb43b13d344d8d8e014e961`, after `9d3853da76e71a4b0c69a90ac3a5863345bdbb78076da9df09c6044a99a45934` (`logs/30-audit-before-sha256.txt`, `logs/32-audit-after-sha256.txt`). `git diff --stat` against HEAD: 37 insertions, 40 deletions in that one file. From the diff, the changes I looked at are axe node-selector strings (for example `.MuiPaper-elevation1.MuiCard-root.css-16vq84g-MuiPaper-root-MuiCard-root` becoming `.MuiPaper-elevation.MuiPaper-elevation1.MuiCard-root`, generated ids `:r1i:` becoming `:r1j:`, and a few CSS class selectors). I did not review all 77 changed lines one by one, and I did not diff violation counts; the test passing is the check. This is selector churn from re-rendering, not a rule or surface change (inference from the lines I read).
- The run printed React "not wrapped in act(...)" warnings on stderr for `ChecksStudioPageInner` and `FormControl`; they did not fail anything. I did not check whether they pre-date 008.

### 10.2 D5 (local real-backend authoring smoke; non-gating; not live; not OBS-009)

- Ports 8080/4177/4178 free before (lsof exit 1); lock free.
- bootRun: `export PATH=$HOME/.local/share/fnm/node-versions/v24.20.0/installation/bin:$PATH; export CHECKS_SOURCE_UI_TEST=true CHECKS_CORS_ALLOWED_ORIGINS=http://127.0.0.1:4177 FLYWAY_LOCATIONS=classpath:db/migration,classpath:db/seed; cd backend && python3 ../.aiox/sdc/STUDIO-OBSERVED-ORCH/execute-008/with-gradle-lock.py ./gradlew bootRun --no-daemon` (profile `local`, the default). Log `logs/50-d5-bootrun-final.log`: 23 migrations validated, started in 7.3 s, `/actuator/health` 200 at about 20 s, `/api/v1/csi` 200.
- **No Origin rewrite**: `start-servers.mjs` is the reverted version (`2475c0c4...`), so the POST carried `Origin: http://127.0.0.1:4177` and the backend accepted it only because of the allow-list env. That is the honest check root asked for.
- PIDs I started (`logs/52-d5-pids.txt`): lock python 34043, gradlew wrapper 34048, Gradle build JVM 34082, app JVM 34203. I sent SIGTERM to 34203 only; all four exited. Afterwards: 8080, 4177 and 4178 not listening (lsof exit 1), the lock is free (non-blocking `flock` succeeded), the log ends `[gradle-lock] released, exit 1` (the usual SIGTERM/143 shape). No other PID was signalled; no watcher or server of mine is left.

### 10.3 Changed files versus the freeze

`logs/61-freeze-diff.json`: **changed 0, added 0, removed 0** versus `freeze-manifest.json` (same 1705 paths, same sha256 for each). The L6 files were already in their final form at the freeze, with these hashes:

| File | sha256 (= freeze manifest) |
|---|---|
| `frontend/e2e/studio-guided.spec.ts` | `56a8bb7421ccf4bf5c81e732e1c2b95cbff11f779ae3bf7cb99eae3979b4e45e` |
| `frontend/e2e/mswProxy.ts` | `d41ce976c7a57a731305159b1b19b24b43fe6d1ec541aa346457469c068ce9f6` |
| `frontend/e2e/start-servers.mjs` | `2475c0c428d456f2f91e804774c1fb6e582fd50f231d5376f092b58a37f92854` |
| `frontend/e2e/studio-authoring-real-backend.spec.ts` | `32e904b917771f909b9e8ac4d57da81e066f8f88d1b7f44e5b4a742f7a54ea4c` (never changed) |
| `frontend/playwright.config.ts` | `fe89cfbb0095a6c369301c3089e59596d8abc19478332ff1ab25024b077320f5` (never changed) |
| `frontend/src/test/a11y/studioWcagAudit.test.tsx` | `cf00ca4d9f6b75484d73e3f3e081f27fd9da63fd97d0ae8ed51f3a376cf79cc6` (comments only) |

The one file that changed during Phase B is `docs/qa/accessibility/axe-results.json` (51c29bb4... to 9d3853da...); it is not in the capture manifest's scope (it is under `docs/`), and it is inside the L6 write set. The Phase B logs were added under `lanes/L6/logs/` (also my write set).

### 10.4 Product defects

None found: audit 7/7, MSW E2E 13/13 and D5 2/2 on the frozen source.

### 10.5 Deviations (Phase B)

1. The root override reversed my earlier deviation 1 (Origin rewrite); section 9 records it and B3 ran without it.
2. Not run, although appended to my prompt as skills: the SYNAPSE diagnostics, coderabbit-review and checklist-runner skills.
3. The D2/D3 passes of section 4 are superseded by B3.
