#!/bin/bash
# usage: run-collector.sh <label> <class> [<class>...]
# One collector run under the shared Gradle lock, with N24 on PATH, a new label, explicit class names.
set -u
cd /Users/brunobuger/orca/workspaces/put-checks/ui-studio
export PATH=$HOME/.local/share/fnm/node-versions/v24.20.0/installation/bin:$PATH
LABEL=$1; shift
ARGS=()
for c in "$@"; do ARGS+=(--tests "$c"); done
EV=docs/qa/evidence/STUDIO-OBS-009/execution-20261018/b
mkdir -p $EV/w3
ps aux | grep -E "gradle|java" | grep -v grep | awk '{print $2, $11, $12}' > $EV/w3/gradle-procs-before-$LABEL.txt
python3 .aiox/sdc/STUDIO-OBSERVED-ORCH/execute-008/with-gradle-lock.py bash -c "lsof -nP -iTCP -sTCP:LISTEN > $EV/w3/lsof-before-$LABEL.txt 2>&1; python3 .aiox/sdc/STUDIO-OBSERVED-ORCH/execute-009/run-backend-tasked.py $LABEL --test-tasks test -- test ${ARGS[*]} --no-daemon" > $EV/w3/$LABEL.wrapper.log 2>&1
echo "wrapper exit $?" >> $EV/w3/$LABEL.wrapper.log
