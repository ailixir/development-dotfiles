---
name: frontend-baseline-environment
description: Plain `npm install` works in a worktree — two agents published workarounds for a problem that does not exist; lint cannot start; measure the pass count, never quote it
metadata:
  type: project
---

Two of the frontend's three gates are red before you touch anything, each for a different
pre-existing reason. First measured 2026-09-11 on `story/10.10` at `50f770ed2`; the install claim
below was **wrong** and is corrected under it.

**Why:** `frontend/package.json` declares `"@put/core-components": "file:../../put-core-components"`.
That path resolves to `wt/put-core-components` from a worktree and `put-checks/put-core-components`
from the main checkout, and **neither exists** — the real package lives at
`/Users/brunobuger/workspace/citi/put/put-core-components`. The symlink in the main checkout's
`node_modules/@put/core-components` points at the non-existent sibling and dangles, and that dangling
link is the actual cause of the one pre-existing test failure. **It was recorded here that this makes
`npm install` fail with ENOENT in a worktree. That is false** — see below.

**Corrected twice, and the second correction is the one to act on.**

`npm install` **just works in a worktree.** Measured 2026-09-15 on `story/10.11a`: from an empty
`node_modules`, `npm install --no-audit --no-fund` → `added 1014 packages in 14s`, `git status
--porcelain` empty, `package-lock.json` byte-identical, and `msw`, `ajv` and `yaml` all at their
declared versions. npm creates the `file:` link for `@put/core-components` as a **dangling symlink
without verifying its target**, so the unresolvable dependency never blocks the install.

**Two agents in this epic published a workaround for a problem that does not exist** — 10.10's
scratch-prefix placement, and my own `--no-save --no-package-lock` "correction" of it. Neither is
needed. @qa found this; I reproduced it before believing it, and you should not re-derive a third
workaround. The `file:` dependency *is* broken and the gates below *are* red for it — but that is a
resolution failure at build and test time, not an install failure.

**How to apply:**

- To get a worktree runnable: **`cd frontend && npm install`.** That is the whole instruction.
  Verify afterwards with `git status --porcelain` and `shasum -a 256 package-lock.json`, because
  "no manifest was changed" is a claim the gate checks. Do **not** clone `node_modules` from the
  main checkout: that copy is stale against `package.json` in at least three places (`msw` absent,
  `ajv` a transitive `6.12.6`, `yaml` `1.10.2`) and patching it is how both prior workarounds
  started.
- **The baseline moves every wave — measure it, never quote this file's number.** `npx vitest run`
  was **98 passed** at 10.10 (2026-09-11) and **275 passed / 1 failed / 2 failed files** at
  `78cc634b2` (2026-09-15). Any story record still citing 98 is inherited, not observed.
- The rest of the baseline is stable: `npm run type-check` → **2 errors**, both `TS2307` on
  `@put/core-components`; `npm run type-check` → **2 errors**, both `TS2307` on `@put/core-components`;
  `npm run lint` → **exit 2 with zero files linted** — `.eslintrc.json` extends
  `"@typescript-eslint/recommended"` where ESLint 8 needs `"plugin:@typescript-eslint/recommended"`,
  so ESLint cannot start. It is *not* "191 lint errors", and it means `npm run lint` as a story gate
  discriminates nothing.
- `ChecksLayout.a11y.test.tsx` fails on **import resolution**, not on a missing skip link. Do not
  repeat the skip-link description; it is wrong.
- To lint your own files anyway, copy a corrected `.eslintrc.json` into `frontend/` under another
  name, run `eslint --no-eslintrc -c ./that --resolve-plugins-relative-to .`, and delete it. The
  config must sit inside the repo or plugin resolution fails.
- **A page-level test can be flaky from the host, not the code** (found 2026-09-16, 10.16a).
  `store/index.ts` dispatches `fetchSources()`/`fetchFeatures()` at import, before MSW listens, so
  they hit the real `http://localhost:3000` (jsdom's origin). On this Mac something else listens on
  :3000 and answers with a `/login` redirect, and the thunks resolve with no `sources`/`features`
  field. Whatever page test is running when they land then throws `reading 'find'` in
  `selectIsSourceEnabled`. It shows mainly under load (two page files in parallel). Before you blame
  a page change, run `lsof -iTCP:3000 -sTCP:LISTEN`. Remedy inside a test file: wait in `beforeAll`
  until both slices are `fetched && !loading`, then set their state in `beforeEach`
  (`pageEvidence.test.tsx` did this). **Superseded 2026-09-17 on `fix/carry-forward`
  (`c09d59e67`, awaiting @qa):** `src/test/setup.ts` now imports the store under a single-purpose
  MSW server (404 for both, `onUnhandledRequest: 'error'`), waits for both slices, and closes it
  before the test file loads; the per-file wait was removed. Answer with 404, not
  `HttpResponse.error()`: `apiClient` retries a failed GET twice (200/400 ms). To reproduce the
  clobber on demand, move jsdom's origin (scratch config overlay with `mergeConfig`) to a stand-in
  that answers `307` at once and delays only the `/login` body 4.5–13 s — a plain delay lands
  during the file's 3–8 s import or after MSW already handles the redirect, and stays green.
- **To prove a wait-bound fix, squeeze deterministically, not with load** (10.16a QA fixes,
  2026-09-16). Delay the awaited handler with msw's `delay(1500)`: under the old bounds it goes red
  with the production failure message, and under the new bounds it stays green. Load is a
  poor instrument here. Two full suites run at once make `studioRunTransport.node.test.tsx` time
  out (40 s), yet that file is 5/5 when run alone. Re-run an extra failure in isolation before
  blaming anything.
- None of the three failures is owned by an Epic 10 story. Report them, do not absorb them, and do
  not reconfigure resolution to hide them.

Related: [[epic10-falsification-standard]], [[backend-check-baseline]].
