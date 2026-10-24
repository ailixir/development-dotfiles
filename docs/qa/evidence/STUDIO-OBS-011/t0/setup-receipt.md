# STUDIO-OBS-011 T0: setup receipt (@dev)

- **Author:** Dex (@dev). **Date:** 2026-10-18 (ran ~19:50-20:00 local; Gradle timestamps 23:51Z). **Mode:** YOLO.
- **HEAD:** `b39359f78`. **No git commit.** No file under `backend/`, `frontend/`, `studio-runner/`, `tools/`, `helm-chart/` or `docs/specs/` was edited.
- **Legend:** **[V]** I ran or read it today. **[I]** inference.
- `.aiox/` is gitignored (`.gitignore:98`), so `execute-011/` never shows in `git status`. Root records the shas below.

## 1. execute-011 collectors (C5)

Directory: `.aiox/sdc/STUDIO-OBSERVED-ORCH/execute-011/`. Output folder for every collector: `docs/qa/evidence/STUDIO-OBS-011/execution` (as instructed). The T0 draft and `lanes.v2.json` still say `execution-<date>/execution`; root must announce the final path and fix the text, or move the folder, before any lane starts.

| File | sha256 | Origin |
|---|---|---|
| `run-backend-tasked.py` | `799ead7c9c622b7a8b1500d1e89762a689b11e472a8d2bf16101cb9b54f29cd4` | copy of `execute-009/` |
| `run-backend.py` | `1bba89cc35982f8990af4f7112fb740f3fdc95397334a4d3787da08c73009cda` | copy of `execute-009/` |
| `run-runner.py` | `edeaa3592eb85b60097c79a7577d2025027b53ebc3eba470c092e9c9cf2a009f` | copy of `execute-009/` |
| `run-runner-build.py` | `4479b3e4cf8530bb045827d89d597d26f5fc778943f8577a45dd059a0c205b6f` | copy of `execute-009/` |
| `run-frontend.py` | `5fee48be32c351faaee5e58ab62e392c64573f03f01ff019a792ac97abd378fa` | new (section 3) |

**Edits against the 009 originals [V `diff`]: path lines only.**

| File:line | 009 value | 011 value |
|---|---|---|
| `run-backend-tasked.py:92` | `.../STUDIO-OBS-009/execution-20261018/execution` | `docs/qa/evidence/STUDIO-OBS-011/execution` |
| `run-backend-tasked.py:112` | `.../execute-009/run-backend.py` | `.../execute-011/run-backend.py` |
| `run-backend.py:6` | `.../STUDIO-OBS-009/execution-20261018/execution` | `docs/qa/evidence/STUDIO-OBS-011/execution` |
| `run-runner.py:6` | same | same |
| `run-runner-build.py:18` | same | same |

Quinn named `run-runner.py:5`; the line is `:6` in the 009 copy. The `diff` output for the four copies shows exactly these five hunks and nothing else.

**Grep for other hard-coded 009 or 008 paths [V `grep -n "STUDIO-OBS-0\|execute-0\|009"`]:** none left. Three hits remain and are intentional:

- `run-runner.py:13` names `docs/qa/evidence/STUDIO-OBS-007` and `STUDIO-OBS-013/r13`. These are the fixtures-tier artifact **protection scopes** (backed up and restored around a fixtures run), not output paths. Unchanged.
- `run-runner.py:9` and `run-runner-build.py:25` carry comments saying "009 R2". Comment text only.

**Gradle lock.** Not copied. `with-gradle-lock.py` and `gradle.lock` stay in `execute-008/` (the 009 README says the same). `run-backend-tasked.py` has no lock code of its own; callers go through `execute-008/with-gradle-lock.py`.

**Smoke (no tests run) [V]:**

- `ast.parse` on all five files: OK.
- `run-backend-tasked.py --help`: prints the argparse usage, then the script's own "Separate collector options from Gradle arguments with --" error (the `--` check precedes `parse_args`; same in 009, so `--help` cannot exit 0). The parser builds.
- `run-frontend.py` with no args, with a bad label, and with a label and nothing else: each prints its message and exits 1 before touching anything.
- Not run: `run-backend.py`, `run-runner.py`, `run-runner-build.py` (positional label, they capture the manifest and launch the command immediately; they have no dry mode).

