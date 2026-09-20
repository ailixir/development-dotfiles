package com.citi.put.checks.studio.compile;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.time.Duration;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * Story 10.9 AC-16, AC-18 and AC-19 — <b>the abandoned-compile sweep, against a real PostgreSQL,
 * with the concurrency cases proven by holding a transaction open.</b>
 *
 * <p>The two interleaving cases below are deliberately not sequential calls. The property AC-19
 * states is about what happens when a publish and a sweep overlap, and a pair of sequential calls
 * cannot observe an overlap — it would pass against an implementation with no locking at all. So
 * one participant holds its transaction open on a second thread while the other runs, and the
 * outcome is read after both have committed.
 *
 * <p>The schedule is switched off in this context. The statement is what is under test, and a
 * background sweeper running every minute could settle a backdated row before the test did, turning
 * a deterministic assertion into a race.
 */
@SpringBootTest(properties = "studio.compile.abandonment.enabled=false")
@ActiveProfiles("local")
class AbandonedCompileSweepIT {

  private static final ObjectMapper MAPPER = new ObjectMapper();
  private static final String OWNER = "sweep-owner@citi.com";
  private static final String CSI_ID = "60415";
  private static final List<String> SOURCE = List.of("Go home");
  private static final Duration THRESHOLD = Duration.ofSeconds(600);
  private static final int BATCH = 200;

  @Autowired private CompileStateService states;
  @Autowired private JdbcTemplate jdbc;
  @Autowired private PlatformTransactionManager transactionManager;
  @Autowired private StudioCompileProperties properties;

  private ExecutorService threads;
  private TransactionTemplate transactions;
  private UUID testId;

  @BeforeEach
  void setUp() {
    threads = Executors.newFixedThreadPool(2);
    transactions = new TransactionTemplate(transactionManager);
    ConfirmFixtures.seedUser(jdbc, OWNER);
    ConfirmFixtures.seedCsi(jdbc, CSI_ID, OWNER);
    testId = ConfirmFixtures.seedTest(jdbc, CSI_ID, OWNER, SOURCE);
  }

  @AfterEach
  void stopThreads() {
    threads.shutdownNow();
  }

  // ── AC-16: the invariant, per transition path ────────────────────────────

  /**
   * {@code compile_started_at IS NOT NULL} if and only if {@code compile_status = 'COMPILING'},
   * asserted once per path that can move the draft out of {@code COMPILING}.
   *
   * <p>{@code beginCompile} sets the clock in the <em>same single statement</em> that sets the
   * request identity and the status — not a companion write — so there is no window in which a row
   * is compiling without a clock.
   */
  @Test
  void everyTerminalTransitionClearsTheCompileClockAndBeginCompileSetsIt() {
    for (String path : List.of("candidate", "invalid", "error", "sweep")) {
      UUID id = ConfirmFixtures.seedTest(jdbc, CSI_ID, OWNER, SOURCE);
      assertThat(startedAt(id)).as("%s: a fresh draft has no compile clock", path).isNull();

      CompileRequest request = states.beginCompile(id);
      assertThat(compileStatus(id)).isEqualTo("COMPILING");
      assertThat(startedAt(id))
          .as("%s: beginCompile set the clock in its own single statement", path)
          .isNotNull();

      switch (path) {
        case "candidate" ->
            states.publishCandidate(
                id,
                request,
                ConfirmFixtures.candidate(
                    SOURCE, request.configurationRevision(), "await page.goto('https://a/');"));
        case "invalid" -> states.publishInvalid(id, request, "{\"steps\":[]}");
        case "error" -> states.publishError(id, request, "{\"code\":\"GATEWAY_TIMEOUT\"}");
        case "sweep" -> {
          backdate(id, Duration.ofMinutes(30));
          assertThat(states.sweepAbandoned(THRESHOLD, BATCH)).isEqualTo(1);
        }
        default -> throw new IllegalStateException(path);
      }

      assertThat(compileStatus(id))
          .as("%s: the draft left COMPILING", path)
          .isNotEqualTo("COMPILING");
      assertThat(startedAt(id))
          .as("%s: and the clock was cleared with it, so the invariant still holds", path)
          .isNull();
    }

    assertThat(
            jdbc.queryForObject(
                "SELECT COUNT(*) FROM ui_tests WHERE (compile_started_at IS NOT NULL) <>"
                    + " (compile_status = 'COMPILING')",
                Integer.class))
        .as("compile_started_at IS NOT NULL <=> compile_status = 'COMPILING', across every row")
        .isZero();
  }

