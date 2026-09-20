---
name: corun-leg2-attribution-gap
description: After DEF-05 the co-run goes green, but a malformed dispatch body is misattributed by StudioCoRunIT as "runner recorded NOTHING"; the runner does not log JOB_INVALID refusals
metadata:
  type: project
---

On `feat/studio-v1-dispatch` (2026-09-18) the DEF-05 bearer fix plus a runner admissionId fix (`adm-...` → `randomUUID()`, the contract says `format: uuid`) made `tools/corun.sh` 4/4 green. The admissionId defect was masked by DEF-05: an unauthenticated dispatch never reached the admission CAS, so the API's 400 on a non-UUID never showed.

Story 10.35 AC-3 mutation (drop `manifestKey` from the body) gives ledger `DONE`, execution `ERROR/DISPATCH_FAILED`, but `whatTheRunnerSaidAboutTheDispatch` reports the SECOND shape ("recorded NOTHING … suspect the address"), not the third ("objected to WHAT it was sent"), because the runner emits no log line for a body refusal.

**Why:** AC-3 cannot go green on attribution until the runner logs its `JOB_INVALID` refusal (or the harness reads the status code).
**How to apply:** do not read a leg-2 "recorded NOTHING" as an address problem when the ledger is `DONE`/`DISPATCH_FAILED` — that combination means a 4xx the runner did not log. Related: [[project-epic10-falsification-standard]].
