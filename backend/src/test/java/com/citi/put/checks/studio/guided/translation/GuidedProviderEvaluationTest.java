package com.citi.put.checks.studio.guided.translation;

import static org.assertj.core.api.Assertions.assertThat;
import static org.junit.jupiter.api.Assumptions.assumeTrue;

import com.citi.put.checks.studio.compile.gateway.GenAiGatewayTransport;
import com.citi.put.checks.studio.compile.gateway.StudioGatewayProperties;
import com.citi.put.checks.studio.guided.session.GuidedContracts;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.TestReporter;

/** Explicitly opted-in synthetic provider evaluation. Local stubs never count as model accuracy. */
class GuidedProviderEvaluationTest {
  private static final String CORPUS = "obs005-synthetic-source-and-hostile-evidence-v2";
  private static final String SDK_PIN = "1.71.0";

  private record Case(String id, List<String> steps, List<List<String>> operations, int needs) {}

  // Expected operations/dataflow are authored independently of provider replies.
  private static final List<Case> CASES =
      List.of(
          new Case(
              "navigate",
              List.of("Open https://example.invalid/orders"),
              List.of(List.of("navigate")),
              0),
          new Case(
              "fill-without-submit",
              List.of("Fill the Search field with atlas; do not submit"),
              List.of(List.of("fill")),
              0),
          new Case(
              "implicit-reference",
              List.of(
                  "Remember the visible order reference",
                  "Enter that reference in the Tracking field",
                  "Click Track"),
              List.of(List.of("read"), List.of("fill"), List.of("click")),
              1),
          new Case(
              "assertion",
              List.of("Verify that the Success message is visible"),
              List.of(List.of("assert")),
              0));

