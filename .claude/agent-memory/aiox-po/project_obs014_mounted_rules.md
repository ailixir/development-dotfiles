---
name: obs014-mounted-rules
description: 2026-10-13 ruling — mounted guided-worker field `rules` that grant reads are IN OBS-014 AC-1 scope (AC-1 clarification a-f); exact rule pending @architect
metadata:
  type: project
---

Record `docs/qa/evidence/STUDIO-OBSERVED-NEXT/po-mounted-rules.json` (C2b residual R-1).

Ruling: a mounted `ObservationRule` with a non-structural classification is a read grant outside the governed object, so closing it belongs to AC-1. It does not go to the AC-2 R-2 two-policy-sources follow-up, which is replay-only and not release-blocking. Binding outcome: no mounted file or server option can grant a read, set classification or policyRuleId, or widen export → CONFIGURATION_DENIED. PO default: refuse the `rules` key entirely. @architect may allow structuralOnly rules only with a stated rationale. Fallback: a named AC-1 obligation that blocks OBS-010.

**Why:** AC-1 says the "read rules" are governed and requires the runner to hash "the policy it applies". The governed context forbids `applicationPolicy.rules`.

**How to apply:** when gating 014 or reviewing R14's s3-cutover.patch, check that the `rules` refusal and the re-pointing of the GuidedBridgeIntegrationTest mounted-rule cases landed in the same S3 unit. Architect specs can mis-cite runner paths (src/guided vs src/run), so verify paths. See [[ar2-residual-placements]], [[studio-observed-wave-po-conventions]].
