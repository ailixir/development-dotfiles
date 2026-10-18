---
name: obs009-011-prep-plan
description: 2026-10-16 prep plan for 009 local ACs/010 Live surface/011 — hidden hot spots (4 ITs spawn guidedMain, dist shared with 008), deleted co-run + dead benchmark harness, recommended A/B rulings
metadata:
  type: project
---

Plan at docs/qa/evidence/STUDIO-OBS-009/prep-20261016/{implementation-plan.md, lanes.json, t0-questions.md}. Recommendations only; re-issue as rulings at 009 W0 on the post-008 tree.

- Hot spot: 4 backend ITs (GuidedBridgeIntegrationTest, GuidedBridgePlannedIT, GuidedPlanningIntegrationTest, GuidedPublicationReplayIT) spawn `dist/run/guidedMain.js`; ReplayIT also uses an http replay runner. The AC-1 fold + AC-3 TLS must land atomically with their spawn switch (lane I).
- `studio-runner/dist` is a shared runtime artifact with 008's backend ITs: no 009 rebuild during 008.
- StudioCoRunIT and its support classes are deleted, but tools/corun.sh still points at them. evaluation/lifecycle.mjs drives the removed /compile routes. Both harnesses must be rebuilt in 009, not "extended".
- Recommended rulings:
  - no plaintext runner listener; dedicated StudioRunnerTls, not the JVM default SSLContext;
  - `@Profile("!api | worker")` for reaper/coordinator;
  - TF-3 option (ii), because the projection reads readiness via separate JDBC statements;
  - P2 re-points the public RuntimeVersions field meanings (no rename);
  - FM-01 is scoped to the target and its ancestors, with an allowlist and a work cap;
  - AE-01 has no echo scrub;
  - R10c mirrors R8 and keeps 008 replayFailure null.
- Open risk [I]: 7 proposals/session at production ceilings may stop 10-step learns. Measure with the fixture provider before T4.

**Why:** these are the facts that make naive lane splits collide or make the benchmark measure artifacts.
**How to apply:** when 009/011 dispatch starts, check lanes.json batons and the F-merge atomic sets first. Related: [[r8-preready-selfstop-ruling]], [[single-path-decision]].

Update 2026-10-17: re-issued as binding rulings, with corrections (no capacity or policy-hash key; coordinator @Profile on its @Bean; A13 closed by D4), in [[obs009-t0-rulings]].
