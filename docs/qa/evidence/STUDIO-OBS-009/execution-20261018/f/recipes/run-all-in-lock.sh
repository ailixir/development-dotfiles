#!/bin/bash
# One lock hold: (1) the co-run class, (2) on green, the M1 negative control, (3) the reused proofs.
set -u
RUN="$1"        # e.g. obs009-f-corun02
MUT="$2"        # e.g. obs009-f-mut01
REUSE="$3"      # e.g. obs009-f-reuse01
ROOT=/Users/brunobuger/orca/workspaces/put-checks/ui-studio
cd "$ROOT"
export PATH=$HOME/.local/share/fnm/node-versions/v24.20.0/installation/bin:$PATH
SP=/private/tmp/claude-501/-Users-brunobuger-orca-workspaces-put-checks-ui-studio/49497aae-dbea-402b-a9a6-2d80f4cd2e4e/scratchpad/f
F=docs/qa/evidence/STUDIO-OBS-009/execution-20261018/f
COL=.aiox/sdc/STUDIO-OBSERVED-ORCH/execute-009/run-backend-tasked.py
mkdir -p "$F"
snap() { # label
  lsof -nP -iTCP -sTCP:LISTEN > "$F/lsof-before-$1.txt" 2>&1
  ps -axo pid,etime,command | grep -i gradle | grep -v grep > "$F/gradle-procs-before-$1.txt"
}
keep() { # label
  mkdir -p "$F/$1"
  cp -R backend/build/corun/. "$F/$1/" 2>/dev/null
  cp backend/build/test-results/test/TEST-com.citi.put.checks.corun.ObservedCoRunIT.xml "$F/$1/" 2>/dev/null
}

if [ "${SKIP_STATIC:-0}" != "1" ]; then
  echo "== step 0: static gates (spotlessCheck checkstyleTest)"
  (cd backend && JAVA_HOME=/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home ./gradlew spotlessCheck checkstyleTest --no-daemon --console=plain) > "$F/static-gates-$RUN.log" 2>&1
  echo "step0 exit=$?"
fi

echo "== step 1: $RUN"
snap "$RUN"; rm -rf backend/build/corun
python3 "$COL" "$RUN" --test-tasks test -- test --tests 'com.citi.put.checks.corun.ObservedCoRunIT' --no-daemon
c1=$?
keep "$RUN"
echo "step1 exit=$c1"
greens=$(python3 - "$RUN" <<'PYX'
import json,sys
d=json.load(open("docs/qa/evidence/STUDIO-OBS-009/execution-20261018/execution/%s-results.json"%sys.argv[1]))
c=d["counts"];print(1 if c["total"]>0 and c["failed"]==0 and c["errors"]==0 and c["skipped"]==0 else 0)
PYX
)
echo "step1 all-green-by-count=$greens"
[ "$greens" = "1" ] && c1=0

if [ "${SKIP_MUTATION:-0}" != "1" ] && [ $c1 -eq 0 ]; then
  echo "== step 2: $MUT (M1: resend on an ambiguous answer; expected RED)"
  snap "$MUT"; rm -rf backend/build/corun
  rm -rf "$SP/mut/out"; mkdir -p "$SP/mut/out"
  MUT_SRC="$SP/mut/src" MUT_OUT="$SP/mut/out" \
  python3 "$COL" "$MUT" --test-tasks test -- test --tests 'com.citi.put.checks.corun.ObservedCoRunIT.aLostAcknowledgmentIsNeverAResend' --no-daemon -I "$SP/mut/mutation.init.gradle.kts"
  c2=$?
  keep "$MUT"
  echo "step2 exit=$c2"
fi

if [ "${SKIP_REUSE:-0}" != "1" ] && [ $c1 -eq 0 ]; then
  echo "== step 3: $REUSE (named proofs for the base legs, re-run at this dist)"
  snap "$REUSE"
  python3 "$COL" "$REUSE" --test-tasks test -- test \
    --tests 'com.citi.put.checks.studio.recovery.RecoveryIT' \
    --tests 'com.citi.put.checks.studio.internal.ProgressCallbackIT' \
    --tests 'com.citi.put.checks.studio.CancelIT' \
    --tests 'com.citi.put.checks.studio.StudioIdempotencyIT' \
    --tests 'com.citi.put.checks.studio.guided.session.GuidedSessionIT' \
    --tests 'com.citi.put.checks.studio.guided.session.GuidedLifecycleReasonIT' \
    --tests 'com.citi.put.checks.studio.guided.session.GuidedServiceTransportFaultIT' \
    --tests 'com.citi.put.checks.studio.guided.bridge.GuidedRunnerContextRefusalTest' \
    --tests 'com.citi.put.checks.studio.guided.bridge.GuidedPrefixReceiptVerificationTest' \
    --tests 'com.citi.put.checks.studio.guided.translation.GuidedStepVerifierTest' \
    --no-daemon
  echo "step3 exit=$?"
fi
exit $c1
