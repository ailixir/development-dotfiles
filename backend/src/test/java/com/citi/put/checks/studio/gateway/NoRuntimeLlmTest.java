package com.citi.put.checks.studio.gateway;

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
 * <p>An epic definition-of-done item for saved execution. Guided authoring has one explicitly named
 * transport dependency; it is not an implicit replay fallback. The structural half asserts that no
 * class outside {@code com.citi.put.checks.studio.gateway} references it except that one authoring
 * edge, so the execute, dispatch, readiness and snapshot paths cannot reach the gateway even
 * transitively.
 *
 * <p>It fails on the <em>import</em>, not on the call. A behavioural test can only prove that no
 * call happened on the paths it exercised; this one proves the edge does not exist, which is the
 * claim the epic actually makes. The behavioural half — a counting stub recording zero calls across
 * a full accept → readiness → dispatch cycle, including the AC-23 states — lives in {@code
 * DeReadyCarryForwardTest}.
 */
class NoRuntimeLlmTest {

  private static final String GATEWAY_PACKAGE = "com.citi.put.checks.studio.gateway";
  private static final Path MAIN = Path.of("src", "main", "java");

  @Test
  void noClassOutsideTheCompilePackageReferencesTheGateway() throws IOException {
    // The compile package is gone (ADR-SC-005); the gateway package itself is the only exemption.
    List<String> offenders = new ArrayList<>();

    for (Path file : javaSources()) {
      String source = Files.readString(file, StandardCharsets.UTF_8);
      if (!source.contains(GATEWAY_PACKAGE)) {
        continue;
      }
      String declaredPackage = declaredPackage(source);
      if (declaredPackage.equals(GATEWAY_PACKAGE)) {
        continue;
      }
      String caller = declaredPackage + "." + file.getFileName().toString().replace(".java", "");
      var references = gatewayReferences(source);
      if (!references.isEmpty()
          && references.stream().allMatch(type -> allowedGuidedEdge(caller, type))) {
        continue;
      }
      offenders.add(declaredPackage + " / " + file.getFileName());
    }

    assertThat(offenders)
        .as(
            "these classes can reach the model gateway. Learning happens at authoring time and"
                + " never on execute; an execute-path class that can import the gateway is one"
                + " refactor away from calling it")
        .isEmpty();
  }

