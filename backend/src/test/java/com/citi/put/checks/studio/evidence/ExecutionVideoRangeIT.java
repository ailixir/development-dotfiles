package com.citi.put.checks.studio.evidence;

import static org.assertj.core.api.Assertions.assertThat;

import com.citi.put.checks.studio.StudioExecutionFixtures;
import com.citi.put.checks.studio.StudioService;
import com.citi.put.checks.studio.dispatch.StudioDispatchLedgerStatements;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.Arrays;
import java.util.List;
import java.util.UUID;
import java.util.regex.Pattern;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
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
 * Story 10.15 AC-12, AC-13, AC-14, AC-15, AC-16 — Range, asserted on the bytes.
 *
 * <p><b>Two prohibitions govern this file, because both are the characteristic vacuous shapes for a
 * Range endpoint.</b> A {@code 206} asserted without comparing the returned bytes to the requested
 * slice satisfies nothing here; and a Range case whose fixture is smaller than the boundary it
 * claims to exercise satisfies nothing either. The second is guarded mechanically: {@link
 * #theFixtureIsLargerThanEveryBoundaryTheCaseTableUses()} computes the maximum boundary <b>from the
 * case table</b>, so shrinking the fixture or adding a larger boundary fails a guard instead of
 * silently making a case unsatisfiable.
 *
 * <p>The object itself is position-derivable rather than a run of one byte, so a wrong offset
 * returns wrong bytes instead of the same byte.
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@ActiveProfiles("test")
@Testcontainers(disabledWithoutDocker = true)
class ExecutionVideoRangeIT {

  private static final String CSI_ID = "60473";
  private static final String OWNER = "video-range-owner@citi.com";
  private static final String READER = "video-range-reader@citi.com";

  /** ≥ 1 MiB, and larger than every boundary the case table below uses. Both are asserted. */
  private static final int OBJECT_SIZE = 1_200_000;

  private static final int ONE_MIB = 1_048_576;

  /** AC-16's behavioural half: at most 64 KiB requested over a ≥ 1 MiB object. */
  private static final int INSTRUMENTED_WINDOW = 64 * 1024;

  private static final Pattern FILENAME =
      Pattern.compile(
          "^execution-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}"
              + "-attempt-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\\.webm$");

  @Autowired private TestRestTemplate restTemplate;
  @Autowired private JdbcTemplate jdbc;
  @Autowired private StudioService studioService;
  @Autowired private StudioDispatchLedgerStatements statements;
  @Autowired private TransactionTemplate transactions;
  @Autowired private FakeVideoObjectStore store;

  private UUID executionId;
  private UUID attemptId;
  private String derivedKey;
  private byte[] object;

  @BeforeEach
  void setUp() {
    store.clear();
    StudioExecutionFixtures fixtures = new StudioExecutionFixtures(jdbc);
    VideoEvidenceFixtures video = new VideoEvidenceFixtures(jdbc, statements, transactions);
    fixtures.seedUser(OWNER);
    fixtures.seedUser(READER);
    fixtures.seedCsi(CSI_ID, OWNER);
    UUID testId =
        fixtures.seedRunnableTest("Range draft", CSI_ID, OWNER, List.of("Go home")).testId();
    executionId =
        studioService
            .executeTest(testId, StudioExecutionFixtures.identity(OWNER, CSI_ID, "owner"), null)
            .executionId();
    attemptId = video.dispatch(executionId, "video-range-dispatcher");
    derivedKey = VideoEvidenceFixtures.derivedKey(CSI_ID, testId, executionId, attemptId);
    object = VideoEvidenceFixtures.recording(OBJECT_SIZE);
    store.put(derivedKey, object);
    video.finish(executionId, "PASSED", 600_000);
    video.evidence(executionId, "AVAILABLE", Instant.now().plus(7, ChronoUnit.DAYS), false, null);
  }

  // ── the case table, and the guard over its own boundaries ────────────────

  /** One satisfiable Range case: the header to send, and the byte offsets it names. */
  private record RangeCase(String name, String header, long[] boundaries) {}

  /**
   * The six satisfiable shapes. Every offset that appears in a header appears in {@code
   * boundaries}, which is what makes the fixture-size guard computable rather than asserted.
   */
  private static List<RangeCase> cases() {
    return List.of(
        new RangeCase("first byte", "bytes=0-0", new long[] {0}),
        new RangeCase("mid-object slice", "bytes=300000-899999", new long[] {300_000, 899_999}),
        new RangeCase("open-ended", "bytes=1000000-", new long[] {1_000_000}),
        new RangeCase("suffix", "bytes=-250000", new long[] {250_000}),
        new RangeCase(
            "end past EOF", "bytes=1048575-" + (OBJECT_SIZE + 1000L), new long[] {1_048_575}),
        new RangeCase(
            "whole object as a range",
            "bytes=0-" + (OBJECT_SIZE - 1),
            new long[] {0, OBJECT_SIZE - 1L}));
  }

  /**
   * The guard the story names as most likely to be cut under pressure, and it is a criterion.
   *
   * <p>{@code max(boundaries)} is computed from the case table itself. Shrinking the fixture, or
   * adding a case with a larger boundary, fails here — rather than silently producing a case whose
   * fixture cannot reach the boundary it claims to exercise.
   */
  @Test
  void theFixtureIsLargerThanEveryBoundaryTheCaseTableUses() {
    long max =
        cases().stream()
            .flatMapToLong(range -> Arrays.stream(range.boundaries()))
            .max()
            .orElseThrow();

    assertThat(measuredSize())
        .as(
            "the fixture (%d bytes) does not reach the largest boundary the table uses (%d)",
            measuredSize(), max)
        .isGreaterThan(max);
    assertThat(measuredSize())
        .as("and the story requires at least 1 MiB of position-derivable content")
        .isGreaterThanOrEqualTo(ONE_MIB);
    assertThat(cases())
        .as("a case table nobody filled in would satisfy the maximum above")
        .hasSize(6);
  }

  // ── AC-12: a full request is a complete, correct 200 ─────────────────────

  @Test
  void aFullRequestIsAComplete200() {
    ResponseEntity<byte[]> full = get(null, false);

    assertThat(full.getStatusCode().value()).isEqualTo(200);
    assertThat(full.getHeaders().getContentType())
        .isEqualTo(MediaType.parseMediaType("video/webm"));
    assertThat(full.getHeaders().getFirst("Accept-Ranges")).isEqualTo("bytes");
    assertThat(full.getHeaders().getContentLength()).isEqualTo(measuredSize());
    assertThat(full.getBody())
        .as("the whole array, compared byte for byte — not its length and not a prefix")
        .isEqualTo(object);
  }

  // ── AC-13: every 206 asserted on the returned bytes ──────────────────────

  @Test
  void everySatisfiableRangeReturnsExactlyItsSlice() {
    long size = measuredSize();
    for (RangeCase range : cases()) {
      ResponseEntity<byte[]> answer = get(range.header(), false);
      long[] window = expectedWindow(range.header(), size);
      long first = window[0];
      long last = window[1];

      assertThat(answer.getStatusCode().value()).as("%s: status", range.name()).isEqualTo(206);
      assertThat(answer.getHeaders().getFirst("Content-Range"))
          .as("%s: Content-Range", range.name())
          .isEqualTo("bytes " + first + "-" + last + "/" + size);
      assertThat(answer.getHeaders().getContentLength())
          .as("%s: Content-Length", range.name())
          .isEqualTo(last - first + 1);
      assertThat(answer.getBody())
          .as("%s: the bytes returned are not the bytes requested", range.name())
          .isEqualTo(Arrays.copyOfRange(object, (int) first, (int) last + 1));
    }
  }

  /** The expected window, derived from the header and the measured size — never transcribed. */
  private static long[] expectedWindow(String header, long size) {
    String spec = header.substring("bytes=".length());
    int dash = spec.indexOf('-');
    String firstSpec = spec.substring(0, dash);
    String lastSpec = spec.substring(dash + 1);
    if (firstSpec.isEmpty()) {
      long suffix = Long.parseLong(lastSpec);
      return new long[] {Math.max(0, size - suffix), size - 1};
    }
    long first = Long.parseLong(firstSpec);
    if (lastSpec.isEmpty()) {
      return new long[] {first, size - 1};
    }
    return new long[] {first, Math.min(Long.parseLong(lastSpec), size - 1)};
  }

  // ── AC-14: 416 is the unsatisfiable case only ────────────────────────────

  @Test
  void aStartAtOrBeyondTheEndIsUnsatisfiable() {
    long size = measuredSize();

    for (String header :
        List.of(
            "bytes=" + size + "-",
            "bytes=" + (size + 1) + "-",
            "bytes=" + (size + 1000) + "-" + (size + 2000))) {
      ResponseEntity<byte[]> answer = get(header, false);

      assertThat(answer.getStatusCode().value()).as("%s", header).isEqualTo(416);
      assertThat(answer.getHeaders().getFirst("Content-Range"))
          .as("%s: the unsatisfiable response states the measured size", header)
          .isEqualTo("bytes */" + size);
      assertNoObjectBytesIn(answer.getBody());
    }
  }

  @Test
  void anInvertedRangeIsUnsatisfiable() {
    ResponseEntity<byte[]> answer = get("bytes=200-100", false);

    assertThat(answer.getStatusCode().value()).isEqualTo(416);
    assertThat(answer.getHeaders().getFirst("Content-Range"))
        .isEqualTo("bytes */" + measuredSize());
    assertNoObjectBytesIn(answer.getBody());
  }

  /**
   * The case that stops "everything is 416" from passing: a syntactically malformed header is
   * <b>ignored</b> and the whole representation is served (RFC 9110 §14.2).
   */
  @Test
  void aMalformedRangeHeaderIsIgnoredAndTheWholeObjectIsServed() {
    ResponseEntity<byte[]> reference = get(null, false);

    for (String header :
        List.of("bytes=abc", "items=0-10", "", "bytes=", "bytes=-", "bytes=1-2, 5-6")) {
      ResponseEntity<byte[]> answer = get(header, false);

      assertThat(answer.getStatusCode().value())
          .as(
              "Range: '%s' is not a range this server can serve; ignoring it is the honest answer",
              header)
          .isEqualTo(200);
      assertThat(answer.getHeaders().getContentLength())
          .isEqualTo(reference.getHeaders().getContentLength());
      assertThat(answer.getHeaders().getFirst("Content-Range")).isNull();
      assertThat(answer.getBody()).isEqualTo(object);
    }
  }

  /**
   * "No bytes from the object" asserted properly: every eight-byte window of the returned body is
   * looked for in the object. A body that merely happens to be short would pass a length check.
   */
  private void assertNoObjectBytesIn(byte[] body) {
    assertThat(body).isNotNull();
    String haystack = new String(object, java.nio.charset.StandardCharsets.ISO_8859_1);
    String needleSource = new String(body, java.nio.charset.StandardCharsets.ISO_8859_1);
    for (int i = 0; i + 8 <= needleSource.length(); i++) {
      String window = needleSource.substring(i, i + 8);
      assertThat(haystack.indexOf(window))
          .as("the 416 body carries an eight-byte run that occurs in the object at offset %d", i)
          .isEqualTo(-1);
    }
  }

  // ── AC-15: ?download=true, and that it composes with Range ───────────────

  @Test
  void downloadSetsAnApiDerivedAttachmentFilenameAndPlayDoesNot() {
    ResponseEntity<byte[]> play = get(null, false);
    assertThat(play.getHeaders().getFirst("Content-Disposition"))
        .as("without ?download there is no attachment disposition")
        .isNull();

    ResponseEntity<byte[]> download = get(null, true);
    String disposition = download.getHeaders().getFirst("Content-Disposition");

    assertThat(disposition).isNotNull().startsWith("attachment; filename=\"");
    String filename =
        disposition.substring("attachment; filename=\"".length(), disposition.length() - 1);
    assertThat(filename).matches(FILENAME);
    assertThat(filename).contains(executionId.toString()).contains(attemptId.toString());
    assertThat(filename)
        .doesNotContain(derivedKey)
        .doesNotContain("studio/")
        .doesNotContain(CSI_ID)
        .doesNotContain("\r")
        .doesNotContain("\n");
    assertThat(download.getBody()).isEqualTo(object);
  }

  @Test
  void downloadComposesWithRangeRatherThanReplacingIt() {
    ResponseEntity<byte[]> answer = get("bytes=500000-599999", true);

    assertThat(answer.getStatusCode().value()).isEqualTo(206);
    assertThat(answer.getHeaders().getFirst("Content-Range"))
        .isEqualTo("bytes 500000-599999/" + measuredSize());
    assertThat(answer.getHeaders().getFirst("Content-Disposition"))
        .as("the disposition must survive the Range path")
        .isNotNull()
        .startsWith("attachment; filename=\"");
    assertThat(answer.getBody())
        .as("and the sliced bytes are still the requested slice")
        .isEqualTo(Arrays.copyOfRange(object, 500_000, 600_000));
  }

  // ── AC-16: a ranged read reads only the range ────────────────────────────

  /**
   * The behavioural half of AC-16, and the one the story calls the real evidence.
   *
   * <p>The fake counts what it was asked to produce. A "read the whole object, then slice"
   * implementation is more than sixteen times over on this request and goes red on the count, not
   * on the bytes — which is the point: the bytes would be identical either way.
   */
  @Test
  void aRangedReadAsksTheStoreForTheRangeAndNotForTheObject() {
    long size = measuredSize();
    long first = 700_000;
    long last = first + INSTRUMENTED_WINDOW - 1;
    store.resetMeter();

    ResponseEntity<byte[]> answer = get("bytes=" + first + "-" + last, false);

    assertThat(answer.getStatusCode().value()).isEqualTo(206);
    assertThat(store.bytesProduced())
        .as("the store was asked for %d bytes of a %d-byte object", INSTRUMENTED_WINDOW, size)
        .isEqualTo(INSTRUMENTED_WINDOW);
    assertThat(size / INSTRUMENTED_WINDOW)
        .as("the instrument only discriminates if the object is much larger than the window")
        .isGreaterThanOrEqualTo(16);
    assertThat(answer.getBody()).isEqualTo(Arrays.copyOfRange(object, (int) first, (int) last + 1));
  }

  // ── helpers ──────────────────────────────────────────────────────────────

  /** The size measured from the object, which is the only size anything here is computed from. */
  private long measuredSize() {
    return store.metadata(derivedKey).orElseThrow().sizeBytes();
  }

  private ResponseEntity<byte[]> get(String range, boolean download) {
    HttpHeaders headers = VideoEvidenceFixtures.identity(READER, "", CSI_ID + ":viewer");
    if (range != null) {
      headers.set("Range", range);
    }
    String path =
        "/api/v1/studio/executions/" + executionId + "/video" + (download ? "?download=true" : "");
    return restTemplate.exchange(path, HttpMethod.GET, new HttpEntity<>(headers), byte[].class);
  }
}
