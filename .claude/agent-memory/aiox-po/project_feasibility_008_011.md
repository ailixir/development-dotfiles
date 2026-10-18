---
name: feasibility-008-011
description: 2026-10-15 PO feasibility of OBS-008..011 — local vs external per AC, transitive blockers, unadopted proposals A (008 spike worktree) and B (011 start / 009 split)
metadata:
  type: project
---

2026-10-15 analysis (`docs/qa/evidence/STUDIO-OBSERVED-NEXT/execute-015-008/claude-feasibility-008-011.md`): 008 all 9 ACs LOCAL; 009 2 LOCAL / 7 LOCAL-PARTIAL / 3 EXTERNAL (AC-7 benchmark, AC-8 ED-01 probe, AC-10 live canaries + human C-17); 010 AC-1..3 EXTERNAL (pilot), AC-4 LOCAL-PARTIAL; 011 all LOCAL but transitively blocked because its GO needs 009 Done and 009 GO condition 3 needs AC-7 staging / AC-8 / AC-4 dev-Vault.

**Why:** the critical path is external (ED-01 owner TBD, staging app, ED-02, deployed stack). 015 Done itself waits on the item-85 user decision. The 015 global source freeze manifest covers frontend/src, docs/specs, backend/src and studio-runner, so in-tree parallel 008/009 edits break 015 evidence.

**How to apply:** Proposal A (008 15-independent lanes in a separate worktree as an uncredited spike) and Proposal B (011 start after 009 local ACs + 010 Live surface, or split 009 into local + live-proof) are NOT adopted. They need a user decision and then @sm/@po re-validation. The Studio model provider is Vertex only. `STUDIO_GATEWAY_*`/`STUDIO_GUIDED_EVAL_*` are unset, and the root `.env` LLM keys are empty and unusable by Studio. Re-verify these before citing them.
