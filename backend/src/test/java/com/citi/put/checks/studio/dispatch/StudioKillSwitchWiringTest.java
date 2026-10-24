package com.citi.put.checks.studio.dispatch;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.citi.put.checks.studio.StudioDispatchLedgerRepository;
import com.citi.put.checks.studio.StudioExecutionProperties;
import com.citi.put.checks.studio.StudioRepository;
import com.citi.put.checks.studio.UITestExecutionRepository;
import com.citi.put.checks.studio.UITestRevisionRepository;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.time.Clock;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.support.TransactionCallback;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * Story 10.18b AC-23a: the kill switch, driven on the production path in BOTH directions.
 *
 * <p><strong>Why this file exists when {@code DispatcherIT} already mentions the kill
 * switch.</strong> That test drives {@code closeUndispatchedWork()} directly and asserts the
 * closure is idempotent — it never sets the switch. Nothing in the repository had ever observed
 * {@code properties.enabledOrDefault()} <em>deciding</em> anything: a guard that is only ever
 * exercised from the side it permits is a guard nobody has watched refuse. AC-23a's falsification
 * is "invert the switch and both assertions reverse", and that requires both assertions to exist.
 *
 * <p><strong>Nothing here is a stand-in.</strong> The real {@link StudioAcceptanceService} and the
 * real {@link StudioDispatcher} are constructed with the real {@link StudioExecutionProperties};
 * only the repositories and the {@code JdbcTemplate} are mocked, and they are mocked so that the
 * <em>observation</em> is which production branch ran, not what a test double was told to return.
 *
 * <p>The deployment half — {@code STUDIO_EXECUTION_ENABLED} and {@code STUDIO_DISPATCHER_ENABLED}
 * rendered from distinct values keys, with the dispatcher enabled on the worker and nowhere else —
 * is asserted over the rendered manifest in {@code studio-runner/test/deployment/edge.test.ts}.
 */
class StudioKillSwitchWiringTest {

  /**
   * The real properties record, with only the kill switch set. Every other bound is its default.
   */
  private static StudioExecutionProperties withSwitch(boolean enabled) {
    return new StudioExecutionProperties(
        enabled, null, null, null, null, null, null, null, null, null, null);
  }

  // ── Acceptance: new executions are refused, and the refusal is BEFORE any work ──────────────

  private record AcceptanceFixture(StudioAcceptanceService service, StudioRepository tests) {}

  private static AcceptanceFixture acceptance(boolean enabled) {
    StudioRepository tests = mock(StudioRepository.class);
    StudioDispatchLedgerRepository ledger = mock(StudioDispatchLedgerRepository.class);
    when(ledger.findByPrincipalAndIdempotencyKey(anyString(), anyString()))
        .thenReturn(Optional.empty());
    when(tests.findByIdForUpdate(any())).thenReturn(Optional.empty());
    StudioAcceptanceService service =
        new StudioAcceptanceService(
            tests,
            mock(UITestRevisionRepository.class),
            mock(UITestExecutionRepository.class),
            ledger,
            mock(ExecutionReadiness.class),
            mock(StudioReferenceResolver.class),
            withSwitch(enabled),
            new ObjectMapper(),
            mock(JdbcTemplate.class),
            Clock.systemUTC());
    return new AcceptanceFixture(service, tests);
  }

  @Test
  @DisplayName("switch OFF: accept() refuses with DISPATCH_DISABLED and never looks the test up")
  void switchOffRefusesNewExecutions() {
    AcceptanceFixture fixture = acceptance(false);

    assertThatThrownBy(() -> fixture.service().accept(UUID.randomUUID(), "u1", "key-1"))
        .isInstanceOf(StudioDispatchDisabledException.class);

    // The refusal is the FIRST thing that happens. A kill switch that engaged after readiness
    // evaluation and quota accounting would still refuse, and would still consume the resources
    // the switch exists to stop consuming.
    verify(fixture.tests(), never()).findByIdForUpdate(any());
  }

