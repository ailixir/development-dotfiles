---
name: browser-proof-without-playwright
description: How to prove real browser behaviour (service workers, MSW) in this repo when no Playwright browser is installed
metadata:
  type: project
---

**Scope correction (2026-09-11): this is about `frontend/` only.** `studio-runner/` *does* have
Playwright (pinned 1.63.0) with its browser cache present, and its fixtures tier
(`npm run test:fixtures`) launches real pinned Chromium and passes — do not assume "no browser on
this machine" there.

The `frontend/` package has a `test:e2e` script but **no Playwright dependency installed and no
`ms-playwright` browser cache** on this machine. To prove browser-level behaviour, install
`playwright-core` into the session scratchpad and launch the system Chrome at
`/Applications/Google Chrome.app/Contents/MacOS/Google Chrome` via `executablePath` — headless
Chrome there does support service workers, so MSW can be observed end to end.

**Why:** claims about service workers, MSW interception or module-federation runtime wiring cannot
be proved from Vitest (jsdom has no service workers) or from `curl` (the MSW browser worker only
intercepts in-page requests). QA rejects "the test imports the module" as evidence.

**How to apply:** boot the dev server yourself with the env flag set, drive the page, and have the
*page* issue the fetch. A clean discriminator for "did a handler serve this?" is that nothing
listens on :8080 by default, so an unmocked `/api/v1/...` request returns 504 from the webpack proxy
or 500 from the vite proxy, while a mocked one returns 200 with fixture data. Do not add Playwright
to `frontend/package.json` for this — a test that cannot run in CI is worse than an evidenced
manual run recorded in the story. Related: [[backend-check-baseline]].
