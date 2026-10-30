---
name: tooling-python-replace-empty-old
description: python str.replace(old,new) with old computed from two index() calls can be '' and then inserts new between every character; assert before replacing, and how a corrupted untracked file was recovered
metadata:
  type: feedback
---

When patching a file with `old = s[s.index(A):s.index(B)]` and `s.replace(old, new)`, an anchor B that occurs BEFORE A (for example a `describe.skipIf` earlier in the file than the `it(` being replaced) gives `old == ''`; `str.replace('', new)` then inserts `new` between every character (a 17 KB file became 30 MB).

**Why:** hit on 2026-10-27 in `studio-runner/test/evaluation/grounding-a-requests.test.ts`, which is untracked, so `git checkout` could not restore it.

**How to apply:**
- Search B from A's position (`s.index(B, a)`), and `assert a < b and len(old) > 50 and s.count(old) == 1` before replacing.
- Recovery without a backup: find the inserted block (it starts with the first line of `new`) and `s.replace(block, '')`; that restores the original exactly when `new` cannot overlap original text. Check the length against the earlier size.
- For untracked files, copy a backup to the scratchpad before any scripted patch.
