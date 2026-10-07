# Studio inference contract v1 — C0

**Date:** 2026-09-16 · **Owner:** Aria, architecture · **Status:** Contract decision for implementation; not deployed or a release approval.

This amendment freezes the interfaces needed by [stories 10.20–10.26](../stories/10.20.story.md), the [implementation plan](studio-inference-implementation-plan.md), and findings F1–F10 in the [review](studio-inference-review-2026-09-16.md). It supersedes the affected compiler decisions in [Studio architecture §§4/8](studio-execution.md), without changing the positional runtime artifact or existing runner routes. [Inference OpenAPI](../specs/studio/inference.openapi.yaml) and [proposal JSON Schema](../specs/studio/inference-proposal.schema.json) are the machine-readable authoring/inference contracts. Existing [OpenAPI](../specs/studio/openapi.yaml) remains authoritative for v1, execution, and internal runner bodies. New routes are explicitly unimplemented until their stories land.

## 1. Decisions and compatibility boundary

- The requested mode is `AUTO` (default) or `FULL`. The server selects `FULL`, `INCREMENTAL`, or `REUSE` and records a reason. There is no force-incremental bypass.
- `FULL` generates every captured step. `INCREMENTAL` generates the permitted affected suffix. `REUSE` generates nothing but still validates the complete new candidate. Explicit `FULL` never becomes `REUSE` merely because text is identical.
- Every executable candidate is complete, immutable, validated, and explicitly confirmed. Any unsupported/clarification entry blocks the entire candidate. Compilation never runs a browser.
- V2 public authoring uses `/api/v2/studio`; existing v1 clients continue through their existing routes. V2 execution uses the existing authenticated `/api/v1/studio/tests/{id}/execute` and evidence routes with the same revision checks; no duplicate execution engine is introduced.
- V1 and v2 both use the new full model-response envelope. Legacy callers receive compile-local step IDs, select FULL, and map unsupported outcomes to existing `NEEDS_REVISION` diagnostics. Legacy input must not retain the unsafe “closest permitted call” prompt or a bypass accepting raw model artifacts.
- Runner `artifact.version` remains `1`, with `stepIndex`, exact `originalText`, and `code`. The backend alone assembles this from server-captured source plus accepted generated/reused code; model-provided source/index values are forbidden.

## 2. Authoring, scope, and revision identity

V2 writes contain ordered `{id, text}` steps. `id` may be absent/null for a new step; the server allocates a UUID while holding the draft lock. Existing IDs must belong to the same test, be unique within the request, and retain identity across text edits. A duplicated step omits its ID. Structural insert/delete/reorder selects FULL in this release. Foreign IDs and duplicates are `400 INVALID_STEP_ID`; authorization still precedes body-sensitive work.

`scope` is `{policyVersion: "1.0.0", declaration: "UNKNOWN" | "STEP_SCOPED"}`. `STEP_SCOPED` is an explicit author statement that each step's meaning depends only on its own text, preceding steps, and declared references; it introduces no global or forward dependency. The UI must obtain renewed review for changed text/IDs/order/references/scope, not silently copy a past affirmation. V2 requires the scope object; missing scope on a v1 transitional write means UNKNOWN. The server records the authenticated reviewer and review time; the caller cannot supply either.

This declaration is an auditable semantic assumption, **not proof** of arbitrary English independence. Full-context prompts remain permitted, so independent behavioral evaluation and confirmation remain necessary. Unknown, stale, ambiguous, global, or forward scope selects FULL. A model/heuristic may flag uncertainty but cannot establish trust or enlarge its own write set. Do not describe a suffix supplied to a prompt as invisible or unable to influence generation.

Canonical string-array source/hash remains unchanged. Add an immutable authoring snapshot `{version: 2, steps: [{id,text}], scope}` and its canonical SHA-256 hash. Reviewer identity/time are recorded alongside the snapshot, not included in its content hash. A change to IDs/order/scope advances `sourceRevision`, including when English strings remain equal. There is no third client concurrency counter. An exact no-op save preserves the existing snapshot/review stamp and does not compile. V1 writers that cannot preserve mapping invalidate it and advance sourceRevision; they cannot claim incremental eligibility.

