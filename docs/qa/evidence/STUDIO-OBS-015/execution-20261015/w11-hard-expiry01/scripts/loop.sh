#!/bin/bash
# usage: loop.sh <variant-dir> <N> <logdir> [testfile] [mode-filter]
export PATH=$HOME/.local/share/fnm/node-versions/v24.20.0/installation/bin:$PATH
V=$1; N=$2; LOG=$3; TF=${4:-test/fixtures-tier/guided-secret-ownership.test.ts}; MODE=${5:-hard-expiry}
mkdir -p $LOG
cd $V/studio-runner || exit 1
for i in $(seq -w 1 $N); do
  s=$(date +%s)
  ./node_modules/.bin/vitest run --config vitest.fixtures.config.ts $TF -t "$MODE" --coverage.enabled=false --reporter=json --outputFile=$LOG/run-$i.json > $LOG/run-$i.out 2>&1
  echo "$i exit=$? wall=$(( $(date +%s)-s ))s" >> $LOG/summary.txt
  cp $V/docs/qa/evidence/STUDIO-OBS-007/runner-guided-renew-execution-2/oracle-$MODE.json $LOG/oracle-$i.json 2>/dev/null
done
echo DONE >> $LOG/summary.txt
