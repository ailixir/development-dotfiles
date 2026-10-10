# OBS-006 delayed target acquisition amendment

Status: implementation design for narrow independent review. OBS-006 remains InProgress; this is not a QA verdict or permission to edit frozen runner bytes. Resolves DELAY-001–004 in `.ai/STUDIO-OBS-006-delayed-state-review.json`, completing consensus §§7/11 and existing AC-5/7. Preserve the synchronous joined PASS, earlier asynchronous failure, and all original manifests.

## 1. Boundary and actual limits

Wait only **before selecting/invoking the next already-admitted semantic operation**. A passive observation is not another action admission, assertion attempt, read capture, model proposal or dispatch. Once the retained target is selected, failed revalidation is terminal. Once invocation begins, it can never return to acquisition. No hidden replay, locator fallback, binding resampling, assertion retry, model WAIT variant, public DTO, migration or new account port.

Actual collector ceilings remain 500 exported nodes, depth8, 32768 UTF-8 bytes, 50ms collection work, 4096 traversed elements and work depth64 (`observationSanitizer.ts`). Actual guided session defaults are 400 observations, 1,048,576 cumulative sanitized evidence bytes, 600 seconds, 200 actions, 100 model proposals, 128000/32000 reserved model input/output tokens (`GuidedSessionProperties`). Persisted per-session limits may be tighter and always win. `TestConfiguration.timeoutSeconds` is 1..120, default30; it is not currently in the immutable translation manifest. Do not invent a manifest timeout or change its historical hash.

Replay constants, compiled into the observed executor only:

- Minimum delay before first additional collection100ms, each later additional collection250ms; no tight retry or catch-and-retry of arbitrary exceptions.
- At most32 **additional** collections per source step,200 additional per run,400 total per run, and13,107,200 total returned observation bytes (400×32768). One initial collection per operation remains charged to the total; the200-operation cap remains unchanged. Reserve one collection and32768 bytes before collection, settle to actual `ObservationExport.bytes`, retain the reservation on unknown/failed collection. No negative/refunded duplicate reservation. No aggregate observation retention beyond the current collector snapshot.
- Each collection retains all existing per-collection work limits. Probe reuses that collection with no second DOM discovery or business binding capture. It may repeat only the existing bounded private field/style-signature freshness checks on the retained inventory; those private bytes are not binding captures. It reads no new raw source and does not increment an operation counter. Deadline/count/byte exhaustion before invocation gives definite TIMEOUT; unsupported/unknown coverage is refusal, not a larger budget.

Guided readiness uses the same32-per-step/200-per-session additional-refresh ceilings but also every existing session observation/evidence limit. The1MiB session evidence ceiling is **not** raised to replay's derived upper bound. Observation callbacks charge existing counters exactly once; readiness counters account for extra refresh intentions and are not a replacement observation ledger. Provider usage/reservation/late-usage reconciliation remains unchanged.

## 2. Private collector classification

Add a local-only method to `ObservationSession`, implemented by `createBrowserObservationSession` and the fixed isolated collector. No dynamic function/program/selector, page-installed hook, IPC/model field or hidden text crosses this boundary:

```ts
type AcquisitionResult =
  | { kind: 'READY'; target: ObservedTarget }
  | { kind: 'ABSENT' }
  | { kind: 'VISIBILITY_PENDING' }
  | { kind: 'REFUSED'; code: 'TARGET_DRIFT' | 'READ_REFUSED' | 'POLICY_REFUSED' };
interface AcquisitionRequest {
  documentId: string; generation: number; origin: string;
  locator: LocatorHint; expected: Extract<Guard['target'], {kind:'element'}>;
  operation: ReplayAction['operation'];
}
// Optional on the shared interface for unchanged legacy/guided implementations;
// mandatory and startup-checked for the observed replay adapter.
acquire?(request: AcquisitionRequest): Promise<AcquisitionResult>;
```

