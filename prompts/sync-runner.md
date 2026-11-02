# Sync the studio-runner from the put-checks monorepo (override mode)

Run this inside the split **studio-runner** repo. This repo holds only a boilerplate, so this is not a careful merge:
- **Code:** the runner's source, tests, fixtures, evaluation and scripts from the monorepo override the boilerplate.
- **Config and deployment files:** the boilerplate's files stay as the baseline, and only the settings the runner needs are added to them.
- **Flags:** raised only for the few decisions the code can't settle.

## Sources

- Monorepo, read-only: `MONO=/Users/brunobuger/orca/workspaces/put-checks/ui-studio`. It is a shared git worktree. Read it only through `git -C "$MONO" archive|show|ls-tree|log` at the pinned commit. Never edit, check out, stash, reset or commit there.
- `SOURCE_HEAD=2597277e4893ae24565fb4f2f01e21e9de701c55` (branch `brunobuger/ui-studio`, 2026-11-02 14:22).
- The runner is `studio-runner/` at that commit, with 716 tracked files. Check the count with `git -C "$MONO" ls-tree -r --name-only "$SOURCE_HEAD" -- studio-runner | wc -l`. If you get a different number, stop and report. Skip `studio-runner/.claude/` (agent memory, 3 files).
- The 2026-11-02 commits added `dev.sh`, `scripts/local-stack.mjs`, `scripts/local-stack.check.mjs` and `scripts/local-tokens.mjs`. They also changed `eslint.config.js`, `vitest.config.ts`, `README.md` and `test/deployment/*`.

## Ground rules

- Start only from a clean working tree. Create the local branch `sync/ui-studio-2026-11` from the tip of the default branch.
- Never push, open a PR or rewrite history. Commit locally, using Conventional Commits.
- Copy tracked files only, using `git archive`. Never copy the monorepo's `node_modules/`, `dist/` or untracked files.
- Keep what you verified apart from what you inferred.

## Two kinds of files

- **Config and deployment files** keep the boilerplate as the baseline. They are:
  - `package.json`, `.npmrc`, `.nvmrc`, `tsconfig*.json`, `eslint.config.js`, `vitest*.config.ts`
  - `Dockerfile`, Helm or Kubernetes files, CI pipelines
  - `.env*`
  - `dev.sh` and `scripts/local-*.mjs`
- **Everything else** comes from the monorepo and overrides the boilerplate: `src/`, `test/`, `fixtures/`, `evaluation/`, `scripts/` (other than `local-*`) and docs such as `README.md` and `ci/stages.md`.

## Step 1: Look at the boilerplate first

1. **Sort the boilerplate's tracked files** into three groups:
   - **Config and deployment:** as defined above.
   - **Infrastructure:** files the runner doesn't have that belong to the repo itself, such as `.github/`, `Jenkinsfile`, `CODEOWNERS`, `catalog-info.yaml`, `LICENSE`, security/sonar/renovate configs and editor settings. These are kept unchanged.
   - **Sample code:** boilerplate sources and tests that exist only as placeholders, such as a hello-world `src/` file or a sample test.
2. **Confirm the layout.** The runner's files go at the repo root: `studio-runner/<path>` → `<path>`. If the boilerplate expects something else, such as a subfolder or a workspace layout, stop and ask.

## Step 2: Copy the code

1. Extract the runner into a temp dir outside this repo: `git -C "$MONO" archive --format=tar "$SOURCE_HEAD" studio-runner | tar -x -C "$TMP"`.
2. Copy everything except the config and deployment files from `$TMP/studio-runner/` onto the repo root, overwriting collisions and excluding `.claude/`.
3. Delete the boilerplate sample code that the runner replaces.

## Step 3: Add the runner's config to the boilerplate's

For each config or deployment file, start from the boilerplate's version.
1. **Keep the boilerplate.** Keep every setting it has, with its value: package name, version, registry, `publishConfig`, package manager, Node version, base image, lint and TS conventions, CI jobs.
2. **Add what the runner needs:**
   - **`package.json`:** the runner's dependencies (pinned exactly, as in the runner), its scripts (`build`, `type-check`, `lint`, `test`, `test:fixtures`, `test:perception`, `test:deployment`, `check:pins`, `evaluate`, `browsers:install`), `type: module`, and `engines` if the boilerplate has none.
   - **ESLint:** the runner's rules. `eslint.boundary-rules.{js,d.ts}` are new files, and `test/lint-boundary.test.ts` checks them.
   - **TS:** the compiler options the runner's code needs.
   - **Vitest:** the include patterns, setup and timeouts the runner's tests need. `vitest.deployment.config.ts`, `vitest.fixtures.config.ts` and `vitest.perception.config.ts` are new files; add them.
   - **`Dockerfile`:** what the runner needs at runtime, such as Playwright Chromium and its OS dependencies, the `dist/` entrypoint, and the runtime-versions file.
   - **Local start:** `dev.sh` and `scripts/local-*.mjs`. They are new, so add them, unless the boilerplate has its own start script. In that case, add the runner's steps to it.
   - **`.env*`:** the runner's variables.
3. **Adapt script calls.** If the runner's scripts call a different package manager than the boilerplate uses (for example `"typecheck": "npm run type-check"`), switch them to the boilerplate's manager.
4. **FLAG unresolvable conflicts.** Raise a FLAG when a boilerplate value and a runner need can't both hold. Typical cases:
   - an ESM vs CommonJS module setting
   - a Node version that differs from the runner's pin (enforced by `check:pins`, `test/pins.test.ts` and `test/runtime-versions.test.ts`)
   - a base image without Playwright support
   - a lint rule the runner's code breaks in many places
