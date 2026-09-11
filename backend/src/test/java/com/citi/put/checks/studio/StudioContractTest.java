package com.citi.put.checks.studio;

import static org.assertj.core.api.Assertions.assertThat;

import com.citi.put.checks.studio.dto.ExecutionSnapshotDto;
import com.citi.put.checks.studio.dto.RuntimeVersions;
import com.citi.put.checks.studio.dto.StepResult;
import com.citi.put.checks.studio.dto.StudioVariable;
import com.citi.put.checks.studio.dto.TestConfiguration;
import com.citi.put.checks.studio.dto.UITestRequest;
import com.citi.put.checks.studio.dto.VideoEvidence;
import com.citi.put.checks.studio.dto.Viewport;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.io.IOException;
import java.lang.reflect.RecordComponent;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Arrays;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.TreeSet;
import java.util.stream.Collectors;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.client.TestRestTemplate;
import org.springframework.test.context.ActiveProfiles;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.yaml.snakeyaml.Yaml;

/**
 * Story 10.1 AC-20 — the frozen contract and the running service are checked against each other.
 *
 * <p>A contract document that nobody diffs stops being a contract within one sprint. Three gates
 * run here:
 *
 * <ol>
 *   <li>Every Studio route springdoc actually exposes is declared in {@code
 *       docs/specs/studio/openapi.yaml}, and every route the document declares as implemented is
 *       really there. Routes belonging to later stories carry {@code x-not-yet-implemented} and are
 *       excluded — deliberately and visibly, rather than by being absent.
 *   <li>The property names of every frozen schema equal the record components of the Java type that
 *       serializes it. Renaming a field in either place fails the build.
 *   <li>The GET snapshot examples and the SSE {@code execution.snapshot} payload deserialize into
 *       the same DTO class, which is the whole point of §5.5 parity.
 * </ol>
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@ActiveProfiles("test")
@Testcontainers(disabledWithoutDocker = true)
class StudioContractTest {

  private static final Path CONTRACT = Path.of("..", "docs", "specs", "studio", "openapi.yaml");
  private static final String PUBLIC_BASE = "/api/v1/studio";

  private static Map<String, Object> contract;

  @Autowired private TestRestTemplate restTemplate;
  @Autowired private ObjectMapper objectMapper;

  @BeforeAll
  @SuppressWarnings("unchecked")
  static void loadContract() throws IOException {
    contract =
        (Map<String, Object>) new Yaml().load(Files.readString(CONTRACT, StandardCharsets.UTF_8));
  }

  @Test
  void everyImplementedStudioRouteIsDeclaredInTheContract() throws IOException {
    Set<String> implemented = implementedStudioOperations();
    assertThat(implemented)
        .as("springdoc exposed no Studio routes at all — the diff gate would be vacuous")
        .isNotEmpty();

    Set<String> declared = declaredOperations(false);

    assertThat(declared)
        .as("routes reachable today but missing from docs/specs/studio/openapi.yaml")
        .containsAll(implemented);
  }

  @Test
  void everyRouteTheContractPresentsAsShippedIsActuallyReachable() throws IOException {
    Set<String> implemented = implementedStudioOperations();
    Set<String> shipped =
        declaredOperations(false).stream()
            .filter(operation -> operation.contains(PUBLIC_BASE))
            .collect(Collectors.toCollection(TreeSet::new));

    assertThat(implemented)
        .as(
            "the contract presents these public routes as shipped but nothing serves them; "
                + "mark them x-not-yet-implemented or implement them")
        .containsAll(shipped);
  }

  @Test
  void internalRoutesAreTaggedSoTheyStayOutOfThePublicSurface() {
    Set<String> internal = declaredOperations(true);

    assertThat(internal).isNotEmpty();
    // Internal routes never carry the public base path: they are not exposed through ingress.
    assertThat(internal).allMatch(operation -> operation.contains("/internal/"));
    assertThat(internal).noneMatch(operation -> operation.contains(PUBLIC_BASE));
  }

  @Test
  void theFrozenSchemasAndTheJavaTypesShareTheSameFieldNames() {
    assertSchemaMatchesRecord("ExecutionSnapshot", ExecutionSnapshotDto.class);
    assertSchemaMatchesRecord("StepResult", StepResult.class);
    assertSchemaMatchesRecord("VideoEvidence", VideoEvidence.class);
    assertSchemaMatchesRecord("RuntimeVersions", RuntimeVersions.class);
    assertSchemaMatchesRecord("Viewport", Viewport.class);
    assertSchemaMatchesRecord("TestConfiguration", TestConfiguration.class);
    assertSchemaMatchesRecord("Variable", StudioVariable.class);
    assertSchemaMatchesRecord("TestRequest", UITestRequest.class);
  }

  @Test
  void everySnapshotExampleDeserializesIntoTheSnapshotDto() {
    Map<String, Object> examples = examples();
    assertThat(examples).hasSizeGreaterThanOrEqualTo(8);

    examples.forEach(
        (name, example) -> {
          ExecutionSnapshotDto snapshot = readSnapshot(valueOf(example), name);
          assertThat(snapshot.executionId()).as("%s.executionId", name).isNotNull();
          assertThat(snapshot.status()).as("%s.status", name).isNotNull();
          assertThat(snapshot.video()).as("%s.video", name).isNotNull();
          // The protected API path, never a storage key or an external URL.
          if (snapshot.videoPath() != null) {
            assertThat(snapshot.videoPath()).startsWith(PUBLIC_BASE + "/executions/");
          }
        });
  }

  @Test
  void skippedAndUnstartedStepsCarryNullTimingsInTheExamples() {
    ExecutionSnapshotDto failed =
        readSnapshot(valueOf(examples().get("SnapshotFailed")), "SnapshotFailed");

    List<StepResult> skipped =
        failed.stepResults().stream()
            .filter(step -> StepResult.SKIPPED.equals(step.status()))
            .toList();
    assertThat(skipped).isNotEmpty();
    assertThat(skipped)
        .allSatisfy(
            step -> {
              assertThat(step.offsetMs()).isNull();
              assertThat(step.durationMs()).isNull();
            });
  }

  @Test
  void theSseEventPayloadIsTheSameDtoAsTheGetSnapshot() throws IOException {
    String frame = sseExampleFrame();
    String data =
        frame
            .lines()
            .filter(line -> line.startsWith("data:"))
            .map(line -> line.substring("data:".length()).trim())
            .findFirst()
            .orElseThrow(() -> new AssertionError("the SSE example carries no data line"));

    ExecutionSnapshotDto fromStream = objectMapper.readValue(data, ExecutionSnapshotDto.class);
    ExecutionSnapshotDto fromGet =
        readSnapshot(valueOf(examples().get("SnapshotRunning")), "SnapshotRunning");

    assertThat(fromStream).isInstanceOf(fromGet.getClass());
    assertThat(fromStream.status()).isEqualTo(fromGet.status());
    assertThat(fromStream.streamComplete()).isEqualTo(fromGet.streamComplete());
    // The SSE id is the snapshot revision (§5.5), so it must be carried in the body too.
    assertThat(frame).contains("id: " + fromStream.revision());
    assertThat(frame).contains("event: execution.snapshot");
  }

  @Test
  void theLegacyAdapterExamplesAreAcceptedByTheTypedRequestType() throws IOException {
    Map<String, Object> createExamples = createRequestExamples();
    assertThat(createExamples.keySet()).contains("create", "legacyCreate", "legacyTestIrCreate");

    for (Map.Entry<String, Object> entry : createExamples.entrySet()) {
      UITestRequest request =
          objectMapper.readValue(
              objectMapper.writeValueAsString(valueOf(entry.getValue())), UITestRequest.class);
      assertThat(request.steps()).as("%s.steps", entry.getKey()).isNotNull();
      assertThat(request.configuration().browser())
          .as("%s adapts to the canonical engine", entry.getKey())
          .isEqualTo(TestConfiguration.CANONICAL_BROWSER);
    }
  }

  // ── helpers ──────────────────────────────────────────────────────────────

  private ExecutionSnapshotDto readSnapshot(Object value, String name) {
    try {
      return objectMapper.readValue(
          objectMapper.writeValueAsString(value), ExecutionSnapshotDto.class);
    } catch (IOException e) {
      throw new AssertionError("example " + name + " does not fit the snapshot DTO", e);
    }
  }

  private void assertSchemaMatchesRecord(String schemaName, Class<?> recordType) {
    Set<String> schemaProperties = new TreeSet<>(schemaProperties(schemaName));
    Set<String> recordComponents =
        Arrays.stream(recordType.getRecordComponents())
            .map(RecordComponent::getName)
            .collect(Collectors.toCollection(TreeSet::new));

    assertThat(schemaProperties)
        .as("%s in openapi.yaml vs %s", schemaName, recordType.getSimpleName())
        .isEqualTo(recordComponents);
  }

  @SuppressWarnings("unchecked")
  private Set<String> schemaProperties(String schemaName) {
    Map<String, Object> components = (Map<String, Object>) contract.get("components");
    Map<String, Object> schemas = (Map<String, Object>) components.get("schemas");
    Map<String, Object> schema = (Map<String, Object>) schemas.get(schemaName);
    assertThat(schema).as("schema %s is declared", schemaName).isNotNull();
    Map<String, Object> properties = (Map<String, Object>) schema.get("properties");
    return new LinkedHashSet<>(properties.keySet());
  }

  @SuppressWarnings("unchecked")
  private Map<String, Object> examples() {
    Map<String, Object> components = (Map<String, Object>) contract.get("components");
    return (Map<String, Object>) components.get("examples");
  }

  @SuppressWarnings("unchecked")
  private Map<String, Object> createRequestExamples() {
    Map<String, Object> paths = (Map<String, Object>) contract.get("paths");
    Map<String, Object> tests = (Map<String, Object>) paths.get("/tests");
    Map<String, Object> post = (Map<String, Object>) tests.get("post");
    Map<String, Object> body = (Map<String, Object>) post.get("requestBody");
    Map<String, Object> content = (Map<String, Object>) body.get("content");
    Map<String, Object> json = (Map<String, Object>) content.get("application/json");
    return (Map<String, Object>) json.get("examples");
  }

  @SuppressWarnings("unchecked")
  private String sseExampleFrame() {
    Map<String, Object> paths = (Map<String, Object>) contract.get("paths");
    Map<String, Object> events = (Map<String, Object>) paths.get("/executions/{id}/events");
    Map<String, Object> get = (Map<String, Object>) events.get("get");
    Map<String, Object> responses = (Map<String, Object>) get.get("responses");
    Map<String, Object> ok = (Map<String, Object>) responses.get("200");
    Map<String, Object> content = (Map<String, Object>) ok.get("content");
    Map<String, Object> stream = (Map<String, Object>) content.get("text/event-stream");
    Map<String, Object> sseExamples = (Map<String, Object>) stream.get("examples");
    return String.valueOf(valueOf(sseExamples.get("snapshotEvent")));
  }

  @SuppressWarnings("unchecked")
  private static Object valueOf(Object example) {
    return ((Map<String, Object>) example).get("value");
  }

  /**
   * Operations declared in the contract, as {@code METHOD path}. Routes owned by later stories are
   * flagged with {@code x-not-yet-implemented} and excluded from the "shipped" view.
   */
  @SuppressWarnings("unchecked")
  private Set<String> declaredOperations(boolean internalOnly) {
    Map<String, Object> paths = (Map<String, Object>) contract.get("paths");
    Set<String> operations = new TreeSet<>();
    paths.forEach(
        (path, item) ->
            ((Map<String, Object>) item)
                .forEach(
                    (method, operation) -> {
                      if (!(operation instanceof Map)) {
                        return;
                      }
                      Map<String, Object> details = (Map<String, Object>) operation;
                      boolean internal =
                          Boolean.TRUE.equals(details.get("x-internal"))
                              || tags(details).contains("internal");
                      boolean pending = Boolean.TRUE.equals(details.get("x-not-yet-implemented"));
                      if (internal != internalOnly || (!internalOnly && pending)) {
                        return;
                      }
                      String prefix = internal ? "" : PUBLIC_BASE;
                      operations.add(
                          method.toUpperCase(java.util.Locale.ROOT) + " " + prefix + path);
                    }));
    return operations;
  }

  @SuppressWarnings("unchecked")
  private static List<String> tags(Map<String, Object> operation) {
    Object tags = operation.get("tags");
    return tags instanceof List ? (List<String>) tags : List.of();
  }

  /** Operations springdoc actually reports for the Studio controller, as {@code METHOD path}. */
  private Set<String> implementedStudioOperations() throws IOException {
    String body = restTemplate.getForObject("/v3/api-docs", String.class);
    assertThat(body).as("springdoc must publish an OpenAPI document").isNotNull();
    JsonNode document = objectMapper.readTree(body);

    Set<String> operations = new TreeSet<>();
    JsonNode paths = document.path("paths");
    paths
        .fieldNames()
        .forEachRemaining(
            path -> {
              if (!path.startsWith(PUBLIC_BASE)) {
                return;
              }
              paths
                  .path(path)
                  .fieldNames()
                  .forEachRemaining(
                      method ->
                          operations.add(method.toUpperCase(java.util.Locale.ROOT) + " " + path));
            });
    // Routes that exist in the prototype but are not part of the frozen contract: the step
    // validator endpoints are retired by 10.11 and are deliberately not frozen here.
    operations.removeIf(operation -> operation.contains("validate-steps"));
    operations.removeIf(operation -> operation.contains("validate-variables"));
    return operations;
  }
}
