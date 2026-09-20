# Ruling — folding `brunobuger/ui-studio` into the Epic 10 line

**Author:** @architect (Aria) · **Date:** 2026-09-18 · **Status:** DECIDED, partially executed

Every claim below cites the command that produced it. Claims I could not verify are
listed in §7 and are labelled as such.

---

## 1. Decision

| # | Decision | Executed? |
|---|---|---|
| 1 | Preserve the 162 unclaimed working-tree paths as a git ref, built with plumbing so the live tree is never touched | **YES** — `wip/ui-studio-rescue` @ `23728f3a7` |
| 2 | Fast-forward `brunobuger/ui-studio` → `epic/EPIC-10-w7` | **NO** — sound, but not mine to fire. See §4 |
| 3 | Merge any of the 13 overwritten files forward | **NO** — refused, with cause. See §3 |
| 4 | Relocate the duplicate Flyway V12 before the fast-forward | **MANDATORY** — see §5 |

The fast-forward is **sound and I endorse it**. I did not execute it, for one operational
reason only (§4). Everything blocking it is now cleared.

---

## 2. What `brunobuger/ui-studio` actually is

```
git log -1 --format='%H %ci' brunobuger/ui-studio
  910de104d95f6ed52cfebd9a66dede912f990699  2026-09-10 22:52:56 -0400
  "chore(aiox): migrate framework tree from .aios-core to .aiox-core"

git merge-base --is-ancestor brunobuger/ui-studio epic/EPIC-10-w7   → exit 0 (YES)
git rev-list --count brunobuger/ui-studio..epic/EPIC-10-w7          → 305
git rev-list --count epic/EPIC-10-w7..brunobuger/ui-studio          → 0
git diff --name-only brunobuger/ui-studio epic/EPIC-10-w7 | wc -l   → 796
```

