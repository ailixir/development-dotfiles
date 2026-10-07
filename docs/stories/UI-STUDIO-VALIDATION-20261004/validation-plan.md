# UI Studio — live validation (2026-10-04)

- Branch: `brunobuger/ui-studio` (uncommitted vault-secrets / dispatch work in tree)
- Mode: paired. The user drives each phase in the browser and reports issues; Orion triages from
  server logs and the API, routes each issue to the owning agent, and @qa re-verifies.
- Stack: `./dev.sh --seed` — backend :8080 (`local,dev`), studio-runner :8090 (real Chromium),
  Vite :5173 standalone. Federated mode is out of scope for this round.
- Translation: **Vertex** — `epicagentai` / `global` / `gemini-3.8-flash`, ADC credentials.
  Probe call returned 200 before boot.
- Secrets: Vault provider `none`, FE `STUDIO_CAPABILITIES.vaultSecrets = false`. Validated as the
  *disabled* capability (Phase 6).

## Phases

| # | Phase | Owner (triage → fix → verify) | You test (UI) | Orion checks (server side) |
|---|---|---|---|---|
| 0 | Static baseline | @qa | — | FE tsc + vitest, runner type-check/lint/unit. Backend suite deferred (Docker down, live bootRun) |
| 1 | Boot & reachability | @devops | `/checks/studio` loads, nav shows Studio, seed checks visible | health of :8080/:8090/:5173, startup log names `vertex` provider |
| 2 | Authoring | @ux-design-expert → @dev | Create a UI-test check (wizard) and open it in Studio; add/edit/reorder/delete steps; variables; Save; reload persists | `PUT /tests/{id}` persists, `compileStatus` stays `STALE` after save |
| 3 | Translation (Vertex) | @architect → @dev | Press Run on free-form English (simple nav, click, type, assert); open **CODE** tab; edit one step and Run again; write one ambiguous/impossible step | `POST /compile` → `READY`, provenance model = `gemini-3.8-flash`, usage recorded, prompt version 2.2.0; refusals surface as author-fixable errors |
| 4 | Execution & live logs | @qa → @dev | Run Test; watch step states + live logs; Stop mid-run; a deliberately failing assertion; a slow page | runner log shows job, `runtimeCapMs: 120000`; SSE stream; terminal outcome PASSED/FAILED/CANCELLED |
| 5 | Evidence / video | @qa → @dev | **PROOF** tab: play, seek by clicking steps, stopped-run narration; Runs page (`/checks/studio/runs`) history | 200/206 ranged video, `video.status AVAILABLE`, partial flag correct |
| 6 | Secrets — capability disabled | @dev → @qa | Wizard and Studio show no Secret option; nothing secret-related is reachable | `/api/v1/studio/.../secrets` → 503 `VAULT_NOT_CONFIGURED`; legacy `/api/v1/secrets` → 404 |
| 7 | Guards & negatives | @qa | Run while kill switch off (Orion restarts backend with `STUDIO_EXECUTION_ENABLED=false`); invalid input; long step (>1024 chars) | 503 `DISPATCH_DISABLED`; validation errors are specific |
| 8 | Close-out | @qa | — | Consolidated gate: PASS / CONCERNS / FAIL with this log |

## Issue loop

1. You report: phase, what you did, what you expected, what happened (screenshot optional).
2. Orion logs it below, pulls the matching backend/runner/browser evidence, and classifies it as defect, UX, config/env or expected-by-design.
3. Defects go to @dev with the evidence, as a narrow fix plus a test, in this tree. Orion tells you when it's ready (Vite hot-reloads; backend devtools restarts).
4. You re-test. @qa confirms and the issue is closed.

## Issue log

