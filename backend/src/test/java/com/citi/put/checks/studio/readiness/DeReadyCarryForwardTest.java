package com.citi.put.checks.studio.readiness;

import static org.assertj.core.api.Assertions.assertThat;

import com.citi.put.checks.studio.compile.CompileRequest;
import com.citi.put.checks.studio.compile.CompileState;
import com.citi.put.checks.studio.compile.CompileStateService;
import com.citi.put.checks.studio.compile.gateway.CompileResponse;
import com.citi.put.checks.studio.compile.gateway.GatewayErrorCode;
import com.citi.put.checks.studio.compile.gateway.GatewayOutcome;
import com.citi.put.checks.studio.compile.gateway.LlmGatewayClient;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicInteger;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Primary;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;

/**
 * Story 10.8 AC-23 — <b>the de-ready case, and the reason this story exists.</b>
 *
 * <p>10.4's {@code beginCompile} is deliberately unconditional on current status (its ISSUE-003;
 * AC-conforming per 10.4 AC-12 and intended behaviour, not a defect). So an <em>optional</em>
 * recompile of a confirmed, unedited draft moves it out of {@code READY} the moment it starts, and
 * leaves it at {@code STALE} or {@code NEEDS_REVISION} when it fails.
 *
 * <p>Each of the three resulting states gets its own test below, and each asserts that the draft is
 * <b>still runnable on the revision originally confirmed</b>. A regression that reintroduced a
 * {@code compile_status = 'READY'} check must fail all three — and {@link
 * #falsificationTheThreeCasesGoRedWhenThePredicateReadsCompileStatus()} demonstrates exactly that
 * rather than asserting it, by evaluating the counterfactual predicate against the same three rows.
 *
 * <p>AC-28(b) rides along here because this is where it bites: a counting gateway stub records
 * <b>zero</b> calls across the readiness and acceptance cycle, including in these three states
 * where a naive implementation might be tempted to "just recompile".
 */
@SpringBootTest
@ActiveProfiles("local")
class DeReadyCarryForwardTest {

  private static final List<String> STEPS =
      List.of("Go to \"https://example.com/login\"", "Click the \"Sign in\" button");

  /**
   * A gateway that answers every call with a failure and counts them.
   *
   * <p>Two jobs at once: it is the outage that drives the de-ready case, and it is AC-28(b)'s
   * counting stub. The count is asserted to be zero across readiness, so "zero calls" is a
   * measurement rather than an absence of opportunity.
   */
  static final class CountingFailingGateway implements LlmGatewayClient {

    private final AtomicInteger calls = new AtomicInteger();

    @Override
    public CompileResponse propose(
        com.citi.put.checks.studio.compile.gateway.CompileRequest request) {
      calls.incrementAndGet();
      return CompileResponse.failure(
          GatewayOutcome.TRANSPORT,
          GatewayErrorCode.GATEWAY_TRANSPORT,
          "stub outage",
          null,
          2,
          5L,
          0,
          0);
    }

    int calls() {
      return calls.get();
    }

    void reset() {
      calls.set(0);
    }
  }

  @TestConfiguration
  static class StubGateway {
    @Bean
    @Primary
    CountingFailingGateway countingFailingGateway() {
      return new CountingFailingGateway();
    }
  }

  @Autowired private ExecutionReadinessService readiness;
  @Autowired private CompileStateService states;
  @Autowired private RuntimePinProperties pin;
  @Autowired private JdbcTemplate jdbc;
  @Autowired private CountingFailingGateway gateway;

  private UUID testId;
  private UUID confirmedRevisionId;

  @BeforeEach
  void setUp() {
    ReadinessFixtures.seedUser(jdbc, ReadinessFixtures.OWNER);
    ReadinessFixtures.seedCsi(jdbc, ReadinessFixtures.CSI_ID);
    testId = ReadinessFixtures.seedDraft(jdbc, STEPS);
    confirmedRevisionId = ReadinessFixtures.confirm(states, jdbc, testId, STEPS);
    gateway.reset();

    assertThat(compileStatus()).isEqualTo(CompileState.READY.name());
    assertThat(readiness.evaluate(testId).ready())
        .as("the premise: the draft starts confirmed, unedited and runnable")
        .isTrue();
  }

  // ── AC-23, case 1: STALE after a failed recompile of unedited source ──────

  @Test
  void aStaleDraftAfterAFailedOptionalRecompileIsStillRunnable() {
    CompileRequest recompile = states.beginCompile(testId);
    states.publishError(testId, recompile, "{\"code\":\"GATEWAY_TRANSPORT\"}");

    assertThat(compileStatus()).isEqualTo(CompileState.STALE.name());

    ReadinessVerdict verdict = readiness.evaluate(testId);

    assertThat(verdict.ready())
        .as(
            "a gateway outage must not revoke an approval nobody withdrew — Epic 10 §10.8's own"
                + " acceptance bullet requires unchanged confirmed tests to stay runnable")
        .isTrue();
    assertThat(verdict.revisionId()).isEqualTo(confirmedRevisionId);
  }

  // ── AC-23, case 2: COMPILING with a recompile in flight ──────────────────

  @Test
  void aDraftWithARecompileInFlightIsStillRunnable() {
    states.beginCompile(testId);

    assertThat(compileStatus()).isEqualTo(CompileState.COMPILING.name());

    ReadinessVerdict verdict = readiness.evaluate(testId);

    assertThat(verdict.ready())
        .as("starting an optional recompile must not take away the test that is already approved")
        .isTrue();
    assertThat(verdict.revisionId()).isEqualTo(confirmedRevisionId);
  }

