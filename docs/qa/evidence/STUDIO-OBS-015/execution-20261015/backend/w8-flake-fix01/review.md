# STUDIO-OBS-015 w8-flake-fix01 (Dex-W8, @dev)

2026-10-16. Sole writer in backend/ and studio-runner/. `--no-daemon`, fresh collector labels, no commits. [V] = ran it and read the result. [I] = inferred.

## 1. attempt02-diagnosis01 fix.patch
`git apply --check -p0` OK, then applied [V]. ReplayIT: new `writeInitialContextState` (stage + `ATOMIC_MOVE`) at the 10 test-body sites; the single startup write before the runner exists is untouched. ObservationPolicyIT: per-JVM random base plus `AtomicInteger` (no intra-class CSI collision). Test-only. sha256 before/after per file in `manifest.json`.

## 2. Diagnostic hardening: test-side, NOT a runner change
The hook that polls `initial-context-state.json` is not runner source. It is the `checkInitial` string in `GuidedPublicationReplayIT`, injected into the test's `recorded-child.mjs` (and `ordinary.mjs`). The runner's `replayError` maps any non-`ObservedRefusal` throw to INTERNAL_ERROR, and the launcher drains the observed child's pre-launch stderr (`launcher.ts:398`), so I did not touch runner code. [V read]

Change: `state()` now reads the file, records `Buffer.byteLength`, parses, and on any throw appends one value-free line to the existing child IPC diagnostic file (`ordinary-ipc-child.jsonl`), then rethrows the original error unchanged:
`{"v":2,"kind":"initial-context-state-read","pid":..,"name":<error class>,"code":<errno code or null>,"bytes":<n or null>,"message":<fixed text or null>}`.
`message` is only ever the literal `Unexpected end of JSON input`, otherwise null (Node puts file content in other SyntaxError messages and paths in ENOENT messages). `v:2` keeps `p10DiagnosticLines` (which keeps only `v:1`) from joining it into the evidence JSON. A future empty-read race shows as `name:SyntaxError, bytes:0`.
Checked with a node harness assembled from the exact Java string pieces [V]: ok -> handled, `fail:true` -> false, empty file -> SyntaxError/bytes 0/fixed message, garbage with quotes -> SyntaxError/message null, missing -> Error/ENOENT; behaviour (return values, rethrow) unchanged.

**Runner src and dist are unchanged.** `distDigest` 80d1ba1d... and `sourceDigest` f071984a... are identical before and after every run (`distStable: true`). Therefore the runner fixtures/deployment/image gates do NOT need to re-run in attempt03 because of this work (the runner tier was not re-run: nothing in it changed).

## 3. Verification [V]
| Check | Result |
|---|---|
| Compile (test + main) | implied by every Gradle run below; exit 0 |
| `ObservationPolicyIT` x3, fresh labels `w8-flake-obs01..03` | 11/11 each, exit 0 |
| `google-java-format` 1.22.0 CLI (JDK 21) | both files byte-identical to formatter output |
| `checkstyleTest checkstyleMain spotlessCheck` | exit 0 (`static.log`) |
| Full `test` lane ReplayIT + AuthorityIT (`w8-flake-full01`, 1180 s) | **73/73 passed**, exit 0, taskCollectionComplete, sourceStable, distStable. Includes both P7 tests |

## 4. Caveat: the P7 tests do not pass when run alone
`w8-flake-p7-01/02/03` (the two P7 tests alone, then with one or two canary-registering tests) all FAILED. Cause is the per-test teardown `scanCompleteAuditStream` (IT:34352 "the OBS-007 case registered its canaries", then "joined runs emitted admitted-action and replay-dispatch events"), which needs canaries and audit events produced by other tests in the class; the P7 tests are @Order 27/28 and the canary-registering `incremental*` tests run after them. In p7-03 I added the @Order(9) login test, which itself fails in isolation (needs the earlier tests) and then latches the cleanup-unconfirmed guard on the next two. In p7-01/02 the thrown exception is the teardown assertion with no body failure; I infer, not prove, that the bodies passed. This matches the earlier w7 note that targeted ReplayIT runs show a synthetic audit failure. The P7 evidence that counts is the full lane: both P7 tests passed there. The three p7 labels are kept as evidence of the isolation artifact, not as gate runs.

## 5. Not covered
- One green full run does not prove the empty-read race is gone (diagnosed ~0.5% per run, "probable, not proven"). If the pool-refusal blocker fails again, the `v:2` line in `ordinary-ipc-child.jsonl` of that run's TEMP will say whether it was a read/parse error.
- Not run: guidedIncrementalTest, crossReplicaTest, runner tier, full `check`.
