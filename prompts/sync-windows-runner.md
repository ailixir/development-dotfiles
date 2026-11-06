# Sync the Windows support into the studio-runner repo

Run this inside the split **studio-runner** repo.

On 2026-11-05 the monorepo gained Windows and Linux developer support (ADR-SC-009). Production stays the Linux container. The runner now picks a posix or win32 host from `process.platform` (`src/run/host/`). `node scripts/dev.mjs` is the launcher on every OS, and `dev.sh` stays as a wrapper around it.

Bring in the `studio-runner/` part of that work: **87 files in 5 commits**, listed at the end. Replay the commits as patches, then fix what doesn't apply. Bring in nothing else.

## Source

- **`MONO`** is your local clone of the put-checks monorepo:
  - Windows (Git Bash): `C:/Users/bb68376/workspace/EAMP/development-dotfiles`
  - Mac: `/Users/brunobuger/orca/workspaces/put-checks/ui-studio`

  If I haven't said which one to use, ask me.
- **The range:**
  - `BASE=d9ab5654b1071a326e2b6c979c828d3c8a4d0547`
  - `HEAD=2d544d2b55eea9fa1613b16cab7d1420c66406dc`

  Both are on branch `brunobuger/ui-studio`, which is pushed. If `git -C "$MONO" cat-file -e "${HEAD}^{commit}"` fails, stop and ask me to fetch.
- **Read-only.** Read the monorepo only through `git -C "$MONO" format-patch|show|rev-parse`. Never edit, check out or commit there.

## Rules

- **Branch.** Start from a clean working tree. Create `sync/windows-2026-11-05` from the tip of the default branch.
- **Commits.** Commit locally only. Don't push or open a PR. `git am` keeps the monorepo's commit messages.
- **Config follows this repo.** In the config files named below, keep this repo's values and add only the change described for that file. If a change would overwrite a setting this repo chose, flag it.
- **Flags.** Give each one 3 options and a recommendation.
- **Verified vs inferred.** Keep what you verified apart from what you inferred.

## Step 1: Check for drift

For each `M` and `D` file in the list, check whether this repo's committed file is the same as the monorepo's version at BASE:

```bash
[ "$(git rev-parse -q --verify "HEAD:$f")" = "$(git -C "$MONO" rev-parse "${BASE}:studio-runner/$f")" ] && echo same
```

Report each file as **same**, **missing** or **different**. The patches can conflict only on the different files.

To tell whether a difference is only CRLF, run `git -C "$MONO" show "${BASE}:studio-runner/$f" | diff -q - <(git show "HEAD:$f" | tr -d '\r')`. Step 2 fixes a CRLF-only difference. For a content difference, read this repo's `git log -- "$f"` to learn why.

## Step 2: Line endings first

```bash
PATCHES=$(mktemp -d)
git -C "$MONO" format-patch --relative=studio-runner "$BASE..$HEAD" -o "$PATCHES" -- studio-runner
ls "$PATCHES"                                  # expect 5 patches
git am -3 "$PATCHES"/0001-*.patch              # adds .gitattributes
git add --renormalize .
git diff --cached --ignore-cr-at-eol | grep -E '^[+-][^+-]'   # must print nothing
```

- **If this repo already has a `.gitattributes`,** the first patch fails. Merge the new rules into the existing file, run `git add .gitattributes`, then `git am --continue`.
- **If the first patch stops on another file,** resolve it as Step 3 describes.
- **If the renormalize step staged files,** commit them on their own as `chore(repo): renormalize line endings to LF`. Then refresh the checkout on the clean tree so files get LF: `git rm -r -q --cached . && git reset -q --hard`.
- **If the `grep` printed lines,** the renormalize changed real content. Stop and report.

## Step 3: Apply the rest

```bash
git am -3 --exclude=dev.sh "$PATCHES"/000[2-9]-*.patch
```

In the monorepo, one commit deletes `dev.sh` and the next brings it back as a wrapper. `--exclude=dev.sh` skips both and keeps this repo's copy; Step 3b then decides what goes in it.

When `git am` stops on a file:
1. Resolve the file using the rules below. The monorepo's version is at `git -C "$MONO" show "${HEAD}:studio-runner/<path>"`.
2. Run `git add` on it, then `git am --continue`.

If `git am` can't build a 3-way ancestor, apply what it can and resolve the rest by hand:
- Run `git am --show-current-patch=diff | git apply --reject`.
- Resolve each `.rej` file by hand, then delete it.
- Run `git add` on the files, then `git am --continue`.

## Step 3b: Keep `dev.sh`

