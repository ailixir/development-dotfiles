package com.citi.put.checks.studio.dispatch;

import static org.assertj.core.api.Assertions.assertThat;

import com.citi.put.checks.studio.StudioExecutionFixtures;
import com.citi.put.checks.studio.StudioService;
import com.citi.put.checks.studio.dto.ExecutionErrorCode;
import com.citi.put.checks.studio.guided.publication.ObservedReplayAuthorization;
import com.citi.put.checks.studio.internal.AdmissionCasService;
import com.citi.put.checks.studio.internal.InternalCallbackException;
import com.citi.put.checks.studio.internal.ProgressReportService;
import com.citi.put.checks.studio.internal.dto.RunOutcome;
import com.citi.put.checks.studio.internal.dto.RunnerReport;
import com.citi.put.checks.studio.internal.dto.RunnerStepState;
import com.citi.put.checks.studio.recovery.RunningReaper;
import com.citi.put.checks.studio.secrets.FakeStudioVaultProvider;
import com.citi.put.checks.studio.secrets.SecretRevocationSweep;
import com.citi.put.checks.studio.secrets.StudioSecretFixtures;
import com.citi.put.checks.studio.secrets.StudioVaultProvider;
import com.citi.put.checks.studio.secrets.VaultScope;
import com.citi.put.checks.studio.support.ObservedPublicationFixture;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.assertj.core.api.SoftAssertions;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.core.Authentication;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.testcontainers.junit.jupiter.Testcontainers;

/**
 * STUDIO-OBS-009 AC-11 addition ADJ-1: a secret revoked while the run is {@code ADMITTED} but not
 * started (STUDIO-OBS-012A architect ruling R8 adjacent finding R8-ADJ-1, confirmed by addendum
 * {@code architect-ruling-r8-adj.json}). Ruled at W1.5 (part 2 §2): option (a), one added predicate
 * on {@code applyFinal}'s owner CAS, no migration.
 *
 * <p><b>The state.</b> A secret-bearing observed run is dispatched and admitted: the ledger row is
 * {@code ADMITTED}, the execution is {@code PENDING}, and no browser has started (pre-Ready, so the
 * runner would be held at its initial-context step). The secret's authorization is then revoked and
 * the real {@link SecretRevocationSweep} writes {@code revoked_at} on the ledger row. The runner,
 * having learnt of the revocation, ends the run with its recorded-revocation {@code FINAL}: outer
 * {@code ERROR / CANCELLED} (R8.1: outer {@code CANCELLED} for a stop the API recorded), every step
 * {@code SKIPPED}.
 *
 * <p><b>Before the ruling's predicate</b> the ledger statement that applies a {@code FINAL}
 * accepted only {@code RUNNING}, or {@code ADMITTED} with a recorded cancel. A revoked,
 * un-cancelled {@code ADMITTED} row was neither, so the {@code FINAL} got {@code 409
 * TRANSITION_REJECTED} and the row settled only through {@link RunningReaper}, as {@code
 * START_TIMEOUT} (W1 probe, PR-BE run {@code obs009-prbe-adj1-02}).
 *
 * <p><b>The predicate.</b> {@code (state = 'ADMITTED' AND revoked_at IS NOT NULL AND ?)}, where the
 * parameter is {@code errorCode == AUTHORIZATION_REVOKED}, the API's own projection of the report.
 * So the one new path accepts only the {@code FINAL} that the backend's recorded revocation names.
 * Every other pre-Ready {@code FINAL} on a revoked row is still refused and settled by the reaper,
 * and nothing about the reaper, a deadline or the OBS-006 edge changes.
 *
 * <p><b>The cases</b> (ruling §2.3 table):
 *
 * <ul>
 *   <li>A1 {@link #aPreReadyRevocationIsSettledAsAuthorizationRevoked}: the target case. FINAL
 *       accepted; the ledger goes {@code FINALIZING} then {@code DONE} once evidence settles; the
 *       execution is {@code ERROR / AUTHORIZATION_REVOKED}; the reaper changes nothing; the
 *       secret-use terminal audit replays as on the cancel path.
 *   <li>A2 {@link #aRevokedRowsOtherPreReadyFinalIsStillRefusedAndTheReaperSettlesIt}: the
 *       narrowness pin. A revoked row's {@code FINAL} whose outer code is not {@code CANCELLED}
 *       gets {@code 409 TRANSITION_REJECTED}, and the reaper settles {@code START_TIMEOUT}, as
 *       before.
 *   <li>A3 {@link #revokedAndCancelRequestedPreReadyIsCancelled}: user cancel keeps precedence.
 *   <li>A4 {@link #notRevokedAndNotCancelledOuterCancelledIsStillRefusedByTheObservedPreReadyRule}:
 *       the OBS-006 pre-Ready branch is unchanged for an unrecorded outer {@code CANCELLED}.
 * </ul>
 *
 * <p>A5, the regressions ({@code AdmissionCasIT}, {@code CancelIT}, {@code DispatcherIT}, {@code
 * SecretRevocationSweepIT}, the transition-matrix agreement test), and A-M, the mutation, are in
 * the lane receipt.
 *
 * <p>The runner is simulated at the report boundary: {@link ProgressReportService#apply} is exactly
 * what {@code POST /internal/studio/executions/{id}/progress} calls, and the dispatch client is the
 * recording double. The real runner and its initial-context pause seam are the B-W3 joined leg,
 * {@link PreReadyRevocationJoinedIT} (a sibling class: it needs a real HTTPS application context,
 * which this class's mock-web context cannot be).
 */
