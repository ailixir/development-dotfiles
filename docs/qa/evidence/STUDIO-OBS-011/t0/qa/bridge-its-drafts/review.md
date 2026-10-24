# Independent static review: GS-T2 and IT-S preparations

Quinn, 2026-10-19. **Changes requested in the off-tree bridge waits, IT-S timeout handling and IT-S evidence metadata.** The fixture fold and case preservation have static support; wait transformations require the bounded corrections below and all existing execution gates. This is neither a story QA verdict nor W1, source application, lane exit, runtime, release or lifecycle approval.

I loaded `.codex/skills/aiox-qa/SKILL.md`, the canonical QA role and constitution, and read actual AGENTS, story011, adopted v7/v4 wait/ownership rules and the original015 bridge ruling. The explicit task permits read-only/light Python inspection while the diagnostic holds the actual source/runtime unit; no activation Node script, CodeRabbit, compiler, formatter, test, build, Gradle, Docker, provider call, process signal, Git mutation or source mutation was performed. Read-only `javap` disassembly inspected the installed library, without running a test program. Writes are confined to this review directory. Shared declared dispatch ceiling is USD500; actual aggregate spend is unavailable.

## Mandatory corrections

### BRIDGE-WAIT-01: do not intercept unrelated thread failures

All14 bridge chains omit `.dontCatchUncaughtExceptions()`. For example, the proposed Integration chain at candidate line526 and Planned chain at734 call plain `Awaitility.await()`. The old helper evaluated its BooleanSupplier and slept on the calling thread; it never installed a default uncaught-exception handler. Local Awaitility4.2.2 initializes `defaultCatchUncaughtExceptions=true` (`Awaitility.javap.txt`, static initializer bytecode35–36), passes it into the factory, and `ConditionAwaiter` constructor bytecode38–46 installs itself with `Thread.setDefaultUncaughtExceptionHandler`. This changes how unrelated worker/thread failures are attributed to these tests and can disturb their existing cleanup/failure ownership.

**Bounded correction:** add `.dontCatchUncaughtExceptions()` to every one of the14 direct bridge chains. Keep same-thread evaluation and all existing thread/resource ownership. Do not change Awaitility global defaults or introduce a shared wrapper. All12 IT-S chains already set this option; no equivalent IT-S source correction is required.

### BRIDGE-WAIT-02: preserve interrupt and timeout-final-read behavior

The original Integration `await` at1664 and Planned `await` at2260 are `while (!condition.getAsBoolean() && nanoTime < end) { Thread.sleep(25); }`, followed by a **fresh** `assertThat(condition.getAsBoolean()).isTrue()`. Its interruption and final-read behavior is part of the current test flow, not established merely by retaining an assertion line after a new wait.

Local `ConditionAwaiter` invokes `Uninterruptibles.sleepUninterruptibly` between polls (bytecode321). That helper catches InterruptedException, sleeps the remainder, and restores the interrupt flag on return (`Uninterruptibles.javap.txt`, bytecode17–48). The14 new raw BooleanSupplier `.until(...)` chains do not inspect that flag or preserve the old InterruptedException. A wait interrupted while false can continue polling and later succeed; the original sleep would throw and clear the flag. Also, `.until(...)` throws ConditionTimeoutException before the next assertion when its deadline expires. Thus the fresh final assertion shown after every chain is unreachable on timeout, whereas the old helper could observe a last false guard and then a fresh true condition and pass. These are concrete control-flow differences, independent of scheduling equivalence.

**Bounded correction:** at each of the14 existing call sites, retain the original immediate condition evaluation, absolute deadline,25ms interval, condition-before-deadline short circuit, final fresh condition assertion and original exception/error propagation. Account for an interrupt at the original sleep transition and after the library interval; throw InterruptedException with the original clearing/reinterrupt behavior inherited from its caller. Map library timeout back to the original final check/fallthrough, without retrying the whole operation or swallowing a condition exception. Direct site-local state as in IT-S is a possible form; no new shared wait file/helper, executor, retry, enlarged budget or production edit is justified. An initially true condition must retain the old no-sleep behavior, including its treatment of a preexisting interrupt flag. Retain the existing aliases and same-thread reads. Re-review the final full candidates rather than a patch sketch.

Affected aliases, in candidate source order:

| File | Candidate alias lines |
| --- | --- |
| Integration |527,543,597,622,647,700,729 |
| Planned |735,771,998,1089,1169,1206,1229 |

### ITS-WAIT-01: do not re-enter an already terminal step after a framework timeout

