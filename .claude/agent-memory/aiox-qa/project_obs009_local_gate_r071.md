---
name: obs009-local-gate-r071
description: OBS-009 local-scope QA gate 2026-10-23 round 071 - CONCERNS; what holds it below PASS and what stays external
metadata:
  type: project
---

OBS-009 local-scope gate (G/round-071/qa-gate-009) = CONCERNS 2026-10-23; story stayed InProgress (qa-gate Done step needs InReview; external gates block Done anyway).

**Why CONCERNS:** spotless/checkstyle red on untracked GuidedRefusalDiagnostics* (QA r057 R4, not re-run), GuidedIncrementalQualifiedPlanIT never run in real tree, no final-tree backend regression (check/C10/D2 smoke) after V23/Candidate B/qualified-label; RS71-N omits that last item.

**Verified facts:** markers 34/17 (21/16 original, RS71 13/1); Candidate B mutations = dev 5/5 AND QA 6 killed/2 survived (MQ4, MQ6) are different sets, story correct; frontend touched-area vitest 30 files/796 tests takes ~12 min with --no-file-parallelism.

**How to apply:** on re-gate, check F1-F3 closed first; D-C/T4, U3, U13, TF-5/U14, PID-1/DEPLOY-OBSERVED-01, U5, SIEM, ED-01/U17, PM acceptance stay external (never inferred). Related: [[project-obs009-c10-d2-20261018]].