@SpringBootTest
@ActiveProfiles("test")
@Testcontainers(disabledWithoutDocker = true)
@Import({ObservedPublicationFixture.FreshAuthority.class, DispatcherIT.FakeRunner.class})
class PreReadyRevocationProbeIT {

  @DynamicPropertySource
  static void observedReplay(DynamicPropertyRegistry registry) {
    ObservedPublicationFixture.register(registry);
  }

  private static final String CSI_ID = "60483";
  private static final String OWNER = "pre-ready-revocation-owner@citi.com";
  private static final String ENVIRONMENT = "Production";
  private static final String SECRET = "LOGIN_PW";
  private static final String RUNNER = "studio-runner-0";

  @Autowired private StudioService studioService;
  @Autowired private StudioDispatcher dispatcher;
  @Autowired private StudioDispatchLedgerStatements statements;
  @Autowired private AdmissionCasService admissions;
  @Autowired private ProgressReportService progress;
  @Autowired private SecretRevocationSweep sweep;
  @Autowired private RunningReaper reaper;
  @Autowired private ObservedReplayAuthorization observed;
  @Autowired private RecordingRunnerDispatchClient runner;
  @Autowired private FakeStudioVaultProvider vault;
  @Autowired private StudioSecretFixtures.MutableSecretUseAuthorization entitlements;
  @Autowired private JdbcTemplate jdbc;

  private StudioExecutionFixtures fixtures;
  private Authentication owner;

  @BeforeEach
  void setUp() {
    runner.reset();
    vault.clear();
    entitlements.clear();
    fixtures = new StudioExecutionFixtures(jdbc);
    fixtures.seedUser(OWNER);
    fixtures.seedCsi(CSI_ID, OWNER);
    ObservedPublicationFixture.clearLedger(jdbc, CSI_ID);
    owner = StudioExecutionFixtures.identity(OWNER, CSI_ID, "owner");
  }

  // ---- A1: the target ----

