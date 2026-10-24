#!/bin/zsh
# STUDIO-OBS-011 T0 B1 (root): fresh full backend baseline at the 011 start digest (HEAD b39359f78 tree).
# This is also the full regression + JaCoCo owed from 009's C8 waiver (009 w0/decisions.md).
set -u
ROOT=/Users/brunobuger/orca/workspaces/put-checks/ui-studio; cd $ROOT
T=$ROOT/docs/qa/evidence/STUDIO-OBS-011/t0
CAP=$ROOT/.aiox/sdc/STUDIO-OBSERVED-ORCH/strict-qa-20261014/capture-manifest.py
export PATH=$HOME/.local/share/fnm/node-versions/v24.20.0/installation/bin:$PATH
git rev-parse HEAD > $T/start-head.txt; git status --short > $T/start-status.txt
python3 $CAP $T/start-capture.json | tee $T/start-capture.summary
find helm-chart -type f | sort | xargs shasum -a 256 > $T/start-helm.txt; shasum -a 256 $T/start-helm.txt | tee -a $T/status.txt
python3 .aiox/sdc/STUDIO-OBSERVED-ORCH/execute-008/with-gradle-lock.py python3 .aiox/sdc/STUDIO-OBSERVED-ORCH/execute-011/run-backend-tasked.py obs011-t0-baseline-check01 --test-tasks test,guidedIncrementalTest,crossReplicaTest --require-exec-tasks test,guidedIncrementalTest,crossReplicaTest --allowed-skips-file docs/qa/evidence/STUDIO-OBS-011/execution/qa/approved-skips.json -- --continue check --rerun-tasks --no-daemon > $T/b1-collector.log 2>&1
echo "B1-backend-check exit=$?" | tee -a $T/status.txt
rm -rf $T/b1-jacoco; cp -R backend/build/reports/jacoco $T/b1-jacoco 2>/dev/null
grep -nE "> Task :(jacocoTestCoverageVerification|requireFreshGuidedPartitions|jacocoTestReport)" docs/qa/evidence/STUDIO-OBS-011/execution/obs011-t0-baseline-check01.log > $T/b1-coverage-tasks.txt 2>&1
python3 $CAP $T/end-capture.json | tee $T/end-capture.summary
echo B1-DONE >> $T/status.txt
