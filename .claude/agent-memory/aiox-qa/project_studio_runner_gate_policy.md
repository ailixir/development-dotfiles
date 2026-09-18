---
name: studio-runner-gate-policy
description: studio-runner/ is graded on its own gates outright (no legacy curve) and is the Epic 10 security boundary; browsers arrive in story 10.12
metadata:
  type: project
---

`studio-runner/` must pass `npm ci`, `build`, `type-check`, `lint` and `test` green with no
allowances, unlike the rest of the put-checks repository which carries legacy debt.

**Why:** it is a brand-new package with no inherited debt, and it is the security boundary of
Epic 10 — the default-deny validator and trusted executor are what stand between an
LLM-generated artifact and a real browser (architecture `docs/architecture/studio-execution.md`
§4.5, §9; scaffold fixed by `docs/architecture/ADR-001-studio-runner-scaffolding.md`).

**How to apply:** when reviewing any story touching `studio-runner/`, run the gates yourself from
a clean `rm -rf node_modules dist` rather than trusting the developer's report, and probe the
validator with independent escape attempts rather than only re-running its own fixture corpus.
A sandbox escape is an automatic FAIL regardless of coverage. Do not download Playwright
browsers — real Chromium only arrives in story 10.12, and `npm run test:fixtures` reporting
"no test files" is expected until story 10.3.

Wave-1 split of enforcement worth remembering: 10.2 *records* the four-copy Playwright pin in
`dist/runtime-versions.json`; 10.3 owns the `check:pins` equality assertion. Treat a 10.2-era
claim to *enforce* the pin as an over-claim.
