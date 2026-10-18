#!/bin/bash
# whole test file (all four modes) per iteration; copies all four oracles
export PATH=$HOME/.local/share/fnm/node-versions/v24.20.0/installation/bin:$PATH
V=$1; N=$2; LOG=$3; TF=${4:-test/fixtures-tier/guided-secret-ownership.test.ts}
mkdir -p $LOG; cd $V/studio-runner || exit 1
for i in $(seq -w 1 $N); do
  s=$(date +%s)
  ./node_modules/.bin/vitest run --config vitest.fixtures.config.ts $TF --coverage.enabled=false --reporter=json --outputFile=$LOG/run-$i.json > $LOG/run-$i.out 2>&1
  echo "$i exit=$? wall=$(( $(date +%s)-s ))s" >> $LOG/summary.txt
  for m in revoked slow-grant lost-body-late-grant hard-expiry; do cp $V/docs/qa/evidence/STUDIO-OBS-007/runner-guided-renew-execution-2/oracle-$m.json $LOG/oracle-$i-$m.json 2>/dev/null; done
done
echo DONE >> $LOG/summary.txt
