# Studio scheduling operations (STUDIO-SCHED-001)

Scheduling uses the saved, confirmed Studio test and its existing execution ledger. It never compiles, confirms, or calls the browser runner directly. The implementation contract is [STUDIO-SCHED-001](../../../stories/STUDIO-SCHED-001/spec/implementation-contract.md); API bodies are declared in [OpenAPI](../openapi.yaml).

## Administration from a terminal

Use your platform's authenticated session and normal protected API access. The examples use `$CHECKS_BASE_URL` and a local `$CHECKS_SESSION_COOKIE_FILE`; they do not provide credentials. Obtain an approved principal reference from the test-scoped capability response. Do not copy an end-user token into a schedule.

```sh
curl --fail-with-body --cookie "$CHECKS_SESSION_COOKIE_FILE" \
  "$CHECKS_BASE_URL/api/v1/studio/tests/$TEST_ID/schedule/capabilities"

curl --fail-with-body --cookie "$CHECKS_SESSION_COOKIE_FILE" \
  -H 'Content-Type: application/json' \
  --data '{"cronExpression":"*/5 * * * *","timeZone":"America/New_York"}' \
  "$CHECKS_BASE_URL/api/v1/studio/schedules/preview"

curl --fail-with-body --cookie "$CHECKS_SESSION_COOKIE_FILE" \
  -H 'Content-Type: application/json' \
  --data '{"cronExpression":"*/5 * * * *","timeZone":"America/New_York","executionPrincipal":"APPROVED_PRINCIPAL_REFERENCE"}' \
  "$CHECKS_BASE_URL/api/v1/studio/tests/$TEST_ID/schedule"
```

Creation leaves the schedule Paused. Read the current saved test and schedule, investigate any uncertain execution IDs, then explicitly Resume with their exact revision/version acknowledgment. A successful preview does not authorize execution. A missing approved principal or production authorization provider prevents activation.

```sh
curl --fail-with-body --cookie "$CHECKS_SESSION_COOKIE_FILE" \
  -X PATCH -H 'Content-Type: application/json' \
  --data '{"expectedVersion":1,"enabled":true,"confirmedRevisionId":"CURRENT_CONFIRMED_REVISION_UUID","acknowledgedUncertaintyExecutionIds":[]}' \
  "$CHECKS_BASE_URL/api/v1/studio/tests/$TEST_ID/schedule/enabled"

curl --fail-with-body --cookie "$CHECKS_SESSION_COOKIE_FILE" \
  "$CHECKS_BASE_URL/api/v1/studio/tests/$TEST_ID/schedule/occurrences?page=0&size=20"

curl --fail-with-body --cookie "$CHECKS_SESSION_COOKIE_FILE" \
  -X PATCH -H 'Content-Type: application/json' \
  --data '{"expectedVersion":2,"enabled":false}' \
  "$CHECKS_BASE_URL/api/v1/studio/tests/$TEST_ID/schedule/enabled"

curl --fail-with-body --cookie "$CHECKS_SESSION_COOKIE_FILE" -X DELETE \
  "$CHECKS_BASE_URL/api/v1/studio/tests/$TEST_ID/schedule?expectedVersion=3"
```

Examples assume versions increment as shown; always read the actual current version. A version conflict requires reloading and reviewing the latest state. Pausing or removing stops future acceptance and retains history; use the existing execution cancellation API separately for an accepted run.

## Configuration

`studio.scheduling.enabled` defaults to false. `studio.scheduling.grace-seconds` defaults to 300, `batch-size` to 20 and `per-csi-batch-size` to 2. `pass-budget-millis` defaults to 5000 (valid range 1..30000); each pass yields between candidate transactions, with CSI rotation based on attempted work. Individual transactions still depend on the existing bounded database/reference timeouts. The minimum cadence is fixed at 60 seconds. The producer runs only on the worker role or local profile without the API-only role.

For an isolated local/test fixture, explicitly enable `studio.scheduling.local-grants-enabled` and configure `studio.scheduling.local-grants` as a map from the exact saved `CSI|environment` pair to comma-separated approved principal references. In Spring YAML, quote bracketed map keys (for example `"[CSI_ID|SAVED_ENVIRONMENT]"`) to preserve the separator. This adapter rejects production and unknown profile combinations. It supplies execution grants only; it never grants secret access. Its dispatch policy attribution is provisional principal metadata; the production provider integration must supply the actual policy/grant identity and version before the live-authorization release gate closes. Use the test-scoped capability route to check the actual effective references before activation.

