#!/bin/bash
# Final bytes: the script form, then both negative controls again.
set -u
ROOT=/Users/brunobuger/orca/workspaces/put-checks/ui-studio
cd "$ROOT"
export PATH=$HOME/.local/share/fnm/node-versions/v24.20.0/installation/bin:$PATH
export JAVA_HOME=/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home
SP=/private/tmp/claude-501/-Users-brunobuger-orca-workspaces-put-checks-ui-studio/49497aae-dbea-402b-a9a6-2d80f4cd2e4e/scratchpad/f
F=docs/qa/evidence/STUDIO-OBS-009/execution-20261018/f
COL=.aiox/sdc/STUDIO-OBSERVED-ORCH/execute-009/run-backend-tasked.py
snap() { lsof -nP -iTCP -sTCP:LISTEN > "$F/lsof-before-$1.txt" 2>&1; ps -axo pid,etime,command | grep -i gradle | grep -v grep > "$F/gradle-procs-before-$1.txt"; }
keep() { mkdir -p "$F/$1"; cp -R backend/build/corun/. "$F/$1/" 2>/dev/null; cp backend/build/test-results/test/TEST-com.citi.put.checks.corun.ObservedCoRunIT.xml "$F/$1/" 2>/dev/null; }
echo "== script02"
mkdir -p "$F/script02"; snap script02
python3 .aiox/sdc/STUDIO-OBSERVED-ORCH/strict-qa-20261014/capture-manifest.py "$F/script02/manifest-before.json" > /dev/null 2>&1
CORUN_GRADLE_ARGS="--no-daemon" CORUN_EXPECT_DIST=4add1307afe80af5270a63dc809d43bb2d4d4dd51ab32a83330d3cbaf35fc3c3 CORUN_EVIDENCE_OUT="$F/script02/fault-injection.json" bash tools/corun.sh --skip-build > "$F/script02/corun.out" 2>&1
echo "script02 exit=$?"
python3 .aiox/sdc/STUDIO-OBSERVED-ORCH/strict-qa-20261014/capture-manifest.py "$F/script02/manifest-after.json" > /dev/null 2>&1
cp -R backend/build/corun/. "$F/script02/" 2>/dev/null; cp backend/build/test-results/test/TEST-com.citi.put.checks.corun.ObservedCoRunIT.xml "$F/script02/" 2>/dev/null
echo "== M1 (mut03)"
snap obs009-f-mut03; rm -rf backend/build/corun "$SP/mut/out"; mkdir -p "$SP/mut/out"
MUT_SRC="$SP/mut/src" MUT_OUT="$SP/mut/out" python3 "$COL" obs009-f-mut03 --test-tasks test -- test --tests 'com.citi.put.checks.corun.ObservedCoRunIT.aLostAcknowledgmentIsNeverAResend' --no-daemon -I "$SP/mut/mutation.init.gradle.kts"
echo "mut03 exit=$?"; keep obs009-f-mut03
echo "== M2 (mut04)"
snap obs009-f-mut04; rm -rf backend/build/corun "$SP/mut2/out"; mkdir -p "$SP/mut2/out"
CORUN_REPEATS=1 MUT_SRC="$SP/mut2/src" MUT_OUT="$SP/mut2/out" python3 "$COL" obs009-f-mut04 --test-tasks test -- test --tests 'com.citi.put.checks.corun.ObservedCoRunIT.aPublicCancelOfALiveGuidedBrowserMidActionTearsItDownAndFreesTheSlot' --no-daemon -I "$SP/mut.init.copy.gradle.kts"
echo "mut04 exit=$?"; keep obs009-f-mut04
