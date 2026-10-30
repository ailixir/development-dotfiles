---
name: tooling-scratch-playwright-msw-config
description: Run a throwaway Playwright spec from the scratchpad against the frontend msw harness on non-default ports without touching frontend/e2e
metadata:
  type: reference
---

Scratch config recipe (verified 2026-10-24, STUDIO-UNIFY-001.5 lane A): put `playwright.config.ts` and `*.spec.ts` in a scratchpad dir, symlink `node_modules` there to `frontend/node_modules` (else `@playwright/test` does not resolve), set `testDir`/`outputDir` to the scratch dir, and copy the `webServer` block from `frontend/playwright.config.ts` with `cwd: <frontend>` and absolute paths. Run from `frontend/`: `CHECKS_E2E_APP_PORT=4181 CHECKS_E2E_API_PORT=4182 pnpm exec playwright test --config <scratch>/playwright.config.ts`. Set BOTH ports (the API proxy defaults to 4178). Fixture `d0000000-0000-4000-8000-000000000003` ("Password reset email", 3 steps) is a good editor route: `/checks/ui-tests/{id}/studio`. For scroll bugs, wrap `Element.prototype.scrollIntoView` and `HTMLElement.prototype.focus` in `addInitScript` and log `new Error().stack` plus `window.scrollY`; it names the calling source line and lets you no-op one caller to A/B the cause.