All12 IT-S chains catch ConditionTimeoutException and unconditionally call `itsPoll.step()` again. Their step objects retain failure/result fields but do not latch a terminal outcome. Local4.2.2 `ConditionAwaiter` computes whether elapsed time is below max at bytecode355–369 and branches to timeout at546–548 even when its just-completed same-thread Callable returned true. A condition/query/file read can legitimately consume the remaining budget. If that terminal step succeeds or captures an original Exception/Error after the framework limit, the catch calls it again. For condition-first waits that means an extra condition/read; a second exception can replace the first failure. For the controller-stage loop, an extra file read can replace an already-successful expected marker before the original final marker assertion. Deadline-first sites also should not re-enter a terminal step just because their guard currently makes the extra call inert. This is an identifiable library control-flow path, not a demand for identical scheduling.

**Bounded correction:** latch the terminal outcome of each local step, including a true condition, a reached original deadline/fallthrough, a captured Exception/Error, and any stored result/completion. The timeout fallback may perform the original final step only if no terminal step has already occurred. Do not re-run an already finished observation or replace its first failure/result. Keep the generic waits' original separate final fresh assertion; terminal latching must not accidentally remove that assertion. Retain the original condition/deadline ordering and all stored stage/result/flag outputs. Apply the same rule to all12 sites, without a shared abstraction, extra timer allowance or retry. A small locked/scratch conformance check with a deliberately slow terminal condition and a throwing terminal condition must demonstrate one terminal step, original failure identity and the correct original final-read count. It accompanies the existing execution gates; no such probe was run here.

### ITS-META-01: bind loop metadata to the final candidate

`it-s-draft/loop-edits.json` has12 original loops that do occur in the preimages, but **none** of its12 literal replacement strings occurs in a final candidate. Every row retains an intermediate class identifier containing hyphens, such as `ItsPollSecret-terminal-row-lock`; the full candidates correctly use legal sanitized identifiers. Eleven replacements become token-equal after that name correction. `Transport-controller-stage` additionally quotes `String stageContent = readStageOrEmpty(stageFile)` instead of the actual final `String stageContent = initialStageContent`, whose outer initialization preserves one initial marker read. Its quoted hash is self-consistent with the intermediate text, not the delivered block.

**Bounded correction:** after ITS-WAIT-01, regenerate these12 replacement records from the actual final full candidate blocks, retaining the real original-loop bindings, and refresh their hashes and artifact manifest/receipt bindings. This metadata finding itself adds no source change beyond the separately justified wait correction. The per-file incremental and composed patches already reconstruct the currently reviewed candidates exactly; those remain valid independent historical source evidence. The receipt must distinguish this metadata refresh from a runtime check.

## Independently verified source and case evidence

`audit.py` is this review's own lexer/reconstructor; I did not execute the authors' generation or verification scripts. It checks unified hunk context/counts and reconstructs the complete three bridge paths and six IT-S paths in memory. IT-S incremental and actual-S011 patch forms both equal its six complete candidates. Transport's supplied preimage equals the immutable earlier GS-T candidate, SHA`10d3706043430730edc921804dd1b8eb06a5326eb690f8c33f2571d7300fe1b5`. Both the starting and ending membership/hashes of the entire earlier GS-T draft agree. All eight existing actual source preimages remain the stated S011 originals, and the ninth/new fixture is absent from the real source tree. All506 `backend/src/main` paths and bytes match the supplied S011 main snapshot at review. This snapshot check is not the executed GS-T gate.

The reviewed bindings are:

| Artifact | SHA256 |
| --- | --- |
| GS-T2 patch |`81119d6a9ff6e2d0d2479f3cb453eaf4e696ab295c8d37cc9269059327158dd5` |
| GS-T2 manifest |`dcd8c8d395052cef0d08f820f53b0a33ec901e9baeee2adb183d4b240c1b7434` |
| IT-S incremental patch |`1e5522c93984fcf9b418150b3753eacf3a73b06aaf56e8f5b94d618dab862550` |
| IT-S composed S011 patch |`e8768cd81ce996cd53cee4488778380b101c877a15d43028c44baee0f572be43` |
| IT-S artifact manifest |`02d8a077d0fb506a9d3155993aee4ceaacec51528271ddb721a0316ea252f813` |

Actual source annotation/provider tokens, including fully qualified JUnit annotations, yield the following identities. Independently derived native display-name multisets—including enum, ValueSource and CsvSource rows—equal the actual B1 XML case-name multisets, not just XML count attributes. Every XML path/hash and every derived case is retained in `audit.json`.