Scope affirmation applies to the submitted snapshot, not all future edits. A full baseline is eligible only when its exact authoring snapshot carried the compatible reviewed scope, and the current edited snapshot independently does too. Legacy whole-context artifacts are never retroactively eligible by adding IDs to a draft.

Reaffirming the same declaration for an actually edited snapshot records its new review stamp; the edit already advances sourceRevision. Re-review of an identical snapshot, if recorded, is an append-only audit event, not a mutation of that snapshot's reviewer/time or fresh passing evidence. Revoking/changing the scope declaration or policy advances sourceRevision. A timestamp refresh alone cannot create eligibility or turn an exact no-op into a new candidate.

### Identity and transaction boundary

`compileRequestId` identifies one immutable captured attempt. `revisionId` identifies its one published candidate, distinct from artifact content identity. A retry of publication for the same request returns the same revision. A distinct explicit rebuild gets a new request and candidate even when artifact bytes are identical. Confirmation time/principal and provenance of a prior revision never change.

Under a short transaction, lock the draft first; validate expected source/configuration revisions and lifecycle/authorization; allocate/validate IDs if saving; capture source, authoring hash, reference names, nonsecret configuration identity, selected baseline/evidence, requested/selected mode, writable set, compilation fingerprint, and budget. Commit before model or runner calls. All save/capture/publish/confirm/execute-acceptance paths use draft-first lock ordering.

Publication is one transaction guarded by test/request/sourceRevision/configurationRevision/authoringHash/fingerprint and lifecycle, with required entitlement/policy rechecks. Superseded work records `DISCARDED`; it cannot change the latest draft's state. Cancellation/expiry also cannot publish a candidate. Coherent execute acceptance must capture the confirmed revision and its configuration under the same draft lock; no split readiness/configuration read.

The immutable compile-request record and separately write-once outcome follow Dara's data design. Candidate revisions have a nullable historical / required-new unique compile-request FK. New provenance and authoring columns are database-protected, not merely omitted from application setters. V18 expands; V19 identity-constraint cutover requires draining incompatible publishers and an explicit schema capability gate. Historical rows are not rewritten. Flyway versions V18/V19 are reserved to Dara.

## 3. Planning and baseline eligibility

The baseline is same-test/same-CSI, authorized, confirmed, compatible with the compilation fingerprint and reviewed scope, and backed by a retained successful FULL execution of that exact revision/configuration/runtime. Query revision-linked execution records, not `lastRunStatus`. Historical rows without a truthful FULL marker are ineligible. Record execution identity `(id, startedAt)` without a retention-blocking foreign key. Normalize execution/revision configuration fields before comparison; their stored JSON shapes currently differ.

Choose the newest eligible revision by `(createdAt DESC,id DESC)`, then its newest successful matching full execution by `(startedAt DESC,id DESC)`. Missing/expired required evidence means FULL; no inferred pass. Recheck revocation/lifecycle as appropriate at publication and execution. The baseline may have a different compatible configuration from the new draft; its pass remains evidence only for its own configuration.

Plan reason vocabulary, with the first applicable reason in this order:

1. `EXPLICIT_FULL` for requested FULL.
2. `INCREMENTAL_DISABLED` while the feature gate is off (source-independent configuration reuse remains allowed).
3. `NO_ELIGIBLE_BASELINE` for unavailable/unauthorized/expired baseline evidence; do not disclose foreign baseline details.
4. `LEGACY_MAPPING`, `STRUCTURAL_CHANGE`, `FINGERPRINT_CHANGE`, `SCOPE_UNKNOWN`, or `GLOBAL_OR_FORWARD_SCOPE` for the corresponding incompatibility, selecting FULL.
5. `UNCHANGED_SOURCE` or `CONFIGURATION_ONLY` selects REUSE when baseline and current authorization/reference/configuration compatibility permit it.
6. `SCOPED_SUFFIX` selects INCREMENTAL from the earliest changed step through the end. If that step is first, select FULL with `ALL_STEPS_AFFECTED`.