`READY.target` must identify an **already exported**, eligible node of the exact last observation; it contains no alternative locator/name/value. Browser wrapper validates the closed result and original navigation/document/generation before returning. The request contains only frozen guard/operation metadata, never resolved input or capture value.

Refactor the collector's private eligibility analysis into separate visibility-only and hard-denial facts, while preserving the old public `eligibleSource` boolean as their conjunction. Existing exported nodes/permissions/names/read rules must remain byte-equivalent on unchanged fixtures. Keep private candidate records for the same existing bounded exact locator universe, including hidden/withheld competitors; never treat `o.nodes.length===0`, `coverage.complete=false`, or failed `matches()` as proof of absence.

- **REFUSED:** incomplete/truncated work universe, invalidated document/inventory/styles, unsupported or ambiguous exact name/label resolution, more than one exact candidate (including a hidden competitor), wrong origin/role/native element/control subtype, incompatible disabled/readonly state, classification/read-rule/policy conflict, sensitive ancestry/descendant/name source or an uncertainty that could hide a matching candidate. Exact same-origin and operation-specific compatibility from C12 still apply. General `actionable=true` is not required for assertions/text reads.
- **ABSENT:** no exact candidate in a complete, current, bounded universe, with no unresolved/sensitive/unsupported candidate that could match the frozen locator. Unrelated hard-denied surfaces may be excluded only using existing safe structural identity facts; if exclusion cannot be proved, REFUSED. Never inspect new raw text/value sources to prove exclusion.
- **VISIBILITY_PENDING:** exactly one private candidate can be identified using the existing exact semantic subset, all nonvisibility eligibility/type/policy facts are proved, and its only exclusion is `hidden`/`aria-hidden`/display/visibility. Known sensitive or unsupported content is never visibility-only. A hidden native input type remains hard denial. Relationships through hidden labels or otherwise unresolved names are REFUSED, not speculatively repaired. This classification exports only its enum, no node/value/text. For a hidden candidate whose prospective read grant/region cannot be proved without widening existing read permission, REFUSED.
- **READY:** exactly one exported node and the full frozen guard/read policy match. The adapter immediately calls existing `matches` and `validateInvocation`; failure after acquisition is terminal. No collection is used to replace that retained target.

Visibility changes may produce a fresh observation generation during acquisition. They confer no authority until READY and current retained-node checks. Cache readiness/name/type/hard-denial/visibility/policy facts during the same existing bounded collection. Private probes evaluate cached facts and may reuse existing bounded retained field/style-signature checks (including snapshotField value/selected-option signatures); they perform no second discovery or new source read. These rereads stay private and never become a binding capture or public node. Private probes must drain/check mutation records and those existing freshness inventories; a mutation during a probe is REFUSED. There is still a residual page-event/native-input race after the last synchronous check; no browser-wide atomicity is claimed.

## 3. Deadline and invocation fence in ordinary replay

Keep the existing recording/run clock established before account application; Ready2 does not reset it. At `stepStarted`, capture one absolute monotonic source-step deadline `stepStart+Execute2.stepTimeoutMs`, additionally bounded by the existing child run deadline. Every operation in that source step shares it. A later operation/collection never starts another timeout period. The child remains sole owner of the run abort signal and ordinary stop/drain/cleanup.

```ts
interface InvocationControl {
  readonly deadlineMs: number; // existing run-clock coordinate, never Date.now()
  readonly signal: AbortSignal; // composed run cancel + this source-step timer
  check(): void;               // throws definite TIMEOUT/CANCELLED when not live
  beginInvocation(): void;     // synchronous check + PREPARING -> INVOKING once
  poison(reason: 'TIMEOUT'|'CANCELLED'): void;
  readonly phase: 'PREPARING'|'INVOKING'|'FINISHED'|'POISONED';
}
// Add final argument to the private adapter interface, no Execute2 wire change.
perform(action: ReplayAction, guard: Guard, value: string|null,
        control: InvocationControl): Promise<{value?:string;assertionPassed?:boolean}>;
```