  @Test
  void theScanIsNotVacuous() throws IOException {
    long gatewayClasses =
        javaSources().stream().filter(path -> path.toString().contains("studio/gateway/")).count();

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
        // Zero, not "only harmless ones": an import is the thing this criterion fails on.
        assertThat(gatewayImports)
            .as("%s imports the model gateway; the execute path may not reach it at all", file)
            .isEmpty();
      }
    }
  }

  private static final String GUIDED = "com.citi.put.checks.studio.guided.translation.";

  private static boolean allowedGuidedEdge(String caller, String target) {
    return java.util.Set.of(
                GUIDED + "GenAiGuidedLlmGatewayClient", GUIDED + "GuidedTranslationConfiguration")
            .contains(caller)
        && target.equals(GATEWAY_PACKAGE + ".GenAiGatewayTransport");
  }

  private static java.util.Set<String> gatewayReferences(String source) {
    var result = new java.util.HashSet<String>();
    var matcher =
        java.util.regex.Pattern.compile(
                java.util.regex.Pattern.quote(GATEWAY_PACKAGE) + "\\.([A-Z][A-Za-z0-9]*)")
            .matcher(source);
    while (matcher.find()) {
      result.add(GATEWAY_PACKAGE + "." + matcher.group(1));
    }
    return result;
  }

  @Test
  void guidedAllowanceIsExactAndBothProviderPathsRemainUnreachableFromOrdinaryExecution()
      throws IOException {
    var sources = new java.util.HashMap<String, String>();
    for (Path file : javaSources()) {
      String source = Files.readString(file, StandardCharsets.UTF_8);
      sources.put(
          declaredPackage(source) + "." + file.getFileName().toString().replace(".java", ""),
          source);
    }
    var graph = new java.util.HashMap<String, java.util.Set<String>>();
    sources.forEach(
        (name, source) -> {
          // Javadoc type links describe boundaries; they are not Java dependency edges.
          String code = source.replaceAll("(?s)/\\*.*?\\*/", "").replaceAll("(?m)^\\s*//.*$", "");
          var dependencies = new java.util.HashSet<String>();
          for (String candidate : sources.keySet()) {
            String candidatePackage = candidate.substring(0, candidate.lastIndexOf('.'));
            String simple = candidate.substring(candidate.lastIndexOf('.') + 1);
            boolean samePackage = candidatePackage.equals(name.substring(0, name.lastIndexOf('.')));
            if (!candidate.equals(name)
                && (code.contains(candidate)
                    || samePackage
                        && java.util.regex.Pattern.compile(
                                "\\b" + java.util.regex.Pattern.quote(simple) + "\\b")
                            .matcher(code)
                            .find())) {
              dependencies.add(candidate);
            }
          }
          graph.put(name, dependencies);
        });
    List<String> roots =
        sources.keySet().stream()
            .filter(
                name ->
                    name.contains(".studio.dispatch.")
                        || name.contains(".studio.readiness.")
                        || name.contains(".studio.execution."))
            .toList();
    assertThat(roots).hasSizeGreaterThan(10);
    for (String root : roots) {
      assertThat(reachesProvider(root, graph, new java.util.HashSet<>())).as(root).isFalse();
    }
  }

  private static boolean reachesProvider(
      String node, java.util.Map<String, java.util.Set<String>> graph, java.util.Set<String> seen) {
    if (!seen.add(node)) {
      return false;
    }
    // The direct import guard above stays stricter; this traversal fails on any provider caller.
    if (java.util.Set.of(
                GATEWAY_PACKAGE + ".GenAiGatewayTransport",
                GATEWAY_PACKAGE + ".StudioGatewayConfig")
            .contains(node)
        || java.util.Set.of(
                GUIDED + "GuidedLlmGatewayClient",
                GUIDED + "GenAiGuidedLlmGatewayClient",
                GUIDED + "GuidedTranslationService",
                GUIDED + "GuidedTranslationCoordinator")
            .contains(node)) {
      return true;
    }
    return graph.getOrDefault(node, java.util.Set.of()).stream()
        .anyMatch(next -> reachesProvider(next, graph, seen));
  }

  @Test
  void injectedDirectAndTransitiveProviderEdgesFailTheOracle() {
    String runtime = "com.citi.put.checks.studio.dispatch.Mutant";
    for (String target :
        List.of(
            GATEWAY_PACKAGE + ".GenAiGatewayTransport",
            GUIDED + "GuidedLlmGatewayClient",
            GUIDED + "GuidedTranslationCoordinator")) {
      assertThat(
              reachesProvider(
                  runtime,
                  java.util.Map.of(runtime, java.util.Set.of(target)),
                  new java.util.HashSet<>()))
          .isTrue();
      assertThat(
              reachesProvider(
                  runtime,
                  java.util.Map.of(
                      runtime, java.util.Set.of("helper"), "helper", java.util.Set.of(target)),
                  new java.util.HashSet<>()))
          .isTrue();
    }
    assertThat(
            allowedGuidedEdge(
                GUIDED + "GenAiGuidedLlmGatewayClient", GATEWAY_PACKAGE + ".GenAiGatewayTransport"))
        .isTrue();
    assertThat(
            allowedGuidedEdge(
                GUIDED + "GuidedTranslationService", GATEWAY_PACKAGE + ".GenAiGatewayTransport"))
        .isFalse();
    assertThat(
            allowedGuidedEdge(
                GUIDED + "GenAiGuidedLlmGatewayClient", GATEWAY_PACKAGE + ".StudioGatewayConfig"))
        .isFalse();
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
