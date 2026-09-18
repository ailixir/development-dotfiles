---
name: epic10-worktree-topology
description: EPIC-10 runs parallel story worktrees under put-checks/wt/; the architect works in whichever integration worktree the spawn names, and rules on ADR-002 Class C escalations
metadata:
  type: project
---

EPIC-10 (Checks Studio) is executed with one git worktree per in-flight story under
`/Users/brunobuger/orca/workspaces/put-checks/wt/` — `wt/epic` (branch `epic/EPIC-10`, the
integration branch) plus `wt/10.7`, `wt/10.8`, `wt/10.12` etc., each held by a different
developer agent concurrently.

**Why:** several stories code against the same frozen contract (`docs/specs/studio/openapi.yaml`)
at once, so they are developed in isolation and merged into `epic/EPIC-10`.

**How to apply:**
- Work in whichever worktree the spawn prompt names, and only that one. As of 2026-09-17 that is
  `wt/w7` (branch `epic/EPIC-10-w7`), and `wt/epic` is **read-only** — a parallel authorized session
  holds hundreds of uncommitted paths there. Never assume `wt/epic` is yours; check the spawn.
- Never enter a story's worktree; read its work with `git show story/10.8:path/to/file` instead.
- A read-only worktree means *no Gradle/npm builds there either* — a build writes `build/`. Verify by
  inspection and label the result inferred, not verified.
- Anything read from an uncommitted tree is a snapshot: record the date, the base commit and the
  dirty-path count beside the claim.
- `w7` folds into `epic/EPIC-10` by `--ff-only`, and only when no incoming file is dirty in
  `wt/epic`. So **do not edit a doc that is dirty over there** just because it is the natural home —
  that creates a new fold blocker. File the note elsewhere and defer the cross-reference.
- Never edit backend Java, frontend or `studio-runner/` source, and never edit a story file, while
  developers hold those worktrees — amend `docs/` only.
- The stash stack is shared across all worktrees. Bare `git stash`/`git stash pop` can steal another
  session's work; use a WIP commit.
- Escalations arrive because ADR-002 §12 routes route/status-code/public-surface changes (Class C)
  to the architect. The expected story behaviour is "leave the contract test red and escalate",
  so a `@Disabled` test naming an AC is a working mechanism, not a defect.