Unknown reference impact or runtime/policy incompatibility cannot be hidden by the REUSE branch; it selects FULL or explicitly blocks where revoked/unsupported. Reverting text to a baseline after intervening revisions is REUSE with fresh validation/confirmation/evidence, not a no-op. Config-only reuse can use the existing compatible confirmed revision without a prior passing run: the pass prerequisite is for inference optimization eligibility, not the pre-existing zero-inference configuration-candidate workflow. Record this distinct baseline source with null successful-execution evidence.

Freeze the selected mode and write set before inference. The full current English, reference names, baseline code required for context, and permitted IDs are fenced as data; no resolved values enter the prompt. Reject an oversized complete context; never silently truncate dependencies. An incremental patch must cover each permitted ID exactly once and no others. Reused source/code must remain byte-identical to the baseline. Derive indexes/source on the server and validate the entire merged artifact.

A repair never expands the write set. A validator problem in reused code produces `NEEDS_REVISION` with `FULL_REBUILD_REQUIRED`; no auto-regeneration of protected steps or hidden full fallback. A later explicit FULL is a new request, not a budget reset inside the previous request.

## 4. Model response, failure outcomes, and repair

The version-1 inference envelope is `{version:1, kind:"FULL"|"PATCH", steps:[...]}`. Each entry is one closed variant:

```json
{"stepId":"uuid","status":"GENERATED","code":"await page.getByRole('button', { name: 'Save' }).click();"}
```

```json
{"stepId":"uuid","status":"UNSUPPORTED","reason":"UNSUPPORTED_CAPABILITY","message":"This step requires a second browser page."}
```

```json
{"stepId":"uuid","status":"CLARIFICATION","reason":"AMBIGUOUS_INTENT","message":"Specify the expected text."}
```

`FULL` must cover every current ID; `PATCH` only the frozen writable IDs. Arbitrary JSON fields, duplicate JSON keys/IDs, wrong kind/version, missing IDs or out-of-scope IDs are invalid. `code` is forbidden on unsupported/clarification variants, and message/reason forbidden on GENERATED. Responses cannot supply originalText, positional indexes, dependency proofs, authorizations or a claimed validation verdict.

The local JSON Schema is authoritative. A provider-specific schema uses only that provider's supported subset and is tested against the strict local validator; unsupported provider keywords must not create an alternative acceptance rule. Request schema plus JSON MIME after capability verification; if the proxy cannot support the approved inference contract, shared enablement remains blocked rather than silently weakening it. Strict parser rejects surrounding prose/fences/trailing documents for this new envelope.

Outcome mapping:

| Outcome | Draft projection | Publication/repair |
| --- | --- | --- |
| Whole artifact validated | AWAITING_CONFIRMATION | One candidate; explicit confirmation required |
| UNSUPPORTED / CLARIFICATION | NEEDS_REVISION | No candidate; actionable bounded step diagnostic; no model retry to coerce supported output |
| Invalid model envelope (strict parser rejection) | Repairs within shared limit, then STALE | GATEWAY_PARSE_FAILURE; no partial candidate (amended 2026-10-04, see note below) |
| Invalid generated syntax (validator verdict) | Repairs within shared limit, then NEEDS_REVISION | Final bounded diagnostics, no partial candidate |
| Reused code invalid | NEEDS_REVISION | FULL_REBUILD_REQUIRED; no scope expansion |
| Deadline, saturation, transport, unavailable/malformed validator | STALE | Error code only; never format-repair transport/refusal |
| Safety block / truncation / unusable finish reason | STALE | GATEWAY_PARSE_FAILURE with explicit bounded finish classification in attempt telemetry; no candidate and no automatic retry |
| Superseded capture | Latest draft unchanged | Attempt DISCARDED |

