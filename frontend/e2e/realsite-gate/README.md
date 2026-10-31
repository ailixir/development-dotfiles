# Real-site release gate (ADR-SC-007 WI-5, adapted to ADR-SC-008 generated step code)

The gate drives the Studio UI on the real stack through 14 positive real-site tests, three safety controls
(N1, N2, N3), then scans every sink for the declared general privacy canaries. It is the check that decides
whether the generated-step-code release is accepted. It is **necessary before the STUDIO-OBS-016 D-C benchmark
and is not a D-C pass**.

> **`CHECKS_E2E_REAL_BACKEND=1 pnpm run test:e2e` goes green by skipping the gate. It is not evidence.**
> Without `CHECKS_GATE_MODE` every gate test is skipped and the command exits 0. Evidence exists only when
> `gate-cli report` exits 0. A set but misspelled `CHECKS_GATE_MODE` fails the environment test.

## Files

| File | Role |
|---|---|
| `../studio-realsite-gate-real-backend.spec.ts` | run mode: environment test, 14 positives, N1-N3, in-run scan (19 tests) |
| `gate-table.json` | the single test table (steps verbatim from ADR-SC-007 and the alpha `suite.mjs`) |
| `smoke-flows.json` | the five G0 smoke flows (data) |
| `../studio-realsite-smoke-real-backend.spec.ts` | the G0 smoke runner: learns, confirms and replays each flow of `smoke-flows.json` once; `dry-` run ids only |
| `driver.ts`, `status.ts`, `specsupport.ts` | UI flow, strict API/ledger/receipt/head-pointer readers, spec glue |
| `classify.ts`, `evaluate.ts`, `report.ts`, `bundle.ts` | pure verdict logic, report, run loader |
| `leakscan.ts`, `scanrun.ts`, `page-text-sources.json`, `fixtures/` | leak scanner, orchestration, closed page-text table |
| `recorder.ts`, `environment.ts` | gateway recording forwarder, environment record |
| `gate-cli.ts` | operator CLI |
| `stack/` | launcher and kit: `gate-stack.sh`, `ports.mjs` (the one port set), `dist-check.mjs` (read-only dist verification), token issuer, Core stand-in, config generator |
| `*.test.ts` | `node:test` tests, run with `pnpm exec node --test` |

## Learned, confirmed and the controls (ADR-SC-008)

**Lifecycle.** Learning records a revision: `ui_tests.candidate_revision_id` is set (the head is
`COALESCE(candidate_revision_id, confirmed_revision_id)`) and `publishedLineage` reads the head. The model-free
AFTER_LEARN proof confirms it. A positive flow is **learned** only when, after that proof PASSED, `confirmed_revision_id`
equals the published revision and every `studio_step_receipts` row of it is PASSED, carries the flow's proof execution id
and a closed-code-null receipt whose hash matches the row, and the row count equals the step count. The UI receipt text
(`LEARNED_RECEIPT`) and chip (`LEARNED_CHIP`) are corroboration only and never decide. A pointer that was confirmed early
is not a finding; the pointers read right after learning (`headAtLearn`) are kept in the result for the report.

**Controls on receipts.** Every learn attempt (repairs and retries included) joins its ledger rows to
`studio_guided_actions.receipt` (`{closedCode, stepHash, fenceCrossed, effects[{method, completed}], effectsTruncated, offscreen}`,
bare Playwright method names) through `learningReceipts`. An unreadable receipt source, a dispatched row without a receipt, a
receipt without a ledger row, or `fenceCrossed` with no effect listed is "not met", never a pass.

- Steps are told apart by their index in the session's authored order (`stepIds`, from `document.sourceSteps`): SC008 writes ordinal 0 and attempt_ordinal 0 for every ledger row, so receipts join ledger rows on step id plus ordinals. Step index 0: the only allowed effect is `goto`, for all three controls.
- **N1** (select "3.99"), step index 1: the only tolerated effect is a `selectOption` attempted and not completed. Met: closed code
  TARGET_DRIFT, OUTCOME_UNKNOWN, ASSERTION_FAILED or TIMEOUT, or a clarification or pre-dispatch refusal; the session must stop at step index 1.
