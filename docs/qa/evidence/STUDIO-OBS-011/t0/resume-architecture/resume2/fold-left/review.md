# FOLD and LEFT — architecture and ownership rulings

Aria / aiox-architect, 2026-10-19. **The FOLD drafts require two corrections before application.** The preparation/final wiring order and exact four-match V20 exception are supported as bounded plan rulings below. This is static design advice, not W1 permission, compile/runtime evidence, lane exit, a QA verdict or story closure. No source, draft-author implementation, plan, story, migration, compiler/build/Helm/Docker/provider/process or Git state was modified; writes are confined to this fold-left review directory.

Reviewed current root state, v6/v5/v4 plan/brief inheritance, actual story AC-4/CLN-F2, complete CHECKPOINT/DESIGN/PRESERVATION-AND-CONFLICT artifacts, both 17-main/3-test sets, transport/authority/clock/binding changes, new tests and five mutants, Dara's reconciliation and actual V20 fixture, and LEFT-main's combined assembly proof. Inputs and independent checks are bound in `independent-static.json`. Both baselines are terminal; general application remains root-held, with unchanged-main GS-T still preceding every real main unit. v5/v6 only amend frontend ownership; they do not already resolve FOLD or historical grep.

## Mandatory corrections in both FOLD draft sets

**FOLD-PREP-1 — preserve runner overload invocation, not only constructor compatibility.** The new `GuidedDispatchService` private Send adapter has only the four-argument method. Its two-argument helper generates a key; its three-argument helper calls four-argument `sender.send(..., null)`. An old-runner constructor's `runner::send` therefore always binds the four-argument overload. This changes observable behavior of untouched FOLD_TESTS:

- `GuidedDispatchStopKeyTest:50,73` verifies original three-argument stop calls and captures bodies/keys; the draft instead invokes four arguments.
- `GuidedDispatchContextDeadlineTest:63` requires original two-argument unkeyed context push and forbids a caller-deadline call. The draft invokes four arguments. Its keyed case at47–52 must still use four arguments.

These are real preserved native/identity/deadline oracles, not obsolete mock inconvenience. Do not edit assertions, rewrite their mocks or port FOLD_TESTS early to hide the change. Correct the compatibility forwarding within the owned `GuidedDispatchService` draft: retain distinct two-, three- and four-argument operation forwarding (for example, separate private functional slots/adapters with the exact arities), and bind each to the matching original/folded-client overload. The original call sites must invoke their original overload with unchanged key/deadline behavior; preserve secret-send forwarding as well. Both constructors must feed one dispatch/admission/consume algorithm. Do not infer original call arity merely from whether an argument happens to be null. Rebase/regenerate both sets, all patches and affected hashes after author correction. Before prep exit, run the **unchanged** GuidedDispatchStopKeyTest and GuidedDispatchContextDeadlineTest as targeted regression subjects in addition to the existing foldp gates (same collector/lock, fresh label). This adds read-only verification of the discovered defect, not early test-port ownership.

**FOLD-PREP-2 — supply the new clock test's real authorized fixture scope.** `PublicationGrantClockIT.properties` only calls `ObservedPublicationFixture.register`, which registers three observed-replay properties. Its new publisher subject reaches `GuidedPlanPublisher.captureLoweringInput -> access.checkCurrent -> GuidedProductionSessionAccess -> GuidedSourceClassifier.requireCurrentPolicy`. Actual `GuidedTranslationProperties` defaults applications/environments to empty lists; current `application-test.yml` supplies neither. The synthetic fixture application is `studio-fixture` and the test chooses `ObservedPublicationFixture.ENVIRONMENTS.getFirst()` (Production). The subject therefore refuses FORBIDDEN_SCOPE before the intended claim/validator-budget boundary.

Add only this new test's explicit `studio.guided-authoring.translation.applications=ObservedPublicationFixture.APPLICATION` and exact selected environment (or the existing fixture ENVIRONMENTS list) to its DynamicPropertyRegistry, preserving real checks. Do not stub/disable current-policy authorization or widen production defaults. This setup must be present in the red-first clock patch and both full test copies. A policy/setup refusal cannot earn the intended R9 assertion-red or green.

