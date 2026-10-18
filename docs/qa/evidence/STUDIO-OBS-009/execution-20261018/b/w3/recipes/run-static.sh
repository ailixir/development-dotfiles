#!/bin/bash
set -u
cd /Users/brunobuger/orca/workspaces/put-checks/ui-studio
export PATH=$HOME/.local/share/fnm/node-versions/v24.20.0/installation/bin:$PATH
EV=docs/qa/evidence/STUDIO-OBS-009/execution-20261018/b/w3
LABEL=$1
python3 .aiox/sdc/STUDIO-OBSERVED-ORCH/execute-008/with-gradle-lock.py bash -c "cd backend && JAVA_HOME=/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home ./gradlew --no-daemon --continue spotlessCheck checkstyleMain checkstyleTest spotbugsMain > ../$EV/$LABEL.gradle.log 2>&1; echo gradle-exit \$? >> ../$EV/$LABEL.gradle.log" > $EV/$LABEL.wrapper.log 2>&1
echo "wrapper exit $?" >> $EV/$LABEL.wrapper.log