Executor owns control construction, timer, monotonic clock and shared step/run acquisition accounting; adapter owns collection, exact probe and retained-node invocation. A step timer synchronously poisons the current control **before** rejecting the awaiting operation. Compose cancellation similarly and remove listeners/timers on completion. `check()` before and after each awaited collect/probe/sleep/matches/validate/withhold, and before committing captured values or PASS. Losing a Promise.race cannot leave a live continuation.

The adapter loops only ABSENT/VISIBILITY_PENDING. After READY it retains one exact target, validates it, calls `beginInvocation()` synchronously immediately before the fixed primitive, and invokes once. Navigation/page operations retain their existing separate checks and are not polled; their primitive boundary uses the same fence. Native pointer/key versus isolated fill/select semantics remain unchanged. Failed assertion returns ASSERTION_FAILED without another attempt. Read calls capture once after acquisition, then existing withholding precedes one binding-map insertion; a late result after poison cannot insert a binding or report success.

Timer before invocation: TIMEOUT with no operation call. Cancellation before invocation: CANCELLED with no operation call. Timer or uncertain failure after INVOKING: OUTCOME_UNKNOWN (or existing authoritative cancellation handling), never resend/reacquire. A primitive already started may have an effect; closing the context and retaining uncertainty is the honest outcome. Remaining source steps report SKIPPED with null unexecuted timings; already-started current step reports FAIL under existing protocol2 semantics.

## 4. Durable guided pre-proposal readiness

This gate grants no action or read permission. Reuse `GuidedTranslationService.next`, `recover`, `refresh`, `GuidedDispatchService.observe`, `beginObservationRefresh` and owning-worker acknowledgement, with existing REFRESH/NEXT. Recover original obligation/admission/outcome before considering another observation/proposal. Never poll during ADMITTED/DISPATCHING/unknown work or unresolved clarification. No sleep/network under session/source locks.

**Separate budgets:** leave model calls on existing callSeconds (default60), cumulative token/proposal limits and original session expiry; human answers retain existing question/session expiry. An immediately available target opens no readiness window and spends no readiness time, even if the model or human takes longer than browser timeoutSeconds. Replay alone uses §3's existing absolute browser source-step deadline.

Guided passive-readiness allowance is cumulative **per source step**, equal to locked `ui_tests.timeout_seconds*1000` (1..120 seconds). At new translation initialization `GuidedTranslationStore.initialize` records that positive bounded value and actual source/configuration identities in private progress. Concrete `long stepTimeoutMillis(JsonNode session)` requires the existing session→ui_tests transaction/lock and exact test/source/config identities. No invented timeout manifest field, old hash rewrite, constructor/account dependency or migration. The allowance limits passive wait/collection windows only; it is not a new end-to-end learning SLA.

Private `progress.translationAcquisition`, writer-validated closed shape, at most16KiB:

```text
{version:1,policy:"passive-target-1",sourceRevision:Rev,configurationRevision:Rev,
 allowanceMs:integer[1000..120000],totalExtraPolls:integer[0..200],
 active:null|{stepId:UUID,stepIndex:integer[0..99],usedMs:integer[0..120000],
 extraPolls:integer[0..32],planRevision:Rev,planHash:H,obligationId:UUID,
 targetIntentHash:H,workerId:ID,ownerFence:N,
 lastObservationHash:H|null,lastGeneration:N,nextPollAt:UTCmillis,
 window:null|{windowId:UUID,openedAt:UTCmillis,deadline:UTCmillis,
 reservedMs:integer[1..120000],lastCheckedAt:UTCmillis,uncertain:boolean},
 pending:null|{pollNumber:integer[1..200],expectedGeneration:N,refreshKey:ID,
 request:ObservationRefresh2,requestHash:H}}}
```

`ObservationRefresh2` is the existing closed `v2/observation-refresh.schema.json`, containing identity/version/generation only, no raw value. `usedMs` includes unsettled reservations, never exceeds allowanceMs. Only verified completion of the original current source step creates the next step's zeroed allowance. Later operations in the same step, replan, question/answer, owner renewal and restart retain usedMs and both poll counters. A pending window/request freezes its exact plan/obligation/worker/fence and cannot be overwritten by a replan/selection. A source/fence mismatch refuses it.

