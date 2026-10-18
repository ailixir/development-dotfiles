---
name: obs008-gate
description: STUDIO-OBS-008 gate issued CONCERNS 2026-10-17 and story flipped Done (0.3.18); binding digests, counts, where the files are
metadata:
  type: project
---

Gate **CONCERNS**, story **Done** (change-log 0.3.18, story sha after flip `6fcaf63d…0e96`). Files: `docs/qa/evidence/STUDIO-OBS-008/qa-gate-20261017/{gate.md,gate.json,gate-draft.md}` and `docs/qa/gates/STUDIO-OBS-008-single-path-studio-ui.yml`.

Binding tree S_F2 source `50692d55…12dd3`, dist `897182d5…df9c`, openapi `b5ecdcad…9244`. Backend `obs008-final-check01`: 2531/2506/0/0/25 (skips equal approved 25; 0 names lost vs 015, 55 added). Frontend 1367/1367, e2e 13/13, lint 308 warnings.

Concerns (all tracked): D-8 mirror residue C-OBS008-5, 422 divergence C-OBS008-4 (009), bundle paths C-OBS008-3, copy Lows F08 (README), user decision "Someone pressed Stop", commit-set coupling (@devops).

**Why:** nothing left for QA unless digests move. **How to apply:** for @devops the 008 commit carries the uncommitted 015 tree too; copy-table tests need the untracked evidence files. See [[gotcha-story-first-line]] and [[obs015-gate-issued]].
