package com.citi.put.checks.studio.guided.translation;

import static com.github.tomakehurst.wiremock.client.WireMock.aResponse;
import static com.github.tomakehurst.wiremock.client.WireMock.okJson;
import static com.github.tomakehurst.wiremock.client.WireMock.post;
import static com.github.tomakehurst.wiremock.client.WireMock.postRequestedFor;
import static com.github.tomakehurst.wiremock.client.WireMock.urlPathMatching;
import static org.assertj.core.api.Assertions.assertThat;
import static org.junit.jupiter.api.Assumptions.assumeTrue;

import com.citi.put.checks.studio.gateway.GenAiGatewayTransport;
import com.citi.put.checks.studio.gateway.StudioGatewayProperties;
import com.citi.put.checks.studio.guided.session.GuidedContracts;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.github.tomakehurst.wiremock.WireMockServer;
import com.github.tomakehurst.wiremock.core.WireMockConfiguration;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.TreeSet;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.TestReporter;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.EnumSource;

/**
 * STUDIO-OBS-009 AC-8: structured-output probe of the guided provider projections (SOURCE_PLAN,
 * NEXT_ACTION, VERIFY_STEP).
 *
 * <p>Local half (this class, runs everywhere): the three provider schemas are self-contained and
 * closed, their keyword census is published for the ED-01 owner, and the probe code path itself is
 * exercised against a stub gateway, including a provider rejection that must be reported as a named
 * blocker with no fallback and no second send.
 *
 * <p>External half (needs ED-01, the gateway owner, still TBD): {@link
 * #approvedGatewayProbeAcceptsEveryGuidedProjectionSchema}. Without ED-01 and an ADMITTED {@code
 * ac8-schema-probe} entry in the budget admission ledger it is skipped by name and publishes {@code
 * UNAVAILABLE_NOT_RUN}. It is never a pass, and nothing here sends a request to a real provider
 * unless both are present.
 */
class GuidedSchemaProbeIT {
  private static final ObjectMapper JSON = new ObjectMapper();
  private static final List<String> LOOPBACK = List.of("localhost", "127.0.0.1", "::1", "[::1]");
  private static final List<Map<String, String>> ENTRIES =
      java.util.Collections.synchronizedList(new ArrayList<>());

  /**
   * Keeps every published entry in a file too: the JUnit XML does not carry TestReporter entries.
   */
  private static void publish(TestReporter report, Map<String, String> entry) {
    ENTRIES.add(new java.util.TreeMap<>(entry));
    report.publishEntry(entry);
  }

  @AfterAll
  static void writeProbeCensus() throws Exception {
    Path out = Path.of("build", "guided-schema-probe", "probe-census.json");
    Files.createDirectories(out.getParent());
    Files.writeString(
        out, JSON.writerWithDefaultPrettyPrinter().writeValueAsString(ENTRIES) + "\n");
  }

  private final WireMockServer server =
      new WireMockServer(WireMockConfiguration.options().dynamicPort());

  GuidedSchemaProbeIT() {
    server.start();
  }

  @AfterEach
  void stop() {
    server.stop();
  }

  /**
   * One probe of one projection. The outcome names a blocker; it never retries with another schema.
   */
  record Outcome(
      GuidedModelRequest.Kind kind,
      String status,
      GuidedModelResponse.Code code,
      String schemaHash,
      int schemaBytes) {
    boolean accepted() {
      return status.equals("ACCEPTED");
    }
  }

  static Outcome probe(GenAiGuidedLlmGatewayClient client, GuidedModelRequest request) {
    String hash = GuidedContracts.hash(request.responseSchema());
    int bytes = request.responseSchema().toString().getBytes(StandardCharsets.UTF_8).length;
    GuidedModelResponse response =
        client.propose(request, GuidedGatewayPrivacyTest.budget(Duration.ofSeconds(30)));
    String status =
        response.code() == GuidedModelResponse.Code.OK
            ? "ACCEPTED"
            : "BLOCKED_" + response.code().name();
    return new Outcome(request.kind(), status, response.code(), hash, bytes);
  }

  private GenAiGuidedLlmGatewayClient stubClient(GenAiGatewayTransport transport) {
    return new GenAiGuidedLlmGatewayClient(
        transport, new GuidedResponseParser(new GuidedContracts()));
  }

  // ---------------------------------------------------------------------------------------------
  // Local half
  // ---------------------------------------------------------------------------------------------

