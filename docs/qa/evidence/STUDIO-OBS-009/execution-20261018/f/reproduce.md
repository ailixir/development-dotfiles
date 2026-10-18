# STUDIO-OBS-009 W3 lane F: how Quinn reproduces the result

Everything below is run from `/Users/brunobuger/orca/workspaces/put-checks/ui-studio`. Gradle goes through the shared lock, `--no-daemon`, with a label nobody used. A run counts only when its dist digest is D_F = `4add1307afe80af5270a63dc809d43bb2d4d4dd51ab32a83330d3cbaf35fc3c3`. Do not rebuild `dist`.

```
cd /Users/brunobuger/orca/workspaces/put-checks/ui-studio
export PATH=$HOME/.local/share/fnm/node-versions/v24.20.0/installation/bin:$PATH
export JAVA_HOME=/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home
```

## 0. Precondition: the dist is D_F

```
python3 .aiox/sdc/STUDIO-OBSERVED-ORCH/strict-qa-20261014/capture-manifest.py <scratch>/m.json >/dev/null
python3 -c "import json;print(json.load(open('<scratch>/m.json'))['dist']['digest'])"
# expect 4add1307afe80af5270a63dc809d43bb2d4d4dd51ab32a83330d3cbaf35fc3c3
```

## 1. The co-run, in the form the lane's verify line names (script form)

One lock hold covers the Gradle run and the judgement, so another lane cannot wipe `backend/build` between them.

```
python3 .aiox/sdc/STUDIO-OBSERVED-ORCH/execute-008/with-gradle-lock.py \
  env CORUN_GRADLE_ARGS=--no-daemon \
      CORUN_EXPECT_DIST=4add1307afe80af5270a63dc809d43bb2d4d4dd51ab32a83330d3cbaf35fc3c3 \
      CORUN_EVIDENCE_OUT=<your-evidence-dir>/fault-injection.json \
      bash tools/corun.sh --skip-build
```

Expect, about 4.5 minutes after the lock is yours (12 JUnit cases, 39 runs, 42 runner generations):

- `legs executed: 12 · failures: 0 · errors: 0 · skipped: 0`
- eleven legs print `PASS`, each `repeatedDispatches=0`: `base` 3 runs, `duplicate` 6, `ackLoss` 3, `publicCancel` 3, `runnerKill` 3, `restart` 6 (three old runs, three new), `lateCallback` 3, `afterFaults` 3, `secretCanary` 3, `guidedPublicCancel` 3, `guidedWorkerKill` 3
- `runs: 39 · repeated dispatches: 0 · runner generations: 42 · GUIDED_START_FAILED lines: 0`
- three `observation: runnerKill: ... lived ~30000 / ~10000 / ~10000 ms after the SIGKILL` lines (finding F-A, below)
- `the co-run is GREEN`, exit 0. Exit 3 would mean a REL-001 recurrence was recorded; exit 1, a red leg or a violated invariant; exit 2, a file missing.

`CORUN_REPEATS=1` shortens it to one run per leg (not timed); the credited denominators use the default of 3.

Run directly under the collector instead (same class, no script):

```
python3 .aiox/sdc/STUDIO-OBSERVED-ORCH/execute-008/with-gradle-lock.py \
  bash -c 'python3 .aiox/sdc/STUDIO-OBSERVED-ORCH/execute-009/run-backend-tasked.py <new-label> --test-tasks test -- test --tests "com.citi.put.checks.corun.ObservedCoRunIT" --no-daemon; \
           node tools/corun-report.mjs backend/build/test-results/test/TEST-com.citi.put.checks.corun.ObservedCoRunIT.xml --raw backend/build/corun/fault-injection-raw.json --expect-dist 4add1307afe80af5270a63dc809d43bb2d4d4dd51ab32a83330d3cbaf35fc3c3 --out <your-evidence-dir>/fault-injection.json'
```

The collector exits 2 when another lane edits source during the run (`sourceStable:false`); that is expected under R3 and is not a test failure. Read `counts`, `distStable` and the report.

## 2. How to check the result without trusting the test's own verdict

