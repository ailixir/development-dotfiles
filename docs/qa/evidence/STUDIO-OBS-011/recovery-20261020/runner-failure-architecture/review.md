# Source review of the two held runner fixture failures

Scope: source-only aiox-architect investigation for pending STUDIO-OBS-009/011. No native launch, test, compiler, process-table inspection, provider operation, product/sandbox edit, retry, copyback or gate credit. Only this evidence directory is owned. Shared USD500 ceiling; aggregate spend unknown.

## Finding

The two failures are distinct and unresolved. The source permits the proposed timer/catch mismatch, but the recorded data do not establish that it caused fixtures02. Recommend one instrumented execution of the exact existing late-spawn case, only after root separately authorizes that diagnostic. Keep the failed full runs and RT copyback hold. Do not retry the full tier merely to obtain green.

## First failure: native control readiness

Public runtime-04 numeric findings bind fixtures01 to the chrome://version/800×600 control: CONTROL_CLEANUP, startComplete=true, qualified=false, candidates=0, droppedBusy=0, elapsedMs=10119, observerStopped=true, decoderJoined=true, contextFallbackClosed=true. The full run was 295 pass / 1 fail / 9 historical skips.

The unchanged test reaches its exact destination, destination-specific DOM predicate, two animation frames and video-presence prerequisite before calling the readiness helper (native-blank-surface-controls.test.ts:20-29). The failure is wrapped as CONTROL_READINESS at lines30-33. Recorded-WebM decoding/classifier assertions at lines37-41 are not reached.

The helper admits a candidate only at nativeControlReadiness.ts:90. Thus zero candidates means no frame was admitted for decoding/classification; it does not prove that no screencast callback occurred. Callbacks can be ignored after failure/expiry, and an invalid first buffer can fail before incrementing the count. decoderJoined is assigned in finally even when no active decoder exists (line127). observerStopped means at least one stop resolved; it does not mean every stop attempt succeeded.

The final CONTROL_CLEANUP can overwrite the initiating failure at lines121,123,124. Therefore the final code does not identify whether the initial event was the absolute deadline, closure, input or another failure. startComplete=true and the roughly ten-second duration narrow the observations but do not restore the lost first-failure code. No pixel, DOM, profile, capture, screenshot or video body was inspected.

The one already-authorized isolated unchanged case passed (one candidate, elapsed91ms); both version controls also passed in fixtures02 (public numeric results55/94ms, with no viewport inference from nonce directories). This establishes non-reproduction in those later executions. It neither explains fixtures01 nor proves harmlessness or a production/reformat regression. Nothing in this control calls launchGuidedBrowser or boundedStartup: it directly uses chromium.launchPersistentContext and its own 10,000ms readiness helper. There is no evidence of a shared cause with the second failure.

## Second failure: pending-launch teardown oracle

The unchanged case at guided-start-deadline.test.ts:167-197:

1. Creates a unique parent and installs that parent as TMPDIR.
2. Replaces chromium.launchPersistentContext with a permanently pending promise.
3. Calls launchGuidedBrowser with a fresh, never-aborted signal and an absolute deadline one second away.
4. Awaits a GuidedLaunchFailure with TIMEOUT cause and PROCESS phase.
5. Lists its private parent, requiring exactly one launch scratch directory at line180.
6. Only after that assertion schedules the stand-in Chrome at1500ms and launch rejection at1800ms, then awaits the memoized failure.close().

Fixtures02 failed step5: [] rather than one directory, duration4053.208375ms. Its preceding instance/cause/phase assertions passed. The test had not scheduled either later timer or spawned its stand-in Chrome. This failure supplies no evidence that a late Chrome escaped a kill or that a survivor was incorrectly cleared. It prevents that part of the oracle from executing.

In browser.ts the scratch directory is created at544 and removed by the memoized disposeScratch path552-553, reached after second listing and survivor verification at700-702. prepareBrowserProfile/releaseBrowserProfile manage profile pins and do not themselves remove the scratch directory. This supports cleanup having finished before the list, but the historical report contains no disposal timestamp or exclusive trace proving which operation removed it.

## Timer/catch path: what source proves

observedBootstrap.ts:20-26 checks the absolute deadline at entry, then schedules a timer for max(1,min(maxMs,deadline-Date.now())). Its timer callback rejects TIMEOUT unconditionally, without a fresh Date.now() check. It also rejects TIMEOUT when successfully completed work is observed at/after the absolute deadline. An ordinary work rejection is preserved.

browser.ts:675-682 starts one memoized hard teardown and independently samples Date.now() in its catch. If the signal is not aborted and this sample is still before deadline, it awaits teardown before constructing the failure; otherwise it returns the failure immediately with the same hard-close capability. Cause normalization changes CANCELLED only for an aborted signal with the two recognized reasons (guidedBrowser.ts:64-68).

For the permanently pending launch, acquired context is absent. If the first process listing sees no owned process, hardTeardown waits for the launch to settle or until its own backstop, with at least the one-second late-launch grace (browser.ts:692-697). That backstop was constructed from the runner deadline plus the unchanged3000ms reserve (558-559). With the mock remaining pending, an awaited teardown can therefore consume approximately the original1s +3s before scratch removal. The recorded4053ms is compatible with this path.

