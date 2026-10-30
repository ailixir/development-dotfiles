---
name: project-wi5-realsite-gate-authoring
description: WI-5 real-site release gate (ADR-SC-007) authored under frontend/e2e/realsite-gate; what is verified, what needs the stack, and the traps found
metadata:
  type: project
---

Authored 2026-10-27: two real-backend specs (`studio-realsite-gate-real-backend.spec.ts` 20 tests, `studio-realsite-nextday-real-backend.spec.ts` 15 tests) plus `frontend/e2e/realsite-gate/` (table, driver, strict status parsers, evaluate, leakscan, recorder, report, gate-cli, `stack/` launcher + kit, README). Binding checks: pnpm type-check, lint, `tsc -p e2e/tsconfig.json`, eslint on the new files, `pnpm exec node --test` on 8 files (64 tests). Nothing ran against the stack or a model.

**Why:** the gate decides whether S3 grounding stays adopted; the dry run, the gate run and the 24 h next-day pass are the resumed phases.

**How to apply:**
- Playwright refuses `test.use({trace|screenshot|video})` inside a describe; `registration.test.ts` (spawns `cli.js test --list --reporter=json`) caught it, so the trace/screenshot/video-off setting is file-level in the run spec.
- `frontend` `type-check`/`lint` cover only `src`; e2e needs `tsc -p e2e/tsconfig.json` and an explicit eslint path. node:test runs `.ts` natively on Node 24 but local imports need explicit `.ts` specifiers.
- Unverified until the dry run: UI selectors for the Variables/secret dialog, ledger `operation.kind` path (`document` then `proposal`), `replayFailure`/`video` always present in execution JSON, recorder over plain http to the GenAI SDK, `gate-stack.sh` end to end (only `bash -n` checked).
- Leak provenance: segment cut at newline, quote, brackets, braces after JSON decode; `plainView` strips tags/refs/role prefix for `split-markup` hits; closed table in `page-text-sources.json`.

- Launcher (2026-10-27): gate ports are one env set (`stack/ports.mjs`, 1xxxx defaults, live ports refused); `up` never builds, it verifies the existing dist read-only (`stack/dist-check.mjs` + `check:pins`); `lsof` is /usr/sbin so a restricted PATH made ports look free (use the absolute path). MUI hides the Variables dialog while the secret dialog is open, so find the nested dialog by its text, not `.last()`.