**Directory prepared:** I created `docs/qa/evidence/STUDIO-OBS-011/execution/` (and `qa/`). `run-backend.py` and `run-runner.py` open their log there without `mkdir`, and `run-backend-tasked.py` calls `archive.mkdir()` without `parents`, so the folder must exist. I also created the empty `docs/qa/evidence/STUDIO-OBS-011/t0/` for this file.

## 2. T0-AW: Awaitility on the backend test classpath

**Result: resolves offline. Branch A.**

Command, exactly as given, under the lock [V]:

```
python3 .aiox/sdc/STUDIO-OBSERVED-ORCH/execute-008/with-gradle-lock.py zsh -c "cd backend && ./gradlew dependencies --configuration testRuntimeClasspath --offline --no-daemon"
```

- Lock acquired after 0.0 s. `BUILD SUCCESSFUL in 5s`, exit 0, 0 `FAILED` lines.
- Line 599 of the output: `|    +--- org.awaitility:awaitility:4.2.2` followed by `|    |    \--- org.hamcrest:hamcrest:2.1 -> 2.2`.
- It sits in the dependency block of `spring-boot-starter-test` (3.3.5): its siblings are `spring-boot-test-autoconfigure`, `json-path`, `assertj-core`. It is transitive, not a direct declaration.
- The T0 record row says `testCompileClasspath`, so I also ran `./gradlew dependencies --configuration testCompileClasspath --offline --no-daemon` under the lock [V]. `BUILD SUCCESSFUL in 4s`, exit 0, and line 534 shows `org.awaitility:awaitility:4.2.2` there too.
- `git status --short backend` after both runs shows only the pre-existing `?? backend/.claude/`. No build file changed.

Consequence for the record: no `build.gradle.kts` edit, no in-repo `Await.java`; lanes use `org.awaitility.Awaitility` directly (`w-brief.v2.md` branch A). Dex's premise in `dev-cosign.md` RC-5 holds. The scratch logs are `scratchpad/aw-deps.log` (sha `e055563e6a1e64c19e52ee77ebf6275afb4844da7fff016b14839dd2780296e1`) and `scratchpad/aw-compile.log` (sha `3e316c3fceb6e34681ee9bdd803cc46722d1965345d6b7051857e6a718f0806f`), under `/private/tmp/claude-501/-Users-brunobuger-orca-workspaces-put-checks-ui-studio/49497aae-dbea-402b-a9a6-2d80f4cd2e4e/scratchpad/`; the lines above are the load-bearing excerpt.

## 3. `run-frontend.py` (Quinn's frontend collector item)

Modelled on `run-runner.py`, in readable style (the runner copies are one-liners). **Written, parsed, not run.**

- **Invocation (repo root):** `python3 .aiox/sdc/STUDIO-OBSERVED-ORCH/execute-011/run-frontend.py [--source-exclusions FILE.json] <label> [--] <command> [args...]`. A leading `--` after the label is accepted because `lanes.v2.json` B7 writes `<RFE> obs011-t0-frontend01 -- pnpm exec vitest ...`.
- **Runs:** the command with `cwd=frontend/`, host Node and pnpm, stdout+stderr to `<label>.log`.
- **Captures:** `capture-manifest.py` before and after (`<label>-before.json`, `<label>-after.json`); `<label>-results.json` with command, `node --version`, `pnpm --version`, start time, elapsed, exit, `sourceStable`, both source digests, `distStable`, both dist digests, log sha256, and the `testInput*` fields.
- **Vitest report:** if `vitest` appears in the first five argv tokens and no `--reporter` flag is given, it appends `--reporter=default --reporter=json --outputFile=<label>-vitest.json`. If the caller passes `--reporter=json --outputFile=<path>` (the B7 form), the collector parses that path instead. A vitest command with no report file records `vitestReportMissing`. `pnpm run test` has no `vitest` token and is not detected, as in 009; use `pnpm exec vitest`.
- **Exit:** the command's own non-zero exit; else 0 only if `sourceStable` and `distStable`; else 2. With `--source-exclusions` the stability test covers the files outside the list (lane runs, non-evidentiary), same as `run-runner.py`.
- **Differences from `run-runner.py`:**
  - It refuses an existing label (as the tasked and build collectors do).
  - It validates the label characters.
  - It records Node and pnpm versions.
  - It records the sha256 of `docs/qa/accessibility/axe-results.json` before and after and sets `axeResultsRewritten`. That file is outside the manifest roots and a full vitest run rewrites it [V, my memory note `tooling_fe_suite_side_effects`; not re-checked today]. It **does not restore** the file, so root or @qa decides, after the run, whether to `git checkout --` it. Nothing in the manifest digest sees it.
  - It has no fixtures-artifact backup/restore (no frontend equivalent).
