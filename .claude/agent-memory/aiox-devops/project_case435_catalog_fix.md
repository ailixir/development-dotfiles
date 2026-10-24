---
name: case435-catalog-fix
description: Why case434 was consumed (parent-409 catalog pins pre-rebuild bundle hashes) and the round-059 case435 tooling (code434-catalog, loader proof gate)
metadata:
  type: project
---

Case434 died at pipeline step 8 (`catalog`, PROFILE_MISMATCH after 0.2 s): the binder copied `visual409-setup/catalog.json` whose `build.schemaBundleHash/referenceBundleHash` pin the pre-rebuild runner bundle; the rebuilt installed dist has new values. Round 059 (`.aiox/sdc/STUDIO-OBSERVED-ORCH/recovery-20261020/real-stack71/parallel-execution-20261022/round-059/devops-case435/`, start with RUNBOOK435.md) prepared case435: new `P/code434-catalog/{catalog,derivation}.json` (sha d7a63dce... / e798ab4e...), binder reads it (CATALOG435_BINDER_* hunks), case434 added to CONSUMED (runId c71bb174..., A None), ports 5195 + 18691-18696.

**Why:** a stale catalog is not caught by any hash pin; only the real runner loader (`loadObservedRunnerSupport` in installed `dist/server/application.js`) notices. `studio-runner/scripts/print-observed-catalog.mjs <imageDigest>` is the official derivation (profile/profileHash/chromium/digest unchanged, bundle hashes from dist).

**How to apply:** after ANY runner dist rebuild, re-derive the catalog and run `catalog-loader-proof435.py` (non-consuming, synthetic env, positive + parent-409 negative control) BEFORE a once-only pipeline; `preflight435.py` P14-P17 and `run-config435.py binder` do it. Gotchas: the 434 -> 435 rename must skip `code434`, `portable434`, `classes434`, `resources434` (code owner is unchanged); the strict reader needs private-path dirs 0700 and files 0600; `preflight435` P5 fails once `visual435*` exists, so it runs before retarget write.
