# ADR-SC-003 — Structural reference policy replaces English-derived expected intent

| Field | Value |
|---|---|
| Status | Accepted for Story 10.44 (2026-09-22) |
| Supersedes | [ADR-SC-001](ADR-SC-001-runner-owned-intent-correspondence.md), [ADR-SC-002](ADR-SC-002-versioned-intent-derivation-at-readiness.md) |
| Does not amend | Artifact schema v1, the runner's default-deny operation vocabulary, public authoring v2 contract |

## Context

ADR-SC-001 and ADR-SC-002 bound every authoring-v2 revision to an `expectedIntent` snapshot derived
by `SupportedEnglishIntentParser`, a regex grammar over the author's English. Compilation refused to
call the model when a step missed that grammar, and the runner rejected any generated operation that
did not match the regex-derived one.

That grammar is the hand-written English translation layer the BRD excludes. It blocked ordinary
plain-English steps before translation and reduced the approved model to formatting what the
grammar had already decided.

`expectedIntent` also carried a second, legitimate duty: authorizing the variable and secret
references a step selects through its structured context rather than through `<var>`/`<secret>`
tokens in its text.

## Decision

1. The English grammar, scoped intent resolution, expected-intent assembly and the runner's
   `EXPECTED_INTENT_MISMATCH` check are removed. Plain-English steps go to the approved model.
2. Reference authorization moves to a **structural reference policy** derived only from structured
   authoring data, never from English:
   - `required` = `<var>`/`<secret>` tokens in the step text plus the step context's
     `variableRef`/`secretRef` entries;
   - `allowed` = `required` plus global-context references and contextual-default variables.
   The runner reports `REFERENCE_MISSING` for an unused `required` reference and `REFERENCE_EXTRA`
   for any reference outside `allowed`.
3. The ADR-SC-002 integrity binding is kept, applied to the policy: compilation persists the policy
   and its derivation version; confirmation, readiness and dispatch re-derive it from the immutable
   revision and refuse with `COMPILE_REQUIRED` on any mismatch. The derivation version is `2`;
   revisions derived under version `1` require one recompile.
4. The runner's default-deny code validator remains the execution safety authority for generated
   code. Secrets are additionally bound at run time to origins declared on the secret itself: the
   Vault entry's `allowedOrigins` key reaches the runner as `RunJob.secretOrigins`, and `fill`
   refuses with `SECRET_ORIGIN_NOT_ALLOWED` when the page origin is not listed (fail closed).
5. This ADR is the ADR-002 Class B ruling for the two closed-contract additions it introduces:
   `referencePolicy` (validate request and `RunJob`, replacing `expectedIntent`) and
   `RunJob.secretOrigins`.

## Consequences

- Authors are no longer limited to a fixed phrasing; unsupported *behaviour* is still rejected by the
  code validator, with step-level diagnostics.
- Every confirmed authoring-v2 revision must be recompiled once.
- The derivation is pure and structural, so it cannot drift with English phrasing and needs no
  fixture sentences.