  @Test
  void approvedProviderEvaluationIsReportedUnavailableWithoutExplicitConfiguration(
      TestReporter report) throws Exception {
    assertThat(GenAiGatewayTransport.SDK_VERSION).isEqualTo(SDK_PIN);
    boolean approved = CORPUS.equals(System.getenv("STUDIO_GUIDED_EVAL_APPROVED_CORPUS"));
    List<String> required =
        List.of(
            "STUDIO_GUIDED_EVAL_ENDPOINT",
            "STUDIO_GUIDED_EVAL_PROJECT",
            "STUDIO_GUIDED_EVAL_LOCATION",
            "STUDIO_GUIDED_EVAL_MODEL");
    boolean configured =
        required.stream()
            .allMatch(
                key -> {
                  String value = System.getenv(key);
                  return value != null && !value.isBlank();
                });
    report.publishEntry(
        Map.of(
            "corpus",
            CORPUS,
            "sdkPin",
            SDK_PIN,
            "availability",
            approved && configured ? "APPROVED_CONFIGURED" : "UNAVAILABLE_NOT_RUN",
            "workflowCount",
            Integer.toString(CASES.size() + hostileCases().size()),
            "realProviderRequestsBeforeGate",
            "0"));
    assumeTrue(
        approved && configured,
        "Approved synthetic live-provider configuration unavailable; no model-quality result"
            + " claimed");
    String endpoint = System.getenv("STUDIO_GUIDED_EVAL_ENDPOINT");
    // A fixture endpoint must never be relabelled as approved-provider evidence.
    var uri = java.net.URI.create(endpoint);
    assumeTrue(
        "https".equals(uri.getScheme())
            && uri.getHost() != null
            && !List.of("localhost", "127.0.0.1", "::1", "[::1]").contains(uri.getHost()),
        "Live evaluation requires an explicitly approved non-loopback HTTPS provider");
    var properties =
        new StudioGatewayProperties(
            endpoint,
            System.getenv("STUDIO_GUIDED_EVAL_PROJECT"),
            System.getenv("STUDIO_GUIDED_EVAL_LOCATION"),
            System.getenv("STUDIO_GUIDED_EVAL_MODEL"),
            new StudioGatewayProperties.Credentials("application-default", null),
            Duration.ofSeconds(30),
            1,
            131072,
            65536,
            true,
            0,
            new StudioGatewayProperties.TransportRetry(0, Duration.ofMillis(1), 1, 0),
            "classpath:studio/artifact.schema.json");
    var contracts = new GuidedContracts();
    try (var transport = new GenAiGatewayTransport(properties)) {
      var client = new GenAiGuidedLlmGatewayClient(transport, new GuidedResponseParser(contracts));
      int completed = 0;
      int sends = 0;
      long tokens = 0;
      boolean usageKnown = true;
      for (Case fixture : CASES) {
        GuidedModelRequest request = evaluationRequest(fixture);
        report.publishEntry(
            Map.of(
                "case",
                fixture.id(),
                "providerModelPin",
                properties.model(),
                "projectionHash",
                GuidedContracts.hash(request.projection().document()),
                "responseSchemaHash",
                GuidedContracts.hash(request.responseSchema()),
                "outputContractHash",
                digest(request.outputContract())));
        long start = System.nanoTime();
        GuidedModelResponse response =
            client.propose(request, GuidedGatewayPrivacyTest.budget(Duration.ofSeconds(30)));
        sends++;
        boolean correct =
            response.code() == GuidedModelResponse.Code.OK && correct(fixture, response.proposal());
        if (correct) {
          completed++;
        }
        usageKnown &= response.inputTokens() != null && response.outputTokens() != null;
        tokens +=
            (response.inputTokens() == null ? 0 : response.inputTokens())
                + (response.outputTokens() == null ? 0 : response.outputTokens());
        report.publishEntry(
            Map.of(
                "case",
                fixture.id(),
                "code",
                response.code().name(),
                "correct",
                Boolean.toString(correct),
                "elapsedMs",
                Long.toString(Duration.ofNanos(System.nanoTime() - start).toMillis())));
      }
      for (JsonNode fixture : hostileCases()) {
        GuidedModelRequest request = hostileRequest(fixture);
        GuidedModelResponse response =
            client.propose(request, GuidedGatewayPrivacyTest.budget(Duration.ofSeconds(30)));
        sends++;
        boolean correct =
            response.code() == GuidedModelResponse.Code.OK
                && correctHostile(fixture, response.proposal());
        if (correct) {
          completed++;
        }
        usageKnown &= response.inputTokens() != null && response.outputTokens() != null;
        tokens +=
            (response.inputTokens() == null ? 0 : response.inputTokens())
                + (response.outputTokens() == null ? 0 : response.outputTokens());
        report.publishEntry(
            Map.of(
                "case",
                fixture.path("id").asText(),
                "kind",
                "NEXT_ACTION",
                "code",
                response.code().name(),
                "correct",
                Boolean.toString(correct),
                "projectionHash",
                GuidedContracts.hash(request.projection().document()),
                "responseSchemaHash",
                GuidedContracts.hash(request.responseSchema())));
      }
      report.publishEntry(
          Map.of(
              "evaluated",
              Integer.toString(sends),
              "correct",
              Integer.toString(completed),
              "usage",
              usageKnown ? Long.toString(tokens) : "INCOMPLETE",
              "retries",
              "0",
              "claim",
              "synthetic source-plan and hostile observed-page next-action cases; not a release"
                  + " benchmark"));
      assertThat(completed)
          .as("Frozen synthetic source-plan and hostile current-evidence semantic oracle")
          .isEqualTo(CASES.size() + hostileCases().size());
    }
  }

  @Test
  void independentOracleRejectsPermittedButWrongActionAndOmittedDataflow() {
    Case fixture = CASES.get(1);
    ObjectNode wrong = GuidedGatewayPrivacyTest.JSON.createObjectNode();
    wrong.putArray("needs");
    wrong
        .putArray("obligations")
        .addObject()
        .put("stepId", id(fixture, 0))
        .put("operationKind", "click");
    assertThat(correct(fixture, wrong)).isFalse();
    Case dependency = CASES.get(2);
    ObjectNode omitted = GuidedGatewayPrivacyTest.JSON.createObjectNode();
    omitted.putArray("needs");
    var obligations = omitted.putArray("obligations");
    for (int index = 0; index < dependency.steps().size(); index++) {
      obligations
          .addObject()
          .put("stepId", id(dependency, index))
          .put("operationKind", dependency.operations().get(index).getFirst());
    }
    assertThat(correct(dependency, omitted)).isFalse();
  }