### 4.1 Window reservation and settlement

1. On unavailable target and no open window, under current session/source lock reserve the **remaining** allowance: `reservedMs=min(allowanceMs-usedMs, floorMillis(sessionExpiry-now), floorMillis(currentOwnerLeaseExpiry-now))`. Require positive. Increment usedMs by reservedMs and persist one window with original openedAt, deadline=openedAt+reservedMs, lastCheckedAt=openedAt, uncertain=false. This is a reservation ceiling, not measured browser time. No model or human work runs while this window is open.
2. Cadence is explicit: `nextPollAt=openedAt+100ms` for the first additional refresh in that source step, otherwise `now+250ms`; subsequent additional refreshes use prior acknowledged refresh settlement time+250ms. A slower scanner does not shorten the delay. Waiting between polls while the window is open consumes its duration; unused model/human time outside a window does not. Returning safe202 before nextPollAt performs no I/O or counter increment.
3. On each due poll, require now<original deadline, current lease/source/pins/plan/obligation and no unresolved effect/question. Reserve one extra step/session poll once and check the actual session's remaining400-observation/1MiB limits (or tighter persisted values). Persist one full exact pending request/key/hash/expectedGeneration and REFRESH before I/O. An already-open window does not reserve its duration again. `nextPollAt` cannot move the deadline.
4. Normal acknowledged refresh settlement validates the exact request/result and current authority. Clear pending once and commit NEXT; retain window and update lastCheckedAt and last observation identity. If still unavailable, the same window continues with its original deadline. If uniquely available or ordinary ambiguity now requires the existing clarification path, close the window **before** any model reservation: for a fully known window charge `min(reservedMs, max(0, ceilMillis(settledAt-openedAt)))`, release only its unused reserved portion once, and clear window. Used time remains cumulative. Clarification/model time after this commit is governed only by existing budgets.
5. A recovered **unsettled pending request** marks window.uncertain=true before recovering its exact refresh; this flag is sticky. Its entire reservedMs remains charged on closure even if later evidence arrives. No refund of unknown work, no negative adjustment, no duplicate settlement. Normal scanner restart between settled polls (pending=null) resumes the same original open window/deadline and includes its downtime; it does not invent uncertainty or a new reservation. Concurrent scanners may conservatively retain a window's full reservation if one sees another's unsettled pending request. Safety does not depend on identifying a process crash perfectly.
6. Deadline/count/byte exhaustion, cancellation, source/fence loss or unresolved completion retains all pending reservations and commits the stop decision/accounting. A late callback cannot reopen/extend a window or release a retained unknown charge. A known closed window cannot be settled again: compare windowId and pending poll identity atomically. An already-ready later obligation may proceed with zero remaining readiness allowance because it needs no passive wait; another unavailable target may not open a window. This prevents a hidden model/human timeout while still bounding every readiness episode.

Use durable UTC millisecond instants and database-backed current time for claims/checkpoints. `now<lastCheckedAt` is a fail-closed clock regression; do not create a later deadline to compensate. During each in-flight refresh derive a monotonic local ceiling from the remaining original window duration, check before/after every await, and retain the existing current session/lease check. `GuidedRunnerClient` has a15-second HTTP ceiling; call its existing synchronous observe through a bounded cancellable virtual-thread task in `GuidedTranslationService`, with wait capped by min(15 seconds, original remaining window). Interrupt/cancel it on the local ceiling; cancellation is best effort, so any later callback/result still meets the durable deadline/identity/terminal checks before use. No new bridge wire or client retry. At most the single persisted pending refresh per session can be outstanding; timeout stops rather than starting another task. No local in-flight task survives with model/action authority.