  @Test
  void aPreReadyRevocationIsSettledAsAuthorizationRevoked() {
    Run run = admittedRun();
    revoke(run);
    var afterRevoke = ledger(run.execution());
    assertThat(afterRevoke.get("state")).isEqualTo("ADMITTED");
    assertThat(afterRevoke.get("revoked_at")).as("the real sweep wrote revoked_at").isNotNull();
    assertThat(afterRevoke.get("cancel_requested_at"))
        .as("a revocation is not a cancel request")
        .isNull();
    assertThat(browserStartedAt(run.execution())).as("pre-Ready: no browser start").isNull();
    assertThat(status(run.execution())).isEqualTo("PENDING");

    String refusal = deliverFinal(run, new RunOutcome("ERROR", "CANCELLED", "CANCELLED", null));

    SoftAssertions soft = new SoftAssertions();
    soft.assertThat(refusal)
        .as("ADJ-1: the runner's recorded-revocation FINAL is accepted (before: 409)")
        .isNull();
    soft.assertThat(ledger(run.execution()).get("state"))
        .as("the ledger takes ADMITTED -> FINALIZING")
        .isEqualTo("FINALIZING");
    soft.assertThat(status(run.execution())).isEqualTo("ERROR");
    soft.assertThat(errorCode(run.execution()))
        .as("the run ends AUTHORIZATION_REVOKED, not by the reaper's deadline")
        .isEqualTo(ExecutionErrorCode.AUTHORIZATION_REVOKED);
    soft.assertThat(
            jdbc.queryForObject(
                "SELECT count(*) FROM studio_secret_use_audit"
                    + " WHERE execution_id = ? AND secret_id = ? AND usage_outcome = 'NOT_USED'",
                Integer.class,
                run.execution(),
                SECRET))
        .as("the secret-use terminal audit replays as on the cancel path")
        .isEqualTo(1);

    // The evidence settles (closeFinalized is what the evidence callback ends with): DONE.
    soft.assertThat(statements.closeFinalized(run.execution())).isEqualTo(1);
    soft.assertThat(ledger(run.execution()).get("state")).isEqualTo("DONE");

    // The reaper finds nothing to settle, even once the start deadline has passed.
    expireStartDeadline(run);
    soft.assertThat(reaper.reapOnce()).as("the reaper changes no row").isZero();
    soft.assertThat(errorCode(run.execution())).isEqualTo(ExecutionErrorCode.AUTHORIZATION_REVOKED);
    soft.assertAll();
  }

  // ---- A2: the narrowness pin ----

  @Test
  void aRevokedRowsOtherPreReadyFinalIsStillRefusedAndTheReaperSettlesIt() {
    Run run = admittedRun();
    revoke(run);

    // A launch failure, not the recorded revocation: outer RUN_ERROR, not CANCELLED.
    String refusal =
        deliverFinal(run, new RunOutcome("ERROR", "RUN_ERROR", "INTERNAL_ERROR", null));

    assertThat(refusal).isEqualTo("409 TRANSITION_REJECTED");
    assertThat(ledger(run.execution()).get("state")).isEqualTo("ADMITTED");
    assertThat(status(run.execution())).isEqualTo("PENDING");
    assertThat(errorCode(run.execution())).isNull();

    expireStartDeadline(run);
    assertThat(reaper.reapOnce()).isGreaterThanOrEqualTo(1);
    assertThat(ledger(run.execution()).get("state")).isEqualTo("DONE");
    assertThat(status(run.execution())).isEqualTo("ERROR");
    assertThat(errorCode(run.execution()))
        .as("settled by deadline, not by cause")
        .isEqualTo(ExecutionErrorCode.START_TIMEOUT)
        .isNotEqualTo(ExecutionErrorCode.AUTHORIZATION_REVOKED);
  }

  // ---- A3: user cancel keeps precedence ----

  @Test
  void revokedAndCancelRequestedPreReadyIsCancelled() {
    Run run = admittedRun();
    revoke(run);
    assertThat(statements.requestCancel(run.execution(), OWNER, Instant.now()))
        .as("the cancel is recorded on the admitted row")
        .contains("ADMITTED");

    String refusal = deliverFinal(run, new RunOutcome("ERROR", "CANCELLED", "CANCELLED", null));

    assertThat(refusal).isNull();
    assertThat(status(run.execution())).isEqualTo("ERROR");
    assertThat(errorCode(run.execution()))
        .as("RunnerOutcomeCodes: a recorded cancel wins over a recorded revocation")
        .isEqualTo(ExecutionErrorCode.CANCELLED);
  }

  // ---- A4: the OBS-006 branch is not widened ----

  @Test
  void notRevokedAndNotCancelledOuterCancelledIsStillRefusedByTheObservedPreReadyRule() {
    Run run = admittedRun();

    String refusal = deliverFinal(run, new RunOutcome("ERROR", "CANCELLED", "CANCELLED", null));

    assertThat(refusal)
        .as("R8: outer CANCELLED is for a stop the API recorded; nothing is recorded here")
        .isEqualTo("400 INVALID_REPORT");
    assertThat(ledger(run.execution()).get("state")).isEqualTo("ADMITTED");
    assertThat(status(run.execution())).isEqualTo("PENDING");
    assertThat(errorCode(run.execution())).isNull();
  }

  // ---- the joined sequence ----