For legacy diagnostics before runner validation, `validatorSchemaVersion` is the reserved literal `not-run` rather than a fabricated runtime version, and no candidate provenance exists. New diagnostic codes `UNSUPPORTED_CAPABILITY`, `AMBIGUOUS_INTENT`, `INVALID_MODEL_RESPONSE`, and `FULL_REBUILD_REQUIRED` use the existing bounded per-source-step diagnostic shape. An unattempted/generated step in an all-or-nothing rejection must not be described as semantically valid. V2 attempt result separately records stage and reason. Existing v1 clients may display these codes as strings; no runner diagnostic enum is broadened by this authoring outcome.

Malformed/schema-invalid envelopes may consume a repair; they do not cause a fresh independent compile. Supply explicit correction instructions and bounded, redacted rejected content plus diagnostics; if safe bounded context cannot be retained, terminate clearly instead of dumping raw model payloads. UNSUPPORTED/CLARIFICATION remains terminal. All repairs traverse the identical ID/schema/AST/runtime gate.

**Amendment — VAL-019, user decision 2026-10-04 (D1, D2).** An envelope the strict local parser rejects consumes one repair from the shared limit (one plus two proposals, the one deadline). The repair carries a fixed correction instruction plus the closed rejection code and its 0-based `steps` position only; the rejected output is never sent back, raw or redacted, because redaction cannot vouch for model text. When the limit is exhausted on parser rejections the request ends `STALE` with `GATEWAY_PARSE_FAILURE`, not `NEEDS_REVISION`: retrying the same unedited source is the remedy, so the NEEDS_REVISION "edit your steps" narrative would be false. An unusable finish reason, an over-size output, a server-side assembly failure and the artifact version gate stay terminal with no repair. The closed rejection code is recorded on the gateway audit line and a WARN line only; no public contract field changes.

## 5. Shared inference bounds and observable interfaces

Implement a request-owned `CompileBudget` carrying a monotonic deadline, cancellation token, remaining input/output/token accounting, proposal and transport counters. A wall-clock deadline is persisted for recovery/observability only; elapsed work uses monotonic time. `propose(ProposalRequest, CompileBudget)` and `validate(Artifact, Source, References, CompileBudget)` consume the same instance. Input snapshot and selected plan are immutable values; no method rereads a mutable draft for generation.

Hard limits remain at most three proposals (one plus two repairs), at most three transport attempts per proposal, and nine total transport attempts, **also bounded by the one deadline**. Config may lower these limits but not raise the architecture cap. SDK automatic retry is disabled. Retry only classified transient failures while budget remains; never retry an ambiguous timeout. Each network timeout is `min(perCallCap, remaining)`. Backoff is cancellable and starts no next request after expiry. A timer sets cancellation, cancels the active SDK/HTTP future, and prevents further parsing/repair/publication. Release resources/bulkhead on completion; a cancelled request cannot launch replacement work while its old transport still consumes the same limited slot. Wire tests prove actual capacity recovery, not merely draft-state settlement.

Use the existing 240-second overall compile ceiling as a starting bound, not a latency objective or promise that all configured retries/repairs fit. Remove the incorrect startup claim `(repairs+1)*(gateway+validator)` is a transport-inclusive worst case. Validate positive finite values and architecture maxima. Defaults for lower-level timeouts remain tuning inputs; every stage respects remaining time. Account for final validation/publication; a candidate claiming settlement before an unbounded database write is not a completed deadline guarantee.

Require configured positive `maxOutputTokens` for an enabled provider; no model-default unlimited generation. Model-specific thinking/reasoning budgets, if supported, are explicit in the fingerprint and accounting. Preserve input/output byte caps in addition to tokens. Capture finish reason and token usage; missing vendor usage is `null` plus `usageAvailable:false`, never zero. Reject truncated/safety-blocked output even if a substring parses. No unsupported endpoint/model/parameter assumption is inferred from stub success. SPK-01 verifies supported SDK/auth/endpoint/model/schema/deadline/retry behavior before shared enablement.

