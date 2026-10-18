#!/bin/bash
# usage: javac-pre.sh <out-dir> files...   (compile-check test sources outside Gradle; pre-check only)
set -euo pipefail
OUT="$1"; shift
SP=/private/tmp/claude-501/-Users-brunobuger-orca-workspaces-put-checks-ui-studio/49497aae-dbea-402b-a9a6-2d80f4cd2e4e/scratchpad
BE=/Users/brunobuger/orca/workspaces/put-checks/ui-studio/backend
C=$HOME/.gradle/caches/modules-2/files-2.1
CP="$(cat $SP/maincp.txt):$BE/build/classes/java/test:$BE/src/test/resources"
for pat in "org.assertj/assertj-core" "org.junit.jupiter/junit-jupiter-api" "org.junit.jupiter/junit-jupiter-params" "org.junit.platform/junit-platform-commons" "org.opentest4j/opentest4j" "org.apiguardian/apiguardian-api" "org.springframework/spring-test" "org.springframework.boot/spring-boot-test" "org.springframework.boot/spring-boot-test-autoconfigure" "org.testcontainers/testcontainers" "org.testcontainers/junit-jupiter" "org.testcontainers/postgresql" "org.testcontainers/jdbc" "org.testcontainers/database-commons" "org.mockito/mockito-core" "net.bytebuddy/byte-buddy" "junit/junit" "org.hamcrest/hamcrest" "org.hamcrest/hamcrest-core" "org.springframework.security/spring-security-test" "com.jayway.jsonpath/json-path" "org.skyscreamer/jsonassert" "org.awaitility/awaitility" "org.flywaydb/flyway-core" "org.postgresql/postgresql" "jakarta.servlet/jakarta.servlet-api"; do
  for j in $C/$pat/*/*/*.jar; do
    case "$j" in *-sources.jar|*-javadoc.jar) continue;; esac
    [ -f "$j" ] && CP="$CP:$j"
  done
done
mkdir -p "$OUT"
/Users/brunobuger/.gradle/jdks/eclipse_adoptium-21-aarch64-os_x.2/jdk-21.0.10+7/Contents/Home/bin/javac -proc:none -parameters -d "$OUT" -cp "$CP" "$@"
