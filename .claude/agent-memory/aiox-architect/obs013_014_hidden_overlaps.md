---
name: obs013-014-hidden-overlaps
description: OBS-013/014 hidden overlaps (runtime.ts, guidedMain.ts, transport.ts:145, GuidedSessionService result literals); result3 evidence slots already REQUIRED; plan = docs/qa/evidence/STUDIO-OBSERVED-NEXT/s0-plan-refresh.json (supersedes t0-plan)
metadata:
  type: project
---

The S0 refresh on 2026-10-13, done against the final 012A tree, superseded the 2026-10-12 T0 plan. It corrected the following:
- result3 already has REQUIRED `evidence.video` (type null) and `actionTimings` (maxItems 0). Both are hard-coded in GuidedSessionService:2292/:2306 and GuidedPublicationResultProjector:118-119. OBS-013 must widen them, not add an optional field. 013 therefore needs a GuidedSessionService hunk, which B14 (the 014/015 owner) applies. session-view embeds result.
- GuidedSessionService.recordEvidence (:1353) exists but is unmapped. The plan is to reuse it for the 013 callback via a hook.
- transport.ts:145 maps unknown callback routes to `lifecycle`. The 013 callback therefore needs an R14 hunk plus a bridge schema change and a contracts/README row. The guided worker has no object-store config; that lives in server/config.ts and application.ts.
- InferenceMigrationLatestIT asserts head=18 AND zero V19 rows, so it goes red when V19 lands.
- Pruning progress to '{}' would falsify result(), so prune by key.
- Sanitized observations are also copied into the immutable V15 publication tables. AC-3 does not cover them; this is ruling AR-2e.
- StudioContractTest checks routes in both directions. Every openapi step must therefore land with its controller (escape hatch: x-not-yet-implemented).
- 012A residue: IdempotencyFilter:40 still has the dead `/api/v2/studio/**` matcher.

**Why:** the stories were written before the code paths were traced, and a single checkout plus a single Gradle lock makes collisions expensive.
**How to apply:** when planning 015 or 008, or when ruling AR-1..AR-4, start from s0-plan-refresh.json. Related: [[contract-change-checklist]], [[obs012a-gate-residues]], [[single-path-decision]].
