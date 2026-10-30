package com.citi.put.checks.studio;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.citi.put.checks.studio.dto.ExecutionSnapshotDto;
import com.citi.put.checks.studio.dto.ReplayFailure;
import com.citi.put.checks.studio.dto.RuntimeVersions;
import com.citi.put.checks.studio.dto.StepResult;
import com.citi.put.checks.studio.dto.StudioVariable;
import com.citi.put.checks.studio.dto.TestConfiguration;
import com.citi.put.checks.studio.dto.UITestDto;
import com.citi.put.checks.studio.dto.UITestRequest;
import com.citi.put.checks.studio.dto.VideoEvidence;
import com.citi.put.checks.studio.dto.Viewport;
import com.citi.put.checks.studio.internal.dto.ProgressAck;
import com.citi.put.checks.studio.internal.dto.RunOutcome;
import com.citi.put.checks.studio.internal.dto.RunnerEvidence;
import com.citi.put.checks.studio.internal.dto.RunnerLogEntry;
import com.citi.put.checks.studio.internal.dto.RunnerReport;
import com.citi.put.checks.studio.internal.dto.RunnerStepState;
import com.citi.put.checks.studio.secrets.CreateStudioSecretRequest;
import com.citi.put.checks.studio.secrets.StudioSecretDto;
import com.citi.put.checks.studio.secrets.StudioSecretListDto;
import com.citi.put.checks.studio.secrets.StudioSecretNameDto;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.io.IOException;
import java.lang.reflect.RecordComponent;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.security.MessageDigest;
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
  // STUDIO-OBS-015 C3a/C3b deliberately replaces the C2b OpenAPI pin:
  // old "afec6c04cdd5bcc19e42b83f83656a342165c5e04407e90a7206de0b40c46183";
  // new "54fd12cd9951cad6caa32e78693598eb0a23d4333a11749e2083b340d503cd0d"; one contract-generation
  // receipt.
  // STUDIO-OBS-015 aria-cap-ruling01 re-anchors it again (SOURCE_LINE_TOO_LONG and the
  // AuthoringStep.text description state the single 500 bound); previous digest 54fd12cd9951….
  // STUDIO-OBS-008 C-int W1 (P1-P3 + T0 A1): getStudioTestCapabilities, PublicProgress,
  // PublicExplanation and ExecutionSnapshot.replayFailure; operations 43 -> 44.
  // old "c053a7f75656628a1b3e031e02f40f4982aa3a85fc241a4c87c7229460f5d70f";
  // C-int fix unit 2 (ReplayFailure else-branch admits null); previous digest c377e480…99ce515.
  // STUDIO-OBS-008 C-int unit 3 (secret value bound 4096, OBS-007 AC-12);
  // previous digest 2f4041ae…1700.
  // STUDIO-OBS-009 C9 (AC-1 P2 c + C-OBS008-4, one unit): RuntimeVersions and
  // ReportedRuntimeVersions describe the observed identities (T0 A7) and startGuidedSession
  // declares 422 INVALID_CONTRACT (AUTHORING_REFERENCE_AMBIGUOUS); operations stay 44.
  // Previous digest b5ecdcad…ae29244.
  // old "bbf37fd1f96c0da33bbca6db4c04c94222a44429a4b6f0e33c92dfc59fca02c4".
  // STUDIO-GOV-001.3: the five guided-policies operations and the startGuidedSession
  // POLICY_NOT_APPROVED conflict are deleted (ADR-002 §13). STUDIO-GOV-001.2: the eight Studio
  // schedule operations and the snapshot provenance fields are removed (ADR-002 §13). The digest
  // also carries STUDIO-UNIFY-001.6's readLatestGuidedAttempts; 45 -> 32 operations.
  // STUDIO-GOV-001.4: startGuidedSession drops `applicationId` from its body and declares the 422
  // NO_APPLICATION_URL refusal; the capability `guidedStart.context` drops `applicationId`
  // (ADR-002 §13).
  // old "ffb9934ad95f4dc99cedd1022e3e14f2eb77d6dc8be10f728fb034941fd3c7f6".
  // new "8daf493b427fbe472df6b69131423abd8427f032036db695bad472328943a7b2".
  // Proof = replay of the published revision (ADR-002 §13): GuidedResult gains `proof` and a
  // publication-keyed `evidence.video` (null when PUBLISHED), ExecutionSnapshot.triggerSource gains
  // AFTER_LEARN, and getGuidedSessionVideo documents its 404 for a published session; operations
  // stay 32.
  // old "8daf493b427fbe472df6b69131423abd8427f032036db695bad472328943a7b2".
  // new "a3328f879e0a367233a48196290dbfe05a422bea320ab559ee601752dfff4957".
  // STUDIO-FLEX-001: text only. startGuidedSession declares 403 ORIGIN_NOT_ALLOWED (first URL
  // not on the allowed-domains list) and the 429 messageCode LEARNING_CAPACITY_EXHAUSTED;
  // createTestSecret's INVALID_SECRET_ORIGINS also covers an origin off the list; operations
  // stay 32.
  // old "a3328f879e0a367233a48196290dbfe05a422bea320ab559ee601752dfff4957".
  // new "10b0cb1ead65f234e30d8eacd4c63dcd4f995fb8f96a739cd0e77303530b84ea".
  // Wording only: getGuidedSessionVideo names the published-session 404 by its wire code
  // VIDEO_UNAVAILABLE (was NO_EVIDENCE, the Java constant name); operations stay 32.
  // old "10b0cb1ead65f234e30d8eacd4c63dcd4f995fb8f96a739cd0e77303530b84ea".
  // new "35d42df7d2dca7099e3be1cc98fa2993bea8a6f3271007fb7738726ffa5afc7a".
  // ADR-SC-007 (WI-3): wording only: the clarification example choice carries no element id.
  // The observed clarification choice is {choiceId, safeLabel, labelSource, role, region,
  // bindingId}.
  // operations stay 32.
  // old "35d42df7d2dca7099e3be1cc98fa2993bea8a6f3271007fb7738726ffa5afc7a".
  // new "cd28f40b3e96c6e6c9ffd34afdf704702a2a6c6cd01eeee00c76acb8abf9b663".
  private static final String BASE_SHA256 =
      "cd28f40b3e96c6e6c9ffd34afdf704702a2a6c6cd01eeee00c76acb8abf9b663";

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
  void theWholeReviewedOpenApiDocumentMatchesTheContractOwnerPin() throws Exception {
    assertThat(
            java.util.HexFormat.of()
                .formatHex(
                    MessageDigest.getInstance("SHA-256").digest(Files.readAllBytes(CONTRACT))))
        .isEqualTo(BASE_SHA256);
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
            "the document base is the public one — which is what every internal path item"
                + " overrides")
        .containsExactly(PUBLIC_BASE);

    List<InternalOperation> internal = internalOperations();
    assertThat(internal.stream().map(InternalOperation::key))
        .as(
            "architecture §8.4 tabulates six internal routes and ADR-002 §3.1 declares all six;"
                + " ADR-002 §29 adds cancel/control; approved OBS006 adds three observed routes;"
                + " STUDIO-OBS-012A removes the artifact-1 POST /v1/validate, POST /v1/runs and"
                + " moves cancel to DELETE /v2/runs/{id} (11 -> 9); STUDIO-OBS-014 (AR-3)"
                + " deletes the legacy POST /internal/studio/executions/{id}/admission (9 -> 8)")
        .hasSize(8)
        .containsExactlyInAnyOrder(
            "DELETE /v2/runs/{id}",
            "GET /internal/studio/executions/{id}/control",
            "GET /health",
            "GET /ready",
            "POST /internal/studio/executions/{id}/progress",
            "POST /v2/validate-observed",
            "POST /v2/runs",
            "POST /internal/studio/executions/{id}/observed-admission");

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
   * <em>what</em>, so every operation retains an independently enumerated response status set and
   * implementation marker below. ADR-002 §31 subsequently amends the video status set to include
   * implemented authentication and unavailable-store responses; that reviewed change is recorded
   * explicitly in this copy.
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
  void declaredOperationStatusSetsAndMarkersMatchTheReviewedContract() {
    Map<String, String> expected = new TreeMap<>();
    expected.put("DELETE /tests/{id}", "204,400,401,403");
    // Studio v1 WP4 (ADR-002 §29): the public cancel, added deliberately.
    expected.put("POST /executions/{id}/cancel", "202,400,401,403,409");
    // ADR-002 §29.4: the owning runner's control read.
    expected.put("GET /internal/studio/executions/{id}/control", "200,400,401,403,404");
    // Story 10.46: the list routes validate their new search/filter/sort parameters (400).
    expected.put("GET /executions", "200,400,401");
    expected.put("GET /executions/{id}", "200,400,401,403");
    expected.put("GET /executions/{id}/events", "200,401,403");
    expected.put("GET /executions/{id}/video", "200,206,401,403,404,410,416,503");
    expected.put("GET /health", "200,401,403");
    expected.put("GET /ready", "200,401,403,503");
    expected.put("GET /tests", "200,400,401");
    expected.put("GET /tests/{id}", "200,400,401,403");
    // ADR-002 §32 (studio-vault-secrets): a test's Vault-backed secrets, names only on read.
    expected.put("GET /tests/{id}/secrets", "200,400,401,403,503");
    expected.put("POST /internal/studio/executions/{id}/progress", "200,400,401,403,409,413");
    expected.put("POST /tests", "201,400,401,403");
    expected.put("POST /tests/{id}/execute", "202,400,401,403,409,429,503");
    expected.put("POST /tests/{id}/secrets", "201,400,401,403,409,503");
    // STUDIO-OBS-008 P1: one saved test's runtime capabilities; absent and denied both answer 403.
    expected.put("GET /tests/{id}/capabilities", "200,400,401,403");
    expected.put("PUT /tests/{id}", "200,400,401,403,409");
    // Approved OBS006 adds only these three internal operations; the preceding 31 remain exact.
    expected.put("POST /v2/validate-observed", "200,400,401,403,413,503");
    expected.put("POST /v2/runs", "202,400,401,403,409,413,429,503");
    expected.put(
        "POST /internal/studio/executions/{id}/observed-admission", "200,400,401,403,409,413,422");
    // STUDIO-OBS-012A (AC-2, AC-5): the one public document. Removed: compile, confirm-compile,
    // POST /v1/validate, POST /v1/runs, DELETE /v1/runs/{id}. Added: validate-variables, the seven
    // guided-session routes under /api/v1/studio, and the observed cancel DELETE /v2/runs/{id}.
    expected.put("POST /tests/{id}/validate-variables", "200,400,401,403");
    // STUDIO-OBS-009 C9 (C-OBS008-4): startGuidedSession declares 422 (ambiguous declarations).
    expected.put("POST /guided-sessions", "202,400,401,403,409,422,429,503");
    // STUDIO-UNIFY-001.6: the caller's latest learning attempt per test (readLatestGuidedAttempts).
    expected.put("GET /guided-sessions/latest", "200,400,401,403");
    expected.put("GET /guided-sessions/{id}", "200,400,401,403,409,503");
    expected.put("GET /guided-sessions/{id}/result", "200,202,400,401,403,409,503");
    expected.put("GET /guided-sessions/{id}/clarification", "200,204,400,401,403,409,503");
    expected.put("POST /guided-sessions/{id}/clarify", "202,400,401,403,409,503");
    expected.put("POST /guided-sessions/{id}/cancel", "202,400,401,403,409,503");
    expected.put("POST /guided-sessions/{id}/finalize", "200,400,401,403,409,503");
    expected.put("DELETE /v2/runs/{id}", "202,401,403,404,409");
    // STUDIO-OBS-013 C1 (AR-1): the guided recording, getExecutionVideo's status set unchanged.
    expected.put("GET /guided-sessions/{id}/video", "200,206,401,403,404,410,416,503");
    // STUDIO-UNIFY-001.6: the caller's latest terminal attempt per test.
    expected.put("GET /guided-sessions/latest", "200,400,401,403");

    Map<String, String> declared = declaredStatusSets();

    // OBS-007 re-anchor: 34 -> 34. STUDIO-OBS-012A re-anchor: 34 -> 38 (5 removed, 9 added).
    // STUDIO-OBS-013 C1 re-anchor: 38 -> 39 (getGuidedSessionVideo added).
    // STUDIO-OBS-014 C2a re-anchor: 39 -> 38 (claimAdmission deleted, AR-3).
    // STUDIO-OBS-014 C2b re-anchor: 38 -> 43 (five guided-policies operations).
    // STUDIO-OBS-008 P1 re-anchor: 43 -> 44 (getStudioTestCapabilities).
    // STUDIO-UNIFY-001.6 re-anchor: 44 -> 45 (readLatestGuidedAttempts).
    // STUDIO-GOV-001.3 (-5 guided-policies operations) and STUDIO-GOV-001.2 (-8 Studio schedule
    // operations; UI tests are scheduled through /api/v1/schedules, which is not part of this
    // document) re-anchor: 45 -> 32 (STUDIO-UNIFY-001.6's readLatestGuidedAttempts included).
    // The total, asserted separately. Without it, both comparisons below could agree on a set that
    // had silently shrunk to nothing on both sides at once.
    assertThat(declared).as("the document declares a different number of operations").hasSize(32);
    assertThat(expected).hasSize(32);

    assertThat(declared.keySet())
        .as("an operation the document declares that this copy does not name")
        .containsExactlyElementsOf(expected.keySet());
    assertThat(expected.keySet())
        .as("an operation this copy names that the document no longer declares")
        .containsExactlyElementsOf(declared.keySet());
    assertThat(declared)
        .as(
            "an operation's response status set moved. The ONLY movements authorized are story "
                + "10.31's GET /executions/{id}/video gaining 401, 403 and 503 by ADR-002 §24's "
                + "ruling (ESC-1, ESC-2), and studio-vault-secrets adding GET and POST "
                + "/tests/{id}/secrets by ADR-002 §32's ruling, and story 10.46's GET /tests and "
                + "GET /executions gaining 400 for their validated list parameters, and "
                + "OBS006's three internal observed operations and STUDIO-OBS-012A's nine added operations "
                + "and STUDIO-OBS-013's GET /guided-sessions/{id}/video, and STUDIO-OBS-014's "
                + "deletion of POST /internal/studio/executions/{id}/admission (AR-3), and "
                + "STUDIO-OBS-014 C2b's POST /guided-sessions gaining 429 (its five guided-policies "
                + "operations were deleted by STUDIO-GOV-001.3), and STUDIO-OBS-008's "
                + "GET /tests/{id}/capabilities, and "
                + "STUDIO-OBS-009 C9's POST /guided-sessions gaining 422 (C-OBS008-4), and "
                + "STUDIO-UNIFY-001.6's readLatestGuidedAttempts, and STUDIO-GOV-001.2's removal of "
                + "the eight Studio schedule operations. "
                + "Every earlier "
                + "row remains pinned, and a "
                + "row that moves without a ruling is the drift this copy exists to catch")
        .isEqualTo(expected);

    assertThat(pendingOperations())
        .as("story 10.15 removed the last x-not-yet-implemented; none came back here")
        .isEmpty();
    // STUDIO-OBS-008 P1: the capability route is attributed to the story that serves it.
    assertThat(operationFlag("/tests/{id}/capabilities", "get", "x-implemented-by"))
        .as("GET /tests/{id}/capabilities must carry its reviewed implementation attribution")
        .isEqualTo("STUDIO-OBS-008");
    assertThat(operationFlag("/tests/{id}/capabilities", "get", "x-not-yet-implemented"))
        .as("and is implemented rather than a pending contract promise")
        .isNull();
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
    assertSchemaMatchesRecord("ExecutionSnapshot", ExecutionSnapshotDto.class);
    // STUDIO-OBS-008 T0 ruling A1.5 item 15: the replay cause component, beside the snapshot.
    assertSchemaMatchesRecord("ReplayFailure", ReplayFailure.class);
    assertSchemaMatchesRecord("StepResult", StepResult.class);
    assertSchemaMatchesRecord("VideoEvidence", VideoEvidence.class);
    assertSchemaMatchesRecord("RuntimeVersions", RuntimeVersions.class);
    assertSchemaMatchesRecord("Viewport", Viewport.class);
    assertSchemaMatchesRecord("TestConfiguration", TestConfiguration.class);
    assertSchemaMatchesRecord("Variable", StudioVariable.class);
    // TestRequest composes canonical authoring with the metadata record; no v1 request route
    // exists.
    Set<String> requestMetadata = new TreeSet<>(schemaProperties("TestRequest"));
    requestMetadata.removeAll(Set.of("authoringSchemaVersion", "globalContext"));
    assertThat(requestMetadata)
        .isEqualTo(
            Arrays.stream(UITestRequest.class.getRecordComponents())
                .map(RecordComponent::getName)
                .collect(Collectors.toCollection(TreeSet::new)));
    // ADR-002 §16.9 item 4 — a conformance gate is only as wide as its enumeration.
    assertSchemaMatchesRecord("TestDto", UITestDto.class);
    // ADR-002 §32 (studio-vault-secrets).
    assertSchemaMatchesRecord("StudioSecretName", StudioSecretNameDto.class);
    assertSchemaMatchesRecord("StudioSecretList", StudioSecretListDto.class);
    assertSchemaMatchesRecord("StudioSecret", StudioSecretDto.class);
    assertSchemaMatchesRecord("CreateStudioSecretRequest", CreateStudioSecretRequest.class);
  }

  /**
   * STUDIO-OBS-013 AR-1 R1 — the guided result's {@code evidence.video} reuses the public {@code
   * VideoEvidence} shape exactly: same four names as the record and the public schema, and the
   * {@code VideoStatus} vocabulary verbatim, with no runner state ({@code STORED}, {@code PENDING})
   * leaking in.
   */
  @Test
  @SuppressWarnings("unchecked")
  void theGuidedVideoEvidenceIsThePublicVideoEvidenceShape() throws IOException {
    JsonNode guided =
        objectMapper
            .readTree(
                Files.readString(
                    Path.of(
                        "..",
                        "docs",
                        "specs",
                        "studio-observed-authoring",
                        "contracts",
                        "v3",
                        "result.schema.json"),
                    StandardCharsets.UTF_8))
            .path("definitions")
            .path("videoEvidence");
    Set<String> guidedProperties = new TreeSet<>();
    guided.path("properties").fieldNames().forEachRemaining(guidedProperties::add);
    Set<String> recordComponents =
        Arrays.stream(VideoEvidence.class.getRecordComponents())
            .map(RecordComponent::getName)
            .collect(Collectors.toCollection(TreeSet::new));
    assertThat(guidedProperties)
        .as("v3 result#/definitions/videoEvidence vs the VideoEvidence record")
        .isEqualTo(recordComponents)
        .isEqualTo(new TreeSet<>(schemaProperties("VideoEvidence")));

    Set<String> guidedStatuses = new TreeSet<>();
    guided
        .path("properties")
        .path("status")
        .path("enum")
        .forEach(s -> guidedStatuses.add(s.asText()));
    Map<String, Object> schemas =
        (Map<String, Object>) ((Map<String, Object>) contract.get("components")).get("schemas");
    List<String> publicStatuses =
        (List<String>) ((Map<String, Object>) schemas.get("VideoStatus")).get("enum");
    assertThat(guidedStatuses)
        .as("the guided status vocabulary is VideoStatus verbatim")
        .isEqualTo(new TreeSet<>(publicStatuses))
        .doesNotContain("STORED", "PENDING");
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
    assertSchemaMatchesRecord("ProgressAck", ProgressAck.class);
  }

  /**
   * The control for the gate above: the shape that existed before this story <b>fails</b> it.
   *
   * <p>A conformance list is the easiest kind of vacuous test to write — six green assertions prove
   * nothing unless the comparison can go red. {@code RunnerEvidenceBeforeStory1014} is the exact
   * record `DEF-02` was found on: three components, no {@code partial}, while the document had
   * declared the property since ADR-002 §17. This asserts the gate would have caught it, which is
   * the claim AC-24 actually makes.
   */
  @Test
  void theInternalDriftCheckWouldHaveCaughtTheRecordThatCausedDef02() {
    assertThatThrownBy(
            () -> assertSchemaMatchesRecord("RunnerEvidence", RunnerEvidenceBeforeStory1014.class))
        .as("if this does not throw, the six assertions above are decoration")
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
  @SuppressWarnings("unchecked")
  void authoringWriteExamplesUseOnlyCanonicalV2Steps() {
    Map<String, Object> createExamples = createRequestExamples();
    assertThat(createExamples.keySet()).containsExactly("create");

    for (Map.Entry<String, Object> entry : createExamples.entrySet()) {
      Map<String, Object> value = (Map<String, Object>) valueOf(entry.getValue());
      assertThat(value.get("authoringSchemaVersion")).isEqualTo(2);
      List<Map<String, Object>> steps = (List<Map<String, Object>>) value.get("steps");
      assertThat(steps).isNotEmpty();
      for (Map<String, Object> step : steps) {
        assertThat(step.keySet()).containsExactlyInAnyOrder("id", "text");
        assertThat(step.get("id").toString()).matches("[0-9a-f-]{36}");
        assertThat(step.get("text")).isInstanceOf(String.class);
      }
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
    // POST /tests/{id}/validate-variables is kept and documented (STUDIO-OBS-012A AC-2, CLN-12),
    // so it is no longer excluded from the served set.
    return operations;
  }
}
