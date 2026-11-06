#!/usr/bin/env bash
# Starts this component locally. A thin wrapper for Git Bash, macOS and Linux: `node scripts/dev.mjs`
# does the work on every OS and takes the same flags (`./dev.sh --help`). In cmd or PowerShell, run
# `node scripts/dev.mjs` directly.
set -euo pipefail
exec node "$(dirname "$0")/scripts/dev.mjs" "$@"
