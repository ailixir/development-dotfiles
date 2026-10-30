---
name: feedback-memory-location
description: Architect agent memory must be written under the repo root .claude/agent-memory/aiox-architect/, never under backend/src or another cwd-derived path
metadata:
  type: feedback
---

Write architect agent memory only to `<repo root>/.claude/agent-memory/aiox-architect/` (and its MEMORY.md index), never to a cwd-relative `.claude` such as `backend/src/main/.claude/`.

**Why:** coordinator had to move a stray memory file written under backend/src/main/.claude (2026-10-25); files there pollute source dirs and are not the shared team memory.

**How to apply:** when the spawn prompt's memory path resolves under a subdirectory of the repo, still use the repo-root path.
