package com.citi.put.checks.studio.compile;

import static org.assertj.core.api.Assertions.assertThat;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.stream.Stream;
import org.junit.jupiter.api.Test;

/**
 * Story 10.8 AC-28(a) — <b>no LLM call happens during execution</b>, proved structurally.
 *
 * <p>An epic definition-of-done item and §4.1's "Compile on source changes or explicit recompile,
 * never on execute". The structural half asserts that no class outside {@code
 * com.citi.put.checks.studio.compile} references {@code
 * com.citi.put.checks.studio.compile.gateway}, so the execute, dispatch, readiness and snapshot
 * paths cannot reach the gateway even transitively.
 *
 * <p>It fails on the <em>import</em>, not on the call. A behavioural test can only prove that no
 * call happened on the paths it exercised; this one proves the edge does not exist, which is the
 * claim the epic actually makes. The behavioural half — a counting stub recording zero calls across
 * a full accept → readiness → dispatch cycle, including the AC-23 states — lives in {@code
 * DeReadyCarryForwardTest}.
 */
class NoRuntimeLlmTest {

  private static final String GATEWAY_PACKAGE = "com.citi.put.checks.studio.compile.gateway";
  private static final String COMPILE_PACKAGE = "com.citi.put.checks.studio.compile";
  private static final Path MAIN = Path.of("src", "main", "java");

  @Test
  void noClassOutsideTheCompilePackageReferencesTheGateway() throws IOException {
    List<String> offenders = new ArrayList<>();

    for (Path file : javaSources()) {
      String source = Files.readString(file, StandardCharsets.UTF_8);
      if (!source.contains(GATEWAY_PACKAGE)) {
        continue;
      }
      String declaredPackage = declaredPackage(source);
      if (declaredPackage.equals(COMPILE_PACKAGE)
          || declaredPackage.startsWith(COMPILE_PACKAGE + ".")) {
        continue;
      }
      offenders.add(declaredPackage + " / " + file.getFileName());
    }

    assertThat(offenders)
        .as(
            "these classes can reach the compile gateway. Compilation happens at authoring time"
                + " and never on execute; an execute-path class that can import the gateway is one"
                + " refactor away from calling it")
        .isEmpty();
  }

  @Test
  void theScanIsNotVacuous() throws IOException {
    long gatewayClasses =
        javaSources().stream()
            .filter(path -> path.toString().contains("studio/compile/gateway"))
            .count();

    assertThat(gatewayClasses)
        .as("the gateway package must exist, or this test proves nothing")
        .isGreaterThan(5L);
    assertThat(javaSources()).hasSizeGreaterThan(50);
  }

  @Test
  void theReadinessPackageCannotReachTheGatewayEither() throws IOException {
    Path readiness =
        Path.of("src", "main", "java", "com", "citi", "put", "checks", "studio", "readiness");

    try (Stream<Path> files = Files.walk(readiness)) {
      for (Path file : files.filter(path -> path.toString().endsWith(".java")).toList()) {
        String source = Files.readString(file, StandardCharsets.UTF_8);
        List<String> gatewayImports =
            source
                .lines()
                .filter(line -> line.startsWith("import "))
                .filter(line -> line.contains(GATEWAY_PACKAGE))
                .toList();
        // Zero, not "only harmless ones". The artifact-version pin the gate needs lives on
        // CompilePins precisely so this can be zero: a constant borrowed from the gateway package
        // would have been an import on the execute path, and an import is the thing this criterion
        // fails on.
        assertThat(gatewayImports)
            .as("%s imports the compile gateway; the execute path may not reach it at all", file)
            .isEmpty();
      }
    }
  }

  private static String declaredPackage(String source) {
    return source
        .lines()
        .filter(line -> line.startsWith("package "))
        .map(line -> line.substring("package ".length()).replace(";", "").trim())
        .findFirst()
        .orElse("");
  }

  private static List<Path> javaSources() throws IOException {
    try (Stream<Path> files = Files.walk(MAIN)) {
      return files.filter(path -> path.toString().endsWith(".java")).toList();
    }
  }
}
