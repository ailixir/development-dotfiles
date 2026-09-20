package com.citi.put.checks.studio.readiness;

import static org.assertj.core.api.Assertions.assertThat;

import com.citi.put.checks.security.BffAuthenticationToken;
import com.citi.put.checks.security.UserIdentity;
import com.citi.put.checks.studio.StudioService;
import com.citi.put.checks.studio.compile.CompileErrorCode;
import com.citi.put.checks.studio.compile.CompileStateService;
import com.citi.put.checks.studio.dto.ExecutionSnapshotDto;
import java.time.Duration;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.core.Authentication;
import org.springframework.test.context.ActiveProfiles;

/**
 * Story 10.9 AC-20 — <b>the sweep changes nothing about readiness.</b>
 *
 * <p>This is story 10.8's AC-23 property restated at the one place it could now regress. The whole
 * reason the {@code compile_started_at} column is cheap is that readiness never reads {@code
 * compile_status}: a row stranded in {@code COMPILING} blocks nothing, so the sweep buys a truthful
 * authoring display rather than a recovered capability. If implementing it ever required weakening
 * one of 10.8's de-ready tests, the implementation would be wrong, not the test.
 *
 * <p>Readiness and acceptance are asserted <b>both before and after</b> the sweep runs, on the
 * revision originally confirmed. Asserting only afterwards would not distinguish "the sweep changed
 * nothing" from "it was never ready in the first place".
 *
 * <p>The schedule is off so the sweep runs when this test says it does; the statement is what is
 * under test.
 */
@SpringBootTest(properties = "studio.compile.abandonment.enabled=false")
@ActiveProfiles("local")
class SweepDoesNotDeReadyIT {

  private static final List<String> STEPS =
      List.of("Go to \"https://example.com/login\"", "Click the \"Sign in\" button");
  private static final Duration THRESHOLD = Duration.ofSeconds(600);

  @Autowired private ExecutionReadinessService readiness;
  @Autowired private CompileStateService states;
  @Autowired private StudioService studioService;
  @Autowired private JdbcTemplate jdbc;

  private UUID testId;
  private UUID confirmedRevisionId;

  @BeforeEach
  void setUp() {
    ReadinessFixtures.seedUser(jdbc, ReadinessFixtures.OWNER);
    ReadinessFixtures.seedCsi(jdbc, ReadinessFixtures.CSI_ID);
    testId = ReadinessFixtures.seedDraft(jdbc, STEPS);
    confirmedRevisionId = ReadinessFixtures.confirm(states, jdbc, testId, STEPS);
  }

  /**
   * A confirmed, unedited draft stranded in {@code COMPILING} and then swept to {@code STALE} is
   * runnable throughout, on the revision it originally confirmed.
   */
  @Test
  void aStrandedThenSweptDraftStaysReadyOnTheRevisionItConfirmed() {
    states.beginCompile(testId);
    backdate(Duration.ofMinutes(30));
    assertThat(compileStatus()).isEqualTo("COMPILING");

    ReadinessVerdict before = readiness.evaluate(testId);
    assertThat(before.ready())
        .as("a stranded COMPILING row blocks nothing, because readiness ignores compile_status")
        .isTrue();
    assertThat(before.revisionId()).isEqualTo(confirmedRevisionId);

    assertThat(states.sweepAbandoned(THRESHOLD, 200)).isEqualTo(1);

    assertThat(compileStatus()).isEqualTo("STALE");
    assertThat(errorCode()).isEqualTo(CompileErrorCode.COMPILE_BUDGET_EXCEEDED.name());

    ReadinessVerdict after = readiness.evaluate(testId);
    assertThat(after.ready())
        .as("and the sweep must not revoke an approval nobody withdrew")
        .isTrue();
    assertThat(after.revisionId())
        .as("on the revision originally confirmed, unchanged")
        .isEqualTo(confirmedRevisionId);
    assertThat(confirmedRevision())
        .as("the confirmed history is not replaced by a sweep")
        .isEqualTo(confirmedRevisionId);
  }

