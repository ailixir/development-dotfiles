# STUDIO-OBS-015 final `check` attempt03: `:test` lane failure diagnosis (Dex-D9)

Read-only on backend/, frontend/, studio-runner/, tools/, docs/specs/, .github/. No Gradle, no signals, Docker read-only. Evidence copied to `raw/`. [V] = I read/ran it and saw the result. [I] = inference. Times are EDT (-04:00); UTC = EDT + 4h.

## Verdict
| # | Failure | Class | Action |
|---|---|---|---|
| 1 | `GuidedPublicationAuthorityIT ... header-count` Flyway `08001` / EOF | Infra flake (mechanism not provable; no code defect found) | rerun |
| 2a | `ReplayIT.actualLearningPublishes...` :17729 `expected FINALIZING but was FAILED` | Transient runner-start failure; root cause NOT established. Not caused by w8. No product defect proven | rerun; contingency below |
| 2b | `queuedAndPreReadyRefusals` :17956, `editedSource...` :18365 | Cascade of 2a (by design: `@Order(2/3)` null-guards `publishedTestId` / `currentPublishedReceipt`) | none |

No `fix.patch`: nothing in the failing code paths is shown to be wrong, and any source edit changes the `f071984a...` digest and forces a new attempt anyway. See section 4 for the one caveat on 2a.