- `tools/corun-report.mjs` recomputes every invariant from `backend/build/corun/fault-injection-raw.json` (what the dispatcher sent, what the runner admitted, how many replay children it forked, the ledger's attempt identity) and fails a run whose dist digest differs. Read the raw file next to it.
- The runner's own redacted log of each generation is copied to `backend/build/corun/logs/runner-generation-<n>.log`. `grep -c GUIDED_START_FAILED` on them is the REL-001 pointer; the report classifies any line (innermost non-TIMEOUT cause, or `kind TIMEOUT`: recurrence; innermost `code TIMEOUT` at 15 000 ms or more: D4 15 s edge; innermost `code CANCELLED`: exempt only with a stop that reached the runner first).
- The committed document is `docs/qa/evidence/studio-observed-authoring/fault-injection.json`. Compare your own output's `legs[].runs[]` counts with it. Timings (`cancelToTerminalMs`, `childrenVanished`, `sessionSettledAfterMs`) will differ by tens of milliseconds; counts and statuses must not.

## 3. Negative controls (the harness must go red when the product regresses)

The mutated sources are in `recipes/` (`M1-StudioDispatcher.mutated.java`, `M2-GuidedSessionService.mutated.java`); `recipes/mutation.init.gradle.kts` swaps one compiled class ahead of the main classes on the test classpath, so the shared checkout and build output are untouched.

```
SP=<scratch>/mut; mkdir -p $SP/src/com/citi/put/checks/studio/dispatch $SP/out
cp docs/qa/evidence/STUDIO-OBS-009/execution-20261018/f/recipes/M1-StudioDispatcher.mutated.java $SP/src/com/citi/put/checks/studio/dispatch/StudioDispatcher.java
MUT_SRC=$SP/src MUT_OUT=$SP/out python3 .aiox/sdc/STUDIO-OBSERVED-ORCH/execute-008/with-gradle-lock.py \
  python3 .aiox/sdc/STUDIO-OBSERVED-ORCH/execute-009/run-backend-tasked.py <new-label> --test-tasks test -- test \
  --tests 'com.citi.put.checks.corun.ObservedCoRunIT.aLostAcknowledgmentIsNeverAResend' --no-daemon \
  -I docs/qa/evidence/STUDIO-OBS-009/execution-20261018/f/recipes/mutation.init.gradle.kts
```

Expect RED: `dispatcher sends for ackLoss: [send:ACCEPTED, acknowledgment-lost, send:DEFINITE_REFUSAL] expected: 1 but was: 2`.

M2 is the same with `M2-GuidedSessionService.mutated.java` at `$SP/src/com/citi/put/checks/studio/guided/session/GuidedSessionService.java`, `CORUN_REPEATS=1`, and `--tests '...ObservedCoRunIT.aPublicCancelOfALiveGuidedBrowserMidActionTearsItDownAndFreesTheSlot'`. Expect RED: `[the runner was told to stop] ... 0 to be greater than 0` (the guided browser tree still leaves inside 15 s without the stop; the stop-route counter is what shows the mutation).

## 4. The named proofs that stand beside the live legs

```
python3 .aiox/sdc/STUDIO-OBSERVED-ORCH/execute-008/with-gradle-lock.py \
  python3 .aiox/sdc/STUDIO-OBSERVED-ORCH/execute-009/run-backend-tasked.py <new-label> --test-tasks test -- test \
  --tests 'com.citi.put.checks.studio.recovery.RecoveryIT' --tests 'com.citi.put.checks.studio.internal.ProgressCallbackIT' \
  --tests 'com.citi.put.checks.studio.CancelIT' --tests 'com.citi.put.checks.studio.StudioIdempotencyIT' \
  --tests 'com.citi.put.checks.studio.guided.session.GuidedSessionIT' --tests 'com.citi.put.checks.studio.guided.session.GuidedLifecycleReasonIT' \
  --tests 'com.citi.put.checks.studio.guided.session.GuidedServiceTransportFaultIT' \
  --tests 'com.citi.put.checks.studio.guided.bridge.GuidedRunnerContextRefusalTest' \
  --tests 'com.citi.put.checks.studio.guided.bridge.GuidedPrefixReceiptVerificationTest' \
  --tests 'com.citi.put.checks.studio.guided.translation.GuidedStepVerifierTest' --no-daemon
```

Expect 168 cases, 168 passed (CancelIT 16, StudioIdempotencyIT 5, GuidedPrefixReceiptVerificationTest 3, GuidedRunnerContextRefusalTest 3, GuidedLifecycleReasonIT 5, GuidedServiceTransportFaultIT 39, GuidedSessionIT 44, GuidedStepVerifierTest 1, ProgressCallbackIT 27, RecoveryIT 25).

## 5. Static gates

```
cd backend && JAVA_HOME=$JAVA_HOME ./gradlew spotlessCheck checkstyleTest --no-daemon --console=plain   # inside the lock
```

`spotlessCheck` is green. `checkstyleTest` is red today on exactly one line, in another lane's file (`GuidedSchemaProbeIT.java:240`, 124 columns); `ObservedCoRunIT` has no violation. Frontend lint and type-check do not apply: nothing under `frontend/` changed.

## 6. What to read in the evidence folder

`f/obs009-f-corun08/` is the credited run (XML, raw measurements, runner logs); `f/script03/` is the same class through `tools/corun.sh --skip-build`, with before and after source manifests (source and dist stable); `f/obs009-f-stress01/` is the guided cancel case ten times over. `f/context.json` is what the committed document adds to the measurements. The collector receipts are `execution/obs009-f-*-results.json`.