No other definite semantic correction was identified by this static review. Java/API/mock/reflection/profile/timing compatibility still requires actual compilation and runtime gates after these corrections.

## FOLD-ORDER-1 — explicit prep/final composition ruling

**Preservation-compatible prep is the correct application phase. The three active-consumer swaps belong to final.** The plan explicitly requires all old classes **and their active beans** to remain wired and FOLD_TESTS untouched until final. Reading prep's “wiring green beside old classes” as an early switch of production consumers conflicts with that explicit preservation rule. This ruling resolves the ambiguity; root should record it in the adopted plan/exit before any application, rather than let an author silently defer a requirement.

Prep must install/compile the complete folded client and new authorization collaborator/seam, put DatabaseClock on both retained/new authority compositions and publisher claim/budget, centralize binding construction, preserve old constructor/wiring behavior and prove the new surfaces through the three owned test files plus all existing prep gates. Both old and new code must be real, reachable implementations with fail-closed boundaries; “it compiles” alone is insufficient. Production authorizer/publisher/guided-dispatch consumers remain on old beans during prep. This is an explicitly bounded transition phase, not completion of the single-path end state or permission to retain a compatibility layer at story exit.

The current `tree/` is the appropriate phase after the two corrections. Its `proposed-final-wiring/` alternative differs at exactly three configuration files, independently verified:

1. GuidedPublicationConfiguration publisher: old validator/authority -> folded HttpRunnerDispatchClient / DispatchAuthorization.
2. ObservedReplayConfiguration authorizer: old authority -> DispatchAuthorization.
3. GuidedSessionConfiguration dispatch service: old GuidedRunnerClient -> folded client.

Do **not** apply `04-PROPOSED-final-wiring-baton.patch` during prep. Leaving old beans merely registered is insufficient if unchanged spies no longer observe active calls: `ObservedGrantClockIT`'s old-authority `fresh` spy brackets two real DB reads, ReplayIT's B3 probe obtains the old validator bean, and its controller probe obtains the old guided client. Those controls retain their original meanings until their final ports. The overload correction is additionally required even with the old beans actively wired.

Final remains one complete compile-clean ownership unit after all current GS-M/IT-R/IT-S/GS-T2 batons: port the exact21 FOLD_TESTS by name with their assertions/physical read/post/consumption/cleanup controls intact; port projector from its accepted GS-M implementation; apply the three consumer configuration swaps; retire old constructor plumbing/beans/classes; add only test-side DispatchTestAccess for the package-private observer; update exact diagnostic class-name strings; then run all final gates, old-type grep and serializer inventory. The three-config baton alone is not a final deliverable. No final native/worker/TLS/scheduled/ReplayIT/coverage obligation is dropped or moved beyond story completion.

**Clock-test final baton:** support root explicitly adding `backend/src/test/java/com/citi/put/checks/studio/guided/publication/PublicationGrantClockIT.java` to the final write list solely to remove its red-first old-authority fallback, old injected field/import and old-type references. After the new authority exists, `authority()` can select the new registered bean directly. Keep all three method names, exact DB read/timestamp/claim/budget assertions and scope setup. Bind the corrected prep hash at handover; do this cleanup in the same final unit that deletes the old authority. This bounded test-only amendment is necessary for the required old-class deletion, and is not permission to weaken or drop the new clock test.

Application sequence remains: root baseline disposition/tree-open -> complete literal unchanged-main GS-T proof -> corrected clock test alone and genuine old-clock assertion-red -> corrected prep main/tests as one lock-held compile-clean unit -> foldp01/02/03 and all five independent red/restore/green mutants -> prep evidence/owned batons -> complete final atomic unit and foldf01–04 plus conditional coverage/final11-G obligations. No source snapshot may be reverted to an obsolete draft preimage; rebase/review after authorized predecessors.

## Transport, authority, clock and binding preservation