| Class | Methods preserved | Invocations in B1 | POLL / DELIBERATE before | Sleeps after |
| --- | ---: | ---: | ---: | ---: |
| GuidedBridgeIntegrationTest |10 |10 |1 /1 |0 locally |
| GuidedBridgePlannedIT |16 |16 |1 /3 |2 locally |
| Shared bridge fixture |0 |0 |moved duplicate slow navigation |1 |
| GuidedServiceTransportFaultIT |31 |39 |6 /8 |8 |
| GuidedPlanningIntegrationTest |35 |57 |1 /0 |0 |
| SecretUseAuditIT |36 |36 |1 /0 |0 |
| GuidedPublicationRaceTest |6 |13 |1 /1 |1 |
| GuidedFocusMutationJoinedIT |2 |2 |1 /1 |1 |
| GuidedEvidencePendingAppendJoinedIT |2 |2 |2 /0 |0 |

There are26 bridge and112 IT-S methods, with26 and149 respective invocations; no method or variant drop/addition was found. All26 complete bridge test bodies are token-exact after undoing only the explicit ENV ownership substitutions and direct wait expansions (including the original final helper assertion that was expanded to its call site). This proves preservation of the surrounding test assertions/actions while leaving BRIDGE-WAIT-02's runtime control-flow difference visible. All1171 ordered IT-S assertion-root argument token sequences agree after only the explicit `waited`/`waiting` local-holder binding mappings. I also read each incremental hunk; unchanged assertion chains and moved Transport fail-fast assertions retain their operators, messages and surrounding decisions. None of these static comparisons proves Java compilation or a passing native run.

B1's six IT-S XML suites sum567.388s; the two bridge suites are54.613s and161.354s. The whole B1 check failed elsewhere, so these are named inherited measurements only. They are neither a green whole-run baseline nor after timings.

## Fixture ownership and authority

The new physical `guided/bridge/support/GuidedBridgeFixture.java` intentionally declares `com.citi.put.checks.studio.guided.session`, matching both existing test declarations. Its package-private access does not require changing main packages/public APIs. Each test class constructs its own `static final ENV`; fixture fields are instance-owned. The40 moved fields cover contracts, database, paths/dist/TLS/issuer/port/application, canaries/config input, application counters/scenario flags and callback latches. The distinct temp prefixes and worker-evidence paths remain explicit constructor inputs. UUID-derived state is independently initialized for each ENV. No fixture singleton or shared test-class scenario state was introduced.

The common constructor carries the original routes, dist/hash capture, CA and key setup and exclusive free-port acquisition. The planned provider is created and started before `ENV.start()` starts application/database/migration, preserving original ordering. Planned teardown remains application→provider→database; Integration remains application→database. Per-test database isolation and existing schema migration target are retained. Both before-each methods assign the worker handle from `ENV.startWorker(...)` **before** awaiting readiness; teardown can therefore find it if readiness fails. Latch release precedes worker cleanup. The log privacy checks, no-survivor and clean-exit assertions retain their original order.

Planned source ownership/classifier/current-source access, JPA/JDBC transaction composition, SOURCE_PLAN/NEXT_ACTION provider, real planner bootstrap/reservation crash window and authentic admission route/key/bytes remain local. Integration's intentionally non-planning `FixtureAccess`, hand materialization and refusal-only admission probes remain local. No shared helper injects planner/store authority, seeds authorization rows, weakens a production access check or merges these compositions. Same-origin/CSI/application/environment/controller/worker identities stay unchanged. The Transport incremental patch composes on the already migrated GS-T authority baseline rather than reverting to hand-issued positive admissions.

The nine removed Integration methods are exactly `action`, `navigation`, `advanceRequest`, `race`, `proposalByLocator`, `refreshRequest`, `proposal`, `advance`, `operationHash`. After removing their complete exact original bodies, my independent token scan finds zero calls to any of those nine names in the remainder of that class. Class references in actual backend sources/tests are the owning declarations/Spring application references and three other files' explanatory comments; reflection searches show no bridge-helper caller or override. No test method has a helper annotation/discovery path. The closure removes three assertion starts: two in `proposalByLocator` (uniqueness and presence) and one in `proposal` (presence). They are unreachable in current S011; no reachable assertion is dropped. The author's wording about two target-presence starts should not be read as claiming only two total assertion starts in that orphan closure.

## All sleep rows and IT-S wait semantics

The bridge's six original rows are its two25ms POLL helpers, two duplicate conditional slow-navigation stimuli and Planned's100ms locked-row and200ms late-renewal negative windows. The two helper rows expand to14 direct waits. Both negative windows remain unchanged in their tests; slow navigation remains in the per-class fixture, with its interruption restoration unchanged. Current bridge tests only reset that seam to0, so no exercised latency proof is inferred.

IT-S's22 original rows classify as12 POLL and10 DELIBERATE. The latter remain: seven Transport300ms exclusion/idempotency/no-send windows; Transport20ms intentionally incomplete streaming cadence; Race1100ms expiry of the1000ms grant under the held source lock; Focus conditional slow navigation with its original interrupt handler. These are stimuli or negative observation windows, not spare polling to remove.

