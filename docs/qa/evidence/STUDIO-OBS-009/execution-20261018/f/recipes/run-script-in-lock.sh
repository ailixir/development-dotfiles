#!/bin/bash
# The lane's second verify line, as Quinn runs it: tools/corun.sh --skip-build, under the lock.
set -u
ROOT=/Users/brunobuger/orca/workspaces/put-checks/ui-studio
cd "$ROOT"
export PATH=$HOME/.local/share/fnm/node-versions/v24.20.0/installation/bin:$PATH
export JAVA_HOME=/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home
F=docs/qa/evidence/STUDIO-OBS-009/execution-20261018/f
mkdir -p "$F/script01"
lsof -nP -iTCP -sTCP:LISTEN > "$F/lsof-before-script01.txt" 2>&1
ps -axo pid,etime,command | grep -i gradle | grep -v grep > "$F/gradle-procs-before-script01.txt"
python3 .aiox/sdc/STUDIO-OBSERVED-ORCH/strict-qa-20261014/capture-manifest.py "$F/script01/manifest-before.json" > /dev/null 2>&1
CORUN_GRADLE_ARGS="--no-daemon" \
CORUN_EXPECT_DIST=4add1307afe80af5270a63dc809d43bb2d4d4dd51ab32a83330d3cbaf35fc3c3 \
CORUN_EVIDENCE_OUT="$F/script01/fault-injection.json" \
bash tools/corun.sh --skip-build > "$F/script01/corun.out" 2>&1
code=$?
python3 .aiox/sdc/STUDIO-OBSERVED-ORCH/strict-qa-20261014/capture-manifest.py "$F/script01/manifest-after.json" > /dev/null 2>&1
cp -R backend/build/corun/. "$F/script01/" 2>/dev/null
cp backend/build/test-results/test/TEST-com.citi.put.checks.corun.ObservedCoRunIT.xml "$F/script01/" 2>/dev/null
echo "corun.sh exit=$code"
exit $code