Unmarked old post-effect sessions cannot gain a fresh acquisition allowance: recover their existing outcomes/receipts, but refuse a newly needed delayed acquisition as RUNTIME_INCOMPATIBLE. Immediately-ready old continuation stays on its existing budgets and does not need an acquisition marker. Fresh source-only/no-admission sessions initialize under current source lock. No artifact/receipt backfill. Source-step completion and old outcome recovery are not replays.

### 4.2 Exact refresh recovery and model-send seam

Order in `next`: reconcile immutable late usage; validate source/pins/bootstrap; recover original in-flight obligation; reconcile deterministic completion; select current earliest unfulfilled server obligation; recover any exact pending acquisition; perform readiness; only then reserve/send NEXT_ACTION. There is no extra acquisition timeout imposed on a model call or human answer. Existing model send-claim checks source/plan/worker/lease/observation and also requires `window=null,pending=null`; it does not compare an old readiness-window deadline after that window was settled.

Readiness uses the existing proposal validator's Java equalsIgnoreCase targetIntent vs safe node name/locator value correspondence, without English grammar/normalization. Navigation/page URL/title assertions retain page handling. A unique available candidate proceeds to normal model selection/prepare/admit. Multiple available candidates close any known window then use existing model clarification, without polling or automatic disambiguation. Truncated/unsupported observation refuses UNSUPPORTED_SURFACE. Withheld/sensitivity-only absence is not certified safe: the backend has no private probe; it may spend bounded passive refresh but never invent permission or send missing-node metadata. Persistently absent targets exhaust readiness/time/count capacity; this is not proof of arbitrary English impossibility.

**Do not call the old `refresh()` reconstruction for pending recovery.** At first claim, persist complete ObservationRefresh2 and key (generation-bound, at most256 characters), hash them, and use these exact bytes with `dispatch.observe(controller,id,fence,key,request)`. Existing `studio_guided_commands` route `observation-refresh` and `progress.observationRefresh` anchor the full intent and callback correlation. On retry—including callback committed before continuation settlement—load the same pending request/key; never read a newer generation to rebuild it or synthesize a different refresh-N key. `beginObservationRefresh`/`committedObservationRefresh` return the original correlated durable result when its observation still equals current generation/hash. Compare expected request identity, current window/poll identity and original deadline before clearing pending. A newer unrelated observation fails stale rather than overwriting progress, refunding or polling again. No duplicate observation charge or new semantic admission is created by transport recovery.

Readiness duration/count/session evidence exhaustion uses existing BUDGET_EXCEEDED429 and durable FAILED/stop; unsupported coverage uses existing UNSUPPORTED_SURFACE422. Other target/source/fence/pin failures retain existing closed codes. Only the internal failTranslation allowlist needs the existing refusal codes, not a new public vocabulary. Committed known model/late-usage accounting must survive outward refusal; never throw a transaction rollback that discards it. Provider500 remains its existing failure, not WAIT. Private progress is excluded by positive model projection.

## 5. Required independent oracles

Keep the synchronous smoke separately. Add an asynchronous fixture whose real submit handler awaits its independent HTTP receipt response and only then reveals/appends Confirmation. The fixture controller holds that response until the harness observes a genuine committed post-submit observation without Confirmation (guided) or an actual private acquisition/collection event without it (replay). Use server-side barriers/counters, not a small timing sleep or a fake runner callback. Release response, then render; assert later actual observation/preparation/admission references the revealed node. No metadata side channel may create readiness.

