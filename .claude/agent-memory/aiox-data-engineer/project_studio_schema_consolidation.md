---
name: studio-schema-consolidation
description: 2026-10-09 decision pending — UI Studio keeps ONE authoring path (observed/guided, OBS-001..006), no backward compat; schema rewrite (Option A) vs forward-only V34+ (Option B) hinges on whether any shared DB applied V12..V33
metadata:
  type: project
---

UI Studio is unreleased. The user wants a single authoring path (observed/guided from OBS-001..006) and explicitly no backward compatibility with the compile-to-READY path (V12..V29 compile requests/outcomes, step identities, expected_intent, authoring columns). The choice between rewriting the Studio migrations as a fresh baseline (Option A) or shipping V34+ cleanup migrations (Option B) waits on @devops confirming whether any shared database (staging/prod RDS or shared dev) has applied V12..V33.

**Why:** pre-GA, no production guided data exists (secret-login-design §1); rewriting is only safe if no shared `flyway_schema_history` already contains V12..V33 (validate-on-migrate is on, baseline-on-migrate off in application.yml).

**How to apply:** do not add V34 compile-path drops until the @devops answer is recorded. Boundary nuance to remember: `ui_tests`/`ui_test_executions` are created by Checks core V1/V7 (not Studio), and V25 drops the core `secrets` table from inside the Studio version range, so a Studio rebase must carry V25 forward and keep V1..V11 byte-identical. Observed path still writes `reference_policy`, `intent_derivation_version`, and sets `ui_tests.compile_status='READY'` on publish — those are shared, not compile-only. See [[studio-migration-head-testing]] for the write_once trigger hazard that any rewrite must preserve.