  /**
   * The same property at the acceptance boundary: {@code POST /execute} is accepted either side.
   */
  @Test
  void executeIsAcceptedBothBeforeAndAfterTheSweep() {
    states.beginCompile(testId);
    backdate(Duration.ofMinutes(30));

    ExecutionSnapshotDto before = studioService.executeTest(testId, owner(), null);
    assertThat(before.executionId()).as("accepted while stranded in COMPILING").isNotNull();

    assertThat(states.sweepAbandoned(THRESHOLD, 200)).isEqualTo(1);

    ExecutionSnapshotDto after = studioService.executeTest(testId, owner(), null);
    assertThat(after.executionId())
        .as("and accepted after the sweep settled it to STALE")
        .isNotNull();
    assertThat(after.executionId())
        .as("two acceptances without an idempotency key are two executions")
        .isNotEqualTo(before.executionId());
  }

  /**
   * The sweep touches no readiness input.
   *
   * <p>The predicate's seven terms read the draft's revisions, its confirmed revision and that
   * revision's own columns. None of them is a column the sweep writes, and this asserts that
   * concretely rather than by reading the SQL: every readiness-relevant value is captured before
   * and compared after.
   */
  @Test
  void theSweepWritesNoColumnTheReadinessPredicateReads() {
    states.beginCompile(testId);
    backdate(Duration.ofMinutes(30));

    var before =
        jdbc.queryForMap(
            "SELECT t.deleted_at, t.quarantined_at, t.csi_id, t.steps::text, t.source_revision,"
                + " t.configuration_revision, t.confirmed_revision_id, r.confirmed_by,"
                + " r.confirmed_at, r.source_hash, r.artifact_hash, r.artifact_schema_version,"
                + " r.provenance::text FROM ui_tests t JOIN ui_test_revisions r"
                + " ON r.id = t.confirmed_revision_id WHERE t.id = ?",
            testId);

    assertThat(states.sweepAbandoned(THRESHOLD, 200)).isEqualTo(1);

    var after =
        jdbc.queryForMap(
            "SELECT t.deleted_at, t.quarantined_at, t.csi_id, t.steps::text, t.source_revision,"
                + " t.configuration_revision, t.confirmed_revision_id, r.confirmed_by,"
                + " r.confirmed_at, r.source_hash, r.artifact_hash, r.artifact_schema_version,"
                + " r.provenance::text FROM ui_tests t JOIN ui_test_revisions r"
                + " ON r.id = t.confirmed_revision_id WHERE t.id = ?",
            testId);

    assertThat(after)
        .as("every input the readiness predicate reads is byte-unchanged by the sweep")
        .isEqualTo(before);
  }

  // ── helpers ──────────────────────────────────────────────────────────────

  private void backdate(Duration age) {
    int updated =
        jdbc.update(
            "UPDATE ui_tests SET compile_started_at = NOW() - make_interval(secs => ?)"
                + " WHERE id = ? AND compile_status = 'COMPILING'",
            (double) age.toSeconds(),
            testId);
    assertThat(updated).isEqualTo(1);
  }

  private static Authentication owner() {
    return new BffAuthenticationToken(
        new UserIdentity(
            "uid-" + ReadinessFixtures.OWNER,
            ReadinessFixtures.OWNER,
            ReadinessFixtures.OWNER,
            "Ops",
            List.of("checks-admin"),
            List.of()));
  }

  private String compileStatus() {
    return jdbc.queryForObject(
        "SELECT compile_status FROM ui_tests WHERE id = ?", String.class, testId);
  }

  private UUID confirmedRevision() {
    return jdbc.queryForObject(
        "SELECT confirmed_revision_id FROM ui_tests WHERE id = ?", UUID.class, testId);
  }

  private String errorCode() {
    String stored =
        jdbc.queryForObject(
            "SELECT compile_error::text FROM ui_tests WHERE id = ?", String.class, testId);
    try {
      return new com.fasterxml.jackson.databind.ObjectMapper()
          .readTree(stored)
          .path("code")
          .asText();
    } catch (Exception e) {
      throw new AssertionError("compile_error is not JSON: " + stored, e);
    }
  }
}
