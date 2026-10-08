---
name: contract-change-checklist
description: Hidden pins that break when docs/specs/studio/openapi.yaml changes (digest pin, op-count pin, ADR-002 §12/§19 process); package-manager rule for frontend/studio-runner
metadata:
  type: project
---

Any edit to `docs/specs/studio/openapi.yaml` must also change:
- `studio-runner/test/run/confinement.test.ts` `BASE_SHA256` (sha256 of the whole file), re-anchored in the same PR from `shasum -a 256`, never transcribed.
- `StudioContractTest` expected status map plus two `hasSize(N)` pins (21 on 2026-09-22), and schema/record parity entries.
- ADR-002 §13 row and section. Route/public-surface changes are Class C: the architect rules, the named story lands the diff (§19).

**Why:** the vault-secrets spec (2026-09-22) passed QA without the digest pin. Planning found it by grepping for `openapi.yaml` across studio-runner tests.

Since §34.1 (2026-10-05), a change to which requests get 400 on a public route is Class C even when it's text-only; rule first, land second. ADR prose quotes of BASE_SHA256 go stale, so measure with `shasum`. `StudioContractTest` is SKIPPED without Docker. Cross-module pins: frontend tests and backend tests both read `docs/specs/studio/*` via fs, but no production FE code imports from docs/ (see the secrets-disclaimer plan, OQ-13).

Parity is exact: `assertSchemaMatchesRecord` compares openapi `properties` keys to record components, so a new `TestRequest` property forces a new `UITestRequest` component (~29 call sites of `new UITestRequest(` as of 2026-10-06; a compat constructor avoids churn). It reads `properties` directly, so new pinned schemas must be flat, not `allOf`. `ErrorResponse` has no `additionalProperties: false`, so error bodies can be extended additively.

**How to apply:** when planning any Studio API change, list these three in the plan. The frontend and studio-runner have npm lockfiles while the user mandates pnpm. Plans use `pnpm exec vitest run …` (no install, no lockfile write). See [[vault-secrets-plan]].
