package com.citi.put.checks.studio;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.citi.put.checks.studio.dto.CompileAcceptedDto;
import com.citi.put.checks.studio.dto.CompileDiagnosticDto;
import com.citi.put.checks.studio.dto.CompileDiagnosticsDto;
import com.citi.put.checks.studio.dto.CompileErrorDto;
import com.citi.put.checks.studio.dto.CompileStepDiagnosticsDto;
import com.citi.put.checks.studio.dto.ExecutionSnapshotDto;
import com.citi.put.checks.studio.dto.RuntimeVersions;
import com.citi.put.checks.studio.dto.StepResult;
import com.citi.put.checks.studio.dto.StudioVariable;
import com.citi.put.checks.studio.dto.TestConfiguration;
import com.citi.put.checks.studio.dto.UITestDto;
import com.citi.put.checks.studio.dto.UITestRequest;
import com.citi.put.checks.studio.dto.VideoEvidence;
import com.citi.put.checks.studio.dto.Viewport;
import com.citi.put.checks.studio.internal.dto.AdmissionRequest;
import com.citi.put.checks.studio.internal.dto.AdmissionResponse;
import com.citi.put.checks.studio.internal.dto.ProgressAck;
import com.citi.put.checks.studio.internal.dto.RunOutcome;
import com.citi.put.checks.studio.internal.dto.RunnerEvidence;
import com.citi.put.checks.studio.internal.dto.RunnerLogEntry;
import com.citi.put.checks.studio.internal.dto.RunnerReport;
import com.citi.put.checks.studio.internal.dto.RunnerStepState;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.io.IOException;
import java.lang.reflect.RecordComponent;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.TreeMap;
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

  /**
   * ADR-002 §8.6 — "internal" is a deployment property, not a path prefix.
   *
   * <p>This assertion used to require every {@code internal}-tagged path to contain {@code
   * /internal/}. That held only while the two API callbacks were the only internal routes declared.
   * Architecture §8.4 tabulates six, four of them the runner's, and the runner serves {@code
   * /v1/validate} on its socket — no amount of tagging changes that. The old premise would have
   * been satisfied by a contract that lied about the wire, which is the trade ADR-002 §3.3 refused.
   *
   * <p>What {@code internal} actually means is: not reachable through public ingress, and
   * attributable to the component that serves it. Both halves are asserted, and both can fail — an
   * internal operation that inherits the document's public base, carries no component tag, or whose
   * {@code x-served-by} disagrees with that tag, fails here.
   */
  @Test
  void internalRoutesStayOffThePublicSurfaceAndNameWhatServesThem() {
    assertThat(serverUrls(contract.get("servers")))
        .as(
            "the document base is the public one — which is what every internal path item overrides")
        .containsExactly(PUBLIC_BASE);

    List<InternalOperation> internal = internalOperations();
    assertThat(internal.stream().map(InternalOperation::key))
        .as(
            "architecture §8.4 tabulates six internal routes and ADR-002 §3.1 declares all six;"
                + " ADR-002 §29 (Studio v1 WP4) adds the runner's cancel as the seventh")
        .containsExactlyInAnyOrder(
            "POST /v1/validate",
            "POST /v1/runs",
            "DELETE /v1/runs/{id}",
            "GET /health",
            "GET /ready",
            "POST /internal/studio/executions/{id}/admission",
            "POST /internal/studio/executions/{id}/progress");

    for (InternalOperation operation : internal) {
      String key = operation.key();

      // Out of the public surface: not under the public base, and not composed onto it either.
      assertThat(key).as("%s is declared under the public base", key).doesNotContain(PUBLIC_BASE);
      assertThat(operation.serverUrls())
          .as("%s inherits the document base; it must declare its own servers (ADR-002 §3.1)", key)
          .isNotEmpty()
          .allSatisfy(url -> assertThat(url).doesNotContain(PUBLIC_BASE));

      // Attributable: the tag names the serving component and x-served-by agrees with it.
      String component =
          operation.tags().contains("runner")
              ? "studio-runner"
              : operation.tags().contains("api-callback") ? "api" : null;
      assertThat(component)
          .as("%s carries neither the runner nor the api-callback tag", key)
          .isNotNull();
      assertThat(operation.servedBy())
          .as("%s: x-served-by and the component tag disagree about who serves it", key)
          .isEqualTo(component);
    }
  }

  /**
   * Story 10.8 AC-1 — the compile route is shipped, and the marker came off for it alone.
   *
   * <p>The two gates above already fail if a route is declared as shipped and unreachable, or
   * reachable and undeclared. What they cannot see is the marker being removed from an operation
   * whose story has not landed — {@code x-not-yet-implemented} is how the document says "declared
   * so dependants can build, not served yet", and quietly clearing it on a neighbour would present
   * three unimplemented routes as shipped. So this asserts both directions at once.
   */
  @Test
  void theCompileRouteIsShippedAndTheMarkerCameOffForThatOperationOnly() throws IOException {
    assertThat(implementedStudioOperations())
        .as("T-10.8.1 landed POST /tests/{id}/compile")
        .contains("POST " + PUBLIC_BASE + "/tests/{id}/compile");
    assertThat(declaredOperations(false))
        .as("and the document no longer flags it as pending")
        .contains("POST " + PUBLIC_BASE + "/tests/{id}/compile");
    assertThat(pendingOperations())
        .as(
            "story 10.15 ships GET /executions/{id}/video, which section 13's last row recorded as"
                + " the ONLY remaining pending operation, so this set is now EMPTY. That is why"
                + " the expectation changed and not because a marker was quietly cleared: the"
                + " mirror assertion in"
                + " theVideoRouteIsShippedAndTheMarkerCameOffForThatOperationOnly proves that"
                + " route is actually reachable rather than merely unflagged, and"
                + " ExecutionVideoContractTest points this same reader at a scratch copy carrying"
                + " a marker on a different operation, because an isEmpty() assertion is otherwise"
                + " satisfied by a helper that has stopped working. The SSE stream lost its marker"
                + " in 10.7, the confirm route in 10.9 (ADR-002 section 13)")
        .isEmpty();
  }

  /**
   * Story 10.9 AC-2 — the confirmation route is shipped, and the marker came off for it alone.
   *
   * <p>The mirror of the assertion above, and it is the half that keeps the edit honest. Removing
   * {@code x-not-yet-implemented} is one line, and a story that removed it without landing the
   * route would present an unimplemented operation as shipped — which is the precise failure {@code
   * everyRouteTheContractPresentsAsShippedIsActuallyReachable} exists to catch, and which that gate
   * can only catch because this one insists the route really is reachable.
   *
   * <p>{@code x-implemented-by} stays: ADR-002 §14.8 item 5 set the precedent on {@code
   * compileTest}, and the marker records <em>who shipped it</em>, not <em>whether it is
   * pending</em>.
   *
   * <p><b>Amended by story 10.15.</b> The video-route assertion at the end of this method has been
   * inverted — that route is now shipped, by 10.15, and its marker is gone. It is amended rather
   * than deleted: it is still the assertion that stops a story clearing a neighbour's marker.
   */
  @Test
  void theConfirmRouteIsShippedAndTheMarkerCameOffForThatOperationOnly() throws IOException {
    String route = "POST " + PUBLIC_BASE + "/tests/{id}/confirm-compile";
    assertThat(implementedStudioOperations())
        .as("T-10.9.1 landed POST /tests/{id}/confirm-compile")
        .contains(route);
    assertThat(declaredOperations(false))
        .as("and the document no longer flags it as pending")
        .contains(route);
    assertThat(operationFlag("/tests/{id}/confirm-compile", "x-not-yet-implemented"))
        .as("the marker is gone for this operation")
        .isNull();
    assertThat(operationFlag("/tests/{id}/confirm-compile", "x-implemented-by"))
        .as("and x-implemented-by stays, as ADR-002 §14.8 item 5 requires")
        .isEqualTo("10.9");
    assertThat(operationFlag("/executions/{id}/video", "x-not-yet-implemented"))
        .as(
            "the video route's marker came off in story 10.15, which ships GET"
                + " /executions/{id}/video; the direction of this assertion is INVERTED from what"
                + " it asserted through wave 5, and the story that inverted it is the story that"
                + " landed the route. Its own mirror is"
                + " theVideoRouteIsShippedAndTheMarkerCameOffForThatOperationOnly below")
        .isNull();
  }

  /**
   * Story 10.15 AC-21 — the video route is shipped, and the marker came off for it alone.
   *
   * <p>The third in this family, and the last: section 13's final row recorded {@code
   * pendingOperations()} as {@code GET /executions/{id}/video} alone, so this story empties the set
   * rather than shrinking it.
   *
   * <p>It also carries the correction. {@code x-implemented-by} read {@code '10.16'} — the
   * <em>frontend</em> playback story — while the epic manifest assigns <i>"Authorized Range
   * video/download endpoint"</i> to 10.15 and <i>"Evidence state, playback and step seek"</i>
   * (Frontend) to 10.16, and the retired epic's index table agrees. A vendor extension naming a
   * story that will never implement the route is a defect nothing could ever have satisfied, which
   * is ADR-002 §12's own Class A language; @po ruled it Class A at wave-6 validation and it is
   * recorded as a finding rather than laundered.
   */
  @Test
  void theVideoRouteIsShippedAndTheMarkerCameOffForThatOperationOnly() throws IOException {
    String route = "GET " + PUBLIC_BASE + "/executions/{id}/video";

    assertThat(implementedStudioOperations())
        .as(
            "T-10.15.8 landed GET /executions/{id}/video; an unimplemented route may not be"
                + " presented as shipped")
        .contains(route);
    assertThat(declaredOperations(false))
        .as("and the document no longer flags it as pending")
        .contains(route);
    assertThat(operationFlag("/executions/{id}/video", "x-implemented-by"))
        .as(
            "the attribution named 10.16, which is the frontend playback story — corrected here"
                + " with the marker removal, in one ADR-002 section 13 row (Class A, @po wave-6)")
        .isEqualTo("10.15");
    assertThat(pendingOperations()).as("and nothing else lost a marker alongside it").isEmpty();
  }

  /**
   * Story 10.11c AC-30 — the document's other invariants, because a byte pin cannot say which bytes
   * moved.
   *
   * <p>This story amends {@code openapi.yaml} under ADR-002 §21 and therefore re-anchors the
   * runner's {@code BASE_SHA256} in its own PR. A hash says <em>something</em> moved and never
   * <em>what</em>, so the claim that nothing outside {@code TestDto} moved is asserted here
   * instead: for every operation the document declares, its response status set and its
   * implementation marker are what they were before this story ran.
   *
   * <h2>Why a hand-maintained second copy, and why it must stay one</h2>
   *
   * <p>The required set below is a <b>deliberate second copy</b>, compared both ways, with the
   * total asserted separately. There is no production vocabulary to derive it from — no Java type
   * enumerates the document's operations — and deriving it from the document would make this test a
   * statement that the document equals itself, which is this epic's most-repeated finding.
   *
   * <p><b>It must not be "simplified" into a derivation from the thing it checks.</b> If a later
   * story legitimately adds an operation or a status, the entry is added here, deliberately, in
   * that story's PR — which is the same rule the pin itself carries one file over.
   *
   * <p>The marker half is derived rather than copied, because there a vocabulary does exist: story
   * 10.15 removed the last {@code x-not-yet-implemented} in the document, so the correct assertion
   * is that {@link #pendingOperations()} is empty, and it would fail the moment one came back.
   */
  @Test
  void noOperationsStatusSetOrMarkerMovedWhileTestDtoGainedTwoProperties() {
    Map<String, String> expected = new TreeMap<>();
    expected.put("DELETE /tests/{id}", "204,400,401,403");
    // Studio v1 WP4 (ADR-002 §29): the public cancel and the runner's DELETE, added deliberately.
    expected.put("DELETE /v1/runs/{id}", "202,401,403,404,409");
    expected.put("POST /executions/{id}/cancel", "202,400,401,403,409");
    expected.put("GET /executions", "200,401");
    expected.put("GET /executions/{id}", "200,400,401,403");
    expected.put("GET /executions/{id}/events", "200,401,403");
    expected.put("GET /executions/{id}/video", "200,206,401,403,404,410,416,503");
    expected.put("GET /health", "200,401,403");
    expected.put("GET /ready", "200,401,403,503");
    expected.put("GET /tests", "200,401");
    expected.put("GET /tests/{id}", "200,400,401,403");
    expected.put("POST /internal/studio/executions/{id}/admission", "200,400,401,403,409");
    expected.put("POST /internal/studio/executions/{id}/progress", "200,400,401,403,409,413");
    expected.put("POST /tests", "201,400,401,403");
    expected.put("POST /tests/{id}/compile", "202,400,401,403,409");
    expected.put("POST /tests/{id}/confirm-compile", "200,400,401,403,409");
    expected.put("POST /tests/{id}/execute", "202,400,401,403,409,429,503");
    expected.put("POST /v1/runs", "202,400,401,403,409,429,503");
    expected.put("POST /v1/validate", "200,400,401,403,413,503");
    expected.put("PUT /tests/{id}", "200,400,401,403,409");

    Map<String, String> declared = declaredStatusSets();

    // The total, asserted separately. Without it, both comparisons below could agree on a set that
    // had silently shrunk to nothing on both sides at once.
    assertThat(declared).as("the document declares a different number of operations").hasSize(20);
    assertThat(expected).hasSize(20);

    assertThat(declared.keySet())
        .as("an operation the document declares that this copy does not name")
        .containsExactlyElementsOf(expected.keySet());
    assertThat(expected.keySet())
        .as("an operation this copy names that the document no longer declares")
        .containsExactlyElementsOf(declared.keySet());
    assertThat(declared)
        .as(
            "an operation's response status set moved. The ONLY movement story 10.31 authorizes "
                + "is GET /executions/{id}/video gaining 401, 403 and 503 by ADR-002 §24's ruling "
                + "(ESC-1, ESC-2). Every other row is unchanged, and a row that moves without a "
                + "ruling is the drift this copy exists to catch")
        .isEqualTo(expected);

    assertThat(pendingOperations())
        .as("story 10.15 removed the last x-not-yet-implemented; none came back here")
        .isEmpty();
  }

  /** Every declared operation, keyed {@code METHOD /path}, valued as its sorted status set. */
  @SuppressWarnings("unchecked")
  private static Map<String, String> declaredStatusSets() {
    Map<String, Object> paths = (Map<String, Object>) contract.get("paths");
    Map<String, String> declared = new TreeMap<>();
    paths.forEach(
        (path, item) ->
            ((Map<String, Object>) item)
                .forEach(
                    (method, operation) -> {
                      if (!(operation instanceof Map)) {
                        return;
                      }
                      Object responses = ((Map<String, Object>) operation).get("responses");
                      if (!(responses instanceof Map)) {
                        return;
                      }
                      declared.put(
                          method.toUpperCase(Locale.ROOT) + " " + path,
                          String.join(
                              ",", new TreeSet<>(((Map<String, Object>) responses).keySet())));
                    }));
    return declared;
  }

  @Test
  void theFrozenSchemasAndTheJavaTypesShareTheSameFieldNames() {
    assertSchemaMatchesRecord("CompileAccepted", CompileAcceptedDto.class);
    assertSchemaMatchesRecord("ExecutionSnapshot", ExecutionSnapshotDto.class);
    assertSchemaMatchesRecord("StepResult", StepResult.class);
    assertSchemaMatchesRecord("VideoEvidence", VideoEvidence.class);
    assertSchemaMatchesRecord("RuntimeVersions", RuntimeVersions.class);
    assertSchemaMatchesRecord("Viewport", Viewport.class);
    assertSchemaMatchesRecord("TestConfiguration", TestConfiguration.class);
    assertSchemaMatchesRecord("Variable", StudioVariable.class);
    assertSchemaMatchesRecord("TestRequest", UITestRequest.class);
    // ADR-002 §16.9 item 4 — TestDto's absence from this list is why `compileError` and
    // `compileDiagnostics` stayed persisted-but-undeclared for four waves: a conformance gate is
    // only as wide as its enumeration. Its four component shapes join it for the same reason.
    assertSchemaMatchesRecord("TestDto", UITestDto.class);
    assertSchemaMatchesRecord("CompileError", CompileErrorDto.class);
    assertSchemaMatchesRecord("CompileDiagnostic", CompileDiagnosticDto.class);
    assertSchemaMatchesRecord("CompileStepDiagnostics", CompileStepDiagnosticsDto.class);
    assertSchemaMatchesRecord("CompileDiagnostics", CompileDiagnosticsDto.class);
  }

  /**
   * Story 10.14 AC-24 — the drift check reaches the <b>internal</b> records too.
   *
   * <p>The list above covers public DTOs and, until this test existed, no internal one. That is
   * precisely why ADR-002 §17 could add {@code partial} to {@code RunnerEvidence} in the document,
   * leave the Java record three components wide, and turn <b>nothing</b> red — while the merged
   * runner emitted the property on every {@code FINAL} and {@code StrictInternalBodyReader} refused
   * the whole report. A conformance gate is only as wide as its enumeration (§16.9 item 4).
   *
   * <p>Every closed internal body of ADR-002 §6.2 is listed. If one of these ever diverges it is
   * <b>left red and escalated</b> per §12 — never widened to match, never excluded from this list
   * to keep the suite green. That is the rule story 10.6 followed and the reason four divergences
   * were ruled on instead of buried.
   */
  @Test
  void theFrozenInternalSchemasAndTheJavaRecordsShareTheSameFieldNames() {
    assertSchemaMatchesRecord("RunnerEvidence", RunnerEvidence.class);
    assertSchemaMatchesRecord("RunnerReport", RunnerReport.class);
    assertSchemaMatchesRecord("RunnerStepState", RunnerStepState.class);
    assertSchemaMatchesRecord("RunnerLogEntry", RunnerLogEntry.class);
    assertSchemaMatchesRecord("RunOutcome", RunOutcome.class);
    assertSchemaMatchesRecord("AdmissionRequest", AdmissionRequest.class);
    assertSchemaMatchesRecord("AdmissionResponse", AdmissionResponse.class);
    assertSchemaMatchesRecord("ProgressAck", ProgressAck.class);
  }

  /**
   * The control for the gate above: the shape that existed before this story <b>fails</b> it.
   *
   * <p>A conformance list is the easiest kind of vacuous test to write — eight green assertions
   * prove nothing unless the comparison can go red. {@code RunnerEvidenceBeforeStory1014} is the
   * exact record `DEF-02` was found on: three components, no {@code partial}, while the document
   * had declared the property since ADR-002 §17. This asserts the gate would have caught it, which
   * is the claim AC-24 actually makes.
   */
  @Test
  void theInternalDriftCheckWouldHaveCaughtTheRecordThatCausedDef02() {
    assertThatThrownBy(
            () -> assertSchemaMatchesRecord("RunnerEvidence", RunnerEvidenceBeforeStory1014.class))
        .as("if this does not throw, the eight assertions above are decoration")
        .isInstanceOf(AssertionError.class)
        .hasMessageContaining("partial");
  }

  /** The three-component record as it stood on {@code epic/EPIC-10} before story 10.14. */
  private record RunnerEvidenceBeforeStory1014(String videoKey, String manifestKey, String state) {}

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

  /**
   * One extension value on an operation, read from the document rather than from an example.
   *
   * @param path the path item, without the public base
   * @param method the HTTP method key as the document spells it
   * @param key the extension key
   * @return the raw value, or null when absent
   */
  @SuppressWarnings("unchecked")
  private static Object operationFlag(String path, String method, String key) {
    Map<String, Object> paths = (Map<String, Object>) contract.get("paths");
    Map<String, Object> item = (Map<String, Object>) paths.get(path);
    assertThat(item).as("the contract declares %s", path).isNotNull();
    Map<String, Object> operation = (Map<String, Object>) item.get(method);
    assertThat(operation).as("%s declares a %s operation", path, method).isNotNull();
    return operation.get(key);
  }

  /** The same, for the {@code post} operation of a path. */
  private static Object operationFlag(String path, String key) {
    return operationFlag(path, path.endsWith("/video") ? "get" : "post", key);
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
                      operations.add(method.toUpperCase(Locale.ROOT) + " " + prefix + path);
                    }));
    return operations;
  }

  /** Operations the document still flags as declared-but-not-served, as {@code METHOD path}. */
  @SuppressWarnings("unchecked")
  private static Set<String> pendingOperations() {
    Map<String, Object> paths = (Map<String, Object>) contract.get("paths");
    Set<String> pending = new TreeSet<>();
    paths.forEach(
        (path, item) ->
            ((Map<String, Object>) item)
                .forEach(
                    (method, operation) -> {
                      if (!(operation instanceof Map)) {
                        return;
                      }
                      if (Boolean.TRUE.equals(
                          ((Map<String, Object>) operation).get("x-not-yet-implemented"))) {
                        pending.add(method.toUpperCase(Locale.ROOT) + " " + path);
                      }
                    }));
    return pending;
  }

  /** One internal operation and the three signals that make it attributable (ADR-002 §3.1). */
  private record InternalOperation(
      String key, List<String> tags, String servedBy, List<String> serverUrls) {}

  /** Internal operations with their path item's servers, which {@code declaredOperations} drops. */
  @SuppressWarnings("unchecked")
  private static List<InternalOperation> internalOperations() {
    Map<String, Object> paths = (Map<String, Object>) contract.get("paths");
    List<InternalOperation> found = new ArrayList<>();
    paths.forEach(
        (path, item) -> {
          Map<String, Object> pathItem = (Map<String, Object>) item;
          List<String> servers = serverUrls(pathItem.get("servers"));
          pathItem.forEach(
              (method, operation) -> {
                if (!(operation instanceof Map)) {
                  return;
                }
                Map<String, Object> details = (Map<String, Object>) operation;
                if (!Boolean.TRUE.equals(details.get("x-internal"))
                    && !tags(details).contains("internal")) {
                  return;
                }
                found.add(
                    new InternalOperation(
                        method.toUpperCase(Locale.ROOT) + " " + path,
                        tags(details),
                        String.valueOf(details.get("x-served-by")),
                        servers));
              });
        });
    return found;
  }

  /** The {@code url} of every entry in a {@code servers} list; empty when there is no list. */
  private static List<String> serverUrls(Object servers) {
    if (!(servers instanceof List<?> entries)) {
      return List.of();
    }
    List<String> urls = new ArrayList<>();
    for (Object entry : entries) {
      if (entry instanceof Map<?, ?> server) {
        urls.add(String.valueOf(server.get("url")));
      }
    }
    return urls;
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
                      method -> operations.add(method.toUpperCase(Locale.ROOT) + " " + path));
            });
    // Routes that exist in the prototype but are not part of the frozen contract: the step
    // validator endpoints are retired by 10.11 and are deliberately not frozen here.
    operations.removeIf(operation -> operation.contains("validate-steps"));
    operations.removeIf(operation -> operation.contains("validate-variables"));
    return operations;
  }
}
