package com.citi.put.checks.studio.evidence;

import static org.assertj.core.api.Assertions.assertThat;

import com.citi.put.checks.studio.StudioExecutionFixtures;
import com.citi.put.checks.studio.StudioService;
import com.citi.put.checks.studio.dispatch.StudioDispatchLedgerStatements;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.networknt.schema.JsonSchema;
import com.networknt.schema.JsonSchemaFactory;
import com.networknt.schema.SpecVersion;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.client.TestRestTemplate;
import org.springframework.context.annotation.Import;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.transaction.support.TransactionTemplate;
import org.testcontainers.junit.jupiter.Testcontainers;

/**
 * Story 10.31 AC-7 — the two refusals {@code getExecutionVideo} can actually send, captured as
 * bytes and validated against the schema each one's <b>own producer</b> declares.
 *
 * <p><b>Why this class exists.</b> ADR-002 §25.3 states the gap in its own words: <i>"By reading,
 * no suite validates a {@code 401} body against the document… inferred, not proven."</i> DEF-09(b)
 * (run log, §25.1) read the two bodies byte for byte and found they do not share an envelope —
 * {@code error} is an <b>object</b> in the {@code 401} the platform filter writes and a
 * <b>string</b> in the {@code 403} the Studio handler writes. §25.4 now declares that difference
 * ({@code SessionUnauthorized}/{@code PlatformErrorResponse} against {@code Unauthorized}/{@code
 * ErrorResponse}). This class turns the declaration from a claim into a measurement.
 *
 * <p><b>Why a new class rather than a method on a sibling.</b> {@code ExecutionVideoEvidenceIT}'s
 * own Javadoc scopes it to evidence state, and ADR-002 §24.7 marks {@code
 * ExecutionVideoAuthorizationIT} <i>unaffected</i>. @po ruled a small class instead, so
 * authorization and evidence state stay unmixed.
 *
 * <p><b>Nothing here decides the envelope question.</b> Which shape the application standardises on
 * is O-19 / ADR-003, @architect's with @pm, outside Epic 10 (§25.2). This asserts only what the
 * producers send <em>today</em> and what §25.4 now declares about it.
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@ActiveProfiles("test")
@Import(TestEvidenceStores.class)
@Testcontainers(disabledWithoutDocker = true)
class ExecutionVideoRefusalEnvelopeIT {

  private static final String CSI_ID = "60473";
  private static final String OWNER = "video-envelope-owner@citi.com";

  /**
   * A principal with <b>no CSI ownership at all</b> — the shape AC-7 names as {@code identity(…,
   * "", "")}. The address itself carries nothing; a class-local one keeps this class's seeded rows
   * from colliding with {@code ExecutionVideoAuthorizationIT}'s when both run in the same suite.
   */
  private static final String STRANGER = "video-envelope-stranger@citi.com";

  private static final int OBJECT_SIZE = 4_096;

  @Autowired private TestRestTemplate restTemplate;
  @Autowired private ObjectMapper objectMapper;
  @Autowired private JdbcTemplate jdbc;
  @Autowired private StudioService studioService;
  @Autowired private StudioDispatchLedgerStatements statements;
  @Autowired private TransactionTemplate transactions;
  @Autowired private FakeVideoObjectStore store;

  private UUID executionId;

  @BeforeEach
  void setUp() {
    store.clear();
    StudioExecutionFixtures fixtures = new StudioExecutionFixtures(jdbc);
    VideoEvidenceFixtures video = new VideoEvidenceFixtures(jdbc, statements, transactions);
    fixtures.seedUser(OWNER);
    fixtures.seedUser(STRANGER);
    fixtures.seedCsi(CSI_ID, OWNER);
    UUID testId =
        fixtures.seedRunnableTest("Envelope draft", CSI_ID, OWNER, List.of("Go home")).testId();
    executionId =
        studioService
            .executeTest(testId, StudioExecutionFixtures.identity(OWNER, CSI_ID, "owner"), null)
            .executionId();
    UUID attemptId = video.dispatch(executionId, "video-envelope-dispatcher");
    video.finish(executionId, "PASSED", 12_000);
    video.evidence(executionId, "AVAILABLE", Instant.now().plus(7, ChronoUnit.DAYS), false, null);
    // A real recording sits behind the route, so both refusals below are authorization decisions
    // rather than "there is nothing here" answered by a different code path.
    store.put(
        VideoEvidenceFixtures.derivedKey(CSI_ID, testId, executionId, attemptId),
        VideoEvidenceFixtures.recording(OBJECT_SIZE));
  }

  /**
   * The two refusals, each validated against the schema its own producer declares — and each shown
   * to be rejected by the other's.
   *
   * <p>The cross-rejections are not decoration. Two schemas that both accepted both shapes would
   * make the two positive assertions pass while proving nothing, which is precisely what §25.3
   * could not rule out by reading. {@code ErrorResponse.error} is typed {@code string} and {@code
   * PlatformErrorResponse.error} is typed {@code object}, so each must reject the other's body.
   */
  @Test
  void theTwoRefusalsCarryTheEnvelopesTheirOwnProducersDeclare() throws IOException {
    ResponseEntity<byte[]> unauthenticated = get(videoPath(), VideoEvidenceFixtures.noIdentity());
    ResponseEntity<byte[]> forbidden =
        get(videoPath(), VideoEvidenceFixtures.identity(STRANGER, "", ""));

    assertThat(unauthenticated.getStatusCode().value())
        .as(
            "the premise: a request with no identity headers really is refused 401 by "
                + "BffSessionAuthenticationFilter on this profile. If this is not a 401, everything "
                + "below is validating some other response")
        .isEqualTo(401);
    assertThat(forbidden.getStatusCode().value())
        .as(
            "the premise: a principal with no CSI ownership really is refused 403 by "
                + "StudioAccessDeniedException, through the snapshot route's authorized read")
        .isEqualTo(403);

    // The bytes the server actually returned, never a hand-typed literal standing in for them.
    JsonNode unauthenticatedBody = bodyOf(unauthenticated);
    JsonNode forbiddenBody = bodyOf(forbidden);

    JsonSchema platformEnvelope = componentSchema("PlatformErrorResponse");
    JsonSchema studioEnvelope = componentSchema("ErrorResponse");

    assertThat(platformEnvelope.validate(unauthenticatedBody))
        .as(
            "the 401 is written by the platform authentication filter before any Studio code runs, "
                + "so its body is PlatformErrorResponse (ADR-002 §25.4). Body: %s",
            unauthenticatedBody)
        .isEmpty();
    assertThat(studioEnvelope.validate(forbiddenBody))
        .as(
            "the 403 is written by ChecksExceptionHandler, so its body is ErrorResponse. Body: %s",
            forbiddenBody)
        .isEmpty();

    assertThat(studioEnvelope.validate(unauthenticatedBody))
        .as(
            "ErrorResponse must REJECT the 401 body — its `error` is typed string and the filter "
                + "sends an object. If this were empty, the assertion above would hold for a schema "
                + "that accepts anything (ADR-002 §25.3's own doubt, closed by measurement)")
        .isNotEmpty();
    assertThat(platformEnvelope.validate(forbiddenBody))
        .as("PlatformErrorResponse must REJECT the 403 body — its `error` is typed object")
        .isNotEmpty();
  }

  /**
   * The same finding stated without a validator: one {@code error} parses as an object, the other
   * as a string.
   *
   * <p>Kept separate from the schema assertions on purpose. A regression that collapsed the two
   * envelopes onto one shape would be caught here even if both schemas had been loosened, and the
   * failure would name the shape rather than a validator's message.
   */
  @Test
  void theTwoRefusalBodiesAreNotStructurallyInterchangeable() throws IOException {
    JsonNode unauthenticatedError =
        bodyOf(get(videoPath(), VideoEvidenceFixtures.noIdentity())).path("error");
    JsonNode forbiddenError =
        bodyOf(get(videoPath(), VideoEvidenceFixtures.identity(STRANGER, "", ""))).path("error");

    assertThat(unauthenticatedError.isObject())
        .as(
            "the 401's `error` is an OBJECT carrying code, message and a per-request traceId: %s",
            unauthenticatedError)
        .isTrue();
    assertThat(unauthenticatedError.path("code").asText())
        .as("story 1.5 AC-5 fixes these bytes")
        .isEqualTo("UNAUTHENTICATED");

    assertThat(forbiddenError.isTextual())
        .as("the 403's `error` is a STRING, the Studio refusal code: %s", forbiddenError)
        .isTrue();
    assertThat(forbiddenError.asText())
        .as("StudioAccessDeniedException.CODE, unchanged by this story")
        .isEqualTo("STUDIO_FORBIDDEN");

    assertThat(unauthenticatedError.getNodeType())
        .as(
            "DEF-09(b), re-measured: the two refusals this one route can send do not share an "
                + "envelope. Branch on the status, never on the body (ADR-002 §24.6)")
        .isNotEqualTo(forbiddenError.getNodeType());
  }

  // ── helpers ──────────────────────────────────────────────────────────────

  private JsonNode bodyOf(ResponseEntity<byte[]> response) throws IOException {
    assertThat(response.getBody()).as("the refusal carried no body at all").isNotNull();
    return objectMapper.readTree(new String(response.getBody(), StandardCharsets.UTF_8));
  }

  /**
   * A component schema read <b>live from the frozen document</b>, compiled with the same {@code
   * networknt} {@code V202012} factory this module already uses in {@code ArtifactSchemaDriftTest}
   * and {@code InternalBodyContractConformanceTest}.
   */
  @SuppressWarnings("unchecked")
  private JsonSchema componentSchema(String name) throws IOException {
    Map<String, Object> schema =
        (Map<String, Object>)
            ContractDocument.at(ContractDocument.load().root(), "components", "schemas", name);
    assertThat(schema).as("openapi.yaml declares a %s schema", name).isNotNull();
    return JsonSchemaFactory.getInstance(SpecVersion.VersionFlag.V202012)
        .getSchema(objectMapper.valueToTree(schema));
  }

  private String videoPath() {
    return "/api/v1/studio/executions/" + executionId + "/video";
  }

  private ResponseEntity<byte[]> get(String path, HttpHeaders headers) {
    HttpHeaders sent = new HttpHeaders();
    sent.putAll(headers);
    return restTemplate.exchange(path, HttpMethod.GET, new HttpEntity<>(sent), byte[].class);
  }
}
