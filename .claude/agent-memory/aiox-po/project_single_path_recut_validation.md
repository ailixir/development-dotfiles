---
name: single-path-recut-validation
description: 2026-10-10 PO verdicts on the ADR-SC-005 single-path re-cut (007 GO 9, 012A GO 8 one-story with Lane M gate, 012B GO 8) and the recurring checks stories keep missing
metadata:
  type: project
---

Verdicts 2026-10-10 (R5 for 007; first round for 012A/012B): all three Ready. 012A kept as ONE story (fallback split 012A-1/012A-2 rejected) with a hard gate: Lane M (migrations) starts only after Lanes K+C are compile-green and a fresh backend baseline is taken; split only if the D-B answer is "something was deployed" or @architect enlarges Lane C.

**Why:** Lane M depends on both K (compile columns read only by deleted code) and C (V15 carries v3 tuple); splitting still blocks 014 (V19 numbering) and 015 (V15 columns) on the second half, so the parallelism gain is nil and 013's possible DDL would collide.

**How to apply:** Recurring gaps to check in every Studio story before GO —
- `backend/config/rds-parity/` lint (`./gradlew rdsParityLint`, part of `check`) exists; migration stories never name it. Require it named when new SQL is authored.
- `backend/src/main/resources/studio/observed-contracts/**` is a `processResources` build output (build.gradle.kts copies from docs/specs); stories list it as a source path. Non-weakening, flag as KI.
- `review/` has 13 test files, not 11: two are `*.test.ts` (artifactSummary, compilePollBounds) and get missed in named-drop lists.
- `GuidedTranslationConfiguration` also imports `compile.CredentialPatternScreen` (not only `GuidedSourceClassifier`).
- D-B residual ("nothing deployed from an internal remote") is owed by the user/Platform-SRE; treat as explicit risk + T0 record, not a precondition; OBS-010 carries it.
- Gate `ux-design-expert` accepted for frontend copy-fidelity stories despite the framework list (@architect/@dev/@pm) — wave README convention; record as [AUTO-DECISION].
- Design §7 SEC-9 still says "all three paths" (R3 residue) — @architect errata, not a story edit.
- `.aiox/gotchas.json` does not exist on this tree; note it in limitations rather than failing.