Developers start the stack with `./dev.sh` from Git Bash, so `dev.sh` stays. In the monorepo it is now this wrapper, the same in all three components (`git -C "$MONO" show "${HEAD}:studio-runner/dev.sh"`):

```bash
#!/usr/bin/env bash
# Starts this component locally. A thin wrapper for Git Bash, macOS and Linux: `node scripts/dev.mjs`
# does the work on every OS and takes the same flags (`./dev.sh --help`). In cmd or PowerShell, run
# `node scripts/dev.mjs` directly.
set -euo pipefail
exec node "$(dirname "$0")/scripts/dev.mjs" "$@"
```

What to do depends on what Step 1 found for `dev.sh`:
- **Same:** it is the monorepo's old bash launcher. That one needs `lsof`, `ps` and process groups, which Git Bash doesn't provide for native Windows processes. Replace its content with the wrapper.
- **Missing:** add the wrapper.
- **Different:** this repo has its own launcher. Keep it unchanged, because dev start scripts follow this repo, and FLAG it with these options:
  - (a) keep it, with `scripts/dev.mjs` beside it (recommended);
  - (b) replace it with the wrapper, porting its extra steps into `scripts/dev.mjs`;
  - (c) keep its own steps and make it end by running `scripts/dev.mjs`.

Keep it executable with `git update-index --chmod=+x dev.sh`, then commit it as `fix(dev): keep dev.sh as a wrapper around scripts/dev.mjs`.

**Local start needs all three repos synced.** The runner's `scripts/dev.mjs` writes the shared `$PUT_CHECKS_LOCAL_DIR/backend.env`, which is now a dotenv file (it was a bash file). The backend's and frontend's `scripts/dev.mjs` read it.

## How to resolve each kind of file

**Code** (`src/`, `test/`, `evaluation/`, and the scripts not named below). This repo was synced in override mode, so the monorepo's version at HEAD wins. The exception is a file whose log in this repo shows a deliberate change. Merge that one by hand and say so.
- `evaluation/observed-authoring/manifest.json` is a re-freeze: take the monorepo's version.

**Config.** Keep this repo's values and add only the change below.
- `tsconfig.build.json`: add `"newLine": "lf"` to `compilerOptions`.
- `eslint.config.js`: add `'scripts/dev.mjs'` to the `files` of the local-start override, the one that lists `scripts/local-stack.mjs` and turns `no-restricted-imports` off.
- `vitest.config.ts`:
  - Set `coverage.enabled` to `process.platform !== 'win32'`.
  - Add `src/run/host/win32Process.ts`, `src/run/host/win32Files.ts` and `scripts/dev.mjs` to the coverage excludes.
  - Keep this repo's thresholds.
- `vitest.perception.config.ts`: the change is a comment only.
- `scripts/local-stack.mjs`, `local-stack.check.mjs`, `local-tokens.mjs`, `write-runtime-versions.mjs` and `check-pins.mjs`: take the monorepo's version, unless this repo adapted the file. In that case merge it and flag it.
- `scripts/dev.mjs` is new, and `dev.sh` is handled in Step 3b.
- `package.json` is not in the change set. `scripts/dev.mjs` names the browser folder after `dependencies.playwright`, so check that key holds an exact version (`1.63.0`).

**Outside `studio-runner/`, in the same commits:**
- **The ADR, new.** `docs/architecture/ADR-SC-009-runner-host-windows-local-development.md`. Copy it from `git -C "$MONO" show "${HEAD}:docs/architecture/ADR-SC-009-runner-host-windows-local-development.md"` to where this repo keeps its ADRs, or to `docs/architecture/` if it has none. It links to `ADR-001-studio-runner-scaffolding.md`; fix that link if the file lives somewhere else here.
- **Helm, only if the chart lives in this repo.** Two comments now say `studio-runner/scripts/dev.mjs` instead of `studio-runner/dev.sh`: one in `templates/studio-runner-deployment.yaml` and one in `values.yaml`.

## Step 4: Verify

Use this repo's package manager. Run:
- install
- `type-check`, `lint`, `check:pins`, `build` and `test`
- `node --test scripts/local-stack.check.mjs` (needs `openssl` and the JDK `keytool`)
- `node scripts/dev.mjs --help`, and `./dev.sh --help` from Git Bash, which must print the same

What to expect:
- **Linux and macOS:** `test` enforces this repo's coverage thresholds.
- **Windows:** `test` runs with coverage off. The tests that can't run there show `[POSIX only: <reason>]` in their names. The `test/run/host/*` tests run.
- `git ls-files --eol | grep i/crlf` prints nothing.

## Report

- The drift table from Step 1.
- For each patch: whether it applied cleanly, or which files you resolved and how.
- Flags, each with 3 options and a recommendation.
- The verify commands you ran and what each returned.
- The commits on `sync/windows-2026-11-05`.

