#!/usr/bin/env bash
# Re-anchors BASE_SHA256 in confinement.test.ts to the sha256 of the CURRENT openapi.yaml in the
# given tree. Must be run in the same commit as any change to the contract (ADR-002 §12; the test's
# own comment at confinement.test.ts ~L224). Prints old -> new. Idempotent.
#   usage: pin-contract.sh <tree-root>
set -euo pipefail
T="${1:?tree root}"
CONTRACT="$T/docs/specs/studio/openapi.yaml"; PIN="$T/studio-runner/test/run/confinement.test.ts"
grep -qE '^(<<<<<<<|=======|>>>>>>>)' "$CONTRACT" && { echo "refusing: conflict markers in $CONTRACT" >&2; exit 2; }
new=$(shasum -a 256 "$CONTRACT" | cut -d' ' -f1)
old=$(grep -oE "BASE_SHA256 = '[0-9a-f]{64}'" "$PIN" | grep -oE '[0-9a-f]{64}')
[ -n "$old" ] || { echo "refusing: no BASE_SHA256 pin found in $PIN" >&2; exit 2; }
if [ "$old" = "$new" ]; then echo "pin already current: $new"; exit 0; fi
sed -i '' "s/BASE_SHA256 = '$old'/BASE_SHA256 = '$new'/" "$PIN"
echo "pin moved: $old -> $new"
