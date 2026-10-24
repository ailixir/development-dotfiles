# Preservation maps and application conflict

OFF-TREE DRAFT. No compile, test, formatter, Gradle, Docker, provider/model call, process signal, git write or real source modification was performed. `git apply --check` is a read-only applicability check. Runtime evidence is **UNVERIFIED**, including all red/green/mutant obligations; no prep exit or QA verdict is claimed.

## v4 conflict requiring architecture ruling before application

v4 says all three old classes and beans stay compiling **and wired**, FOLD_TESTS are read-only until final, and prep exit requires the folded client/seam/DatabaseClock wiring green beside old classes. Existing production-oracle references make a production consumer switch observably non-neutral during prep:

- `ObservedGrantClockIT.java:112` spies the old `GuidedPublicationAuthorization`; `:143` records `fresh`, and `:220-242` requires that old bean's fresh event to bracket exactly two DB reads from the authorizer. Switching `ObservedReplayConfiguration` to new `DispatchAuthorization` bypasses that spy even when old bean remains registered. The unchanged assertion fails.
- `GuidedPublicationReplayIT.java:5605,:5631` stores/gets the old `ObservedValidationClient` bean. `:9194` gets the old `GuidedRunnerClient` class. Moving production consumers while keeping these beans makes observation/control diverge from the actual path. A compile-only constructor fix does not preserve these oracles.
- Original direct constructor callers in the exact FOLD_TESTS still pass old types (e.g. `GuidedSessionIT.java:1681`, `ObservedArtifactLowererTest.java:391`, many `GuidedDispatchService` callers). New constructor overloads preserve their compilation, while the old beans remain the active composition in the preservation-compatible prep draft.

`tree/` is the **preservation-compatible proposal**, with a complete new implementation/seam, new by-name tests and old/new consumer constructors. Old beans remain actively wired; both old authorization and publisher composition receive DatabaseClock. It is **not** a claim to satisfy a requirement for switching active consumers during prep. `proposed-final-wiring/` and `patches/04-PROPOSED-final-wiring-baton.patch` contain the complete three composition swaps for publisher, authorizer and guided dispatch, against the exact prep drafts. Root must obtain architecture's timing ruling; this agent does not silently defer the requirement or relax tests.

After all final batons the atomic final unit must also swap the projector, port all 21 FOLD_TESTS unchanged by name/assertion, remove old constructors/beans/classes, update the final diagnostic strings and run all specified gates. Those files are **not** changed or copied into this prep scope. The proposed wiring baton is complete for these three config switches, not a substitute for that larger final unit.

One additional v4 bookkeeping issue: this new `PublicationGrantClockIT` deliberately compiles against pre-fold main to permit a real assertion red and uses the old authority as fallback until the new authority exists. Final deletion of the old class requires removing that fallback/field in this new test. It is in prep's three tests but absent from v4 final's enumerated writes. Root should authorize that mechanical final test cleanup explicitly before deleting the old class. No permission or lifecycle change is inferred here.

## Operation transport map

| Operation | Before and drafted endpoint | Credential | Connect timeout | HTTP version |
|---|---|---|---|---|
| Dispatch/cancel | `StudioRunnerProperties` base-url `/v2/runs` and `/v2/runs/{id}` | `runner.serviceIdentityToken()` | `execution.admissionTimeoutOrDefault()` | JDK builder default (HTTP_2 preference) |
| Validation | base-url `/v2/validate-observed` | `runner.serviceIdentityToken()` | `runner.connectTimeout()` or 2s | HTTP_1_1 |
| Guided assign/context/prepare/dispatch/stop/observe | **runner-origin** `/internal/v2/studio/guided-sessions/{id}/{operation}` | controller-token-file supplier, freshly read per call | 5s | HTTP_1_1 |

All redirect policies stay NEVER; no automatic retry is introduced. Dispatch request timeout remains admissionTimeoutOrDefault. Validation timeout remains min(PublicationBudget.remaining(), per-call validationTimeoutMs); payload cap is per-call maxValidationBytes and response cap remains 65536 (read at most 65537). Guided uses the same 15s monotonic deadline narrowed by caller deadline; 1MiB accepted/4096-byte context-refusal response bounds and the owned-body/response zeroing are carried over. Existing retry-property refusal remains. Validation origin shape checks remain closed. Endpoint names, trust roots, service/control credentials and scopes are not merged.

All clients use the same StudioRunnerTls material. Dispatch/validation retain configure(builder); guided retains its prior `sslContext(tls.sslContext())` constructor behavior exactly, preserving its original JDK protocol/hostname defaults rather than adding a new TLS behavior change. TLS settings, CA/key/password handling, deny-all fallback, profile-dependent startup enforcement, connector identity checks and `runner.validate(environment)` stay byte-identical. Only the redundant shape-only `runner.validate()` marker configuration is removed.

## Serializer and constructor map