A timer rejection that reaches the catch while its wall-clock sample is still below deadline can select that await path. Source has no invariant preventing that combination. But the run records neither timer/catch wall-clock samples nor branch selection. The duration alone cannot distinguish this from a later wall-clock movement, delayed caller continuation/listing after an immediate failure, or another unrecorded scheduling/filesystem event. No actual early timer, clock change or scheduler defect is claimed.

## Preserve maxMs and ordinary-failure semantics

boundedStartup is shared. Its default maxMs is30000, and other call sites explicitly cap operations at5000 or1000ms. A TIMEOUT can legitimately represent a per-operation cap before a later absolute deadline. A work promise can also reject with an Error whose message is TIMEOUT. Neither is proof of whole-start expiry.

The launch's production whole-start budget remains12000ms inside the15000ms transport ceiling, with3000ms reserve; explicit test callers can supply later deadlines. The existing non-deadline/frozen-browser F3 case requires cleanup to settle before the ordinary failure replies (guidedCloseBound.test.ts:123-146). The cleanup ownership, second process listing, survivor rejection, scratch retention on survivors, and memoization must stay intact.

Consequently do not patch the catch to skip awaiting every error named TIMEOUT, classify every TIMEOUT as deadline expiry, await every failure unconditionally, alter the reserve or test delays, remove the scratch-length predicate, or make the mocked pending launch reject before the original1800ms timer. These would change guarded behavior without identifying this failure.

## Recommended single diagnostic, proposed only

Use a disposable diagnostic derivative of the held RT sandbox, under a new evidence-bound identity. Keep the original seven RT candidates, six-file token/AST proof, original dist and both failed reports untouched. Diagnostic-only source instrumentation must never be copied into the RT candidate or treated as neutral RT output.

Execute only the existing exact late-spawn case once, with its current globalSetup, real timers, launch mock, deadline1000ms, stand-in1500ms, rejection1800ms, original predicates and cleanup. No full tier, loop, fake clock, induced early timer, timeout extension, extra native control or provider call. The selector is one literal argv value:

`^REL-001/D4 — a launch hung by a frozen browser is cut off and fully torn down kills a Chrome that spawns after the teardown's first listing, and holds the close open until the launch has settled$`

Collect a fixed, bounded in-memory numeric trace and flush it from test finally, outside the timed path. No synchronous file writes, console output, extra awaits or polling in the path. At most32 records, closed event vocabulary, numeric relative wall/monotonic timestamps and booleans/counts only:

- call entry: deadline offset and maxMs/selected timer delay;
- the boundedStartup timer callback: wall delta to deadline, monotonic elapsed, timeout-source enum;
- the existing catch condition: the exact wall sample used by the predicate, aborted flag, phase enum, await-selected flag;
- first process listing: owned count and selected waitMs/backstop delta;
- teardown settlement/scratch-disposal-complete;
- failure returned to the test, readdir requested/completed, returned scratch count;
- if reached, the original stand-in scheduling/spawn and close settlement, without paths or pids.

Instrument the already-required clock samples instead of adding new wall samples for branch attribution. Monotonic readings are observation only, never control decisions. Preserve original expressions and rethrow the original assertion after flushing. Hash/bind the tiny instrumentation delta separately. Retain whatever result occurs; a passing execution is diagnostic non-reproduction and provides no fixture-gate credit.

Interpretation is deliberately bounded:

- Timer/catch below deadline + await-selected + disposal before caller: confirms that path for this new execution. It does not retroactively prove fixtures02.
- Catch at/after deadline + no await + delayed caller/read completion after disposal: rules out the proposed branch for this new execution and identifies a different ordering.
- Original scratch predicate passes and cleanup/kill assertions pass: non-reproduction only. Do not automatically retry.
- Any setup/compilation/instrumentation failure: no cause or behavioral credit.

The minimal observation set is the timer, catch decision, disposal and caller/listing sequence; the remaining count/elapsed fields distinguish backstop waiting without inspecting process arguments or private material. A fresh browser is not launched by this target because its launch is mocked, but its original stand-in process and teardown oracle still run if the prerequisite passes. Root must reserve the existing heavy lane and authorize this one diagnostic before execution.

## Product correction boundary

No product correction is justified as the historical cause from the available evidence. If the new trace confirms a premature absolute-deadline timer path, the narrow candidate is to make that absolute-deadline timeout and the cleanup handoff agree about expiry, backed by a deterministic focused red. Preserve independent per-operation maxMs expiry and ordinary work errors, including their TIMEOUT message, rather than using a broad string check.

An absolute-deadline timer recheck/rearm is one candidate, not an approved patch: its cap semantics, cancellation, late-success refusal and wall-clock rollback/transport bound need explicit review. A tagged internal timeout origin is another possible design but adds surface and should not be introduced merely to solve a flaky test. No clock abstraction or test matrix is requested here.

Any behavioral fix belongs to a separately scoped pending009 defect, with its own red/green and existing guard coverage. It cannot be folded into011's six-file token-identical reformat claim. Rebase and independently re-prove any subsequent RT inputs after that009 change. The current fixture gate, copyback and final lifecycle/release obligations remain outstanding.

