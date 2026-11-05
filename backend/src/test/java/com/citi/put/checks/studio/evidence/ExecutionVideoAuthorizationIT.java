package com.citi.put.checks.studio.evidence;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.citi.put.checks.studio.StudioExecutionFixtures;
import com.citi.put.checks.studio.StudioService;
import com.citi.put.checks.studio.dispatch.StudioDispatchLedgerStatements;
import com.citi.put.checks.studio.support.ObservedPublicationFixture;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.List;
import java.util.Set;
import java.util.TreeSet;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.stream.Stream;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.Arguments;
import org.junit.jupiter.params.provider.MethodSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.client.TestRestTemplate;
import org.springframework.context.annotation.Import;
import org.springframework.dao.DataAccessException;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.transaction.support.TransactionTemplate;

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
@Import({TestEvidenceStores.class, ObservedPublicationFixture.FreshAuthority.class})
class ExecutionVideoAuthorizationIT {

  @DynamicPropertySource
  static void observedReplay(DynamicPropertyRegistry registry) {
    ObservedPublicationFixture.register(registry);
  }

  private static final String CSI_ID = "60470";
  private static final String OTHER_CSI_ID = "60471";
  private static final String OWNER = "video-owner@citi.com";
  private static final String READER = "video-reader@citi.com";
  private static final String STRANGER = "video-stranger@citi.com";
  private static final int OBJECT_SIZE = 1_400_000;

