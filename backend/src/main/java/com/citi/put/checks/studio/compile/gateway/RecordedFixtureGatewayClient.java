package com.citi.put.checks.studio.compile.gateway;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;

/**
 * Answers a compile request from a recorded corpus instead of a model.
 *
 * <p>Selected by {@code studio.compile.gateway.provider=recorded-fixture} for local development and
 * CI only; {@link StudioGatewayConfig}'s readiness guard refuses it in a deployed profile. It opens
 * no socket and reaches no model, and it answers <em>only</em> sources that were recorded verbatim.
 * An unrecorded source is reported as {@link GatewayErrorCode#GATEWAY_UNAVAILABLE} — translation is
 * honestly unavailable for that input — rather than as an author mistake or a model refusal, so no
 * run can be presented as evidence that free-form English translates.
 *
 * <p>Provenance records the model as {@code recorded-fixture} so an audit of a local run can never
 * be read as a Vertex call.
 */
public class RecordedFixtureGatewayClient implements LlmGatewayClient {

  /** The provenance model identifier written for every recorded answer. */
  public static final String MODEL = "recorded-fixture";

  private static final ObjectMapper MAPPER = new ObjectMapper();

  private final RecordedFixtureCorpus corpus;
  private final GatewayAuditLogger auditLogger;

  public RecordedFixtureGatewayClient(
      RecordedFixtureCorpus corpus, GatewayAuditLogger auditLogger) {
    this.corpus = corpus;
    this.auditLogger = auditLogger;
  }

  @Override
  public CompileResponse propose(CompileRequest request) {
    long startedAt = System.nanoTime();
    int inputBytes = inputBytes(request);
    GatewayProvenance provenance =
        new GatewayProvenance(MODEL, null, request.promptVersion(), "none", true, 0);

    Optional<List<String>> source = unfence(request.fencedSourceLines());
    if (source.isEmpty()) {
      return refuse(
          request, provenance, "fenced source could not be read back", inputBytes, startedAt);
    }
    Optional<String> artifact = corpus.artifactFor(source.get());
    if (artifact.isEmpty()) {
      return refuse(
          request, provenance, "no recorded fixture for this source", inputBytes, startedAt);
    }

    String artifactJson = artifact.get();
    CompileResponse response =
        CompileResponse.ok(
            artifactJson,
            provenance,
            0,
            elapsedMs(startedAt),
            inputBytes,
            artifactJson.getBytes(StandardCharsets.UTF_8).length);
    auditLogger.audit(request, MODEL, response);
    return response;
  }

  private CompileResponse refuse(
      CompileRequest request,
      GatewayProvenance provenance,
      String reason,
      int inputBytes,
      long startedAt) {
    CompileResponse response =
        CompileResponse.failure(
            GatewayOutcome.DISABLED,
            GatewayErrorCode.GATEWAY_UNAVAILABLE,
            reason,
            provenance,
            0,
            elapsedMs(startedAt),
            inputBytes,
            0);
    auditLogger.audit(request, MODEL, response);
    return response;
  }

  /**
   * Reads the author's step text back out of the fenced lines.
   *
   * <p>Both fencing forms are {@code index + ": " + <json>}: a JSON string literal on the v1 path,
   * and an envelope carrying {@code source} plus untrusted context on the v2 path. Anything else is
   * refused rather than guessed at.
   *
   * @param fencedSourceLines the request's fenced lines
   * @return the ordered step text, or empty when a line does not have either shape
   */
  private static Optional<List<String>> unfence(List<String> fencedSourceLines) {
    List<String> source = new ArrayList<>(fencedSourceLines.size());
    for (String fenced : fencedSourceLines) {
      int separator = fenced.indexOf(": ");
      if (separator < 1) {
        return Optional.empty();
      }
      String payload = fenced.substring(separator + 2);
      JsonNode node;
      try {
        node = MAPPER.readTree(payload);
      } catch (JsonProcessingException e) {
        return Optional.empty();
      }
      if (node.isTextual()) {
        source.add(node.asText());
      } else if (node.isObject() && node.path("source").isTextual()) {
        source.add(node.path("source").asText());
      } else {
        return Optional.empty();
      }
    }
    return Optional.of(source);
  }

  private static int inputBytes(CompileRequest request) {
    int bytes = 0;
    for (String line : request.fencedSourceLines()) {
      bytes += line.getBytes(StandardCharsets.UTF_8).length;
    }
    return bytes;
  }

  private static long elapsedMs(long startedAt) {
    return (System.nanoTime() - startedAt) / 1_000_000L;
  }
}
