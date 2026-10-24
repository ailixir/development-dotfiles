# C8 check01 source liveness audit

Aria, source-only, 2026-10-19. **The supplied ~9-minute event silence is consistent with an intentional allowed wait in the next ordered default-profile case. It does not prove that wait is active, nor prove progress, deadlock, a timeout or terminality. No diagnostic or intervention is warranted by this silence alone.** The complete case/class/task duration cannot be bounded from the inspected source.

The exact typed PUBLIC snapshot13196a33 at13:43:15.892012Z has the same last public line3785 as13:34:33.974638Z: an observed interval of521.917374seconds, about8m42s. It reports25 PASSED/one FAILED class markers, with last method actualCoreOrdinaryRevocationStopsAtNextAuthorityCheckWithinTwoSeconds. These are partial result events, not completed XML/catalog counts. No changing log/body, runtime state, thread, private location or OS fact was inspected. Actual foreground remains SAME supplied hold19501/45226/45227 and outcome UNKNOWN; sticky ownership gap/old-route HOLD remain.

## Conditional next work, not a current frame observation

Frozen ReplayIT hash `b8b10df42b739d07d1abbd70ae1e54488f8a7587058a488e268445a396ac2475` uses SAME_THREAD, PER_CLASS and MethodOrderer.OrderAnnotation. Last named method has @Order25. The next distinct eligible default method is @Order26, actualCommittedSecretProgressSurvivesOwnedChildAndParentCrashThenRunningReaper, which calls p3Case(this::p6CommittedChildCut). Although @Order27/28 declarations appear later physically, annotations determine their later order;29 follows them. The exact catalog maps both25 and26 to task test. The next26 method is an ordinary @Test, not a parameterized variant.

Therefore the natural source-order hypothesis after the last event is execution/setup/cleanup of26. It remains conditional: the snapshot contains result markers only, not a STARTED/current-test event, active stack, actual accepted deadline or confirmation of fixture phase. Hooks, asynchronous background work, later source work or task/framework processing can be silent. A marker does not establish that the currently active Java thread is at p6WaitOriginalDeadline.

The Gradle configuration logs only passed/skipped/failed events. A long successful body can emit no new method-result line until it finishes. Normal test uses original4000 fixture profile; incremental task uses incremental2048 and mustRunAfter test/cross/retention. The closed profile numbers4000/2048 are model-output token ceilings, selected once before fixture initialization, not time or heap limits. Test JVM -Xmx1g is a separate heap setting (1024MiB); occurrences of1024 in source also include byte bounds/RSA settings and are not a per-test duration. forkEvery12 normally and1 for incremental controls worker reuse, not a seconds/minutes deadline. No maxParallelForks claim or memory-pressure diagnosis follows from those settings.

## Concrete allowed long wait

p6CommittedChildCut:21357–21378 asserts the unchanged production runDeadlineOrDefault is at most600seconds, creates/learns/publishes a source, then starts a real ordinary execution. It waits for genuine positive progress, performs its intended owned child/parent crash test and invokes the running reaper. The source deliberately first asserts the ledger still RUNNING, then calls p6WaitOriginalDeadline, verifies no authentic final manifest, and reaps again after the ORIGINAL accepted deadline.

p6WaitOriginalDeadline:21665–21676 reads run_deadline_at from the original owner row. It asserts remaining<=620000ms and, while Instant.now is before that deadline, sleeps for between1 and1000ms. This loop has no public method-progress output. The production configuration and StudioExecutionProperties default are600seconds; the case checks its effective property<=600, while the helper's620-second remaining assertion is an additional case-budget check. Neither600 nor620 is a timeout attached to the whole JUnit method. The method does not invent an earlier reaper deadline or reduce the original one for speed.

521.917seconds is below both600 and620seconds. A run that entered this intended wait shortly after the last marker could therefore legitimately remain silent throughout the observed interval. This is a source consistency witness, not evidence that the runtime deadline is600 or that execution has actually reached that wait. No absolute deadline can be calculated from the last method marker: the ordinary run is admitted later, after preceding work, and its actual timestamp was not read. System clock behavior and synchronous work also prevent turning the wall-clock loop into a hard end-to-end monotonic bound.

## Local bounds and their limits

quoted-bounds.json preserves24 exact source ranges/hashes. These local limits have different scopes and must not be added into a fabricated total:

