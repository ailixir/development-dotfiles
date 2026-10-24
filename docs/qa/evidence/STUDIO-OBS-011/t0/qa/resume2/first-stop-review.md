# Independent Quinn review — resume 2

No QA verdict or lifecycle transition. Source/dist freeze preserved. No builds, tests, Docker operations, signals, provider calls or source edits.

The retained evidence still cannot prove the **first stop origin** for session hash `e51dd69ff76b812b`. It does prove that the intended released-secret injection was not reached: startup failed in browser PROCESS launch with `CANCELLED` beneath `CONTEXT_LOST`; the failed session has zero physical provider reads and only SOURCE_PLAN. A green test obtained by weakening UNKNOWN_OUTCOME or cleanup confirmation would not address this failure.

## Independent current result verification

All 331 default-task XML files were parsed: **2711 total / 2687 passed / 15 failed / 9 skipped**. Exact task/class/name skip identities equal the approved policy as multisets. Per-file hashes, timestamps, failure identities and skip identities are in `xml-snapshot.json`.

The extant incremental XML reports 62/62 but has mtime **2026-10-18 23:15:12Z**, before original B1 start **23:53:58Z**. It is stale and does not prove the current incremental task passed. The cross-replica XML reports 2/2 with mtime **23:54:47Z**, after B1 start; it may belong to an earlier task of this run. Its provenance must be settled by the final collector task graph/archive. My early blanket description of both files as stale was incorrect; this receipt and the JSON correct it.

Original collector/wrapper/daemon identities 88144/88167/88182 were independently live at the initial probe, with matching starts and daemon ancestry. At the latest evidence read, the final collector result did not exist and the current log remained in guidedIncrementalTest. Root owns ongoing liveness observation; no duplicated watcher or run was created.

## Why retained correlation is insufficient

The canonical hash is SHA-256 of `canonical(sessionId)` including JSON string quotes (`contracts.ts:8–16`); this binds the failed-state identity to the startup refusal and both journal filenames. The runtime journal contains a single 65-byte consumption digest, and the assignment journal contains a single 65-byte consumption digest. Neither stores a stop event (`journal.ts:54–72`). Their timestamps establish creation/consumption, not who stopped startup.

Claim diagnostics contain 22 records, including one 409 and several resets to ordinal 1. Grant validation contains 30 successful records. Lifecycle contains six records; the last closed reason is LEASE_LOST. None of these schemas contains session hash, case epoch or event time. `recordLifecycle` checks the then-selected session internally, but discards that binding on append; selection changes across cases. Grant recording is enabled by private-values file existence, without per-record session binding. The last LEASE_LOST and last successful initial grant are therefore leads, not attributable first-stop proof.

The worker-generation ledger contains 2077 process-identity records with no session binding. Runner draining/drained timestamps are later teardown facts and cannot identify the earlier startup stop. Runtime observer binding in `p4GuidedRevocationObservers` is installed in the successful `start().then(...)` branch; a pre-success stop does not acquire that mode-bound observer. This is a concrete observability gap for this failure, not proof that the observer caused it.

## Bounded next diagnostic for architect routing

`first-stop-review.json` specifies exact sites and closed fields. Root/architect should approve a diagnostic spanning the earliest runtime stop and its caller, not infer a test-only cause from the lifecycle tail. 11-IT-R owns test-wrapper/fixture additions; any runner/main site must be explicitly routed by the architect. The diagnostic is proposed only; it has not been applied or run.

Capture the **first** stop per canonical session hash, closed caller-site enum, closed reason, runtime/start/launch phase, monotonic elapsed time and whether startup was already aborted. Add session hash/case epoch/monotonic time to the existing claim, grant and lifecycle records. Capture claim begin/end/abort with closed result, original claim budget and remaining lease/assignment deltas. The key runner sites are runtime schedule (`runtime.ts:132`), launch-loss callback (`213–215`), first abort in startup failure (`150–151`), stop entry before abort (`619–624`), ownership expiry (`ownership.ts:64`), claim (`87–104`), renewal failure (`130–138`) and stopEntry (`161–169`). Browser PROCESS entry/failure wrapping (`browser.ts:556,680–682`) completes the timeline.

Use fixed enums and numeric/boolean fields, at most 32 records/16KiB per selected session, private no-follow 0600 evidence, no raw stacks/messages/request bodies/identities/values. Preserve original operation parameters/results, authority, deadlines, retry policy and cleanup assertions. After freeze release and architecture routing, at most **one complete ReplayIT class run** under the shared Gradle lock and a fresh label is the initial experiment. No timer increase, old native-action retry, guard clearing or expected-outcome change is justified by this review.

The B1 first-stop cause, full-task outcome and coverage obligations remain open. W1 requires root's actual B1 outcome ruling.
