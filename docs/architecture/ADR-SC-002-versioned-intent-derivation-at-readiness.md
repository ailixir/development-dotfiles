# ADR-SC-002 — Versioned intent derivation at execution readiness

| Field | Value |
|---|---|
| Status | Accepted for Story 10.42 (2026-09-18) |
| Author | @architect, reviewed by Astra planning subagent |
| Source of truth | [ADR-SC-001](ADR-SC-001-runner-owned-intent-correspondence.md), Story 10.41 final gate, Studio context specification |
| Amends | ADR-SC-001 prohibition on reparsing during dispatch: version-bound verification from immutable revision inputs is permitted before acceptance |
| Does not amend | Artifact schema v1, expected-intent wire v1, runner operation vocabulary or public authoring v2 contract |

## Context

Story 10.41 binds generated Playwright to a persisted expected-intent snapshot and makes the runner
compare parsed operations exactly. Execution readiness validates the snapshot's closed structure,
source text, indexes and stable step identities. It cannot prove that a valid-shaped operation still
means what the immutable authoring requested. A changed URL or locator can pass readiness, create
execution and dispatch-ledger state, and only then be refused by the runner.

ADR-003 correctly forbids reparsing the current mutable draft during dispatch. The missing
distinction is between mutable reinterpretation and deterministic verification of an immutable
revision under the exact derivation rules that produced it.

## Decision

Compilation and readiness use one pure, bounded, explicitly versioned authoring-intent deriver.
The derivation version covers the supported-English parser, scoped-context resolution, evidence
scope, operation assembly and JSON canonicalization rules.

Compilation derives expected intent before the LLM call and persists both the canonical snapshot
and `intentDerivationVersion` in immutable candidate provenance. Readiness reads one consistent
candidate revision, selects the recorded derivation implementation, derives intent only from that
revision's immutable source, authoring, CSI and configuration environment, and compares canonical
JSON exactly with the saved snapshot.

Readiness continues to dispatch the saved snapshot. Reconstructed intent is verification material
only and never rewrites a revision or becomes an execution payload.

Missing, unknown or invalid derivation provenance, invalid authoring, derivation diagnostics, or a
canonical mismatch returns bounded `COMPILE_REQUIRED` before execution, quota admission, ledger,
reference resolution, vault, runner or browser activity. An unsupported recorded derivation version
may use the existing `RUNTIME_INCOMPATIBLE` refusal when version incompatibility is the only cause.

Derivation has no repository, LLM, browser, runner, network or vault dependency. Contextual secrets
remain opaque identifiers.

## Canonical comparison

- JSON object keys are sorted; array order and string bytes are preserved.
- Duplicate keys, trailing documents, unknown fields, invalid types and excessive depth fail.
- Expected-intent semantics match exactly: operation count/order, locators, values/references, keys,
  assertions and options.
- Playwright default normalization is not applied here. It remains a runner artifact-comparison
  concern.
- Explicit byte, step, collection and nesting limits apply before traversal.

## Versioning and persistence

The initial pin is `intentDerivationVersion: "1.0.0"`. A semantic change anywhere in the derivation
pipeline requires a version bump and preserved implementation or explicit recompilation policy.
There is no implicit fallback to the current implementation.

A forward V23 migration adds the derivation version to revision identity/deduplication and protects
it as write-once provenance. Historical legacy revisions without authoring remain compatible.
Historical authoring-v2 revisions without a supported derivation version require recompilation;
the migration does not invent provenance.

## Alternatives rejected

1. **Co-stored SHA-256.** It detects accidental byte drift only if the digest remains trustworthy;
   it does not prove that intent came from authoring.
2. **Keyed MAC.** It addresses a stronger hostile-database threat and adds key rotation without
   proving that the compiler derived correct semantics.
3. **Runner preflight at readiness.** It proves artifact/intent agreement, not authoring/intent
   agreement, and adds a network dependency before acceptance.
4. **Parse the current draft.** Draft edits and parser drift would change confirmed meaning.

## Consequences

Readiness can reject semantically corrupted or obsolete v2 candidates before durable execution
effects. Compilation and readiness cannot silently drift because golden fixtures bind each
derivation version. Live-page learning, broader English, cryptographic database authentication and
new runner operations remain separate work.
