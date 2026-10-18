# Studio inference execution record

> **Superseded (2026-10-12):** Superseded by [ADR-SC-005](ADR-SC-005-single-path-observed-authoring.md) (single observed path; compile-to-READY removed in STUDIO-OBS-012A).

Updated 2026-09-17 after story 10.27 failure remediation. Local core implementation is complete and independently reviewed within the scopes below. Release readiness remains unproven: external integration, load/evaluation and rollout gates are open. Changes are uncommitted in the user-selected existing `wt/epic` checkout, branch `epic/EPIC-10`, based on `e1684f8c74429d80bb68fb0d8718f66b22a5677f` plus the preserved integration fixes. No push, shared-environment migration or deployment was performed.

## Implemented

- Maintained Google Gen AI SDK 1.71.0 behind the Vertex/R2D2 gateway interface, strict full/patch/unsupported envelopes, schema/max-output-token controls, bounded repair and recorded settings/usage.
- One request budget across model work, retries, validation and publication, including cancellable credential HTTP refresh. Unknown usage remains unknown. Expired final publication rolls back its candidate.
- Versioned authoring API with server-owned step IDs, reviewed scope, exact no-op handling, immutable input/request/candidate identity and mixed provenance. V18 is additive; V19 is a separately staged incompatible-writer cutover.
- Deterministic FULL/INCREMENTAL/REUSE planning. Eligible changed/dependent suffixes are regenerated; retained code is exact. Every assembled artifact validates in full, needs exact confirmation, and runs in full on explicit Run. Saving/compiling does not start a browser.
- Faithful assertion whitespace/case/URL behavior, bounded polling, and rejection of trial actions. Policy/executor/reference/prompt pins advance to 2.0.0; runtime artifact remains version 1.
- V2 review UI and MSW flows: scope reaffirmation, reuse/regeneration, trusted code diffs, historical versus current evidence, exact confirmation and idempotent execution retry.
- Development evaluation CLI, isolated fixture server, independent state/event oracles, mutation controls, paired full/AUTO lifecycle, bounded concurrency and immutable evidence. Sample corpus is development-only; it is not the proposed release corpus.
- Local filesystem evidence and prepared remote AWS S3 provider remain as requested. Remote buckets, IAM and deployment are deferred.

## Expert execution and corrections

Aria settled C0 and reviewed integrated architecture; Dara designed/implemented persistence and reviewed story readiness as Pax; Dex specialists implemented runner, gateway, backend and v2 authoring; Uma's interaction design guided the frontend specialist; Quinn independently reviewed the implementation and reproduced/rechecked defects. The coordinator integrated changes and ran combined checks. See [architecture review](../qa/studio-inference-architecture-review.md), [QA review](../qa/studio-inference-implementation-review.md), [story readiness](../qa/studio-inference-story-readiness.md), [C0](studio-inference-contract-v1.md) and stories 10.20–10.26.

Corrections include late assertion passes, incomplete/contradictory oracle evidence, wrong assertion-failure classification, credential refresh outside cancellation, final publication deadline/CAS, saturation/crash outcome recovery, trailing JSON acceptance, and v2 idempotency-filter coverage.

Combined testing found an additional after-commit transaction issue. `captureForCompilation` now commits independently before submitting a worker, while the ordinary state `capture` remains composable for database-only callers. Real save-to-compile tests and capture barriers passed afterward. Two stale test producers were corrected to supply the actual three-step/80-step source shape; the large diagnostics test stays inside the new response transport cap while exceeding persisted diagnostic caps. Timing-only mock tests now use deterministic clocks/barriers instead of relying on a 1ms deadline or a cold socket reaching the server within 25ms.

## Final local verification

The initial focused implementation run exposed broader repository failures. Under the user's follow-up instruction to analyze and fix them, story 10.27 corrected the application author-provisioning race, confirmed-source projection, mounted Helm configuration, frontend errors, test lifecycle/transport defects, stale contract fixtures and a credential timeout classification race. The earlier failed/incomplete runs are historical evidence, not the final outcome. See [root causes and exact evidence](../qa/verification-failures-remediation.md) and [independent QA review](../qa/verification-failures-review.md).

| Scope | Final result | Evidence |
| --- | --- | --- |
| Full backend `check` | **1,088 passed, 7 existing skips, zero failures/errors**; 11m36s | `/tmp/studio-followup-full-check-complete.log` |
| Backend formatting, Checkstyle, SpotBugs, database/dependency and coverage gates | **Passed**; 83.23% aggregate line coverage | Same full-check log; JaCoCo report |
| Full frontend | **565 passed**; lint, typecheck and production build passed | [Frontend evidence](../qa/studio-frontend-failure-remediation.md) |
| Runner unit tier | **971 passed, 29 existing skips**; 93.58% line coverage | `/tmp/studio-followup-runner-final.log` |
| Runner real-browser fixtures | **118 passed, 10 existing skips** | Same runner log |
| Runner deployment tier | **216 passed, zero skips** against freshly built local image | Same runner log; `put-checks-studio-runner:10.27-local` |
| Evaluation oracle/lifecycle self-tests | **26 passed, zero skips** | Same runner log |
| Runner typecheck, lint, build and pins | **Passed** | Same runner log |

The backend total includes 1,086 main-suite passes and two cross-replica passes. Existing target-policy and external-integration skips remain explicit; none was introduced to hide a failure. Frontend retains 332 existing lint warnings and webpack asset-size warnings, with zero lint errors. Original confirmed-source escalation assertions now pass. No lint rule or coverage threshold was lowered.

Full→edit→incremental compilation and full acceptance passed on PostgreSQL. Credential cancellation has real local Google service-account and ADC-user token HTTP evidence; compute ADC was source-inspected, not separately wire-tested. Production Gen AI audit tests verify success, malformed output and echoed errors without source leakage. Local scripted model/validator evidence does not establish live model quality or throughput.

## Remaining gates

1. Approved live Vertex/R2D2 SDK/auth/model/schema/quota verification (SPK-01), followed by the held-out full/incremental semantic and performance evaluation. Freeze numerical targets before observing live results. No live model request was made here.
2. Release-sized corpus, representative concurrency/connection-pool and execution-history query measurements, and typed assertion-failure evidence. The current execution API does not expose typed assertion origin; live intended-failure cases cannot be counted correct by guessing from a message. CLI summaries always state `releaseReady:false`.
3. Platform entitlement/target-policy revocation and existing vault/identity/runner-image/network/evidence prerequisites. Current authorization uses the trusted platform token claims; immediate external entitlement revocation is not invented by the new compiler.
4. Operator-rehearsed V18→V19 compatible-writer cutover, rollback-floor validation and separate authoring/gateway/incremental enablement. See [rollout procedure](../runbooks/studio-inference-rollout.md). All new enablement flags remain off by default.
5. Remote AWS S3 provisioning and deployment, as deferred by the user; the local filesystem and remote-provider wiring now pass local deployment checks.

Stories remain InReview/InProgress where appropriate. Bounded expert review and green local gates are not a formal production approval or a claim that every plan release gate has completed.
