package com.citi.put.checks.studio.evidence;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.citi.put.checks.studio.StudioExecutionFixtures;
import com.citi.put.checks.studio.StudioService;
import com.citi.put.checks.studio.dispatch.StudioDispatchLedgerStatements;
import com.citi.put.checks.studio.dto.VideoEvidence;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.networknt.schema.JsonSchema;
import com.networknt.schema.JsonSchemaFactory;
import com.networknt.schema.SpecVersion;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.TreeSet;
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
import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.transaction.support.TransactionTemplate;
import org.testcontainers.junit.jupiter.Testcontainers;

/**
 * Story 10.15 AC-5, AC-6, AC-7, AC-8, AC-9, AC-10, AC-11, AC-17 — what the route serves, what it
 * refuses, and what it is allowed to say about either.
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@ActiveProfiles("test")
@Testcontainers(disabledWithoutDocker = true)
class ExecutionVideoEvidenceIT {

  private static final String CSI_ID = "60472";
  private static final String OWNER = "video-evidence-owner@citi.com";
  private static final String READER = "video-evidence-reader@citi.com";

  /** Bigger than every boundary any case here uses, and not equal to any column on the row. */
  private static final int OBJECT_SIZE = 1_310_721;

  /**
   * The nested envelope the platform's servlet filters write, used only as a <b>control</b>: it is
   * the shape {@code ErrorResponse} must reject, so a schema that had quietly become permissive
   * cannot pass AC-6's validity assertion.
   */
  private static final String PLATFORM_ENVELOPE_BODY =
      "{\"error\":{\"code\":\"UNAUTHENTICATED\",\"message\":\"Session required\"}}";

  @Autowired private TestRestTemplate restTemplate;
  @Autowired private ObjectMapper objectMapper;
  @Autowired private JdbcTemplate jdbc;
  @Autowired private StudioService studioService;
  @Autowired private StudioDispatchLedgerStatements statements;
  @Autowired private TransactionTemplate transactions;
  @Autowired private FakeVideoObjectStore store;
  @Autowired private VideoStoreProperties storeProperties;

  private StudioExecutionFixtures fixtures;
  private VideoEvidenceFixtures video;
  private UUID testId;
  private UUID executionId;
  private UUID attemptId;
  private String derivedKey;
  private byte[] object;

  @BeforeEach
  void setUp() {
    store.clear();
    fixtures = new StudioExecutionFixtures(jdbc);
    video = new VideoEvidenceFixtures(jdbc, statements, transactions);
    fixtures.seedUser(OWNER);
    fixtures.seedUser(READER);
    fixtures.seedCsi(CSI_ID, OWNER);
    testId =
        fixtures.seedRunnableTest("Evidence draft", CSI_ID, OWNER, List.of("Go home")).testId();
    executionId = newExecution();
    attemptId = video.dispatch(executionId, "video-evidence-dispatcher");
    derivedKey = VideoEvidenceFixtures.derivedKey(CSI_ID, testId, executionId, attemptId);
    object = VideoEvidenceFixtures.recording(OBJECT_SIZE);
    store.put(derivedKey, object);
    video.finish(executionId, "PASSED", 600_000);
    video.evidence(executionId, "AVAILABLE", Instant.now().plus(7, ChronoUnit.DAYS), false, null);
  }

  private UUID newExecution() {
    return studioService
        .executeTest(testId, StudioExecutionFixtures.identity(OWNER, CSI_ID, "owner"), null)
        .executionId();
  }

  // ── AC-5: the key is derived, never read back from the wire ──────────────

  /**
   * Two objects, and the discriminating one is the decoy.
   *
   * <p>The derived key holds A; a different key holds B; the execution row's persisted {@code
   * video_key} points at B. §6.2 says client-supplied keys are never trusted, so the route must
   * serve A. An implementation that read the column serves B and this goes red on bytes.
   */
  @Test
  void aPersistedRunnerSuppliedKeyCannotRedirectTheRead() {
    byte[] decoy = VideoEvidenceFixtures.recording(OBJECT_SIZE / 2);
    String decoyKey = "studio/" + CSI_ID + "/" + testId + "/" + UUID.randomUUID() + "/decoy.webm";
    store.put(decoyKey, decoy);
    video.evidence(
        executionId, "AVAILABLE", Instant.now().plus(7, ChronoUnit.DAYS), false, decoyKey);

    ResponseEntity<byte[]> served = get(videoPath(false), reader());

    assertThat(served.getStatusCode().value()).isEqualTo(200);
    assertThat(served.getBody())
        .as("the route served the object the persisted video_key pointed at")
        .isEqualTo(object)
        .isNotEqualTo(decoy);
    assertThat(served.getHeaders().getContentLength())
        .as("and stated the derived object's length, not the decoy's")
        .isEqualTo(OBJECT_SIZE);
  }

  // ── AC-6: nothing in any response is a key, a bucket, a host or a URL ────

  /**
   * Every status this route can answer, captured whole — status line, every header, the whole body
   * — and checked against four separate families of forbidden value.
   *
   * <p>This is the criterion the story names as its second weakest, for the reason it names: an
   * assertion of the form {@code body.doesNotContain(key)} run over a response that never had a
   * chance to contain the key proves nothing. Two things mitigate it here. It runs over <b>six</b>
   * statuses rather than the happy one, including the unreachable-store path whose <b>cause message
   * really does carry the bucket and the endpoint</b> — a live leak path, not a hypothetical one.
   * And {@link #theHygieneAssertionCanActuallyFail()} shows the same predicate failing.
   */
  @Test
  void noResponseCarriesAKeyAPrefixABucketAnEndpointOrAUrl() {
    List<String> captured = new ArrayList<>();

    captured.add(capture(get(videoPath(false), reader())));
    captured.add(capture(get(videoPath(false), reader(), "bytes=0-1023")));
    captured.add(capture(get(videoPath(true), reader())));
    captured.add(capture(get(videoPath(false), reader(), "bytes=" + (OBJECT_SIZE + 10) + "-")));

    video.evidence(executionId, "FAILED", null, false, null);
    captured.add(capture(get(videoPath(false), reader())));

    video.evidence(executionId, "AVAILABLE", Instant.now().minusSeconds(60), false, null);
    captured.add(capture(get(videoPath(false), reader())));

    video.evidence(executionId, "AVAILABLE", Instant.now().plusSeconds(600), false, null);
    store.makeUnreachable();
    captured.add(capture(get(videoPath(false), reader())));
    store.makeReachable();

    assertThat(captured).hasSize(7);
    captured.forEach(this::assertCarriesNoStoreDetail);
  }

  /** The control the story calls mandatory: the predicate above is shown failing. */
  @Test
  void theHygieneAssertionCanActuallyFail() {
    for (String leak :
        List.of(
            "200 x-debug: " + derivedKey,
            "200 body: studio/60472/whatever",
            "200 x-bucket: " + storeProperties.bucketOrDefault(),
            "200 x-endpoint: " + storeProperties.endpointOrDefault(),
            "200 body: http://sonic.example/object")) {
      assertThatThrownBy(() -> assertCarriesNoStoreDetail(leak))
          .as("the hygiene predicate did not catch %s", leak)
          .isInstanceOf(AssertionError.class);
    }
  }

  private void assertCarriesNoStoreDetail(String captured) {
    assertThat(captured).doesNotContain(derivedKey);
    assertThat(captured).doesNotContain("studio/");
    assertThat(captured).doesNotContain(storeProperties.bucketOrDefault());
    assertThat(captured).doesNotContain(storeProperties.endpointOrDefault());
    assertThat(captured).doesNotContain("http://");
    assertThat(captured).doesNotContain("https://");
  }

  // ── AC-7: five states, and the two surfaces compared ─────────────────────

  static Stream<Arguments> evidenceStates() {
    return Stream.of(
        Arguments.of("PROCESSING", 404),
        Arguments.of("AVAILABLE", 200),
        Arguments.of("FAILED", 404),
        Arguments.of("UNAVAILABLE", 404),
        Arguments.of("EXPIRED", 410));
  }

  /**
   * The case table above is an editable literal enumerated with {@code @MethodSource}, and a
   * deleted row <b>deletes its own test</b> rather than failing one — the epic's <b>eighteenth</b>
   * catalogued vacuous shape, found here by @qa, who removed {@code UNAVAILABLE} and watched the
   * class report BUILD SUCCESSFUL at 13 passed.
   *
   * <p>The remedy is the one this story already built for the Range table, in the form §6.1's
   * vocabulary makes available: <b>the required set is derived, not transcribed</b>. {@link
   * VideoEvidence} declares the five states as public constants, so they are read off the
   * production type by reflection and compared with the table <b>both ways</b>. Deleting a row
   * fails here; adding a sixth state to {@code VideoEvidence} without answering it fails here too.
   *
   * <p>The total is asserted separately, because a set comparison alone is satisfied by a
   * collection that has silently stopped collecting, and a floor would not be a guard.
   */
  @Test
  void theFiveStateCaseTableCoversEveryStateTheDtoDeclaresAndNoOther() {
    Set<String> declared = statesDeclaredByTheProductionType();
    Set<String> covered =
        evidenceStates()
            .map(arguments -> String.valueOf(arguments.get()[0]))
            .collect(java.util.stream.Collectors.toCollection(TreeSet::new));

    assertThat(declared)
        .as("VideoEvidence declares no state constants at all, so the comparison below is vacuous")
        .isNotEmpty();
    assertThat(covered)
        .as(
            "the case table and §6.1's vocabulary disagree: a state was dropped from the table, or "
                + "one was added to VideoEvidence without this route being taught to answer it")
        .isEqualTo(declared);
    assertThat(covered)
        .as("the table's size, read rather than floored — a @MethodSource row deletes its own test")
        .hasSize(declared.size());
  }

  /** §6.1's five states, read off the production type rather than transcribed here. */
  private static Set<String> statesDeclaredByTheProductionType() {
    Set<String> states = new TreeSet<>();
    for (java.lang.reflect.Field field : VideoEvidence.class.getDeclaredFields()) {
      int modifiers = field.getModifiers();
      if (java.lang.reflect.Modifier.isPublic(modifiers)
          && java.lang.reflect.Modifier.isStatic(modifiers)
          && java.lang.reflect.Modifier.isFinal(modifiers)
          && field.getType() == String.class) {
        try {
          states.add(String.valueOf(field.get(null)));
        } catch (IllegalAccessException e) {
          throw new AssertionError("could not read " + field.getName(), e);
        }
      }
    }
    return states;
  }

  @ParameterizedTest(name = "AC-7 — {0} answers {1}")
  @MethodSource("evidenceStates")
  void everyEvidenceStateIsAnsweredAndBothSurfacesAgree(String state, int expectedStatus)
      throws IOException {
    applyState(state);

    ResponseEntity<byte[]> answer = get(videoPath(false), reader());
    String published = snapshot().path("video").path("status").asText();
    int answered = answer.getStatusCode().value();

    // (i) A fixture check, and it is labelled as one. It is NOT a comparison of two surfaces —
    // @qa measured the old wording printing a cross-surface drift message for a single-surface
    // mismatch, which is shape 16's sub-form: a message claiming a discriminator its assertion
    // does not have.
    assertThat(published)
        .as(
            "the fixture set up '%s' but the snapshot publishes '%s', so this case is about a "
                + "different row than the one it names",
            state, published)
        .isEqualTo(state);

    // (ii) THE cross-surface comparison. The expectation is derived from what the snapshot route
    // actually published, not from the table — so a route that grew its own second derivation of
    // evidence state fails here even when the table would still have accepted its answer.
    assertThat(answered)
        .as(
            "the two surfaces disagree: the snapshot publishes '%s', which this route must answer "
                + "%d for, and it answered %d",
            published, statusForPublishedState(published), answered)
        .isEqualTo(statusForPublishedState(published));

    // (iii) …and the table's own column, which is the pinned second copy of that mapping.
    assertThat(answered).isEqualTo(expectedStatus);

    if (expectedStatus == 200) {
      assertThat(answer.getBody()).isEqualTo(object);
      return;
    }
    JsonNode error = objectMapper.readTree(new String(answer.getBody(), StandardCharsets.UTF_8));
    assertThat(error.path("error").asText()).isNotBlank();
    assertThat(error.path("message").asText()).isNotBlank();
    if (expectedStatus == 410) {
      assertThat(error.path("error").asText())
          .as("the 410 code is read from the contract's own expired example, never transcribed")
          .isEqualTo(expiredCodeFromContract());
    }
  }

  /**
   * What the route must answer for a state the <b>snapshot published</b> (§6.1, §6.3).
   *
   * <p>Keyed on the published value rather than on the case table's parameter, which is what makes
   * the assertion above a comparison of two surfaces instead of two copies of one expectation.
   */
  private static int statusForPublishedState(String publishedState) {
    if (VideoEvidence.AVAILABLE.equals(publishedState)) {
      return 200;
    }
    if (VideoEvidence.EXPIRED.equals(publishedState)) {
      return 410;
    }
    return 404;
  }

  /** The code the frozen document's {@code expired} example carries, read at test time. */
  private static String expiredCodeFromContract() throws IOException {
    ContractDocument document = ContractDocument.load();
    Object value =
        ContractDocument.at(
            document.getOperation(ContractDocument.VIDEO_PATH),
            "responses",
            "410",
            "content",
            "application/json",
            "examples",
            "expired",
            "value",
            "error");
    assertThat(value).as("the contract's 410 expired example lost its error code").isNotNull();
    return String.valueOf(value);
  }

  // ── AC-8 / AC-9: logical expiry beats a physically present object ────────

  /**
   * The object is there, readable, and the answer is still {@code 410}.
   *
   * <p>The fixture is the criterion: the bytes really are at the derived key and really are
   * readable, so removing the expiry comparison reddens this with a {@code 200} <b>carrying the
   * object's bytes</b> rather than with a missing-object error. That distinction is the whole
   * discriminator — §6.2 forbids assuming physical lifecycle deletion has happened.
   */
  @Test
  void aLogicallyExpiredRecordingIsRefusedWhileItsBytesAreStillThere() throws IOException {
    video.evidence(executionId, "AVAILABLE", Instant.now().minusSeconds(3600), false, null);

    assertThat(store.metadata(derivedKey))
        .as("the object must actually be present, or this test passes for the wrong reason")
        .get()
        .isEqualTo(new VideoObjectMetadata(OBJECT_SIZE));
    assertThat(store.read(derivedKey, 0, 9))
        .as("and readable")
        .isEqualTo(java.util.Arrays.copyOfRange(object, 0, 10));

    ResponseEntity<byte[]> answer = get(videoPath(false), reader());

    // Asserted FIRST, and on the payload rather than on the status, because the criterion is about
    // WHICH failure the falsifying mutation produces: removing the expiry comparison must redden
    // this with a 200 carrying the object's bytes, not with a missing-object error. The message
    // below is what makes that visible in the recorded falsification.
    assertThat(answer.getBody().length)
        .as(
            "the refusal carried the recording: the answer was %d with %d bytes, and the object at"
                + " the derived key is %d bytes",
            answer.getStatusCode().value(), answer.getBody().length, OBJECT_SIZE)
        .isNotEqualTo(OBJECT_SIZE);
    assertThat(answer.getStatusCode().value()).isEqualTo(410);
    assertThat(new String(answer.getBody(), StandardCharsets.UTF_8))
        .contains(expiredCodeFromContract());
    assertThat(answer.getBody())
        .as("and nothing of the object came back")
        .isNotEqualTo(java.util.Arrays.copyOfRange(object, 0, answer.getBody().length));
  }

  /**
   * AC-9 — the clock is the only thing that moves the answer.
   *
   * <p>The row is written once and never touched again; only wall-clock time passes between the two
   * requests. The first half is also AC-8's control: a row whose expiry is in the future is served,
   * so "always 410" does not satisfy this.
   */
  @Test
  void onlyTheClockMovesTheExpiryAnswer() throws InterruptedException {
    Instant expiry = Instant.now().plusMillis(2_500);
    video.evidence(executionId, "AVAILABLE", expiry, false, null);

    ResponseEntity<byte[]> before = get(videoPath(false), reader());
    assertThat(before.getStatusCode().value())
        .as("before videoExpiresAt the same row is served")
        .isEqualTo(200);
    assertThat(before.getBody()).isEqualTo(object);

    while (Instant.now().isBefore(expiry.plusMillis(250))) {
      Thread.sleep(100);
    }

    assertThat(get(videoPath(false), reader()).getStatusCode().value())
        .as("and after it, with nothing else changed, the same row is 410")
        .isEqualTo(410);
  }

  // ── AC-10: partiality is served, not repaired and not advertised ─────────

  /**
   * Two rows identical but for {@code video_partial}, holding the same bytes, answering
   * byte-identically — on the full path and on the ranged one.
   */
  @Test
  void aPartialRecordingIsServedExactlyAsACompleteOne() {
    UUID completeExecution = executionId;
    UUID partialExecution = newExecution();
    UUID partialAttempt = video.dispatch(partialExecution, "video-evidence-dispatcher");
    store.put(
        VideoEvidenceFixtures.derivedKey(CSI_ID, testId, partialExecution, partialAttempt), object);
    video.finish(partialExecution, "PASSED", 600_000);
    Instant expiry = Instant.now().plus(7, ChronoUnit.DAYS);
    video.evidence(completeExecution, "AVAILABLE", expiry, false, null);
    video.evidence(partialExecution, "AVAILABLE", expiry, true, null);

    ResponseEntity<byte[]> completeFull = get(path(completeExecution, false), reader());
    ResponseEntity<byte[]> partialFull = get(path(partialExecution, false), reader());
    ResponseEntity<byte[]> completeRange =
        get(path(completeExecution, false), reader(), "bytes=100-100099");
    ResponseEntity<byte[]> partialRange =
        get(path(partialExecution, false), reader(), "bytes=100-100099");

    assertSameWireShape("full", completeFull, partialFull);
    assertSameWireShape("ranged", completeRange, partialRange);
    assertThat(completeRange.getHeaders().getFirst("Content-Range"))
        .isEqualTo(partialRange.getHeaders().getFirst("Content-Range"));

    // …and the control: the platform really does know they differ. If it did not, the criterion
    // would be satisfied by a platform that cannot represent partiality at all.
    assertThat(snapshotOf(partialExecution).path("video").path("partial").asBoolean()).isTrue();
    assertThat(snapshotOf(completeExecution).path("video").path("partial").asBoolean()).isFalse();
  }

  private void assertSameWireShape(
      String which, ResponseEntity<byte[]> left, ResponseEntity<byte[]> right) {
    assertThat(right.getStatusCode().value())
        .as("%s: status", which)
        .isEqualTo(left.getStatusCode().value());
    assertThat(right.getHeaders().getContentType())
        .as("%s: Content-Type", which)
        .isEqualTo(left.getHeaders().getContentType());
    assertThat(right.getHeaders().getContentLength())
        .as("%s: Content-Length", which)
        .isEqualTo(left.getHeaders().getContentLength());
    assertThat(right.getHeaders().getFirst("Accept-Ranges"))
        .as("%s: Accept-Ranges", which)
        .isEqualTo(left.getHeaders().getFirst("Accept-Ranges"));
    assertThat(right.getBody()).as("%s: body bytes", which).isEqualTo(left.getBody());
  }

  // ── AC-11: every length is measured from the object ──────────────────────

  /**
   * A deliberately truncated recording, on a row whose {@code durationMs} implies a longer one.
   *
   * <p>The object is 262 143 bytes; the row says the run lasted 600 000 ms and is {@code partial}.
   * Every length the route states must follow the <b>object</b>. Sourcing the total from any column
   * of the execution row reddens this, and the numbers are chosen so that it must: no column on the
   * row holds 262 143.
   */
  @Test
  void everyStatedLengthComesFromTheObjectAndNotFromARowColumn() {
    int truncatedSize = 262_143;
    byte[] truncated = VideoEvidenceFixtures.recording(truncatedSize);
    store.put(derivedKey, truncated);
    video.finish(executionId, "PASSED", 600_000);
    video.evidence(executionId, "AVAILABLE", Instant.now().plus(7, ChronoUnit.DAYS), true, null);

    ResponseEntity<byte[]> full = get(videoPath(false), reader());
    assertThat(full.getHeaders().getContentLength()).isEqualTo(truncatedSize);
    assertThat(full.getBody()).isEqualTo(truncated);

    ResponseEntity<byte[]> ranged = get(videoPath(false), reader(), "bytes=1000-1999");
    assertThat(ranged.getStatusCode().value()).isEqualTo(206);
    assertThat(ranged.getHeaders().getFirst("Content-Range"))
        .as("the total in Content-Range is the object's size, measured")
        .isEqualTo("bytes 1000-1999/" + truncatedSize);

    // The numbers this must not have come from, named so the assertion above is not an accident.
    Map<String, Object> row =
        jdbc.queryForMap(
            "SELECT duration_ms, snapshot_revision FROM ui_test_executions WHERE id = ?",
            executionId);
    assertThat(String.valueOf(truncatedSize))
        .isNotEqualTo(String.valueOf(row.get("duration_ms")))
        .isNotEqualTo(String.valueOf(row.get("snapshot_revision")));
  }

  /**
   * AC-11's second half — the route does not read the container.
   *
   * <p>One object is a plausible webm (the EBML magic and a header), the other is the same length
   * of content that is not a container at all. ADR-002 §17.6 rejected probing the stored object, so
   * the status, the headers and the bytes must be indistinguishable: nothing here parses EBML,
   * derives a duration or repairs a truncated container.
   */
  @Test
  void aMalformedContainerIsServedExactlyAsAWellFormedOneOfTheSameLength() {
    int size = 65_536;
    byte[] wellFormed = VideoEvidenceFixtures.recording(size);
    wellFormed[0] = 0x1A;
    wellFormed[1] = 0x45;
    wellFormed[2] = (byte) 0xDF;
    wellFormed[3] = (byte) 0xA3;
    byte[] garbage = VideoEvidenceFixtures.recording(size);
    garbage[0] = 0x00;
    garbage[1] = 0x00;
    garbage[2] = 0x00;
    garbage[3] = 0x00;

    UUID second = newExecution();
    UUID secondAttempt = video.dispatch(second, "video-evidence-dispatcher");
    video.finish(second, "PASSED", 600_000);
    Instant expiry = Instant.now().plus(7, ChronoUnit.DAYS);
    video.evidence(second, "AVAILABLE", expiry, false, null);
    store.put(derivedKey, wellFormed);
    store.put(VideoEvidenceFixtures.derivedKey(CSI_ID, testId, second, secondAttempt), garbage);

    ResponseEntity<byte[]> good = get(videoPath(false), reader());
    ResponseEntity<byte[]> bad = get(path(second, false), reader());

    assertThat(bad.getStatusCode().value()).isEqualTo(good.getStatusCode().value()).isEqualTo(200);
    assertThat(bad.getHeaders().getContentType()).isEqualTo(good.getHeaders().getContentType());
    assertThat(bad.getHeaders().getContentLength()).isEqualTo(good.getHeaders().getContentLength());
    assertThat(bad.getHeaders().getFirst("Accept-Ranges"))
        .isEqualTo(good.getHeaders().getFirst("Accept-Ranges"));
    assertThat(good.getBody()).isEqualTo(wellFormed);
    assertThat(bad.getBody()).isEqualTo(garbage);
  }

  // ── AC-17: an unreachable store is not an absent object ──────────────────

  /**
   * Story 10.31 AC-6 — the ruled status, the ruled code, and a body that really is {@code
   * ErrorResponse}, next to the not-{@code 404} assertion this test was born with.
   *
   * <p>ESC-2 is closed: ADR-002 §24.4 rules {@code 503}, rejecting {@code 404}, {@code 500}, {@code
   * 502} and {@code 504} each on its own grounds, and §24.6 declares it on {@code
   * getExecutionVideo} with the {@code storeUnavailable} example. So the comparative assertions
   * that were all this test could honestly make while the status was unruled now sit beside the
   * absolute ones.
   *
   * <p><b>The not-{@code 404} and code-differ assertions are kept exactly as they were.</b> They
   * are not redundant with the new ones: they state the <em>distinction</em> the route ships (10.15
   * AC-17), which survives any later re-ruling of which status carries it, whereas the literals
   * below state today's ruling.
   */
  @Test
  void anUnreachableStoreAndAnAbsentObjectAreDifferentAnswers() throws IOException {
    store.clear();
    ResponseEntity<byte[]> absent = get(videoPath(false), reader());
    assertThat(absent.getStatusCode().value())
        .as("the store answered and the key is not there")
        .isEqualTo(404);
    String absentCode = codeOf(absent);

    store.put(derivedKey, object);
    store.makeUnreachable();
    ResponseEntity<byte[]> unreachable = get(videoPath(false), reader());
    store.makeReachable();

    assertThat(unreachable.getStatusCode().value())
        .as(
            "an unreachable store must not be answered as 'no evidence for this execution' — "
                + "which status it IS answered with is ESC-2, escalated and not invented here")
        .isNotEqualTo(404);
    assertThat(codeOf(unreachable))
        .as("the two cases must not be collapsed onto one code either")
        .isNotEqualTo(absentCode);

    assertThat(unreachable.getStatusCode().value())
        .as(
            "ADR-002 §24.4 rules 503 for an unreachable store: the condition is transient and "
                + "belongs to the server. 500 is unclassified, 502 means the upstream answered "
                + "with something invalid, 504 covers only the timeout case")
        .isEqualTo(503);
    assertThat(codeOf(unreachable))
        .as("the declared storeUnavailable example's code, ADR-002 §24.6")
        .isEqualTo("VIDEO_STORE_UNAVAILABLE");

    JsonSchema errorResponse = componentSchema("ErrorResponse");
    assertThat(errorResponse.validate(bodyOf(unreachable)))
        .as(
            "the 503 is written by the Studio handler, so its body is ErrorResponse — `error` a "
                + "STRING. A 503 written by the platform authentication layer before authorization "
                + "would carry that layer's envelope instead (ADR-002 §24.4, §25)")
        .isEmpty();
    assertThat(errorResponse.validate(objectMapper.readTree(PLATFORM_ENVELOPE_BODY)))
        .as(
            "the control: ErrorResponse must be able to REJECT the platform envelope, or the "
                + "assertion above passes for a schema that accepts anything")
        .isNotEmpty();
  }

  // ── helpers ──────────────────────────────────────────────────────────────

  private void applyState(String state) {
    Instant future = Instant.now().plus(7, ChronoUnit.DAYS);
    switch (state) {
      case "PROCESSING" -> {
        jdbc.update(
            "UPDATE ui_test_executions SET status = 'RUNNING', ended_at = NULL WHERE id = ?",
            executionId);
        video.evidence(executionId, null, null, false, null);
      }
      case "AVAILABLE" -> video.evidence(executionId, "AVAILABLE", future, false, null);
      case "FAILED" -> video.evidence(executionId, "FAILED", null, false, null);
      case "UNAVAILABLE" -> video.evidence(executionId, "UNAVAILABLE", null, false, null);
      case "EXPIRED" ->
          video.evidence(executionId, "AVAILABLE", Instant.now().minusSeconds(60), false, null);
      default -> throw new IllegalArgumentException(state);
    }
  }

  private JsonNode snapshot() {
    return snapshotOf(executionId);
  }

  private JsonNode snapshotOf(UUID execution) {
    ResponseEntity<byte[]> response = get("/api/v1/studio/executions/" + execution, reader());
    try {
      return objectMapper.readTree(new String(response.getBody(), StandardCharsets.UTF_8));
    } catch (IOException e) {
      throw new AssertionError("the snapshot route did not answer JSON", e);
    }
  }

  /** The response body, parsed as JSON, exactly as the server returned it. */
  private JsonNode bodyOf(ResponseEntity<byte[]> response) throws IOException {
    return objectMapper.readTree(new String(response.getBody(), StandardCharsets.UTF_8));
  }

  /**
   * A component schema read <b>live from the frozen document</b> and compiled by {@code networknt},
   * the same library and the same {@code V202012} factory {@code ArtifactSchemaDriftTest} and
   * {@code InternalBodyContractConformanceTest} already use in this module.
   *
   * <p>Read rather than transcribed, so an amendment to {@code ErrorResponse} reaches this test
   * without an edit — ADR-002 §18.3.
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

  private String codeOf(ResponseEntity<byte[]> response) throws IOException {
    return objectMapper
        .readTree(new String(response.getBody(), StandardCharsets.UTF_8))
        .path("error")
        .asText();
  }

  private String capture(ResponseEntity<byte[]> response) {
    StringBuilder captured = new StringBuilder();
    captured.append(response.getStatusCode().value()).append('\n');
    response
        .getHeaders()
        .forEach((name, values) -> captured.append(name).append(": ").append(values).append('\n'));
    if (response.getBody() != null) {
      captured.append(new String(response.getBody(), StandardCharsets.ISO_8859_1));
    }
    return captured.toString();
  }

  private HttpHeaders reader() {
    return VideoEvidenceFixtures.identity(READER, "", CSI_ID + ":viewer");
  }

  private String videoPath(boolean download) {
    return path(executionId, download);
  }

  private static String path(UUID execution, boolean download) {
    return "/api/v1/studio/executions/" + execution + "/video" + (download ? "?download=true" : "");
  }

  private ResponseEntity<byte[]> get(String path, HttpHeaders headers) {
    return get(path, headers, null);
  }

  private ResponseEntity<byte[]> get(String path, HttpHeaders headers, String range) {
    HttpHeaders sent = new HttpHeaders();
    sent.putAll(headers);
    if (range != null) {
      sent.set("Range", range);
    }
    return restTemplate.exchange(path, HttpMethod.GET, new HttpEntity<>(sent), byte[].class);
  }
}
