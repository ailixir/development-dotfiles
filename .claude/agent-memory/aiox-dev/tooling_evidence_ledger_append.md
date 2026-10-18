---
name: tooling-evidence-ledger-append
description: Appending to docs/qa/evidence/*/ledger.json via json load/dump re-serializes the whole (untracked) file; back it up first
metadata:
  type: feedback
---

Before appending a section to an evidence ledger.json, copy it to the scratchpad. Evidence ledgers are usually untracked, so git cannot restore the old layout, and json.load → json.dump re-indents and re-escapes every earlier section (012B: 79,284 → ~84 KB layout change with identical data).

**Why:** QA diffs ledgers between runs; a layout-only rewrite of earlier sections reads as churn and cannot be undone without a backup.
**How to apply:** back up, then either text-splice the new key before the final `}` or dump with the original indent/ensure_ascii settings (check by re-dumping the unmodified object and comparing byte size first). Related: [[tooling-deletions-and-baselines]].