  /** What the security filter's per-request {@code error.traceId} is replaced with. */
  private static final String TRACE_ID_TOKEN = "\"traceId\":\"<per-request>\"";

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
            .executeTest(
                testId,
                StudioExecutionFixtures.identity(OWNER, CSI_ID, "owner"),
                null,
                ObservedPublicationFixture.request(
                    StudioExecutionFixtures.identity(OWNER, CSI_ID, "owner")))
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
   * The identity set is pinned <b>both ways</b>, because a {@code @MethodSource} row that is
   * deleted <b>deletes its own test</b> rather than failing one.
   *
   * <p>The epic's <b>eighteenth</b> catalogued vacuous shape, and @qa found it here by deleting
   * <b>the wrong-CSI identity — AC-1's most load-bearing row</b> — and watching the class report
   * BUILD SUCCESSFUL at 12 passed. {@link #theMatrixContainsBothAnswers()} did not notice, because
   * the surviving no-ownership row is also denied and satisfied it.
   *
   * <p>Unlike the evidence-state table, this set has <b>no production vocabulary to derive from</b>
   * — these are fixtures, not a domain enum — so the remedy is the other half of the same rule: a
   * <b>deliberate second copy</b>, compared both ways, with the total read rather than floored. A
   * story that legitimately adds or removes an identity edits this list, and that edit <i>is</i>
   * the record. It must not be "simplified" back into a derivation from {@code identities()}, which
   * would restore exactly the hole it closes.
   *
   * <p>Each name is also checked to be non-blank, so a row that lost its label cannot hide inside
   * the set comparison.
   */
  @Test
  void theIdentityMatrixIsPinnedBothWaysAndCarriesItsTotal() {
    Set<String> pinned =
        new TreeSet<>(
            List.of(
                "reader of the execution's CSI",
                "owner of the execution's CSI",
                "a principal on a different CSI",
                "a principal with no ownership at all",
                "no identity headers at all",
                "an administrator"));

    Set<String> present =
        identities()
            .map(arguments -> String.valueOf(arguments.get()[0]))
            .collect(java.util.stream.Collectors.toCollection(TreeSet::new));

    assertThat(present)
        .as(
            "an identity was dropped from the matrix, or added without this pin being updated. "
                + "A deleted @MethodSource row deletes its own test, so nothing else here would fail — "
                + "and the wrong-CSI row is the one AC-1's whole claim rests on")
        .isEqualTo(pinned);
    assertThat(present).as("the matrix's size, read rather than floored").hasSize(pinned.size());
    assertThat(present).allSatisfy(name -> assertThat(name).isNotBlank());

    // …and every pinned identity really is exercised against the route, so the set above is not a
    // list of strings that nothing drives.
    identities()
        .forEach(
            arguments ->
                assertThat(get(videoPath(false), (HttpHeaders) arguments.get()[1]).getStatusCode())
                    .as("%s was pinned but the route did not answer it at all", arguments.get()[0])
                    .isNotNull());
  }

  /**
   * The matrix above is comparative, so it would also be satisfied by a route that answered the
   * same thing to everybody. This says it did not.
   *
   * <p><b>It is not a coverage guard and must not be mistaken for one.</b> @qa measured it staying
   * green with the wrong-CSI identity deleted, because the surviving no-ownership row supplies the
   * {@code 403}. Coverage is {@link #theIdentityMatrixIsPinnedBothWaysAndCarriesItsTotal()}'s job.
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
    // STUDIO-OBS-012A R2 precondition: an observed (bound) execution's CSI cannot move at all.
    assertThatThrownBy(
            () ->
                jdbc.update(
                    "UPDATE ui_test_executions SET csi_id = ? WHERE id = ?",
                    OTHER_CSI_ID,
                    executionId))
        .isInstanceOf(DataAccessException.class)
        .hasMessageContaining("observed execution binding invalid");
    UUID unbound = unboundRecording(testId);
    HttpHeaders reader = VideoEvidenceFixtures.identity(READER, "", CSI_ID + ":viewer");
    assertThat(get(videoPath(unbound, false), reader).getStatusCode().value()).isEqualTo(200);

    jdbc.update("UPDATE ui_test_executions SET csi_id = ? WHERE id = ?", OTHER_CSI_ID, unbound);

    assertThat(get(videoPath(unbound, false), reader).getStatusCode().value())
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
    // STUDIO-OBS-012A R2 precondition: a published test's CSI is pinned by its publication rows.
    assertThatThrownBy(
            () -> jdbc.update("UPDATE ui_tests SET csi_id = ? WHERE id = ?", OTHER_CSI_ID, testId))
        .isInstanceOf(DataIntegrityViolationException.class)
        .hasMessageContaining("foreign key");
    // The parent of the unbound row is an unpublished draft with no secret-use audit rows.
    UUID unpublished =
        new StudioExecutionFixtures(jdbc)
            .seedTest("Video authz unpublished draft", CSI_ID, OWNER, List.of("Go home"));
    UUID unbound = unboundRecording(unpublished);
    HttpHeaders reader = VideoEvidenceFixtures.identity(READER, "", CSI_ID + ":viewer");
    ResponseEntity<byte[]> before = get(videoPath(unbound, false), reader);
    assertThat(before.getStatusCode().value()).isEqualTo(200);

    jdbc.update("UPDATE ui_tests SET csi_id = ? WHERE id = ?", OTHER_CSI_ID, unpublished);

    ResponseEntity<byte[]> after = get(videoPath(unbound, false), reader);
    assertThat(after.getStatusCode().value())
        .as("historical access uses the execution CSI, not a mutable parent lookup (§9.1)")
        .isEqualTo(200);
    assertThat(after.getBody()).isEqualTo(before.getBody());
  }

  /**
   * AC-1: a quarantined row is unreadable by everyone, administrators included.
   *
   * <p><b>The identityless row proves nothing about quarantine any more.</b> Story 10.18b closed
   * ED-02's core-service bypass, so a request with no identity is refused {@code 401} by the
   * security filter before the Studio handler runs. It never reaches the quarantine decision. Its
   * expectation is {@code 401} for that reason, and only for a row that really carries no identity
   * (DEF-09, {@code docs/epics/EPIC-10-RUN-LOG.md}). The claim in this test's name rests on the
   * <b>administrator</b> row. It is served before the quarantine and refused {@code 403} on both
   * verbs after it, and both halves are asserted here.
   */
  @Test
  void aQuarantinedRowIsDeniedToEveryoneIncludingAdministrators() {
    List<HttpHeaders> administrators =
        identities()
            .map(arguments -> (HttpHeaders) arguments.get()[1])
            .filter(ExecutionVideoAuthorizationIT::isAdministrator)
            .toList();
    assertThat(administrators)
        .as("the administrator row carries this test's claim, so it must be in the matrix")
        .hasSize(1);
    assertThat(
            identities()
                .map(arguments -> (HttpHeaders) arguments.get()[1])
                .filter(ExecutionVideoAuthorizationIT::isIdentityless))
        .as("the 401 expectation is an exemption for exactly one identityless row, not a pattern")
        .hasSize(1);
    // STUDIO-OBS-012A R2 precondition: an observed (bound) execution cannot lose its CSI at all.
    assertThatThrownBy(
            () ->
                jdbc.update(
                    "UPDATE ui_test_executions SET csi_id = NULL WHERE id = ?", executionId))
        .isInstanceOf(DataAccessException.class)
        .hasMessageContaining("observed execution binding invalid");
    // The quarantine is seated on an unbound history row, the one shape that may carry no CSI.
    UUID unbound = unboundRecording(testId);
    for (boolean download : new boolean[] {false, true}) {
      assertThat(get(videoPath(unbound, download), administrators.get(0)).getStatusCode().value())
          .as(
              "the control: before quarantine the administrator is served, so the 403 below is "
                  + "the quarantine's and not a refusal the administrator would get anyway")
          .isEqualTo(200);
    }

    jdbc.update("UPDATE ui_test_executions SET csi_id = NULL WHERE id = ?", unbound);

    AtomicInteger administratorRefusals = new AtomicInteger();
    identities()
        .forEach(
            arguments -> {
              HttpHeaders identity = (HttpHeaders) arguments.get()[1];
              boolean identityless = isIdentityless(identity);
              int expected = identityless ? 401 : 403;
              String reason =
                  identityless
                      ? "%s: no identity at all is an authentication refusal (401) from the "
                          + "security filter since 10.18b closed ED-02's bypass. It never reaches "
                          + "the quarantine decision, so it says nothing about quarantine"
                      : "%s: a null-CSI row must be refused (403), and by the snapshot route's "
                          + "own answer";
              ResponseEntity<byte[]> snapshot =
                  get("/api/v1/studio/executions/" + unbound, identity);
              for (boolean download : new boolean[] {false, true}) {
                ResponseEntity<byte[]> answer = get(videoPath(unbound, download), identity);
                assertThat(answer.getStatusCode().value())
                    .as(reason, arguments.get()[0])
                    .isEqualTo(expected)
                    .isEqualTo(snapshot.getStatusCode().value());
                if (isAdministrator(identity)) {
                  administratorRefusals.incrementAndGet();
                }
              }
            });
    assertThat(administratorRefusals.get())
        .as("the administrator was refused the quarantined row on both verbs")
        .isEqualTo(2);
  }

  // ── AC-2: soft deletion moves nothing ────────────────────────────────────

  /**
   * AC-2. The bodies are compared per request, and one of them carries a per-request {@code
   * traceId}. The identityless row's {@code 401} comes from the security filter, and its envelope
   * holds a fresh {@code error.traceId} on every request. A raw comparison of that body can never
   * pass, whatever the soft deletion does (DEF-09(a), {@code docs/epics/EPIC-10-RUN-LOG.md},
   * "DEF-09's byte difference, read rather than guessed"). So exactly that one value is replaced
   * before hashing, and every other byte is still compared. Video bodies and JSON bodies without a
   * traceId are hashed raw. The normalisation is also counted, so an envelope that stops carrying a
   * traceId shows up here instead of turning the normaliser into a silent no-op.
   *
   * <p>That {@code 401} envelope ({@code error} is an object) is not the Studio refusal envelope
   * ({@code error} is a string). This test does not settle that. It is DEF-09(b), and @architect
   * owns it together with ESC-1.
   */
  @Test
  void softDeletingTheParentTestChangesNoAnswerAndNoByte() {
    List<Integer> before = new ArrayList<>();
    List<Fingerprint> beforeBodies = new ArrayList<>();
    identities()
        .forEach(
            arguments -> {
              ResponseEntity<byte[]> answer =
                  get(videoPath(false), (HttpHeaders) arguments.get()[1]);
              before.add(answer.getStatusCode().value());
              beforeBodies.add(fingerprint(answer));
            });

    jdbc.update("UPDATE ui_tests SET deleted_at = NOW() WHERE id = ?", testId);

    List<Integer> after = new ArrayList<>();
    List<Fingerprint> afterBodies = new ArrayList<>();
    identities()
        .forEach(
            arguments -> {
              ResponseEntity<byte[]> answer =
                  get(videoPath(false), (HttpHeaders) arguments.get()[1]);
              after.add(answer.getStatusCode().value());
              afterBodies.add(fingerprint(answer));
            });

    assertThat(after)
        .as("§6.3: historical access survives the parent's soft deletion")
        .isEqualTo(before);
    assertThat(before)
        .as("the matrix still exercises a served row, a refused row and the identityless row")
        .contains(200, 403, 401);
    for (int row = 0; row < before.size(); row++) {
      int normalised = before.get(row) == 401 ? 1 : 0;
      assertThat(beforeBodies.get(row).tracesNormalised())
          .as(
              "row %d (status %d): the per-request traceId is normalised out of exactly the 401 "
                  + "body, and nothing is normalised anywhere else",
              row, before.get(row))
          .isEqualTo(normalised);
      assertThat(afterBodies.get(row).tracesNormalised())
          .as("row %d (status %d), after the soft deletion", row, after.get(row))
          .isEqualTo(normalised);
    }
    assertThat(afterBodies)
        .as(
            "and the served bytes are unchanged (video raw; JSON raw apart from the per-request "
                + "traceId)")
        .isEqualTo(beforeBodies);
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
    return videoPath(executionId, download);
  }

  private String videoPath(UUID execution, boolean download) {
    return "/api/v1/studio/executions/" + execution + "/video" + (download ? "?download=true" : "");
  }

  /**
   * STUDIO-OBS-012A R2: an unbound execution of {@code parentTestId} on {@link #CSI_ID},
   * dispatched, finished and holding a recording exactly as {@link #setUp()} arranges the observed
   * one. Only an unbound row may have its own CSI changed or cleared under the final schema.
   */
  private UUID unboundRecording(UUID parentTestId) {
    UUID unbound =
        new StudioExecutionFixtures(jdbc)
            .unboundExecution(parentTestId, CSI_ID, OWNER, "Production", "PENDING");
    UUID attemptId = video.dispatch(unbound, "video-authz-dispatcher");
    video.finish(unbound, "PASSED", 42_000);
    video.evidence(
        unbound,
        "AVAILABLE",
        Instant.now().plus(7, ChronoUnit.DAYS),
        false,
        "studio/should-never-be-read/decoy.webm");
    store.put(VideoEvidenceFixtures.derivedKey(CSI_ID, parentTestId, unbound, attemptId), object);
    return unbound;
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

  private static boolean isIdentityless(HttpHeaders identity) {
    return !identity.containsKey("X-User-Id");
  }

  private static boolean isAdministrator(HttpHeaders identity) {
    String roles = identity.getFirst("X-User-Roles");
    return roles != null && List.of(roles.split(",")).contains("checks-admin");
  }

  /**
   * A body's digest, and how many per-request trace ids were replaced before it was taken.
   *
   * @param digest SHA-256 of the body, raw apart from the replacement counted next to it
   * @param tracesNormalised how many {@code error.traceId} values were replaced (0 or 1)
   */
  private record Fingerprint(String digest, int tracesNormalised) {}

  /**
   * Hashes a response body. The only change made first is to replace the security filter's
   * per-request {@code error.traceId} value with a fixed token. The replacement is done on the raw
   * text and must match exactly once. Nothing is re-serialised, so every other byte of the body is
   * still compared. A body that is not JSON (the video) is hashed untouched.
   */
  private Fingerprint fingerprint(ResponseEntity<byte[]> response) {
    byte[] body = response.getBody();
    MediaType type = response.getHeaders().getContentType();
    if (body == null || type == null || !type.isCompatibleWith(MediaType.APPLICATION_JSON)) {
      return new Fingerprint(digest(body), 0);
    }
    String text = new String(body, StandardCharsets.UTF_8);
    JsonNode traceId;
    try {
      traceId = objectMapper.readTree(text).path("error").path("traceId");
    } catch (Exception e) {
      return new Fingerprint(digest(body), 0);
    }
    if (!traceId.isTextual()) {
      return new Fingerprint(digest(body), 0);
    }
    String literal;
    try {
      literal = "\"traceId\":" + objectMapper.writeValueAsString(traceId.asText());
    } catch (Exception e) {
      throw new AssertionError(e);
    }
    int first = text.indexOf(literal);
    assertThat(first).as("the traceId must appear verbatim in the body: %s", text).isNotNegative();
    assertThat(text.indexOf(literal, first + 1))
        .as("the traceId literal must appear exactly once, or the replacement is ambiguous")
        .isNegative();
    String normalised =
        text.substring(0, first) + TRACE_ID_TOKEN + text.substring(first + literal.length());
    return new Fingerprint(digest(normalised.getBytes(StandardCharsets.UTF_8)), 1);
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