Persist/audit metadata: requested/selected mode+reason, request/source/config/authoring identity, baseline revision/evidence identity, writable/reused IDs, proposal/transport/repair counts, stage latencies, finish/cancel outcome, token usage availability, and actual generation/prompt/model/policy settings. Persist per-step immediate and original generation origins. Prompt/source/code/resolved values are excluded from ordinary logs; authorized candidate/source review remains through the API.

SDK choice is a maintained Google Gen AI SDK adapter behind this interface, gated by R2D2 compatibility; a legacy SDK exception requires a separately owned expiry and explicit release disposition. Do not hardcode an unverified replacement SDK version or model ID in C0. Dependency pin selection and wire evidence belong to B/SPK-01.

## 6. Strict runner verdict and deterministic action semantics

The existing closed ValidateResponse is mandatory: exact root keys `ok`, `validatorSchemaVersion`, `diagnostics`, `steps`, correct JSON types, no duplicate keys. Version must be a nonblank exact expected pin; missing/mismatch never substitutes a configured value. There must be exactly one step verdict per submitted source line, with integral `stepIndex` equal to its array position, boolean `ok`, and a diagnostics array. Each RunnerDiagnostic matches its existing closed schema; step-level indexes equal their containing step; artifact-level indexes are null or in-range.

Aggregate `ok` equals `(root diagnostics empty && every step ok)`. A true step has no diagnostics. A false step may have no diagnostics when an artifact-level failure prevented parsing it. Missing fields, extra keys, wrong types, bad indexes/counts, version mismatch, or inconsistent aggregate success are `VALIDATOR_UNAVAILABLE`, not repairable author mistakes. Entire validation response/body remains bounded. No malformed verdict can publish or contribute fabricated validation provenance.

Runner foundation decision F6: reject the `trial` key entirely, including `false`, for every permitted action. Remove typed/passed-through trial fields; no dry-run action is presented as executed. Existing other permitted options are unchanged by this decision.