| ID | Phase | Summary | Class | Owner | Status |
|---|---|---|---|---|---|
| VAL-001 | 6 | Secrets "feature flag" is a compile-time FE constant (`studioCapabilities.ts`); backend has no explicit flag (disable = `vault.provider: none`). Requirement: a flag that disables the capability. To confirm with the user whether this must be runtime/env-configurable | requirement gap | @sm story → @architect → @dev | **decided 2026-10-04:** runtime env-configurable flag (backend property that disables the API and is served to the FE as a capability). New scope: draft story after this validation |
| VAL-002 | 0 | `SecretInput.test.tsx`: 2 tests time out (5000ms) in the scoped FE run (350/352) under load; the file passes 13/13 alone, twice. Tests take 2.6–4.2s each standalone, so they are load-sensitive flakes in the uncommitted rework (inference) | test flake | @dev | fixed: `userEvent.setup({delay:null})` + paste-based fill, test file only; file 29.1s → 9.1s; scoped run 352/352 |
| VAL-003 | 0 | **Partly resolved (Docker up):** `StudioContractTest` 14/14, `ProgressCallbackIT` 16/16, `CompilePipelineIT` 15/15, `StudioAuthoringApiIT` 5/5, `StudioApiIT` 7/7, `OptimisticSaveIT` 3/3; 441 tests in 60 classes, 0 failures. Originally not run: FE full `vitest run` (gated on a green scoped run), runner deployment tier (needs helm, docker and image), backend suite (Docker down, live bootRun) | coverage gap | @qa | open |
| VAL-004 | 3 | Every Vertex compile fails `GATEWAY_TIMEOUT` at ~10.3s (`latencyMs=10303`, configured `request-timeout` 60s). Suspected: OkHttp default 10s read timeout on the custom client at `GenAiLlmGatewayClient.java:58`. **Blocks Phase 3–5 on Vertex** | defect (HIGH) | @dev → @qa | fixed: OkHttp connect/read/write/call timeouts derive from `request-timeout` (`GenAiLlmGatewayClient.java:59,~111`), 2 tests with a negative control. Live: calls now return OK in 16–28s. A 60s run still timed out once, so local runs use `STUDIO_GATEWAY_REQUEST_TIMEOUT=200s` (see VAL-007) |
| VAL-005 | 0 | Duplicate `@testing-library/dom` (RTL 14.3.1 nests 9.3.4; user-event uses 10.4.1). RTL's act wrapping misses user-event actions, so act warnings remain (252 per scoped run) | test infra (LOW) | @dev | **deferred:** test tooling only, no production impact. A dependency reinstall during another session's active FE edits is risky |
| VAL-006 | 3 | **Every Vertex compile ends `NEEDS_REVISION`.** The prompt (output-contract 2.2.0) asks for the proposal envelope `{version,kind,steps[{stepId,status,code}]}`. `GatewayResponseParser.parseProposal` returns that raw envelope as the "artifact", and the artifact validator rejects `kind`/`stepId`/`status`, misaligned `stepIndex` and missing `originalText`. `IncrementalAssembler` (proposal → artifact) has no caller in main (STUDIO-INC-001 says it is test-only). Already at HEAD; the recorded-fixture corpus is artifact-shaped, which hid it | defect (CRITICAL) | @architect → @dev → @qa | design confirmed (`VAL-006-design.md`). Introduced by merge `ec94e9585`, which kept the envelope client and dropped its pipeline consumer. Decisions: declared client flag; UNSUPPORTED/CLARIFICATION ends compile with no repair; FULL only. **Fixed:** `CompilePipeline.java:252-288` + client flag; `LiveProposalPipelineTest` 4/4 (all 4 fail without the fix); `*compile*` 359 pass/0 fail/27 skipped (Docker). **Live:** `READY` in 26s, 1 attempt, 4 clean steps |
| VAL-007 | 3 | Live Vertex latency per call is 16–28s, against 3s for a comparable direct call. One attempt hit the 60s timeout. With repairs (up to 3 calls), compile takes about 67s. This is a product UX/perf concern | perf (MEDIUM) | @architect | open. Latency follows thinking tokens: example.com steps 3s; Google steps 67–77s with 10–11.5k thinking tokens (`thinkingLevel=MEDIUM`); a later run took **119s with 19k thinking tokens** for the same 3 steps. **Benchmark** (`benchmark/report.md`): LOW ≥ MEDIUM ≥ HIGH on quality and 3–6× faster (LOW p50 2.8s, p95 18.3s). **Applied, verified live:** `thinking-level: ${STUDIO_GATEWAY_THINKING_LEVEL:LOW}`; compiles 2.7–2.8s, audit `thinkingLevel=LOW`. Every test recompiles once (fingerprint change) |
| VAL-008 | 1 | Embedded Postgres is recreated on every devtools restart, so all Studio data is lost whenever backend code reloads during a session | dev-env (LOW) | @devops | open, known |
| VAL-009 | 3 | FE has no specific copy for `UNSUPPORTED_CAPABILITY` / `AMBIGUOUS_INTENT` refusals | UX (MEDIUM) | @ux → @dev | **fixed:** `compileDiagnosticNarratives.ts`; CODE tab row "Step N can't be done in a browser test: <msg>. Rewrite or remove it."; Run alert with "Go to step N"; plain text only (XSS test) |
| VAL-010 | 3 | Context-input path shows the model real authoring `stepId`s while the writable IDs are generated (two ID sets). No failure observed | design (LOW) | @architect | open, deferred |
| VAL-011 | 4 | A failed assertion on a missing element reads `text content to contain expected "Example Domain", last seen "TimeoutError" after 30000ms`. "last seen TimeoutError" hides the real cause: no element matched (example.com no longer has an `<h1>` or a "More information" link, so the FAIL itself is correct) | UX/diagnostics (MEDIUM) | @dev (runner) | **fixed** (`playwrightAdapter.ts:213,346`): "no element matched" / "matched more than one element" / "last seen \"text\"". Runner unit tests 1115 pass. Live check pending runner rebuild |
| VAL-012 | 4 | Execution logs carry `stepIndex: null` on every line, including "step N started/PASS/FAIL". The runner's log entries have no step field, and `RunnerReportProjection.java:374` hard-codes `null`. The UI cannot tie a log line to its step | improvement (MEDIUM) | @architect → @dev | **Ruled DO NOW, ADR-002 Class B:** optional `RunnerLogEntry.stepIndex`; backend deploys before runner (user accepted). **Fixed, verified live:** log lines carry `stepIndex` 0/1/… and run-level lines carry null. Runner 1119 pass; `RunnerReportProjectionTest` 22/22. Docker ITs (`StudioContractTest`, `ProgressCallbackIT`) not run |
| VAL-013 | 4 | A failed step says only *what* timed out, never *where* the browser was. Exec `e62e0f5d` ended on Google's reCAPTCHA "unusual traffic" page (`/sorry/...`), and only the video shows that. Suggest adding the page URL and title at failure to the step message | improvement (MEDIUM) | @dev (runner) | **fixed, verified live:** `(page: https://www.google.com/sorry/index — …)` on the CAPTCHA run. The title leak is spun off as VAL-020 |
| VAL-014 | 3 | Translation picked an ambiguous locator: `getByLabel('Search')` resolved to 6 elements (strict-mode violation, exec `d303251d`). The rephrased step compiled to `getByRole('combobox', {name:'Search'})` and passed. Prompt guidance could prefer role+name for inputs. **2nd occurrence 2026-10-04:** Wikipedia `getByPlaceholder('Search Wikipedia')` matched 2 elements, which meets the ruling's re-open trigger; the benchmark T6 measures rule 7. **Benchmark:** rule 7 scored 23/27 vs 22/27 (noise). Stays deferred; it would need 2.4.0 | translation quality (LOW) | @architect (prompt) | **Deferred (user):** rule-7 text is ready in the rulings file for the next `output-contract` bump (2.3.0); `syntax-reference` is excluded |
| VAL-015 | 4 | Synthetic log lines (`step N SKIPPED`, `run FAILED`) have `at: null`. `runtime.chromium` is `null` in every run, so the evidence lacks the browser version | evidence completeness (LOW) | @dev (runner) | **no change, by design:** null `atMs` on synthetic lines is deliberate (ADR-002 §INT-1); a null `chromiumBuild` locally is deliberate. Spun off VAL-018 |
| VAL-016 | 5 | Recording is 1280×720 while the viewport is 1920×1080 (by design, §6.1), so page text in the video is downscaled and hard to read | UX (LOW) | @ux | open, by design |
| VAL-017 | 4 | Every failing assertion waits the full 30s step timeout before failing, so a wrong expectation costs 30s per run | UX/perf (LOW) | @architect → @dev | **Ruled:** no contract change. Expose `configuration.timeoutSeconds` in the FE (hardcoded 30 at `studioTypes.ts:556`). User chose this. **Fixed:** "Step timeout (seconds)" field in Studio's Test setup card, bounds 1–120, default 30 (`studioTypes.ts:556-576`, `ChecksStudioPage.tsx`). `pageStepTimeout.test.tsx` 7/7; scoped FE 576/576. Run Test with an invalid value and unsaved edits is unverified. **Superseded 2026-10-04 (user):** the field is removed and the FE always sends the default 30s. Server validation 1–120 (VAL-023) is kept for API clients. **Done:** `ChecksStudioPage.tsx:573` forces `DEFAULT_STEP_TIMEOUT_SECONDS` (30) on every save; field and min/max constants removed. Scoped FE 354/354 |
| VAL-018 | 4 | Key mismatch: the runner reports `runtimeVersions.chromiumBuild`, but `RunnerReportProjection.java:386` reads `chromium`, so `runtime.chromium` is null even in the pinned image | defect (MEDIUM) | @dev | **fixed** (`RunnerReportProjection.java:402`), unit-tested. Can't be seen live, because local `chromiumBuild` is null by design |
| VAL-019 | 3 | Intermittent `GATEWAY_PARSE_FAILURE` (Google steps, attempt 1, `thoughtsTokens=10281`, 67s, 478-byte output). The audit line doesn't say *why* the envelope was rejected, and the compile ends with no repair. The retry with the same input succeeded (77s, 11524 thinking tokens) | defect/observability (MEDIUM) | @architect → @dev | Ruled (`VAL-019-007-rulings.md`). User decisions: **D1** exhausted parse failures end STALE (inference contract §4 amended); **D2** repair prompt gets the reason code only (no compile-time video exists); **D3** `request-timeout` 150s interim. **Fixed (unit; live smoke OK):** deadline passed to the gateway (`CompilePipeline.java:249`), `ProposalRejection` enum with `rejectReason`/`rejectStepIndex` in audit, parse failure consumes a repair (reason code + step position), exhausted → STALE. **`PROMPT_VERSION` 2.2.0 → 2.3.0** (repair prompt changed; only the `output-contract` header changed) |
| VAL-020 | 4 | **Leak in the VAL-013 suffix:** Google's /sorry page title *is* the search URL, so the query string (`q=hosting`, `sxsrf` token) appears via the title despite the origin+path rule on the URL | security (HIGH) | @dev | **fixed, verified live:** `sanitizeTitle` in `pageLocation.ts` gives `(page: https://www.google.com/sorry/index — "https://www.google.com/search")` with no query string. Runner 1124 pass |
| VAL-021 | 7 | `POST /tests` with `steps: []` is accepted (draft saved). Compile then ends `STALE` with `COMPILE_INTERNAL_ERROR` instead of a 400 the author can act on | defect (MEDIUM) | @dev | **fixed (unit):** empty steps are still accepted on save, because the FE creates drafts with `steps: []`. Compile now refuses with `400 INVALID_STEPS` "This test has no steps…" (`AuthoringLimits.java`). **Verified live.** |
| VAL-022 | 7 | A whitespace-only step is accepted. Compile spends a Vertex call and ends `GATEWAY_PARSE_FAILURE`, which reads as a provider fault when it is an author error | defect (MEDIUM) | @dev | **fixed (unit):** `400 INVALID_STEPS` "Step N is blank…" on POST/PUT and at compile (`LegacyStudioAdapter.java:221`). **Verified live.** |
| VAL-023 | 7 | Server does not validate `configuration.timeoutSeconds` (contract 1–120): `0` is silently stored as 30, and `121` is stored as 121 and compiles `READY`. Only the FE (VAL-017) enforces the bounds | defect (MEDIUM) | @dev | **fixed (unit):** `400 INVALID_CONFIGURATION` outside 1..120, with no coercion (`UITestRequest.java:125-160`, `LegacyStudioAdapter.java:230`). **Verified live.** |
| VAL-024 | 7 | Line-length (1024) and step-count (100) limits are enforced at compile (`SOURCE_LINE_TOO_LONG`, `SOURCE_TOO_MANY_STEPS`, clear messages) but not at save, so an over-limit draft can be saved and fails only on Run | UX (LOW) | @dev | **fixed:** `AuthoringLimits.requireSaveable` on POST/PUT (v1+v2), same codes and messages as compile. Residual: the 65536 total-bytes bound is still checked only at compile |
| VAL-025 | 4/5 | User idea (D2): on a run failure, point the author to the video, alongside the VAL-013 page location | UX (LOW) | @dev | **fixed:** "Watch the recording at this step" on FAIL steps when the video is AVAILABLE (`ExecutionProgressView.tsx:139,272`) |
| VAL-026 | 3 | FE compile wait: static spinner for up to 330s with no elapsed time (G1); flat 600ms polling, ~550 req/compile (G3); 330s constant unpinned and contradicts its comment (G4). G2/G5 (cancel, progress) deferred | UX (MEDIUM) | @dev | **fixed (unit):** "Preparing your test… m:ss" with a hint from 15s, on Run and on the CODE tab; backoff 600ms→5s (≤67 reads, was ≤526); `COMPILE_WATCH_WINDOW_MS` = 315s, pinned. 331 FE tests pass; 5/10 new tests fail without the fix. Live look pending |
| VAL-027 | 2 | Side effect of VAL-022: saving a step edited down to blank now gets a 400, but `saveDraft` shows only a generic error toast, not the server message. Also, openapi's compile 400 description does not list `INVALID_STEPS` | UX/docs (LOW) | @dev | **docs fixed:** openapi descriptions list the codes, `BASE_SHA256` re-anchored to `43fe0bb4…`, ADR-002 §13 row (Class A, flagged for @architect: public routes may be Class C). **FE toast fixed:** `saveErrorMessage.ts` shows the server message for the five 400 codes, generic text otherwise |
| VAL-028 | 4 | Action-path strict-mode failures print Playwright's raw message, including page markup (`<input type="search" … aria-label=… placeholder=…`). The assertion path (VAL-011) deliberately suppresses page text, so the two paths are inconsistent, and markup attributes can carry page data | security/consistency (MEDIUM) | @dev (runner) | **fixed (unit):** `describeActionFailure` in `playwrightAdapter.ts` gives fixed phrases ("fill failed: the locator matched 2 elements; make the step more specific.") for click/fill/press/check/uncheck/hover/selectOption. Runner 1143 pass. Live: not re-triggered (the Wikipedia locator now resolves uniquely) |
| VAL-029 | 4 | `goto`/`waitForURL` failures still print Playwright's raw message, which can embed URLs with query, fragment or userinfo (same class as VAL-020) | security (MEDIUM) | @dev (runner) | **fixed (unit):** `describeNavigationFailure` gives fixed phrases; a `net::ERR_*` code is kept only if the whole token matches; no URL is echoed. Runner 1153 pass. **Verified live:** `goto failed: the address could not be reached (net::ERR_NAME_NOT_RESOLVED). (page: about:blank)` with no query or fragment in the message |
| VAL-030 | 3 | **Benchmark:** the provider schema requires only `stepId`/`status`, but the parser requires `reason`+`message` on refusals. Models omit `message`, so 52/60 correct UNSUPPORTED/CLARIFICATION refusals end `GATEWAY_PARSE_FAILURE` (3 calls each). The per-status `anyOf` candidate gave 8/8 | defect (HIGH) | @dev | **fixed, verified live:** `anyOf` schema (`GenAiLlmGatewayClient.java:454-477`), `providerSchemaVersion` 1→2. "Check the server CPU is below 50%" → `NEEDS_REVISION` `UNSUPPORTED_CAPABILITY` in 4s, 1 attempt. Unverified: whether the R2D2 proxy accepts `anyOf` (no fallback flag exists) |
| VAL-031 | 3 | **Benchmark C07:** on a Google-like page every config wrote `getByRole('searchbox')`, but the field is a combobox (0/all). No config fixes it | translation quality (MEDIUM) | @architect → @dev | Ruled (`VAL-031-ruling.md`): runner-side text-entry role equivalence for fill/press (exact role first; one unique alternative or fail; never `.first()`), executor 2.0.0 → 2.1.0, backward-compatible. Orion: DO NOW, because thinking LOW already recompiles every test. Release order: runner, then backend pin. **Fixed:** `playwrightAdapter.ts` equivalence + `text-entry-equivalence:` log line; `EXECUTOR_VERSION` 2.1.0; backend pin 2.1.0 (`RuntimePinProperties`, `application.yml`); runbook §12(e). Runner 1173 pass; real-Chromium 5/5; backend fingerprint/readiness tests pass. Not run: C07 benchmark rerun |
| VAL-032 | 8 | Gate: full FE suite 716/717. `StudioTestsPage.test.tsx` times out at 5s under suite load (2.3s alone) | test flake | @dev | **fixed:** delay:null + paste; 15s per-test timeouts where the waits are inherent (StudioTestsPage, pageEvidence ×2, SecretInput:139). **Full FE suite 759/759 twice** |
| VAL-033 | 8 | Gate: the model's refusal `message` is stored in compileDiagnostics without secret masking (`DiagnosticsBounder` javadoc says it redacts) | security (LOW) | @dev | **fixed:** shared `RepairPromptAssembler.redactCredentials` runs on message/node/excerpt before clamping (pattern-based; declared secret values are never visible to compile). Tests fail without the fix |
| VAL-034 | – | Unattributed in-progress FE work (not from this session): `studioApi.listAllTests/listAllExecutions` read **every** page (size 100) for client-side search and filtering, used by `StudioListLayout` on the Tests and Runs pages. Unbounded N requests as executions grow | performance (MEDIUM) | owner of that work | open, flagged |
| VAL-035 | 5 | PROOF shows the expiry as a raw ISO timestamp ("Available until 2026-11-04T03:48:59.517983Z") | UX (LOW) | @dev | **fixed:** `formatEvidenceInstant.ts` (locale date/time) |
| VAL-036 | 2 | Enter in "Add a test step" does not add the step (only "+" does), and Run Test silently ignores text left in that field. The author believes the step was tested | UX (MEDIUM) | @dev | **fixed, verified live:** Enter adds, Shift+Enter adds a newline; pending text is added before Save/Run (one click → PUT with 3 steps → compile → run PASSED) |
| VAL-037 | 4 | With unsaved changes the panel says "Save before running… Save these changes to make Run available", but Run is enabled and saves first. The copy contradicts the behaviour | UX (LOW-MEDIUM) | @dev | **fixed, verified live:** "Unsaved changes — Run will save them first, then run the saved checklist." |
| VAL-038 | 3 | The refusal alert renders inside the page header: the title is squeezed to "VAL wikipe…" and Run moves above it | UX (MEDIUM) | @dev | **fixed:** full-width alert slot below the header. **Verified live:** title and actions intact, "Go to step 2" present |
| VAL-039 | 4 | **One Run click → two `POST /execute` 120ms apart** (23:49:36.191 / .311) → two executions of the same revision; the server did not dedupe (so different idempotency keys, inferred). It happened with text pending in the add-step field. Found via a duplicate row on the Runs page | defect (HIGH) | @dev | **mitigated:** one idempotency key per Run press; Run blocked until the accepted run is shown and ends (3s safety release); guard test fails without it. **Live repro under the same conditions: 1 PUT → 1 compile → 1 execute.** Root cause not reproduced in jsdom or live, so it stays unconfirmed |
| VAL-040 | 4 | Non-deterministic compile on LOW: "Search Wikipedia for Alan Turing" → sometimes `getByRole('searchbox',…)` (PASS), sometimes `getByPlaceholder('Search Wikipedia')`, which matches the visible input plus a hidden twin and fails strict mode (QA re-gate exec `10eb12d9`). Authors see pass/fail flip with no edit | defect (HIGH) | @dev | **fixed (unit + real Chromium):** the seven actions resolve via `filter({visible:true})`; ≥2 visible → strict failure; 1 → act; 0 → not-visible timeout. Composes with VAL-031; assertions unchanged; `force:true` opts out; log `visible-only-resolution:`. Runner 1187 pass; real-Chromium 40/40. **Live (5 fresh Wikipedia compiles):** both `getByPlaceholder` variants PASS (3 `visible-only-resolution` lines); 4/5 PASS overall, and the 5th failed as VAL-041 |
| VAL-041 | 4 | After VAL-040: `getByRole('searchbox',…).fill` then `.press('Enter')` on Wikipedia FAILED with `press failed: the element was detached from the page within 30000ms` (1/5 live runs). Wikipedia re-renders the input while typing. Root cause (confirmed live + fixture): ~50ms after the first keystroke Wikipedia swaps `<input type=search>` (searchbox) for a Codex `<input role=combobox>` with the same name; the press locator stayed tied to searchbox. VAL-040's extra count() calls widened the race | defect (HIGH) | @dev | **fixed:** a gated `.or()` alternate keeps one re-resolving locator; clearer detach message. Unit 1191, real-Chromium 14/14 (the deterministic swap test fails without the fix). **Live: 8/8 fresh Wikipedia compiles PASS** (5× searchbox, 3× placeholder) |
| VAL-042 | 4 | **First Run Test click on a freshly loaded Studio page is swallowed:** no UI change and no request (backend sees only the initial GET); the second click runs. Reproduced twice live (single Run button on the page, so not an automation artifact). Probably introduced by VAL-036/039 (inferred) | not a defect | @dev | **Closed, automation artifact:** capture-phase `pointerdown`/`click` listeners on `document` recorded **no events** for the swallowed press, so the browser extension's first click after navigation never reached the page. Real Playwright clicks (headed and headless, 3 viewports) always ran on the first press. Regression tests added (`pageRunGate.test.tsx`, READY and STALE first press → exactly one execute); FE 370/370 |

