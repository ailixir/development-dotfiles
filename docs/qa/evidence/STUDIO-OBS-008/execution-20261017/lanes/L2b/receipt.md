# L2b body receipt, 2026-10-17

Status: ready for root review. No blocker. Machine-readable twin: `receipt.json` (sha256 of every file, full lists).

## Verify rows (what I ran)

- `pnpm exec vitest run src/services/api/studioGuidedApi.test.ts src/services/mocks/studio/guidedHandlers.test.ts src/components/studio/guided/useGuidedSession.test.ts --minWorkers=1 --maxWorkers=2`: 3 files, 116 tests (21 + 56 + 39) passed; run twice, same counts.
- `pnpm run type-check`: exit 0.
- `pnpm exec eslint` on the 11 files: exit 0.
- Not run: full frontend suite, `studioContract.test.ts` (L2a's), any browser run, composition into `handlers.ts` (root F1).

## Exit criteria

- **Keys on all four mutations (D-1):** the client rejects a missing or oversized key before sending; the mirror answers 400 to a start/clarify/cancel/finalize without one; hook tests show start, clarify and finalize carried distinct non-empty keys and cancel its own.
- **Reload:** a stored `sessionId` is resumed by GET only (start POST count stays 1); a reload at `FINALIZING` finalizes under the persisted `finalizeKey`; a reload after every start attempt was lost retries the same `startKey`.
- **Lost response:** start processed but unanswered is retried under the same key and finds the one session; finalize that never arrived is repeated under the same key; finalize processed but unanswered is not sent again.
- **StrictMode and races:** strict-mode mount sends one start and one finalize; a strict-mode resume of a pointer with no `sessionId` posts once (with a 60 ms server latency so the first POST is still in flight); two instances on one session finalize once; a double click sends one start.

Mutation checks (each reverted and diffed against a backup): removing the finalize latch fails 2 tests, the pointer write before POST fails 4, the start-flight dedupe fails 2, dropping the key header fails 2, dropping `__doNotRetry` fails 1, an unclosed finalize body fails 1. The first version of the latch check failed only 1 test; adding `setGuidedLatency` to the mirror made the race real.

## Interface (rule 1): no exported signature changed incompatibly

- `useGuidedSession(testId, options?)`: optional second parameter `{pollIntervalMs?, retryDelayMs?}`; return shape unchanged.
- `studioGuidedApi.startSession/clarify/cancel/finalize` are `async` now; same parameters and return types. A key outside 1..256 characters rejects before any request. Bodies are rebuilt as the contract's closed objects.
- New exports: `startBodyFrom`, `finalizeBodyFrom`, `clarifyBodyFor`, `USER_CANCEL_BODY`, `httpStatusOf`, `guidedErrorOf`, `toGuidedStartRefusal` (api); `UseGuidedSessionOptions`, `readGuidedPointer`, `resetGuidedSessionRuntime` (hook); the mirror's arrays and controls.
- `studioApi.ts` and `studioSlice.ts` are byte-identical to the W2.0 hashes. `studioGuidedTypes.ts` changed in comments only.

## The two invented shapes (rule 2): kept, each traced

`GuidedPendingReason`
- `REAUTHENTICATION_REQUIRED`: HTTP 401 (`SessionUnauthorized`, every guided route).
- `NOT_READY`: HTTP 503 on any guided route ("Current authority or Vault unavailable"), or HTTP 400/409 refusing finalize, after which the session stays `FINALIZING`.
- `PUBLICATION_PENDING`: HTTP 202 on `readGuidedResult` ("Pending publication, not a success claim").

`GuidedStartRefusal`: `httpStatus` is the status; `error` is the `error.schema.json` body, checked field by field; `platformCode` is `PlatformErrorResponse.error.code` (or the flat `ErrorResponse.error`); `retryAfterSeconds` is the `Retry-After` header. Cited in comments in the types file, `toGuidedStartRefusal` and the hook header.

## Notes for L4, L5a and L5b

- Mount `useGuidedSession` once per page and pass its return value down.
- `startLearn` resolves for every HTTP outcome (see `startRefusal`, `pending`) and rejects only if no response ever arrived; catch it. The pointer is kept, so a second call or a reload retries the same request.
- A 401 stops polling and keeps the pointer; a 403 forgets everything.
- The mirror exports arrays (`guidedHandlers`, `capabilityHandlers`) and factories (`createGuidedHandlers`, `createCapabilityHandlers`) taking a test lookup. For F1: if guided progress must match step IDs of tests created through the authoring mock, pass `stepsOf` (default is `fixtureStepId(i)`).
- Test controls: `setGuidedScenario`, `failGuidedRequests` (with `afterProcessing` for lost responses), `setGuidedLatency`, `guidedRequestLog/Count`, `resetGuidedMocks`; and `resetGuidedSessionRuntime()` in the hook module to simulate a reload.

## Observations (not changed here)

- Backend vs OpenAPI: `GuidedSessionController.result` answers 202 with a session-view body for a non-terminal session; the document says a result. The hook only reads results after a terminal state; the mirror follows the document.
- Backend answers 202 for a pending publication on a terminal session too; the hook re-reads up to 60 times and leaves `pending = PUBLICATION_PENDING`.
- `ORIGIN_NOT_ALLOWED`, `MISSING_SOURCE`, `BUDGET_EXCEEDED` also occur as a session's `errorCode`, not only as start refusals.

## Mock choices the contract leaves open

Capability `environmentId` = the draft's environment label and `applicationId` = its CSI; a draft with no steps is `RUNTIME_INCOMPATIBLE` (D-11); an execute-denied CSI is `FORBIDDEN_SCOPE`; `UNKNOWN_OUTCOME` defaults to publication `REFUSED`; revision mismatches answer `REVISION_CONFLICT` with `messageCode` = code. All `[AUTO-DECISION]` entries are in `receipt.json`.

## IDS

Reused: `fixtureStepId`, readiness/mock/demo drafts, `STUDIO_FORBIDDEN_BODY`, `MOCK_READABLE_CSIS`, `contracts/v3/fixtures.json` documents, `studioVideoUrl`, the draft-07 Ajv pattern. Created: the three mirror modules (no guided mirror existed; `handlers.ts` is L2a's seam). `newGuidedIdempotencyKey` duplicates a private helper in L5b's `useRunGate.ts`.
