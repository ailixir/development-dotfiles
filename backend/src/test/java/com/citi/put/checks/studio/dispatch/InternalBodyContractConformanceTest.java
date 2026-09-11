package com.citi.put.checks.studio.dispatch;

import static com.github.tomakehurst.wiremock.client.WireMock.aResponse;
import static com.github.tomakehurst.wiremock.client.WireMock.post;
import static com.github.tomakehurst.wiremock.client.WireMock.postRequestedFor;
import static com.github.tomakehurst.wiremock.client.WireMock.urlPathEqualTo;
import static org.assertj.core.api.Assertions.assertThat;

import com.citi.put.checks.studio.StudioExecutionProperties;
import com.citi.put.checks.studio.compile.validator.RunnerValidationClient;
import com.citi.put.checks.studio.compile.validator.StudioRunnerProperties;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.github.tomakehurst.wiremock.WireMockServer;
import com.github.tomakehurst.wiremock.core.WireMockConfiguration;
import com.networknt.schema.JsonSchema;
import com.networknt.schema.JsonSchemaFactory;
import com.networknt.schema.SpecVersion;
import com.networknt.schema.ValidationMessage;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Duration;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;
import java.util.stream.Stream;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.MethodSource;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.web.client.RestClient;
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
 * <p>Adding a producer to {@link #internalBodies()} is how this grows. {@code RunJob} was the first
 * member because it was the one that was red; {@code ValidateRequest} is the second, added on QA's
 * LOW-3 — the registry was <em>general in shape and singular in fact</em>, and a loop over one
 * member is a claim about one member however it is written. Both bodies are captured off a real
 * socket from the real client.
 */
class InternalBodyContractConformanceTest {

  private static final Path CONTRACT = Path.of("..", "docs", "specs", "studio", "openapi.yaml");

  private static final ObjectMapper MAPPER = new ObjectMapper();

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
    return Stream.of(
        new InternalBody("RunJob", captureRunJobBody()),
        new InternalBody("ValidateRequest", captureValidateRequestBody()));
  }

  @ParameterizedTest(name = "{0}")
  @MethodSource("internalBodies")
  void theSerializedBytesValidateAgainstTheSchemaTheFrozenDocumentDeclares(InternalBody body) {
    Set<ValidationMessage> problems = schemaFor(body.schemaName()).validate(read(body));

    assertThat(problems)
        .as(
            "the bytes %s hands its transport do not conform to the frozen %s schema in %s;"
                + " the contract is the authority and the producer is what changes",
            body.schemaName(), body.schemaName(), CONTRACT)
        .isEmpty();
  }

  /**
   * The non-vacuity control (Anti-vacuous test requirements, row 2). If the schema loader silently
   * produced an empty schema, every producer above would "conform" and nobody would know. This
   * drives the same loader and the same validator with a body wrong in both of the ways the closed
   * envelope exists to catch.
   */
  @Test
  void theValidatorWouldNoticeAForbiddenKeyAndAMissingRequiredField() {
    ObjectNode wrong = MAPPER.createObjectNode();
    wrong.put("executionId", UUID.randomUUID().toString());
    wrong.put("callbackBaseUrl", "http://put-checks-api:8080");

    Set<String> messages =
        schemaFor("RunJob").validate(wrong).stream()
            .map(ValidationMessage::getMessage)
            .collect(Collectors.toCollection(LinkedHashSet::new));

    assertThat(messages)
        .as("a forbidden key must be reported by the same machinery the producers are judged by")
        .anyMatch(message -> message.contains("callbackBaseUrl"));
    assertThat(messages)
        .as("a missing required field must be reported by the same machinery")
        .anyMatch(message -> message.contains("resolvedSecrets"));
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
    wireMock.stubFor(post(urlPathEqualTo("/v1/runs")).willReturn(aResponse().withStatus(202)));

    new HttpRunnerDispatchClient(
            new ObjectMapper(),
            new StudioExecutionProperties(
                true, null, null, null, Duration.ofSeconds(5), null, null, null, null, null, null),
            "http://localhost:" + wireMock.port())
        .send(RunJobFixtures.conformingJob());

    var requests = wireMock.findAll(postRequestedFor(urlPathEqualTo("/v1/runs")));
    assertThat(requests)
        .as("no request reached the socket, so there are no producer bytes to judge")
        .hasSize(1);
    return requests.get(0).getBodyAsString();
  }

  /**
   * Captures the body the compile path's validation client actually puts on the wire (QA LOW-3).
   *
   * <p>The same technique as {@link #captureRunJobBody()} and for the same reason: {@code
   * RunnerValidationClient.requestBody} could be asserted directly, but the bytes are what the
   * runner's own closed key set judges, and the two can differ.
   */
  private static String captureValidateRequestBody() {
    wireMock.resetAll();
    wireMock.stubFor(
        post(urlPathEqualTo("/v1/validate"))
            .willReturn(
                aResponse()
                    .withStatus(200)
                    .withHeader("Content-Type", "application/json")
                    .withBody(
                        "{\"ok\":true,\"diagnostics\":[],\"steps\":[],"
                            + "\"validatorSchemaVersion\":\"1.0.0\","
                            + "\"languagePolicyVersion\":\"1.0.0\","
                            + "\"syntaxReferenceVersion\":\"1.0.0\","
                            + "\"executorVersion\":\"1.0.0\"}")));

    SimpleClientHttpRequestFactory factory = new SimpleClientHttpRequestFactory();
    factory.setConnectTimeout(1_000);
    factory.setReadTimeout(5_000);
    new RunnerValidationClient(
            RestClient.builder().requestFactory(factory).build(),
            new StudioRunnerProperties(
                "http://localhost:" + wireMock.port(),
                "conformance-token",
                Duration.ofSeconds(5),
                Duration.ofSeconds(1)))
        .validate(
            "{\"version\":1,\"steps\":[{\"stepIndex\":0,\"originalText\":\"Go to the home"
                + " page\",\"code\":\"await page.goto('https://example.com/');\"}]}",
            List.of("Go to the home page"),
            List.of("REGION"),
            List.of("LOGIN_PW"));

    var requests = wireMock.findAll(postRequestedFor(urlPathEqualTo("/v1/validate")));
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