  // ── AC-18: the outcome, and the healthy compile that must survive ────────

  /**
   * An abandoned compile is settled to <b>exactly what {@code publishError} produces</b>, plus the
   * request identity and the clock cleared.
   */
  @Test
  void anAbandonedCompileIsSweptToTheSameOutcomePublishErrorProduces() {
    CompileRequest request = states.beginCompile(testId);
    states.publishCandidate(
        testId,
        request,
        ConfirmFixtures.candidate(
            SOURCE, request.configurationRevision(), "await page.goto('https://a/');"));
    UUID candidate = currentCandidate(testId);
    states.confirm(
        testId,
        candidate,
        artifactHash(candidate),
        request.sourceRevision(),
        request.configurationRevision(),
        OWNER);

    // A second, optional recompile that never finishes — the case the column exists for.
    states.beginCompile(testId);
    states.publishCandidate(
        testId,
        states.beginCompile(testId),
        ConfirmFixtures.candidate(SOURCE, 1L, "await page.goto('https://b/');"));
    CompileRequest abandoned = states.beginCompile(testId);
    backdate(testId, Duration.ofMinutes(30));
    int revisionsBefore = revisionCount(testId);

    assertThat(states.sweepAbandoned(THRESHOLD, BATCH)).isEqualTo(1);

    assertThat(compileStatus(testId)).isEqualTo("STALE");
    assertThat(errorCode(testId))
        .as(
            "a bounded code and nothing else; the sweep is the durable form of the deadline the"
                + " process was holding in memory when it died, so it names that bound")
        .isEqualTo(CompileErrorCode.COMPILE_BUDGET_EXCEEDED.name());
    assertThat(errorKeys(testId)).containsExactly("code");
    assertThat(currentCandidate(testId)).as("the candidate is cleared").isNull();
    assertThat(requestId(testId)).as("and so is the request identity").isNull();
    assertThat(startedAt(testId)).isNull();
    assertThat(diagnostics(testId)).isNull();

    assertThat(confirmedRevision(testId))
        .as("the confirmed history is not replaced")
        .isEqualTo(candidate);
    assertThat(revisionCount(testId))
        .as("and no ui_test_revisions row is written")
        .isEqualTo(revisionsBefore);
    assertThat(abandoned.requestId()).isNotNull();
  }

  /**
   * AC-18 — <b>a healthy in-flight compile can never be swept out from under itself.</b>
   *
   * <p>Falsification: removing the age predicate from the sweep's {@code WHERE} must turn this red.
   * Recorded in the Dev Agent Record.
   */
  @Test
  void ahealthyInFlightCompileIsNeverSwept() {
    CompileRequest request = states.beginCompile(testId);
    assertThat(startedAt(testId)).as("the compile really is in flight").isNotNull();

    assertThat(states.sweepAbandoned(THRESHOLD, BATCH))
        .as("a compile that started moments ago is nowhere near the threshold")
        .isZero();

    assertThat(compileStatus(testId)).isEqualTo("COMPILING");
    assertThat(requestId(testId))
        .as("and its request identity survives, so its result can still be published")
        .isEqualTo(request.requestId());
    assertThat(
            states.publishCandidate(
                testId,
                request,
                ConfirmFixtures.candidate(
                    SOURCE, request.configurationRevision(), "await page.goto('https://a/');")))
        .as("the untouched compile publishes normally")
        .isEqualTo(PublishResult.PUBLISHED);
  }