I inspected all12 IT-S replacement blocks, not just their author flags:

| Sites | Original evaluation order retained |
| --- | --- |
| Transport owned-row blocker |5s deadline first, then exact owned pg-blocker query/result; original error when absent |
| Transport route idle observation / cleanup |route idle first, then5s deadline; original diagnostics/final checks/cleanup catch remain |
| Transport controller stage |one initial file read; subsequent read after10ms interval, then content/deadline/child-alive guards; original final marker assertion |
| Transport teardown |condition first;20s deadline check inside body with original AssertionError |
| Transport actual stop |20s deadline first; work-failure assertion, DB/materialization/operation/route closure and final assertion retained |
| Planning / Focus / Evidence generic wait |condition before original variable deadline;25ms interval; final fresh assertion |
| Secret terminal-row lock |5s deadline first, same JDBC Lock query and final waited assertion;20ms interval |
| Race publisher-row lock |500ms deadline and waiting guard, same backend Lock query/final waiting assertion;10ms interval |
| Evidence recording |recording count before90s deadline;50ms interval; original detailed value-free final assertion |

Each uses a direct initial step, zero framework poll delay and a cached initial framework tick; the next real step occurs after the original interval. The supplied absolute `end/until/stageDeadline` is retained and atMost uses its remaining time, not a fresh whole timeout. Failure slots are intended to end polling and rethrow the original Exception/Error, but the terminal timeout interaction in ITS-WAIT-01 can re-enter an observation and must be corrected before that preservation claim is credited. The timeout-final step is otherwise shaped to retain the original guard/observation/fallthrough. All12 explicitly disable uncaught-thread interception and use `pollInSameThread`; they add no JDBC connection, transaction, worker, executor or ownership transfer. SQL lock holders/releases, transaction scopes and all enclosing finally/cleanup branches remain unchanged.

The `slept && Thread.interrupted()` check before a post-interval observation and the pre-sleep-boundary `Thread.interrupted()` check map the original sleep exception/clearing behavior into the slot. Enclosing handlers still decide whether to reinterrupt (including Transport's cleanup catch). Unlike the bridge raw waits, this detects a restored interrupt at the next ordinary step. ITS-WAIT-01 must also preserve that captured interruption as a terminal failure rather than re-entering the step after a late framework timeout. No additional IT-S source correction beyond terminal latching was identified.

**Execution qualification:** Awaitility's uninterruptible interval can defer noticing an interrupt until the next transition. The original interval is10/20/25/50ms; scheduling and a condition's own execution can add latency, so this review does not certify a hard wall-clock latency bound or exact scheduling equivalence. Before claiming preserved behavior at lane exit, bounded test-local/scratch evidence should exercise initially-true/preinterrupted behavior, false→interrupt, timeout/final-read and condition Exception/Error paths, with the caller's actual flag/cleanup mapping. This can accompany the already-required locked validation; it does not authorize a second live unit now, a new production abstraction or extended deadlines. The normal full class gates must also exercise real DB visibility, ownership and cleanup; synthetic conformance alone cannot replace them.

## Application and unexecuted gates

The actual diagnostic remains the sole root-owned source/runtime exception; this review did not edit it or infer its outcome. Exact original restoration and root T0/W1/source gates remain prerequisites. GS-T must first pass its complete five-class gate against literal unchanged S011 `src/main`; no fixture review or main-file hash census replaces that execution. F-1/GS-M(b) then retains its prescribed unchanged bridge/Planning/Replay proof. Actual GS-T2 and IT-S application begins only after GS-M(b) and exact handed-over hashes, outside that unchanged-test freeze.

There is one deliberate composed Transport baton, not permission to apply the S011 reconstruction over an incoming accepted main/test revision. Revalidate/rebase against root's runtime-accepted GS-T and GS-M(b) batons. The source list's physical Planning path differs from its actual `guided.session` package; the proposed commands correctly select the declared class. Transport, Planning, Focus and Evidence are exactly IT-S's four resolved FOLD_TESTS handoffs; Secret and Race release directly. Both bridge files hand to FOLD-final; the fixture accompanies them without acquiring a production client port. The legacy coarse six-file baton wording does not override resolved aliases.

Compile/format, full bridge/IT-S native commands, all GS-T/F1/GS-M/FOLD gates (including standalone both-task full Replay class and named clock cleanup), staged red/green/mutants where prescribed, fresh final coverage/full11-G, per-name/privacy/skip/cohort reconciliation, no-survivor checks and exact AC5 before/after timings remain open. Existing subset commands must not borrow a full-suite historical skip policy. Gate command lists in these preparations are proposals, not execution receipts or closure evidence. No test/main/build/config/contract/dependency modification beyond the reviewed off-tree scopes is approved here.
