---
name: ui-studio-rescue-ref
description: wip/ui-studio-rescue archives 162 unclaimed uncommitted paths from the ui-studio worktree; ruled archive-only, never merge forward
metadata:
  type: project
---

Branch `wip/ui-studio-rescue` (created 2026-09-18) archives 162 unclaimed
uncommitted paths that sat in `/Users/brunobuger/orca/workspaces/put-checks/ui-studio`
on top of `brunobuger/ui-studio` (`910de104d`). Ruled **archive-only — do not merge
forward**.

**Why:** the work is an *earlier snapshot of the same lineage* as `epic/EPIC-10-w7`,
not rival work — several `studio/compile/gateway/` files in it are byte-identical to
the epic tip. The epic hardened them afterwards. Merging them forward regresses:
its `studio/StudioService.java` has **zero** `requireWrite` call sites where the epic
tip has seven, and its `application-local.yml` sets gateway credentials mode `api-key`
where the epic deliberately sets `none`. Provenance was never established — nobody
claimed the work — so the commit records it as unattributed.

**How to apply:** if anyone proposes restoring files from this ref into the epic line,
ask which specific file and check it against the epic tip first; the default answer is
no. The ref exists so the bytes are never lost, not because the content is wanted. The
full ruling with per-file evidence is in `docs/epics/EPIC-10-ui-studio-fold-ruling.md`
on `arch/ui-studio-merge`.

**Open item:** `brunobuger/ui-studio` was *not* fast-forwarded — a live session occupied
the worktree. It is still 305 commits behind. §6b of the ruling has the completion
recipe, including the duplicate-Flyway-V12 blocker that makes a naive fast-forward
produce a backend that cannot boot.

Related: [[project_epic10_worktree_topology]]
