#!/usr/bin/env bash
# Regenerates a 3-way merge preview for every file that is both dirty in the epic worktree and
# changed by the integration branch. base = merge-base blob, ours = integration blob, theirs = the
# live working file in the epic worktree (read, never written). Output goes to a fresh directory,
# so nothing here can go stale: rerun it and it recomputes from the live tree.
#   usage: preview.sh [outdir]
source "$(dirname "${BASH_SOURCE[0]}")/common.sh"
require_epic_wt
out="${1:-$(mktemp -d -t epic10-preview)}"; mkdir -p "$out"
base=$(git -C "$INTEGRATION_WT" merge-base "$EPIC_BRANCH" "$INTEGRATION_BRANCH")
ts=$(now_utc); echo "$ts" > "$out/snapshot-ts.txt"
echo "epic10-fold preview @ $ts -> $out"
echo "rc  file  (rc = conflict count from git merge-file; 0 = textually clean, NOT semantically clean)"
comm -12 <(epic_dirty_paths) <(ff_files) | while read -r f; do
  n=$(echo "$f" | tr '/' '_'); mkdir -p "$out/$n"
  git -C "$INTEGRATION_WT" show "$base:$f" > "$out/$n/base"
  git -C "$INTEGRATION_WT" show "$INTEGRATION_BRANCH:$f" > "$out/$n/ours"
  cat "$EPIC_WT/$f" > "$out/$n/theirs"
  shasum -a 256 "$out/$n/theirs" | cut -d' ' -f1 > "$out/$n/theirs.sha256"
  cp "$out/$n/theirs" "$out/$n/merged"
  set +e; git merge-file -L THEIRS-epic-wt -L BASE -L OURS-integration "$out/$n/merged" "$out/$n/base" "$out/$n/ours"; rc=$?; set -e
  printf '%-3s %s\n' "$rc" "$f"
done | tee "$out/results.txt"
