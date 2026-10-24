# FUTURE ONLY. Root must release GS-M(b), four FOLD handoffs and two direct-release files, tree and Gradle lock first.
# Labels below are fresh-at-execution proposals, not evidence of execution. Use fresh labels if consumed.
export PATH=$HOME/.local/share/fnm/node-versions/v24.20.0/installation/bin:$PATH
lsof -nP -iTCP -sTCP:LISTEN
python3 .aiox/sdc/STUDIO-OBSERVED-ORCH/execute-008/with-gradle-lock.py python3 .aiox/sdc/STUDIO-OBSERVED-ORCH/execute-011/run-backend-tasked.py obs011-its-01 --test-tasks test --require-exec-tasks test -- test --tests 'com.citi.put.checks.studio.guided.session.GuidedServiceTransportFaultIT' --tests 'com.citi.put.checks.studio.guided.secret.SecretUseAuditIT' --tests 'com.citi.put.checks.studio.guided.publication.GuidedPublicationRaceTest' --rerun-tasks --no-daemon
lsof -nP -iTCP -sTCP:LISTEN
python3 .aiox/sdc/STUDIO-OBSERVED-ORCH/execute-008/with-gradle-lock.py python3 .aiox/sdc/STUDIO-OBSERVED-ORCH/execute-011/run-backend-tasked.py obs011-its-02 --test-tasks test --require-exec-tasks test -- test --tests 'com.citi.put.checks.studio.guided.session.GuidedPlanningIntegrationTest' --tests 'com.citi.put.checks.studio.guided.translation.GuidedFocusMutationJoinedIT' --tests 'com.citi.put.checks.studio.guided.session.GuidedEvidencePendingAppendJoinedIT' --rerun-tasks --no-daemon
# No historical --allowed-skips-file for this subset. Report native counts and collector policy separately.
# Lane checks are non-evidentiary under R-T0-4; full11-G with exact case/timing/privacy reconciliation remains owed.
