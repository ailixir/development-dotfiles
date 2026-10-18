---
name: obs009-lane-s-schedules
description: STUDIO-OBS-009 lane S (observed schedules, AC-6) - acceptance hunk is outside the S write set, so it ships as a baton; scratch-tree proof recipe; test-count and WireMock traps
metadata:
  type: project
---

2026-10-18, W2 lane S. The S write set in lanes.json lists `StudioAcceptanceService` as read-only, but it has an unconditional `scheduled != null -> OBSERVED_SCHEDULE_AUTH_REQUIRED` throw and then needs a manual `Prepared` grant. Lifting observed schedules needs a 1-hunk change there (`observed.prepareScheduled(test, revision, principal)` in place of the throw). Do not edit it; ship `baton-acceptance-scheduled-grant.patch` and prove green on a fresh rsync of the real tree plus the patch. The real tree is red (22 of 34) until F-merge lands it.

**Why:** the hard rule is "no edits outside the write set"; the lane plan predates OBS-015's acceptance reshape.

**How to apply:**
- Scratch proof: rsync `backend` (no build/.gradle) + `docs/specs/studio-observed-authoring/contracts/v3` only (the backend reads that dir in processResources), run through `with-gradle-lock.py` with a `cd scratch` wrapper (~1 min per run, fresh build). `git apply -p1` works outside a repo.
- `@SpringBootTest(webEnvironment = NONE)` fails to load in this repo (StudioInternalSecurityConfig needs MVC); use RANDOM_PORT.
- macOS `sed -i ''`; zsh does not word-split, so put file lists in a bash array script.
- `grep -c '@Test'` counts `@TestConfiguration`; the three-class set is 22 + 4 + 8 = 34 by XML.
- The shared WireMock `SERVER` in SharedSchedulingIT counts `/api/v1/execute` across tests, so a leftover port test turns an unrelated test red (`received 2`).
- A `StudioBackgroundAuthorization` wrapper with `localOnly()=false` is the way to test G-3 under profile `test`; G-3 refusal code is the existing V16 `BACKGROUND_AUTHORIZATION_DENIED`.
- Mutation that removed the `ui_tests` row locks was not caught: the schedule row serializes the edit too.

See [[tooling-scratch-tree-staged-unit]], [[tooling-gradle-focused-runs]].