5. **Lockfile.** Never copy `package-lock.json`. Regenerate the lockfile with the boilerplate's package manager.

## Step 4: Flags (only these)

For each flag:
- give exactly three options, A/B/C
- say what each option does and what could break
- mark one "Recommended", with the reason
- give the risk if that choice is wrong

The expected flags:

1. **Config conflicts** from Step 3.4.
2. **Studio contracts.** These references are often built from path segments, such as `join(packageRoot, '..', 'docs', 'specs', 'studio', 'openapi.yaml')`.
   - About 30 tests and helpers read `../docs/specs/studio-observed-authoring/contracts/v3/` (`publication-fixtures.json`, `fixtures.json`, `wire-parity.fixtures.json`, `publication-canonical-vectors.json`, `timing-order-vectors.json`).
   - `test/contract.test.ts`, `test/contract-integrity.test.ts` and `test/server/observedReplayRoutes.test.ts` read `docs/specs/studio/openapi.yaml`.
   - `test/allowedDomains.test.ts` reads `docs/specs/studio/allowed-domains-vectors.json`.

   The usual options are:
   - **A:** vendor a copy, record its source commit, and rewrite the paths.
   - **B:** make the path configurable and check out the contracts in CI.
   - **C:** skip those tests here.

   The frontend and backend repos read the same contracts, so the choice should match theirs.
3. **Deployment tests.** `test/deployment/helm.ts` sets `CHART_DIR` to `../helm-chart/put-checks`, which the `test/deployment/*.test.ts` suite uses (run by `test:deployment`). `backend-env.test.ts` and `cancel-budget-env.test.ts` also read `../backend/src/main/**`, including `application.yml`. Decide where the chart lives and how these tests reach it and the backend config.
4. **Root tools.** `test/generated-contracts.test.ts` runs `../tools/build-studio-observed-schemas.cjs`, and `test/helpers/incrementalNegativeBoundaries.ts` uses `../tools/check-studio-observed-contracts.cjs`. Other monorepo tools that serve the runner:
   - `tools/check-studio-current-catalog.cjs`
   - `tools/check-studio-current-vectors.cjs`
   - `tools/studio-current-vector-factory.cjs`
   - `tools/studio-snapshot-contract-oracle.cjs`
   - `tools/corun.sh` and `tools/corun-report.mjs`

   Raise one flag for whether to bring them in, and where.
5. **Evaluation inputs.** The evaluation scripts read files from other parts of the monorepo:
   - `evaluation/grounding/` reads `backend/src/main/resources/studio/*`, `frontend/e2e/realsite-gate/{gate-table,smoke-flows}.json` and `docs/qa/spikes/SPK-07`.
   - `evaluation/observed-authoring/` uses `REPO_ROOT`, and its `manifest.json` points at `docs/qa/evidence/...` and `docs/stories/...`.
   - `test/helpers/evidenceOut.ts` writes to `../docs/qa/evidence`.
6. **Broken test.** `test/run/observationDeadline.test.ts` reads `docs/qa/evidence/adr-sc-007/wi-4/collection-deadline.json`. That file isn't tracked in the monorepo, because the untracked evidence was deleted on 2026-11-01. As written, the test can't pass anywhere.
7. **Helm chart.** This applies if the boilerplate has a Helm chart or Kubernetes manifests. Keep them, and add only the runner parts of the monorepo's chart:
   - `templates/studio-runner-{deployment,service,networkpolicy,scaledobject}.yaml`
   - `templates/studio-object-store-pvc.yaml`
   - the `studioRunner:` values, including Studio enabled in dev and prod (2026-11-02)

   If the boilerplate has no chart, list these in the report as belonging elsewhere.

Don't move or rename the following, because other repos read them:
- `dist/main.js` (the build output path)
- `fixtures/observed-reference/`
- `test/fixtures/result-manifest.json`
- `test/fixtures/perception-parity/baseline.json`
- `scripts/browser-provenance.mjs`
- `src/server/{config,runCoordinator,application}.ts`
- `evaluation/grounding/corpus/tasks.jsonl`

## Step 5: Report, ask, apply

1. **Write the report.** Write `.sync-ui-studio/REPORT.md`. Add `.sync-ui-studio/` to `.git/info/exclude` and don't commit it. Include:
   - counts: runner files added, boilerplate files overwritten, boilerplate files deleted, infrastructure files kept
   - for each config or deployment file, the runner settings added and the boilerplate settings kept where the runner differed
   - the flags F1…Fn
2. **Commit, then ask.** Commit Steps 2 and 3 on the branch, then ask me the flags. If a structured-question tool is available, use it: up to 4 questions per call, with the recommended option first and labeled "(Recommended)".
3. **Apply my answers.** Commit them, citing the F-numbers in the message.

## Step 6: Verify

1. Install with the boilerplate's package manager.
2. Run `type-check`, `lint`, `check:pins`, `build` and `test`.
3. If CI runs `test:fixtures`, `test:perception` and `test:deployment`, run them once at the end. They need Playwright Chromium, installed with `browsers:install`.

Report each command and its result. Tests that depend on the Step 4 flags will fail until those flags are applied; list those failures by file instead of patching them.

The final message gives:
- the branch and its commits
- the counts
- each flag and the choice made
- the verification results
- anything still open
