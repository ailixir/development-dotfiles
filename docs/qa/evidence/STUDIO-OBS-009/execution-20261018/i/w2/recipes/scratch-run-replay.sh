#!/bin/bash
# usage: scratch-run.sh <label> <tests...>   (run under with-gradle-lock.py)
set -u
LABEL=$1; shift
ROOT=/Users/brunobuger/orca/workspaces/put-checks/ui-studio
S=/private/tmp/claude-501/-Users-brunobuger-orca-workspaces-put-checks-ui-studio/49497aae-dbea-402b-a9a6-2d80f4cd2e4e/scratchpad/dex-w2-i
E=$ROOT/docs/qa/evidence/STUDIO-OBS-009/execution-20261018/i/w2
export PATH=$HOME/.local/share/fnm/node-versions/v24.20.0/installation/bin:$PATH
export OBS009_RUNNER_DIST=$S/emit-root/dist
lsof -nP -iTCP -sTCP:LISTEN > $E/lsof-before-$LABEL.txt 2>&1
ps aux | grep -i "[g]radle" | awk '{print $2, $11, $12, $NF}' > $E/gradle-procs-before-$LABEL.txt
ARGS=()
for t in "$@"; do ARGS+=(--tests "$t"); done
cd $ROOT/backend
./gradlew test "${ARGS[@]}" -I /private/tmp/claude-501/-Users-brunobuger-orca-workspaces-put-checks-ui-studio/49497aae-dbea-402b-a9a6-2d80f4cd2e4e/scratchpad/dex-w2-i/replay.init.gradle.kts -x verifyRunnerDist --no-daemon > $E/logs/$LABEL-gradle.log 2>&1
CODE=$?
rm -rf $E/logs/$LABEL-xml; cp -R build/test-results/test $E/logs/$LABEL-xml 2>/dev/null
echo "exit $CODE" >> $E/logs/$LABEL-gradle.log
exit $CODE