It is the **pre-epic integration base**, four commits past `main` (`9fbd3970c`, "stable
version"). `git branch -a --contains 910de104d` lists it inside **30+ branches** —
every active Epic 10 story branch, `epic/EPIC-10`, `epic/EPIC-10-w7`, every `arch/*`,
`chore/*`, `fix/*`, `po/*`.

`git branch -vv` shows **no upstream** for it. The only remote is
`git@github.com:ailixir/development-dotfiles.git` — not this project. So the branch is
local-only and nothing external tracks it.

**Ruling:** it holds **zero** commits the epic line lacks. Fast-forwarding it moves a
label. No commit, anywhere, is lost or orphaned by the operation. **Folding into it is
sound.** It is not a stale competing line; it is the trunk everything grew from.

---

## 3. The uncommitted tree, and the ruling on the 13 files

### 3.1 It is not independent work — it is an ancestor of the epic

Of the 20 untracked files that collide with incoming paths, **8 are byte-identical to
`epic/EPIC-10-w7`** (`git hash-object <wt>` vs `git rev-parse epic/EPIC-10-w7:<path>`):

```
CompileRequest.java  CompileResponse.java  DisabledLlmGatewayClient.java
GatewayAuditLogger.java  GatewayErrorCode.java  GatewayOutcome.java
GatewayPayloadSerializer.java  GatewayProvenance.java      → IDENTICAL
```

Identical blobs are not a coincidence. This tree and the epic line share a source. The
other 12 differ because the epic **hardened them further** across stories 10.2–10.35.
The working tree is the **earlier snapshot**; the epic is its descendant.

### 3.2 Ruling on the 13 overwritten files: **ARCHIVE. Do not merge forward.**

Not a filing decision — merging any of them forward is a **regression**. Evidence:

**`StudioService.java` — authorization.** The brief said story 10.30 changed
`requireCompile` → `requireWrite`. That mechanism is **wrong**: `git grep -n -E
"requireCompile|requireWrite" epic/EPIC-10-w7 -- '*.java'` returns **no `requireCompile`
anywhere**. What is real is worse for the working tree:

| | working tree | `epic/EPIC-10-w7` |
|---|---|---|
| `requireWrite` in `studio/StudioService.java` | **0 call sites** | **7** (L176, 290, 397, 441, 517; helper L133) |
| `softDeleteTest` | `(UUID)` only, L92 | `(UUID)` L494 **and** `(UUID, Authentication)` L515 |
| controller call | `softDeleteTest(id)` L70 | `softDeleteTest(id, auth)` L140 |

The working tree's studio context has **no authorization at all**. The brief's conclusion
stands even though its mechanism didn't: **merging this file forward reopens the hole.**

The actual uncommitted change to `StudioService` (`git diff HEAD --`) is unrelated to
authorization — it wires an `ObjectProvider<LocalStudioExecutionRunner>` and makes
`listExecutions` fall back to `findAll` when `testId` is null. The `StudioController`
change is one hunk: deleting the `testId` required-parameter guard.

**`UITestExecutionDto.java` — targets a retired type.** `git diff --name-status HEAD
epic/EPIC-10-w7 --` on that path reports `D`. The epic replaced it with
`ExecutionSnapshotDto` / `ExecutionStatus` / `LegacyStudioAdapter`.

**`application-local.yml` — credential regression.** Working tree sets
`STUDIO_GATEWAY_CREDENTIALS_MODE:api-key`. The epic sets `none`, with the comment
*"Local runs never hold R2D2 credentials; keep the gateway off unless a stub is wired
in."* The working-tree file also **lacks** the epic's ED-02 `security.bypass` block
(story 10.18b AC-19a) and the `secrets.vault.provider: fake` pin.

**`application.yml` / `build.gradle.kts` / frontend files.** The epic's `studio:` block
is a strict superset — `execution.*` (kill switch, SLAs, quotas, dispatcher, callback,
SSE) plus the same `compile.gateway.*` the working tree has. Nothing additive.

**Genuinely additive, and only in the `local` profile:** `checks.cors.allowed-origins`
gains `http://127.0.0.1:5173`, `checks.sources.UI_TEST: true`, `studio.pool.size: 1`.
The epic already has `allowed-origins` at `application.yml:110` (env-driven,
`CHECKS_CORS_ALLOWED_ORIGINS`) and `UI_TEST: false` at L53. **Ruling:** carry-forward
*note*, not a merge. A developer who wants them sets the env var. Not worth a
regression-shaped diff.

### 3.3 The 17 unique files (absent from the epic tip)

All superseded in substance. None promoted:

| Working tree | Epic replacement |
|---|---|
| `StudioGeminiService` + `StudioAiController` | `compile/gateway/*` + `CredentialPatternScreen`, `GatewayErrorScrubber`, `GatewayAuditLogger`, `PromptAssembler`, `CompilePipeline` |
| `StudioProofController` | `ExecutionVideoController` (takes `Authentication`) |
| `LocalStudioExecutionRunner` | `studio-runner` Deployment (`helm-chart/.../studio-runner-deployment.yaml`, `docs/architecture/ADR-001-studio-runner-scaffolding.md`) |
| `frontend/src/components/platform/PlatformSidebar.tsx` | `@put/core-components` (CLAUDE.md) — local copy shadows the package |

For the record, so it isn't over-read later: `StudioProofController` is **not** a
deployed vulnerability. It is `@Profile("local")` and guards traversal with
`file.startsWith(proofsDir)` after `.normalize()`. It is simply superseded.

---

## 4. Why I preserved but did not fast-forward

The ref-level operation is safe (§2). I stopped for one reason:

**The target working tree is occupied by a live sibling session.** A fast-forward there
rewrites **796 files** and both `package.json` and `package-lock.json` underneath a
running program. That is not a git-safety question — git would do it correctly — it is an
operational one, and its effect on that session is **not reversible**.

Preservation, by contrast, was **urgent and reversible**, so I did it. Urgent because the
only other copy of this work lived in a `/tmp` scratchpad, which macOS purges and which is
scoped to a single session. That is not insurance. A ref is.

Waiting costs nothing: `wip/ui-studio-rescue` is permanent, and the fast-forward is now a
ten-second operation (§6) that anyone can run once the tree is free.

---

## 5. Blocker the fast-forward does NOT solve by itself

Two **different** migrations claim Flyway version 12:

```
working tree (untracked): V12__ui_test_execution_lifecycle_statuses.sql
                          → ALTER ui_test_executions status CHECK constraint
epic/EPIC-10-w7 (tracked): V12__ui_test_revisions_and_compile_state.sql
                          → CREATE TABLE ui_test_revisions (story 10.4)
```

Because the **filenames differ**, the fast-forward does not overwrite or even notice the
working-tree file — it is not in the collision set. It stays on disk, and Flyway then
refuses to start on a duplicate version.

**A fast-forward that "succeeds" here produces a backend that cannot boot.** The file must
be removed from the working tree as part of the operation. It is preserved at
`wip/ui-studio-rescue:backend/src/main/resources/db/migration/V12__ui_test_execution_lifecycle_statuses.sql`.

---

## 6. Recovery and completion instructions

Written for someone who has never seen this session. Run from
`/Users/brunobuger/orca/workspaces/put-checks/ui-studio`.

### 6a. Recover any preserved file

```bash
git show wip/ui-studio-rescue:<path>              # inspect
git checkout wip/ui-studio-rescue -- <path>       # restore into the tree
git diff 910de104d wip/ui-studio-rescue           # the complete rescued delta
git diff 910de104d wip/ui-studio-rescue --stat    # 139 added, 23 modified
```

The ref is `wip/ui-studio-rescue` = `23728f3a757725f9b7d0ea281bc2b48661c051a0`,
parented on `910de104d` so the snapshot sits where the work was actually done.
It is independent of the working tree and survives the fast-forward.

### 6b. Complete the fast-forward (only when no session is using the tree)

```bash
cd /Users/brunobuger/orca/workspaces/put-checks/ui-studio

# 1. Confirm everything on disk is already in the rescue ref.
{ git diff --name-only; git ls-files --others --exclude-standard; } | while read -r f; do
  a=$(git hash-object "$f" </dev/null)
  b=$(git rev-parse --verify --quiet "wip/ui-studio-rescue:$f" </dev/null)
  [ "$a" = "$b" ] || echo "NOT PRESERVED: $f"
done
#    EXPECTED OUTPUT, exactly one line and nothing else:
#      NOT PRESERVED: .claude/agent-memory/aiox-architect/project_ui_studio_rescue_ref.md
#    That file is agent memory written by this ruling, after the snapshot. It is
#    regenerable and safe to lose.
#
#    ANY OTHER line means new unclaimed work appeared after this ruling. STOP and
#    capture it with the §6d plumbing recipe before continuing.
#
#    Baseline at time of ruling: 23 modified, 139 untracked (140 including the
#    memory file above).

# 2. Clear the tree. Safe ONLY because step 1 printed nothing unexpected.
#    Do NOT use `git stash` — the stash stack is shared with other live sessions.
git checkout -- .
git clean -fd

# 3. Fast-forward
git merge --ff-only epic/EPIC-10-w7
git rev-parse HEAD     # expect 57a6e9095...

# 4. Re-sync the frontend — package.json and package-lock.json both changed
cd frontend && npm ci
```

Step 2's `git clean -fd` also removes the duplicate V12 of §5, which is what makes the
backend bootable afterwards. It removes `.aiox/` and `.claude/agent-memory/` too. Those
are inside the rescue ref — with the single exception named in step 1, which is agent
memory and regenerable.

`npm ci` rather than pnpm because this repo's frontend is npm-locked
(`frontend/package-lock.json`, and the project CLAUDE.md prescribes `npm`).

### 6c. Secondary copy (ephemeral — do not rely on it)

`/private/tmp/claude-501/-Users-brunobuger-orca-workspaces-put-checks-ui-studio/fd79b627-2435-477c-99ac-a4247c325da9/scratchpad/ui-studio-rescue/`
holds `tracked-modifications.patch` and `untracked-files.tgz`. Both verified (§8).
It lives in `/tmp`. Treat `wip/ui-studio-rescue` as the real record.

### 6d. Capturing a dirty tree without disturbing a live session

The plumbing used here, reusable. It never writes to the working tree or the real index:

```bash
IDX=$(mktemp); rm -f "$IDX"
GIT_INDEX_FILE="$IDX" git read-tree HEAD
{ git diff --name-only; git ls-files --others --exclude-standard; } \
  | GIT_INDEX_FILE="$IDX" git update-index --add --stdin      # --add ONLY
TREE=$(GIT_INDEX_FILE="$IDX" git write-tree)
git branch <name> "$(git commit-tree "$TREE" -p HEAD -m 'rescue')"
```

**Do not add `--force-remove`.** Combined with `--add` it wins and *removes* the listed
paths instead of staging them. I made exactly that mistake here; the hash verification
caught it (§8).

---

## 7. What I could not determine

- **Who authored the uncommitted work.** File mtimes cluster 2026-09-17 20:55–22:49 in a
  single coherent session, but mtimes are not provenance. Nobody has claimed it. The
  rescue commit records it as unattributed rather than assigning it to anyone.
- **Whether anything still builds or runs from `brunobuger/ui-studio`.** No CI config
  references it that I found, and it has no upstream — but I did not audit every workflow
  file. Inference, not verification.
- **Whether the working tree's `V12` constraint change is still needed** on the epic's
  schema. The epic has V12–V17 and `V17__studio_execution_error_code_check.sql` plausibly
  covers the same ground; I did not read it in full. Flagged, not ruled.
- **Where the `studio-runner` source lives.** `git ls-tree -r epic/EPIC-10-w7 | grep
  studio-runner` returns only docs and helm templates. The `edge.test.ts` path referenced
  in `application-local.yml` implies a source tree I did not locate. Does not affect this
  ruling.
- **I did not build or test anything.** No Gradle (MED-2: `./gradlew check` hangs), no
  npm. Every claim here is from reading files and git plumbing. The fast-forward's
  runtime correctness is asserted by the epic line's own gates, not by me.

---

## 8. Verification performed

| Check | Command | Result |
|---|---|---|
| Ancestry | `git merge-base --is-ancestor brunobuger/ui-studio epic/EPIC-10-w7` | exit 0 |
| Nothing unique on ui-studio | `git rev-list --count epic/EPIC-10-w7..brunobuger/ui-studio` | 0 |
| Collision sets | `comm -12` of dirty paths vs `git diff --name-only HEAD epic/EPIC-10-w7` | 13 modified, 20 untracked — brief confirmed |
| Tarball faithful | `git hash-object` per member vs working tree | **139/139, 0 mismatches** |
| Patch faithful | materialise HEAD blobs → `git apply` → hash-compare | **23/23, 0 mismatches**; `--check` OK |
| Rescue ref faithful | `git hash-object <wt>` vs `git rev-parse wip/ui-studio-rescue:<path>` | **162/162, 0 mismatches** |
| Nothing dropped from HEAD | `git diff --name-status 910de104d wip/ui-studio-rescue` | 139 `A`, 23 `M`, **0 `D`** |
| Live tree untouched | index mtime before/after; `git status --short`; `git rev-parse HEAD` | `2026-09-15 21:47:29` unchanged; still dirty; still `910de104d` |

A first attempt produced a defective tree (`3984ee13c`, 3099 files — the 23 tracked paths
*removed*, caused by `--force-remove`). The hash verification caught it. That commit is
unreferenced; the branch was force-updated to the corrected `23728f3a7` (3261 files =
3122 + 139). Recorded rather than quietly fixed.

---

## 9. Commits

| SHA | Branch | What |
|---|---|---|
| `23728f3a757725f9b7d0ea281bc2b48661c051a0` | `wip/ui-studio-rescue` | The 162 preserved paths, parented on `910de104d` |
| `3984ee13c9e33248a805bbb348254b81422c1858` | *(tree, unreferenced)* | Defective first attempt — see §8 |