## Phase results (server side, Orion)

- Phase 6: secrets API `503 VAULT_NOT_CONFIGURED`, legacy `/secrets` `404`, canary never logged. **Pass.**
- Phase 7 input validation: unknown/missing CSI → 400; malformed JSON → 400; >1024 chars / >100 steps → 400 at compile. Defects: VAL-021/022/023/024.
- Phase 4/7 cancel: running execution → `202`; terminal `ERROR`/`CANCELLED` in 3.6s; step 2 `SKIPPED` "stopped before this step finished"; video `AVAILABLE`; second cancel `409`. **Pass** (matches contract).
- Positive E2E on a real site: Wikipedia search (3 steps) compiled in 2.7s (LOW) and **PASSED** in 1274ms.
- Inline-credential guard: a `user:pw@` URL in a step → `400 INLINE_CREDENTIAL` with an actionable message. **Pass.**
- **Chrome walkthrough (Orion, 2026-10-04 late):** saved test → Run → PASSED with per-step timings and "Show in recording"; PROOF player loads; CODE tab clear; refusal flow shows "Preparing your test… 0:01" then "Step 4 can't be done in a browser test: … Go to step 4". Console: only React Router future-flag warnings. Found VAL-035..038.
- Phase 7 kill switch: `STUDIO_EXECUTION_ENABLED=false` → execute `503 DISPATCH_DISABLED` "Studio execution is currently disabled"; compile unaffected. **Pass.**