  @ParameterizedTest
  @EnumSource(GuidedModelRequest.Kind.class)
  void providerSchemaIsSelfContainedClosedAndItsKeywordCensusIsPublished(
      GuidedModelRequest.Kind kind, TestReporter report) {
    JsonNode schema = new GuidedPromptAssembler(new GuidedContracts()).providerSchema(kind);
    String text = schema.toString();
    assertThat(text)
        .as("a provider schema is self-contained: no contract id, no $schema")
        .doesNotContain("https://checks.citi.example/contracts/", "\"$schema\"", "\"$id\"");
    List<String> openObjects = new ArrayList<>();
    List<String> externalRefs = new ArrayList<>();
    TreeSet<String> keywords = new TreeSet<>();
    int[] depth = {0};
    walk(schema, "#", 0, openObjects, externalRefs, keywords, depth);
    assertThat(externalRefs)
        .as("only local $ref targets (#/...) resolve at the provider")
        .isEmpty();
    assertThat(openObjects)
        .as("every object node with named properties is closed (additionalProperties:false)")
        .isEmpty();
    // A kind with several response shapes projects as a root anyOf; a single shape projects as one
    // object.
    List<JsonNode> roots = new ArrayList<>();
    if (schema.has("anyOf")) {
      schema.get("anyOf").forEach(roots::add);
      assertThat(roots).as("anyOf has more than one alternative").hasSizeGreaterThan(1);
    } else {
      roots.add(schema);
    }
    for (JsonNode root : roots) {
      boolean object = "object".equals(root.path("type").asText());
      boolean localRef = root.path("$ref").asText("").startsWith("#/");
      assertThat(object || localRef)
          .as("each root alternative is an object or a local $ref to one")
          .isTrue();
    }
    String rootForm = schema.has("anyOf") ? "anyOf(" + roots.size() + ")" : "object";
    publish(
        report,
        Map.of(
            "kind", kind.name(),
            "schemaSha256", GuidedContracts.hash(schema),
            "schemaBytes", Integer.toString(text.getBytes(StandardCharsets.UTF_8).length),
            "rootForm", rootForm,
            "maxDepth", Integer.toString(depth[0]),
            "keywordCensus", String.join(",", keywords),
            "claim",
                "offline structure only; whether the configured provider accepts it is the"
                    + " external half (ED-01)"));
  }

  private static void walk(
      JsonNode node,
      String pointer,
      int level,
      List<String> openObjects,
      List<String> externalRefs,
      TreeSet<String> keywords,
      int[] maxDepth) {
    maxDepth[0] = Math.max(maxDepth[0], level);
    if (node.isObject()) {
      node.fieldNames().forEachRemaining(keywords::add);
      JsonNode ref = node.get("$ref");
      if (ref != null && !ref.asText().startsWith("#")) {
        externalRefs.add(pointer + " -> " + ref.asText());
      }
      boolean named = node.has("properties") && node.get("properties").isObject();
      if (named
          && !(node.has("additionalProperties")
              && node.get("additionalProperties").isBoolean()
              && !node.get("additionalProperties").asBoolean())) {
        openObjects.add(pointer);
      }
      node.fields()
          .forEachRemaining(
              entry -> {
                // "properties" and "definitions" hold schemas keyed by name; the key is not a
                // keyword.
                if (entry.getKey().equals("properties")
                    || entry.getKey().equals("definitions")
                    || entry.getKey().equals("$defs")) {
                  entry
                      .getValue()
                      .fields()
                      .forEachRemaining(
                          inner ->
                              walk(
                                  inner.getValue(),
                                  pointer + "/" + entry.getKey() + "/" + inner.getKey(),
                                  level + 1,
                                  openObjects,
                                  externalRefs,
                                  keywords,
                                  maxDepth));
                } else {
                  walk(
                      entry.getValue(),
                      pointer + "/" + entry.getKey(),
                      level + 1,
                      openObjects,
                      externalRefs,
                      keywords,
                      maxDepth);
                }
              });
    } else if (node.isArray()) {
      for (int i = 0; i < node.size(); i++) {
        walk(
            node.get(i),
            pointer + "/" + i,
            level + 1,
            openObjects,
            externalRefs,
            keywords,
            maxDepth);
      }
    }
  }

  @Test
  void theClosedAndSelfContainedCheckCanFail() throws Exception {
    JsonNode open =
        JSON.readTree(
            "{\"type\":\"object\",\"properties\":{\"a\":{\"type\":\"object\","
                + "\"properties\":{\"b\":{\"type\":\"string\"}}},"
                + "\"c\":{\"$ref\":\"https://example.invalid/other.json\"}},\"additionalProperties\":false}");
    List<String> openObjects = new ArrayList<>();
    List<String> externalRefs = new ArrayList<>();
    TreeSet<String> keywords = new TreeSet<>();
    walk(open, "#", 0, openObjects, externalRefs, keywords, new int[] {0});
    assertThat(openObjects).containsExactly("#/properties/a");
    assertThat(externalRefs).hasSize(1);
    assertThat(keywords).contains("$ref", "properties", "additionalProperties");
  }

