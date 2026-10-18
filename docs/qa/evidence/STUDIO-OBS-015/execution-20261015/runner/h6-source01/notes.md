# STUDIO-OBS-015 H6 source 01: `containsText` whitespace normalization (runner)

Author: Dex-R (@dev). 2026-10-16. Implements Aria's ruling H6 (`../../backend/r2-diagnosis01/aria-h8-h6-ruling01/ruling.md`, sha256 `86a53bec…`).
This is an apply-ready patch only. No repo byte under `studio-runner/`, `backend/`, `frontend/`, `tools/`, `docs/specs/` or `.github/` was written. No build was run in the repo, and `dist/` was not touched.

## Apply

From the repo root: `git apply -p0 docs/qa/evidence/STUDIO-OBS-015/execution-20261015/runner/h6-source01/h6.patch`.
`git apply --check -p0` passed against the live tree on 2026-10-16. Pre-image hashes are in `manifest.json`.
The ruling requires a dist rebuild before the joined lane (H6.2). That belongs to whoever applies the patch, after the live validation run finishes.

## Change (3 files)

- `studio-runner/src/run/observationCollector.ts`: in `invoke` → `case 'assert'`, `containsText` now returns `normalizeName(innerText).includes(normalizeName(expected))`, plus one comment line citing F4.
  - `normalizeName` is the existing closure function. [V] It is equivalent to Playwright 1.63.0 `normalizeWhiteSpace` in `playwright-core/lib`, which does `replace(/[​­]/g,"").trim().replace(/\s+/g," ")`. Collapsing before trimming gives the same result because both use the same `\s` set.
  - Not changed: `read`, `businessText`, `validateInvocation`, `hasValue`, `assertPage`. `EXECUTOR_VERSION` stays `2.1.0`.
- `studio-runner/test/run/observationCollectorInvoke.test.ts`:
  - The existing `containsText` test is kept.
  - Added the ruling's 8-row table as `it.each`, using the title `containsText compares whitespace-normalized rendered text with the whitespace-normalized expected value (F4)`.
  - Added the byte-exact read case: a padded `<output>` read through a region grant returns the padded string unchanged, and `containsText` with that same padded value passes.
  - `install()` gained an optional `policy` parameter (default `config`) so the read case can pass a grant.
- `studio-runner/test/fixtures-tier/observed-contains-text-parity.test.ts` (new): a real-Chromium parity table with 11 rows.
  - It compares the runner's `invoke` `containsText` result with the pinned `expect(locator).toContainText` from `playwright/test` as the oracle. A negative result is confirmed with `.not.toContainText`.
  - The first row is the frozen ReplayIT shape: `<dt>Reference</dt><dd>␠␠fresh-1-<uuid>-é😀␠␠</dd>`, with the target named by the term fallback.
  - The other rows use `<output>`: preserved tabs and newlines, inline children, exact match, soft hyphen, ZWSP, NBSP, a different word, case, no word-joining, and a whitespace-only expected value.
  - Per the ruling, hidden descendants, `text-transform` and `<br>` are excluded, because Playwright `elementText` differs from `innerText` on those by design.

## What I ran (isolated copy only)

Everything ran in `$SCRATCH/h6/studio-runner`. That is an rsync of `studio-runner/` without `node_modules`, `dist` or `coverage`, with a real `node_modules/` directory whose entries are per-package symlinks to the repo's packages, so the Vite cache landed in scratch. `docs/specs` and `tools` were mirrored next to it. Node v23.10.0.

| Check | Result |
|---|---|
| `vitest run test/run/observationCollectorInvoke.test.ts` | **24/24 passed** (15 existing + 9 new) |
| Same file against the **original** collector (red check) | 4 of the 8 new table rows fail: padded regression, tab/newline, soft hyphen, whitespace-only. The other 4 already passed, as expected. |
| `vitest run --config vitest.fixtures.config.ts test/fixtures-tier/observed-contains-text-parity.test.ts` (real Chromium 1243, Playwright 1.63.0) | **11/11 passed** |
| The same parity test against the **original** collector (red check) | **7 failed / 4 passed**. The 7 rows are the regression, tabs/newlines, inline children, SHY, ZWSP, NBSP and whitespace-only. |
| `tsc -p tsconfig.json --noEmit` | exit 0 |
| `eslint` on the 3 changed files | exit 0, no findings |
| Full unit tier `vitest run`, patched | 1664 passed, 3 failed, 28 skipped; 24 files failed. This is the same failure set as the unpatched baseline. |
| Full unit tier `vitest run`, unpatched baseline (same copy) | 1655 passed, 3 failed, 28 skipped; 24 files failed. `diff` of the failure lists is identical. |

- **Baseline failures are environmental [V].** The copy lacks the repo-root `ajv` (`Cannot find module 'ajv'`), `docs/runbooks/studio-runner.md`, and the pins context used by `check:pins`. They are the same with and without the patch. The full tier was **not** run in the real repo.
- **Not run:**
  - other fixtures-tier files (none of them use `containsText`);
  - the joined `assert-fail` label;
  - a dist rebuild;
  - CodeRabbit (it is WSL-only and not available on this host).

## Decisions

- `[AUTO-DECISION]` Real-Chromium test placement: a new file instead of extending `guided-dataflow.test.ts` (reason: an isolated parity table with no dependency on the guided runtime harness; the ruling allows either).
- `[AUTO-DECISION]` Oracle import: `expect` from `playwright/test`, the pinned `playwright` 1.63.0 dependency, not `@playwright/test`. [V] It works outside the test runner. It adds no dependency, and `confinement.test.ts` only forbids the `@playwright/test` string in `isolation.test.ts`.
- IDS: REUSE `normalizeName` (no new helper, no alias). ADAPT the existing `install()` helper and the `guided-targets.test.ts` session pattern. CREATE one test file (no existing parity test).
