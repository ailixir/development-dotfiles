---
name: link-valued-cell-read
description: Wikipedia infobox value (link inside td) failed at runner prepare (NO_DURABLE_LOCATOR), not at a backend gate; diagnosis recipe and fix location
metadata:
  type: project
---

2026-10-29: Wikipedia step "Copy the Designed by value" ended UNSUPPORTED_SURFACE although the backend ADMITTED the proposal (read of the value link, intent path SCOPE_EVIDENCE). Failure was the runner's prepare: synthesize returned LOCATOR_GENERATED_ONLY because table-title read locators exist only for a `td` target (length-5 chain, checkFrozenSourceContext, identity cell). A link-only td has no shown ref, so the model could only name the link.

Fix: perceive.ts marks a link-only data cell (`linkValueCell`), shows its ref (+ text from the link), strips the link's readScope. Test: test/fixtures-tier/perception/infoboxLinkRead.test.ts (fixture + `ZZ` live-page recipe: session.observe + prepareTarget + invoke in a perception-tier test).

**How to diagnose next time:** session `progress.refusalGate` (psql on the isolated stack, `postgres` db, user postgres) names RUNNER_* gates = runner prepare refusal; `studio_guided_obligation_admissions` row present = backend admitted. Add a temporary stderr line in observationFlow.prepare to see the synthesis reason, then restore from a saved copy.

parity.test.ts in the perception tier has 14 pre-existing failures (directValueOnly on a collector fact) independent of perceive.ts.