## QA gate

**Gate: CONCERNS.** @qa (Quinn), 2026-10-04, Phase 8. Full gate: `docs/qa/gates/ui-studio-validation-20261004.yml`.

All fresh results below are from this gate.

**Verified:**
- FE `tsc --noEmit`: clean.
- FE **full** `vitest run`: **716/717**, twice. The failure is `StudioTestsPage.test.tsx` "requires a registered system…", which times out at 5s under suite load. The file passes 3/3 alone and is not in today's diff (QA-1).
- FE eslint on 20 changed files: 0 errors, 24 `no-explicit-any` warnings.
- Runner type-check and lint: clean. Unit tier: 1153 passed, 29 skipped.
- Backend, 16 targeted classes: **150/150**, fresh XML.
- Backend `spotlessCheck checkstyleMain checkstyleTest`: green.
- openapi sha256 `5571bee0…f629`: equals `BASE_SHA256`.

**Live (3 Vertex calls):**
- VAL-006: `READY`, 1 attempt, artifact-shaped.
- VAL-030: `NEEDS_REVISION UNSUPPORTED_CAPABILITY`, 1 attempt.
- VAL-012: log `stepIndex` is 0/1 on step lines and null on run lines.
- VAL-021, VAL-022, VAL-023: 400 with the specific code.
- VAL-029: no query or fragment in any message or log.
- Audit lines: `promptVersion=2.3.0 thinkingLevel=LOW rejectReason=null`.

