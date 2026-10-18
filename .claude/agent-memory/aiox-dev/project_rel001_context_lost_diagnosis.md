---
name: rel001-context-lost-diagnosis
description: STUDIO-OBS-015 REL-001 - attempt03 CONTEXT_LOST has no cause on disk; 2026-10-17 reproduction run did NOT reproduce it (H1 unproven); where patches/results live
metadata:
  type: project
---

attempt03 `GuidedPublicationReplayIT` test 1 failed with runner CONTEXT_LOST at the first context push (session 7a055510). Diagnosis 2026-10-16 (read-only) is in `docs/qa/evidence/STUDIO-OBS-015/execution-20261015/runner/rel001-rootcause01/` (`root-cause.md`, `fix.patch`, `fix-a-cause-preservation.patch`, `fix-b-probe-readiness.patch`, `manifest.json`).

- Cause NOT proven. Verified at diagnosis: runner answered in 1.98 s; Chrome spawn to UI-ready 0.887 s vs 0.216-0.279 s for the other 18 launches; exit 63 ms before the refusal; no kill/crash logged. Prior for H1 (`verifyBrowserPreferences` reads `chrome://version` `#profile_path` before the page fills it) was 35 percent.
- Certain defect D1: the cause is dropped at 5 sites and never logged. Patch A keeps `cause`, records `phase`/`loss`, logs one value-free `GUIDED_START_FAILED {...}` line from `transport.ts`.
- 2026-10-17 reproduction (results in `rel001-rootcause01/repro/results/verdict.md`): variant a, real guided start path, 2003 starts on Node 24.20.0 in 6 load modes + partial mem: 0 failures; version probe 1500 launches: page ALWAYS fills after `load` (4.5 ms idle, up to 1.9 s under throttle) yet 0 empty reads at the pre-patch read moment. Slow Chrome alone at attempt03 size (spawn-to-UI-ready median 0.81 s, 300/300 pass) is not sufficient. Node 23.10.0 parity: 0 CONTEXT_LOST in 300. H1/H2/H3/H6 unproven. Patches A and B build, type-check (whole project), lint, unit tests pass in scratch.
- Recommendation given: A required; B is hardening, not proven fix (A+B recommended, A only defensible). Not exercised: cold first launch, Spotlight I/O, real JVM/HTTP/recorder.
- Only anomaly: launch hang in LAUNCH (>90 s, close also hung) under extreme background-QoS starvation (D4, no launch deadline); different shape from attempt03.
- `test/run/confinement.test.ts` (AC-25): unit tests may not load `src/run/browser.ts`; hence the Playwright-free `src/run/versionProbe.ts` seam in patch B.

**How to apply:** if a guided CONTEXT_LOST at assign/context recurs, grep `guided.log` for `GUIDED_START_FAILED` (after patch A) before theorising; `phase` and `links[].code/kind/signal` name the cause. Do not re-run the same stress matrix hoping for a different answer; the open conditions are the cold first launch and the real ReplayIT environment. Related: [[inherited-daemon-chrome-abort]], [[macos-unified-log-chrome-timing]], [[rel001-repro-harness-gotchas]].
