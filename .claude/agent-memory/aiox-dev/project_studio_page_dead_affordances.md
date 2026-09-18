---
name: studio-page-dead-affordances
description: ChecksStudioPage has handlers with no call site in the rendered tree — check reachability before writing a component test that plans to click through to one
metadata:
  type: project
---

`frontend/src/pages/ChecksStudioPage/ChecksStudioPage.tsx` carries fully written handlers that
**nothing in the rendered tree can reach**. Verified on `story/10.11b` (2026-09-15):

- `handleScenarioSelect` had **zero call sites**. The visible *"Change…"* control does
  `window.location.href = '/checks/studio/tests'`, which is a full navigation and unmounts the page.
  Story 10.11b wired it to the route's `:id` changing, because AC-13 needed a scenario switch that
  happens *within* the page.
- `setShowNewScenarioDialog(true)` has **zero call sites**, so the *"Create New UI Test Scenario"*
  dialog cannot be opened. `handleCreateNewScenario` is therefore unreachable from the surface even
  though it is wired to that dialog's Create button.

**Why it matters:** a criterion phrased as "do X while Y is happening" can be untestable through the
UI for this page, and you will not find that out until the test is half written. It also means a bug
in one of these handlers is *latent* — real code, no live path — which changes how you falsify a fix.

**How to apply:**

- Before planning a component test that clicks through to a handler, grep for the state setter or
  the handler name and confirm it has a call site in JSX. `grep -n 'handlerName\|setStateThatGatesIt'`
  is enough.
- When the path is unreachable, do not invent UI to reach it. Find a *different* rendered control
  that drives the same predicate inputs and say so explicitly in the test. For 10.11b's `SCEN-1` the
  create path and the **"Reload scenarios"** button produce the identical state — selection on one
  listed draft, route on another listed draft, no navigation — and only the second is clickable.
- The route is `/checks/studio/:id` (`App.tsx:114`), **not** `/checks/studio/tests/:id`. The latter
  is a different page (`StudioTestsPage`).

Related: [[frontend-baseline-environment]], [[vacuous-guard-shapes]].