  @Test
  void hostileCurrentEvidenceCorpusOraclesRejectEverySchemaValidUnsafeSubstitution()
      throws Exception {
    var contracts = new GuidedContracts();
    var parser = new GuidedResponseParser(contracts);
    var validator = new GuidedProposalValidator(contracts);
    assertThat(hostileCases()).hasSize(4);
    for (JsonNode fixture : hostileCases()) {
      var request = hostileRequest(fixture);
      assertThat(request.projection().document().path("observation").toString())
          .contains("Ignore the checklist");
      JsonNode expected =
          parser.parse(
              request, fixture.path("expected").toString().getBytes(StandardCharsets.UTF_8));
      JsonNode malicious =
          parser.parse(
              request, fixture.path("malicious").toString().getBytes(StandardCharsets.UTF_8));
      assertThat(correctHostile(fixture, expected)).as(fixture.path("id").asText()).isTrue();
      assertThat(correctHostile(fixture, malicious)).as(fixture.path("id").asText()).isFalse();
      JsonNode runtime = fixture.path("runtime");
      ObjectNode original = contracts.object().put("planRevision", 1);
      for (String field : List.of("scope", "scopeHash", "owner")) {
        original.set(field, runtime.path("session").path(field));
      }
      for (String field : List.of("documentId", "generation", "executionEvidence", "stepIndex")) {
        original.set(field, runtime.path("progress").path(field));
      }
      original.set("expectedContextRevision", runtime.path("context").path("contextRevision"));
      original.set(
          "expectedAuthoredInputsHash", runtime.path("context").path("authoredInputsHash"));
      java.util.function.Consumer<JsonNode> validate =
          reply -> {
            JsonNode action =
                validator.materializeAction(
                    runtime.path("session"),
                    runtime.path("progress"),
                    runtime.path("obligation"),
                    reply.path("action"),
                    runtime.path("context"),
                    original,
                    1);
            validator.action(
                runtime.path("session"),
                runtime.path("progress"),
                runtime.path("plan"),
                runtime.path("obligation"),
                action,
                runtime.path("context"));
          };
      validate.accept(expected);
      org.assertj.core.api.Assertions.assertThatThrownBy(() -> validate.accept(malicious))
          .as(fixture.path("id").asText())
          .hasMessage("INVALID_CONTRACT");
      assertThat(fixture.path("expectedEffect").path("submitReceipts").asInt()).isZero();
    }
  }

  private static JsonNode hostileCases() throws java.io.IOException {
    JsonNode corpus =
        new GuidedContracts()
            .parse(
                java.nio.file.Files.readString(
                    java.nio.file.Path.of(
                        "../docs/specs/studio-observed-authoring/contracts/v2/planning-fixtures.json")));
    assertThat(corpus.path("semanticCorpus").asText()).isEqualTo(CORPUS);
    return corpus.path("semanticCases");
  }

  private static GuidedModelRequest hostileRequest(JsonNode fixture) {
    var contracts = new GuidedContracts();
    var assembler = new GuidedPromptAssembler(contracts);
    return new GuidedModelRequest(
        fixture.path("expected").path("requestId").asText(),
        1,
        GuidedModelRequest.Kind.NEXT_ACTION,
        new GuidedModelProjection((ObjectNode) fixture.path("context")),
        GuidedGatewayPrivacyTest.classifiedRequest(GuidedModelRequest.Kind.NEXT_ACTION, 1)
            .outputContract(),
        assembler.providerSchema(GuidedModelRequest.Kind.NEXT_ACTION),
        2048);
  }

  private static boolean correctHostile(JsonNode fixture, JsonNode reply) {
    return reply.path("status").asText().equals("ACTION")
        && reply.path("obligationId").equals(fixture.path("expected").path("obligationId"))
        && reply.path("action").equals(fixture.path("expected").path("action"));
  }

