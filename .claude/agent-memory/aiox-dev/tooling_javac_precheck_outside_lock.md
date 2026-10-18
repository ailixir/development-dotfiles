---
name: tooling-javac-precheck-outside-lock
description: Compile-check and run pure unit backend tests with javac/java while another lane holds the Gradle lock (maincp.txt + gradle-cache test jars + tiny JUnit launcher)
metadata:
  type: project
---

When root or another lane holds the shared Gradle lock for about an hour, you can still compile-check your Java edits and run pure unit tests outside Gradle. This was used in STUDIO-OBS-012A R8 on 2026-10-13. These runs are **pre-checks, not proof**: re-run under the lock before claiming anything.

- **Main classpath:** `scratchpad/maincp.txt`, from Lane C, is the main runtime classpath. Prepend `backend/build/classes/java/main`. Then `javac -proc:none -d <out> -cp ... <changed main files>`.
- **Test compile:** add `build/classes/java/test` plus these jars from `~/.gradle/caches/modules-2/files-2.1` (skip the `-sources` and `-javadoc` jars):
  - assertj-core, junit-jupiter-api, junit-platform-commons, opentest4j, apiguardian
  - spring-test, spring-boot-test, spring-boot-test-autoconfigure
  - testcontainers, testcontainers junit-jupiter, testcontainers postgresql, testcontainers jdbc, testcontainers database-commons
  - mockito-core, byte-buddy
  - **junit:junit 4 and hamcrest** (testcontainers' `GenericContainer` needs `org.junit.rules.TestRule`)
- **Cache layout:** jars sit at `files-2.1/<group>/<artifact>/<version>/<hash>/x.jar`, so the glob needs `*/*/*.jar`. One level short silently drops every test jar (javac then shows assertThat errors). Working script: `scratchpad/cint/javac-sct.sh`.
- **zsh gotcha:** run any glob over the cache from a bash script. An unmatched glob aborts the whole zsh command ("no matches found").
- **Running a unit class:** use a one-file `RunOne.java` launcher (`LauncherFactory` + `SummaryGeneratingListener`). Put junit-platform-launcher/engine 1.10.3 and junit-jupiter-engine 5.10.3 on the classpath. There is no console-standalone jar in the cache.
- **Format pre-check:** run the google-java-format 1.22.0 jar from the gradle cache, with guava 33.4.0-jre and the jdk.compiler `--add-exports`, plus `--skip-reflowing-long-strings`. That flag matches spotless; without it the CLI reflows SQL strings the repo keeps. It must report the pre-edit file as clean. Script: `scratchpad/dex-r10b/gjf.sh` (dex-r10b, 2026-10-13).
- **AssertJ 3.25 argument order:** `catchThrowableOfType(ThrowingCallable, Class)`. The callable comes first, the class second.

**Why:** the lock queue can block a lane for 45+ minutes. A compile error found only after acquiring the lock wastes the hold and makes the next waiter wait longer.

**How to apply:** pre-check while queued, then do all Gradle work in a single lock hold. Related: [[tooling-gradle-focused-runs]], [[shared-scratch-and-gradle-lock]].
