package com.citi.put.checks.studio.evidence;

import static org.assertj.core.api.Assertions.assertThat;

import com.citi.put.checks.studio.StudioExecutionFixtures;
import com.citi.put.checks.studio.StudioService;
import com.citi.put.checks.studio.dispatch.StudioDispatchLedgerStatements;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import java.util.stream.Stream;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.Arguments;
import org.junit.jupiter.params.provider.MethodSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.client.TestRestTemplate;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.transaction.support.TransactionTemplate;
import org.testcontainers.junit.jupiter.Testcontainers;

/**
 * Story 10.15 AC-1, AC-2, AC-3, AC-4, AC-19a — who may fetch a recording, and by which decision.
 *
 * <p><b>Every claim here is comparative, and that is deliberate.</b> `ED-02`'s identity bypass is
 * still live on this branch — story 10.18 closes it — so an absolute claim of the form <i>"this
 * identity cannot read anything"</i> is not decidable here: a request with no headers at all is
 * answered by the hardcoded core-service bypass with an admin identity. What <em>is</em> decidable,
 * and is what §9.1 actually requires, is that this route answers <b>exactly what {@code GET
 * /executions/{id}} answers</b> for the identical identity and the identical id. That holds
 * whatever the bypass does, and it is asserted by driving both routes in the same test and
 * comparing the two responses rather than by asserting a literal status anywhere.
 *
 * <p>The absolute half — real {@code 401}/{@code 403} through the real ingress against a
 * non-bypassed session — is AC-19b, which is <b>skipped, never passed</b>, blocked on `ED-06`.
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@ActiveProfiles("test")
@Testcontainers(disabledWithoutDocker = true)
class ExecutionVideoAuthorizationIT {

  private static final String CSI_ID = "60470";
  private static final String OTHER_CSI_ID = "60471";
  private static final String OWNER = "video-owner@citi.com";
  private static final String READER = "video-reader@citi.com";
  private static final String STRANGER = "video-stranger@citi.com";
  private static final int OBJECT_SIZE = 1_400_000;

  @Autowired private TestRestTemplate restTemplate;
  @Autowired private ObjectMapper objectMapper;
  @Autowired private JdbcTemplate jdbc;
  @Autowired private StudioService studioService;
  @Autowired private StudioDispatchLedgerStatements statements;
  @Autowired private TransactionTemplate transactions;
  @Autowired private FakeVideoObjectStore store;

  private VideoEvidenceFixtures video;
  private UUID testId;
  private UUID executionId;
  private byte[] object;

  @BeforeEach
  void setUp() {
    store.clear();
    StudioExecutionFixtures fixtures = new StudioExecutionFixtures(jdbc);
    video = new VideoEvidenceFixtures(jdbc, statements, transactions);
    fixtures.seedUser(OWNER);
    fixtures.seedUser(READER);
    fixtures.seedUser(STRANGER);
    fixtures.seedCsi(CSI_ID, OWNER);
    fixtures.seedCsi(OTHER_CSI_ID, OWNER);
    testId =
        fixtures.seedRunnableTest("Video authz draft", CSI_ID, OWNER, List.of("Go home")).testId();
    executionId =
        studioService
            .executeTest(testId, StudioExecutionFixtures.identity(OWNER, CSI_ID, "owner"), null)
            .executionId();
    UUID attemptId = video.dispatch(executionId, "video-authz-dispatcher");
    video.finish(executionId, "PASSED", 42_000);
    video.evidence(
        executionId,
        "AVAILABLE",
        Instant.now().plus(7, ChronoUnit.DAYS),
        false,
        "studio/should-never-be-read/decoy.webm");
    object = VideoEvidenceFixtures.recording(OBJECT_SIZE);
    store.put(VideoEvidenceFixtures.derivedKey(CSI_ID, testId, executionId, attemptId), object);
  }

  // ── AC-1 / AC-3: one decision, both verbs, never a literal ───────────────

  static Stream<Arguments> identities() {
    return Stream.of(
        Arguments.of(
            "reader of the execution's CSI",
            VideoEvidenceFixtures.identity(READER, "", CSI_ID + ":viewer")),
        Arguments.of(
            "owner of the execution's CSI",
            VideoEvidenceFixtures.identity(OWNER, "", CSI_ID + ":owner")),
        Arguments.of(
            "a principal on a different CSI",
            VideoEvidenceFixtures.identity(STRANGER, "", OTHER_CSI_ID + ":owner")),
        Arguments.of(
            "a principal with no ownership at all",
            VideoEvidenceFixtures.identity(STRANGER, "", "")),
        Arguments.of("no identity headers at all", VideoEvidenceFixtures.noIdentity()),
        Arguments.of(
            "an administrator", VideoEvidenceFixtures.identity(OWNER, "checks-admin", "")));
  }

  @ParameterizedTest(name = "AC-1/AC-3 — {0}")
  @MethodSource("identities")
  void theVideoRouteAnswersWhatTheSnapshotRouteAnswers(String name, HttpHeaders identity) {
    ResponseEntity<byte[]> snapshot = get("/api/v1/studio/executions/" + executionId, identity);
    ResponseEntity<byte[]> play = get(videoPath(false), identity);
    ResponseEntity<byte[]> download = get(videoPath(true), identity);

    // AC-3: the download verb is the same authorization decision, not a second one. Asserted
    // against the play verb *and* against the snapshot route, so a download branch that forgot a
    // check fails here rather than in whichever test someone remembered to write for it.
    assertThat(play.getStatusCode().value())
        .as("%s: the video route and the snapshot route disagree about this identity", name)
        .isEqualTo(snapshot.getStatusCode().value());
    assertThat(download.getStatusCode().value())
        .as("%s: ?download=true took a different authorization decision from the play verb", name)
        .isEqualTo(play.getStatusCode().value());

    if (snapshot.getStatusCode().is2xxSuccessful()) {
      assertThat(play.getBody())
          .as("%s: served, so the whole object comes back", name)
          .isEqualTo(object);
      assertThat(download.getBody()).isEqualTo(object);
    } else {
      assertThat(errorOf(play))
          .as("%s: the refusal code differs from the snapshot route's", name)
          .isEqualTo(errorOf(snapshot));
      assertThat(errorOf(download)).isEqualTo(errorOf(play));
    }
  }

  /**
   * The matrix above is comparative, so it would also be satisfied by a route that answered the
   * same thing to everybody. This says it did not.
   */
  @Test
  void theMatrixContainsBothAnswers() {
    List<Integer> statuses = new ArrayList<>();
    identities()
        .forEach(
            arguments ->
                statuses.add(
                    get(videoPath(false), (HttpHeaders) arguments.get()[1])
                        .getStatusCode()
                        .value()));

    assertThat(statuses)
        .as("every identity got the same answer, so the comparison above discriminates nothing")
        .contains(200)
        .contains(403);
  }

  // ── AC-1's two discriminating mutations ──────────────────────────────────

  /**
   * (a) The execution's own CSI moves the answer. A route that ignored CSI entirely would fail this
   * and pass (b) below.
   */
  @Test
  void movingTheExecutionRowsOwnCsiFlipsTheAnswer() {
    HttpHeaders reader = VideoEvidenceFixtures.identity(READER, "", CSI_ID + ":viewer");
    assertThat(get(videoPath(false), reader).getStatusCode().value()).isEqualTo(200);

    jdbc.update("UPDATE ui_test_executions SET csi_id = ? WHERE id = ?", OTHER_CSI_ID, executionId);

    assertThat(get(videoPath(false), reader).getStatusCode().value())
        .as("the execution's own immutable CSI is what this route authorizes against")
        .isEqualTo(403);
  }

  /**
   * (b) The parent test's CSI does not. A route that resolved CSI through a parent lookup would
   * pass (a) above and fail this — which is the pair that separates a correct route from a
   * plausible one.
   */
  @Test
  void movingTheParentTestsCsiDoesNotChangeTheAnswer() {
    HttpHeaders reader = VideoEvidenceFixtures.identity(READER, "", CSI_ID + ":viewer");
    ResponseEntity<byte[]> before = get(videoPath(false), reader);
    assertThat(before.getStatusCode().value()).isEqualTo(200);

    jdbc.update("UPDATE ui_tests SET csi_id = ? WHERE id = ?", OTHER_CSI_ID, testId);

    ResponseEntity<byte[]> after = get(videoPath(false), reader);
    assertThat(after.getStatusCode().value())
        .as("historical access uses the execution CSI, not a mutable parent lookup (§9.1)")
        .isEqualTo(200);
    assertThat(after.getBody()).isEqualTo(before.getBody());
  }

  /** AC-1: a quarantined row is unreadable by everyone, administrators included. */
  @Test
  void aQuarantinedRowIsDeniedToEveryoneIncludingAdministrators() {
    jdbc.update("UPDATE ui_test_executions SET csi_id = NULL WHERE id = ?", executionId);

    identities()
        .forEach(
            arguments -> {
              HttpHeaders identity = (HttpHeaders) arguments.get()[1];
              ResponseEntity<byte[]> snapshot =
                  get("/api/v1/studio/executions/" + executionId, identity);
              for (boolean download : new boolean[] {false, true}) {
                ResponseEntity<byte[]> answer = get(videoPath(download), identity);
                assertThat(answer.getStatusCode().value())
                    .as(
                        "%s: a null-CSI row must be refused, and by the snapshot route's own answer",
                        arguments.get()[0])
                    .isEqualTo(403)
                    .isEqualTo(snapshot.getStatusCode().value());
              }
            });
  }

  // ── AC-2: soft deletion moves nothing ────────────────────────────────────

  @Test
  void softDeletingTheParentTestChangesNoAnswerAndNoByte() {
    List<Integer> before = new ArrayList<>();
    List<String> beforeBodies = new ArrayList<>();
    identities()
        .forEach(
            arguments -> {
              ResponseEntity<byte[]> answer =
                  get(videoPath(false), (HttpHeaders) arguments.get()[1]);
              before.add(answer.getStatusCode().value());
              beforeBodies.add(digest(answer.getBody()));
            });

    jdbc.update("UPDATE ui_tests SET deleted_at = NOW() WHERE id = ?", testId);

    List<Integer> after = new ArrayList<>();
    List<String> afterBodies = new ArrayList<>();
    identities()
        .forEach(
            arguments -> {
              ResponseEntity<byte[]> answer =
                  get(videoPath(false), (HttpHeaders) arguments.get()[1]);
              after.add(answer.getStatusCode().value());
              afterBodies.add(digest(answer.getBody()));
            });

    assertThat(after)
        .as("§6.3: historical access survives the parent's soft deletion")
        .isEqualTo(before);
    assertThat(afterBodies).as("and the served bytes are unchanged").isEqualTo(beforeBodies);
    assertThat(
            get(
                    "/api/v1/studio/tests/" + testId,
                    VideoEvidenceFixtures.identity(READER, "", CSI_ID + ":viewer"))
                .getStatusCode()
                .value())
        .as("the control: the parent really is gone")
        .isEqualTo(403);
  }

  // ── AC-4: no credential is accepted in the URL, and none is needed ───────

  /**
   * A query parameter grants nothing and costs nothing.
   *
   * <p>Three comparisons, none of them absolute, for the `ED-02` reason stated on the class: a
   * token parameter must not change any of the three answers the route already gives.
   */
  @Test
  void noQueryParameterIsEverACredential() {
    String tokens = "?token=secret&access_token=secret&Authorization=Bearer%20secret";
    HttpHeaders reader = VideoEvidenceFixtures.identity(READER, "", CSI_ID + ":viewer");
    HttpHeaders denied = VideoEvidenceFixtures.identity(STRANGER, "", OTHER_CSI_ID + ":owner");

    ResponseEntity<byte[]> served = get(videoPath(false), reader);
    ResponseEntity<byte[]> servedWithTokens = get(videoPath(false) + tokens, reader);
    assertThat(servedWithTokens.getStatusCode().value()).isEqualTo(served.getStatusCode().value());
    assertThat(servedWithTokens.getBody())
        .as("an authorized caller is served identically whether or not the URL carries a token")
        .isEqualTo(served.getBody());

    ResponseEntity<byte[]> refused = get(videoPath(false), denied);
    ResponseEntity<byte[]> refusedWithTokens = get(videoPath(false) + tokens, denied);
    assertThat(refusedWithTokens.getStatusCode().value())
        .as("a token parameter must not elevate a caller the session did not authorize")
        .isEqualTo(refused.getStatusCode().value())
        .isEqualTo(403);
    assertThat(errorOf(refusedWithTokens)).isEqualTo(errorOf(refused));

    ResponseEntity<byte[]> anonymous = get(videoPath(false), VideoEvidenceFixtures.noIdentity());
    ResponseEntity<byte[]> anonymousWithTokens =
        get(videoPath(false) + tokens, VideoEvidenceFixtures.noIdentity());
    assertThat(anonymousWithTokens.getStatusCode().value())
        .as(
            "a request with no session answers the same with a token parameter as without one; "
                + "the absolute claim about an unauthenticated caller is AC-19b's, blocked on ED-02")
        .isEqualTo(anonymous.getStatusCode().value());
  }

  // ── AC-19a: the decision precedes any media type ─────────────────────────

  /**
   * A {@code <video>} element sends {@code Accept: video/webm}. A handler that declared {@code
   * produces = "video/webm"} would make content negotiation render this refusal as a {@code 406} or
   * a {@code 500}; the merged SSE controller records avoiding exactly this trap for the SSE route.
   */
  @Test
  void aDenialUnderAVideoAcceptHeaderIsStillTheSnapshotRoutesJsonRefusal() {
    HttpHeaders denied = VideoEvidenceFixtures.identity(STRANGER, "", OTHER_CSI_ID + ":owner");
    denied.setAccept(List.of(MediaType.parseMediaType("video/webm")));

    ResponseEntity<byte[]> refused = get(videoPath(false), denied);
    ResponseEntity<byte[]> snapshot = get("/api/v1/studio/executions/" + executionId, denied);

    assertThat(refused.getStatusCode().value())
        .as("the authorization decision is taken before any media type is committed")
        .isEqualTo(403)
        .isEqualTo(snapshot.getStatusCode().value());
    assertThat(refused.getHeaders().getContentType())
        .isNotNull()
        .satisfies(type -> assertThat(type.includes(MediaType.APPLICATION_JSON)).isTrue());
    assertThat(errorOf(refused)).isEqualTo(errorOf(snapshot));
  }

  // ── helpers ──────────────────────────────────────────────────────────────

  private String videoPath(boolean download) {
    return "/api/v1/studio/executions/"
        + executionId
        + "/video"
        + (download ? "?download=true" : "");
  }

  private ResponseEntity<byte[]> get(String path, HttpHeaders headers) {
    return restTemplate.exchange(path, HttpMethod.GET, new HttpEntity<>(headers), byte[].class);
  }

  private String errorOf(ResponseEntity<byte[]> response) {
    byte[] body = response.getBody();
    if (body == null) {
      return null;
    }
    try {
      JsonNode parsed = objectMapper.readTree(new String(body, StandardCharsets.UTF_8));
      return parsed.path("error").asText(null);
    } catch (Exception e) {
      return "<not json>";
    }
  }

  private static String digest(byte[] body) {
    if (body == null) {
      return "<null>";
    }
    try {
      return java.util.HexFormat.of()
          .formatHex(java.security.MessageDigest.getInstance("SHA-256").digest(body));
    } catch (java.security.NoSuchAlgorithmException e) {
      throw new AssertionError(e);
    }
  }
}