  @ParameterizedTest
  @EnumSource(GuidedModelRequest.Kind.class)
  void probeCodePathIsAcceptedByAStubGatewayForEveryProjection(
      GuidedModelRequest.Kind kind, TestReporter report) throws Exception {
    GuidedModelRequest request = GuidedGatewayPrivacyTest.classifiedRequest(kind, 1);
    server.stubFor(
        post(urlPathMatching(".*generateContent"))
            .willReturn(
                okJson(
                    GuidedGatewayPrivacyTest.provider(
                        GuidedGatewayPrivacyTest.answer(request).toString()))));
    try (var transport =
        new GenAiGatewayTransport(
            GuidedGatewayPrivacyTest.properties(server.baseUrl(), 65536, 65536))) {
      Outcome outcome = probe(stubClient(transport), request);
      assertThat(outcome.accepted()).as(outcome.status()).isTrue();
      assertThat(outcome.kind()).isEqualTo(kind);
      assertThat(outcome.schemaHash()).isEqualTo(GuidedContracts.hash(request.responseSchema()));
      publish(
          report,
          Map.of(
              "kind", kind.name(),
              "target", "STUB_GATEWAY",
              "status", outcome.status(),
              "schemaSha256", outcome.schemaHash(),
              "claim", "stub round trip of the probe code path; not provider acceptance"));
    }
    server.verify(1, postRequestedFor(urlPathMatching(".*generateContent")));
  }

  @Test
  void aProviderRejectionIsReportedAsANamedBlockerWithNoFallbackAndNoSecondSend(TestReporter report)
      throws Exception {
    server.stubFor(
        post(urlPathMatching(".*generateContent"))
            .willReturn(
                aResponse()
                    .withStatus(400)
                    .withHeader("Content-Type", "application/json")
                    .withBody(
                        "{\"error\":{\"code\":400,\"status\":\"INVALID_ARGUMENT\","
                            + "\"message\":\"response schema is not supported\"}}")));
    List<Outcome> outcomes = new ArrayList<>();
    try (var transport =
        new GenAiGatewayTransport(
            GuidedGatewayPrivacyTest.properties(server.baseUrl(), 65536, 65536))) {
      for (GuidedModelRequest.Kind kind : GuidedModelRequest.Kind.values()) {
        outcomes.add(
            probe(stubClient(transport), GuidedGatewayPrivacyTest.classifiedRequest(kind, 1)));
      }
    }
    assertThat(outcomes).hasSize(GuidedModelRequest.Kind.values().length);
    for (Outcome outcome : outcomes) {
      assertThat(outcome.accepted()).isFalse();
      assertThat(outcome.status()).startsWith("BLOCKED_");
      assertThat(outcome.code()).isNotEqualTo(GuidedModelResponse.Code.OK);
    }
    // One send per projection: the probe never retries with a reduced or rewritten schema.
    server.verify(outcomes.size(), postRequestedFor(urlPathMatching(".*generateContent")));
    publish(
        report,
        Map.of(
            "target",
            "STUB_GATEWAY_REJECTING",
            "statuses",
            String.join(",", outcomes.stream().map(Outcome::status).toList()),
            "sends",
            Integer.toString(server.getAllServeEvents().size()),
            "claim",
            "a rejection is a named blocker, not a fallback"));
  }

  @Test
  void theProbeIsRefusedUnlessTheAdmissionLedgerAdmitsThisPurpose() throws Exception {
    Path none = Path.of(System.getProperty("java.io.tmpdir"), "no-such-admission-ledger.json");
    assertThat(admissionStatus(none)).isEqualTo("ADMISSION_LEDGER_ABSENT");
    Path refused = Files.createTempFile("ledger-refused", ".json");
    Path admitted = Files.createTempFile("ledger-admitted", ".json");
    Path wrongPurpose = Files.createTempFile("ledger-purpose", ".json");
    try {
      Files.writeString(refused, ledger("ac8-schema-probe", "ADMISSION_REFUSED_PRICE_UNKNOWN"));
      Files.writeString(admitted, ledger("ac8-schema-probe", "ADMITTED"));
      Files.writeString(wrongPurpose, ledger("ac7-benchmark", "ADMITTED"));
      assertThat(admissionStatus(refused)).isEqualTo("ADMISSION_REFUSED_PRICE_UNKNOWN");
      assertThat(admissionStatus(admitted)).isEqualTo("ADMITTED");
      assertThat(admissionStatus(wrongPurpose)).isEqualTo("ADMISSION_MISSING");
    } finally {
      Files.deleteIfExists(refused);
      Files.deleteIfExists(admitted);
      Files.deleteIfExists(wrongPurpose);
    }
  }

