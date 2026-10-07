package com.citi.put.checks.studio;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import com.citi.put.checks.csi.CsiRepository;
import com.citi.put.checks.security.BffAuthenticationToken;
import com.citi.put.checks.security.CsiOwnershipEntry;
import com.citi.put.checks.security.CsiOwnershipEvaluator;
import com.citi.put.checks.security.UserIdentity;
import com.citi.put.checks.studio.compile.CompilePipeline;
import com.citi.put.checks.studio.compile.CompileStateService;
import com.citi.put.checks.studio.compile.ConfigurationChangeClassifier;
import com.citi.put.checks.studio.dispatch.StudioAcceptanceService;
import com.citi.put.checks.studio.dispatch.StudioDispatchLedgerStatements;
import com.citi.put.checks.studio.entity.UITest;
import com.citi.put.checks.studio.entity.UITestExecution;
import com.citi.put.checks.users.UserProvisioningService;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.security.core.Authentication;

/**
 * Story 10.48 (ADR-002 O-22) — the execute check, observed on the real {@link StudioService} with
 * only its collaborators mocked.
 *
 * <ul>
 *   <li>AC-3: the service asks {@link CsiOwnershipEvaluator#canExecute} for the test's own CSI and
 *       follows its answer, so changing the evaluator changes Studio's answer. A {@code null} CSI
 *       is refused.
 *   <li>AC-5a: a refused caller reaches neither {@link StudioAcceptanceService#accept} (readiness,
 *       quota, reference/secret resolution, the ledger insert all live behind it) nor {@link
 *       StudioAcceptanceService#resolveIdempotencyRace}.
 *   <li>AC-7a: {@code canExecute == canWrite} across the evaluator's role matrix. Schedule
 *       management is gated on {@code canWrite} and Run's UI signal is {@code canManage} (also
 *       {@code canWrite}); both stand in for execute only while this holds. A divergence fails here
 *       and reopens Open question 2 of the story.
 * </ul>
 */
class StudioServiceExecuteAuthorizationTest {

  private static final String CSI_ID = "60458";
  private static final String OTHER_CSI_ID = "60459";
  private static final String OWNER = "unit-owner@citi.com";

  private final StudioRepository tests = mock(StudioRepository.class);
  private final UITestExecutionRepository executions = mock(UITestExecutionRepository.class);
  private final StudioAcceptanceService acceptance = mock(StudioAcceptanceService.class);

  private StudioService serviceWith(CsiOwnershipEvaluator evaluator) {
    return new StudioService(
        tests,
        executions,
        mock(UITestRevisionRepository.class),
        mock(CsiRepository.class),
        mock(ConfigurationChangeClassifier.class),
        evaluator,
        mock(ExecutionSnapshotMapper.class),
        acceptance,
        mock(CompilePipeline.class),
        mock(CompileStateService.class),
        mock(UserProvisioningService.class),
        mock(StudioDispatchLedgerStatements.class));
  }

  // ── AC-3: the one decision function ────────────────────────────────────

  @Test
  @DisplayName("AC-3: the service follows canExecute on the test's CSI, false then true")
  void theServiceDelegatesToCanExecuteOnTheTestsCsi() {
    UUID id = UUID.randomUUID();
    when(tests.findById(id)).thenReturn(Optional.of(draft(CSI_ID)));
    Authentication caller = identity("unit-caller@citi.com", List.of(), CSI_ID, "viewer");
    CsiOwnershipEvaluator evaluator = mock(CsiOwnershipEvaluator.class);
    StudioService service = serviceWith(evaluator);

    when(evaluator.canExecute(caller, CSI_ID)).thenReturn(false);
    assertThatThrownBy(() -> service.executeTest(id, caller, null))
        .isExactlyInstanceOf(StudioAccessDeniedException.class);
    verifyNoInteractions(acceptance);

    UUID executionId = UUID.randomUUID();
    when(evaluator.canExecute(caller, CSI_ID)).thenReturn(true);
    when(acceptance.accept(id, "unit-caller@citi.com", null)).thenReturn(executionId);
    when(executions.findByExecutionId(executionId))
        .thenReturn(Optional.of(mock(UITestExecution.class)));
    service.executeTest(id, caller, null);
    verify(acceptance).accept(id, "unit-caller@citi.com", null);
    // canWrite is never consulted: a mock answers false, so a service deciding on it would have
    // refused the call just accepted.
    verify(evaluator, never()).canWrite(any(), any());
  }

  @Test
  @DisplayName("AC-3: a test with no CSI is refused, even to an administrator")
  void aTestWithNoCsiIsRefused() {
    UUID id = UUID.randomUUID();
    when(tests.findById(id)).thenReturn(Optional.of(draft(null)));

    assertThatThrownBy(
            () ->
                serviceWith(new CsiOwnershipEvaluator())
                    .executeTest(id, StudioExecutionFixtures.admin("unit-admin@citi.com"), null))
        .isExactlyInstanceOf(StudioAccessDeniedException.class);
    verifyNoInteractions(acceptance);
  }

