#!/usr/bin/env bash
# Recomputes, live and read-only, whether epic/EPIC-10 can be fast-forwarded to the integration
# branch inside its own worktree. Exit 0 = fold is possible now. Exit 1 = blocked (report says why).
# Never writes anywhere. Safe to run at any time, by anyone.
source "$(dirname "${BASH_SOURCE[0]}")/common.sh"
require_epic_wt

ts=$(now_utc)
epic_head=$(git -C "$INTEGRATION_WT" rev-parse "$EPIC_BRANCH")
int_head=$(git -C "$INTEGRATION_WT" rev-parse "$INTEGRATION_BRANCH")
base=$(git -C "$INTEGRATION_WT" merge-base "$EPIC_BRANCH" "$INTEGRATION_BRANCH")
read -r behind ahead <<<"$(git -C "$INTEGRATION_WT" rev-list --left-right --count "$EPIC_BRANCH...$INTEGRATION_BRANCH")"

echo "epic10-fold precheck @ $ts"
echo "  $EPIC_BRANCH        = $epic_head"
echo "  $INTEGRATION_BRANCH = $int_head"
echo "  merge-base = $base   (epic ahead: $behind, integration ahead: $ahead)"

status=0
if [ "$base" != "$epic_head" ]; then
  echo "  BLOCKED: $EPIC_BRANCH has commits the integration branch lacks; this is no longer a fast-forward."
  echo "          Their work has been committed. Use the merge path in RULINGS.md, not fold.sh."
  status=1
fi

tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
ff_files > "$tmp/ff"; epic_dirty_paths > "$tmp/dirty"
comm -12 "$tmp/dirty" "$tmp/ff" > "$tmp/blockers"
dirty_n=$(wc -l < "$tmp/dirty" | tr -d ' '); ff_n=$(wc -l < "$tmp/ff" | tr -d ' '); blk_n=$(wc -l < "$tmp/blockers" | tr -d ' ')
echo "  dirty paths in $EPIC_WT: $dirty_n; files the fold touches: $ff_n; intersection: $blk_n"
if [ "$blk_n" -gt 0 ]; then
  echo "  BLOCKED: these files are dirty in $EPIC_WT AND would be rewritten by the fold:"
  sed 's/^/    /' "$tmp/blockers"
  status=1
fi
[ "$status" -eq 0 ] && echo "  OK: fold is possible now (git -C $EPIC_WT merge --ff-only $INTEGRATION_BRANCH)."
exit "$status"
