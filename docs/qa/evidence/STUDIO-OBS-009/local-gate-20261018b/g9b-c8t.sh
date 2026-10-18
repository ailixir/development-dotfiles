#!/bin/zsh
# STUDIO-OBS-009 G9b C8T (root): a targeted backend run replacing the full C8 check, by USER DECISION 2026-10-18
# ("Targeted backend run"; w0/decisions.md). Covers: the classes the post-G9 batch touched, the two classes
# that failed in G9 (each class in full), the fixed guidedIncrementalTest set, and the static checks.
# The full regression and the JaCoCo gate are waived here and owed at the 011 T0 fresh baseline.
set -u
ROOT=/Users/brunobuger/orca/workspaces/put-checks/ui-studio
G=$ROOT/docs/qa/evidence/STUDIO-OBS-009/local-gate-20261018b
X9=$ROOT/.aiox/sdc/STUDIO-OBSERVED-ORCH/execute-009
LOCK=$ROOT/.aiox/sdc/STUDIO-OBSERVED-ORCH/execute-008/with-gradle-lock.py
CAP=$ROOT/.aiox/sdc/STUDIO-OBSERVED-ORCH/strict-qa-20261014/capture-manifest.py
export PATH=$HOME/.local/share/fnm/node-versions/v24.20.0/installation/bin:$PATH
cd $ROOT
st() { echo "$1 exit=$2" | tee -a $G/status.txt; }
helm_digest() { find helm-chart -type f | sort | xargs shasum -a 256 > $1; shasum -a 256 $1 | cut -d' ' -f1; }
echo "C8-full ABORTED by root on user decision (targeted run instead)" >> $G/status.txt
python3 $CAP $G/c8t-before.json | tee $G/c8t-before.summary
P=com.citi.put.checks.studio.guided
python3 $LOCK python3 $X9/run-backend-tasked.py obs009-g9b-c8t01 --test-tasks test,guidedIncrementalTest --require-exec-tasks test,guidedIncrementalTest -- --continue \
  test \
  --tests $P.publication.GuidedPublicationReplayIT \
  --tests $P.session.GuidedServiceTransportFaultIT \
  --tests $P.session.GuidedPlanningIntegrationTest \
  --tests $P.session.GuidedDefaultModelReservationIT \
  --tests $P.session.GuidedWireContractTest \
  --tests $P.session.GuidedSessionIT \
  --tests $P.session.GuidedCsiBudgetIT \
  --tests $P.publication.ObservedArtifactLowererTest \
  --tests $P.publication.GuidedPublicationMigrationTest \
  guidedIncrementalTest spotlessCheck checkstyleMain checkstyleTest spotbugsMain --rerun-tasks --no-daemon > $G/c8t-backend.collector.log 2>&1; st C8T-backend-targeted $?
rm -rf $G/c8t-test-results; mkdir -p $G/c8t-test-results; cp -R backend/build/test-results/. $G/c8t-test-results/ 2>/dev/null
python3 $CAP $G/capture-after.json | tee $G/capture-after.summary
echo "helm-after $(helm_digest $G/helm-after.txt)" | tee -a $G/status.txt
echo G9B-DONE >> $G/status.txt
