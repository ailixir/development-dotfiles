---
name: code438-g1-r069
description: Round 069 QA gate G1 code438/case438 ACCEPT 2026-10-23; approval sha, R1b control-build failure diagnosis (git apply inside repo subdir), tool shas
metadata:
  type: project
---

ACCEPT, no required fixes. Output `.aiox/sdc/STUDIO-OBSERVED-ORCH/recovery-20261020/real-stack71/parallel-execution-20261022/round-069/qa-g1/` (QA.md, verdict.json). Approval sha `83b24542...` (APPROVE_DELTA vs code434), written at BOTH `round-069/qa-delta438/approval.json` (tools key on this: make-interface438/gen-tools438 filter `qa-delta438/approval.json`) and `qa-delta/approval.json`. delta sha 38713a56, build manifest 73ae49ca.

**Delta:** 21 changed classes = 8 semantic + 13 line-number-only (javap -c -p -constants), 694 identical to code434, resources only application.yml. Matches round-067 prediction exactly.

**R1b diagnosis (reusable gotcha):** `git apply -R -p1` run with cwd inside the repo work tree (here `code438-build/control`) silently skips patch paths outside cwd and exits 0. The control tool's BEFORE-pin assert then fails closed. Dry runs under /private/tmp hide it. Fix: build root outside the repo (`--build-root`) or `GIT_CEILING_DIRECTORIES`. I ran the real tool with a scratchpad build root: identicalToCode434 true (11 s).

**Pair generator facts:** 38 check names via ast = 23 dict keys + 12 `checks.update` kwargs + role loop 2 + guardProfileRootIsFresh438. Legitimate compare-pair hex diffs at R5 are only classpath, srcSeal, mainSeal, mainManifest (scratch -> real); a diff in FE_FILES/QA_PINS/BASELINE is not legitimate. Frontend 18 src files in verdict, 17 pinned (pageIncrementalRecording.test.tsx unpinned).

**Why it matters:** next is Root R2 construct then G3 mechanical selector. Nits: collect438m.py line 75 spec line number rewritten by case-token rule (comment only); portable438-main `replaces` text cites a control that Root did not get to pass.
