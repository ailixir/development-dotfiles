package com.citi.put.checks.studio.dispatch;

import com.citi.put.checks.studio.secrets.SecretValue;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * One conforming observed {@link RunJob}, built once (story 10.17 AC-2; ADR-SC-005).
 *
 * <p>Two tests need a job to hand the dispatch client and they must not build two, because two
 * fixtures of one closed body is how a producer and its assertions drift apart.
 *
 * <p>The wire document is the frozen {@code ObservedJob} example of {@code
 * contracts/v3/publication-fixtures.json}, read rather than restated, with a fresh execution
 * identity and the given nonsecret inputs appended. This builds the <em>input</em> to the producer
 * and deliberately not the body: the body is what {@code HttpRunnerDispatchClient} decides, and
 * {@code InternalBodyContractConformanceTest} judges that decision against the frozen document.
 */
final class RunJobFixtures {

  private static final ObjectMapper MAPPER = new ObjectMapper();
  private static final Path FIXTURES =
      Path.of("..", "docs", "specs", "studio-observed-authoring", "contracts", "v3")
          .resolve("publication-fixtures.json");

  /** The origin every fixture secret is bound to. */
  static final String SECRET_ORIGIN = "https://login.app.example";

  private RunJobFixtures() {}

  /** A job with one nonsecret input and one resolved secret. */
  static RunJob conformingJob() {
    return conformingJob(Map.of("REGION", "emea"), Map.of("LOGIN_PW", "fixture-password"));
  }

  static RunJob conformingJob(Map<String, String> inputs, Map<String, String> resolvedSecrets) {
    Map<String, List<String>> origins = new LinkedHashMap<>();
    resolvedSecrets.keySet().forEach(id -> origins.put(id, List.of(SECRET_ORIGIN)));
    return observedJob(inputs, resolvedSecrets, origins);
  }

  /** The same job with an explicit per-secret origin map, which may be empty. */
  static RunJob observedJob(
      Map<String, String> inputs,
      Map<String, String> resolvedSecrets,
      Map<String, List<String>> origins) {
    ObjectNode wire = example();
    String executionId = UUID.randomUUID().toString();
    String attemptId = UUID.randomUUID().toString();
    ObjectNode binding = (ObjectNode) wire.path("binding");
    binding.put("executionId", executionId).put("attemptId", attemptId);
    ((ObjectNode) binding.path("replayGrant"))
        .put("executionId", executionId)
        .put("attemptId", attemptId);
    ArrayNode wireInputs = (ArrayNode) wire.path("inputs");
    inputs.forEach((id, value) -> wireInputs.addObject().put("inputId", id).put("value", value));
    Map<String, SecretValue> secrets = new LinkedHashMap<>();
    resolvedSecrets.forEach((id, value) -> secrets.put(id, new SecretValue(value.toCharArray())));
    return RunJob.observed(wire, secrets, origins);
  }

  private static ObjectNode example() {
    try {
      return (ObjectNode)
          MAPPER
              .readTree(Files.readString(FIXTURES))
              .path("examples")
              .path("ObservedJob")
              .path("value")
              .deepCopy();
    } catch (IOException e) {
      throw new AssertionError("the frozen ObservedJob example cannot be read", e);
    }
  }
}
