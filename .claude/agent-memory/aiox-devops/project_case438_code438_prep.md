---
name: case438-code438-prep
description: Round 068 case438 prep (code438 = Candidate B backend refreeze + frontend UX allow-list + call-seconds 60, retarget 437->438); non-obvious facts for the live run and the next retarget
metadata:
  type: project
---

Round 068 prepared (did not run) case438: `.aiox/sdc/STUDIO-OBSERVED-ORCH/recovery-20261020/real-stack71/parallel-execution-20261022/round-068/devops-code438/` (start with RUNBOOK438.md, evidence in dryrun-scratch/dryrun-evidence.json). Case437 consumed (runId 23208c4c..., A 46d4a987...), user decided "Fix UX + Candidate B". Ports 5198, 18991-18996.

**Why:** three changes only: code438 (7 backend main sources + application.yml, 3 QA patches), 17 pinned frontend/src files re-pinned (hunk FRONTEND438_ALLOWLIST), call-seconds 45 -> 60 (CONFIG438_CALL_SECONDS_60, no send-timeout entry). Runner dist, code434 catalog, B, harness unchanged.

**How to apply (facts easy to get wrong):**
- Frontend is served from SOURCE by vite (launch.py frontend role), no build; baseline for the drift check is the sealed A437 pins (private, hash-only), not A433. 18 listed frontend/src files, 17 pinned (the untracked pageIncrementalRecording.test.tsx is not); the binder gets a second allow-list block (`FRONTEND_FIX`, override-only) and fresh438-context gains `frontendFixOverrides`.
- code438 is built from the code434 pin template (tails classes434/resources434 -> 438), delta is vs code434 (`delta-vs-code434.json`); expected path-independent trees: classes `536efebb...`, resources `61ec654c...`; a `--control` build with Candidate B reversed in the copy reproduces code434 byte for byte. Loader count 41 comes from the receipt; classpath/seal shas are path-bound (scratch differs from real).
- Context key `code434` is renamed `code438` (it also carries the unchanged code434-catalog sha values); the catalog name `code434-catalog` and `catalog-loader-proof435.py` are NOT renamed. Pre-B0 two collector tests (Java enum pin of TRANSPORT_STALL) fail by design.
- QA pair tools: selector link_retarget is a closed hunk table (EXPECT) generated from the manifest and re-checked in the generator; 38 checks (new `frontendUxFixPinnedExact`); `compare-pair-tools438.py` proves the real tools differ from the QA-reviewed scratch ones only in 64-hex literals (no second review).
- Scratch dry-run needs: preflight CAT_DIR real path (lstat), proof tool copied byte-identical, qa-pair draft tool chain check symlink-tolerant; synthetic-pipeline-fixture438.py lets make-interface438 + context-from-interface run without private data.
- Consumed cases: 430-437. At write time the Candidate B QA gate (round-067/qa-candidate-b) did not exist yet; patch shas are pinned in b0-apply-candidate-b.py.
