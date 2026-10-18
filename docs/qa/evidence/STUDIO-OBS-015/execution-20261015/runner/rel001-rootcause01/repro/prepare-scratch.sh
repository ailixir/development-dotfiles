#!/usr/bin/env bash
# REL-001 repro: build a scratch copy of studio-runner OUTSIDE the repo with a patch variant applied.
#   prepare-scratch.sh a|ab [--dry-run] [--typecheck-full] [--lint]
#   a  = fix-a-cause-preservation.patch only (the instrumented variant that names the failure)
#   ab = fix.patch (A + B: also waits for the chrome://version fields)
# Reads the repo working tree, writes only under $REPRO_HOME/<variant>/. No npm/pnpm install:
# node_modules is a symlink to the repo's. Nothing in the repo is modified.
set -euo pipefail
REL001_HERE="$(cd "$(dirname "$0")" && pwd)"; source "$REL001_HERE/lib.sh"
VARIANT="${1:?usage: prepare-scratch.sh a|ab [--dry-run] [--typecheck-full] [--lint]}"; shift || true
DRY=0; FULL=0; LINT=0
for f in "$@"; do case "$f" in --dry-run) DRY=1;; --typecheck-full) FULL=1;; --lint) LINT=1;; *) echo "unknown flag $f" >&2; exit 2;; esac; done
case "$VARIANT" in a) PATCH="$REL001_EVIDENCE/fix-a-cause-preservation.patch";; ab) PATCH="$REL001_EVIDENCE/fix.patch";; *) echo "variant must be a or ab" >&2; exit 2;; esac
use_node24

SRC="$REL001_REPO/studio-runner"
ROOT="$REPRO_HOME/$VARIANT"; DEST="$ROOT/studio-runner"
[ -f "$PATCH" ] || { echo "missing $PATCH" >&2; exit 1; }
case "$ROOT" in "$REL001_REPO"/*) echo "refusing: scratch must be outside the repo ($ROOT)" >&2; exit 1;; esac

# 1. The patch base must be the tree the patches were written against.
node -e '
const fs=require("fs"),crypto=require("crypto"),path=require("path");
const m=JSON.parse(fs.readFileSync(process.argv[1],"utf8")).patchBaseFileSha256_workingTree;
let bad=0;for(const [f,h] of Object.entries(m)){const p=path.join(process.argv[2],f);
 if(h===null){ if(fs.existsSync(p)){console.error("base mismatch (should not exist):",f);bad++;} continue; }
 const got=fs.existsSync(p)?crypto.createHash("sha256").update(fs.readFileSync(p)).digest("hex"):null;
 if(got!==h){console.error("base mismatch:",f);bad++;}}
process.exit(bad?1:0)' "$REL001_EVIDENCE/manifest.json" "$REL001_REPO" \
  || { echo "the working tree no longer matches the patch base in manifest.json; regenerate the patches first" >&2; exit 1; }
echo "patch base verified against manifest.json"
( cd "$REL001_REPO" && git apply --check -p1 "$PATCH" ) && echo "git apply --check: clean"
if [ "$DRY" = 1 ]; then echo "dry run: would build $DEST from $SRC with $(basename "$PATCH")"; exit 0; fi

# 2. Copy (only into a directory this script created).
if [ -e "$ROOT" ] && [ ! -f "$ROOT/.rel001-owned" ]; then echo "refusing: $ROOT exists and is not marked as ours" >&2; exit 1; fi
if [ -f "$ROOT/.rel001-owned" ]; then rm -rf "$ROOT/studio-runner"; fi
mkdir -p "$ROOT"; : > "$ROOT/.rel001-owned"
rsync -a --exclude node_modules --exclude dist --exclude dist-repro --exclude coverage --exclude .claude --exclude short.webm "$SRC/" "$DEST/"
ln -s "$SRC/node_modules" "$DEST/node_modules"

# 3. Apply the patch (paths are studio-runner/..., so apply from $ROOT).
( cd "$ROOT" && git apply -p1 "$PATCH" ) && echo "applied $(basename "$PATCH") in $ROOT"

# 4. Build: sources plus the one test helper the harness needs, into dist-repro/ (type errors are printed).
cat > "$DEST/tsconfig.repro.json" <<'JSON'
{ "extends": "./tsconfig.json",
  "compilerOptions": { "noEmit": false, "outDir": "dist-repro", "rootDir": ".", "declaration": false, "sourceMap": false },
  "include": ["src/**/*.ts", "test/helpers/guided.ts"],
  "exclude": ["node_modules", "dist", "dist-repro", "fixtures/lint"] }
JSON
cd "$DEST"
set +e; node node_modules/typescript/bin/tsc -p tsconfig.repro.json; TSC=$?; set -e
echo "tsc (src + helper) exit $TSC  -> $DEST/dist-repro"
[ "$TSC" = 0 ] || echo "WARNING: patch $VARIANT has type errors in src; fix before trusting any run" >&2
[ -f dist-repro/src/guided/diagnostics.js ] && grep -q describeStartFailure dist-repro/src/guided/diagnostics.js || { echo "patch A not in the build" >&2; exit 1; }
[ "$VARIANT" = a ] && { ! grep -q readVersionPaths dist-repro/src/run/browser.js || { echo "variant a must not contain patch B" >&2; exit 1; }; }
[ "$VARIANT" = ab ] && { grep -q readVersionPaths dist-repro/src/run/browser.js || { echo "variant ab is missing patch B" >&2; exit 1; }; }

# 5. Optional: the checks the lead still owes (heavy; do not run under another gate).
if [ "$FULL" = 1 ]; then node node_modules/typescript/bin/tsc -p tsconfig.json --noEmit && echo "FULL type-check clean (src + all tests)"; fi
if [ "$LINT" = 1 ]; then node node_modules/eslint/bin/eslint.js $(cd "$ROOT" && git apply --numstat -p1 "$PATCH" | awk '{print $3}' | sed 's#^studio-runner/##') && echo "eslint clean on the patched files"; fi
echo "ready: RUNNER_DIR=$DEST"
