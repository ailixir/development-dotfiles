---
name: obs015-backend-test-gotchas
description: STUDIO-OBS-015 backend IT gotchas: partial ReplayIT selections always fail at class level, bridge IT direct admissions conflict with the single-path translation gate
metadata:
  type: project
---

Partial `GuidedPublicationReplayIT` selections always record a class-level `executionError`. The class is `@Order`ed and its `@AfterAll` audit scan requires the OBS-007 canaries. So a single-method ReplayIT run can never show green; only full lanes count (about 18 min per lane).

`GuidedBridgeIntegrationTest` hand-crafts admissions. Under single path, sessions with translation state require planner obligation admissions (`attachAdmission`, `MISSING_SOURCE`). As of 2026-10-16, 29 bridge cases were BLOCKED pending an architect ruling (w2-window01).

**Why:** both cost a wasted run or a mistaken diagnosis in w2-window01.
**How to apply:** do not treat a partial ReplayIT `executionError` as a regression. Before fixing bridge cases, check whether that ruling has landed.
