package com.citi.put.checks.studio.dispatch;

import static com.github.tomakehurst.wiremock.client.WireMock.aResponse;
import static com.github.tomakehurst.wiremock.client.WireMock.post;
import static com.github.tomakehurst.wiremock.client.WireMock.postRequestedFor;
import static com.github.tomakehurst.wiremock.client.WireMock.urlPathEqualTo;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.citi.put.checks.studio.StudioExecutionProperties;
import com.citi.put.checks.studio.guided.session.GuidedContracts;
import com.citi.put.checks.studio.guided.session.GuidedSessionException;
import com.citi.put.checks.studio.internal.StrictInternalBodyReader;
import com.citi.put.checks.studio.internal.dto.ExecutionControl;
import com.citi.put.checks.studio.internal.dto.RunOutcome;
import com.citi.put.checks.studio.internal.dto.RunnerReport;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.github.tomakehurst.wiremock.WireMockServer;
import com.github.tomakehurst.wiremock.core.WireMockConfiguration;
import com.networknt.schema.JsonSchema;
import com.networknt.schema.JsonSchemaFactory;
import com.networknt.schema.SpecVersion;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Duration;
import java.util.List;
import java.util.Map;
import java.util.stream.Stream;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.MethodSource;
import org.yaml.snakeyaml.Yaml;

/**
 * Story 10.17 AC-2, {@code DEF-01} — <b>for every internal body this API produces, the serialized
 * bytes validate against the schema the frozen document declares for it.</b>
 *
 * <p>This is deliberately <em>not</em> a check on one method. It is the general control this epic
 * has now needed five times, and the four divergences before this one share one cause: the runner
 * validates against the document, the backend validates against its own fixtures, and nothing
 * compares the two. A test that enumerated {@code RunJob}'s fourteen field names here would be a
 * fifteenth hand-maintained copy of the same vocabulary (ADR-002 §15.6) and would go green the
 * moment somebody edited the copy.
 *
 * <p>Three properties make the assertion mean something, and each of them was chosen against a
 * specific way this test could have been written to pass:
 *
 * <ol>
 *   <li><b>The bytes are captured from the transport, not rebuilt.</b> {@link #captureRunJobBody()}
 *       stands up a real socket, hands the real {@link HttpRunnerDispatchClient} a real {@link
 *       RunJob}, and reads back what arrived. A test that serialized {@code RunJob.java} with an
 *       {@link ObjectMapper} would assert the record's shape — which is {@code
 *       StudioContractTest}'s job (and story 10.14 AC-24's) and is <em>blind to this defect</em>,
 *       because the record could match the schema component-for-component while the producer still
 *       writes a different map. That is exactly the state this branch is in. The two assertions are
 *       paired; neither substitutes for the other.
 *   <li><b>The schema is read from the frozen document at its path</b>, not from a Java constant
 *       and not from a copy. Renaming a property in {@code openapi.yaml} must fail here.
 *   <li><b>The experiment is shown to be capable of failing.</b> {@link
 *       #theValidatorWouldNoticeAForbiddenKeyAndAMissingRequiredField()} drives the same loader and
 *       the same validator with a body that is wrong in both directions. Without it, a schema that
 *       silently failed to load would make every producer "conform".
 * </ol>
 *
 * <p>Adding a producer to {@link #internalBodies()} is how this grows. Since ADR-SC-005 the one run
 * body is the observed job of {@code POST /v2/runs}, whose frozen schema the document references as
 * {@code contracts/v3/replay-job.schema.json}; it is judged by the backend's own validator of that
 * same file. The artifact-1 {@code RunJob} and the compile-only {@code ValidateRequest} producers
 * are gone with their routes.
 */
class InternalBodyContractConformanceTest {

  private static final Path CONTRACT = Path.of("..", "docs", "specs", "studio", "openapi.yaml");

  private static final ObjectMapper MAPPER = new ObjectMapper();

  /** The backend's validator of the frozen observed contracts, read from the same v3 files. */
  private static final GuidedContracts CONTRACTS = new GuidedContracts();

  /** The schema {@code POST /v2/runs} declares for its request body. */
  private static final String OBSERVED_JOB = "v3/replay-job";

  private static JsonNode contractRoot;
  private static WireMockServer wireMock;

  /**
   * One internal body this API produces.
   *
   * @param schemaName the component in {@code openapi.yaml} that declares it
   * @param serializedBytes what the producer actually handed its transport
   */
  private record InternalBody(String schemaName, String serializedBytes) {
    @Override
    public String toString() {
      return schemaName;
    }
  }

  @BeforeAll
  @SuppressWarnings("unchecked")
  static void loadContractAndStartServer() throws IOException {
    contractRoot =
        MAPPER.valueToTree(
            (Map<String, Object>)
                new Yaml().load(Files.readString(CONTRACT, StandardCharsets.UTF_8)));
    wireMock = new WireMockServer(WireMockConfiguration.options().dynamicPort());
    wireMock.start();
  }

