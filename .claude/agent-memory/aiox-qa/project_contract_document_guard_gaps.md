---
name: contract-document-guard-gaps
description: Three standing holes in how put-checks tests guard docs/specs/studio/openapi.yaml — no $ref resolves, no example is validated, and several "the document says" assertions hold transcribed literals
metadata:
  type: project
---

Measured on story 10.31 (2026-09-17), each by a mutation that left every suite green. They are
**epic-wide**, not one story's, so expect to re-find them on any story that edits `openapi.yaml`.

**1. Nothing anywhere resolves a `$ref`.** Repointing *both* `getExecution`'s and
`getExecutionVideo`'s `403` at `#/components/responses/NoSuchForbidden` leaves the backend window
98/0, the frontend studio-mock suite unchanged and the runner's `contract.test.ts` 15/15. The
backend has no OpenAPI parser in its tests; the runner's `$ref` resolution runs against
`STUB_CONTRACT`, not the real file; the frontend's `componentValidator` only reaches
`components.schemas`. Consequence: any `$ref`-equality guard (10.31's AC-5) is satisfied by two
strings that are wrong together.

**2. No standing validation of `examples`, despite ADR-002 §18.5.** §18.5 asks each added example to
be validated against its schema; in practice that is a one-off act at implementation time. Breaking
the `sessionRequired` example so it violates its own `PlatformErrorResponse` leaves everything
green. This is the run log's `PIN-1` shape one step further along — the copy is not even compared.

**3. "The declared example's X" assertions that assert a transcribed literal.** `ExecutionVideoEvidenceIT`
asserts `isEqualTo("VIDEO_STORE_UNAVAILABLE")` under an `.as(...)` reading *"the declared
storeUnavailable example's code, ADR-002 §24.6"*. Changing the document's example code **and**
message leaves the suite green. The codebase does this correctly elsewhere —
`studioContract.test.ts` reads 404/410/416's expected code out of `examples[...].value.error` — so
the correct pattern exists and is simply not applied uniformly.

**Why:** all three let the *document* drift from the *producers*, which is the one direction a
contract test exists to catch; each guard catches only production drifting from the test.

**How to apply:** on any contract-editing story, run these three mutations before accepting the
guards. They take one Gradle window each. If a story adds a `$ref` comparison or an example, say in
the gate which of the three gaps it inherits. The fixes are one assertion apiece (walk every `$ref`
under `paths` and resolve it; walk every `examples` node and validate its `value`; read the expected
code from `ContractDocument`) — worth proposing once at epic level rather than story by story.

Related: [[epic10-vacuous-guard-shapes]], [[qa-review-verification-depth]],
[[epic10-gate-policy-non-green-baseline]]
