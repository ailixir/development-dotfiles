# ADR-SC-001 — Runner-owned semantic intent correspondence

| Field | Value |
|---|---|
| Status | Superseded by [ADR-SC-003](ADR-SC-003-structural-reference-policy.md) (2026-09-22); originally accepted for Story 10.41 |
| Author | @architect, reviewed by Astra planning subagent |
| Source of truth | [Studio context specification](../specs/studio-context/spec.md), [Studio execution architecture](studio-execution.md), [ADR-002](ADR-002-internal-contract-surface.md) |
| Amends | `docs/specs/studio/openapi.yaml` internal `ValidateRequest` and `RunJob` contracts |
| Does not amend | Artifact schema v1 or the public authoring v2 contract |

## Context

The backend resolves saved plain-English steps and authoring context before it asks the LLM for a
candidate artifact. The runner independently parses each candidate's permitted Playwright subset
into typed operations. Story 10.39 attempted to compare those concerns in Java by searching the
generated source. That comparison accepts extra actions and cannot reliably bind a value, locator,
key, assertion kind or option to the operation that uses it.

The runner also authorizes variable and secret use only from tokens embedded in `originalText`.
Authoring v2 permits an opaque reference to be selected by step context. The canonical login flow
therefore cannot use its contextual username and password even though the backend resolved and
authorized them.

## Decision

The backend owns the **expected intent** and the runner owns its **semantic comparison**.

The backend assembles a closed, versioned `expectedIntent` document from trusted resolved authoring
input before any LLM call. The document contains one entry per source step, its stable step ID and
the exact ordered typed operations expected for that step. It uses the runner's existing operation
vocabulary, including complete locator chains, decoded literal/reference values, keys, assertion
kinds and semantic options. It never originates from generated code or an LLM explanation.

`POST /v1/validate` and `RunJob` gain an optional `expectedIntent` member. Legacy calls may omit it.
Authoring-v2 compilation and execution require it. The runner compares its already parsed
`Operation[]` with the expected operations using exact ordered equality after only documented
default normalization. The validation response remains diagnostics-only.

The candidate revision stores the canonical expected-intent JSON that passed runner validation.
Confirmation and dispatch read that immutable snapshot; they never parse the current draft again.
An authoring-v2 revision without a valid snapshot must be recompiled.

Context-selected references are authorized per step by that step's expected operations. The runner
still requires each reference to appear in the artifact-level declaration and in an allowed
argument position. A reference expected by another step, or merely present in unrelated context,
grants no permission. Legacy source-token authorization remains unchanged when expected intent is
absent.

The runner repeats the same correspondence check in `runCoordinator.submit` before capacity,
admission, scratch allocation or browser launch. Execution continues to consume only the typed
operations produced by the validator, and one run retains one browser context so login state is
available to later protected-page steps.

## Contract and normalization rules

- `expectedIntent.schemaVersion` is `1`; unknown versions fail closed.
- Step indexes are contiguous and align exactly with source. Step IDs are unique UUIDs.
- Operation count and order must match exactly. Extra, missing and reordered operations fail.
- Locator segment count, order, kind and arguments match exactly.
- Literal bytes and reference kind/identifier match exactly after JavaScript string decoding.
- Press keys and assertion kinds match exactly. URL equality and containment are distinct.
- Omitted semantic booleans normalize only to their documented Playwright defaults. Explicit
  behavior-changing options such as `force`, `trial`, non-left button, multiple clicks, relaxed
  `exact`, regex broadening or assertion options must be expected explicitly or fail.
- Runtime timeout ceilings remain policy-owned. An omitted timeout and the policy default may be
  treated as equivalent; an artifact cannot enlarge the ceiling through intent normalization.
- The document is bounded by the existing request body and step/statement limits and receives an
  explicit serialized-byte bound in runner policy.

## Security properties

- Expected intent stores secret identifiers only. Secret values never enter prompts, artifacts,
  expected intent, diagnostics or logs.
- Existing CSI, environment, principal, vault and declared-reference authorization still applies.
- The LLM cannot broaden reference permission because it cannot produce expected intent.
- A validation success cannot be replayed with different expectations because the exact snapshot
  is persisted with the immutable candidate revision and sent again at execution.

## Alternatives rejected

1. **Repair the Java substring matcher.** This duplicates the runner's TypeScript parser, remains
   vulnerable to source-shape ambiguity and still leaves execution revalidation unaware of intent.
2. **Return parsed operations to Java.** This expands the trusted wire surface and makes Java own a
   second semantic comparator. The runner can compare locally and return bounded diagnostics.
3. **Put expectations inside `references`.** `ReferenceDeclarations` deliberately has only
   variables and secrets; combining authorization declarations with behavioral intent weakens both
   contracts.
4. **Reparse authoring during dispatch.** Parser changes or later draft edits could alter what a
   confirmed revision means. The compiled snapshot is the stable authority.

## Consequences

This change crosses backend compilation, persistence and dispatch plus runner validation and run
admission. Those parts must ship under one contract story. Legacy requests remain compatible.
Broader free-form English and live-page learning remain later work; this ADR secures the semantic
boundary they will use.
