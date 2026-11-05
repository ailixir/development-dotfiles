package com.citi.put.checks.studio.dispatch;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.citi.put.checks.studio.StudioExecutionFixtures;
import com.citi.put.checks.studio.StudioService;
import com.citi.put.checks.studio.dto.ExecutionErrorCode;
import com.citi.put.checks.studio.support.ObservedPublicationFixture;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.EnumSet;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.EnumSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;

/**
 * Studio v1 WP4 — the cancel compare-and-set, driven from every ledger state.
 *
 * <p>The execution is a real accepted one, so the history row the statement writes exists; the
 * ledger state is then forced, as {@link LedgerStateMachineIT} does, so each of the seven states is
 * decided rather than reached by luck. Three outcomes and no fourth:
 *
 * <ul>
 *   <li>{@code QUEUED}, {@code CLAIMED} — closed now: ledger {@code DONE}, history {@code ERROR /
 *       CANCELLED}, one revision spent;
 *   <li>{@code DISPATCHING}, {@code ADMITTED}, {@code RUNNING} — only the request is recorded: the
 *       state, the history row and its revision are untouched;
 *   <li>{@code FINALIZING}, {@code DONE} — nothing matches, which is the route's {@code 409}.
 * </ul>
 */
@SpringBootTest
@ActiveProfiles("test")
@Import(ObservedPublicationFixture.FreshAuthority.class)
class LedgerCancelTransitionsIT {

  @DynamicPropertySource
  static void observedReplay(DynamicPropertyRegistry registry) {
    ObservedPublicationFixture.register(registry);
  }

  private static final String CSI_ID = "60471";
  private static final String OWNER = "cancel-ledger-owner@citi.com";

  private static final Set<DispatchState> CLOSED_AT_ONCE =
      EnumSet.of(DispatchState.QUEUED, DispatchState.CLAIMED);
  private static final Set<DispatchState> MARKED_ONLY =
      EnumSet.of(DispatchState.DISPATCHING, DispatchState.ADMITTED, DispatchState.RUNNING);

  @Autowired private StudioDispatchLedgerStatements statements;
  @Autowired private StudioService studioService;
  @Autowired private JdbcTemplate jdbc;

  private UUID executionId;

  @BeforeEach
  void setUp() {
    StudioExecutionFixtures fixtures = new StudioExecutionFixtures(jdbc);
    fixtures.seedUser(OWNER);
    fixtures.seedCsi(CSI_ID, OWNER);
    ObservedPublicationFixture.clearLedger(jdbc, CSI_ID);
    UUID testId =
        fixtures
            .seedRunnableTest("Cancel ledger draft", CSI_ID, OWNER, List.of("Go to the home page"))
            .testId();
    executionId =
        studioService
            .executeTest(
                testId,
                StudioExecutionFixtures.identity(OWNER, CSI_ID, "owner"),
                null,
                ObservedPublicationFixture.request(
                    StudioExecutionFixtures.identity(OWNER, CSI_ID, "owner")))
            .executionId();
  }

  @ParameterizedTest
  @EnumSource(DispatchState.class)
  void eachStateAnswersExactlyOneOfTheThreeOutcomes(DispatchState state) {
    forceState(state);
    long revisionBefore = revision();
    String statusBefore = historyStatus();

    Optional<String> result = statements.requestCancel(executionId, OWNER, Instant.now());

    if (CLOSED_AT_ONCE.contains(state)) {
      assertThat(result).contains("DONE");
      assertThat(ledgerState()).isEqualTo("DONE");
      assertThat(historyStatus()).isEqualTo("ERROR");
      assertThat(historyErrorCode()).isEqualTo(ExecutionErrorCode.CANCELLED);
      assertThat(revision()).as("the close is a visible change").isEqualTo(revisionBefore + 1);
      assertThat(ledger().get("cancel_requested_by")).isEqualTo(OWNER);
    } else if (MARKED_ONLY.contains(state)) {
      assertThat(result).contains(state.name());
      assertThat(ledgerState()).as("a cancel is a request, never a state").isEqualTo(state.name());
      assertThat(ledger().get("cancel_requested_at")).isNotNull();
      assertThat(ledger().get("cancel_requested_by")).isEqualTo(OWNER);
      assertThat(historyStatus()).isEqualTo(statusBefore);
      assertThat(historyErrorCode()).isNull();
      assertThat(revision()).as("nothing visible changed").isEqualTo(revisionBefore);
    } else {
      assertThat(state).isIn(DispatchState.FINALIZING, DispatchState.DONE);
      assertThat(result).as("the outcome is already known; nothing to cancel").isEmpty();
      assertThat(ledger().get("cancel_requested_at")).isNull();
      assertThat(revision()).isEqualTo(revisionBefore);
    }
  }