**Not run:**
- Every Docker IT (Docker down). Not run is not passed (QA-3).
- Runner deployment tier.
- Live VAL-019b, VAL-020 and VAL-028. These are unit-only for this gate.
- The R2D2 path.
- CodeRabbit (needs WSL).

**Top issues:**

| Finding | Severity | Owner | Issue |
|---|---|---|---|
| QA-2 | HIGH | @dev + @devops | The `anyOf` provider schema is unverified on R2D2 and has no fallback switch. Probe it before any R2D2 rollout. |
| QA-1 | MEDIUM | @dev | The FE full suite is not green. |
| QA-3 | MEDIUM | @qa/@devops | Run `./gradlew check` with Docker before the push. |
| QA-4 | MEDIUM | @devops | The backend must deploy before the runner (VAL-012). |
| ED-02 | — | — | Still open. No credentialed pilot until it closes. |
| QA-5 | LOW | — | openapi does not list `INVALID_STEPS` or the timeout `INVALID_CONFIGURATION` (folds into VAL-027). |
| QA-6 | LOW | — | The model's refusal `message` is stored without masking. |

**Recompile impact:** PROMPT 2.3.0, providerSchemaVersion 2 and thinking LOW each change the fingerprint. Ship them together so every test does one FULL recompile. SYNTAX_REFERENCE 2.1.0 is unchanged, so confirmed revisions stay runnable.