  /**
   * Studio v1 WP9 (decision D11) — the <b>configured</b> sweep, not a threshold this test chose.
   *
   * <p>The pass is the scheduled component's own {@code sweepOnce()}, reading {@code
   * studio.compile.abandonment.*} as this context bound it; only the cadence is left out, because
   * this context switches the schedule off. A compile just past the shortened threshold is settled
   * to {@code STALE} with no candidate fabricated for it, and one just short of it is left alone —
   * so the threshold in force is the shortened one, and it is still a threshold.
   */
  @Test
  void theConfiguredSweepSettlesACompileJustPastTheShortenedThresholdAndNoSooner() {
    Duration threshold = properties.abandonment().threshold();
    assertThat(threshold)
        .as("the shortened default, still strictly above the attempt budget")
        .isEqualTo(Duration.ofSeconds(300))
        .isGreaterThan(properties.pipeline().attemptBudget());
    assertThat(properties.abandonment().intervalMs()).isEqualTo(15_000L);

    UUID abandoned = ConfirmFixtures.seedTest(jdbc, CSI_ID, OWNER, SOURCE);
    states.beginCompile(abandoned);
    backdate(abandoned, threshold.plusSeconds(10));
    UUID inFlight = ConfirmFixtures.seedTest(jdbc, CSI_ID, OWNER, SOURCE);
    CompileRequest live = states.beginCompile(inFlight);
    backdate(inFlight, threshold.minusSeconds(10));

    new CompileAbandonmentSweeper(states, properties).sweepOnce();

    assertThat(compileStatus(abandoned)).isEqualTo("STALE");
    assertThat(errorCode(abandoned)).isEqualTo(CompileErrorCode.COMPILE_BUDGET_EXCEEDED.name());
    assertThat(currentCandidate(abandoned)).as("no candidate is fabricated").isNull();
    assertThat(revisionCount(abandoned)).as("and no revision row is written").isZero();
    assertThat(startedAt(abandoned)).isNull();

    assertThat(compileStatus(inFlight))
        .as("a compile younger than the threshold is still in flight, not abandoned")
        .isEqualTo("COMPILING");
    assertThat(requestId(inFlight)).isEqualTo(live.requestId());
  }

  /** The batch size is a bound, not a suggestion: the run stops at the cap. */
  @Test
  void theSweepStopsAtItsBatchSizeAndTheNextRunContinues() {
    for (int i = 0; i < 5; i++) {
      UUID id = ConfirmFixtures.seedTest(jdbc, CSI_ID, OWNER, SOURCE);
      states.beginCompile(id);
      backdate(id, Duration.ofMinutes(30));
    }

    assertThat(states.sweepAbandoned(THRESHOLD, 2)).isEqualTo(2);
    assertThat(states.sweepAbandoned(THRESHOLD, 2)).isEqualTo(2);
    assertThat(states.sweepAbandoned(THRESHOLD, 2)).isEqualTo(1);
    assertThat(states.sweepAbandoned(THRESHOLD, 2))
        .as("and then there is nothing left to sweep")
        .isZero();
  }

  @Test
  void theSweepRefusesAnUnusableThresholdOrBatchRatherThanRunningUnbounded() {
    assertThatThrownBy(() -> states.sweepAbandoned(Duration.ZERO, BATCH))
        .isInstanceOf(IllegalArgumentException.class);
    assertThatThrownBy(() -> states.sweepAbandoned(THRESHOLD, 0))
        .isInstanceOf(IllegalArgumentException.class);
  }

  // ── AC-19: the two interleaving cases ────────────────────────────────────

