#!/bin/bash
# usage: javac-check.sh <outdir> <files...> : compile-only precheck of test files against the current build output
SP=/private/tmp/claude-501/-Users-brunobuger-orca-workspaces-put-checks-ui-studio/49497aae-dbea-402b-a9a6-2d80f4cd2e4e/scratchpad/dex-w3-b
OUT=$1; shift
mkdir -p "$OUT"
JAVAC=/Users/brunobuger/.gradle/jdks/eclipse_adoptium-21-aarch64-os_x.2/jdk-21.0.10+7/Contents/Home/bin/javac
"$JAVAC" -proc:none -parameters -d "$OUT" -cp "$($SP/testcp.sh)" "$@"