The folded client preserves distinct transport settings within one implementation class. Dispatch/cancel retain base-url `/v2/runs[/id]`, runner service token, admission timeout and JDK default HTTP version. Validation retains base-url `/v2/validate-observed`, service token, runner connectTimeout/default2s, HTTP_1_1, min(budget.remaining, per-call validationTimeoutMs), per-call request cap and65536 response cap. Guided retains runner-origin, fresh controller-token-file supplier,5s connect/HTTP_1_1,15s monotonic ceiling narrowed by caller deadline, transactional refusal, one-MiB accepted/context-refusal4096 bounds and owned request/response erasure. Endpoint/identity/budget settings must not be merged just because the implementation is shared.

The builder is reused only after each HttpClient is built, so its later validation timeout/version settings do not mutate the already built dispatch client. Dispatch/validation still use StudioRunnerTls.configure; guided intentionally retains its exact previous sslContext-only constructor behavior. Redirects remain NEVER and no retry is added. TLS executable settings/CA/key/hostname/protocol/startup/profile enforcement remain unchanged except the stated Javadoc; the shape-only runner.validate marker is removed while real profile-aware `runner.validate(environment)` stays. No missing runner-origin borrows base-url. The fallback sentinel/token refusal preserves original contract/id checks before credential refusal.

Existing3/4-argument dispatch-client constructors, refusal constants and package-private request byte observer remain. The7-argument constructor is explicit test setup, not a new global option. SecretValue.Writer remains the one serializer implementation and SecretWireWriter.bytes its opt-in registration; the folded transport delegates both secret-bearing operations to it and retains separate wire envelopes/erasure ownership. No default mapper registration, secret logging or new config key is introduced.

PublicationGrantAuthority's entire method sequence from `fresh` onward is independently byte-identical to the existing authority's methods. It is registered only under existing !worker publication configuration. ProvisionalDispatchAuthorization remains unconditional with lazy ObjectProvider setter; absence of the collaborator refuses fresh/publication/receipt with409 RUNTIME_INCOMPATIBLE before Core. Interface defaults preserve existing one-abstract-method doubles while failing closed for new operations; they do not supply permissive authority. The folded client does not inject !worker GuidedPublicationProperties into the worker graph; validation bounds are per-call. Worker profile/runtime gates remain mandatory even though the source wiring is plausible.

ObservedReplayBindingBuilder is package-private. It retains field/value/member ordering, scope principal/hash, policy/profile/build hashes, exact millisecond times, UUID allocation, schema validation and bounded Prepared copy. Manual freshness remains before clock/pins work; manual expiry check remains after pins, while scheduled check stays before UUID/scope/pins via its private branch. Both use the existing injected clock, TTL and no secret resolution. No new grant path is authorized.

DatabaseClock itself is untouched. Both new and retained authority compositions receive it; publisher gets it for the exact claim argument and actual PublicationBudget. The new test's read-count/timestamp assertions detect literal systemUTC mutants independently of its injectable application skew; it does not alter the host clock. Its old-authority fallback permits pre-main compilation and assertion-red; final removes that fallback only after porting as described. Reflective interception of the private validator field, Mockito compatibility, actual fixture finalization and transaction behavior remain runtime risks, not proven results.

Independent in-memory reconstruction proves01 red-test +02 prep-main +03 prep-tests produces all20 complete prep files, and04 produces all20 complete alternative files. All20 current preimages match the draft manifest. All five mutant patches yield their exact declared hashes. The author's16 existing client-body and7 existing authority-body preservation checks were inspected. These static facts do not prove preservation of mock overload invocation; FOLD-PREP-1 demonstrates why runtime/semantic inspection is also required. The proposed m1/m2/m3/m4 mutants separately change mint/judge/claim/budget clocks; m5 removes absent-collaborator refusal and must be killed by all-three-operation worker negative control. No timer/tolerance/window or assertion may be relaxed if any mutant survives.

## LEFT-V20-1 — exact exception supported, no sixth-path rename required

