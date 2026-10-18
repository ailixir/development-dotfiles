package com.citi.put.checks.studio.dispatch;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.inOrder;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import com.citi.put.checks.studio.StudioExecutionProperties;
import com.citi.put.checks.studio.UITestRevisionRepository;
import com.citi.put.checks.studio.dto.ExecutionErrorCode;
import com.citi.put.checks.studio.guided.publication.ObservedReplayAuthorization;
import com.citi.put.checks.studio.secrets.SecretAuditLifecycle;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.sql.Timestamp;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.HashMap;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.mockito.InOrder;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.transaction.support.TransactionCallback;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * STUDIO-OBS-012A architect ruling R3: the dispatch-time authorization recheck (AC-13a, §5.1.3).
 *
 * <p>The recheck runs on every claimed attempt after the pending-deadline check and strictly before
 * the observed binding lookup, {@code refreshRetry}'s grant minting, any Vault read and any send. A
 * revoked authorization is terminal with {@code AUTHORIZATION_REVOKED}: no send, no retry, and no
 * secret resolution is ever entered. Only the ledger, the authorization and the observed replay
 * collaborators are mocked; the dispatcher under test is the production class.
 */
class StudioDispatcherAuthorizationRecheckTest {

  private static final Instant NOW = Instant.parse("2026-10-13T12:00:00Z");
  private static final String INSTANCE = "dispatcher-test";
  private static final String CSI = "CSI-1";
  private static final String PRINCIPAL = "owner@example.test";

  private final UUID executionId = UUID.randomUUID();
  private final UUID testId = UUID.randomUUID();

  private final StudioDispatchLedgerStatements statements =
      mock(StudioDispatchLedgerStatements.class);
  private final UITestRevisionRepository revisions = mock(UITestRevisionRepository.class);
  private final DispatchAuthorization authorization = mock(DispatchAuthorization.class);
  private final RunnerDispatchClient runner = mock(RunnerDispatchClient.class);
  private final JdbcTemplate jdbc = mock(JdbcTemplate.class);
  private final TransactionTemplate transactions = mock(TransactionTemplate.class);
  private final ObservedReplayAuthorization observed = mock(ObservedReplayAuthorization.class);
  private final SecretAuditLifecycle secretAudit = mock(SecretAuditLifecycle.class);

  @SuppressWarnings("unchecked")
  private StudioDispatcher dispatcher(String csiId) {
    when(transactions.execute(any()))
        .thenAnswer(
            invocation ->
                ((TransactionCallback<Object>) invocation.getArgument(0)).doInTransaction(null));
    when(statements.claim(eq(executionId), eq(INSTANCE), any(), eq(NOW))).thenReturn(1);
    Map<String, Object> row = new HashMap<>();
    row.put("test_id", testId);
    row.put("csi_id", csiId);
    row.put("principal", PRINCIPAL);
    row.put("pending_deadline_at", Timestamp.from(NOW.plusSeconds(60)));
    when(statements.find(executionId)).thenReturn(Optional.of(row));
    when(statements.closeWithError(any(), anyString(), any())).thenReturn(1);

    StudioDispatcher dispatcher =
        new StudioDispatcher(
            statements,
            revisions,
            authorization,
            runner,
            new StudioExecutionProperties(
                true, null, null, null, null, null, null, null, null, null, null),
            new ObjectMapper(),
            jdbc,
            transactions,
            INSTANCE,
            Clock.fixed(NOW, ZoneOffset.UTC));
    dispatcher.installSecretAudit(secretAudit);
    // What Spring injects into a worker's dispatcher.
    ReflectionTestUtils.setField(dispatcher, "observed", observed);
    return dispatcher;
  }

  @Test
  void aRevokedAuthorizationClosesWithAuthorizationRevokedBeforeAnySecretAndSendsNothing() {
    StudioDispatcher dispatcher = dispatcher(CSI);
    when(authorization.recheck(executionId, testId, CSI, PRINCIPAL))
        .thenThrow(
            new DispatchAuthorization.AuthorizationRevokedException(
                "The draft this execution was accepted for has been deleted"));

    boolean sent = dispatcher.dispatch(executionId);

    assertThat(sent).as("a revoked authorization never sends").isFalse();
    verify(statements).closeWithError(executionId, ExecutionErrorCode.AUTHORIZATION_REVOKED, NOW);
    // Resolution is never entered: no binding lookup, no refreshRetry grant, no job (Vault read),
    // no secret audit fact, no revision read, no plain-value read, and no runner call.
    verifyNoInteractions(observed, secretAudit, runner, revisions, jdbc);
    verify(transactions, never()).executeWithoutResult(any());
    verify(statements, never()).releaseClaim(any());
  }

  @Test
  void theRecheckPrecedesTheBindingLookupAndRefreshRetry() {
    StudioDispatcher dispatcher = dispatcher(CSI);
    when(authorization.recheck(executionId, testId, CSI, PRINCIPAL)).thenReturn("policy");
    var binding = new ObjectMapper().createObjectNode().put("executionId", executionId.toString());
    when(observed.binding(executionId)).thenReturn(Optional.of(binding));
    when(observed.refreshRetry(binding, INSTANCE))
        .thenThrow(new IllegalStateException("stop after refreshRetry"));

    dispatcher.dispatch(executionId);

    InOrder order = inOrder(authorization, observed);
    order.verify(authorization).recheck(executionId, testId, CSI, PRINCIPAL);
    order.verify(observed).binding(executionId);
    order.verify(observed).refreshRetry(binding, INSTANCE);
    verify(observed, never()).job(any(), any(), any());
    verifyNoInteractions(runner);
  }

  @Test
  void aNullCsiReachesTheRecheckAsNullAndIsRefused() {
    StudioDispatcher dispatcher = dispatcher(null);
    when(authorization.recheck(executionId, testId, null, PRINCIPAL))
        .thenThrow(
            new DispatchAuthorization.AuthorizationRevokedException(
                "CSI null is no longer registered"));

    assertThat(dispatcher.dispatch(executionId)).isFalse();

    verify(authorization).recheck(executionId, testId, null, PRINCIPAL);
    verify(statements).closeWithError(executionId, ExecutionErrorCode.AUTHORIZATION_REVOKED, NOW);
    verifyNoInteractions(observed, secretAudit, runner);
  }

  @Test
  void anUnexpectedRecheckFailurePropagatesAndIsNotRelabelledAsRevoked() {
    StudioDispatcher dispatcher = dispatcher(CSI);
    when(authorization.recheck(executionId, testId, CSI, PRINCIPAL))
        .thenThrow(new IllegalStateException("database unavailable"));

    assertThatThrownBy(() -> dispatcher.dispatch(executionId))
        .isInstanceOf(IllegalStateException.class);

    // The lease expires and the row is re-claimed, as at HEAD; it is neither closed nor sent.
    verify(statements, never()).closeWithError(any(), anyString(), any());
    verifyNoInteractions(observed, secretAudit, runner);
  }
}