**Still open:** VAL-001, 005, 009, 010, 016, 024, 025, 027, 031.

**To reach PASS:** QA-1 green, plus a green Docker `check` (QA-3). QA-2 is a release gate for R2D2, not a merge gate.

## QA re-gate

**Gate: CONCERNS** (supersedes the first gate, which stays above as history). @qa (Quinn), 2026-10-05 04:15Z. Details are under `regate_2026-10-04b` in `docs/qa/gates/ui-studio-validation-20261004.yml`.

The FE tree was being edited during the gate (VAL-035..039). Every FE result below is pinned to one snapshot, `3e0feb05d755`, which did not change across the runs. Backend and runner sources did not change after the check started.

**Verified fresh (Docker 27.4.0 up):**
- Backend full `./gradlew check`: **BUILD SUCCESSFUL**, 1435 tests, 0 failures, 0 errors, 18 skipped. The skips are by design: `StudioCoRunIT` 11 is env-gated, and 7 are externally gated criteria. Spotless, checkstyle, spotbugsMain and jacoco verification all passed. Every IT the first gate listed ran green (`StudioContractTest` 14, `ProgressCallbackIT` 16, `CompilePipelineIT` 15, `StudioApiIT` 7, `StudioAuthoringApiIT` 5, `DispatcherIT` 26, `AcceptanceIT` 11, vault ITs). There were no environmental failures, and nothing was listening on port 3025.
- FE `tsc`: clean. FE **full** vitest: **770/770, twice**. FE eslint on 42 changed files: 0 errors, 28 warnings.
- Runner type-check and lint: clean. Unit tier: 1173 passed, 29 skipped. Fixtures tier: 144 passed, 10 skipped. Deployment tier: 313/313, **but** SEC-2 ran against the 2026-09-16 image, which predates executor 2.1.0. No image was built.
- openapi sha256 `43fe0bb4…7898` equals `BASE_SHA256`.
- **Live** (1 Vertex call):
  - VAL-024: 400 at save on POST and PUT, for both bounds.
  - VAL-027: 400 `INVALID_STEPS` "Step 2 is blank…", which is the message the toast now shows. The toast itself is unit-tested only.
  - Same-key concurrent execute: deduped to one execution.
  - Pre-compiled Wikipedia revision: **PASSED** on executor 2.1.0 in 996ms.