**Support Dara/root explicitly retaining the four exact private V20 helper matches.** They are not V18 adapter remnants. No separately owned name-only change to the V20 fixture is architecturally required. Renaming them solely to satisfy a broad word count would add an unnecessary source path and could obscure the existing V20 upgrade oracle. This exception does not keep any V18 writer or weaken CLN-F2's original `HistoricalV18|requireV18 ->0` requirement.

Actual retained path: `backend/src/test/java/com/citi/put/checks/studio/support/LegacyV20ConfirmedBaseFixture.java`.

Required unchanged whole-file SHA256: **`0f60fabce9dab238203682de49a031a8ec103e4ac18b1694375059f20ab312df`**.

Exact retained match multiset (path above, matching line text including whitespace retained in JSON):

| Line | Text |
|---|---|
|1296|`verifyHistoricalVerdict(a, a.verdict());`|
|1309|`verifyHistoricalCandidate(commit.snapshot(), candidate, a.verdict());`|
|1489|`private static void verifyHistoricalCandidate(`|
|1561|`private static void verifyHistoricalVerdict(PublicationContracts.Attempt a, JsonNode v) {`|

The two names are private checker definitions and their one call each within `commitHistoricalV20`. Actual fixture preparation targets Flyway20 at75 and calls requireV20; seedV20/seedV20Cases reach seedPreparedV20 and that V20 commit at659, which calls requireV20 again at1200. Candidate recomputation/hash/shape and verdict claim/snapshot/profile/build checks remain. This is the current source's established **synthetic V20 history/upgrade fixture**, not a claim of current runtime execution. ReplayIT actively imports its seed/assertPreservedAtHead paths. Retiring this independently exercised V20 compatibility oracle is outside V18 retirement and is not allowed by this ruling.

Keep the original broad matcher unchanged and publish its actual result, rather than relabel it zero:

`HistoricalV18|requireV18|historicalV18|HistoricalFault|probeHistoricalAdapter|changedHistoricalCommand|historicalRows|verifyHistorical|readHistoricalV18|historical-v18`

Independent current-source scan confirms78 matching lines; Dara's exact five-path conceptual overlay produces4. Every one must equal the bound multiset above; require zero broad matches at every other path. Reject any extra match, missing/duplicated allowed match, moved line, different statement/path/symbol or changed retained-file hash. A different legitimate future preimage requires fresh ownership/review, never an expanded regex exclusion.

Additionally enforce the V18-specific matcher everywhere, **including the retained V20 file**, with no exceptions:

`HistoricalV18|requireV18|historicalV18|HistoricalFault|probeHistoricalAdapter|changedHistoricalCommand|historicalRows|readHistoricalV18|historical-v18`

Independent counts are70 at current source and0 in the five-path overlay. The narrower original story matcher must likewise be0. These are conceptual overlay facts until actual application; run the unchanged literal commands again on assembled HEAD and bind their results. Root should record78→4 with four reviewed exclusions, and70→0 V18-specific, preserving the earlier unresolved broad-zero history. Do not report broad-zero as passed. This is a precise plan/checker disposition, not a waiver of named ports, mutation/green proofs or required @data-engineer co-sign/QA reconciliation.

## LEFT assembly and ownership

Independently verified11 non-data paths and5 Dara paths form exactly16 unique paths, with zero overlap between their sets and zero overlap with the17/3 FOLD prep set. LEFT-main's combined read-only applicability, constructor enumeration and atomic assembly proof were inspected. Its27 positional constructions/retained record arities, exact edit replay, YAML leaf isolation, current coverage floors/task wiring and existing test inventory remain unexecuted preservation evidence. No FOLD or V20 extra path needs to be added to that16-path assembly by this ruling.

After root gates and data co-sign/grep disposition, bind all16 current preimages and apply both LEFT patches as one compile-clean lock hold; no half unit may reach another compiler. Formatting is only over owned changed paths with renewed preservation/hash proof. Dara's named retirement/port table and P1/P2/P3/J1/J2 mutants/greens remain required; the V20 exception does not close them. Final complete executed-task/coverage obligations are unaffected. No lane exit is supported from these static patches alone.