## Shared scheduling implementation

HTTP/TCP/Splunk schedules and Studio use the same `SchedulingCoordinator` and `SchedulingTargetWorker` due-production implementation. The ordinary target is the existing `CronDispatcher`, retaining its check-type permits, ShedLock, result persistence and retry path. The Studio target is `StudioScheduledTarget`, feeding the existing atomic acceptance/ledger and then the existing Studio dispatcher/runner/recovery path. Studio has no independent recurring poller and browser attempts never use ordinary retries.

`CronRecurrence` is the shared normalization/zone/next-slot kernel used by ordinary schedule CRUD/advancement, Studio preview/due resolution, and report recurrence primitives. Domain adapters explicitly preserve their grammar and DST policies; Studio's restrictions do not narrow other check schedules. Public APIs and storage are unchanged by this reuse refactor. See [ADR-004](../../../architecture/ADR-004-shared-check-scheduling.md) and [compatibility evidence](../../../stories/STUDIO-SCHED-002/).

`checks.scheduling.coordinator.heartbeat-ms` defaults to 1000; effective heartbeat is clamped to the shortest registered target interval, including currently disabled targets. `checks.scheduling.coordinator.shutdown-timeout-ms` defaults to 5000. Ordinary poll/initial-delay and Studio poll settings accept the existing numeric millisecond and Spring duration/expression forms. Each target waits its configured interval after a completed pass using monotonic time; UTC clock changes do not alter this cadence. Studio intentionally adopts ordinary checks' completion-based delay, replacing its former enqueue-callback timing phase.

The common hub's automatic role is `!api | worker`; the Studio target independently requires `worker | (local & !api)`. Ordinary standalone development remains supported and API-only contexts own no automatic check/Studio due hub. The ordinary dispatcher flag and Studio scheduling flag remain independent; ordinary leadership/backpressure cannot suppress Studio's target. Existing execution/recovery timers still handle accepted runs when new due production is disabled.

## Outcomes and recovery

Occurrences distinguish nominal due time, acceptance time, and browser start. ACCEPTED links a real immutable run; REFUSED/SKIPPED/DEFERRED describe scheduling decisions without inventing a run or video. COMPILE_REQUIRED requires preparing and confirming the saved test, followed by explicit Resume. Metadata-only changes do not require reconfirmation.

Capacity and temporary pre-acceptance outages defer the same occurrence inside its original five-minute grace. The nominal cursor stays fixed; poll eligibility advances with bounded backoff. After grace expiry the occurrence is skipped. An extended outage produces a bounded missed-range summary instead of replaying historical browser actions. Repeated daylight-saving wall-clock slots execute only at the earlier offset; nonexistent local times are skipped.

Any non-DONE manual or scheduled run causes overlap skipping. DISPATCH_UNKNOWN, START_TIMEOUT, or STALE terminal outcomes leave durable uncertainty records. Investigate actual application effects and runner evidence before acknowledging the exact execution IDs and resuming future slots. Resume never replays the uncertain occurrence. An older accepted run becoming uncertain later requires another acknowledgment.

## Deployment and restore

The producer and activation capability default off. Apply the additive migration before enabling compatible API/worker instances. API-only processes must not own due polling. Existing dispatch, callback, recovery and cancellation continue to finish accepted work when the scheduling producer is disabled; current authority is still rechecked before scheduled sends.

Local/mock principal allowlists are development evidence only. Production activation requires an approved live background identity/CSI/environment grant provider, existing secret-use authorization and revocation checks, on-demand Studio acceptance evidence, ordinary-check responsiveness/capacity measurements, retention/restore review, and independent release review.

For rollback, stop new scheduling acceptance and activation first. Retain additive audit tables and the durable ledger, and keep compatible dispatch/recovery for already accepted work. Do not restore or drop occurrence identities to retry uncertain work.

After restoring a database older than executed occurrences, keep scheduling disabled until operators reconcile external browser effects, retained runner evidence, schedule cursors, and deduplication/uncertainty anchors. A restored database cannot infer browser effects whose acceptance records were erased. History/video retention may prune detail without deleting scheduling identities or uncertainty acknowledgments; missing evidence remains explicitly unavailable.
