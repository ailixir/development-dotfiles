#!/usr/bin/env bash
# Shared configuration for the Epic 10 fold tooling. Sourced, not executed.
# Every path here is recomputed from git at run time; nothing is a snapshot.
set -euo pipefail

EPIC_BRANCH="${EPIC_BRANCH:-epic/EPIC-10}"
INTEGRATION_BRANCH="${INTEGRATION_BRANCH:-epic/EPIC-10-w7}"
WT_ROOT="${WT_ROOT:-/Users/brunobuger/orca/workspaces/put-checks/wt}"
EPIC_WT="${EPIC_WT:-$WT_ROOT/epic}"          # READ-ONLY for every script but fold.sh --execute
INTEGRATION_WT="${INTEGRATION_WT:-$WT_ROOT/w7}"

CONTRACT_PATH="docs/specs/studio/openapi.yaml"
PIN_PATH="studio-runner/test/run/confinement.test.ts"

now_utc() { date -u +"%Y-%m-%dT%H:%M:%SZ"; }
die() { echo "ERROR: $*" >&2; exit 2; }

# The epic worktree must be on the epic branch, or every conclusion below is about the wrong tree.
require_epic_wt() {
  local b
  b=$(git -C "$EPIC_WT" rev-parse --abbrev-ref HEAD)
  [ "$b" = "$EPIC_BRANCH" ] || die "$EPIC_WT is on '$b', expected '$EPIC_BRANCH'"
}

# Files the fast-forward (or merge) would touch: everything different between the two branches.
ff_files() { git -C "$INTEGRATION_WT" diff --name-only "$EPIC_BRANCH" "$INTEGRATION_BRANCH" | sort -u; }

# Dirty paths in the epic worktree, renames reduced to their destination, untracked included.
epic_dirty_paths() {
  git -C "$EPIC_WT" status --porcelain=v1 -uall | awk '{print substr($0,4)}' | sed 's/.* -> //' | sort -u
}
