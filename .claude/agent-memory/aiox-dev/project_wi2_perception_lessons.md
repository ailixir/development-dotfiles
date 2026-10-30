---
name: project-wi2-perception-lessons
description: ADR-SC-007 WI-2 (runner perception library) lessons: Write-tool unicode escapes, ghost parts for split values, synthesis must see perceive privateValues, perception tier layout
metadata:
  type: project
---

- The file-writing tools turn some `\uXXXX` escapes into the literal character (U+2026, U+2028/9, U+200B, U+00AD, U+20AC were seen). After writing a regex or fixture with such escapes, grep the file; write control-like characters through a python `chr()`. A literal U+2028 inside a regex literal is a syntax error.
- D1 split-value matching (src/run/perceive.ts): a 12-character window can drop ONE fragment in the single-string pass, leaving its neighbours unmatchable. Dropped strings stay in the probe as `ghost` parts, and a withheld child contributes its ghosts (not its live parts) to the parent's probe.
- `synthesize()` must build its matcher from the perception's `privateValues` too (kept in the WeakMap internals); the browser canary suite found synthesis offering a label locator equal to a caller-supplied private value.
- Perception tier = `vitest.perception.config.ts` (no globalSetup, never touches `dist/`), tests in `test/fixtures-tier/perception/`, each file calls `guardDist()`. Run with `/usr/bin/env PATH=<node24>:/opt/homebrew/bin:/usr/bin:/bin pnpm --config.package-manager-strict=false exec vitest run --config vitest.perception.config.ts`.
- Baseline fingerprint (Chromium build + platform + text-metric hash) is machine-bound; a mismatch FAILS the live parity test by design.
- `test/run/confinement.test.ts` AC-25 lists spike tests that `require('playwright')` (test/evaluation/grounding-{b-support,f-gt,q-harness,q-safety}); fixing it means moving their live blocks into test/fixtures-tier, which needs those files in the binding inputs.
- WI-1's `test/evaluation/grounding-a-requests.test.ts:163` can break studio-runner type-check/lint; it is outside WI-2's write set.
- Review round 1 lessons (2026-10-27): a node's OWN attribute strings (name, placeholder) have no DOM position, so probe them unordered (`matcher.locateInserted`), but a child's strings keep their DOM place (reversed display order is not a leak by design). Long inventory values need stride-1 12-char windows (stride 6 misses unaligned echoes); 1 MiB value = ~184 ms and ~76 MB to build. Work budget: ~1.2-1.5M units per ms; measured worst 4.9G, constant 20G. macOS has no `timeout`; `node --expose-gc` with vitest forks hangs; kill orphan `node (vitest)` workers after a killed run.
