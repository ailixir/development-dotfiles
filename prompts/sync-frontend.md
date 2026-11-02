# Sync UI Studio work from the put-checks monorepo: frontend repo

Run this inside the split **frontend** repo. The goal is to bring in every frontend change the monorepo made for UI Studio since 2026-09-02, including the shared files that work touched, without losing anything this repo changed since the split. Go file by file:
- Decide whether each file is new, an update to an existing file, or a merge with changes made here.
- Analyze every conflict individually and resolve the ones that are clear.
- Flag anything unclear with three options and a recommended one.

## Component facts

- `COMP=frontend/`
- Expected: `git -C "$MONO" diff --name-status --no-renames 6e71f916b 2597277e4 -- frontend/` returns 365 entries (287 A, 64 M, 14 D).
- Path-mapping anchors: `src/ChecksModule.tsx`, `src/App.tsx`, `vite.config.ts`, `webpack.config.js`, and `package.json` (`"name": "put-checks-module"`).
- Studio-owned folders: `src/components/studio/`, `src/pages/ChecksStudioPage/`, `src/pages/UiTestDetailsPage/`, `src/services/mocks/studio/`, `src/types/studio/`, `src/utils/studio/` and `e2e/realsite-gate/`. Everything in them is Studio, and the monorepo is the source of truth for them unless this repo adapted them after the split. `src/pages/StudioRunsPage/` and `src/pages/StudioTestsPage/` were deleted in the monorepo.
- Every other path in the change set is a shared file: 104 STUDIO and 38 OTHER. The STUDIO count includes `dev.sh`, added on 2026-11-02.
- OTHER files: not Studio, but still part of the sync. They come from the "stable version" commit `9fbd3970c` (Splunk prototype, runtime-config rename) and the rescue commit `51ade0f1f` (lint cleanups, report autosave in `ReportBuilder.tsx`).
  - The config files among them (`.eslintrc.json`, `index.html`, `public/*`) keep this repo's version under the config rule.
  - Paths below are relative to `frontend/`:
  - `.eslintrc.json` (M)
  - `index.html` (M)
  - `public/checks-config.js` (D)
  - `public/config.js` (A)
  - `public/index.html` (M)
  - `src/components/checks/wizard/configs/HttpConfig.tsx` (M)
  - `src/components/home/KPIBar.tsx` (M)
  - `src/components/home/TriageDrawer.tsx` (M)
  - `src/components/home/UpcomingSchedules.tsx` (M)
  - `src/components/reports/RecipientsEditor.tsx` (M)
  - `src/components/reports/RuleBuilder.tsx` (M)
  - `src/components/reports/ScheduleEditor.tsx` (M)
  - `src/components/shared/States/ErrorState.tsx` (M)
  - `src/main-simple.tsx` (M)
  - `src/pages/ChecksTemplatesPage/ChecksTemplatesPage.tsx` (M)
  - `src/pages/Reports/ReportBuilder.tsx` (M)
  - `src/pages/Reports/ReportDetailsPage.tsx` (M)
  - `src/pages/Reports/ReportsHome.tsx` (M)
  - `src/pages/SplunkPrototypePage/ResultTable.tsx` (A)
  - `src/pages/SplunkPrototypePage/SplunkPrototypeConfig.tsx` (A)
  - `src/pages/SplunkPrototypePage/SplunkPrototypePage.test.tsx` (A)
  - `src/pages/SplunkPrototypePage/SplunkPrototypePage.tsx` (A)
  - `src/pages/SplunkPrototypePage/evaluatePreview.test.ts` (A)
  - `src/pages/SplunkPrototypePage/evaluatePreview.ts` (A)
  - `src/pages/SplunkPrototypePage/index.ts` (A)
  - `src/pages/SplunkPrototypePage/types.ts` (A)
  - `src/services/api/checksApi.test.ts` (M)
  - `src/services/api/responseAdapter.ts` (M)
  - `src/store/slices/checksSlice.test.ts` (M)
  - `src/store/slices/csiSlice.ts` (M)
  - `src/store/slices/dashboardSlice.ts` (M)
  - `src/store/slices/featuresSlice.test.ts` (A)
  - `src/store/slices/featuresSlice.ts` (M)
  - `src/store/slices/reportsSlice.ts` (M)
  - `src/store/slices/sourcesSlice.test.ts` (M)
  - `src/store/slices/sourcesSlice.ts` (M)
  - `src/test/bootstrapIsolation.test.ts` (A)
  - `src/utils/commsBridge.ts` (M)

