#!/bin/bash
# prints a test compile classpath: main classpath + test classes + curated test jars from the gradle cache
SP=/private/tmp/claude-501/-Users-brunobuger-orca-workspaces-put-checks-ui-studio/49497aae-dbea-402b-a9a6-2d80f4cd2e4e/scratchpad
CACHE=$HOME/.gradle/caches/modules-2/files-2.1
CP=$(cat $SP/maincp.txt)
CP="$CP:/Users/brunobuger/orca/workspaces/put-checks/ui-studio/backend/build/classes/java/test:/Users/brunobuger/orca/workspaces/put-checks/ui-studio/backend/build/resources/test"
for name in assertj-core junit-jupiter-api junit-jupiter-params junit-platform-commons opentest4j apiguardian-api spring-test spring-boot-test spring-boot-test-autoconfigure testcontainers postgresql junit-jupiter database-commons jdbc mockito-core mockito-junit-jupiter byte-buddy byte-buddy-agent objenesis junit hamcrest-core hamcrest jsonassert spring-security-test awaitility; do
  for jar in $(find $CACHE -path "*/$name/*" -name "$name-[0-9]*.jar" ! -name "*-sources.jar" ! -name "*-javadoc.jar" 2>/dev/null | sort -V | tail -1); do CP="$CP:$jar"; done
done
echo "$CP"