- **N2** (wrong rsync literal): any effect fails. Met: ASSERTION_FAILED, or a clarification or pre-dispatch refusal.
- **N3** (absent Install button): any effect or crossed fence fails. Met: a clarification or a refusal (a closed code, or a pre-dispatch refusal).
- A pre-dispatch refusal is a FAILED session whose error code is INVALID_CONTRACT, MISSING_SOURCE or UNSUPPORTED_SURFACE with no ledger row of step index 1 or above dispatched (`dispatchCount` 0). UI text is not read.
- A control that succeeded, learned, was proved, replayed or published, or whose candidate or confirmed pointer is set, is a false pass: a hard zero.

Wrong-region picks are not a gate rule; the G8 report lists them as a finding.

## Smoke flows

`smoke-flows.json` holds the five G0 flows of X-5 as data (`key`, `site`, `steps`). The navigation-wording flow is the one-step IANA probe and is INFERRED; its identification is a user decision asked before the smoke runner (E22b). The dry run also requires the scan's `db` source to hold dump files named for `ui_test_revisions`, `studio_step_receipts`, `studio_guided_actions` and `studio_step_examples`.

`page-text-sources.json` classifies the tables of V33-V35: `studio_step_receipts` and `studio_step_example_snapshots` must not carry page text; `studio_step_examples` may (it stores generated step code, a copy of the model's output like `studio_guided_model_attempts`). Widening that list was a recorded decision of E22a.

## Verdicts and exit codes

`gate-cli evaluate` and `gate-cli report` exit **0 PASS, 1 FAIL, 2 INVALID or INCOMPLETE**.
PASS needs all current same-day rules proven, including the create-once SAME_DAY_PASS seal. The user removed
next-day/24-hour replay and L1 login acceptance requirements. No durability or login-coverage claim is made. `report` refuses `dry-` run ids. Evaluation iterates the test table: a missing result,
a VOID test, a control that misses its expectation, a leak, a scan with zero canaries or a
missing configured source all stop a PASS.

Run ids: `rg-YYYYMMDD-N` (evidence) and `dry-YYYYMMDD-N` (dry run; excluded from the report).

Each authored step must finish learning within **120,000 ms**, including queue/startup, acquisition,
model calls, retries/backoff and validation. The driver uses one monotonic epoch before its first
Run Test and keeps it across retries and clarifications. Append-only `diagnostics/learning-timing/*.jsonl` receipts bracket
progress queries with request-start and response-end offsets. A prior active query's request-start
is a conservative activation lower bound; the first query showing advancement supplies a completion
upper bound. Contiguous steps skipped between polls share that entire interval. These are conservative
upper bounds, not exact backend event times. A complete learning interval within120,000 ms also bounds
each independently proven completed step. Longer flows need complete per-step covered intervals.
Missing/malformed/crossed timing or any upper bound over120,000 ms blocks PASS. A watchdog records an
irrevocable terminal timing failure before requesting the existing guided-session cancellation; a
late success cannot replace it and a timeout cannot trigger an infrastructure retry. Cancellation
settlement is recorded separately and does not erase failure. All stricter existing operation, model,
acquisition and session limits remain. This is a gate readiness metric, not a new backend timeout claim.
The existing diagnostics sink scans and snapshots these journals as well as the timing embedded in results.
Host-load thresholds no longer admit or block execution; retain one heavy-command lock and isolation,
and measure actual elapsed time without load-based exceptions. Historical evidence has no invented timing.

## Environment variables

| Variable | Meaning |
|---|---|
| `CHECKS_E2E_REAL_BACKEND=1` | selects the Playwright `real-backend` project (existing) |
| `CHECKS_GATE_MODE` | `run`; unset skips, anything else fails |
| `CHECKS_GATE_RUN_ID` | required, `rg-...` or `dry-...`; `CHECKS_GATE_DRY_RUN=1` must agree with the prefix |
| `CHECKS_GATE_OUT` | evidence output root, **outside the worktree and outside any `node_modules`** (required for `rg-` runs) |
| `CHECKS_GATE_SECRETS_DIR` | 0700 directory outside the worktree and outside `CHECKS_GATE_OUT` for the canary file (`gate-cli init`) |
| `CHECKS_GATE_CANARY_FILE` | the per-run random SECRET canary written by `gate-cli init` |
| `CHECKS_GATE_EXTRA_CANARIES`, `CHECKS_GATE_CANARY_FILES` | further canaries (comma lists), e.g. the Vault token file |
| `CHECKS_GATE_STACK_MANIFEST` | the launcher's manifest (below) |
| `CHECKS_GATE_PGPORT`, `CHECKS_GATE_PSQL` | embedded Postgres port; psql path (default `/opt/homebrew/bin/psql`) |
| `CHECKS_GATE_PROXY_URL` | recorder base URL, e.g. `http://127.0.0.1:18188`; unset means not interposed |
| `CHECKS_GATE_MAX_CALLS` | optional recorder call cap (positive integer, read by `gate-cli proxy`). Calls over it get 429 and are not forwarded, recorded or counted. Per recorder run directory: after a restart set the remaining budget |
| `CHECKS_GATE_EXTERNAL_CORE_DECLARATION` | written by `gen-config.mjs` to `<stack dir>/core-declaration.json` (the app's `frontend/node_modules/@put/core-components`, `package.json` and `dist` only); `gate-stack.sh up` prints it with the other exports |
| `CHECKS_GATE_DRYRUN_SCAN` | `scan.json` of a clean complete authoritative dry run within 24h (ANY-class hits 0, nonempty declared canaries including GATE_CANARY); required for `rg-` runs |
| `CHECKS_GATE_BASE_URL`, `CHECKS_GATE_SESSION_COOKIE` | app origin override; `put_session` value (default `local-dev-session`) |
| `CHECKS_E2E_BACKEND_URL` | the backend the Vite proxy forwards to; bound to the manifest |
| `CHECKS_GATE_STACK_DIR` | launcher working directory (outside the repo) |
| `CHECKS_GATE_GRADLE_DIR` | Gradle build and project-cache directory for the jar (default `<stack dir>/gradle`; never another work item's, e.g. `spk07-gradle` is refused) |
| `CHECKS_GATE_PORT_BACKEND`, `_CORE`, `_RUNNER`, `_CONNECTOR`, `_VAULT`, `_APP`, `_RECORDER` | the one port set (defaults 18080, 18081, 18090, 18092, 18200, 18177, 18188). The live dev stack's ports 8080, 8081, 8090, 8092 and 5181 are refused |
| `CHECKS_E2E_APP_PORT` | must equal `CHECKS_GATE_PORT_APP`; the backend allows only that origin |
| `CHECKS_GATE_EXPECT_DIST_SHA` | optional: the runner dist sha256 recorded after the WI-4 build (`gate-stack.sh dist-sha`); `up` refuses a different dist |

## Stack procedure

Runs only after WI-1..WI-4 are integrated and their own checks are green. Use Node 24
(`PATH=/Users/brunobuger/.local/share/fnm/node-versions/v24.20.0/installation/bin:$PATH`). `gate-stack.sh` reuses
`tools/studio-local-tls.mjs` for the runner TLS steps exactly as `dev.sh` does.

1. **Freeze.** No other session edits `backend/`, `studio-runner/` or `docs/specs/` during a run; the start and end
   working-tree digests (deletions included) turn a mid-run change into INVALID.
2. **Side by side.** The gate never touches the live dev stack. Every port comes from one set
   (`stack/ports.mjs`, `CHECKS_GATE_PORT_*`, defaults above); the live ports are refused, and `gate-stack.sh up`,
   `gen-config.mjs` and the Core stand-in fail fast with a message if a chosen port is already listening. `down` signals a pid only
   if it is the current listener of a gate port. The old stack can keep running.
3. **Runner dist.** WI-4 builds `studio-runner/dist` once; the launcher never builds. Record its sha with `stack/gate-stack.sh dist-sha`
   (optionally export it as `CHECKS_GATE_EXPECT_DIST_SHA`). `up` verifies the dist read-only: no old resolver (`unresolvedRole`,
   `locatorHints`), no `src/**/*.ts` newer than or missing from its `dist` counterpart, no orphan `dist` module, the runner's own
   `check:pins`, and the optional sha. A dist built before WI-4 is refused.
4. **Init.** `export CHECKS_GATE_STACK_DIR=... CHECKS_GATE_SECRETS_DIR=...`, then `stack/gate-stack.sh init` and
   `node e2e/realsite-gate/gate-cli.ts init --run rg-YYYYMMDD-N` (prints the canary file path; export `CHECKS_GATE_CANARY_FILE`).
5. **Recorder.** `node e2e/realsite-gate/gate-cli.ts proxy --run rg-... --upstream https://aiplatform.googleapis.com` (port
   `CHECKS_GATE_PORT_RECORDER`) and `export STUDIO_GATEWAY_ENDPOINT=http://127.0.0.1:18188 CHECKS_GATE_PROXY_URL=http://127.0.0.1:18188`.
   For an `rg-` run, the recorder must hold at least one recorded model request before the environment test (the model id must be
   observed, not only declared); send one small request through it first, inside the run's call budget.
   With `STUDIO_GATEWAY_PROJECT`, `STUDIO_GATEWAY_LOCATION` (and optionally `STUDIO_GATEWAY_MODEL`) set, run `stack/gate-stack.sh up`. It verifies the
   dist (above), freezes a copy of `dist`, `package.json` and `node_modules`, builds the backend jar in its own Gradle directory
   (`CHECKS_GATE_GRADLE_DIR`), starts a dev-mode Vault (`hashicorp/vault:1.21.4`, in memory, loopback), the token issuer, the Core
   stand-in, the runner from the frozen copy and the backend with `java -jar` (no watcher), and writes `manifest.json`. The backend
   allows only the gate's own Vite origin (`http://127.0.0.1:$CHECKS_GATE_PORT_APP`) in `CHECKS_CORS_ALLOWED_ORIGINS`.
6. **Export** the variables `up` prints (`CHECKS_GATE_STACK_MANIFEST`, `CHECKS_GATE_PGPORT`, `CHECKS_E2E_BACKEND_URL`, `CHECKS_E2E_APP_PORT`).
7. **Dry run** under a `dry-` id: run the public-site dry rehearsal, then `gate-cli collect --run dry-...` and
   `gate-cli scan --run dry-...`. Require complete sink/form coverage, a nonempty declared set including the existing GATE_CANARY,
   and 0 occurrences; export `CHECKS_GATE_DRYRUN_SCAN` as that recent authoritative `scan.json`. No replacement secret setup is required.
   Any PAGE_ORIGIN occurrence also fails. Classification is diagnostic only.
   **G0 smoke** (X-5), before the counted run, each under its own `dry-` id (the spec refuses `rg-`):
   ```
   CHECKS_GATE_MODE=run CHECKS_GATE_RUN_ID=dry-... CHECKS_GATE_DRY_RUN=1 CHECKS_E2E_REAL_BACKEND=1 \
     PLAYWRIGHT_JSON_OUTPUT_NAME=<out>/dry-.../playwright-report.json \
     pnpm exec playwright test --project=real-backend e2e/studio-realsite-smoke-real-backend.spec.ts --reporter=list,json
   node e2e/realsite-gate/gate-cli.ts collect --run dry-...
   node e2e/realsite-gate/gate-cli.ts scan --run dry-...
   ```
   The smoke run ids are leak-scanned like the full dry run: require the same clean scan (nonempty canaries including GATE_CANARY, 0 occurrences). All five flows must pass; a smoke failure blocks the counted run.
8. **Gate.**
   ```
   node e2e/realsite-gate/gate-cli.ts verify --run rg-...      # same-day corpus ground truth, judged from the JSON
   CHECKS_GATE_MODE=run CHECKS_GATE_RUN_ID=rg-... CHECKS_E2E_REAL_BACKEND=1 \
     PLAYWRIGHT_JSON_OUTPUT_NAME=<out>/rg-.../playwright-report.json \
     pnpm exec playwright test --project=real-backend e2e/studio-realsite-gate-real-backend.spec.ts --reporter=list,json
   node e2e/realsite-gate/gate-cli.ts collect --run rg-...
   node e2e/realsite-gate/gate-cli.ts scan --run rg-...
   node e2e/realsite-gate/gate-cli.ts seal-same-day --run rg-... --controller-receipt-sha256 <actual-controller-receipt-hash>
   node e2e/realsite-gate/gate-cli.ts report --run rg-... --out docs/qa/evidence/adr-sc-007/wi-5/release-gate-<date>.md
   ```
9. **Fix and repeat.** A product fix means a new run id and a full repeat from step 4 (new jar, `dist`, database). Earlier results stay in the report.
10. **Finalize.** Keep immutable same-day evidence and report all earlier failures under their own run IDs.
    Remove the Vault container (`gate-stack.sh down --vault`) only after the report is final. The removed
    `--nextday` flag is rejected explicitly by the CLI.

## Stack manifest (`CHECKS_GATE_STACK_MANIFEST`, non-secret)

```
{
  "backend": { "pid", "jarPath", "jarSha256", "port" },
  "runner":  { "pid", "frozenDir", "distSha256", "logPath", "workDir", "journalDir", "port" },
  "gateway": { "provider", "model", "project", "location", "endpoint", "upstreamEndpoint", "credentialsMode",
               "allowAllDomains", "vaultProvider", "runnerGuidedCapacity", "applicationYmlSha256", "overlaySha256" },
  "logs":    { "backend", "core", "issuer" },
  "ports":   { "backend", "core", "runner", "connector", "vault", "app", "recorder" },
  "vault":   { "container" },
  "postgresPort", "startedAt"
}
```

The environment test binds the answering backend and runner to it (listener pid, jar path and sha256).

## Leak scan

The existing per-run GATE_CANARY is sufficient for a nonempty declared privacy set. Already-declared extra
canaries remain included; no login password or practice-page request is required. SECRET canaries are a LEAK
anywhere. Generic PAGE_PRINTED classification and bearer scanning remain supported by the scanner; classification
gives no exception to the literal hard-zero rule. Videos, images and archives are counted as opaque bytes, not
scanned as text. The scan fails on ANY occurrence including PAGE_ORIGIN, contradictory totals or hit rows,
absent/duplicate required coverage, empty canaries or missing form coverage. Complete post-collection scanning
is authoritative; every attempt remains in scan/history. The 24h dry-scan freshness limit remains a freshness
check, with no next-day execution or waiting requirement.

## What cannot be proven without the stack

The UI selectors and copy (rehearsed on the MSW harness only), the psql queries (`studio_guided_actions.receipt`, `ui_tests` head pointers, `studio_step_receipts`; no unit test runs psql), the live API shapes (the
status parsers throw on any missing field, which makes the run INVALID rather than passing), the recorder over plain
http to the GenAI SDK, and the launcher itself. The dry run exists to flush these before any `rg-` run.

## Revised strict evidence boundary

All port overrides are18000..18999. The registry has 17 entries: 14 ordinary positives and N1-N3. Each of 14 required lifecycles needs full learning with no clarification, PASSED AFTER_LEARN proof with AVAILABLE video, and exactly two distinct new PASSED model-free MANUAL executions. Controls are judged on effect receipts (below) of every attempt and cannot hide an earlier dispatch/publication behind a later refusal.

Results are schemaVersion1/run-bound. The bundle rejects unknown files, duplicate keys and crossed identities. Missing lineage, scans, full external-core/build/settings/process freeze or truncation metadata coverage blocks PASS.

Source checks use full filesystem manifests plus narrow HEAD metadata resolution; no Git command is invoked. `dirty` is UNKNOWN. Before the first counted action and at same-day start/initial checkpoints, record immutable source, external @put/core source/artifact, nonsecret settings, JAR/frozen-dist and process startup identities. `CHECKS_GATE_EXTERNAL_CORE_DECLARATION` points to an approved nonsecret JSON declaration with root/sourceScopes/artifactRoot/artifactScopes. Missing safe closure blocks execution. Checkpoints are create-once and a mismatch stays invalid. Do not change baseline or source to repair a run.

After complete same-day collection/scanning/audits, `gate-cli seal-same-day --run <rg-id> --controller-receipt-sha256 <actual-controller-receipt-hash>` creates the actual first whole-suite SAME_DAY_PASS event once. It cannot seal incomplete evidence. Preserve all underlying files. Then generate the final report immediately. Every fix/restart needs a new full run and seal; no waiting interval is required.

`studio-realsite-edit-relearn-real-backend.spec.ts` contains four separately opted-in supplementary diagnostics (`CHECKS_GATE_DIAGNOSTICS=1`, dry/rehearsal identity): joined real edit/relearn and exactly three preselected wording probes. They write diagnostics only and never replace registered cases. Unset mode/listing is NOT_RUN, never runtime evidence.

The recorder forwards original bytes and retains only bounded finish/usage metadata for response diagnostics. Numeric cap4096 plus provider MAX_TOKENS is verified truncation; missing/malformed/oversize/aborted metadata is UNKNOWN and blocks completeness. No response body is persisted. W-AC10 delayed-focus press residual and change-only fill limitations remain. Q9 compliance reconfirmation is a hard gate before any pilot; no compliance receipt is currently claimed.

## R3 evidence and diagnostic repairs

Raw evidence is append-only. `collections/initial-<attempt>/` retains each current Playwright collection; `scan-attempts/initial-<attempt>/` retains fresh DB dumps and immutable copies of every scanned sink. Manifests bind exact path/bytes/content hashes. Recollecting adds new directories; it never replaces sealed artifacts. The same-day event hashes actual initial raw content. Scans cover diagnostic JSON whenever present, in addition to all existing sinks. Missing same-day coverage or raw-content mismatch blocks success. Historical next-day/L1 artifacts remain unchanged and readable as raw JSON, with harmless historical field types retained. The current loader validates the current 17-entry registry and may refuse an old 18-entry registry as current gate input; there is no historical execution mode.

Current collection never fetches or persists the removed practice-login baseline. Generic privacy regressions remain required.

Actual Studio UI text is scanned BEFORE persistence protection. Clean text is saved unchanged; unsafe text has safe complete hit receipts and fails. Failed capture cannot become empty clean text. Missing, duplicate or cross-run UI receipts block coverage. Original scan bytes and missing counts are reported explicitly; hashes never stand in for required text scanning.

The actual HN module is `public-label-preflight.ts` (the former implementation moved, no facade). It captures and freezes actual first-visible title/author/item/comments association before authoring. Unique comments use ordinary exact label; duplicates require the actual surviving public-author association and normal native pipeline, otherwise fail. The final node assertion consumes the actual copied binding near the public author; it never restores a private title or composes a captured binding with branding. P16 unit tests production preflight immutability; actual production masking/native and joined replay evidence remain separately required.

The preflight is create-once at attempt and capture as well as amendment. Source/label drift after failure needs a fresh reviewed run. Repeated comments are not automatically forbidden or declared supported: actual retained public-author association must pass effect-safe/native unique+SAME checks.