  /**
   * AC-19(a) — the sweep runs while a {@code publishCandidate} for the same request is
   * <b>mid-transaction</b>. Exactly one wins, the loser is a no-op, and no row is left
   * half-settled.
   *
   * <p>The publisher holds its transaction open on another thread; the sweep's {@code SELECT ...
   * FOR UPDATE SKIP LOCKED} therefore finds the row locked and skips it rather than waiting, which
   * is what keeps concurrent API replicas from contending. The publish then commits normally.
   */
  @Test
  void asweepInterleavedWithAnInFlightPublishLeavesExactlyOneWinner() throws Exception {
    CompileRequest request = states.beginCompile(testId);
    backdate(testId, Duration.ofMinutes(30));

    CountDownLatch publishStarted = new CountDownLatch(1);
    CountDownLatch sweepFinished = new CountDownLatch(1);

    Future<PublishResult> publisher =
        threads.submit(
            () ->
                transactions.execute(
                    status -> {
                      PublishResult result =
                          states.publishCandidate(
                              testId,
                              request,
                              ConfirmFixtures.candidate(
                                  SOURCE,
                                  request.configurationRevision(),
                                  "await page.goto('https://a/');"));
                      publishStarted.countDown();
                      await(sweepFinished);
                      return result;
                    }));

    assertThat(publishStarted.await(20, TimeUnit.SECONDS))
        .as("the publish must really be mid-transaction, or this is a sequential test")
        .isTrue();
    int swept = states.sweepAbandoned(THRESHOLD, BATCH);
    sweepFinished.countDown();
    PublishResult published = publisher.get(20, TimeUnit.SECONDS);

    assertThat(swept).as("the sweep skipped the locked row rather than contending for it").isZero();
    assertThat(published).isEqualTo(PublishResult.PUBLISHED);
    assertThat(compileStatus(testId))
        .as("exactly one winner, and the row is not half-settled")
        .isEqualTo("AWAITING_CONFIRMATION");
    assertThat(currentCandidate(testId)).isNotNull();
    assertThat(startedAt(testId)).isNull();
    assertThat(errorCode(testId)).isNull();
  }

  /**
   * AC-19(b) — a late {@code publishCandidate} arriving <b>after</b> the sweep is discarded, and it
   * is discarded <b>by the guard that already existed</b>.
   *
   * <p>The sweep holds its transaction open; the publish then blocks on the same row's {@code FOR
   * UPDATE} until the sweep commits, and re-evaluates its predicate against the committed version —
   * where {@code compile_request_id} is now {@code NULL}. No publish guard is modified, widened or
   * given a new term by this story; clearing the request identity is what "this compile request is
   * abandoned" means, and the existing intrinsic guard does the rest.
   *
   * <p>Falsification: removing {@code compile_request_id = NULL} from the sweep's {@code SET} must
   * turn this red — the late publish finds its request identity intact and resurrects a swept row.
   * Recorded in the Dev Agent Record.
   */
  @Test
  void alatePublishArrivingAfterTheSweepIsDiscardedOutOfOrder() throws Exception {
    CompileRequest request = states.beginCompile(testId);
    backdate(testId, Duration.ofMinutes(30));

    CountDownLatch sweepStarted = new CountDownLatch(1);
    CountDownLatch publishAttempted = new CountDownLatch(1);

    Future<Integer> sweeper =
        threads.submit(
            () ->
                transactions.execute(
                    status -> {
                      int swept = states.sweepAbandoned(THRESHOLD, BATCH);
                      sweepStarted.countDown();
                      await(publishAttempted);
                      return swept;
                    }));

    assertThat(sweepStarted.await(20, TimeUnit.SECONDS))
        .as("the sweep must really be mid-transaction, or this is a sequential test")
        .isTrue();

    Future<PublishResult> latePublish =
        threads.submit(
            () ->
                states.publishCandidate(
                    testId,
                    request,
                    ConfirmFixtures.candidate(
                        SOURCE,
                        request.configurationRevision(),
                        "await page.goto('https://a/');")));

    // The late publish is now blocked on the row lock the uncommitted sweep holds. Releasing the
    // sweep is what lets it re-evaluate its predicate against the committed row.
    Thread.sleep(300L);
    publishAttempted.countDown();

    assertThat(sweeper.get(20, TimeUnit.SECONDS)).isEqualTo(1);
    assertThat(latePublish.get(20, TimeUnit.SECONDS))
        .as(
            "the late publish found no matching request identity, because the sweep cleared the"
                + " identity the publish guard already conditions on")
        .isEqualTo(PublishResult.DISCARDED_OUT_OF_ORDER);

    assertThat(compileStatus(testId)).as("the swept row was not resurrected").isEqualTo("STALE");
    assertThat(currentCandidate(testId)).isNull();
    assertThat(requestId(testId)).isNull();
    assertThat(revisionCount(testId))
        .as("a discarded publish writes no revision row either")
        .isZero();
  }