  @Test
  @DisplayName("AC-1: an unknown id and a refused caller raise the same exception")
  void anUnknownIdAndARefusalAreTheSameException() {
    UUID unknown = UUID.randomUUID();
    UUID known = UUID.randomUUID();
    when(tests.findById(unknown)).thenReturn(Optional.empty());
    when(tests.findById(known)).thenReturn(Optional.of(draft(CSI_ID)));
    StudioService service = serviceWith(new CsiOwnershipEvaluator());
    Authentication viewer = identity("unit-viewer@citi.com", List.of(), CSI_ID, "viewer");

    assertThatThrownBy(() -> service.executeTest(unknown, viewer, null))
        .isExactlyInstanceOf(StudioAccessDeniedException.class);
    assertThatThrownBy(() -> service.executeTest(known, viewer, null))
        .isExactlyInstanceOf(StudioAccessDeniedException.class)
        .hasMessage(new StudioAccessDeniedException().getMessage());
  }

  // ── AC-5a: the idempotency and race path cannot bypass the check ───────

  @Test
  @DisplayName("AC-5a: refused callers reach neither accept nor resolveIdempotencyRace")
  void aRefusedCallerReachesNeitherAcceptNorTheRaceResolution() {
    UUID id = UUID.randomUUID();
    when(tests.findById(id)).thenReturn(Optional.of(draft(CSI_ID)));
    StudioService service = serviceWith(new CsiOwnershipEvaluator());
    String key = UUID.randomUUID().toString();

    for (Authentication refused :
        List.of(
            identity("unit-viewer@citi.com", List.of(), CSI_ID, "viewer"),
            identity("unit-contributor@citi.com", List.of(), CSI_ID, "contributor"),
            identity("unit-stranger@citi.com", List.of(), null, null),
            identity("unit-other@citi.com", List.of(), OTHER_CSI_ID, "owner"))) {
      assertThatThrownBy(() -> service.executeTest(id, refused, key))
          .isExactlyInstanceOf(StudioAccessDeniedException.class);
    }
    verify(acceptance, never()).accept(any(), any(), any());
    verify(acceptance, never()).resolveIdempotencyRace(any(), any(), any());
  }

  @Test
  @DisplayName("AC-5 control: an owner who loses the race is resolved to the winner")
  void anOwnerWhoLosesTheRaceIsResolvedToTheWinner() {
    UUID id = UUID.randomUUID();
    when(tests.findById(id)).thenReturn(Optional.of(draft(CSI_ID)));
    String key = UUID.randomUUID().toString();
    UUID winner = UUID.randomUUID();
    when(acceptance.accept(id, OWNER, key))
        .thenThrow(new StudioAcceptanceService.IdempotencyRaceException(OWNER, key, null));
    when(acceptance.resolveIdempotencyRace(id, OWNER, key)).thenReturn(winner);
    when(executions.findByExecutionId(winner)).thenReturn(Optional.of(mock(UITestExecution.class)));

    serviceWith(new CsiOwnershipEvaluator())
        .executeTest(id, identity(OWNER, List.of(), CSI_ID, "owner"), key);

    verify(acceptance).resolveIdempotencyRace(id, OWNER, key);
  }

  // ── AC-7a: canExecute is canWrite, pinned ──────────────────────────────

  @Test
  @DisplayName("AC-7a: canExecute == canWrite across admin, owner, contributor, viewer, none")
  void canExecuteEqualsCanWriteAcrossTheRoleMatrix() {
    CsiOwnershipEvaluator evaluator = new CsiOwnershipEvaluator();
    Map<String, Authentication> matrix = new LinkedHashMap<>();
    matrix.put("checks-admin", identity("m-admin@citi.com", List.of("checks-admin"), null, null));
    matrix.put(
        "platform-admin", identity("m-platform@citi.com", List.of("platform-admin"), null, null));
    matrix.put("owner", identity("m-owner@citi.com", List.of(), CSI_ID, "owner"));
    matrix.put("contributor", identity("m-contrib@citi.com", List.of(), CSI_ID, "contributor"));
    matrix.put("viewer", identity("m-viewer@citi.com", List.of(), CSI_ID, "viewer"));
    matrix.put("none", identity("m-none@citi.com", List.of(), null, null));
    matrix.put(
        "owner of another CSI", identity("m-other@citi.com", List.of(), OTHER_CSI_ID, "owner"));
    matrix.put("unauthenticated", null);

    Map<String, Boolean> executes = new LinkedHashMap<>();
    matrix.forEach(
        (label, auth) -> {
          assertThat(evaluator.canExecute(auth, CSI_ID))
              .as("%s: canExecute must equal canWrite (Story 10.48 AC-7a)", label)
              .isEqualTo(evaluator.canWrite(auth, CSI_ID));
          executes.put(label, evaluator.canExecute(auth, CSI_ID));
        });
    // Non-vacuity: the matrix holds both answers, so equality is not two constant functions.
    assertThat(executes)
        .containsEntry("checks-admin", true)
        .containsEntry("platform-admin", true)
        .containsEntry("owner", true)
        .containsEntry("contributor", false)
        .containsEntry("viewer", false)
        .containsEntry("none", false)
        .containsEntry("owner of another CSI", false)
        .containsEntry("unauthenticated", false);
  }

  // ── fixtures ─────────────────────────────────────────────────────────────

  private static UITest draft(String csiId) {
    return new UITest(
        "Unit draft",
        null,
        csiId,
        "[\"Go home\"]",
        "[]",
        "chromium",
        1920,
        1080,
        "Production",
        OWNER);
  }

  private static Authentication identity(
      String email, List<String> roles, String csiId, String role) {
    return new BffAuthenticationToken(
        new UserIdentity(
            "uid-" + email,
            email,
            email,
            "Ops",
            roles,
            csiId == null ? List.of() : List.of(new CsiOwnershipEntry(csiId, role))));
  }
}