  /** A dispatched, admitted, un-started secret-bearing observed run. */
  private record Run(UUID execution, UUID admission) {}

  private Run admittedRun() {
    UUID testId =
        fixtures.seedTest(
            "Pre-ready revocation draft", CSI_ID, OWNER, List.of("Go to the home page"));
    fixtures.confirmRevision(
        testId,
        CSI_ID,
        List.of("Go to the home page"),
        StudioExecutionFixtures.references(List.of(), List.of(SECRET)));
    entitlements.grant(OWNER, CSI_ID, ENVIRONMENT, SECRET);
    vault.rotate(
        StudioVaultProvider.ReferenceKind.SECRET,
        VaultScope.of(CSI_ID, ENVIRONMENT, testId),
        SECRET,
        "probe-value-" + UUID.randomUUID());
    UUID execution =
        studioService
            .executeTest(testId, owner, null, ObservedPublicationFixture.request(owner))
            .executionId();

    // Dispatched: the secret is resolved and its release audited under the issued attempt.
    dispatcher.dispatch(execution);
    assertThat(runner.sendCount()).as("exactly one send").isEqualTo(1);
    assertThat(ledger(execution).get("state")).isEqualTo("DISPATCHING");

    // Admitted: the runner owns the attempt; it has not started a browser.
    UUID admission = UUID.randomUUID();
    admissions.claimObserved(
        execution,
        observed.prepareAdmission(
            execution,
            ObservedPublicationFixture.observedAdmissionRequest(
                observed.binding(execution).orElseThrow(), RUNNER, admission)));
    assertThat(ledger(execution).get("state")).isEqualTo("ADMITTED");
    return new Run(execution, admission);
  }

  /** The entitlement goes, and the real sweep writes revoked_at on the ledger row. */
  private void revoke(Run run) {
    entitlements.revoke(OWNER, CSI_ID, ENVIRONMENT, SECRET);
    assertThat(sweep.executionRevoked(run.execution()))
        .as("the sweep found the revocation")
        .isTrue();
  }

  /** The start deadline passes (the ledger carries it; the reaper reads the database clock). */
  private void expireStartDeadline(Run run) {
    jdbc.update(
        "UPDATE studio_dispatch_ledger SET start_deadline_at = now() - interval '1 minute'"
            + " WHERE execution_id = ? AND state = 'ADMITTED'",
        run.execution());
  }

  /** Posts a pre-Ready FINAL (every step SKIPPED) as the runner would; null when accepted. */
  private String deliverFinal(Run run, RunOutcome outcome) {
    int sourceSteps =
        jdbc.queryForObject(
            "SELECT jsonb_array_length(r.source) FROM ui_test_revisions r"
                + " JOIN ui_test_executions e ON e.revision_id = r.id WHERE e.id = ?",
            Integer.class,
            run.execution());
    List<RunnerStepState> skipped = new ArrayList<>();
    for (int index = 0; index < sourceSteps; index++) {
      skipped.add(new RunnerStepState(index, "SKIPPED", null, null, null, null));
    }
    RunnerReport report =
        new RunnerReport(
            run.execution(),
            (UUID) ledger(run.execution()).get("attempt_id"),
            run.admission(),
            RUNNER,
            RunnerReport.FINAL,
            1L,
            Instant.now(),
            null,
            skipped,
            List.of(),
            false,
            Map.of(),
            outcome,
            null,
            true,
            Map.of(SECRET, "NOT_USED"));
    try {
      progress.apply(run.execution(), report);
      return null;
    } catch (InternalCallbackException refused) {
      return refused.getStatus().value() + " " + refused.getCode();
    }
  }

  // ---- reads ----

  private Map<String, Object> ledger(UUID execution) {
    return statements.find(execution).orElseThrow();
  }

  private String status(UUID execution) {
    return jdbc.queryForObject(
        "SELECT status FROM ui_test_executions WHERE id = ?", String.class, execution);
  }

  private String errorCode(UUID execution) {
    return jdbc.queryForObject(
        "SELECT error_code FROM ui_test_executions WHERE id = ?", String.class, execution);
  }

  private Object browserStartedAt(UUID execution) {
    return jdbc.queryForObject(
        "SELECT browser_started_at FROM ui_test_executions WHERE id = ?", Object.class, execution);
  }
}
