---
name: tooling-jfr-attribution
description: Attribute backend IT time with JFR and no code edits - out-of-tree init script, JDK 21 toolchain jfr, socket-event bracketing to timestamp product checks, log call-site attribution
metadata:
  type: project
---

Recipe from STUDIO-OBS-012A d2-pool (2026-10-13). It replaced DIAG prints and needed no source edits and no byte-exact revert.

1. **Which JDK.** The tests run on the Gradle toolchain JDK `~/.gradle/jdks/eclipse_adoptium-21-aarch64-os_x.2/jdk-21.0.10+7`. The `openjdk@21` JAVA_HOME in gradle-locked.sh actually resolves to JDK 23 (it only runs the daemon). Generate the `.jfc` and run the analysis tools with the 21 toolchain: `jfr configure --input profile jdk.SocketWrite#threshold=0ms jdk.SocketRead#threshold=0ms jdk.JavaMonitorEnter#threshold=1ms ...`.
2. **Init script.** Pass values as `-Dname=...` and read them with `System.getProperty` inside `-I x.init.gradle.kts`. `providers` does not resolve in an init script, and `startParameter.projectProperties` was empty for `-P`. Add `jvmArgs("-XX:FlightRecorderOptions:stackdepth=512", "-XX:StartFlightRecording=settings=<jfc>,filename=<f>,dumponexit=true")` to `tasks.withType<Test>()`, and use `test --rerun`.
3. **Timestamp a product step without prints.** Socket events at threshold 0 carry stacks. The JDBC write of the statement next to the step brackets it within a few ms (for example `ObservedReplayAuthorization.check:258` or `beginObservedDispatch`). Write the analysis as single-file `java Tool.java` programs on `jdk.jfr.consumer.RecordingFile`.
4. **Log cost by call site.** For each sample, find the first frame below the logback/slf4j/logstash frames. In ReplayIT, about 98% of the TRACE window was `com.networknt.schema.BaseJsonValidator.debug:100`. That networknt 1.4.0 call logs node plus the whole root document per keyword at DEBUG, from `GuidedContracts.validate`. That output then goes through SecretMasker (about 73%) and the C5 scanner (about 22%).
5. **Do not commit the raw .jfr.** It contains env vars and paths. Commit only summaries.

**Why:** the DECISION-2 ruling required measured attribution, not guesses. Earlier lanes had blamed the scanner without measuring it.

**How to apply:** use this for any "slow under TRACE / timing-bound IT" question before editing code. Related: [[tooling-replayit-diagnostics]], [[tooling-gradle-focused-runs]].