**Closed from the first gate:** QA-1, QA-3, QA-6 (VAL-033). QA-5 is closed on content.

**Contract class (VAL-027 openapi edit): Class C, not A.** ADR-002 §12 reserves "status-code semantics, and anything on the public surface" for the architect. This edit documents new 400 behaviour on public `/tests` and `/compile`. Class A covers only defects no one could have satisfied. The content is sound, but the ruling is missing (QA-R2).

**Why not PASS:**

| Finding | Severity | Owner | Issue |
|---|---|---|---|
| QA-R1 | HIGH | @dev → user → @qa | VAL-035..039 are still "in fix". Their tests are green, but I did not review them, and VAL-039 (two executions per click) needs a live re-test. |
| QA-R2 | MEDIUM | @architect | Rule the openapi amendment as Class C and correct the §13 row. |
| QA-R3 | MEDIUM | @architect / user | A fresh Wikipedia compile used an ambiguous `getByPlaceholder` and **FAILED** (2 matches). This is VAL-014's third occurrence, and the deferral should be re-decided. |
| QA-R4 | MEDIUM | VAL-034 author | `readAllPages` is unbounded. The Runs page reads all executions and all tests across CSIs, with no abort. This is not attributed to this validation and does not block its verdict. It blocks any push that includes those files until they are gated. |
| QA-R5 | LOW | @devops | Run the deployment tier on an image built from this tree before release. |

**Safe deploy order** (it reconciles VAL-012, which needs the backend first, with VAL-031, which needs the runner first):
1. Backend with `STUDIO_RUNTIME_EXECUTOR_VERSION=2.0.0`.
2. Runner with executor 2.1.0.
3. Drop the override, so the pin becomes 2.1.0.

Roll back in reverse. Step 3 is a second fingerprint change, so run all three steps in one window. Runbook §12(e) and QA-4 should be amended to this form.

**To reach PASS:** QA-R1 and QA-R2. QA-2 (R2D2), QA-R5 and ED-02 remain release gates.

### QA-R5 deployment tier — 2026-10-05 (@devops)

- **Image:** `put-checks-studio-runner:val-20261005-local`, built locally from the working tree (`docker build -t … studio-runner/`, Dockerfile unmodified, base `mcr.microsoft.com/playwright:v1.63.0-noble`). Image ID `sha256:0f7634316f16ec0c53c398da04530329e5a4b425629dde28f751d9ec2be137d2`. There is no registry digest because the image is local only and was not pushed.
- **Executor:** `2.1.0`. Read inside the image from `dist/versions.js` `EXECUTOR_VERSION` and from `dist/runtime-versions.json` `executor`. `runtime-versions.json` also records `image: null`, which is expected for a local build without `IMAGE_TAG`.
- **Run:** `STUDIO_RUNNER_IMAGE=put-checks-studio-runner:val-20261005-local npx vitest run --config vitest.deployment.config.ts`, run with helm v4.2.0 and Docker 27.4.0.
- **Result:** 8 of 8 files passed, 313 of 313 tests passed, 0 skipped and 0 failed, in 51.5 s. SEC-2 (4 tests) ran against the new image in both directions.
- **Status:** QA-R5 is closed for this tree. This was a local build, so CI stage 7/9 with `IMAGE_TAG` set is still required at release.

