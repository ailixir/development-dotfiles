---
name: obs015-bridge-planner-authority
description: STUDIO-OBS-015 2026-10-16 bridge IT ruling — planner-authority line for tests (no seeded plan/obligation rows), process-stop helper, 16 migrate/12 retire/1 obsolete, F-1 dormant no-translation admission branch
metadata:
  type: project
---

On 2026-10-16 the 29 GuidedBridgeIntegrationTest `MISSING_SOURCE` failures were ruled. Full text:
docs/qa/evidence/STUDIO-OBS-015/execution-20261015/backend/w2-window01/aria-bridge-ruling01/ruling.md.

Outcome:
- 16 cases MIGRATE to a new class, GuidedBridgePlannedIT.
- 12 RETIRE, each with a cited covering test.
- 1 RETIRE-OBSOLETE: a forged "trusted question fixture". With translation installed, `clarify` needs a
  clarification-context row.

Rules a test must follow:
- Never insert plan, obligation, manifest or translation-state rows.
- Never call `store.acceptPlan`, `reserveObligation` or `attachAdmission`.
- A controlled provider is lawful, because the model is the untrusted boundary.
- A Mockito spy that throws `process-stop` from `GuidedDispatchService.prepareAndAdmit` gives a genuine committed
  reservation. The test then admits it over the production internal route.
- Hand-crafted proposals are allowed only as negative probes.

F-1: GuidedSessionService has branches that only run when translation is absent (:1375 and others). Production never
reaches them. GuidedSessionIT and TransportFaultIT admit through them. Treat their evidence as post-admission only.

**Why:** ADR-SC-005 single path. Seeding authority would let tests pass for proposals that production refuses.

**How to apply:**
- For any future test that needs an admitted action, use the planner helper pattern.
- Before re-deriving, check whether F-1 has been placed or closed.
- Related: [[obs015-h8-h6-rulings]].