  @ParameterizedTest
  @EnumSource(
      value = DispatchState.class,
      names = {"DISPATCHING", "ADMITTED", "RUNNING"})
  void aSecondCancelMatchesNothing(DispatchState state) {
    forceState(state);
    assertThat(statements.requestCancel(executionId, OWNER, Instant.now())).isPresent();
    Object firstRequestedAt = ledger().get("cancel_requested_at");

    assertThat(statements.requestCancel(executionId, "someone-else@citi.com", Instant.now()))
        .isEmpty();
    assertThat(ledger().get("cancel_requested_at")).isEqualTo(firstRequestedAt);
    assertThat(ledger().get("cancel_requested_by")).isEqualTo(OWNER);
  }

  @Test
  void theAdmissionCasRefusesARowWhoseCancelIsRecorded() {
    UUID attemptId = UUID.randomUUID();
    jdbc.update(
        "UPDATE studio_dispatch_ledger SET state = 'DISPATCHING', attempt_id = ?"
            + " WHERE execution_id = ?",
        attemptId,
        executionId);
    statements.requestCancel(executionId, OWNER, Instant.now());

    int admitted =
        statements.admit(
            executionId,
            attemptId,
            UUID.randomUUID(),
            "studio-runner-0",
            Instant.now().plusSeconds(30),
            Instant.now().plusSeconds(600),
            Instant.now());

    assertThat(admitted).isZero();
    assertThat(ledger().get("admission_id")).isNull();
    assertThat(ledgerState()).isEqualTo("DISPATCHING");
  }

  @Test
  void theRelayAcknowledgementIsWrittenOnceAndOnlyAgainstARequest() {
    forceState(DispatchState.RUNNING);
    assertThat(statements.markCancelRelayed(executionId, Instant.now()))
        .as("no request, nothing to acknowledge")
        .isZero();

    statements.requestCancel(executionId, OWNER, Instant.now());
    assertThat(statements.findCancelsToRelay(1000)).contains(executionId);
    assertThat(statements.markCancelRelayed(executionId, Instant.now())).isEqualTo(1);
    assertThat(statements.markCancelRelayed(executionId, Instant.now())).isZero();
    assertThat(statements.findCancelsToRelay(1000)).doesNotContain(executionId);
  }

  @Test
  void dispatchingRowsAreNeverRelayedBecauseNoRunnerHoldsThem() {
    forceState(DispatchState.DISPATCHING);
    statements.requestCancel(executionId, OWNER, Instant.now());

    assertThat(statements.findCancelsToRelay(1000)).doesNotContain(executionId);
    assertThat(statements.findUnfinishedCancels(Instant.now().plusSeconds(1), 1000))
        .as("but the reaper still owns it")
        .contains(executionId);
  }

  @Test
  void theDatabaseRefusesARequesterWithoutARequestAndARelayWithoutOne() {
    assertThatThrownBy(
            () ->
                jdbc.update(
                    "UPDATE studio_dispatch_ledger SET cancel_requested_by = 'x'"
                        + " WHERE execution_id = ?",
                    executionId))
        .isInstanceOf(DataIntegrityViolationException.class)
        .hasMessageContaining("ck_studio_dispatch_ledger_cancel_pair");
    assertThatThrownBy(
            () ->
                jdbc.update(
                    "UPDATE studio_dispatch_ledger SET cancel_relayed_at = now()"
                        + " WHERE execution_id = ?",
                    executionId))
        .isInstanceOf(DataIntegrityViolationException.class)
        .hasMessageContaining("ck_studio_dispatch_ledger_cancel_pair");
  }

  // ── helpers ──────────────────────────────────────────────────────────────

  private void forceState(DispatchState state) {
    jdbc.update(
        "UPDATE studio_dispatch_ledger SET state = ?, updated_at = ? WHERE execution_id = ?",
        state.name(),
        Timestamp.from(Instant.now()),
        executionId);
  }

  private Map<String, Object> ledger() {
    return statements.find(executionId).orElseThrow();
  }

  private String ledgerState() {
    return String.valueOf(ledger().get("state"));
  }

  private String historyStatus() {
    return jdbc.queryForObject(
        "SELECT status FROM ui_test_executions WHERE id = ?", String.class, executionId);
  }

  private String historyErrorCode() {
    return jdbc.queryForObject(
        "SELECT error_code FROM ui_test_executions WHERE id = ?", String.class, executionId);
  }

  private long revision() {
    Long value =
        jdbc.queryForObject(
            "SELECT snapshot_revision FROM ui_test_executions WHERE id = ?",
            Long.class,
            executionId);
    return value == null ? 0L : value;
  }
}
