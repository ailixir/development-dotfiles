---
name: untracked-file-restore-trap
description: `git checkout -- <path>` silently does nothing for an untracked file, so a mutation applied to a brand-new file stays applied and poisons every later row
metadata:
  type: project
---

When falsifying against a file that is **new in the working tree** (untracked, `??`), do not restore
it with `git checkout -- <path>`. Git has no index entry for it, the command errors or no-ops, and
with `|| true` in a script the mutation survives.

**Why:** on 2026-09-17, while building the co-run harness, mutation M2 (a wrong dispatch endpoint)
was applied to a newly-created `StudioCoRunIT.java` and "restored" with `git checkout --`. It was not
restored. Two later mutation rows and a re-run of the *baseline* all executed with M2 still in place;
the baseline's verdict changed shape and only that discrepancy exposed it. A grep for the restored
token gave a false all-clear because the same token appeared on a neighbouring line.

**How to apply:** for untracked files, capture the original **bytes** before mutating and write them
back in a `finally`, then print `shasum -a 256` before and after and assert they match — do not trust
a grep for the restored text, and do not trust git. The whole mutation table is only as good as its
restores: a silent one invalidates every row after it. Related:
[[mutation-table-is-tree-specific]], [[empty-run-is-not-a-result]],
[[falsify-from-the-unfavourable-side]].