F4: accepted assertion behavior follows the pinned Playwright 1.63.0 semantics. String `toContainText` and `toHaveTitle` normalize whitespace in actual/expected; regex comparisons use raw text. Where already supported (`toContainText`/`toHaveURL`), explicit `ignoreCase:true` or `false` overrides the regex `i` flag; absence preserves it. String `toHaveURL` expectations also receive native URL canonicalization before matching: the runner has no baseURL, so use `new URL(expected).toString()` when parsing succeeds and the original expected string otherwise; regex is unchanged. Do not invent a current-page/target baseURL or perform navigation to normalize an assertion. A future baseURL setting requires a configuration contract and matching conformance test. Value assertions retain their documented literal/regex semantics. Preserve negation, polling, deadline/cancellation and bounded regex rules; add no new methods/options. Real-browser conformance tests use the pinned Playwright assertion implementation as oracle, not the new helper under test. [Playwright locator assertions](https://playwright.dev/docs/api/class-locatorassertions), [page assertions](https://playwright.dev/docs/api/class-pageassertions).

Coordinate validator/language policy `2.0.0`, executor `2.0.0`, syntax reference `2.0.0`, and prompt `2.0.0` for these changed meanings/accepted options. Runtime artifact envelope stays 1; inference proposal envelope starts 1 independently. Record and test exact backend/runner/reference pin agreement. Prior policy-1 revisions are incompatible until rebuilt/reconfirmed under policy 2; neither reuse nor runner execution silently reinterprets them. Deployment controls prepare coherent API/runner versions before enabling new compilation/execution.

## 7. Confirmation, evidence, rollout, and handoffs

V2 confirmation asserts `compileRequestId`, `revisionId`, `artifactHash`, `sourceRevision`, `configurationRevision`, and `authoringHash`. Validate all against one current immutable candidate plus draft state. V1 confirmation still asserts its existing four fields, but server also verifies its candidate's unique request/snapshot and current source/config revisions. The absence of a v2 client field cannot bypass server invariants.

A source/config/scope change invalidates current passing evidence. Keep old revision results historical; late old-run completion cannot mark a newer draft green. Fresh execution is always FULL in a fresh browser after explicit Run. A candidate confirmation is neither runtime verification nor permission to start a browser on save. Scope attestation/review is not a semantic-quality badge.

`studio.compile.gateway.enabled` stays false until live gates. Add `studio.compile.incremental.enabled` default false, independent of gateway enablement. Disabling incremental selects the corrected full path; it does not rewrite compatible confirmed artifacts. Full config-only reuse remains available. Enable v2 authoring only after compatible writers and additive schema are present; V19 has an explicit incompatible-writer cutover and compatible-binary rollback floor. Local object evidence stays filesystem; remote evidence uses AWS S3 with provisioning separate.

Implementation gates: 10.20 records C0 decisions/traceability; 10.21 runner foundations can proceed from §6; backend/gateway/data stories consume the frozen boundaries above; incremental integration requires foundations plus bounded inference; frontend uses the frozen OpenAPI via MSW; the QA-owned oracle specification precedes harness implementation and live evaluation. Coordinator assigns exact shared-file owners and serializes migrations/builds. No subagent may loosen this contract to accommodate its producer without Aria review.

Hard correctness invariants (no malformed acceptance, no out-of-scope patch, no post-deadline retry, no identity/authorization crossing, all planted semantic mutations detected) are fixed. Numerical live quality, latency, capacity-recovery and cost objectives remain **proposed pending Pax/Aria agreement before observing live results**; Quinn owns their measurement definitions and held-out cases. Missing targets/live prerequisites keep release gates closed but do not prevent local implementation.

### C0 evidence and remaining external decisions

This contract incorporates Dara's request/candidate/content-identity, V18/V19, append-only ID, immutable-snapshot and baseline-query recommendations, plus Quinn's independent oracles and telemetry requirements. Validate OpenAPI references and representative good/bad proposal envelopes before story readiness. No live R2D2 request, model-quality claim, migration application, deployment, or production approval is implied.

Remaining external decisions are approved gateway SDK/model/capabilities, deployment credentials/vault/target/evidence prerequisites, and agreed live SLO/cost thresholds. These have explicit B/F/release owners. They are not permission to bypass disabled flags or substitute test transport evidence for live evidence.

Local contract verification on 2026-09-16: proposal schema compiled with AJV 2020 strict mode and UUID format validation; 12 valid/invalid envelope cases passed (generated, patch, unsupported, clarification, illegal mixed outcome, missing ID, empty/oversized code, unknown fields, wrong version and empty steps). All 53 OpenAPI references resolved, all six operation IDs were unique and marked unimplemented, and both YAML files parsed with duplicate-key rejection. `git diff --check` passed for this contract's files. These checks validate schema integrity, not dynamic scope/authorization semantics or implementation behavior; the latter remain story regression obligations. Temporary check scripts were `/tmp/studio-c0-contracts.cjs` and `/tmp/studio-c0-validate.cjs`.

### Implementation review amendments (2026-09-16)

Unknown live/recovered proposal, repair, transport and elapsed counters are nullable; known refused work records zero. A committed request-linked candidate is recoverable even when the process stopped before writing its outcome. Expired attempts without a candidate resolve failed; neither case invents token usage or overwrites write-once telemetry. Final candidate publication rechecks the captured deadline at the last CAS and rolls back the entire transaction after expiry.

V2 mutations inherit the existing public idempotency filter. This filter is replica-local for authoring requests, as for v1; it does not claim durable cross-replica compile idempotency. Execution retains its separate durable ledger identity. V2 save persists only; the explicit Compile changes/Rebuild all steps actions invoke generation, preventing duplicate save-triggered requests.
