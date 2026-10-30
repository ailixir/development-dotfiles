---
name: project-fixtures-three-reds-practice-site-collector
description: 2026-10-26 the 3 runner fixtures reds (unresolved-name, former exact-rule, Customer neighborhood) came from the intentional practice-site collector changes; tests updated, code kept; guided capacity was already required
metadata:
  type: project
---

The three fixtures-tier reds seen on 2026-10-26 were NOT a regression. They come from three intentional, user-driven collector changes in `studio-runner/src/run/observationCollector.ts` (practice-site E2E loop 2026-10-25, user decision "make plain visible text observable, per guided-data-flow section 4"; see [[tooling-runner-fixtures-evidence-side-effects]]):

- `unresolvedRole` shared between learn and replay and gated on `ariaVisible` (the "hidden-button veto" fix): a HIDDEN element with an unresolved name no longer refuses acquisition. Playwright getByRole skips hidden elements; a later reveal is caught by revision + style-signature guards. A hidden element with a KNOWN same name still refuses (spec: hidden competitor). Single-hunk mutation (ungated acquisition `unresolvedRole`) turned `observed-replay-privacy` unresolved-name green again, so that hunk is the sole cause.
- `containerText`/`isText`: a bare `div/span/p/li...` with own text is exported as a `generic`/`text` node with a `text` locator, classified by the read profile grant (permittedBusinessData when the grant covers the host). Under a profile with no grants it is `structuralOnly`.
- Consequence for fixtures: a labelling `<span>` is now its own text node, so look up fields with `elementType==='input'` and count dynamic dd/td values excluding nodes that have a `text` locator hint.

Guided capacity: `loadGuidedConfig` (`studio-runner/src/server/config.ts`, not `src/config.ts`) already required `STUDIO_RUNNER_GUIDED_CAPACITY` through the generic "every guided key is required" loop; only a dead `: 1` fallback remained (removed). Backend `RunnerProcessHarness`, ReplayIT and the scratch `gen-config.mjs` already set it.

How to apply: before blaming a fixtures red on a peer, grep the aiox-qa memory `project_flex001_integrated_qa.md` and the user's `project_practice_site_e2e.md`; decide per test using the spec (`delayed-state-design.md` lines 43-45, `guided-data-flow.md` section 4 read-profile row).
