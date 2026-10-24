---
name: ux-fix-qa-r067
description: r067 (2026-10-23) PASS on frontend UX fixes D1-D7 + D10; harness-safety method, D6 guard unobservable, how to mutation-probe frontend in a scratch copy
metadata:
  type: project
---

PASS, no required fixes: `G/round-067/qa-frontend-ux/{QA.md,verdict.json}` (19 files, after-hashes verified; frozen spec sha 5c202fc7, private-driver e544e18b). 17 vitest files / 627 tests green serially; wcag audit 7/7 (rewrote docs/qa/accessibility/axe-results.json, restored via git checkout of that file).

**Why:** frozen real-backend harness asserts strict `getByRole` names (`Seek to step N`, `Seek to action: <label>`) and a strict disclaimer `getByText` regex; new captions must never be buttons or share a block with the first disclaimer sentence.

**How to apply:**
- Prove harness safety by line-by-line locator table + the repo's own strict page-level lookups (pageIncrementalRecording `getByRole('Seek to step 5')`, SecretInput `getByText` regex); the harness route guard counts POSTs only, so extra GETs are free.
- Frontend mutation probe without touching the tree: `cp -R src package.json tsconfig*.json vite*.config.ts vitest.config.ts index.html .env.development` to scratchpad + `ln -s frontend/node_modules`. Transport drops duplicate/older revisions and closes on streamComplete, so the D6 `runOutcomeReadRef` guard cannot be exercised (mutant still reads once).
- Use `--no-file-parallelism` at load ~14; pageGuidedRun alone took ~4 min.
- `eslint` file list must be passed as separate args (`xargs`), not one quoted string; zsh globs break `grep --include=*.x` (quote it).
- Related: [[pack437-human-pack-qa-r066]].
