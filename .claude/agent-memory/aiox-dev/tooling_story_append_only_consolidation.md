---
name: story-append-only-consolidation
description: Recipe for editing a live story file append-only while tests read it (STUDIO-OBS-008 0.3.17): evidence lines instead of edited lines, in-order diff check, quote check, atomic mv
metadata:
  type: reference
---

When root says "append-only, line 1 and every phrase byte-identical" and Gradle or vitest may read the story mid-edit:

- Build the new file in the scratchpad from a saved copy with a script. Tick `- [ ]` to `- [x]` in place, and put each evidence pointer on a NEW nested line (indent + 2) after the item's last child, not appended to the tick line. Then the only changed original lines are ticks and the Status value.
- Verify with an in-order walk: every original line must appear in order unchanged, or as its tick/Status variant. `difflib` opcodes mislead here because inserted lines merge into replace blocks. `diff before after | grep -c '^<'` must equal ticks + 1.
- The frontend copy-table tests (`guidedNarratives.ts` `file: S.story, quote:`) take substring quotes from the story. Extract all 52 and assert each is still in the new text; they come from AC text, so tick and note edits do not touch them. `ExecutionVideoContractTest` reads only line 1.
- Swap in with `mv` from the scratchpad: `/private/tmp` and the repo share device 16777229 on this host, so the rename is atomic and a running test never sees a half-written file. Re-check the live story sha256 equals the saved copy right before the `mv`.
- The File List for a wave comes from a manifest diff (`baseline/w0-baseline-manifest.json` vs `final-gates/freeze-manifest.json`, `files[].path/sha256`). Docs outside the manifest scope (ADRs, runbooks, CLAUDE.md, axe-results.json) must be taken from lane receipts. A later fix unit (U1) can add a path the diff lacks: StudioScheduleDialog.test.tsx was the one.
- `final-gates/status.txt` keeps growing while you work. Re-read it right before the last write, and quote its lines with the time you read them.