## Close-out actions after the re-gate (Orion, 2026-10-05)

- QA-R2: **ruled Class C** by @architect. ADR-002 §13 row corrected and §34 added (before/after table for API clients; release-note line owned by @devops). Runbook §12(e) now has the reconciled 3-step deploy order and a release checklist.
- QA-R5: image `put-checks-studio-runner:val-20261005-local` (executor 2.1.0) built from this tree; deployment tier 313/313.
- Pins: `check:pins OK`. Node 22 is a floor (`>=22.11.0 <25.0.0`), so v24 in the image is in range (not drift). `chromiumBuild`/`image` are not asserted for a local build (ED-05, expected).
- QA-R3 (VAL-014): superseded by the runner-side fixes VAL-031/VAL-040. A prompt bump is not needed for the observed failures; to be re-checked after VAL-041.
- (Superseded by VAL-042, now reproduced) Observation: during the VAL-038 check, one Run click (dispatched by element ref right after navigation) produced no request at all (backend saw only a GET). A coordinate click 20s later worked normally. Probably a browser-automation artifact, but the new VAL-039 run guard can't be fully ruled out; re-check during the final pass.


## QA final gate

**Gate: PASS** (supersedes both earlier gates, which stay above as history). @qa (Quinn), 2026-10-05 04:55Z. Details are under `final_2026-10-05` in `docs/qa/gates/ui-studio-validation-20261004.yml`. The source snapshot hash was `681dbbf46ea3` at the start and the end of the gate.

**Verified fresh:**
- **Backend** `./gradlew check --rerun-tasks`: **BUILD SUCCESSFUL**. 1437 tests, 0 failures, 0 errors, 18 skipped (by design). All XML files are fresh, and every Docker IT ran. A plain `check` was all UP-TO-DATE, so it was forced to re-run.
- **Frontend**: `tsc` clean. Full vitest **772/772, twice**. eslint on 42 changed files: 0 errors, 28 warnings.
- **Runner**: type-check and lint clean. Unit tier 1191 passed, 29 skipped. Fixtures tier 153 passed, 10 skipped (includes VAL-040 6/6 and VAL-041 3/3 in real Chromium). `check:pins` OK.
- **Contract anchor**: openapi sha256 `43fe0bb4…7898` equals `BASE_SHA256`.
- **Runner images**:
  - `val-20261005-local` is **stale**. It was built at 04:10:58Z; `playwrightAdapter.ts` changed at 04:21:55Z. It has VAL-040 but not VAL-041.
  - Orion's rebuild, `val-20261005b-local` (`sha256:22bebf35…`), is byte-identical to this tree's build: same md5 for the adapter, childRuntime and versions.
  - Deployment tier on the b tag: **313/313**, and SEC-2 ran. The stale tag also gives 313/313, so this tier can't detect a stale image (QA-F1).
- **Live** (2 Vertex calls):
  - Fresh Wikipedia compile: READY in about 6s. It compiled to the `searchbox` fill+press form, which is the VAL-041 path, and **PASSED** in 1196ms on executor 2.1.0 with the video AVAILABLE.
  - CPU-check refusal: `NEEDS_REVISION UNSUPPORTED_CAPABILITY` in 1 attempt.
  - PUT with a blank step: `400 INVALID_STEPS` "Step 2 is blank…". PUT with `timeoutSeconds` 0: `400 INVALID_CONFIGURATION`.

**VAL-040/041 code review:**
- **Strictness:** with ≥2 visible matches, the action fails with the fixed strict-mode message (N is the visible count) and never acts on the first match.
- **Assertions:** unfiltered and unchanged.
- **Visibility filter:** it only drops elements an action could not act on anyway.
- **`.or()` gate:** it matches only after the authored role has **no** visible match on the page. It then accepts only the same-name text-entry roles that VAL-031 already ruled, with visibility applied. While the authored element is present, behaviour is unchanged.

**Closed:**
- QA-R1: VAL-035..039 reviewed, FE green, re-tested live by Orion.
- QA-R2: ruled Class C (ADR-002 §34).
- QA-R3: superseded by VAL-040/041.
- QA-R5: closed on the b tag.

**LOW observations** (none blocks the gate):
- **QA-F1:** the deployment tier doesn't detect a stale image.
- **QA-F2:** `press` is always resolved visible-only. A key press on a hidden but focusable element now fails.
- **QA-F3:** no real-Chromium test covers a swap that leaves two visible alternates.
- **QA-F4:** a role swap through the gate is not written to the operator log.

**Release conditions:**
1. **Image:** release only from a CI build with `IMAGE_TAG` set, from this source. Never use `val-20261005-local`.
2. **Deploy order:** runbook §12(e), in one window:
   1. Backend with `STUDIO_RUNTIME_EXECUTOR_VERSION=2.0.0`.
   2. Runner with executor 2.1.0.
   3. Drop the override.

   Roll back in reverse.
3. **R2D2 (QA-2):** probe that the proxy accepts the `anyOf` schema before any R2D2 rollout.
4. **ED-02:** no credentialed pilot until it closes.
5. **VAL-034:** the third-party, unbounded `listAll*` paging work must be excluded from the push, or gated by its own story. It is not a blocker for this validation.