- One guided submit/receipt, one SOURCE_PLAN and unchanged semantic action obligations; record additional passive observations/bytes separately. The provider receives no NEXT_ACTION request for absent Confirmation. Genuine owning worker publishes its later observation. No extra account/browser/model startup or prior submit/read replay.
- Public pure finalization/retry produces zero actions/provider calls. Two normal admitted recorded child runs use identical artifact and distinct fresh captured values, one independent submit each, zero both gateways. Assert provider request count by kind and passive poll count independently of invocations/receipts.
- Never appears: bounded refusal, no repeated submit, no dependent invocation/binding; truthful FAIL/SKIPPED/null timing/video. Count and byte exhaustion cannot be reset by multiple operations in one source step.
- Pause real/fake-controlled collection Promise, expire deadline or cancel, then release it: zero late invocation/binding/PASS. Include timeout while matches/validate/withhold awaits, timeout after actual invocation starts, stop/drain and a compound source step. Unit timers may be controlled; final positive flow uses real Chromium/HTTP.
- Duplicate including hidden competitor, sensitive descendants/ancestors/label source, incomplete/unsupported universe, wrong origin/role/type/read-policy/classification, disabled/readonly control and post-acquisition replacement refuse. None waits for a different matching element. Visibility-only hidden fixture becomes READY only after normal exported eligibility.
- Guided PostgreSQL scanner restart before/after pending refresh/callback, concurrent scanner requests and same-owner renewal preserve window deadline/count/key and used/reserved duration. Recover a callback committed before settlement using the exact original request despite advanced generation. Source/fence/plan/obligation edits refuse stale completion; no old model result is restamped. Clarification suspends polling, and its existing answer mapping stays exact.
- With browser timeout1 second, an immediately ready target and valid model response delayed beyond1 second still succeed within existing call/session budgets. A human answer after browser timeout but within question/session expiry preserves its exact meaning; model/human time outside readiness windows is not charged. Two known readiness windows in one compound source step succeed when their cumulative charge fits; exhausted or unknown reservations cannot be reset/refunded by another operation, question, replan or reconnect.
- Direct element.value/selectedOptions mutation without a DOM/input/change event fails private freshness before invocation. Hidden structural facts can be visibility-only; hidden labels/grants requiring unsafe/new source reads refuse. Probe calls neither capture bindings nor alter public observation bytes.
- Public observation JSON/provider bytes retain existing privacy canaries. Legacy collector/native/confined-child/dual-gateway mutation gates pass. Rebuild source/dist/catalog identity and affected actual pipeline suites after implementation; pre-amendment runner evidence remains historical.

## 6. Exact ownership and compatibility

Backend existing006-owned paths: `backend/src/main/java/com/citi/put/checks/studio/guided/session/GuidedSessionService.java`, `backend/src/test/java/com/citi/put/checks/studio/guided/publication/GuidedPublicationReplayIT.java`.

Additional backend paths requiring mechanical reservation before implementation:

- backend/src/main/java/com/citi/put/checks/studio/guided/translation/GuidedTranslationService.java
- backend/src/main/java/com/citi/put/checks/studio/guided/translation/GuidedTranslationStore.java
- backend/src/test/java/com/citi/put/checks/studio/guided/translation/GuidedTranslationTest.java

Existing006-owned runner paths: `studio-runner/src/run/observedReplayAdapter.ts`, `studio-runner/src/executor/observedReplay.ts`, `studio-runner/src/run/childRuntime.ts`, `studio-runner/test/observedReplayExecutor.test.ts`, `studio-runner/test/run/observedReplayProtocol.test.ts`, `studio-runner/test/fixtures-tier/observed-replay.test.ts`, `studio-runner/test/fixtures-tier/observed-replay-privacy.test.ts`, and existing owned build/catalog pin generation files.

Private collector paths needed for this amendment (`browser.ts` is already reserved; add the other three before implementation):

- studio-runner/src/run/observationTypes.ts
- studio-runner/src/run/observationCollector.ts
- studio-runner/src/run/browser.ts
- studio-runner/test/run/observation.test.ts

No new schema/protocol/migration paths. Public observation, model request/response, source manifest and original action/admission payloads stay unchanged. Existing artifact2/plan/binding hashes remain immutable. This is a compatible observed execution bug fix, not a new executable operation; packaged reference/source/build/catalog identities must be regenerated and explicitly associated with the supported profile. Old local/production image attestation is not borrowed. New implementation must pass independent review of private classification and durable timing before production work; no live-provider accuracy claim or009 benchmark is included.
