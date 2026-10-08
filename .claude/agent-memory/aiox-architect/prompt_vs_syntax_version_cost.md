---
name: prompt-vs-syntax-version-cost
description: Cost asymmetry of bumping SYNTAX_REFERENCE_VERSION (exact runner compat, invalidates all confirmed revisions) vs PROMPT_VERSION (fingerprint only); closed runner bodies force backend-first deploys
metadata:
  type: project
---

Bumping `SYNTAX_REFERENCE_VERSION` makes every confirmed revision `RUNTIME_INCOMPATIBLE`, because the runner's `compat/compatibility.ts` compares it with an `exact` rule. Bumping `PROMPT_VERSION` only changes the compilation fingerprint, which means one FULL recompile per test. Confirmed artifacts keep running.

**Why:** found while ruling VAL-014 (2026-10-04). Compile-quality guidance belongs in `output-contract.md`, never in `syntax-reference.md`.

**How to apply:**
- Steer any prompt-wording change to `output-contract.md`, and batch it with the next prompt bump.
- `EXECUTOR_VERSION` is compared `backwardCompatibleMinor` in the runner, so a minor runner bump is free. But the backend's `studio.runtime.pin.executor-version` feeds `CompilePipeline.compilationFingerprint`, so raising the backend pin recompiles every test. Deploy the runner first, then raise the backend pin together with another fingerprint change (VAL-031, 2026-10-04).
- Adding a field to a runner→API body (e.g. VAL-012 log `stepIndex`) has a deploy-order cost. Java DTOs use `ignoreUnknown = false`, so the backend must ship before the runner. See [[contract-change-checklist]].
