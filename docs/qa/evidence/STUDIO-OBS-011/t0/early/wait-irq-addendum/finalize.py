from pathlib import Path
import hashlib
import json

O=Path(__file__).resolve().parent
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
binding=json.loads((O/'bindings.json').read_text())
oracle=json.loads((O/'expected-oracle.json').read_text())
(O/'commands.md').write_text('''# Future bounded CONFORMANCE-I1 command — UNEXECUTED

Do not compile or run while root fullcheck03 is live. Root must first settle its actual terminal receipt/source state and authorize the separate scratch unit. This document and source preparation do not authorize launch. Use the existing shared Gradle lock even though this is standalone cached-Java scratch work; do not start another Gradle/native unit alongside it.

From the repository root, select the actual already-installed cached Java21 home explicitly and a new scratch directory:

```sh
python3 .aiox/sdc/STUDIO-OBSERVED-ORCH/execute-008/with-gradle-lock.py python3 docs/qa/evidence/STUDIO-OBS-011/t0/early/wait-irq-addendum/run_later.py --execute --java-home /ABSOLUTE/ACTUAL/CACHED/JAVA21/HOME --scratch-directory /private/tmp/obs011-wait-irq-FRESH-LABEL
```

The launcher reads the installed `release` file to require Java21; no discovery launches, installation or network call occur. It validates the addendum Java hash, exact sealed package membership/bytes, review/bytecode/input hashes and all3 installed cache jars. It refuses an existing/wrongly named scratch directory and emits only into the new owned directory. One `javac -g:lines,source` phase is capped at30s, followed once by one Java phase capped at60s. Outputs, phase exits/timeouts, proof hash and a failure/pass receipt are retained. Invalid bindings stop before compilation. There is no automatic retry.

Java runs26 pairs/52 explicitly owned platform workers sequentially. At each site the initial external false read waits on an owned gate (maximum1s); release is followed by a maximum1s search for an actual native sleep stack. A library resleep acknowledgment search is also bounded1s. The ordinary join is bounded3s; finally always releases the gate, interrupts only that owned worker if still alive, and joins with a4s absolute cleanup budget while preserving a coordinator interruption. Any survivor writes a failure record and halts only this owned scratch JVM, so it cannot escape into later pairs. The Python timeout also terminates only its own subprocess. Native processes/threads are never targeted.

PASS requires26 actual Java pair assertions plus52 real sleep-entry proof records,26 delivered resleep acknowledgments and52 joins. Missing coordination/counters/line proof or an error/timeout produces FAIL_OR_UNPROVED and nonzero exit, never partial pass or retry. A short interval may be missed by observation; this is an honest failed/unproved run, not permission to infer interruption or relax the oracle. No wall-clock equality/interrupt latency threshold is asserted. Keep the complete receipts/proof for independent review.

The existing234 comparisons remain a separate unexecuted partial probe; this addendum does not run or claim them. Native staged/full bridge/IT-S, literal unchanged-main GS-T, F1/GS-M, exact FOLD batons/full sets, full both-task Replay, final clock cleanup, fresh fullcheck/coverage/full11G, transaction/ownership/privacy/cohort/skip/case reconciliation, no-survivor and valid exact-set AC5 before/after evidence remain mandatory. No scratch outcome alone grants W1/application, lane exit, lifecycle, release or QA approval.
''')
(O/'receipt.md').write_text('''# CONFORMANCE-I1 — owned during-interval interruption addendum

Dex,2026-10-19. **Preparation only: all26 paired probes/52 owned runs, compilation and native gates are UNEXECUTED.** No process/thread was interrupted, no Java/compiler/probe/Gradle/Node/build/formatter/Helm/Docker/provider/network/Git command was executed, and no actual source/story/plan/current harness was modified. Writes are exclusively this new sibling folder. Shared declared dispatch ceiling USD500; actual aggregate spend is unavailable.

This addresses the concrete missing planned axis named in `qa/bridge-its-drafts-rereview/review.md` CONFORMANCE-I1. The earlier234 modes set interruption during the first condition and therefore do not enter a library interval. They remain separate, wholly unexecuted evidence. This addendum proposes real owned-thread interruption after observed interval entry rather than turning those earlier modes into an interruption claim.

`WaitIrqConformance.java` copies the sealed generator's complete fixture and all52 original/delivered site methods byte-for-byte. The actual26 delivered local blocks and their original helpers/loops/final checks retain their existing source hashes, SQL/file/process seams,10/20/25/50ms intervals and guard/terminal logic. Only the external Probe and orchestration are new. The scratch Probe returns false, never injects interruption itself, and gates the first external read so the coordinator can identify its owned worker. Its2500ms scratch-only budget permits bounded coordination; it changes no candidate/native timer and makes no native latency claim.

The proposed proof sequence is explicit:

1. Construct one identity-held, named non-daemon platform thread; rendezvous at its first false condition/predicate/marker read and release that gate.
2. Require `TIMED_WAITING` plus a real `java.lang.Thread.sleep*` frame and the exact owning original/delivered method. Delivered additionally requires `ConditionAwaiter.await` and `Uninterruptibles.sleepUninterruptibly`; a gate/park, timer started before a branch, future wait or unrelated thread cannot qualify.
3. Interrupt only that owned thread immediately after the qualifying snapshot. Large stack formatting is deferred until after the interrupt/acknowledgment window.
4. For delivered code, additionally observe native uninterruptible resleep with a strictly greater nonnegative `ThreadInfo.waitedCount` while the read count is still exactly1. Since the next real step either checks the restored interrupt or performs another read, this acknowledgment distinguishes interruption handled inside that first library interval from a late flag set after it. Unsupported/missing counters, a missed short resleep, or extra read fail closed as UNPROVED.
5. Join and assert one unwrapped escaped `InterruptedException`, no replacement cause/suppressed outcome, no manufactured result and no additional condition/SQL-predicate/marker or final-fresh read. Compare complete original/delivered initial effect traces. Original must contain the exact bound real sleep call line and a native sleep exception frame. Delivered must contain the distinct bound **post-interval** step throw line, not its initial pre-sleep line. Caller flag is cleared except the two original route outer handlers, whose reinterrupt mapping remains on both sides. The default unrelated-thread handler must remain unchanged.
6. Finally always release the gate and perform owned-only interrupt/join cleanup with an absolute bound. A survivor records failure then terminates only this owned scratch JVM; no late worker is allowed into another pair or outside the owned process. No retries occur.

`bindings.json` records all26 source pairs, unchanged intervals, exact method hashes, compile source-line targets, generated-Java hash and complete sealed membership/bytes. `input-bindings.json` binds the saved exact dispatch/preflight, dev role/AGENTS, prior review, original generator/Java/launcher and inspected library bytecode. `classpath.json` retains the exact3 already-installed jar hashes. `expected-oracle.json` is expected behavior, not runtime output. `commands.md` and `run_later.py` provide one future shared-lock, explicitly selected cached-Java21 compile/run unit with30s/60s ceilings, source/debug-line binding, failure/timeout/proof receipts and no automatic retry.

Lightweight static checks verified52 copied methods/fixture bytes,26 exact delivered block occurrences/hashes, all52 throw-line mappings, unchanged resume2 membership/bytes, actual owned S011 preimages/new-fixture absence and cached jar/input hashes. This is delimiter/source inspection, not compilation or proof that any Java probe passes. The sealed original/corrected packages remain immutable; no wait source correction is proposed here.

This evidence has deliberate limits: stack/counter coordination can miss a short interval and must then fail unproved; it does not establish identical scheduling or a hard interrupt latency. Instrumented seams do not execute real JDBC, child/worker lifetime, full enclosing finally/suppressed-error aggregation, privacy/cohort completeness, coverage or AC5 timing. Existing normal native gates and exact accepted batons remain mandatory. Root fullcheck03 was the sole actual runtime/source unit during preparation. No W1/application, lane start/exit, QA/lifecycle, timing or release approval is asserted.

- Prepared Java SHA256: `'''+binding['generatedJavaSha256']+'''`
- Expected paired sites:26; owned runs:52; all UNEXECUTED.
''')
artifacts={str(p.relative_to(O)):sha(p) for p in sorted(O.rglob('*')) if p.is_file() and p.name not in ['artifact-manifest.json','receipt.json']}
(O/'artifact-manifest.json').write_text(json.dumps(artifacts,indent=2)+'\n')
receipt={'status':'PREPARED_UNEXECUTED','scope':'CONFORMANCE-I1 separate addendum only',
         'pairedSites':26,'ownedRuns':52,'compileExecuted':False,'runtimeExecuted':False,
         'prior234ComparisonsExecuted':False,'nativeExecuted':False,'actualSourceApplied':False,
         'sealedPackagesModified':False,'sourceWaitChangesProposed':False,
         'javaSha256':binding['generatedJavaSha256'],'receiptMarkdownSha256':sha(O/'receipt.md'),
         'artifactManifestSha256':sha(O/'artifact-manifest.json'),
         'oracleSha256':sha(O/'expected-oracle.json'),'bindingsSha256':sha(O/'bindings.json'),
         'coordinationFailureDisposition':'FAIL_OR_UNPROVED / no retry / no partial pass',
         'independentReviewAndExecutionStillRequired':True,'timingIdentityClaim':False,
         'rootRuntimeHeldDuringPreparation':'fullcheck03 tool6927 / lock99563 / collector99690; no interaction',
         'nativeGateOrQAOrLifecycleCredit':False,'budgetCeilingUsd':500,'actualSpend':'unavailable'}
(O/'receipt.json').write_text(json.dumps(receipt,indent=2)+'\n')
print(json.dumps({'receiptSha256':sha(O/'receipt.md'),'manifestSha256':sha(O/'artifact-manifest.json'),
                  'javaSha256':binding['generatedJavaSha256'],'artifactCount':len(artifacts),'runtime':'UNEXECUTED'}))