  // ── AC-23, case 3: NEEDS_REVISION after a failed validation ───────────────

  @Test
  void aDraftLeftNeedsRevisionByAFailedValidationIsStillRunnable() {
    CompileRequest recompile = states.beginCompile(testId);
    states.publishInvalid(
        testId,
        recompile,
        "{\"validatorSchemaVersion\":\"2.0.0\",\"artifact\":[],\"steps\":[],"
            + "\"truncated\":false}");

    assertThat(compileStatus()).isEqualTo(CompileState.NEEDS_REVISION.name());

    ReadinessVerdict verdict = readiness.evaluate(testId);

    assertThat(verdict.ready())
        .as(
            "the *proposed* artifact failed validation; the *confirmed* one did not and is what"
                + " would run")
        .isTrue();
    assertThat(verdict.revisionId()).isEqualTo(confirmedRevisionId);
  }

  /**
   * AC-30's recorded falsification, run rather than described.
   *
   * <p>The counterfactual predicate — the one this story rejected, {@code compile_status = 'READY'}
   * — is evaluated against the same three rows the three tests above pass on. It must refuse all
   * three. If it ever stopped refusing them, those tests would have stopped being proof of
   * anything, and this assertion would be the thing that noticed.
   */
  @Test
  void falsificationTheThreeCasesGoRedWhenThePredicateReadsCompileStatus() {
    record Case(String name, Runnable drive, CompileState expected) {}

    List<Case> cases =
        List.of(
            new Case(
                "STALE after a failed recompile",
                () -> {
                  CompileRequest request = states.beginCompile(testId);
                  states.publishError(testId, request, "{\"code\":\"GATEWAY_TRANSPORT\"}");
                },
                CompileState.STALE),
            new Case(
                "COMPILING in flight", () -> states.beginCompile(testId), CompileState.COMPILING),
            new Case(
                "NEEDS_REVISION after a failed validation",
                () -> {
                  CompileRequest request = states.beginCompile(testId);
                  states.publishInvalid(testId, request, "{\"steps\":[]}");
                },
                CompileState.NEEDS_REVISION));

    for (Case scenario : cases) {
      scenario.drive().run();
      assertThat(compileStatus()).isEqualTo(scenario.expected().name());

      assertThat(readiness.evaluate(testId).ready())
          .as("%s: the shipped predicate must accept this", scenario.name())
          .isTrue();
      assertThat(counterfactualReadyOnCompileStatus())
          .as(
              "%s: the rejected predicate must refuse this. If it did not, the three AC-23 tests"
                  + " would pass for a gate that reads compile_status and would prove nothing",
              scenario.name())
          .isFalse();
    }
  }

  // ── AC-28(b): no LLM call anywhere on the execute path ────────────────────

  @Test
  void noGatewayCallHappensAcrossReadinessInAnyOfTheDeReadyStates() {
    for (CompileState state :
        List.of(
            CompileState.READY,
            CompileState.STALE,
            CompileState.COMPILING,
            CompileState.NEEDS_REVISION,
            CompileState.AWAITING_CONFIRMATION)) {
      jdbc.update("UPDATE ui_tests SET compile_status = ? WHERE id = ?", state.name(), testId);

      ReadinessVerdict verdict = readiness.evaluate(testId);
      UUID revisionId = readiness.requireReady(testId);

      assertThat(verdict.ready()).isTrue();
      assertThat(revisionId).isEqualTo(confirmedRevisionId);
    }

    assertThat(gateway.calls())
        .as(
            "compilation happens at authoring time and never on execute; a single call here would"
                + " be a runtime LLM call, which is an epic definition-of-done violation")
        .isZero();
  }

  @Test
  void theRuntimePinIsRealConfigurationAndNotASwitch() {
    // Guards the premise of every case above: the gate is comparing something.
    assertThat(pin.validatorSchemaVersion()).isEqualTo("2.0.0");
    assertThat(pin.syntaxReferenceVersion()).isEqualTo("2.0.0");
  }

  // ── helpers ───────────────────────────────────────────────────────────────

  private String compileStatus() {
    return jdbc.queryForObject(
        "SELECT compile_status FROM ui_tests WHERE id = ?", String.class, testId);
  }

  /**
   * The predicate this story rejected, evaluated directly against the database.
   *
   * <p>Written out in full so the falsification is a real comparison rather than a claim about one:
   * it is the shipped predicate's terms plus the {@code compile_status = 'READY'} term that AC-22
   * forbids.
   */
  private boolean counterfactualReadyOnCompileStatus() {
    Integer matching =
        jdbc.queryForObject(
            """
            SELECT COUNT(*) FROM ui_tests t
              JOIN ui_test_revisions r ON r.id = t.confirmed_revision_id
             WHERE t.id = ?
               AND t.deleted_at IS NULL AND t.quarantined_at IS NULL
               AND r.confirmed_by IS NOT NULL AND r.confirmed_at IS NOT NULL
               AND r.source_revision = t.source_revision
               AND r.configuration_revision = t.configuration_revision
               AND t.compile_status = 'READY'
            """,
            Integer.class,
            testId);
    return matching != null && matching == 1;
  }
}
