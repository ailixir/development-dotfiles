package com.citi.put.checks.studio.dispatch;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * One conforming {@link RunJob}, built once (story 10.17 AC-2).
 *
 * <p>Two tests need a job to hand the dispatch client and they must not build two, because two
 * fixtures of one closed body is how a producer and its assertions drift apart — which is the class
 * of defect this story exists to close, not to repeat in the test tree.
 *
 * <p>This builds the <em>input</em> to the producer. It deliberately does <b>not</b> build the
 * body: the body is what {@code HttpRunnerDispatchClient} decides, and the whole point of {@code
 * InternalBodyContractConformanceTest} is to judge that decision against the frozen document rather
 * than against a second copy of it made here.
 */
final class RunJobFixtures {

  private static final ObjectMapper MAPPER = new ObjectMapper();

  private RunJobFixtures() {}

  /** A job with both kinds of reference declared and both resolved. */
  static RunJob conformingJob() {
    return conformingJob(Map.of("REGION", "emea"), Map.of("LOGIN_PW", "fixture-password"));
  }

  static RunJob conformingJob(
      Map<String, String> resolvedVars, Map<String, String> resolvedSecrets) {
    UUID executionId = UUID.randomUUID();
    UUID attemptId = UUID.randomUUID();
    UUID testId = UUID.randomUUID();
    String csi = "60406";
    try {
      return new RunJob(
          executionId,
          attemptId,
          UUID.randomUUID(),
          "sha256:0f9d2c1b",
          MAPPER.readTree("{\"steps\":[]}"),
          List.of("Go to the home page"),
          MAPPER.readTree(
              "{\"browser\":\"chromium\",\"viewport\":{\"width\":1280,\"height\":720},"
                  + "\"timeoutSeconds\":30,\"waitStrategy\":\"load\"}"),
          csi,
          new ReferenceDeclarations(
              List.copyOf(resolvedVars.keySet()), List.copyOf(resolvedSecrets.keySet())),
          resolvedVars,
          resolvedSecrets,
          // §8.5's admitted-start value and §5.2's total browser runtime. The total is deliberately
          // not the configuration's timeoutSeconds x 1000: the two are different budgets.
          new RunJob.JobDeadlines(30_000L, 120_000L),
          RunJob.videoKeyFor(csi, testId, executionId, attemptId),
          RunJob.manifestKeyFor(csi, testId, executionId, attemptId),
          null,
          // Every resolved secret bound to one origin, so the conformance test validates a
          // populated secretOrigins against the frozen schema rather than an empty map.
          resolvedSecrets.keySet().stream()
              .collect(
                  java.util.stream.Collectors.toMap(
                      id -> id, id -> List.of("https://login.app.example"))));
    } catch (com.fasterxml.jackson.core.JsonProcessingException e) {
      throw new AssertionError("fixture documents are not JSON", e);
    }
  }
}
