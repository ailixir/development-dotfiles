#!/usr/bin/env bash
# Performs the fold — epic/EPIC-10 fast-forwarded to the integration branch INSIDE its own
# worktree, so ref and working tree move together — but only when precheck.sh passes at that
# instant. Dry-run by default; nothing is written without --execute.
# This is the ONLY script in this directory that may write to the epic worktree, and it does so
# solely through `git merge --ff-only`, which git itself refuses if any incoming file is dirty.
#   usage: fold.sh [--execute]
source "$(dirname "${BASH_SOURCE[0]}")/common.sh"
here=$(dirname "${BASH_SOURCE[0]}")
if ! "$here/precheck.sh"; then echo "fold: precondition not met; nothing done." >&2; exit 1; fi
if [ "${1:-}" != "--execute" ]; then
  echo "fold: DRY RUN. Would run: git -C $EPIC_WT merge --ff-only $INTEGRATION_BRANCH   (pass --execute to do it)"
  exit 0
fi
before=$(git -C "$EPIC_WT" rev-parse HEAD)
git -C "$EPIC_WT" merge --ff-only "$INTEGRATION_BRANCH"
after=$(git -C "$EPIC_WT" rev-parse HEAD)
echo "fold: $EPIC_BRANCH $before -> $after @ $(now_utc)"
echo "fold: now run guards.sh $EPIC_WT (expected green: the integration tip already satisfies every guard)."
