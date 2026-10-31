package com.citi.put.checks.studio.guided.examples;

import static org.assertj.core.api.Assertions.assertThat;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.Set;
import java.util.stream.Stream;
import org.junit.jupiter.api.Test;

/**
 * AC5: the example store is never reached during replay, proved structurally. Only the example
 * package and the single recorder call site may reference the example package. The replay,
 * dispatch, readiness, acceptance, execution and progress-report classes cannot reach it.
 */
class StepExampleIsolationTest {
  private static final String PACKAGE = "com.citi.put.checks.studio.guided.examples";
  private static final Path MAIN = Path.of("src", "main", "java");

  /** The recorder call site (E12's promotion path) is added here when it is wired. */
  private static final Set<String> ALLOWED_CALLERS = Set.of("StudioProofPromotionService.java");

  /** The one recorder call site may only reach the recorder, never snapshots or the store. */
  private static final String RECORDER_CALL_SITE = "StudioProofPromotionService.java";

  @Test
  void onlyLearningTimeClassesReferenceTheExamplePackage() throws IOException {
    List<String> offenders = new ArrayList<>();
    for (Path file : javaSources()) {
      String source = Files.readString(file, StandardCharsets.UTF_8);
      if (!source.contains(PACKAGE) || declaredPackage(source).equals(PACKAGE)) {
        continue;
      }
      if (!ALLOWED_CALLERS.contains(file.getFileName().toString())) {
        offenders.add(file.toString());
      }
    }
    assertThat(offenders)
        .as("these classes can reach the example store; replay must stay model-free")
        .isEmpty();
  }

  @Test
  void theRecorderCallSiteReachesTheRecorderOnly() throws IOException {
    for (Path file : javaSources()) {
      if (!file.getFileName().toString().equals(RECORDER_CALL_SITE)) {
        continue;
      }
      String source = Files.readString(file, StandardCharsets.UTF_8);
      assertThat(source).contains(PACKAGE + ".StepExampleRecorder");
      assertThat(source).doesNotContain("StepExampleSnapshots", "StepExampleStore");
      return;
    }
    throw new AssertionError("the recorder call site must exist");
  }

  @Test
  void theExamplePackageDoesNotReachTheReplayOrDispatchPaths() throws IOException {
    List<String> offenders = new ArrayList<>();
    for (Path file : javaSources()) {
      String source = Files.readString(file, StandardCharsets.UTF_8);
      if (!declaredPackage(source).equals(PACKAGE)) {
        continue;
      }
      for (String line : source.lines().filter(l -> l.startsWith("import ")).toList()) {
        if (line.contains(".dispatch.")
            || line.contains(".readiness.")
            || line.contains(".gateway.")
            || line.contains("StudioAcceptanceService")) {
          offenders.add(file.getFileName() + ": " + line);
        }
      }
    }
    assertThat(offenders).isEmpty();
  }

  @Test
  void theScanIsNotVacuous() throws IOException {
    long packageClasses =
        javaSources().stream()
            .filter(p -> p.toString().replace('\\', '/').contains("studio/guided/examples/"))
            .count();
    assertThat(packageClasses).isGreaterThanOrEqualTo(4L);
    assertThat(javaSources()).hasSizeGreaterThan(50);
    boolean replayPathExists =
        javaSources().stream()
            .anyMatch(p -> p.toString().replace('\\', '/').contains("studio/dispatch/"));
    assertThat(replayPathExists)
        .as("the dispatch package must exist or the scan proves nothing")
        .isTrue();
  }

  private static List<Path> javaSources() throws IOException {
    try (Stream<Path> files = Files.walk(MAIN)) {
      return files.filter(p -> p.toString().endsWith(".java")).toList();
    }
  }

  private static String declaredPackage(String source) {
    return source
        .lines()
        .filter(l -> l.startsWith("package "))
        .findFirst()
        .map(l -> l.substring("package ".length()).replace(";", "").trim())
        .orElse("");
  }
}
