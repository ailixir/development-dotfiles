package com.citi.put.checks.studio.guided.bridge;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.citi.put.checks.studio.dispatch.HttpRunnerDispatchClient;
import com.citi.put.checks.studio.dispatch.StudioReferenceResolver;
import com.citi.put.checks.studio.guided.session.GuidedContracts;
import com.citi.put.checks.studio.guided.session.GuidedSessionException;
import com.citi.put.checks.studio.guided.session.GuidedSessionService;
import com.citi.put.checks.studio.guided.session.GuidedTestIdentities;
import com.citi.put.checks.studio.secrets.SecretUseAuditRecorder.ResolutionOutcome;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.util.UUID;
import org.junit.jupiter.api.Test;

/**
 * A step that uses several secrets: when the resolver names the one it could not resolve, only that
 * secret gets the failed audit decision. The others were not the cause.
 */
class GuidedDispatchSecretFailureTest {
  private static final GuidedContracts C = new GuidedContracts();
  private static final String SESSION = "session-1";

  private ObjectNode input(String inputId, String secretId) {
    return C.object()
        .put("inputId", inputId)
        .put("sourceStepId", "s1")
        .put("kind", "secretRef")
        .put("secretId", secretId);
  }

  @Test
  void onlyTheNamedSecretIsMarkedUnavailable() {
    var sessions = mock(GuidedSessionService.class);
    var materialization = mock(GuidedMaterializationService.class);
    var runner = mock(HttpRunnerDispatchClient.class);
    var references = mock(StudioReferenceResolver.class);
    var service = new GuidedDispatchService(sessions, materialization, runner);
    service.installReferences(references);

    ObjectNode context = C.object();
    var inputs = context.putObject("authoredInputs").putArray("inputs");
    inputs.add(input("i1", "USER_PASS"));
    inputs.add(input("i2", "API_KEY"));
    ObjectNode proposal = C.object();
    proposal.putObject("coordinate").put("stepId", "s1").put("ordinal", 0);
    var uses = proposal.putObject("operation").putArray("uses");
    uses.addObject().put("kind", "secret").put("id", "USER_PASS");
    uses.addObject().put("kind", "secret").put("id", "API_KEY");
    ObjectNode ledger = C.object().put("sessionId", SESSION);
    ledger.putObject("admission").put("admissionId", "adm-1");
    ObjectNode session = C.object().put("testId", UUID.randomUUID().toString());
    session
        .putObject("scope")
        .put("csiId", "CSI-1")
        .put("environmentId", "fixture")
        .put("principalId", "user-1");
    session.put("expiresAt", "2099-01-01T00:00:00Z");

    var controller = GuidedTestIdentities.backendController();
    when(sessions.consume(any(), eq(SESSION), eq(1L), anyString(), any()))
        .thenReturn(new GuidedSessionService.WonConsumption(context, proposal, ledger));
    when(materialization.identity(any())).thenReturn(C.object());
    when(sessions.secretSession(SESSION)).thenReturn(session);
    when(references.resolve(anyString(), anyString(), any(UUID.class), anyString(), any()))
        .thenThrow(new StudioReferenceResolver.ReferenceUnavailableException("API_KEY"));

    assertThatThrownBy(
            () ->
                service.dispatch(
                    controller, SESSION, 1, "key", C.object().put("admissionId", "adm-1")))
        .isInstanceOfSatisfying(
            GuidedSessionException.class,
            failure -> assertThat(failure.getMessage()).isEqualTo("SECRET_UNAVAILABLE"));

    verify(sessions)
        .recordSecretDecision(SESSION, ledger, "API_KEY", null, ResolutionOutcome.UNAVAILABLE);
    verify(sessions, never())
        .recordSecretDecision(
            eq(SESSION), any(), eq("USER_PASS"), any(), any(ResolutionOutcome.class));
  }

  @Test
  void anOutageThatNamesNoSecretMarksEveryUnresolvedSecretOfTheStep() {
    var sessions = mock(GuidedSessionService.class);
    var service =
        new GuidedDispatchService(
            sessions,
            mock(GuidedMaterializationService.class),
            mock(HttpRunnerDispatchClient.class));
    ObjectNode ledger = C.object();
    service.recordSecretFailure(
        SESSION,
        ledger,
        java.util.List.of("A", "B"),
        null,
        ResolutionOutcome.VAULT_UNAVAILABLE,
        null);
    verify(sessions)
        .recordSecretDecision(SESSION, ledger, "A", null, ResolutionOutcome.VAULT_UNAVAILABLE);
    verify(sessions)
        .recordSecretDecision(SESSION, ledger, "B", null, ResolutionOutcome.VAULT_UNAVAILABLE);
  }
}
