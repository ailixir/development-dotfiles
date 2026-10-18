---
name: obs011-t0-prep
description: 2026-10-18 OBS-011 T0 package — drift facts (claim 98 lines, checkCommand 22, AC-3 emitters gone, CLN-20 present), proposed rulings, lane plan replacing the 2026-10-16 11-* lanes
metadata:
  type: project
---

OBS-011 T0 was prepared before G9 exit, at `docs/qa/evidence/STUDIO-OBS-011/t0-prep-20261018/` (t0-proposal.md, lanes.json, w-brief.md). It is a PROPOSAL until root/@dev/@qa/@po ratify it.

Drift facts measured 2026-10-18 that change the story's premises:
- `GuidedSessionService.claim` = 98 lines, `GuidedTranslationService.checkCommand` = 22 lines. The panel's 606/365 is stale. I proposed closing AC-4(c) as "resolved by drift" (user U-1); this drops 11-GT and the claim split.
- The AC-3 emitters are already gone from Java (009 lane S). CLN-20 `updateAuthoring` is still present (PO drift note wrong). CLN-41 constants are gone.
- `GuidedBridgeIntegrationTest`/`GuidedBridgePlannedIT`/`GuidedPlanningIntegrationTest` declare package `guided.session`, so `--tests guided.bridge.*` misses them.
- `verifyRunnerDist` fails backend guided-IT runs if any `studio-runner/src` file is newer than dist → runner lanes must work in sandboxes.
- No formatter (prettier) is installed anywhere → AC-4(d) is a hand reformat with an AST-equality proof (user U-2).

Key rulings: F-1 `require(..RUNTIME_INCOMPATIBLE 409)` goes before `insertAction`; the instanceof conditionals are kept. Publication disabled + terminal → `REFUSED`. In-repo `Await`, no Awaitility. CLN-F2 retire (with @data-engineer co-sign).

**Why:** future rulings on 011 lanes should start from these measured facts, not from the story's 2026-10-09 numbers.
**How to apply:** before re-ruling 011 items, check the ratification record in `docs/qa/evidence/STUDIO-OBS-011/t0-<date>/`, and re-measure if source moved. Related: [[obs009-fmerge-prerulings]], [[obs009-preg9-rulings]].
