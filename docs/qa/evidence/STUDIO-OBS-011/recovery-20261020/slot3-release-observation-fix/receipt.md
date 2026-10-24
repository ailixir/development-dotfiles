# Controlled C6 release-observation candidate — source only

This is a narrow011 ReplayIT test-fixture candidate. No actual source, sandbox, compiler/parser, suite, native query/signal, process/lock, dependency, provider, Git or image operation occurred. Only this off-tree packet was written. Original collector9778 remains root-owned; this packet cannot open a write/runtime window while it is active. Historical C6 cause remains **UNPROVED** and the default31PASS/15FAIL result remains failed. This candidate is separate from the accepted009 timeout-origin product change and from the RT seven neutral sources.

`before/`, `red/`, and `green/` contain full exact ReplayIT buffers. The actual before hash is e10c162d057c87a906a32e162614d29f3f4ba5a0e7000c52e9f77e46b0cdd616. Red is bc3b7e62b499db5740da540739ba8ca08e7c558647afa23287ebd7761700ad7c; green is309fe20ac624acb51a4a7d8889e16d142cc9cd1913d634ce26c919b5f505c501. Forward patches and all inverse forms are included; their complete hashes are in the manifest. The original actual source was rechecked after preparation.

## Two stages

`01-neutral-seam-and-controls.patch` does exactly two bounded edits: a private JDK BooleanSupplier/Supplier<String> overload, and a block appended immediately before the closing brace of the existing Order19 `syntheticSinkScannerDetectsIndependentNonAsciiEncodedControls` support case. No import, annotation, test name, Order, profile, native constant or old body/assertion is changed. All73 original @Test declarations remain; no JUnit case or variant is added.

The real ProcessHandle adapter uses lazy `() -> pinned.isAlive()` and `() -> p6Status(pinned).state()`. Those execute only where the original operations ran inside the original try/catch. A nullable pinned handle still fails inside that catch; an eagerly dereferenced method reference would change that boundary and is deliberately avoided. The neutral overload body is byte-identical to the old body after only those two provider substitutions. It preserves entry liveness → status → X/Z expression and RuntimeException/AssertionError →false, with the same short circuit and no new observation.

The first appended assertion supplies entry alive=true, then a successful S snapshot whose supplier sets the fake liveness false before returning. Red old classification still returns false. The desired assertion is `C6 successful nonterminal snapshot followed by death needs no signal`, expectedtrue/actualfalse, at **red line20887** (`.isTrue()`). This is a deliberately controlled source counterexample, not a reproduction of slot3. Setup, compiler, timeout, count/discovery, unrelated assertion or extra teardown failure is not red credit.

Only after a genuine named assertion-red may root consider `02-fresh-liveness-only.patch`. Its entire green delta is:

```java
return "X".equals(state) || state.startsWith("Z") || !isAlive.getAsBoolean();
```

The added read occurs only after a successful nonterminal snapshot. Existing dead-entry and X/Z paths retain their original call sequence. Explicit fresh-dead changes the no-signal classification totrue. Continuously alive or unavailable observations remainfalse. Null/throwing status stays in the original false catch without a liveness fallback. No metadata absence becomes signal authority, no exception-message check is introduced, and an X/Z/dead no-signal classification still does not prove actual reaping.

The same existing support body appends nine narrowly bound controls, with exact local closed read-order assertions:

| Controlled observation | Expected classification | Exact read order |
| --- | --- | --- |
| alive → successful S → dead |true|alive,status,alive|
| alive → S → alive |false|alive,status,alive|
| alive → status throws, hypothetical later dead |false|alive,status|
| alive → missing status, hypothetical later dead |false|alive,status|
| entry liveness throws |false|alive|
| entry dead |true|alive|
| alive → X |true|alive,status|
| alive → Z+ |true|alive,status|
| alive → S → fresh liveness throws |false|alive,status,alive|

These reject blanket-ignore/unknown-acceptance behavior and protect existing short circuits. They use only local lists/booleans/JDK suppliers; no ProcessHandle, process/status query, signal, retry, polling, sleep, clock, duration, deadline extension or production helper framework is available to the added controlled calls. Red intentionally stops at the first new assertion; green must execute every guard and all original support assertions. No additional mutation matrix is proposed.

## Preservation and eventual integration

`source-preservation.json` proves that removing exactly the helper extraction and appended block restores the original full source bytes in either stage. The original support body is an exact preserved prefix. `protected-source-spans.json` additionally pins whole unchanged authority/status/kill/release blocks: ownedCommandHash, verifyOwnedDescendant/verifyRecordedOwnedHandle, p6Status, p6AwaitProcesses, p8KillRefusedWhileAlive, p8C6Run and p8AwaitC6Closed. Every cleanupUnconfirmed source line remains exact. PID/start/command/ancestry authority, owned tool teardown, firstError/sticky cleanup, descriptor/restoration/producer/latch predicates, original errors and genuine reaping assertions are untouched.

Current e10 retains all94 Thread.sleep calls plus its one TimeUnit.NANOSECONDS sleep. The prospective B4/finalFOLD tree retains all21 deliberate sleeps:20 Thread.sleep calls plus that one nanos delay. None of those expressions/catches are in either edit. No sleep reduction or wait/classification change is claimed by this packet.

`prospective-composition.json` checks exact old-helper/support spans in the existing TEST001/B1/B2/B3/B4/carry6 and finalFOLD prospective files. All match once, so the bounded two-span composition is possible without dropped context. These historical files were not rewritten. The finalFOLD original83c7c738… would become **2c4891f5feae846ca52082e2241193a5c14ffc891aa746c4700c3e2515cf8032** only if this exact green candidate is later accepted and composed. The B4 original98aec4f9… would become7e0e43d8…. These are unexecuted prospective source hashes, not new actual/baton hashes. Root must retain the existing B1–B4 progression and independently review the bounded successor after actual application. Any formatter/other source change requires honest new current-source/application/reader bindings. No old source pin is waived or forced onto the new tree.

`future-commands.json` gives the exact one existing single-case selector through the existing task-qualified collector, with separate semantic compile commands and fresh red/green labels. No command has run. Root and independent exact source QA, original9778 terminal/lock handback, and a separately opened one-file source window are prerequisites. The red command must discover exactly that one support body and produce only the named assertion failure; suppressed setup/AfterAll cleanup failures invalidate controlled-red credit. Do not apply green or retry after any different failure. Green must pass that same body with all original assertions and all guards. The packet grants no full-class run, new profile, reader relaxation or seventh slot; the final identical composed pair and final whole check retain their existing obligations. No historical cause, lifecycle, release, native closure or production credit follows from a controlled helper pass.

Shared USD500 ceiling remains; aggregate spend is unknown. No external fact or approval is invented.