  private static String ledger(String purpose, String status) throws Exception {
    var root = JSON.createObjectNode().put("schemaVersion", 1);
    root.putArray("admissions").addObject().put("purpose", purpose).put("status", status);
    return JSON.writeValueAsString(root);
  }

  /**
   * Status of the latest ledger entry for the ac8-schema-probe purpose, as the probe reads it.
   * Entries for other purposes interleave in one ledger and never open (or close) this probe.
   */
  static String admissionStatus(Path ledger) throws Exception {
    if (ledger == null || !Files.isRegularFile(ledger)) {
      return "ADMISSION_LEDGER_ABSENT";
    }
    JsonNode latest = null;
    for (JsonNode entry : JSON.readTree(Files.readString(ledger)).path("admissions")) {
      if ("ac8-schema-probe".equals(entry.path("purpose").asText())) {
        latest = entry;
      }
    }
    return latest == null ? "ADMISSION_MISSING" : latest.path("status").asText("ADMISSION_MISSING");
  }

  // ---------------------------------------------------------------------------------------------
  // External half: needs ED-01 and an admitted ledger entry. Skipped by name otherwise.
  // ---------------------------------------------------------------------------------------------

  @Test
  void approvedGatewayProbeAcceptsEveryGuidedProjectionSchema(TestReporter report)
      throws Exception {
    List<String> required =
        List.of(
            "STUDIO_GUIDED_EVAL_ENDPOINT",
            "STUDIO_GUIDED_EVAL_PROJECT",
            "STUDIO_GUIDED_EVAL_LOCATION",
            "STUDIO_GUIDED_EVAL_MODEL");
    boolean ed01 =
        "ED-01-APPROVED".equals(System.getenv("STUDIO_GUIDED_PROBE_APPROVED"))
            && required.stream()
                .allMatch(
                    key -> {
                      String value = System.getenv(key);
                      return value != null && !value.isBlank();
                    });
    String ledgerPath = System.getenv("STUDIO_GUIDED_PROBE_ADMISSION_LEDGER");
    String admission = admissionStatus(ledgerPath == null ? null : Path.of(ledgerPath));
    boolean admitted = admission.equals("ADMITTED");
    publish(
        report,
        Map.of(
            "availability",
            ed01 && admitted ? "APPROVED_CONFIGURED" : "UNAVAILABLE_NOT_RUN",
            "ed01Gateway",
            ed01 ? "CONFIGURED" : "ABSENT (owner TBD, GA plan D-3)",
            "admission",
            admission,
            "realProviderRequestsBeforeGate",
            "0"));
    assumeTrue(
        ed01 && admitted,
        "UNAVAILABLE_NOT_RUN: ED-01 gateway and an ADMITTED ac8-schema-probe ledger entry are"
            + " required; no provider-acceptance result is claimed");
    var uri = java.net.URI.create(System.getenv("STUDIO_GUIDED_EVAL_ENDPOINT"));
    assumeTrue(
        "https".equals(uri.getScheme())
            && uri.getHost() != null
            && !LOOPBACK.contains(uri.getHost()),
        "The probe requires an approved non-loopback HTTPS gateway; a fixture is never relabelled as one");
    var properties =
        new StudioGatewayProperties(
            System.getenv("STUDIO_GUIDED_EVAL_ENDPOINT"),
            System.getenv("STUDIO_GUIDED_EVAL_PROJECT"),
            System.getenv("STUDIO_GUIDED_EVAL_LOCATION"),
            System.getenv("STUDIO_GUIDED_EVAL_MODEL"),
            new StudioGatewayProperties.Credentials("application-default", null),
            Duration.ofSeconds(30),
            1,
            131072,
            65536,
            StudioGatewayProperties.DEFAULT_MAX_OUTPUT_TOKENS,
            StudioGatewayProperties.ThinkingLevel.LOW,
            StudioGatewayProperties.ProviderFeatures.ALL);
    List<Outcome> outcomes = new ArrayList<>();
    try (var transport = new GenAiGatewayTransport(properties)) {
      var client = stubClient(transport);
      for (GuidedModelRequest.Kind kind : GuidedModelRequest.Kind.values()) {
        Outcome outcome = probe(client, GuidedGatewayPrivacyTest.classifiedRequest(kind, 1));
        outcomes.add(outcome);
        publish(
            report,
            Map.of(
                "kind", kind.name(),
                "target", "ED-01 GATEWAY",
                "status", outcome.status(),
                "schemaSha256", outcome.schemaHash(),
                "providerModelPin", properties.model()));
      }
    }
    assertThat(outcomes.stream().filter(o -> !o.accepted()).map(o -> o.kind() + ":" + o.status()))
        .as("a rejected projection is a named blocker for AC-7, not a fallback")
        .isEmpty();
  }
}
