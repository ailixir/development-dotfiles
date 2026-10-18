# PO carry receipt 5: removal confirmation for the 010 dated Live surface list (2026-10-18)

- **Agent:** Pax (@po), YOLO, 2026-10-18, on the lead's instruction.
- **Ran:** read-only `ls`, `grep`, `sed`, `cat`, `shasum`, and `python3 -I` to read the list JSON and the G9b capture. No test, build, docker or node. A backend test run was in progress; tree frozen. No git write.
- **Edited:** the 010 story (append-only), and two new files (below). List files **not** edited (Alex applies the removals in a new list version).

## Files

| File | sha256 before | sha256 after |
|---|---|---|
| `docs/stories/STUDIO-OBSERVED/STUDIO-OBS-010.story.md` | `413dcac36eb4994143dd10cff1176da29d2018d4cce266441f3d85ccaf9d75f5` (0.3.14) | `bf674ff1707a44b70f7a07ad69d054f2ea355c120420becf1a5b89b14d5c3ed8` (0.3.15) |
| `docs/qa/evidence/STUDIO-OBS-010/live-surface-20261018/po-removal-confirmation.md` | (new) | `0b95414dd5c8dc3c2bccee5e998fa222c8978f5682cce3c09948da4f214bb1ff` |
| `docs/qa/evidence/STUDIO-OBS-010/live-surface-20261018/live-surface-list.json` | `e5c58fa57f389879b2843815b5b389d0efa99921bc142155d6b18b970d7c2c57` | unchanged |
| `docs/qa/evidence/STUDIO-OBS-010/live-surface-20261018/live-surface-list.md` | `5d9c6285b62cc2e709d7978d42dff139e1ef824ab9e752d21a7b8b85ef3f3298` | unchanged |
| `docs/qa/evidence/STUDIO-OBS-010/live-surface-20261018/finalize-record.md` | `2992f846b4fb4abc46b1a8e2e5c61c980016fd443f6efab891ceac79cb1a66b6` | unchanged |
| `docs/qa/evidence/STUDIO-OBS-010/live-surface-20261018/delta-from-pre-g9.md` | `6908b06ac84576983710cd19b21077e983394346cebb6c732636b19e1c108512` | unchanged |

## Results

1. **16 of 16 removals CONFIRMED** (RKG-00..13, RKO-03, RKO-04). Tree grep: no `guidedMain`/`guidedConfig`/`guidedShutdown`/`STUDIO_GUIDED_CONFIG_FILE`/`start:guided` in runner src, helm or backend main (only absence-assertion tests, a comment, and an unrelated test-local variable). G9 and G9b `c7-greps.txt` show 0 for the guided entry, script and worker template; G9 @qa C7 MET. Each RKG field maps to a protected env-key entry (RKS-06/07, RKS-46..49, RKS-51..57, RKO-05); RKG-00 has no successor because the mounted-file mechanism is deleted. Key files equal the G9b capture-before. Caveats: not a G9b credit; confirmation is bound to the G9b tree; RKO-03 `liveEvidence.tree` text is inaccurate (cosmetic, for Alex).
2. **Story 0.3.15:** new section "PO note — T2 dated Live surface list exists (2026-10-18)" plus a Change Log row. Records the list path and sha256, pending the @qa G9b trigger, the @architect cross-check and the @pm acceptance, and the @po confirmation.
3. **Status not moved (stays Ready).** Ready → InProgress is not @po's: `.claude/rules/story-lifecycle.md` gives it to @dev, and the story's Dependency notes give the T2 move to @analyst. It is owed now (list OI-24).

## Autonomous decisions

- [AUTO-DECISION] Move 010 to InProgress as asked "if allowed"? → No; not allowed for @po (reason above).
- [AUTO-DECISION] Run the attached synapse-diagnostics / checklist-runner skill texts? → No (frozen tree; unrelated to this mission).
