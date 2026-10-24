---
name: project-qualified-label-qa-r057
description: Round 057 QA of region-qualified step labels (scopeIntent): PASS 2026-10-23; survivors, pre-existing lint, how to verify schema epochs
metadata:
  type: project
---

Round 057 gate (G/round-057/qa-qualified/) = PASS, no required fixes. Survivors: incremental SOURCE_PLAN call-site wiring in GuidedTranslationService (untested; joined IT is learn-only), region role gate (no vector points regionId at a form node).

**Why:** next real-stack case434 is the first real run of the incremental qualified path; a wiring defect would show as an INVALID_CONTRACT repair loop on SOURCE_PLAN.

**How to apply:**
- REPLAY_VALIDATION_SCHEMA_EPOCH et al. hash the REF-EXPANDED schema node (GuidedContracts.schema(name) via reflection + GuidedContracts.hash), not the file; a naive Node canonical hash does not match. A wrong epoch silently falls back to slow validation, so prove it with a throwaway JUnit probe.
- `./gradlew spotlessCheck checkstyleMain checkstyleTest` is red from pre-existing untracked GuidedRefusalDiagnostics*/GuidedRefusalCompatibilityTest etc. and long lines in GuidedProposalValidator.materializeAction; judge new patches by whether flagged lines fall in their hunks.
- GuidedPublicationReplayIT has designed waits up to 620 s per case (p6WaitOriginalDeadline); a full run is very long. Run it separately from the rest of the ITs.
- In zsh, `for c in "a b"; do node $c` does not word-split; and `echo == x` errors. Use arrays or bash.
- Runner full vitest in a scratch copy fails ~41 tests (test/evaluation PIN_UNREADABLE + disclosure.test.ts) regardless; compare against a base copy by failing-test names.
