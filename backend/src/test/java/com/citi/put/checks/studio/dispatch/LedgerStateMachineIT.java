package com.citi.put.checks.studio.dispatch;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.citi.put.checks.studio.StudioExecutionFixtures;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;
import java.util.UUID;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;

/**
 * Story 10.7 AC-2, AC-3 — the ledger state machine, enforced by the database and by the {@code
 * WHERE} clause of the statement that performs each transition.
 *
 * <p>The transition matrix is enumerated exhaustively: all seven states against all seven,
 * forty-two ordered pairs plus the seven self-pairs. Every pair the story does not permit must
 * update <b>zero</b> rows, and nothing may leave {@code DONE}.
 */
@SpringBootTest
@ActiveProfiles("test")
class LedgerStateMachineIT {

  private static final String CSI_ID = "60451";
  private static final String OWNER = "ledger-owner@citi.com";

  @Autowired private StudioDispatchLedgerStatements statements;
  @Autowired private JdbcTemplate jdbc;

  private UUID executionId;

  @BeforeEach
  void setUp() {
    StudioExecutionFixtures fixtures = new StudioExecutionFixtures(jdbc);
    fixtures.seedUser(OWNER);
    fixtures.seedCsi(CSI_ID, OWNER);
    UUID testId = fixtures.seedTest("Ledger draft", CSI_ID, OWNER, List.of("Go to the home page"));
    executionId = UUID.randomUUID();
    jdbc.update(
        "INSERT INTO studio_dispatch_ledger (execution_id, execution_accepted_at, test_id,"
            + " csi_id, principal, state) VALUES (?, ?, ?, ?, ?, 'QUEUED')",
        executionId,
        Timestamp.from(Instant.now()),
        testId,
        CSI_ID,
        OWNER);
  }

  @Test
  void everyPermittedPairUpdatesExactlyOneRowAndEveryDisallowedPairUpdatesZero() {
    List<String> failures = new ArrayList<>();

    for (DispatchState from : DispatchState.ALL) {
      for (DispatchState to : DispatchState.ALL) {
        forceState(from);
        int updated = statements.transition(executionId, from, to);
        boolean permitted = DispatchState.isPermitted(from, to);
        int expected = permitted ? 1 : 0;
        if (updated != expected) {
          failures.add(from + "->" + to + " updated " + updated + ", expected " + expected);
        }
        assertThat(currentState())
            .as("%s->%s left the row in an unexpected state", from, to)
            .isEqualTo(updated == 1 ? to.name() : from.name());
      }
    }

    assertThat(failures).as("the full 7x7 transition matrix").isEmpty();
  }

  @Test
  void nothingLeavesDone() {
    for (DispatchState to : DispatchState.ALL) {
      forceState(DispatchState.DONE);
      assertThat(statements.transition(executionId, DispatchState.DONE, to))
          .as("DONE is the single absorbing terminal state; DONE->%s must update nothing", to)
          .isZero();
      assertThat(currentState()).isEqualTo("DONE");
    }
  }

  @Test
  void aTransitionFromAStateTheRowIsNotInUpdatesNothing() {
    forceState(DispatchState.QUEUED);

    // The pair is permitted, but the row is not in CLAIMED: the statement carries state = :from,
    // so it matches nothing. Zero is the conflict and is never retried into success.
    assertThat(statements.transition(executionId, DispatchState.CLAIMED, DispatchState.DISPATCHING))
        .isZero();
    assertThat(currentState()).isEqualTo("QUEUED");
  }

  @Test
  void theSqlMatrixAndTheJavaMirrorAgree() {
    Set<DispatchState.Transition> fromSql = new LinkedHashSet<>();
    Matcher matcher =
        Pattern.compile("\\('([A-Z]+)','([A-Z]+)'\\)")
            .matcher(StudioDispatchLedgerStatements.TRANSITION_MATRIX);
    while (matcher.find()) {
      fromSql.add(
          new DispatchState.Transition(
              DispatchState.of(matcher.group(1)), DispatchState.of(matcher.group(2))));
    }

    assertThat(fromSql)
        .as(
            "the SQL VALUES list is the enforcing copy; DispatchState mirrors it and must never "
                + "drift, because a reader who trusts the mirror would be reading a different "
                + "state machine from the one the database runs")
        .containsExactlyInAnyOrderElementsOf(DispatchState.permittedTransitions());
  }

  // ── the two CHECK constraints V13 deferred (AC-2) ────────────────────────

  @Test
  void eachRejectedStateValueFailsAtTheDatabaseAndNotInJava() {
    for (String rejected : List.of("PENDING", "STARTED", "COMPLETE", "done", "", "FINALISING")) {
      assertThatThrownBy(
              () ->
                  jdbc.update(
                      "UPDATE studio_dispatch_ledger SET state = ? WHERE execution_id = ?",
                      rejected,
                      executionId))
          .as("state '%s' must be refused by the database", rejected)
          .isInstanceOf(DataIntegrityViolationException.class)
          .hasMessageContaining("ck_studio_dispatch_ledger_state");
    }
  }

  @Test
  void everyValueV13EnumeratedIsAccepted() {
    for (DispatchState state : DispatchState.ALL) {
      jdbc.update(
          "UPDATE studio_dispatch_ledger SET state = ? WHERE execution_id = ?",
          state.name(),
          executionId);
      assertThat(currentState()).isEqualTo(state.name());
    }
  }

  @Test
  void anAdmissionIdentityIsAllOrNothing() {
    // An admission_id with no attempt_id is a CAS guard with a hole in it.
    assertThatThrownBy(
            () ->
                jdbc.update(
                    "UPDATE studio_dispatch_ledger SET admission_id = ?, runner_instance_id = 'r'"
                        + " WHERE execution_id = ?",
                    UUID.randomUUID(),
                    executionId))
        .isInstanceOf(DataIntegrityViolationException.class)
        .hasMessageContaining("ck_studio_dispatch_ledger_admission_identity");

    assertThatThrownBy(
            () ->
                jdbc.update(
                    "UPDATE studio_dispatch_ledger SET admission_id = ?, attempt_id = ?"
                        + " WHERE execution_id = ?",
                    UUID.randomUUID(),
                    UUID.randomUUID(),
                    executionId))
        .isInstanceOf(DataIntegrityViolationException.class)
        .hasMessageContaining("ck_studio_dispatch_ledger_admission_identity");
  }

  @Test
  void anAttemptWithoutAnAdmissionIsTheNormalDispatchingWindowAndIsAllowed() {
    jdbc.update(
        "UPDATE studio_dispatch_ledger SET attempt_id = ?, state = 'DISPATCHING'"
            + " WHERE execution_id = ?",
        UUID.randomUUID(),
        executionId);

    assertThat(currentState()).isEqualTo("DISPATCHING");
  }

  // ── helpers ──────────────────────────────────────────────────────────────

  /** Sets the state directly, bypassing the state machine, so the matrix can be driven from it. */
  private void forceState(DispatchState state) {
    jdbc.update(
        "UPDATE studio_dispatch_ledger SET state = ? WHERE execution_id = ?",
        state.name(),
        executionId);
  }

  private String currentState() {
    return jdbc.queryForObject(
        "SELECT state FROM studio_dispatch_ledger WHERE execution_id = ?",
        String.class,
        executionId);
  }
}
