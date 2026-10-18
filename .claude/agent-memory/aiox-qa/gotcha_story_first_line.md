---
name: story-first-line-and-quoted-text
description: Editing a Studio story file can break tests: backend ExecutionVideoContractTest reads the first line, frontend copy-table tests read quoted phrases
metadata:
  type: feedback
---

When QA edits a story under `docs/stories/STUDIO-OBSERVED/` (Status, Change Log, QA Results), only add text. Never change line 1 or any existing phrase.

**Why:** `backend/.../evidence/ExecutionVideoContractTest` lists `docs/stories/**` and accepts a story only if its first line starts `# Story {ID} `; every `x-implemented-by` in `openapi.yaml` must name such a story (008 owns `getStudioTestCapabilities`). Frontend `guided.test.tsx` (copy table, 200+ tests) asserts that quoted strings are exact substrings of `STUDIO-OBS-008/014/015.story.md`, ADR-SC-006, `consensus-plan.md`, `openapi.yaml`, evidence rulings and `ExecutionReadinessService.java`.

**How to apply:** make Status and Change Log edits after the final frontend and backend runs are verified, as pure additions. Record the story sha256 before and after in the gate.
