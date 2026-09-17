package com.citi.put.checks.studio;

import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.inOrder;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.citi.put.checks.csi.CsiRepository;
import com.citi.put.checks.security.CsiOwnershipEvaluator;
import com.citi.put.checks.studio.compile.CompilePipeline;
import com.citi.put.checks.studio.compile.CompileStateService;
import com.citi.put.checks.studio.compile.ConfigurationChangeClassifier;
import com.citi.put.checks.studio.dispatch.StudioAcceptanceService;
import com.citi.put.checks.studio.dto.UITestRequest;
import com.citi.put.checks.studio.entity.UITest;
import com.citi.put.checks.users.UserProvisioningService;
import jakarta.persistence.EntityManager;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.mockito.InOrder;
import org.springframework.security.core.Authentication;
import org.springframework.test.util.ReflectionTestUtils;

/**
 * Story 10.30 AC-18 — the two properties of the write read path that no HTTP test can see.
 *
 * <p><strong>Why this is a unit test.</strong> Once an empty locked read answers {@code 403}, the
 * forbidden {@link StudioRepository#findCsiIdIncludingWithheld} read and the visible read give the
 * same HTTP answer to every identity: an administrator passes {@code canWrite} on a withheld
 * draft's CSI and is then refused by the empty locked read; anyone else is refused by {@code
 * canWrite}. And the window between the visible read and the locked read cannot be entered
 * deterministically over HTTP. So both are observed here, on the real {@link StudioService} with
 * the real {@link CsiOwnershipEvaluator}; only the repositories and the pipeline are mocked.
 *
 * <p><strong>What (a) does not guard (named by @po at validation).</strong> A {@code
 * verify(never())} on one repository method is a guard on the shape of the source. A new repository
 * method that runs the same unrestricted native query under another name passes it. Review must
 * read the read path in {@code updateTest}/{@code softDeleteTest}; (a) only stops the one known
 * method from coming back. Each case in (a) therefore also asserts the visible read <em>was</em>
 * made, so a method that reads nothing at all cannot satisfy it either.
 *
 * <p><strong>One case beyond AC-18, and why.</strong> The visible read and the locked read happen
 * in one transaction, and Hibernate hands the already-loaded draft back to the locking query
 * <em>unrefreshed</em> (measured with a throwaway probe while this story was implemented: visible
 * revision 1, row at 6, locked read returned 1 and the same instance). So the service detaches the
 * visible copy first. Without that, two concurrent saves could both pass the revision check. {@code
 * OptimisticSaveIT} watches the behaviour but only as a race; the in-order case below is the
 * deterministic half, and like (a) it is a guard on the shape of the source.
 */
class StudioServiceWriteAuthorizationTest {

  private static final String CSI_ID = "60458";
  private static final String OWNER = "unit-owner@citi.com";

  private StudioRepository tests;
  private EntityManager entityManager;
  private StudioService service;

  @BeforeEach
  void setUp() {
    tests = mock(StudioRepository.class);
    service =
        new StudioService(
            tests,
            mock(UITestExecutionRepository.class),
            mock(UITestRevisionRepository.class),
            mock(CsiRepository.class),
            mock(ConfigurationChangeClassifier.class),
            new CsiOwnershipEvaluator(),
            mock(ExecutionSnapshotMapper.class),
            mock(StudioAcceptanceService.class),
            mock(CompilePipeline.class),
            mock(CompileStateService.class),
            mock(UserProvisioningService.class));
    // Field-injected by @PersistenceContext in production, as in ProgressReportService.
    entityManager = mock(EntityManager.class);
    ReflectionTestUtils.setField(service, "entityManager", entityManager);
  }

  // ── (a) AC-8: the write paths never read through a withheld draft ─────────────────────────────

  @Test
  @DisplayName("(a) updateTest never reads findCsiIdIncludingWithheld: owner, stranger, absent")
  void theSaveNeverReadsThroughTheVisibilityRestriction() {
    UUID owned = UUID.randomUUID();
    UITest draft = draft();
    when(tests.findById(owned)).thenReturn(Optional.of(draft));
    when(tests.findByIdForUpdate(owned)).thenReturn(Optional.of(draft));
    // The owner reaches step 5: the stale revisions are refused 409, after both reads.
    assertThatThrownBy(() -> service.updateTest(owned, save(99L, 99L), owner()))
        .isInstanceOf(StudioConflictException.class);
    // A stranger is refused at step 3.
    assertThatThrownBy(() -> service.updateTest(owned, save(1L, 1L), stranger()))
        .isInstanceOf(StudioAccessDeniedException.class);

    UUID absent = UUID.randomUUID();
    when(tests.findById(absent)).thenReturn(Optional.empty());
    // An administrator on an absent (or withheld) draft is refused at step 2.
    assertThatThrownBy(() -> service.updateTest(absent, save(1L, 1L), admin()))
        .isInstanceOf(StudioAccessDeniedException.class);

    verify(tests, never()).findCsiIdIncludingWithheld(any());
    verify(tests, times(2)).findById(owned);
    verify(tests).findById(absent);
  }

