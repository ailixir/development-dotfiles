---
name: push-hook-text-match
description: The git-push authority PreToolUse hook matches the literal text "git push" anywhere in a Bash command, including heredoc/script content, not only real pushes
metadata:
  type: feedback
---

The `enforce-git-push-authority.cjs` hook blocks any Bash command whose text contains `git push` unless it is prefixed with `AIOX_ACTIVE_AGENT=devops`. That includes inline Python or heredocs that only write story records that mention `git push`.

**Why:** On 2026-10-07 (Story 10.51 Step 4) an inline script that wrote "git push origin --delete" into the story file was rejected.

**How to apply:** Put long record-writing scripts in a scratchpad file (Write tool) and run them by path. Use the env prefix only on real pushes.
