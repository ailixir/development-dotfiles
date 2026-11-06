# Sync the Windows support into the frontend repo

Run this inside the split **frontend** repo.

On 2026-11-05 the monorepo gained Windows and Linux developer support (ADR-SC-009). For the frontend that meant two changes:
- the `build` script now works in cmd and PowerShell;
- `node scripts/dev.mjs` (also `pnpm run dev:local`) is the launcher on every OS, and `dev.sh` stays as a wrapper around it.

Bring in the `frontend/` part of that work: **8 files in 3 commits**, listed at the end. Replay the commits as patches, then fix what doesn't apply. Bring in nothing else.

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
[ "$(git rev-parse -q --verify "HEAD:$f")" = "$(git -C "$MONO" rev-parse "${BASE}:frontend/$f")" ] && echo same
```

Report each file as **same**, **missing** or **different**. The patches can conflict only on the different files.

To tell whether a difference is only CRLF, run `git -C "$MONO" show "${BASE}:frontend/$f" | diff -q - <(git show "HEAD:$f" | tr -d '\r')`. Step 2 fixes a CRLF-only difference. For a content difference, read this repo's `git log -- "$f"` to learn why.

## Step 2: Line endings first

```bash
PATCHES=$(mktemp -d)
git -C "$MONO" format-patch --relative=frontend "$BASE..$HEAD" -o "$PATCHES" -- frontend
ls "$PATCHES"                                  # expect 3 patches
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
1. Resolve the file using the rules below. The monorepo's version is at `git -C "$MONO" show "${HEAD}:frontend/<path>"`.
2. Run `git add` on it, then `git am --continue`.

If `git am` can't build a 3-way ancestor, apply what it can and resolve the rest by hand:
- Run `git am --show-current-patch=diff | git apply --reject`.
- Resolve each `.rej` file by hand, then delete it.
- Run `git add` on the files, then `git am --continue`.

## Step 3b: Keep `dev.sh`

Developers start the stack with `./dev.sh` from Git Bash, so `dev.sh` stays. In the monorepo it is now this wrapper, the same in all three components (`git -C "$MONO" show "${HEAD}:frontend/dev.sh"`):

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

**Config.** Keep this repo's values and add only the change below.
- `package.json`:
  - **`build`:** `NODE_ENV=production webpack --config webpack.config.js` becomes `webpack --node-env production --config webpack.config.js`. Keep this repo's own flags and config path. If this repo's `build` already works in cmd and PowerShell (for example through `cross-env`), keep it and say so. If it is some other shape, flag it.
  - **New script:** add `"dev:local": "node scripts/dev.mjs"`.
  - **Dependencies:** none change, so the lockfile doesn't change.
- `vite.config.ts`: the change is a comment only.
- `scripts/dev.mjs` is new, and `dev.sh` is handled in Step 3b.

**Studio only.** `e2e/realsite-gate/stack/gate-stack.sh` and its README now read the dotenv `backend.env`. They follow the monorepo. The real-site gate stays Linux and macOS only, because it needs Docker.

**Outside `frontend/`, in the same commits.** In the root `README.md` and `docs/runbooks/studio-integrations.md`, the start commands are now `node scripts/dev.mjs`, with `./dev.sh` named for Git Bash, macOS and Linux. Apply the frontend part only where this repo has the equivalent doc.

## Step 4: Verify

Use pnpm.
1. `pnpm install --frozen-lockfile`
2. `pnpm run type-check`
3. `pnpm run lint`
4. `pnpm run build`. It must still produce the production bundle, with content-hashed names and source maps. On Windows, run it in both PowerShell and cmd.
5. `node scripts/dev.mjs --help`, and `./dev.sh --help` from Git Bash, which must print the same

Line endings: `git ls-files --eol | grep i/crlf` must print nothing.

## Report

- The drift table from Step 1.
- For each patch: whether it applied cleanly, or which files you resolved and how.
- Flags, each with 3 options and a recommendation.
- The verify commands you ran and what each returned.
- The commits on `sync/windows-2026-11-05`.

## Files (8, relative to the repo root, by monorepo commit)

```
# b8a13dc04 chore(repo): enforce LF line endings and drop the tracked JDK path
A  .gitattributes

# 5a91a39fd feat(dev): cross-platform Node launchers replace the bash dev.sh scripts
M  README.md
D  dev.sh   (excluded: dev.sh stays, see Step 3b)
M  e2e/realsite-gate/README.md
M  e2e/realsite-gate/stack/gate-stack.sh
M  package.json
A  scripts/dev.mjs
M  vite.config.ts

# 2d544d2b5 fix(dev): keep dev.sh as a Git Bash wrapper around scripts/dev.mjs
M  README.md
A  dev.sh   (excluded: written in Step 3b)
```