  @Test
  @DisplayName("switch ON: accept() proceeds past the switch and does the lookup — INVERTED")
  void switchOnAdmitsNewExecutionsToTheOrdinaryPath() {
    AcceptanceFixture fixture = acceptance(true);

    // Not DISPATCH_DISABLED: the unknown-test failure proves execution reached the lookup, which is
    // the statement immediately after the switch. Both assertions of the previous test reverse.
    assertThatThrownBy(() -> fixture.service().accept(UUID.randomUUID(), "u1", "key-1"))
        .isInstanceOf(IllegalArgumentException.class)
        .hasMessageContaining("UI Test not found");

    verify(fixture.tests()).findByIdForUpdate(any());
  }

  // ── Dispatch: queued work is CLOSED rather than dispatched, and reads/recovery stay up ──────

  private record DispatchFixture(
      StudioDispatcher dispatcher, JdbcTemplate jdbc, StudioDispatchLedgerStatements statements) {}

  @SuppressWarnings("unchecked")
  private static DispatchFixture dispatcher(boolean enabled) {
    JdbcTemplate jdbc = mock(JdbcTemplate.class);
    when(jdbc.queryForList(anyString(), any(Class.class), any(Object[].class)))
        .thenReturn(List.of());
    StudioDispatchLedgerStatements statements = mock(StudioDispatchLedgerStatements.class);
    // The transaction runs its callback, so which statement the production path reaches for is
    // what is observed. An empty claim is "nothing queued in this fixture".
    TransactionTemplate transactions = mock(TransactionTemplate.class);
    when(transactions.execute(any()))
        .thenAnswer(
            invocation ->
                ((TransactionCallback<Object>) invocation.getArgument(0)).doInTransaction(null));
    StudioDispatcher dispatcher =
        new StudioDispatcher(
            statements,
            mock(UITestRevisionRepository.class),
            mock(DispatchAuthorization.class),
            mock(RunnerDispatchClient.class),
            withSwitch(enabled),
            new ObjectMapper(),
            jdbc,
            transactions,
            "dispatcher-test",
            Clock.systemUTC());
    return new DispatchFixture(dispatcher, jdbc, statements);
  }

  /** The SQL the production method issued, which is how we tell the two branches apart. */
  private static String issuedSql(JdbcTemplate jdbc) {
    ArgumentCaptor<String> sql = ArgumentCaptor.forClass(String.class);
    verify(jdbc).queryForList(sql.capture(), any(Class.class), any(Object[].class));
    return sql.getValue();
  }

  @Test
  @DisplayName("switch OFF: dispatchOnce() closes queued work instead of dispatching it")
  void switchOffClosesQueuedWork() {
    DispatchFixture fixture = dispatcher(false);

    int dispatched = fixture.dispatcher().dispatchOnce();

    assertThat(dispatched).isZero();
    // BRD §9: "a kill switch rejects new executions and CLOSES QUEUED UNDISPATCHED WORK
    // EXPLICITLY". The closing query selects QUEUED *and* CLAIMED; the dispatching query selects
    // QUEUED only. Which statement ran is the observation, not a flag a mock was handed.
    assertThat(issuedSql(fixture.jdbc())).contains("state IN ('QUEUED', 'CLAIMED')");
    verify(fixture.statements(), never()).claimQueued(any(), any(), any(), anyInt(), any());
  }

  @Test
  @DisplayName("switch ON: dispatchOnce() claims queued work instead — INVERTED")
  void switchOnDispatchesTheQueuedBatch() {
    DispatchFixture fixture = dispatcher(true);

    int dispatched = fixture.dispatcher().dispatchOnce();

    assertThat(dispatched).isZero(); // nothing queued in this fixture
    // Studio v1 WP8: the dispatching branch selects and claims in one ledger statement, so the
    // observation is that it reached for the claim and never issued the closing query.
    verify(fixture.statements()).claimQueued(eq("dispatcher-test"), any(), any(), eq(1), any());
    verify(fixture.jdbc(), never())
        .queryForList(anyString(), any(Class.class), any(Object[].class));
  }