  // ── helpers ──────────────────────────────────────────────────────────────

  private static void await(CountDownLatch latch) {
    try {
      if (!latch.await(30, TimeUnit.SECONDS)) {
        throw new IllegalStateException("interleaving latch was never released");
      }
    } catch (InterruptedException e) {
      Thread.currentThread().interrupt();
      throw new IllegalStateException(e);
    }
  }

  /** Makes a compile clock look old. There is no other way short of sleeping for ten minutes. */
  private void backdate(UUID id, Duration age) {
    int updated =
        jdbc.update(
            "UPDATE ui_tests SET compile_started_at = NOW() - make_interval(secs => ?)"
                + " WHERE id = ? AND compile_status = 'COMPILING'",
            (double) age.toSeconds(),
            id);
    assertThat(updated).as("the row must be COMPILING before it can be backdated").isEqualTo(1);
  }

  private String compileStatus(UUID id) {
    return jdbc.queryForObject(
        "SELECT compile_status FROM ui_tests WHERE id = ?", String.class, id);
  }

  private java.sql.Timestamp startedAt(UUID id) {
    return jdbc.queryForObject(
        "SELECT compile_started_at FROM ui_tests WHERE id = ?", java.sql.Timestamp.class, id);
  }

  private UUID requestId(UUID id) {
    return jdbc.queryForObject(
        "SELECT compile_request_id FROM ui_tests WHERE id = ?", UUID.class, id);
  }

  private UUID currentCandidate(UUID id) {
    return jdbc.queryForObject(
        "SELECT current_candidate_revision_id FROM ui_tests WHERE id = ?", UUID.class, id);
  }

  private UUID confirmedRevision(UUID id) {
    return jdbc.queryForObject(
        "SELECT confirmed_revision_id FROM ui_tests WHERE id = ?", UUID.class, id);
  }

  private String diagnostics(UUID id) {
    return jdbc.queryForObject(
        "SELECT compile_diagnostics::text FROM ui_tests WHERE id = ?", String.class, id);
  }

  private String artifactHash(UUID revisionId) {
    return jdbc.queryForObject(
        "SELECT artifact_hash FROM ui_test_revisions WHERE id = ?", String.class, revisionId);
  }

  private int revisionCount(UUID id) {
    return jdbc.queryForObject(
        "SELECT COUNT(*) FROM ui_test_revisions WHERE test_id = ?", Integer.class, id);
  }

  private String errorCode(UUID id) {
    JsonNode error = errorDocument(id);
    return error == null ? null : error.path("code").asText();
  }

  private Iterable<String> errorKeys(UUID id) {
    JsonNode error = errorDocument(id);
    assertThat(error).isNotNull();
    java.util.List<String> keys = new java.util.ArrayList<>();
    error.fieldNames().forEachRemaining(keys::add);
    return keys;
  }

  private JsonNode errorDocument(UUID id) {
    String stored =
        jdbc.queryForObject(
            "SELECT compile_error::text FROM ui_tests WHERE id = ?", String.class, id);
    if (stored == null) {
      return null;
    }
    try {
      return MAPPER.readTree(stored);
    } catch (Exception e) {
      throw new AssertionError("compile_error is not JSON: " + stored, e);
    }
  }
}
