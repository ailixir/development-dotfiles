---
name: w48-password-label-poisons-hints
description: W48 root cause of the 431 step-2 loop - a labelled password input made every textbox role and label hint unmatchable; fix in observationCollector, repro recipe
metadata:
  type: project
---

On a Username + Password form, the password input's label (wrapping or `for`) was "not an eligible source" (its control is a password), so the collector marked the password `ambiguous` -> `unresolvedRole='textbox'`, `unresolvedLabel=true`. `matches()` (observationCollector ~648-649) then refused every `textbox` role hint and every `label` hint on the page, so `prepareOrdinary` threw TARGET_CHANGED before any admission. Backend `GuidedTranslationCoordinator.continueRuns` discards non-2xx (`BodyHandlers.discarding`), so each poll burned a model proposal (no action row, no new observation). testId/placeholder/aria-label hints were unaffected.

**Fix (2026-10-22, W48):** compute the password's own label name locally (`eligibleSource(label, false)`, `boundedText(..., followLabelControl=false)`); password inputs are never emitted so nothing leaks. A password label equal to the hint stays refused (fail-closed kept). Guard: `studio-runner/test/fixtures-tier/guided-login-journey.test.ts`.

**How to apply:** collector runs in a CDP isolated world: `globalThis` debug is invisible to the page; use a DOM attribute (`documentElement.setAttribute('data-x', json)`) to read internals from the test, then remove. Probes live in `.aiox/sdc/.../parallel-execution-20261022/round-048/runner-repro/` (scratch vitest config, node_modules symlink, no dist rebuild). `native-blank-surface-controls` fixtures test creates 4 `prefs-/version-control-*` dirs under docs/qa/evidence/.../padding-correction/native-runs/ every run - delete them. Related: [[tooling-fixtures-probe-no-dist-and-close-bound]].
