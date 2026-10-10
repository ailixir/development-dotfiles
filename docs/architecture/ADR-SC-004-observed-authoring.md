# ADR-SC-004 — First guided Run and immutable observed plans

| Field | Value |
|---|---|
| Status | OBS-001–004 independently closed; OBS-005 amendment proposed for readiness review |
| Date | 2026-10-08 |
| Scope | Historical observed v1 plus closed OBS-004 observed-2 bridge; public `/api/v3/studio/guided-sessions` |
| Amends | Separate Learn → compile → confirm lifecycle in Studio context specs, **only for this guided path**; ADR-SC-003 reference derivation for hidden bindings in this path |
| Preserves | Existing authoring v2/manual confirmation, artifact v1 and ordinary LLM-free saved replay |
| Decision source | [Approved expert consensus](../specs/studio-observed-authoring/consensus-plan.md), [review record](../specs/studio-observed-authoring/review-record.json) |

## Decision

The user's Run authorizes interpretation and one actual execution of the displayed immutable checklist within the configured principal/CSI/environment/application/account/origin scope. The backend snapshots this scope and records a scoped Run authorization. The model proposes typed operations against sanitized current observations; it cannot grant authority, supply code, resolve account credentials, or change the checklist.

The runner observes each reached page state and binds one unique current node to the proposed durable locator before dispatch. Each source step has a stable ID and zero-based action ordinals. A server-issued hidden binding describes an earlier local read and its later argument consumers. Actual values stay in the isolated run; no capture tokens or user variable declarations are required. The English regex grammar removed by ADR-SC-003 remains removed.

The durable backend ledger records admission before dispatch. The runner consumes a fenced admission exactly once before browser invocation. Ambiguous transport/crash outcomes stop as `UNKNOWN_OUTCOME`; they never automatically repeat browser work. This guarantees at-most-once dispatch, not exactly-once effects in arbitrary applications. Read-only observation/model repair may retry within the original session budgets before admission.

After every authored step and assertion succeeds, finalization atomically publishes the exact exercised plan, deterministic lowered artifact and admission provenance, provided source, configuration, authorization, policy, ownership and expiry still match. Finalization performs **zero browser actions and zero model calls**. It does not replay, schedule or automatically retry the website to repair a publication conflict. On conflict: **“Run completed; steps not ready to repeat.”**

A later deliberate Run uses the compatible published plan, reads fresh local values, and executes with no LLM call. Drift stops and offers a new explicitly initiated guided Run. First-run evidence says “learned from this run”; only a successful later replay says “saved steps replayed.” Evidence binds its actual immutable revision and execution. Schedule activation remains a separate explicit operation against a selected revision.

## Trust and data boundaries

The backend authenticates user/service identities, checks current CSI and account entitlement, owns the ledger and gateway credentials, and issues admission/binding IDs. The runner owns the live browser, fixed collector and ephemeral value store. Public API DTOs expose safe progress, clarification and evidence references, never internal worker ownership or raw observations. Page labels are untrusted model data; runtime admission is authoritative.

A positive configured field/region rule authorizes nonsecret input reads; merely being `type=text` is insufficient. Password/hidden fields, secret regions, current values, cookies/storage, handlers and raw DOM never reach model inputs. Labels/descriptions undergo the same sanitization and known-value scrubbing. Unknown PII detection is not guaranteed. Video is a distinct sensitive channel and is outside textual redaction claims.

Both HTTP and HTTPS application origins remain supported, including local fixtures. Canonical origin validation and destination authorization are separate from transport security on public/internal control APIs. No new restriction silently removes the repository's existing HTTP application capability.

## Alternatives

Static HTML compilation cannot ground later states. LLM-driven replay loses deterministic repeatability and increases disclosure/cost. A separate mandatory learning/confirmation cycle contradicts the approved single-Run experience. All three are rejected for this path. Existing optional authoring hints and advanced saved inputs remain compatible but cannot substitute for current evidence.

## Versioning and rollout

The [contract specification](../specs/studio-observed-authoring/contracts/README.md) is normative for fields, state machines, hashing, limits, errors and deployment. Schemas are closed and exact-versioned. Observed contract/plan/policy/lowering start at 1; hidden reference policy is 3; the new artifact envelope is 2 with `observed-1` language/executor compatibility identifiers. These are **reserved contracts, not claims that deployed runners support them**. OBS-006 must implement and pin the restricted lowering/artifact schema before any observed plan can become runnable. Legacy artifact v1/reference policy 2 are unchanged.

No application behavior changes in OBS-001. Implementation of collection, persistence, runner control, translation, publication, auth and UI remains in OBS-002 through OBS-008. Contract tests are not live execution, model-quality, privacy-wire-byte or human-pilot evidence. OBS-009/010 retain those gates.

## Acceptance traceability

| AC | Contract evidence |
|---|---|
| AC-1 | This ADR's Decision and Alternatives; no hidden replay/schedule rule |
| AC-2 | `observation`, `action`, `binding`, `learned-plan`, `session`, `ledger`, `clarification`, `result`, `revision` schemas; hashing and correspondence sections |
| AC-3 | Session/action state transition tables; finalization transaction and idempotency/fencing rules |
| AC-4 | Read/dataflow rules, origin normalization, complete limits table and runtime-value test vectors |
| AC-5 | `openapi.yaml`, `commands` and `session-view` schemas, MSW consumption examples and error mapping |
| AC-6 | `fixtures.json`, `tools/check-studio-observed-contracts.cjs`, mapping and rollout procedure |

## INPUT-POLICY-01 amendment — approved branch A

The user answered **yes** to sharing nonsecret literals deliberately written in immutable checklist source. The [decision record](../../.aiox/waves/STUDIO-OBSERVED/input-policy-01.json) is final for this scope. The gateway may receive that source after trusted source classification and screening. It must never receive resolved secrets, saved-variable values, account material or runtime/page captures, including through repairs or diagnostics. Reference names remain opaque. Authored text is permission to interpret, not model authority to invent literal bytes, grant destinations or classify sensitive material. No mandatory happy-path field mapping or English regex grammar is introduced.

[Translation design](../specs/studio-observed-authoring/translation-design.md) specifies dedicated guided request/response types alongside the existing FULL/PATCH compile API, immutable source/configuration projection, exact-span server allocation, durable planning/clarification state, independent structural verification and the actual closed bridge dispatch. Source provenance, slot validation and observed evidence constrain proposals without proving arbitrary-English intent. OBS-005 must implement its concrete production source/classification/gateway/verification components; only account connection (OBS-007) and publication/lowering (OBS-006) remain the agreed later ports.

The initial versioning and acceptance sections above describe the original OBS-001 decision, not a current assertion that OBS-004 is unimplemented. OBS-004's accepted source digest is `sha256:765212d573673085c38959683862aca11cda58b7f1998c51885a10975455661d` (92 backend, 1269 runner unit tests, 273 fixtures). Historical manifests, fixtures and gates retain their original bytes. This amendment changes no schema, backend or runner behavior and grants no new QA/readiness verdict.
