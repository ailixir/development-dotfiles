#!/bin/bash
set -u
cd /Users/brunobuger/orca/workspaces/put-checks/ui-studio
export PATH=$HOME/.local/share/fnm/node-versions/v24.20.0/installation/bin:$PATH
export JAVA_HOME=/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home
E=docs/qa/evidence/STUDIO-OBS-009/execution-20261018
X9=.aiox/sdc/STUDIO-OBSERVED-ORCH/execute-009
echo "== checks start $(date -u +%FT%TZ)"
( cd backend && caffeinate -i ./gradlew --no-daemon spotlessCheck checkstyleMain checkstyleTest --continue ) > $E/post-g9/gradle-checks-obs009-post-3.log 2>&1
echo "checks exit $?" | tee $E/post-g9/gradle-checks-obs009-post-3.exit
echo "== tests start $(date -u +%FT%TZ)"
P=com.citi.put.checks.studio
python3 $X9/run-backend-tasked.py obs009-post-2 --test-tasks test --require-exec-tasks test -- test \
  --tests "$P.guided.session.GuidedServiceTransportFaultIT.actualConsumedGuidedControllerJvmCrashBeforeSecretDecisionReconcilesWithoutRereadOrPost" \
  --tests "$P.guided.session.GuidedServiceTransportFaultIT.actualConsumedGuidedControllerJvmCrashBeforeResolutionReconcilesWithoutReadOrPost" \
  --tests "$P.guided.translation.GuidedDefaultModelReservationIT" \
  --tests "$P.guided.session.GuidedWireContractTest" \
  --tests "$P.guided.session.GuidedSessionIT" \
  --tests "$P.guided.session.GuidedCsiBudgetIT" \
  --tests "$P.guided.publication.GuidedPublicationMigrationTest" \
  --tests "$P.guided.publication.ObservedProfileDriftTest" \
  --tests "$P.guided.GuidedReplayingPrefixMigrationIT" \
  --no-daemon
echo "tests exit $?"