`SecretValue.Writer` remains the sole `JsonSerializer<SecretValue>` implementation; `SecretWireWriter.bytes` retains its opt-in mapper-copy registration. No secret serializer is added to the folded client. Two existing secret-bearing transport call sites now call the same helper within one client class. `SecretValue` and `SecretWireWriter` are outside write scope and unchanged. Guided map/envelope assembly and dispatch observed metadata remain distinct wire documents; body bytes and ephemeral SecretValue arrays retain their ownership/erasure paths. No body/log/cause exposure is introduced.

Existing public constructors `HttpRunnerDispatchClient(ObjectMapper, StudioExecutionProperties, StudioRunnerProperties)` and the 4arg TLS variant retain exact signatures; request-byte observation remains package-private. A new explicit 7arg constructor supports guided test setup. Public refusal constants and definite/closed context classification helpers keep their names/values/visibility. Existing native/original test methods are retained. Final test-only DispatchTestAccess is not added during prep.

Consumer compatibility constructors use private functional method references so the full operation body stays singular; they are temporary through final. Default fail-closed publication methods on DispatchAuthorization preserve its existing one-abstract-method shape for existing test lambdas/doubles while ProvisionalDispatchAuthorization supplies the real collaborator delegation. This compatibility choice also awaits architect review.

## Profile and protected-surface map

PublicationGrantAuthority is registered by existing `@Profile("!worker")` configuration only. ProvisionalDispatchAuthorization remains unconditional and takes a lazy ObjectProvider through setter injection; absent collaborator refuses each of fresh/authorizePublication/authorizeReceiptRead with 409 RUNTIME_INCOMPATIBLE before Core access. The extra worker case tests all three refusals. Worker does not receive GuidedPublicationProperties via HttpRunnerDispatchClient; validation bounds are per call. Existing worker-context and ReplayIT worker gates remain required, untouched and unverified.

Absent runner-origin uses the same `https://unconfigured.invalid` sentinel and 409 throwing token supplier as the old fallback, preserving contract/id validation order before the credential refusal. runner base-url does not enable guided transport. Existing old guided conditional and fallback beans remain wired until the architecture-approved final swap.

T0-DEV's protected-surface intersection is inherited as a preservation obligation, **not** interpreted as zero: 127 co-located protected entries overall. CFK18 TLS inputs, CFC01 worker/main profile semantics, RTP16..21 routes/results, all existing config keys, and runner-origin versus base-url must survive. Read-only original `t0/early/T0-DEV/live-surface-judgments.json` remains the exact inherited intersection authority; this package does not delete any protected entry or claim a post-change functional proof.

## Clock and builder map

Authority mint and judge both receive the same new DatabaseClock(jdbc); publisher receives DatabaseClock for claim and PublicationBudget, without TTL/window/tolerance changes. DatabaseClock itself and every migration remain unchanged. The new ClockIT compiles before the new class exists, so red-first can fail an assertion on old JVM-clock wiring rather than fail compilation. It pins exact DB read count/value at mint/judge, the actual claim argument to the latest DB reading and the actual validator budget's DatabaseClock/remaining arithmetic. Injectable application Clock offsets model ahead/behind; the test explicitly discloses that a literal systemUTC regression is caught by the DB-read/timestamp oracles, not by magically altering the host OS clock. Real execution must still prove the fixture and reflective validator instrumentation work.

ObservedReplayBindingBuilder is package-private and preserves the exact common field construction. Manual authorization retains Core freshness before all clock/pins work. Scheduled authorization retains expiry checking before UUID/scope/pins; manual retains its previous check after supported/profile selection. A private build argument preserves that observable ordering; both use the same injected Clock, TTL, schema and Prepared bounded-copy behavior. No secret resolution moves into binding creation.

## Application and proof sequence

1. Revalidate source hashes and root tree-open; complete B1/B7 and literal unchanged-main GS-T green before **any** real main write.
2. Apply only `01-red-first-clock.patch`, compile/run PublicationGrantClockIT through the approved collector/lock, and require assertion red from old JVM-clock wiring. No-tests, missing Docker, dependency or compile errors do not qualify.
3. Resolve the composition conflict above with architect/root. Apply the approved prep main/test unit atomically under lock; compile-clean before release. `03-prep-tests.patch` excludes ClockIT already added by step 2.
4. Run v4 foldp-01/02/03 unchanged. Preserve JobBodyLeakTest, constructors, TLS/profile/schedule/native oracles and old beans. Record counts and exact digest; lane results remain non-evidentiary under R-T0-4 except explicitly credited windows.
5. Apply each m1..m5 mutation individually under one lock hold, run named subject, require assertion red, restore pre-mutation SHA and compile-clean tree. Mutants supplied here are drafts, not executed evidence.
6. After final batons, apply architecture-approved three-config wiring baton together with complete final swaps/deletions/cleanup; run all final gates, grep the three old type names and serializer inventory, and reconcile method names/counts.

No gate or lifecycle state is advanced by this package.
