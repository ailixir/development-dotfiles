# Exact deadline diagnostic: architecture review

Disposition: **CLEAN for the proposed single-case diagnostic instrument. No mandatory correction.** This is a source review, not run authorization, a compiler/parser result, a QA gate, a product fix, or historical cause credit.

Reviewed forward patch SHA256959f0ccecbe938ba74341676575dedcd0f5eefc157c1187129bff6caad0b2c58 and inversecc6b5822840e4b3bb19ff67cc8be663d8317dc7cab334d9117dc36d31a6b6daa. The three actual pristine/instrumented buffer pairs match their six declared hashes, and their textual diffs match the proposed patch. The inverse visibly restores those exact changes. No patch or inverse was applied.

## Behavior and measurement

The launch catch preserves the original abort-first short circuit: aborted=true prevents the Date.now() call, with a zero trace sentinel; otherwise the one existing wall sample is assigned once and used by the same strict-less-than deadline predicate. The diagnostic await-selected value controls the original await of the same settled hard-close promise. The same hardClose is started before that decision, and GuidedLaunchFailure receives the original close capability, cause normalization and phase.

boundedStartup preserves the entry cancellation/expiry checks, maxMs default30000, exact max(1,min(maxMs,deadline-existingWallSample)) delay, abort listener and cancellation rejection, ordinary-error propagation, cleanup, and late-success absolute-deadline refusal. It does not tag, reclassify, rearm or extend TIMEOUT. The timer callback's extra Date.now() is solely a trace delta and does not control rejection or cleanup.

The hardTeardown body, process matching, listings, late-launch/backstop wait, survivor check, memoization and ownership logic are unchanged. Event4 is appended in the existing disposal function only after the existing rm await resolves. This records removal completion without moving removal or altering the helper body. Omitting first-listing/wait instrumentation is consistent with the minimum timer/catch/disposal/caller discriminator and keeps that body untouched; the trace cannot directly prove which listing/wait branch executed.

The target test retains every original assertion and ordering, the unique TMPDIR parent, pending launch mock, original1000ms deadline wall sample, fresh signal, scratch readdir/filter/map, stand-in spawn body,1500/1800ms timers, close calls, liveness and scratch-empty checks, and existing afterEach cleanup. The captured assignment returns the exact original deadline value. Existing teardownStartedAt, decoyAt and closedAt wall samples are reused. Catch rethrows the original object. Added finally work can change reported whole-test duration; timed-path interpretation must use the trace, not compare total Vitest durations as equivalent.

No original12000ms production start budget,15000ms transport ceiling,3000ms reserve or test timeout changes occur. There are no fake clocks, induced early timer, new retry, native control, or alternative error cause.

## Closed trace

Only the exact test installs the derivative-only global sink, without replacing an existing property. Installation conflict/failure is marked incomplete; an installed property is removed in finally. The product wrappers swallow sink failure and mark failed where possible. The controlled sink only validates/pushes bounded in-memory records and reads performance.now().

The record limit is32; event codes are integers1..9; persisted payload fields are finite numbers/booleans, with sequential order and elapsed monotonic time. No paths, pids, arguments, identities, error text/objects, absolute epochs, DOM, image, video or capture body enters the trace. Trace-key strings are fixed schema, not captured material.

There is no added timed-path I/O, console call, await, polling, process operation or control decision using monotonic time. The one flush is a writeFile from test finally after the original path, with wx and0600. Failed flush is swallowed to preserve the original assertion; a missing/partial/preexisting trace is not valid evidence. The fresh derivative and absence checks remain required at execution.

The reader was inspected as source only. It checks a regular non-symlink file/size ceiling, exact closed envelope/record keys and types, bounded length, numeric finiteness, event range/order, monotonic nondecrease, event-specific zero/boolean/count fields, and required-event completeness. Missing, malformed, overflow or instrumentation failure yields incomplete/nonzero. It never prints malformed payloads or imports application code. A complete trace can correctly coexist with originalTestFailed=true: that is an observed failing oracle, not test/gate success.

Required events1..7 include disposal; events8/9 remain optional when the original scratch assertion prevents later work. No missing mandatory event is silently accepted. The reader does not prove provenance by itself; root's exact command, fresh derivative, report identity, source hashes and trace hash provide that binding.

## Command, derivative and provenance

single-case-command.json is limited to guided-start-deadline.test.ts and the exact anchored full title in one argv value, one worker, existing fixtures config/globalSetup and Node24 path. Other cases are filtered and receive no gate credit. The one-case requirement must be verified from the actual report. No command was executed.

The copy plan is create-only-if-absent at the distinct diagnostic root, copying from the held RT sandbox into regular independent copies, seeding only empty runtime-evidence directories. The original actual source, RT sandbox, original six-file token/AST proof and failed reports remain untouched. The three diagnostic paths are separate from the seven RT candidate paths. Normal globalSetup is retained; the diagnostic's emitted dist is unmeasured and expressly not RT output. The declared238-file pristine dist is preserved separately.

bindings.json has six matching buffer hashes, forward/inverse identities, seven original RT candidate bindings and18 protected rows, a493-input base/expected derivative source identity, and the previously accepted f726d3f4... RT dist identity. Its referenced after-revalidation snapshot hash c7420178... also matches. This review inspected the bindings and directly rehashed the stated buffers/artifacts; it did not recalculate the aggregate493-input/238-output inventories or create a derivative. Root must verify actual copies and source/delta/dist inventories at creation/run/restoration. The inverse and pristine dist are retained, not implicitly applied or cleaned up.

## Limits

Synchronous allocation, validation and clock reads add observation overhead and can suppress or move a sub-millisecond race. No zero-overhead, timing-equivalence or historical-reproduction claim follows. Timer callback/catch samples and disposal/caller ordering can discriminate the proposed path only for the new instrumented execution. A passing case is non-reproduction, and even a matching failure cannot retroactively prove fixtures02's cause. This trace does not investigate the separate native-control readiness failure.

Root retains one-run authorization and the heavy lane. Both failed full fixture runs, RT copyback hold,009 behavioral-fix boundary,011 reformat-neutrality claim and remaining lifecycle/release work remain intact. Shared USD500 ceiling; aggregate spend unknown. No private capture/baseline body was read; no parser/compiler/native/process/provider operation, source/sandbox mutation or delegation occurred.

