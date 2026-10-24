---
name: r4-evidence-commit-policy
description: How the 2026-10-18 R4 checkpoint decided which docs/qa/evidence files to commit (about 6 GB untracked, 110k files)
metadata:
  type: project
---

The R4 checkpoint (commits f075dc085..b39359f78) committed only the text record of docs/qa/evidence (about 314 MB). Collector `execution/` dirs, jacoco/test-results/xml dirs, fixture artifact copies, `.java`/`.xml`/`.html`/`.class`/archives inside evidence, and files over 5 MB stayed untracked on disk (about 5.8 GB).

**Why:** the user's brief said exclude build outputs and large binaries and report anything over 5 MB; history rewrites are forbidden, so a bulk commit cannot be undone.

**How to apply:** for later evidence commits (011 waves, push review), reuse the same rule and read `docs/qa/evidence/STUDIO-OBS-009/execution-20261018/r4-commits/receipt.md`. Flag commit 7 (314 MB) at the pre-push gate. Stage with `GIT_LITERAL_PATHSPECS=1 git add --pathspec-from-file=<nul list> --pathspec-file-nul`; `dispatch-governance.js` stays unstaged.