## Sources and pinned commits

- **Monorepo location.** Before you start, set `MONO` to your local clone of the put-checks monorepo, for example:
  - Windows (Git Bash): `MONO=C:/Users/bb68376/workspace/EAMP/development-dotfiles`
  - Mac: `MONO=/Users/brunobuger/orca/workspaces/put-checks/ui-studio`

  If I haven't said which one to use, ask me. Then check that the clone has the pinned commit, using `git -C "$MONO" cat-file -e "$SOURCE_HEAD^{commit}"`. If that fails, stop and ask me to fetch.
- **Read-only access.** Read the monorepo only through `git -C "$MONO" show|diff|log|ls-tree|cat-file|merge-base` at the pinned commits below. This works whatever branch the clone has checked out. Never edit, check out, stash, reset or commit there.
- `SOURCE_HEAD=2597277e4893ae24565fb4f2f01e21e9de701c55` (branch `brunobuger/ui-studio`, 2026-11-02 14:22). This is the version to bring in.
- `WINDOW_BASE=6e71f916b`: the last monorepo commit before 2026-09-02. The first commit in the window is `9fbd3970c` "stable version" (2026-09-09). Monorepo `main` is `c81911b30` (2026-09-20), an ancestor of `SOURCE_HEAD`.
- `COMP` (this repo's folder in the monorepo) and the expected change count are in "Component facts" above.

## Ground rules

- Start only from a clean working tree. Create the local branch `sync/ui-studio-2026-11` from the tip of this repo's default branch.
- Never push, open a PR, force anything or rewrite history. Commit locally in the groups listed in Step 7, using Conventional Commits.
- Apply nothing that is FLAGGED until I have decided it.
- Use this repo's own tooling: its declared package manager and lockfile, and its Gradle wrapper. Never hand-merge a lockfile. Resolve the manifest first, then regenerate the lockfile.
- Ignore monorepo files under `**/.claude/agent-memory/**`.
- Every path in the change set gets exactly one row in the report. Nothing is skipped silently.
- Keep what you verified (a command you ran, a file you read) apart from what you inferred, and label inferences.

These product decisions settle many conflicts. Cite them when you use one:
- Studio is unreleased and has one authoring path end to end. There are no legacy paths, compatibility layers, old routes or redirects. Where this repo still carries Studio code that the monorepo removed or replaced, that favors the monorepo side.
- Removing a gate deletes it. No kill switch or flag is left behind.
- Accessibility covers functional must-haves only (ADR-SC-006). There are no WCAG/axe checks, screen-reader work, live regions or keyboard shortcuts. Don't reintroduce removed ones.
- UI tests are checks. They are listed in All Checks, created through Create Check → UI Test, scheduled through the shared check scheduling, and use test-scoped secrets. The old standalone secrets API is gone.

When a hunk's intent is unclear, read the monorepo commit (`git -C "$MONO" show <hash>`). Also read any story or ADR it cites, at `git -C "$MONO" show "$SOURCE_HEAD":docs/<path>`.

## Config and deployment files: this repo's version wins

These count as config and deployment files:
- **Build and package manifests, tool configs:** `package.json`, `.npmrc`, `.nvmrc`, `tsconfig*.json`, `vite.config.ts`, `vitest*.config.ts`, `webpack.config.js`, `playwright.config.ts`, ESLint configs, `build.gradle.kts`, `settings.gradle.kts`, `gradle.properties`.
- **Runtime config:** `application*.yml`, `logback-spring.xml`, `.env*`, `index.html`, `public/config.js`.
- **Deployment:** `Dockerfile`, Helm charts and `values*.yaml`, Kubernetes manifests, CI pipelines.
- **Local start scripts:** `dev.sh` and `scripts/local-*.mjs`.

For these files, this repo's current version is the baseline. That holds whatever category Step 3 would give the file:
1. **Keep what this repo has.** Keep every setting it already has, with its current value. Don't take the monorepo's value for an existing non-Studio setting, and don't remove settings this repo has. Non-Studio settings include ports, URLs, registries, image names, resource limits, profiles, versions of shared dependencies, lint rules and the package manager.
2. **Add only what the Studio work needs.** Add the new keys, entries, dependencies, scripts, env vars, templates and values that the monorepo added for Studio: UI tests, the runner, guided learning, the LLM/Vertex gateway, Studio secrets, UI-test scheduling. For each one, cite the Studio or Epic 10 commit that introduced it. Some examples:
   - `studio:` and its children in `application.yml`
   - `studioRunner:` in Helm `values.yaml`
   - the new frontend devDependencies `@playwright/test`, `msw`, `ajv` and `yaml`
   - not `checks.dc.*`, which belongs to the Splunk/DailyChecks work
3. **Don't add unused dependencies.** Add a dependency only if the synced code imports or runs it. For example, the frontend's `axe-core` is imported by nothing at `SOURCE_HEAD`, so leave it out.
4. **Existing Studio settings.**
   - If the monorepo changed the value, take the monorepo value, unless this repo changed it after the split. In that case, FLAG it.
   - If the monorepo removed a Studio setting, remove it here too (single path, no compat).
5. **Shared settings the Studio code depends on.** If the Studio code needs a different value for a shared setting to build or run, FLAG it instead of changing it silently. Examples: a newer version of a shared dependency, a TS compiler option, a Spring property.
6. **Unclassifiable settings.** If you can't tell whether a setting is Studio-related, FLAG it. `checks.security.bypass.*` and Helm `identityBypass`, `runtimeConfig` and `envFromSecrets` need a decision, for example.
7. **Files this repo doesn't have.** If the monorepo file is new and this repo has no equivalent, add it when it is Studio-specific or needed by the Studio code and tests (for example the `studio-runner-*.yaml` Helm templates). Otherwise FLAG it with a recommendation. If this repo has an equivalent under another name, such as its own start script or pipeline, keep that one and add the Studio parts to it.
8. **Lockfiles.** Never copy a lockfile. Regenerate this repo's lockfile with its own package manager.

In the report, list for each config or deployment file:
- the settings added, updated and removed
- the monorepo changes you deliberately did not apply, with the reason

## Step 1: Path mapping and split point

1. **Path mapping.** Work out how `$COMP<path>` maps into this repo. It is usually the repo root, but verify it with the anchor files in "Component facts". Record every rename made during the split as an explicit mapping rule: moved folders, renamed Java packages or TS path aliases, a renamed package name. Report the mapping before you continue.
2. **Split point S**, the monorepo commit this repo was cut from. The split repos were hand-copied, so they share no git history with the monorepo. Find S by content:
   - Let `I` be this repo's import commit, the first commit that brought the component in.
   - Walk `git -C "$MONO" rev-list "$SOURCE_HEAD" -- $COMP` from newest to oldest. For each commit C, count the mapped files whose blob id in `C:$COMP` equals the blob id at `I` (use `git ls-tree -r`). Stop early on a 100% match.
   - S is the C with the highest match ratio; on a tie, take the newest.
   - If the copy rewrote file contents (for example a package rename), compare after applying the mapping rules, and say that you did.
   - If this repo's history turns out to contain the monorepo commits after all (same subjects, authors and dates), S is the newest of them, and `I` is its counterpart here.
   - Report S (hash, date, subject), the match ratio, and how many files differ at `I`. If the best ratio is below 90%, list the top 3 candidates and stop for my confirmation.
   - `B = git -C "$MONO" merge-base S "$SOURCE_HEAD"`. B equals S when S is on that history.
3. **Change set.** Take the union of `git -C "$MONO" diff --name-status --no-renames "$WINDOW_BASE" "$SOURCE_HEAD" -- $COMP` and the same diff starting from B.
   - Check the first diff against the expected count. If it doesn't match, stop and report.
   - If S is older than `WINDOW_BASE`, say so: the diff from B will be larger.

## Step 2: Inventory, one entry per path

For every path in the change set:
- **Versions.** Read the three versions and note which ones exist:
  - BASE = `B:$COMP<path>`
  - THEIRS = `SOURCE_HEAD:$COMP<path>`
  - OURS = this repo's `HEAD:<mapped path>`
- **Moved copies.** If OURS is missing but BASE or THEIRS exists, search this repo for a moved or renamed copy (same basename, or at least 70% content similarity). If you find one, use it as OURS and mark the row MOVED.
- **Monorepo history.** List the monorepo commits that touched the path after the split: `git -C "$MONO" log --format='%h %ad %s' --date=short B.."$SOURCE_HEAD" -- $COMP<path>`.
- **This repo's history.** List this repo's commits that touched it since the import: `git log --format='%h %ad %s' --date=short I..HEAD -- <mapped path>`.
- **Tag.** Tag the path STUDIO or OTHER. The OTHER list is in "Component facts"; everything else is STUDIO.

Keep the inventory in a working file, for example `.sync-ui-studio/inventory.tsv`.

## Step 3: Classify each file

Config and deployment files follow the rule above, whatever category they fall into. For example, a config file that would be FAST-FORWARD still gets only its Studio additions.

| Category | Condition | Action |
|---|---|---|
| IDENTICAL | OURS = THEIRS | none |
| KEEP-OURS | THEIRS = BASE and OURS differs (only this repo changed it after the split) | keep |
| FAST-FORWARD | OURS = BASE and THEIRS differs | take THEIRS |
| ADD | only THEIRS exists, and no moved copy was found | add at the mapped path |
| DELETE | THEIRS is missing and OURS = BASE | delete |
| ADD/ADD | BASE is missing; OURS and THEIRS both exist and differ | 3-way merge with an empty base |
| MERGE-CLEAN | all three differ and `git merge-file -p OURS BASE THEIRS` reports no conflict | review the result (see below) |
| CONFLICT | `git merge-file` reports conflicts | Step 4, hunk by hunk |
| DELETE-vs-MODIFY | THEIRS is missing and OURS changed since BASE, or THEIRS changed and OURS was deleted here | FLAG |

Before merging, apply the Step 1 mapping rules to THEIRS (and to BASE). That keeps mapping noise from showing up as conflicts. Say in the row when you did this.

Special handling:
- **Review every MERGE-CLEAN result.** A clean textual merge can still be wrong. Read the merged file and look for:
  - duplicated imports, routes, beans or config keys
  - a symbol renamed on one side but still used under the old name on the other
  - a changed signature whose callers are on the other side
  - duplicate Flyway versions

  If you find any of these, reclassify the file as CONFLICT and treat that spot as a hunk.
- **Formatting.** Differences that are only formatting (formatter output, import order) are not conflicts. Take the content and keep this repo's formatter output.
- **Special file types:**
  - Lockfiles: regenerate them.
  - Binary files: choose the whole file.
  - Generated files: regenerate them with the generator if this repo has it. Otherwise take THEIRS and note it.

## Step 4: Analyze every conflict individually

Each of these is its own item:
- each `<<<<<<<` block
- each semantic issue found in a clean merge
- each file-level DELETE-vs-MODIFY

Never decide several hunks with one ruling, even when they are in the same file.

For each item:
1. **Monorepo side.** Say what changed and why. Cite the commit hash and subject. When the subject alone doesn't explain the change, read the diff and any story or ADR it cites.
2. **This repo's side.** Say what changed and why. Cite the commit hash and subject.
3. **Decision.**
   - **RESOLVED** when one answer is clearly right. That covers these cases:
     - both sides make the same change
     - one side is formatting only
     - one side is a strict superset of the other
     - the edits are independent and compose
     - one of the product decisions above settles it

     Give a one-line reason and the evidence.
   - **FLAGGED** when it isn't clear. Give exactly three options:
     - **A:** take the monorepo hunk.
     - **B:** keep this repo's hunk.
     - **C:** a combined resolution, with the exact code.

     When A/B/C don't fit the case, give three options that do, still exactly three. For each option, say what it does and what could break. Then write "Recommended: <letter>", with a reason grounded in your analysis: commits, callers, tests, product decisions. Also give the risk if the recommendation is wrong.

## Step 5: Cross-repo dependencies

In the monorepo, this component reads files outside its own folder. Those paths break in a separate repo.
1. **Find every reference.** Grep THEIRS (after Step 3) for `../docs/`, `docs/specs`, `docs/qa`, `docs/stories`, `docs/epics`, `../studio-runner/`, `studio-runner/`, `../backend/`, `backend/`, `../frontend/`, `frontend/`, `../helm-chart/`, `helm-chart/`, `tools/` and `REPO_ROOT`.

   Many references are built from path segments rather than written as one string, for example `Path.of("..", "docs", "specs", …)` or `join(packageRoot, '..', 'helm-chart', 'put-checks')`. So also grep for the quoted segments `"docs"`, `'docs'`, `"helm-chart"`, `'helm-chart'`, `"studio-runner"`, `'backend'`, `"frontend"` and `"tools"`.

   List every hit as file:line → target. Separate the paths that are read or run from plain strings used only as labels.
2. **Reuse what this repo already has.** Check whether this repo already handles a target, for example with a vendored copy, an env var or a CI checkout. If so, resolve to that mechanism and sync the vendored copy from `SOURCE_HEAD`.
3. **Flag the rest.** FLAG once per target group, not once per test file. Give three options, typically:
   - **A:** vendor a copy into this repo, record its source commit, and rewrite the paths.
   - **B:** make the path configurable (env var or property) and check out the other repo in CI.
   - **C:** skip or remove the dependent tests or checks here, with a named reason.

   Recommend one option per group.
4. **Keep the three repos consistent.** The shared Studio contracts (`docs/specs/studio/` and `docs/specs/studio-observed-authoring/contracts/v3/`) are read by all three repos, so the same choice should be made in each.

The known references are listed in "Component-specific checks". Treat that list as a starting point; your grep is the authority.

## Step 6: Report, then ask

Write `.sync-ui-studio/REPORT.md`. Add `.sync-ui-studio/` to `.git/info/exclude` and don't commit it. The report has five parts:
1. **Summary.** The path mapping, S and B, the change-set size against the expected count, and counts per category and per tag.
2. **File table.** Every path exactly once: monorepo path → repo path, STUDIO/OTHER, category, action, note.
3. **Resolved items.** Each with its file:line, the ruling and a one-line reason.
4. **Flagged decisions F1…Fn.** For each one:
   - file:line, or the target group
   - both sides' intent, with commit refs
   - options A/B/C, with the code for C
   - which option is recommended, and why
   - the risk if the recommendation is wrong
5. **Root-level files.** Monorepo files outside `$COMP` that may belong here (see "Component-specific checks"), each with a recommendation. These are FLAGS too.

Then ask me the flagged decisions. If a structured-question tool is available, use it: up to 4 questions per call, with the recommended option first and labeled "(Recommended)". If there are more than 12 flags, first ask whether to accept all recommendations, and let me name the ones I want to review.

## Step 7: Apply, commit, verify

1. **Apply the clear items.** Apply the non-flagged actions and commit them in groups:
   - (a) Studio-owned folders
   - (b) STUDIO shared files
   - (c) OTHER files
   - (d) config and deployment files (Studio additions only) and regenerated lockfiles
2. **Apply the flagged decisions.** After I answer, apply them and commit, citing the F-numbers in the message.
3. **Verify.** Use the commands in "Component-specific checks". Run narrow checks (compile, type-check) after each group and the full suite once at the end. Report any failure with its output and a proposed fix. Don't hide it, skip it or patch it silently.
4. **Final message.** Include:
   - the branch and its commits
   - counts per category
   - each flagged decision and the choice made
   - the verification commands and their results
   - anything still open

## Component-specific checks

- **Package manager: follow this repo.**
  - The monorepo moved the frontend from npm to pnpm. It added `.npmrc` (`node-linker=hoisted`) and `pnpm-lock.yaml` and deleted `package-lock.json`. Don't carry that over.
  - Keep this repo's package manager, `.npmrc` and lockfile. Add only the Studio dependencies to `package.json`, then regenerate this repo's lockfile.
  - `@put/core-components` is a `file:` dependency on a sibling checkout (`../../put-core-components` from `frontend/dev.sh`). Keep however this repo resolves it.
  - If the webpack build fails on module resolution afterwards, FLAG it.
- **Config files in the change set** follow the config rule: `package.json`, `vite.config.ts`, `vitest.config.ts`, `webpack.config.js`, `playwright.config.ts`, `index.html`, `public/config.js`, `.eslintrc.json` and `.npmrc`.
  - `playwright.config.ts` is new. It runs the Studio e2e specs, so add it if this repo has no Playwright config; if it has one, add the Studio projects to it.
  - `dev.sh` is new, added 2026-11-02. It starts Vite against a local backend and replaces the old root `dev.sh`. Keep this repo's own start script if it has one, adding any Studio-specific environment from `dev.sh`; otherwise add `dev.sh`.
- **MSW and bootstrap.**
  - The monorepo removed the browser mock worker: `src/components/providers/MswGate.tsx` was deleted and `src/utils/retireLegacyStudioWorker.ts` was added.
  - MSW now runs only in Node: the Vitest server is `src/services/mocks/studio/server.ts` and the Playwright proxy is `e2e/mswProxy.ts`.
  - If this repo still has `public/mockServiceWorker.js` or an `msw:init` script, flag their removal.
- **Navigation.**
  - Navigation now lives in `src/utils/navigation/navigationSetup.ts`; `src/utils/constants/navigationConfig.ts` was deleted.
  - `HelpDialog.tsx` and `CommandPalette.tsx` were deleted, because keyboard shortcuts were removed under ADR-SC-006.
- **Cross-repo references (known):**
  - **Studio contracts.** Code reads `docs/specs/studio/` (`openapi.yaml`, `examples/context-authoring-{valid,invalid}.json`) and `docs/specs/studio-observed-authoring/contracts/v3/` (`fixtures.json`, `publication-fixtures.json` and others), through `../…/docs/…` or a local `REPO_ROOT`:
    - `src/services/mocks/studio/fixtures.ts` and `guidedFixtures.ts` are runtime fixtures for the mocks, not just tests.
    - Tests that read them: `src/services/mocks/studio/*.test.ts`, `src/components/studio/**/*.test.tsx`, `src/pages/ChecksStudioPage/pageRunGate.test.tsx`, `src/types/studio/studioContextContract.test.ts` and `src/services/api/studioAuthoringTransport.test.ts`.
  - **QA evidence file.** `src/components/studio/SecretInput.test.tsx` reads `docs/qa/evidence/STUDIO-OBS-009/ux-fix-067/copy.md`.
  - **Doc-path strings.** `src/components/studio/guided/guidedNarratives.ts` holds `docs/…`, `backend/…` and `frontend/…` paths as strings. Check whether anything reads them as files or uses them only as labels.
  - **Real-site gate.** `e2e/realsite-gate/` uses `REPO_ROOT`, which is the monorepo root:
    - `environment.ts` hashes `backend/…`, `studio-runner/…` and `frontend/…` sources, reads `backend/src/main/resources/studio/*` and the v3 contracts, and runs `tools/build-playwright-reference.cjs`.
    - `gate-cli.ts` runs commands in `studio-runner/`.
    - `gate-table.test.ts` reads `studio-runner/evaluation/grounding/corpus/tasks.jsonl`.
    - `leakscan.test.ts` reads `backend/src/main/resources/db/migration`.
    - `stack/gate-stack.sh` needs `studio-runner/dist`.
    - `e2e/studio-realsite-gate-real-backend.spec.ts` assumes the monorepo layout.
    - The gate needs all three components. Flag where it should live. Possible options: keep it here with paths to sibling checkouts, move it to an integration repo, or drop it here.
  - **Other repos read this repo's files.** The backend's `StepExampleStoreIT` and the runner's `evaluation/grounding/step-code.mjs` read `e2e/realsite-gate/gate-table.json` (the runner also reads `smoke-flows.json`). Don't move or rename those files without flagging it.
  - **Real backend.** `e2e/start-servers.mjs` and the `*-real-backend.spec.ts` specs expect a real backend at `CHECKS_E2E_BACKEND_URL` (default `http://127.0.0.1:8080`).
- **Monorepo root files.** The root `dev.sh` and `tools/studio-local-tls*` were deleted on 2026-11-02; each component now has its own `dev.sh`. The one remaining candidate is the frontend variables in `.env.example`. Apply the config rule to them.
- **Verify:**
  1. Install with this repo's package manager.
  2. Run its type-check and lint scripts.
  3. Run Vitest once with `vitest run`. The monorepo's `test` script starts watch mode, so don't use it here.
  4. Run the Playwright MSW project only. The real-backend specs need the backend and runner, so report them as not run.
