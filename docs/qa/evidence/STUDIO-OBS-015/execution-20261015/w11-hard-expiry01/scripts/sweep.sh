#!/bin/bash
export PATH=$HOME/.local/share/fnm/node-versions/v24.20.0/installation/bin:$PATH
V=$1; LOG=$2; REPS=$3; shift 3
mkdir -p $LOG; cd $V/studio-runner
for d in "$@"; do for r in $(seq 1 $REPS); do
  W11_DELAY=$d ./node_modules/.bin/vitest run --config vitest.fixtures.config.ts test/fixtures-tier/guided-secret-ownership.test.ts -t hard-expiry --coverage.enabled=false --reporter=json --outputFile=$LOG/run-d$d-r$r.json > $LOG/run-d$d-r$r.out 2>&1
  echo "d=$d r=$r exit=$?" >> $LOG/summary.txt
  cp $V/docs/qa/evidence/STUDIO-OBS-007/runner-guided-renew-execution-2/oracle-hard-expiry.json $LOG/oracle-d$d-r$r.json
done; done; echo DONE >> $LOG/summary.txt
