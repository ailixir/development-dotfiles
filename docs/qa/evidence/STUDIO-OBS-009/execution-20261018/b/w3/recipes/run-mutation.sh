#!/bin/bash
# usage: run-mutation.sh <spec-name-without-spec-prefix-and-json>  e.g. mut01-r1
set -u
cd /Users/brunobuger/orca/workspaces/put-checks/ui-studio
export PATH=$HOME/.local/share/fnm/node-versions/v24.20.0/installation/bin:$PATH
EV=docs/qa/evidence/STUDIO-OBS-009/execution-20261018/b/w3
NAME=$1
ps aux | grep -E "gradle|java" | grep -v grep | awk '{print $2, $11, $12}' > $EV/gradle-procs-before-$NAME.txt
python3 .aiox/sdc/STUDIO-OBSERVED-ORCH/execute-008/with-gradle-lock.py bash -c "lsof -nP -iTCP -sTCP:LISTEN > $EV/lsof-before-$NAME.txt 2>&1; python3 docs/qa/evidence/STUDIO-OBS-009/execution-20261018/b/mutations/mutate_multi.py $EV/mutations/spec-$NAME.json; cp /tmp/studio-obs009-r1-joined-worker.json $EV/mutations/$NAME-r1-worker.json 2>/dev/null; cp /tmp/studio-obs009-adj1-joined-worker.json $EV/mutations/$NAME-adj1-worker.json 2>/dev/null" > $EV/mutations/$NAME.out 2>&1
echo "wrapper exit $?" >> $EV/mutations/$NAME.out