  @Test
  @DisplayName("the default is ON — the switch is a kill switch, not an enable switch")
  void theSwitchDefaultsToEnabled() {
    // `application.yml` renders `enabled: ${STUDIO_EXECUTION_ENABLED:true}`, and the record's
    // `enabledOrDefault()` treats null as true. A kill switch that defaulted to "off" would make a
    // configuration mistake look exactly like an engaged kill switch, which is the one failure an
    // operator must be able to tell apart from an outage.
    assertThat(withSwitch(true).enabledOrDefault()).isTrue();
    assertThat(
            new StudioExecutionProperties(
                    null, null, null, null, null, null, null, null, null, null, null)
                .enabledOrDefault())
        .isTrue();
    assertThat(withSwitch(false).enabledOrDefault()).isFalse();
  }

  @Test
  @DisplayName("FINDING: the dispatcher's code default and its yaml default DISAGREE")
  void theDispatcherDefaultDivergesBetweenYamlAndCode() throws java.io.IOException {
    // Found by writing this test, not by reading either file.
    //
    // `application.yml` renders `dispatcher.enabled: ${STUDIO_DISPATCHER_ENABLED:false}` — off
    // unless a deployment says otherwise, which is what story 10.18's Implementation Notes state
    // and what the runbook tells an operator. But when the `studio.execution.dispatcher` block is
    // absent from the property source entirely, `dispatcherOrDefault()` builds a Dispatcher with a
    // null `enabled` and `enabledOrDefault()` reads `enabled == null || enabled` — **true**.
    //
    // Two derivations of one fact, in two files, disagreeing: this epic's most-repeated defect,
    // here in the switch that decides whether queued browser work is dispatched. It cannot bite a
    // deployment of this chart, because the chart now renders STUDIO_DISPATCHER_ENABLED explicitly
    // on every component (AC-23a) and `application.yml` is inside the jar — but it bites any
    // context that constructs the properties without that block, which includes tests.
    //
    // NOT FIXED HERE. Inverting `Dispatcher.enabledOrDefault()` changes worker behaviour for every
    // context relying on the code default, in a subsystem story 10.18b does not own. Recorded,
    // asserted in BOTH directions so neither side can move unobserved, and escalated.
    // OWNER: @architect (Aria) — §8.5 names StudioExecutionProperties "the one configuration
    // source", and which of its two defaults is the real one is that document's question.
    assertThat(
            new StudioExecutionProperties(
                    null, null, null, null, null, null, null, null, null, null, null)
                .dispatcherOrDefault()
                .enabledOrDefault())
        .as("the CODE default: true, despite the yaml default being false")
        .isTrue();

    // The yaml side of the divergence, read from the artefact that carries it. If somebody
    // corrects either side, this test reddens and the divergence is re-examined rather than
    // silently half-fixed.
    String applicationYml =
        new String(
            java.nio.file.Files.readAllBytes(
                java.nio.file.Path.of("src/main/resources/application.yml")),
            java.nio.charset.StandardCharsets.UTF_8);
    assertThat(applicationYml)
        .as("the YAML default: false")
        .contains("enabled: ${STUDIO_DISPATCHER_ENABLED:false}");

    // And an explicit false is honoured, so the chart's rendered value is what actually governs.
    assertThat(
            new StudioExecutionProperties(
                    null,
                    null,
                    null,
                    null,
                    null,
                    null,
                    null,
                    null,
                    new StudioExecutionProperties.Dispatcher(false, null, null, null),
                    null,
                    null)
                .dispatcherOrDefault()
                .enabledOrDefault())
        .isFalse();
  }
}