## 1. AuthorityIT header-count (Postgres connection dropped during migration)
Verified:
- Per-case lifecycle: each parameterized case builds `new GuidedPublicationMigrationTest.Database()` (MigrationTest:53, :89-93), which creates its OWN `PostgreSQLContainer("postgres:15-alpine")`, `pg.start()`, then `Flyway.migrate()` over a `DriverManagerDataSource`. No database is dropped, no PG restart; 27 cases = 27 containers. [V code]
- XML timeline (`raw/authority-xml-1458-1466.txt`): container `e19ee2e9...` on port 59289 created 20:23:44.645, "Container is started" 20:23:45.425 (0.78 s, normal). Every other container is followed by a Flyway `Database: jdbc:...` line; this one is not. The next container is created at 20:23:45.533 (107 ms later). Failure: `FlywaySqlException: Unable to obtain connection ... SQL State 08001 ... connection attempt failed` at `Flyway.migrate` <- `Database.<init>:93` <- AuthorityIT:938; test time 0.888 s. So the very first client connection after TC's own readiness check was dropped (EOF). [V]
- All other 26 cases in the class passed, including the other 8 `storedPrivateHistory...` mutations before and after it. [V]
- Same class in attempt01, attempt02 and w8-flake-full01 had 0 such failures (attempt01/02 on earlier source digests; only w8-flake-full01 shares attempt03's digest); `Container is started` counts: attempt01 199, attempt02 199, attempt03 188; Flyway connection failures 0/0/1. About 1 in 590 container starts [V counts, rate is arithmetic].
- Docker: daemon was NOT restarted: `supabase_*` containers show "Up 24 hours" at 21:38, Docker VM 8.2 GB / 11 CPU (`raw/host-state...`, `raw/docker-ps-a.txt`). The pre-run snapshot (`final-gates03/...docker-before.txt`) shows only those plus old exited PG containers. [V]
- Not recoverable: `docker events --since 00:00Z --until 01:30Z` returned 0 events (daemon buffer not retained, `raw/docker-events-0023.txt` empty), and the failed container is gone (a ctor that throws never reaches `close()`, so it leaked until Ryuk reaped it at JVM exit; `docker ps -a` shows no such container, only the new Ryuk `d8dff421` for the later lane). No PG log, no OOM-kill flag, no Ryuk log. I therefore cannot prove OOM vs Docker Desktop port-proxy accept-then-close vs PG crash. [V absent]
- Not the explanations you listed: `max_connections` (one container per case, one connection), Ryuk reaping (Ryuk only acts at JVM exit or on dropped Ryuk socket; the JVM was alive for 38 more minutes), DB create/drop (none). [V code/timeline]
- The 111 `Unexpected error occurred in scheduled task` / 9 `EOFException` lines in the log are cached Spring contexts' schedulers hitting PG containers of finished classes (attempt01: 70, attempt02: 30, same signature); different connections, not this failure. [V counts; I on cause]

Classification: infra flake. Proof (circumstantial) = clean on 3 prior runs of the same class, single occurrence, failure on the first connection to a just-started container, daemon not restarted, no code path that explains it. Mechanism unproven (stated plainly). Hygiene note, not a cause: `Database()` leaks its container if `Flyway.migrate()` throws; no change recommended in this scope.

## 2. ReplayIT `actualLearningPublishesWithoutEffects...` :17729
Assertion message (XML, `raw/`): `{"state":"FAILED","errorCode":"","providerFailures":0,"submits":0,"navigations":0,"lastObservedNames":[],"counters":{"actions":0,"observations":0,"modelProposals":1,...},"modelKinds":["SOURCE_PLAN"]} logs=.../obs007-joined-15777908557601289614 expected: "FINALIZING" but was: "FAILED"`. Test time 4.649 s (passing runs: 22.8 / 23.1 / 24.6 s). [V]

What happened (session `7a055510-1241-413e-8a8f-adade00ef8cc`), verified from the retained TEMP (`raw/runtime-temp/`):
- 20:25:59 guided worker (pid 45419, port 65131) and ordinary runner (pid 45420) ready; 20:26:00.76 first request; SOURCE_PLAN model call applied (1 proposal).
- The backend then pushed the context. Runner journal `da15ab5a...journal` (65 B, the `contextId+sessionId` consume record) was created at 20:26:01 with its `.owner` marker, so `GuidedJournal.open` and `consume` succeeded. [V]
- 20:26:03.450 backend logged (new B2B-01 P2 log line): `Guided runner refused the context for session 7a055510... (contextHash 389f8588...): CONTEXT_LOST` (XML line 411). The runner was alive and answered a schema-valid closed 409 `CONTEXT_LOST`; `GuidedRunnerClient.contextRefusal:343` mapped it to `UNKNOWN_OUTCOME`/`CONTEXT_CLOSED_REFUSAL` (non-definite, so no retry) and the session went FAILED at `bootstrapPhase CONTEXT_PENDING`, 0 actions, 0 observations (`finalize-exception-1.json`, `failed-test-state-test-1-...enriched.json`). [V]
- macOS unified log: "Google Chrome for Testing" pid 45441 launched 20:26:01.58 and was still alive at 20:26:02.0+; no crash report in DiagnosticReports for that time. pid 45441 is, by order and timing, the guided browser (inferred). [V log; I identity]
- Failed-test teardown: the session was torn down, `teardownStatus: CONFIRMED`, `allActualTeardownsConfirmed: true`; no latch (the attempt02 `:3730` cascade did not occur). [V]

Why I cannot name the cause: in `GuidedOwnership.context` (ownership.ts:139) ANY exception from `GuidedRuntime.start()` is caught and rethrown as `CONTEXT_LOST`, and `start()` itself maps launch failure, recorder race, page crash/extra page, non-blank page, and callback failure to the same code, with no log. The generation-1 `guided.log` holds two `Error: CONTEXT_LOST` lines, but the diagnostic JSONL timestamps (20:28:47, 20:40:28) show they belong to later dispatch tests, not this session. Nothing on disk or in the log records the inner error. [V]

Window of failure (inferred from verified timestamps): after journal consume (20:26:01) and Chromium start (20:26:01.58), before the 20:26:03.450 refusal: persistent-context/video/CDP blank-document setup, `withhold`, or the `bootstrap-evidence` callback. Playwright's launch timeout (30 s) is not reached in 2.4 s, so it was an error or a loss event, not a timeout. [I]

Relation to w8 (verified, not inferred): NOT related.
- Test 1 fails before the first `writeInitialContextState` call (first body use is :18006) and before any ordinary run; the first ordinary execution in the run (`8f8ee238`) starts 20:26:08, after the failure. The w8 `checkInitial` hook is injected only in the ORDINARY runner's `recorded-child.mjs`/`ordinary.mjs`, never on the guided worker (`p3-guided-launch-counter.mjs`). [V code]
- `ordinary-ipc-child.jsonl` for the whole class has 28 lines, all `"v":1`, zero `"v":2` (`raw/runtime-temp/ordinary-ipc-child.jsonl`): the new initial-context diagnostic never fired, so no initial-context read/parse error occurred in the class. [V]
- Source digest at attempt03 start is `f071984a...`, identical to w8-flake-full01 (73/73 pass) before and after; runner src/dist unchanged by w8 (per w8 review; digests match). The identical tree passed this same test in w8-flake-full01 (22.8 s); attempt01/02 (earlier digests) passed it in 24.6 / 23.1 s. [V]
- Not related to (1): different DB (embedded fixture DB on 65135, Flyway to v21 succeeded 20:25:54), different subsystem, 2m18s apart.

Environment evidence (all [V] as measured, causal link [I]): at 21:42 host swap is 10.1 of 11.3 GB used with ~77 MB free pages; spotlight `mdworker` was SIGKILLed by `mds` at 20:26:01.05 after 93.5 s of indexing in the same second the guided Chromium was starting. Two unrelated transient failures (Docker port, Chromium start) within 2m18 s on a loaded laptop point to host stress, but I cannot show the load at 20:26:01; this is circumstantial.

Classification: transient runner-start failure of the first guided session; not a test bug (assertions are correct and the same ones passed 3 times), no product defect shown. Root cause unproven.

## 3. 2b cascade
`queuedAndPreReadyRefusals` (Order 2, message "Requires the genuinely published revision from the preceding integration flow") and `editedSource...` (Order 3) assert `publishedTestId`/`currentPublishedReceipt` non-null; both are set only by test 1's publish. 0.017 s and 0.012 s. By design. [V code + XML]

## 4. Recommendation
1. Rerun the full `check --rerun-tasks` unchanged (attempt04, new collector label, source digest must equal `f071984a...`). Justification: both failures are single-occurrence, absent in 3 prior runs (w8-flake-full01, 73/73, is on the identical tree), and (1) is an environment event, (2a) a transient with a retained, consistent trail pointing away from w8.
2. Stop-loss: if `CONTEXT_LOST` at context push recurs (any test, any lane), do not rerun a third time. It then needs a value-free cause, which only a runner change can provide (start() catch sites at runtime.ts:153-159/165/ownership.ts:139 log error class + step, never message), which re-opens the runner/image gates. That would be a user-visible scope decision, not a silent patch.
3. Optional hardening for (1) is a test-side connect retry plus container stop in `Database(List)`; I did not write it: it changes the digest and 1/590 is within existing tolerance. Say so if you want it.
4. If the host is the common factor, reduce load before the rerun (no concurrent Chromium/agents/Spotlight on the worktree); that is a procedure choice, not evidence.

Limits: I could not read Postgres/Docker logs for (1) or any runner-side log for (2); I did not run anything that would reproduce either.