| Scope | Configured/source limit | Why it is not a whole-run deadline |
| --- | --- | --- |
| Positive child progress / sign-in entry |30s /10s latch awaits | Precede original-deadline wait and other synchronous work |
| Parent wait / child-process polls / sign-in exit |10s per specified wait; process state tools use5s with their own cleanup | Multiple operations/recorded members; actual phase unknown; outer poll limits are checked between blocking operations |
| Guided learning finalizing |90s loop, checking state via JDBC/session row lock | Time is checked between synchronous query/transaction calls |
| Guided per-session teardown |20s poll | Each row-lock read can block; multiple owned sessions may be handled |
| Ordinary per-case cleanup | Shared60s monotonic budget; each cleanup request min(15s,remaining) with rate retry constraints | Does not include every guided/session/file/producer operation, and is not the case body deadline |
| Ordinary P3 route HTTP |15s request timeout | Per request only; does not bound JDBC/model/cleanup/other helpers or every transport phase globally |
| Controlled gateway | Source configuration default150s; transport connect/read/write/call use that property | One model call, not the natural ordinary run deadline or aggregate case time; effective runtime property not inspected |
| Worker readiness |20s normal roles,10s secret role | Before/after process start/registration and filesystem work; not global test time |
| Registered process stop | Guided grace65s or other30s, then5s forced-stop observation in the fixture's existing implementation | This audit authorizes none of its signals; multiple resources and surrounding operations remain |
| Class-owned jobs/context teardown | Shared90s executor drain, separate90s context-close Future,5s closer termination | Class-final teardown, not this method's established current phase; source explicitly excludes process-stop/final-scan time from the context-close budget |

The case's own existing fault and cleanup code contains signals as test semantics. Merely reading it grants root no additional signal/kill/abort authority against this live attempt or inherited resources. No part of this audit executes those operations.

## Why no proved aggregate upper bound exists

No @Timeout annotation exists in the inspected Replay class. No explicit Test-task timeout assignment/setTimeout appears in frozen build.gradle.kts; the frozen source inventory has no junit-platform.properties. This is a bounded static search, not inspection of runtime JVM/env/system properties or a universal assertion about all framework defaults. spring.test.context cache sizes and Hikari idle-timeout10000 concern resource retention, not a query/test deadline.

Several directly used paths perform synchronous JDBC work (p6Owner, p6Usage, source creation/publication, sessions.transaction→SELECT FOR UPDATE) without a statement/transaction timeout specified at those call sites. A timed outer polling loop cannot interrupt a blocking inner JDBC query merely by checking its clock afterward. Filesystem operations and process startup/registration also have no enclosing finite case deadline. The common publicCall helper has synchronous HttpClient.send with no request timeout on that builder, unlike p3Call15s. The fixture command helper reads a process stream with readAllBytes BEFORE its30s waitFor; that later timed wait does not bound the prior read. These source examples identify missing aggregate guarantees, not a diagnosis of the active method or proof that a particular operation is hung.

Likewise, per-child p6AwaitProcesses uses a10s deadline checked around work; its body may invoke state probes with their own waits. The original-wall-clock deadline wait cannot alone bound all setup, database, native, cleanup and JUnit/class/framework processing. Neither9minutes nor620seconds from a public result event is consequently a proved timeout for this full method/class/task.

## Minimal next observation and non-authority

No new intrusive observation is needed merely to explain this snapshot: the source provides a concrete intended silent interval long enough to cover it. Root can continue the existing authorized foreground observation without a new artificial timer or automatic cancellation. If an ordinary new method-result/prompt/terminal record arrives, an existing bounded typed PUBLIC method/status snapshot can distinguish natural advancement from the same prefix; preserve original counts as partial until complete collection. This audit creates no new monitor process or observation command.

If a later separately documented observation remains inconclusive, source alone still cannot prove deadlock or select an owned target. A future minimal fixed-source-frame liveness sample would require its own exact architecture/QA/root proposal, actual verified target PID/start/parent/argv/executable and SAME-holder/kernel/resource facts, one bounded client, protected raw custody/no body export and finite no-message projection; no repeated attach or target signal could be inferred. Such a proposal is not requested by the present~9minute evidence, is not implemented or released here, and cannot borrow old GST diagnostic permissions. Any stop/abort/recovery would need its own distinct actual disposition after fresh facts; a liveness sample would not authorize it or repair the ownership gap.

All source hashes inspected match their accepted plan entries. Catalog/source/config hash bindings and exact static-search results are in input-pins.json. Acceptedf9c/main506/Replay/timers/oracles, all current native/lock/ownership flags, closed privatec212 scope, C8/generalW1/IR/lane/lifecycle holds remain. No new call, diagnostic, compilation, gate/readiness/permit, source lease, IR clock, credit or implementation authority is granted.

Only this new directory was written. Applied aiox-architect; SAFE011 review/USD500, aggregate spend unknown. Safe explicit typed snapshot and source/config/catalog/plan/hash/document reasoning only. No changing native/public-log/runtime/private/report/XML/exec/JAR/thread/binary/TEMP/journal body read/stat/hash, private locator search, OS/census/lock/process/signal/helper/main/gate/keeper/producer/assessor/Gradle/Java/Node/Helm/native/compiler/source capture/apply/network/provider/Git or delegation action occurred. Source literals naming fixture files are ordinary code, not searched runtime evidence locations. Actual current phase and native outcome remain UNKNOWN.