  @AfterAll
  static void stopServer() {
    if (wireMock != null) {
      wireMock.stop();
    }
  }

  /** The registry. Every internal body with a producer belongs here. */
  static Stream<InternalBody> internalBodies() {
    return Stream.of(new InternalBody(OBSERVED_JOB, captureRunJobBody()));
  }

  @ParameterizedTest(name = "{0}")
  @MethodSource("internalBodies")
  void theSerializedBytesValidateAgainstTheSchemaTheFrozenDocumentDeclares(InternalBody body) {
    org.assertj.core.api.Assertions.assertThatCode(
            () -> CONTRACTS.validate(body.schemaName(), read(body)))
        .as(
            "the bytes %s hands its transport do not conform to the frozen %s schema;"
                + " the contract is the authority and the producer is what changes",
            body.schemaName(), body.schemaName())
        .doesNotThrowAnyException();
  }

  /**
   * The non-vacuity control (Anti-vacuous test requirements, row 2). If the schema loader silently
   * produced an empty schema, every producer above would "conform" and nobody would know. This
   * drives the same loader and the same validator with a body wrong in both of the ways the closed
   * envelope exists to catch.
   */
  @Test
  void theValidatorWouldNoticeAForbiddenKeyAndAMissingRequiredField() {
    JsonNode valid = read(new InternalBody(OBSERVED_JOB, captureRunJobBody()));
    ObjectNode forbidden = valid.deepCopy();
    forbidden.put("callbackBaseUrl", "http://put-checks-api:8080");
    ObjectNode missing = valid.deepCopy();
    missing.remove("secrets");

    assertThatThrownBy(() -> CONTRACTS.validate(OBSERVED_JOB, forbidden))
        .as("a forbidden key must be reported by the same machinery the producers are judged by")
        .isInstanceOf(GuidedSessionException.class);
    assertThatThrownBy(() -> CONTRACTS.validate(OBSERVED_JOB, missing))
        .as("a missing required field must be reported by the same machinery")
        .isInstanceOf(GuidedSessionException.class);
  }

  @Test
  void secretUsageAndRevocationParseThroughTheStrictBoundary() throws IOException {
    StrictInternalBodyReader reader =
        new StrictInternalBodyReader(new ObjectMapper().findAndRegisterModules());
    byte[] control =
        ("{\"executionId\":\"11111111-1111-4111-8111-111111111111\","
                + "\"cancelRequested\":false,\"revoked\":true}")
            .getBytes(StandardCharsets.UTF_8);
    assertThat(schemaFor("ExecutionControl").validate(MAPPER.readTree(control))).isEmpty();
    assertThat(reader.read(control, ExecutionControl.class).revoked()).isTrue();

    byte[] report =
        "{\"secretUse\":{\"PASS\":\"USED\",\"UNREACHED\":\"NOT_USED\",\"DENIED\":\"REFUSED\"}}"
            .getBytes(StandardCharsets.UTF_8);
    assertThat(reader.read(report, RunnerReport.class).secretUse())
        .containsExactlyInAnyOrderEntriesOf(
            Map.of("PASS", "USED", "UNREACHED", "NOT_USED", "DENIED", "REFUSED"));
    assertThat(reader.read("{}".getBytes(StandardCharsets.UTF_8), RunnerReport.class).secretUse())
        .isEmpty();
    assertThat(
            reader
                .read("{\"secretUse\":{}}".getBytes(StandardCharsets.UTF_8), RunnerReport.class)
                .secretUse())
        .isEmpty();
    assertThatThrownBy(
            () ->
                reader.read(
                    "{\"secretUse\":null}".getBytes(StandardCharsets.UTF_8), RunnerReport.class))
        .isInstanceOf(com.citi.put.checks.studio.internal.InternalCallbackException.class);
    assertThatThrownBy(
            () ->
                reader.read(
                    "{\"secretUse\":{\"PASS\":\"CANARY_VALUE\"}}".getBytes(StandardCharsets.UTF_8),
                    RunnerReport.class))
        .isInstanceOf(com.citi.put.checks.studio.internal.InternalCallbackException.class);
    assertThatThrownBy(
            () ->
                reader.read(
                    "{\"secretUse\":{},\"resolvedSecretValue\":\"CANARY_VALUE\"}"
                        .getBytes(StandardCharsets.UTF_8),
                    RunnerReport.class))
        .isInstanceOf(com.citi.put.checks.studio.internal.InternalCallbackException.class);
  }

