---
name: tooling-adr007-shape-conversion-recipes
description: ADR-SC-007 WI-3 - converting tests/fixtures from nodeId+locator to outline/ref/facts shapes; unit-scoped converter, JoinedRefs, scripted-model by outline line, hung-IT diagnosis
metadata:
  type: project
---

From WI-3 (2026-10-27):

- **Fixture converter** (`docs/qa/evidence/adr-sc-007/wi-3/tools/fixture-convert/shape.cjs`): a global node index collides across fixture units (two units can reuse a node id with different roles); the converter builds its index per fixture unit (any object holding `basis.observations`). Symptom of the old bug: a control-value fixture with the wrong element role after conversion. `control-value-reference` is by design not publishable (read gate: no text -> INVALID_CONTRACT; controlValue recipe -> REFERENCE_MISMATCH); the test `aControlValueReadIsNotARecipeTheBackendEverAdmits` pins it.
- **Scripted model replies in joined ITs** now read `context.observation` as the outline TEXT (`asText()`), not an object: `JoinedRefs.shown(outline)` gives lines with refs (`role()`, `name()`, `ref()`), `refInOutline`, `refByName`. Targets are `{kind:"node", ref}`; a clarification choice meaning is `{obligationId, ref, bindingId}`; a model-facing read carries no `recipe`. Password controls are ref-less lines with role token `passwordControl` (count them with `GuidedOutline.parse`).
- `GuidedInternalSecurity.Identity` is package-private; tests outside the session package use `session/GuidedTestIdentities`. The guided HTTP client requires https, so a runner double needs the TLS `RunnerDouble` (`RunnerTestTls.shared()`).
- **Hung IT diagnosis**: a `finally` that awaits a latch hides the first failure and the test hangs; jstack the Gradle test worker, find the latch wait, then look for the earlier exception. Cause here: a `/prepare` stand-in that returned no `target` (the cross-check refuses a node ref with a null target).
- `Set.of(...).contains(null)` throws NPE; guard nulls before using immutable-set membership on a nullable gate name.
- checkstyle rejects gjf's switch-expression indentation on some shapes: move the switch into a small `private static` helper method.

**How to apply:** any further test or fixture conversion on the studio-observed contracts, or WI-4 joined ITs. Related: [[tooling-contract-reseal-merkle-and-ripple]], [[tooling-scratch-gradle-stale-dist-and-cold-cap]].
