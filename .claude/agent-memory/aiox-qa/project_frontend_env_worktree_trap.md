---
name: frontend-env-worktree-trap
description: The put-checks frontend gate baseline is worktree-dependent — @put/core-components resolves in the main checkout only, lint is dead everywhere, and a real skip-link defect hides behind the import failure
metadata:
  type: project
---

Three unowned frontend environment facts, all measured 2026-09-11 during the 10.10 gate. Treat the
frontend baseline as **worktree-dependent** and measure it rather than inheriting a number.

1. **`@put/core-components` resolves from the main checkout and nowhere else.**
   `frontend/package.json` declares `"file:../../put-core-components"`. From
   `/Users/brunobuger/workspace/citi/put/put-checks/frontend` that lands on an existing directory
   and `node_modules/@put/core-components -> ../../../../put-core-components` is a **live** symlink.
   From any worktree under `orca/workspaces/put-checks/wt/` the same relative path lands one level
   short and dangles. Two stories have now described this as a repository defect; it is a worktree
   layout consequence.
2. **`npm run lint` lints zero files.** `.eslintrc.json` extends `"@typescript-eslint/recommended"`
   where ESLint 8 requires `"plugin:@typescript-eslint/recommended"`; ESLint aborts before touching
   a file. There is no error count to compare. The "191 errors" figure that circulated is wrong.
3. **`ChecksLayout.a11y` has a real defect behind the import failure.** With the symlink repointed
   at the real package the suite collects and still fails on `/Skip to main content/i` — that string
   exists nowhere in `frontend/src` except the assertion and nowhere in `put-core-components`.
   The import failure **masks** the missing skip link. Both accounts that have circulated are true.

**Why:** the epic-wide BUILD-1 clause makes every frontend story's gate a comparison against a
baseline, and all three of these facts distort it — one makes the baseline machine-dependent, one
makes a gate discriminate nothing, and one hides a defect 10.19's conformance pass will otherwise
find the hard way.

**How to apply:** measure the baseline in a detached `git worktree add` at the story's base commit.
**The install recipe is just `npm install --no-audit --no-fund` in `frontend/`** — measured
2026-09-15 during the 10.11a gate: it succeeds in ~12 s, adds 1014 packages, leaves
`git status --porcelain` **empty** with `package.json` `d7e7eaf7…` and `package-lock.json`
`95f66e0d…` unchanged, and installs `msw@2.15.0`, `ajv@8.20.0`, `yaml@2.9.0` at their declared
versions. npm links the `file:` dependency as a **dangling symlink without verifying the target**,
which is why the whole tree installs and the two `TS2307`s survive. Two earlier recipes are
superseded and both were wrong: copying 478 MB of `node_modules` then patching three packages
(10.10, repeated by 10.11a), and the note that a worktree "can install, just not the whole tree".

Report lint as failed-and-blind, never as passed. Never repair `node_modules` by editing
`package.json`, the lockfile or a tool config — check the diff for those paths before believing a
"no repository file was changed" claim.

**Baseline figures are per-base-commit, not per-epic.** At `78cc634b2` (wave 6) it is
`2 failed | 19 passed (21); 1 failed | 275 passed (276)`, the failures being
`ChecksLayout.a11y.test.tsx` and the committed-red `studioEscalation.test.ts`. The `98 passed`
figure above is 10.10's base and drafts have inherited it wrongly at least twice.

**A fourth fact, measured 2026-09-15: the studio suite is load-fragile.** Test files rendering
`ChecksStudioPage` run 2–3 s per test against vitest's 5 s default. At machine load ~25 (several
agents running suites) full runs fail 4–8 extra tests on pure timeouts — in the story's own page
test *and* in 10.10's `confirmFlow`/`accessibility`/`recompile` — while the same files pass in
isolation and the smaller baseline suite does not flake. **Capture `uptime` beside any suite number
in this repo, and re-run a suspicious file in isolation 3× before calling it a regression or a
flake.**

**A fifth fact, measured 2026-09-16 (10.16a gate): jsdom's origin is `http://localhost:3000`, and
something else often listens there.** `store/index.ts` fetches sources/features at import, before
MSW listens. With a Next.js dev server on :3000 (307 → `/login` → HTML), both slices end up
`fetched: true, data: undefined`, and a late landing crashes page tests with `reading 'find'`.
With a closed port they fail open. **Probe recipe:** an untracked overlay config
(`mergeConfig(base, {test:{environmentOptions:{jsdom:{url:'http://localhost:3999/'}}}})`) passed via
`--config`. It must import vitest by **absolute path** (`<fe>/node_modules/vitest/dist/config.js`),
or it fails to load from `$TMPDIR`. Never kill the :3000 process; it is someone else's.

**ENV-2 update (carry-forward gate, 2026-09-17):** `fix/carry-forward` settles the bootstrap in
`src/test/setup.ts` under a single-purpose MSW server (404s, closed before each file). Verified real by
mutation: leaving it open reddens 16 studio tests, so do not "simplify" the close away. The race it
hides is also a product defect (PROD-1): the fulfilled reducers accept a non-JSON 200. Stand-in recipe
that worked: a dual-stack node server on :3931 (`307 → /login`, /login delayed 9 s) plus the overlay.

**Attribution recipes that worked (10.16a):**
- **Base tree without touching shared git metadata:** `git archive <base> | tar -x` (the WHOLE
  tree, since frontend tests read `backend/` files) + symlink `frontend/node_modules`.
- **Split the cause:** interleave base/head full runs at matched load, and also run the suspect file
  alone. Equal alone but slower in-suite means suite composition, not product code.
- **Throttle only yourself** with `taskpolicy -b`, never with CPU burners on this shared host.
- **Tie a flaky `findBy*` failure to timing:** shrink its timeout and check that the message is
  identical.

Related: [[epic10-gate-policy]], [[qa-review-verification-depth]]