  @Test
  void loginRequiredIsAFailedOutcomeWithClosedDetail() throws IOException {
    StrictInternalBodyReader reader =
        new StrictInternalBodyReader(new ObjectMapper().findAndRegisterModules());
    byte[] bytes =
        ("{\"result\":\"FAILED\",\"errorCode\":\"LOGIN_REQUIRED\",\"errorMessage\":null,"
                + "\"detail\":{\"stepId\":\"protected-step\",\"loginStepsPresent\":true}}")
            .getBytes(StandardCharsets.UTF_8);
    JsonNode valid = MAPPER.readTree(bytes);
    assertThat(schemaFor("RunOutcome").validate(valid)).isEmpty();
    assertThat(reader.read(bytes, RunOutcome.class).detail().loginStepsPresent()).isTrue();

    String json = new String(bytes, StandardCharsets.UTF_8);
    assertThat(
            reader
                .read(
                    json.replace("true", "false").getBytes(StandardCharsets.UTF_8),
                    RunOutcome.class)
                .detail()
                .loginStepsPresent())
        .isFalse();
    for (String invalid :
        List.of(
            json.replace("FAILED", "PASSED"),
            json.replace("LOGIN_REQUIRED", "STEP_FAILED"),
            "{\"result\":\"FAILED\",\"errorCode\":\"LOGIN_REQUIRED\",\"errorMessage\":null}",
            json.replace("true", "null"),
            json.replace("true", "\"true\""),
            json.replace("true", "1"),
            json.replace("\"protected-step\"", "42"),
            json.replace("\"protected-step\"", "true"),
            json.replace(",\"loginStepsPresent\":true", ""),
            json.replace("\"stepId\":\"protected-step\",", ""))) {
      assertThatThrownBy(
              () -> reader.read(invalid.getBytes(StandardCharsets.UTF_8), RunOutcome.class))
          .isInstanceOf(com.citi.put.checks.studio.internal.InternalCallbackException.class);
    }

    ObjectNode wrong = valid.deepCopy();
    wrong.put("result", "PASSED");
    assertThat(schemaFor("RunOutcome").validate(wrong)).isNotEmpty();
    wrong = valid.deepCopy();
    wrong.remove("detail");
    assertThat(schemaFor("RunOutcome").validate(wrong)).isNotEmpty();
    wrong = valid.deepCopy();
    ((ObjectNode) wrong.path("detail")).put("value", "CANARY_VALUE");
    assertThat(schemaFor("RunOutcome").validate(wrong)).isNotEmpty();
    byte[] forbidden = MAPPER.writeValueAsBytes(wrong);
    assertThatThrownBy(() -> reader.read(forbidden, RunOutcome.class))
        .isInstanceOf(com.citi.put.checks.studio.internal.InternalCallbackException.class);
  }

  /**
   * Captures the body the dispatch client actually puts on the wire.
   *
   * <p>A real socket, the real client and the real {@code send} path. Nothing here re-derives the
   * body, which is the point: the defect this test exists to catch lives between the record and the
   * map the producer builds from it.
   */
  private static String captureRunJobBody() {
    wireMock.resetAll();
    wireMock.stubFor(post(urlPathEqualTo("/v2/runs")).willReturn(aResponse().withStatus(202)));

    new HttpRunnerDispatchClient(
            new ObjectMapper(),
            new StudioExecutionProperties(
                true, null, null, null, Duration.ofSeconds(5), null, null, null, null, null, null),
            new StudioRunnerProperties(
                "http://localhost:" + wireMock.port(), "test-runner-token", Duration.ofSeconds(2)))
        .send(RunJobFixtures.conformingJob());

    var requests = wireMock.findAll(postRequestedFor(urlPathEqualTo("/v2/runs")));
    assertThat(requests)
        .as("no request reached the socket, so there are no producer bytes to judge")
        .hasSize(1);
    return requests.get(0).getBodyAsString();
  }

  private static JsonNode read(InternalBody body) {
    try {
      return MAPPER.readTree(body.serializedBytes());
    } catch (IOException e) {
      throw new AssertionError(
          "the bytes " + body.schemaName() + " produced are not JSON at all", e);
    }
  }

  /**
   * The component's schema, resolved against the frozen document.
   *
   * <p>The wrapper carries the document's whole {@code components} object so that every nested
   * {@code $ref} — {@code ReferenceDeclarations}, {@code JobDeadlines}, {@code TestConfiguration},
   * {@code Viewport} — resolves inside the same node. Nothing is copied or inlined by hand.
   */
  private static JsonSchema schemaFor(String schemaName) {
    JsonNode declared = contractRoot.path("components").path("schemas").path(schemaName);
    assertThat(declared.isObject())
        .as(
            "%s declares no %s schema — the pointer, not the producer, is what is wrong",
            CONTRACT, schemaName)
        .isTrue();

    ObjectNode wrapper = MAPPER.createObjectNode();
    wrapper.put("$ref", "#/components/schemas/" + schemaName);
    wrapper.set("components", contractRoot.path("components"));
    return JsonSchemaFactory.getInstance(SpecVersion.VersionFlag.V202012).getSchema(wrapper);
  }
}
