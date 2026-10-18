#!/bin/bash
cd /Users/brunobuger/orca/workspaces/put-checks/ui-studio
export PATH=$HOME/.local/share/fnm/node-versions/v24.20.0/installation/bin:$PATH
export JAVA_HOME=/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home
python3 .aiox/sdc/STUDIO-OBSERVED-ORCH/execute-009/run-backend-tasked.py obs009-post-4 --test-tasks test --require-exec-tasks test -- test \
  --tests "com.citi.put.checks.studio.guided.session.GuidedDefaultModelReservationIT" --no-daemon
echo "tests exit $?"