- **Not done (outside "minimal"):** path redaction of the vitest JSON. It carries absolute paths; if the report is committed as evidence it needs the redaction pass noted in my memory (`tooling_fe_full_suite_under_load`).
- **Limit of what it proves:** the manifest roots are `backend frontend studio-runner tools docs/specs .github` and root package files. It does not see `helm-chart/` or the quoted docs; S_011 still needs those shas separately (Quinn C-item 3, T0 record section 2).

## 4. Approved skips for 011

- Copied byte-for-byte [V `cmp`: identical]:
  - from `docs/qa/evidence/STUDIO-OBS-009/execution-20261018/qa/approved-skips.json`
  - to `docs/qa/evidence/STUDIO-OBS-011/execution/qa/approved-skips.json`
- **sha256 (both files): `c6f16987430a332b80a065308a2c9b0ef9adccd478b9be64a02e1cb459cd09dc`.**
- Content: 9 entries (`task`, `class`, `name`), all `test` task: `ExecutionVideoExternallyGatedCriteriaTest` (AC-18b, AC-19b), `GuidedProviderEvaluationTest` (approved provider evaluation), `ExecutionReadinessTest` (target policy selection), `ExternallyGatedCriteriaTest` (AC-13b, AC-7b, AC-5b), `VaultPolicyIT` (AC-4), `GuidedSchemaProbeIT` (gateway probe). G9 C8 recorded `skipped: 9` against this file [V `obs009-g9-check01-results.json`].
- **This is a copy, not the file Quinn will derive.** `qa-cosign.md` section 7 says @qa derives the 011 file from the final G9 skip multiset; the copy is the instructed placeholder so the baseline command has a path. If @qa's file differs, it replaces this one and the sha changes. Whichever file the baseline uses is the one the collector archives as `approved-historical-skips.json` with its sha.

## 5. Baseline command line for root (B1)

Repo root. The `--allowed-skips-file` path is the 011 copy; every other part is the G9 C8 form [V `obs009-g9-check01-results.json` command: `caffeinate -i ./gradlew --continue check --rerun-tasks --no-daemon`; test tasks and required exec tasks as below].

```
export PATH=$HOME/.local/share/fnm/node-versions/v24.20.0/installation/bin:$PATH
python3 .aiox/sdc/STUDIO-OBSERVED-ORCH/execute-008/with-gradle-lock.py python3 .aiox/sdc/STUDIO-OBSERVED-ORCH/execute-011/run-backend-tasked.py obs011-t0-baseline-check01 --test-tasks test,guidedIncrementalTest,crossReplicaTest --require-exec-tasks test,guidedIncrementalTest,crossReplicaTest --allowed-skips-file docs/qa/evidence/STUDIO-OBS-011/execution/qa/approved-skips.json -- --continue check --rerun-tasks --no-daemon
```

(The node 24 directory exists [V `ls -d`].) Output lands in `docs/qa/evidence/STUDIO-OBS-011/execution/obs011-t0-baseline-check01-*`. The label is new: no 011 result exists.

Frontend B7, same style (not run):

```
python3 .aiox/sdc/STUDIO-OBSERVED-ORCH/execute-011/run-frontend.py obs011-t0-frontend01 -- pnpm exec vitest run --minWorkers=1 --maxWorkers=3
```

## 6. Open items for root

1. Output folder name: the instruction gave `STUDIO-OBS-011/execution/`; `t0-record-draft.md` (section 1 step 5a), `lanes.v2.json` (`commandConventions.rules`, many write sets) and `w-brief.v2.md` say `execution-<date>/execution`. Pick one.
2. Machine state at my runs: `uptime` load 3.19/3.78/3.96, no Gradle or collector process running. The two `dependencies` runs were short (5 s and 4 s) and did not touch the source tree, but they did hold the Gradle lock briefly.
3. B1 cannot reach its sourceStable `true` result if anything under the capture roots changes during the ~1h45 run.
