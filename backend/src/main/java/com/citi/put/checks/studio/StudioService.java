package com.citi.put.checks.studio;

import com.citi.put.checks.csi.CsiRepository;
import com.citi.put.checks.security.BffAuthenticationToken;
import com.citi.put.checks.security.UserIdentity;
import com.citi.put.checks.studio.compile.CompileState;
import com.citi.put.checks.studio.compile.ConfigurationChangeClassifier;
import com.citi.put.checks.studio.dto.UITestDto;
import com.citi.put.checks.studio.dto.UITestExecutionDto;
import com.citi.put.checks.studio.dto.UITestRequest;
import com.citi.put.checks.studio.entity.UITest;
import com.citi.put.checks.studio.entity.UITestExecution;
import java.time.Instant;
import java.util.UUID;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.core.Authentication;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@Transactional(readOnly = true)
public class StudioService {

  private final StudioRepository studioRepository;
  private final UITestExecutionRepository executionRepository;
  private final CsiRepository csiRepository;
  private final ConfigurationChangeClassifier changeClassifier;

  public StudioService(
      StudioRepository studioRepository,
      UITestExecutionRepository executionRepository,
      CsiRepository csiRepository,
      ConfigurationChangeClassifier changeClassifier) {
    this.studioRepository = studioRepository;
    this.executionRepository = executionRepository;
    this.csiRepository = csiRepository;
    this.changeClassifier = changeClassifier;
  }

  public Page<UITestDto> listTests(String csiId, int page, int size) {
    Pageable pageable =
        PageRequest.of(page, Math.min(size, 100), Sort.by("createdAt").descending());
    return studioRepository.findAllFiltered(csiId, pageable).map(UITestDto::from);
  }

  /**
   * Creates a draft. The CSI is required, must be registered, and can never be changed afterwards
   * (Architecture §9.1; V12 CHECK {@code ck_ui_tests_csi_registered}).
   */
  @Transactional
  public UITestDto createTest(UITestRequest request, Authentication auth) {
    UserIdentity identity = extractIdentity(auth);
    requireRegisteredCsi(request.csiId());
    UITest test =
        new UITest(
            request.name(),
            request.description(),
            request.csiId(),
            request.steps(),
            request.variables(),
            request.browser(),
            request.viewportWidth(),
            request.viewportHeight(),
            request.environment(),
            identity.email());
    test = studioRepository.save(test);
    return UITestDto.from(test);
  }

  public UITestDto findTestById(UUID id) {
    UITest test =
        studioRepository
            .findById(id)
            .orElseThrow(() -> new IllegalArgumentException("UI Test not found: " + id));
    return UITestDto.from(test);
  }

  /**
   * Updates a draft under optimistic concurrency (Architecture §4.2).
   *
   * <p>The row is locked for the transaction, so two concurrent saves carrying the same revisions
   * are serialized and exactly one of them wins; the loser sees the already-incremented revisions
   * and is rejected with {@code 409 STALE_REVISION} without changing a single field (AC-6, AC-16).
   *
   * <p>A step-text change advances {@code sourceRevision}; an execution-affecting configuration
   * change advances {@code configurationRevision}; name/description advance neither. Any increment
   * invalidates the current candidate and returns the draft to {@code STALE}, while the confirmed
   * revision is retained for history (AC-7, AC-8).
   *
   * <p>The CSI is never written here: a different value is a {@code 409 CSI_IMMUTABLE} (AC-9).
   */
  @Transactional
  public UITestDto updateTest(UUID id, UITestRequest request) {
    if (request.sourceRevision() == null || request.configurationRevision() == null) {
      throw new IllegalArgumentException(
          "sourceRevision and configurationRevision are required on update");
    }
    UITest test =
        studioRepository
            .findByIdForUpdate(id)
            .orElseThrow(() -> new IllegalArgumentException("UI Test not found: " + id));

    if (request.sourceRevision() != test.getSourceRevision()
        || request.configurationRevision() != test.getConfigurationRevision()) {
      throw new StudioConflictException(
          "STALE_REVISION",
          "Test "
              + id
              + " is at sourceRevision "
              + test.getSourceRevision()
              + "/configurationRevision "
              + test.getConfigurationRevision()
              + "; reload before saving");
    }

    if (request.csiId() != null && !request.csiId().equals(test.getCsiId())) {
      throw new StudioConflictException(
          "CSI_IMMUTABLE",
          "Test " + id + " belongs to CSI " + test.getCsiId() + " and cannot be moved");
    }

    ConfigurationChangeClassifier.Classification change = changeClassifier.classify(test, request);

    test.setName(request.name());
    test.setDescription(request.description());
    test.setSteps(request.steps());
    test.setVariables(request.variables());
    test.setBrowser(request.browser());
    test.setViewportWidth(request.viewportWidth());
    test.setViewportHeight(request.viewportHeight());
    test.setTimeoutSeconds(request.timeoutSeconds());
    test.setWaitStrategy(request.waitStrategy());
    test.setEnvironment(request.environment());

    if (change.sourceChanged()) {
      test.setSourceRevision(test.getSourceRevision() + 1);
    }
    if (change.configurationChanged()) {
      test.setConfigurationRevision(test.getConfigurationRevision() + 1);
    }
    if (change.anyChanged()) {
      // Confirmed revision is kept for history; the draft is simply not runnable until a new
      // candidate is confirmed (readiness enforcement belongs to 10.8).
      test.setCompileStatus(CompileState.STALE);
      test.setCurrentCandidateRevisionId(null);
      test.setCompileDiagnostics(null);
      test.setCompileError(null);
    }
    test.setUpdatedAt(Instant.now());
    return UITestDto.from(test);
  }

  private void requireRegisteredCsi(String csiId) {
    if (csiId == null || csiId.isBlank()) {
      throw new IllegalArgumentException("csiId is required");
    }
    if (!csiRepository.existsById(csiId)) {
      throw new IllegalArgumentException("csiId is not a registered CSI: " + csiId);
    }
  }

  @Transactional
  public void softDeleteTest(UUID id) {
    UITest test =
        studioRepository
            .findById(id)
            .orElseThrow(() -> new IllegalArgumentException("UI Test not found: " + id));
    test.setDeletedAt(Instant.now());
  }

  @Transactional
  public UITestExecutionDto executeTest(UUID testId) {
    UITest test =
        studioRepository
            .findById(testId)
            .orElseThrow(() -> new IllegalArgumentException("UI Test not found: " + testId));
    UITestExecution execution = new UITestExecution(testId, "PENDING", Instant.now());
    execution = executionRepository.save(execution);
    return UITestExecutionDto.from(execution);
  }

  public UITestExecutionDto findExecutionById(UUID executionId) {
    UITestExecution execution =
        executionRepository
            .findById(executionId)
            .orElseThrow(() -> new IllegalArgumentException("Execution not found: " + executionId));
    return UITestExecutionDto.from(execution);
  }

  public Page<UITestExecutionDto> listExecutions(UUID testId, int page, int size) {
    Pageable pageable =
        PageRequest.of(page, Math.min(size, 100), Sort.by("createdAt").descending());
    return executionRepository.findByTestId(testId, pageable).map(UITestExecutionDto::from);
  }

  private UserIdentity extractIdentity(Authentication auth) {
    if (auth instanceof BffAuthenticationToken bff) {
      return bff.getPrincipal();
    }
    throw new AccessDeniedException("Not authenticated");
  }
}
