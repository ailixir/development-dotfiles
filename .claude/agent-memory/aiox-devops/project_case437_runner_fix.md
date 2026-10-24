---
name: case437-runner-fix
description: Round 065 case437 prep (runner-only video finalize patch + dist reinstall + 436->437 retarget); non-obvious facts for the run and the next retarget
metadata:
  type: project
---

Round 065 prepared (did not run) case437: `.aiox/sdc/STUDIO-OBSERVED-ORCH/recovery-20261020/real-stack71/parallel-execution-20261022/round-065/devops-case437/` (start with RUNBOOK437.md, dry-run evidence in dryrun-scratch/). Case436 consumed (runId d15e7d5f..., A 10bb9205...): product ok, harness failed at spec:330 (unfinalized incremental WebM). Ports 5197, 18891-18896.

**Why:** runner-only patch (7 src/test files, sha e3bf90fa...) changes 5 pinned dist files; bundle hashes do NOT change, so the code434 catalog stays.

**How to apply (easy to get wrong):**
- `runtime-versions.json` changes only via `observedBrowserLauncherSha256` = sha256(dist/run/browser.js); install only from a full build. code434-catalog/derivation.json pins the old runtime-versions sha, so `derive-catalog437.py repin` writes a receipt instead of touching the immutable catalog dir.
- The sealed binder hard-codes the dist allow-list literal (`set(RUNNER_FIX)<={...}`): growing it 8 -> 12 is the named hunk RUNNER437_ALLOWLIST (only hunk; config 45 carried with extra []).
- Allow-list = union of code434 delta (7) + standing observationCollector.js + runner437 delta; `guided/runtime.js`, `run/browser.js`, `run/guidedBrowser.*` were NOT in the old list.
- Scratch dry run: `dryrun-scratch/dryrun-all.sh` builds a scratch repo (preflight needs PINROOT remap for the absolute paths in the pin maps; CAT_DIR must be the real dir).
- Consumed cases: 430-436.
