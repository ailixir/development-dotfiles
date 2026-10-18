#!/bin/bash
set -u
LABEL="$1"
ROOT=/Users/brunobuger/orca/workspaces/put-checks/ui-studio
cd "$ROOT"
export PATH=$HOME/.local/share/fnm/node-versions/v24.20.0/installation/bin:$PATH
SP=/private/tmp/claude-501/-Users-brunobuger-orca-workspaces-put-checks-ui-studio/49497aae-dbea-402b-a9a6-2d80f4cd2e4e/scratchpad/f
F=docs/qa/evidence/STUDIO-OBS-009/execution-20261018/f
lsof -nP -iTCP -sTCP:LISTEN > "$F/lsof-before-$LABEL.txt" 2>&1
ps -axo pid,etime,command | grep -i gradle | grep -v grep > "$F/gradle-procs-before-$LABEL.txt"
rm -rf backend/build/corun "$SP/mut2/out"; mkdir -p "$SP/mut2/out"
CORUN_REPEATS=1 MUT_SRC="$SP/mut2/src" MUT_OUT="$SP/mut2/out" \
python3 .aiox/sdc/STUDIO-OBSERVED-ORCH/execute-009/run-backend-tasked.py "$LABEL" --test-tasks test -- test --tests 'com.citi.put.checks.corun.ObservedCoRunIT.aPublicCancelOfALiveGuidedBrowserMidActionTearsItDownAndFreesTheSlot' --no-daemon -I "$SP/mut.init.copy.gradle.kts"
c=$?
mkdir -p "$F/$LABEL"; cp -R backend/build/corun/. "$F/$LABEL/" 2>/dev/null
cp backend/build/test-results/test/TEST-com.citi.put.checks.corun.ObservedCoRunIT.xml "$F/$LABEL/" 2>/dev/null
shasum -a 256 "$SP/mut2/out/main/com/citi/put/checks/studio/guided/session/GuidedSessionService.class" backend/build/classes/java/main/com/citi/put/checks/studio/guided/session/GuidedSessionService.class > "$F/$LABEL/class-shas.txt" 2>&1
echo "mut2 exit=$c"
exit $c