  @Test
  @DisplayName("(a) softDeleteTest(id, auth) never reads findCsiIdIncludingWithheld")
  void theDeleteNeverReadsThroughTheVisibilityRestriction() {
    UUID owned = UUID.randomUUID();
    when(tests.findById(owned)).thenReturn(Optional.of(draft()));
    service.softDeleteTest(owned, owner());
    assertThatThrownBy(() -> service.softDeleteTest(owned, stranger()))
        .isInstanceOf(StudioAccessDeniedException.class);

    UUID absent = UUID.randomUUID();
    when(tests.findById(absent)).thenReturn(Optional.empty());
    assertThatThrownBy(() -> service.softDeleteTest(absent, admin()))
        .isInstanceOf(StudioAccessDeniedException.class);

    verify(tests, never()).findCsiIdIncludingWithheld(any());
    verify(tests, times(2)).findById(owned);
    verify(tests).findById(absent);
  }

  // ── (b) AC-8 step 4: the draft disappeared between the visible read and the lock ─────────────

  @Test
  @DisplayName("(b) authorized, then the locked read comes back empty: 403, never 400")
  void aDraftThatDisappearsBeforeTheLockIsForbidden() {
    UUID id = UUID.randomUUID();
    when(tests.findById(id)).thenReturn(Optional.of(draft()));
    when(tests.findByIdForUpdate(id)).thenReturn(Optional.empty());

    assertThatThrownBy(() -> service.updateTest(id, save(1L, 1L), owner()))
        .isInstanceOf(StudioAccessDeniedException.class);
    verify(tests).findByIdForUpdate(id);
  }

  @Test
  @DisplayName("the authorized copy is let go before the lock, so the lock reads the row afresh")
  void theVisibleCopyIsDetachedBeforeTheLockedRead() {
    UUID id = UUID.randomUUID();
    UITest visible = draft();
    UITest locked = draft();
    when(tests.findById(id)).thenReturn(Optional.of(visible));
    when(tests.findByIdForUpdate(id)).thenReturn(Optional.of(locked));

    assertThatThrownBy(() -> service.updateTest(id, save(99L, 99L), owner()))
        .isInstanceOf(StudioConflictException.class);

    InOrder order = inOrder(tests, entityManager);
    order.verify(tests).findById(id);
    order.verify(entityManager).detach(visible);
    order.verify(tests).findByIdForUpdate(id);
  }

  // ── (c) AC-10: the internal overloads keep their behaviour exactly ───────────────────────────

  @Test
  @DisplayName("(c) internal save, empty locked read: still 'UI Test not found', no visible read")
  void theInternalSaveStillReportsAnUnknownTest() {
    UUID id = UUID.randomUUID();
    when(tests.findByIdForUpdate(id)).thenReturn(Optional.empty());

    assertThatThrownBy(() -> service.updateTest(id, save(1L, 1L)))
        .isExactlyInstanceOf(IllegalArgumentException.class)
        .hasMessage("UI Test not found: " + id);
    verify(tests, never()).findById(any());
  }

  @Test
  @DisplayName("(c) internal delete, absent draft: still 'UI Test not found'")
  void theInternalDeleteStillReportsAnUnknownTest() {
    UUID id = UUID.randomUUID();
    when(tests.findById(id)).thenReturn(Optional.empty());

    assertThatThrownBy(() -> service.softDeleteTest(id))
        .isExactlyInstanceOf(IllegalArgumentException.class)
        .hasMessage("UI Test not found: " + id);
  }

  // ── fixtures ─────────────────────────────────────────────────────────────

  private static UITest draft() {
    return new UITest(
        "Unit draft",
        null,
        CSI_ID,
        "[\"Go home\"]",
        "[]",
        "chromium",
        1920,
        1080,
        "Production",
        OWNER);
  }

  private static UITestRequest save(Long sourceRevision, Long configurationRevision) {
    return new UITestRequest(
        "Unit draft",
        null,
        CSI_ID,
        "Production",
        List.of("Go home"),
        List.of(),
        null,
        sourceRevision,
        configurationRevision);
  }

  private static Authentication owner() {
    return StudioExecutionFixtures.identity(OWNER, CSI_ID, "owner");
  }

  private static Authentication stranger() {
    return StudioExecutionFixtures.identity("unit-stranger@citi.com", "99999", "owner");
  }

  private static Authentication admin() {
    return StudioExecutionFixtures.admin("unit-admin@citi.com");
  }
}