## Files (87, relative to the repo root, by monorepo commit)

```
# b8a13dc04 chore(repo): enforce LF line endings and drop the tracked JDK path
A  .gitattributes
M  tsconfig.build.json

# bc5deab28 feat(runner): posix and win32 host seam with portable tests (ADR-SC-009)
M  eslint.config.js
M  src/guided/journal.ts
M  src/main.ts
M  src/probe.ts
M  src/run/appVideoOwnership.ts
M  src/run/browser.ts
M  src/run/child.ts
M  src/run/guidedChild.ts
M  src/run/guidedChildLauncher.ts
A  src/run/host/fence.ts
A  src/run/host/index.ts
A  src/run/host/posix.ts
A  src/run/host/types.ts
A  src/run/host/win32Files.ts
A  src/run/host/win32FilesModel.ts
A  src/run/host/win32Process.ts
A  src/run/host/win32ProcessModel.ts
M  src/run/launcher.ts
M  src/run/objectStore.ts
M  src/run/recordingScratch.ts
M  src/run/scratchLayout.ts
M  src/run/tree.ts
M  src/server/config.ts
M  src/server/scratch.ts
M  test/fixtures-tier/browser-profile-safety.test.ts
M  test/fixtures-tier/guided-recording-kill.test.ts
M  test/fixtures-tier/guided-recording.test.ts
M  test/fixtures-tier/guided-start-deadline.test.ts
M  test/fixtures-tier/guidedCloseBound.test.ts
M  test/fixtures-tier/guidedRecordingFinalize.test.ts
M  test/fixtures-tier/mixed-mode-prefix.test.ts
M  test/fixtures-tier/observed-bootstrap-process-tree.test.ts
M  test/fixtures-tier/observed-bootstrap-refusal.test.ts
M  test/fixtures-tier/observed-bootstrap-video.test.ts
M  test/fixtures-tier/observed-replay.test.ts
M  test/fixtures-tier/observed-secret-control.test.ts
M  test/guided/diagnostics.test.ts
M  test/guided/runtime.test.ts
A  test/helpers/platform.ts
M  test/helpers/profileSafetyFixture.ts
M  test/profileSafetyFixture.test.ts
M  test/run/appVideoOwnership.test.ts
M  test/run/bootstrapProcessTreeObservation.test.ts
M  test/run/browserProfilePreferences.test.ts
M  test/run/confinement.test.ts
M  test/run/forkKillTree.test.ts
M  test/run/guidedBrowserReap.test.ts
M  test/run/guidedChild.test.ts
A  test/run/host/fence.test.ts
A  test/run/host/posix.test.ts
A  test/run/host/win32Files.test.ts
A  test/run/host/win32FilesModel.test.ts
A  test/run/host/win32Process.test.ts
A  test/run/host/win32ProcessModel.test.ts
M  test/run/launcher.test.ts
M  test/run/manifest.test.ts
M  test/run/observedWriterQuiescence.test.ts
M  test/run/processTableUnavailable.test.ts
M  test/run/production-seams.test.ts
M  test/run/recordingScratch.test.ts
M  test/run/trackTreeSampling.test.ts
M  test/run/tree.test.ts
M  test/run/treeAsyncReader.test.ts
M  test/run/treeAsyncReaderFaults.test.ts
M  test/server/drain.test.ts
M  test/server/guidedMode.test.ts
M  vitest.config.ts
M  vitest.perception.config.ts

# 460fb7c3f fix(runner): make the evaluation harness path- and CRLF-safe; re-freeze its manifest
M  evaluation/cli.mjs
M  evaluation/grounding/assemble-v2.mjs
M  evaluation/grounding/freeze.mjs
M  evaluation/grounding/lib/collectorInstrumented.mjs
M  evaluation/grounding/step-code.mjs
M  evaluation/observed-authoring/evaluate.mjs
M  evaluation/observed-authoring/manifest.json
M  test/evaluation/grounding-a-collector.test.ts

# 5a91a39fd feat(dev): cross-platform Node launchers replace the bash dev.sh scripts
M  README.md
M  ci/stages.md
D  dev.sh   (excluded: dev.sh stays, see Step 3b)
M  scripts/check-pins.mjs
A  scripts/dev.mjs
M  scripts/local-stack.check.mjs
M  scripts/local-stack.mjs
M  scripts/local-tokens.mjs
M  scripts/write-runtime-versions.mjs

# 2d544d2b5 fix(dev): keep dev.sh as a Git Bash wrapper around scripts/dev.mjs
M  README.md
A  dev.sh   (excluded: written in Step 3b)
```