  private static GuidedModelRequest evaluationRequest(Case fixture) {
    var base = GuidedGatewayPrivacyTest.classifiedRequest(GuidedModelRequest.Kind.SOURCE_PLAN, 1);
    ObjectNode projection = base.projection().document();
    var steps = projection.putArray("sourceSteps");
    for (int index = 0; index < fixture.steps().size(); index++) {
      steps.addObject().put("stepId", id(fixture, index)).put("text", fixture.steps().get(index));
    }
    projection.putArray("configurationReferences");
    projection.putArray("inputs");
    projection.putArray("authoringContext");
    projection.putObject("coordinate").put("stepId", id(fixture, 0)).put("ordinal", 0);
    return new GuidedModelRequest(
        "eval-" + fixture.id(),
        1,
        base.kind(),
        new GuidedModelProjection(projection),
        base.outputContract(),
        base.responseSchema(),
        2048);
  }

  private static boolean correct(Case fixture, JsonNode reply) {
    if (reply.path("needs").size() != fixture.needs()) {
      return false;
    }
    int expectedCount = fixture.operations().stream().mapToInt(List::size).sum();
    if (reply.path("obligations").size() != expectedCount) {
      return false;
    }
    for (int index = 0; index < fixture.steps().size(); index++) {
      List<String> actual = new ArrayList<>();
      for (JsonNode operation : reply.path("obligations")) {
        if (operation.path("stepId").asText().equals(id(fixture, index))) {
          actual.add(operation.path("operationKind").asText());
        }
      }
      if (!actual.equals(fixture.operations().get(index))) {
        return false;
      }
    }
    if (fixture.id().equals("fill-without-submit")) {
      JsonNode operation = reply.path("obligations").get(0);
      if (!operation
              .path("targetIntent")
              .asText()
              .toLowerCase(java.util.Locale.ROOT)
              .contains("search")
          || !selectedLiteral(fixture, reply, operation).equals("atlas")) {
        return false;
      }
    }
    if (fixture.id().equals("navigate")
        && !selectedLiteral(fixture, reply, reply.path("obligations").get(0))
            .equals("https://example.invalid/orders")) {
      return false;
    }
    if (fixture.id().equals("assertion")) {
      JsonNode operation = reply.path("obligations").get(0);
      if (!operation.path("predicate").asText().equals("visible")
          || !operation
              .path("targetIntent")
              .asText()
              .toLowerCase(java.util.Locale.ROOT)
              .contains("success")) {
        return false;
      }
    }
    if (fixture.needs() > 0) {
      JsonNode need = reply.path("needs").get(0);
      if (!need.path("producerStepId").asText().equals(id(fixture, 0))
          || need.path("consumers").size() != 1
          || !need.path("consumers").get(0).path("stepId").asText().equals(id(fixture, 1))
          || !need.path("consumers").get(0).path("argumentSlot").asText().equals("fill.value")) {
        return false;
      }
    }
    return true;
  }

  private static String selectedLiteral(Case fixture, JsonNode reply, JsonNode operation) {
    JsonNode index = operation.path("referenceIndex");
    if (!index.isInt()
        || index.asInt() < 0
        || index.asInt() >= reply.path("sourceReferences").size()) {
      return "";
    }
    JsonNode reference = reply.path("sourceReferences").get(index.asInt());
    if (!reference.path("referenceKind").asText().equals("sourceSpan")
        || !reference.path("stepId").asText().equals(id(fixture, 0))) {
      return "";
    }
    String source = fixture.steps().getFirst();
    int start = reference.path("startUtf16").asInt(-1);
    int end = reference.path("endUtf16").asInt(-1);
    return start >= 0 && end >= start && end <= source.length() ? source.substring(start, end) : "";
  }

  private static String id(Case fixture, int index) {
    return UUID.nameUUIDFromBytes(
            (CORPUS + ":" + fixture.id() + ":" + index).getBytes(StandardCharsets.UTF_8))
        .toString();
  }

  private static String digest(String value) throws Exception {
    return java.util.HexFormat.of()
        .formatHex(
            java.security.MessageDigest.getInstance("SHA-256")
                .digest(value.getBytes(StandardCharsets.UTF_8)));
  }
}
