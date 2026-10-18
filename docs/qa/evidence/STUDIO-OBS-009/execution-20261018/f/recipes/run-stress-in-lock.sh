#!/bin/bash
# The class once (static gates first), then the two timing- and race-sensitive guided cases ten times each.
set -u
RUN="$1"; STRESS="$2"
ROOT=/Users/brunobuger/orca/workspaces/put-checks/ui-studio
cd "$ROOT"
export PATH=$HOME/.local/share/fnm/node-versions/v24.20.0/installation/bin:$PATH
F=docs/qa/evidence/STUDIO-OBS-009/execution-20261018/f
COL=.aiox/sdc/STUDIO-OBSERVED-ORCH/execute-009/run-backend-tasked.py
mkdir -p "$F"
snap() { lsof -nP -iTCP -sTCP:LISTEN > "$F/lsof-before-$1.txt" 2>&1; ps -axo pid,etime,command | grep -i gradle | grep -v grep > "$F/gradle-procs-before-$1.txt"; }
keep() { mkdir -p "$F/$1"; cp -R backend/build/corun/. "$F/$1/" 2>/dev/null; cp backend/build/test-results/test/TEST-com.citi.put.checks.corun.ObservedCoRunIT.xml "$F/$1/" 2>/dev/null; }
echo "== step 0: static gates"
(cd backend && JAVA_HOME=/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home ./gradlew spotlessCheck checkstyleTest --no-daemon --console=plain) > "$F/static-gates-$RUN.log" 2>&1
echo "step0 exit=$?"
echo "== step 1: $RUN"
snap "$RUN"; rm -rf backend/build/corun
python3 "$COL" "$RUN" --test-tasks test -- test --tests 'com.citi.put.checks.corun.ObservedCoRunIT' --no-daemon
echo "step1 exit=$?"; keep "$RUN"
echo "== step 2: $STRESS (guided cancel, ten runs)"
snap "$STRESS"; rm -rf backend/build/corun
CORUN_REPEATS=10 python3 "$COL" "$STRESS" --test-tasks test -- test --tests 'com.citi.put.checks.corun.ObservedCoRunIT.aPublicCancelOfALiveGuidedBrowserMidActionTearsItDownAndFreesTheSlot' --no-daemon
echo "step2 exit=$?"; keep "$STRESS"
