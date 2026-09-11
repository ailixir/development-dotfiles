package com.citi.put.checks.studio;

import com.citi.put.checks.csi.CsiRepository;
import com.citi.put.checks.security.BffAuthenticationToken;
import com.citi.put.checks.security.CsiOwnershipEvaluator;
import com.citi.put.checks.security.UserIdentity;
import com.citi.put.checks.studio.compile.CompileState;
import com.citi.put.checks.studio.compile.ConfigurationChangeClassifier;
import com.citi.put.checks.studio.dto.ExecutionSnapshotDto;
import com.citi.put.checks.studio.dto.ExecutionStatus;
import com.citi.put.checks.studio.dto.LegacyStudioAdapter;
import com.citi.put.checks.studio.dto.UITestDto;
import com.citi.put.checks.studio.dto.UITestRequest;
import com.citi.put.checks.studio.entity.StudioDispatchLedger;
import com.citi.put.checks.studio.entity.UITest;
import com.citi.put.checks.studio.entity.UITestExecution;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Instant;
import java.util.HexFormat;
import java.util.List;
import java.util.Optional;
import java.util.Set;
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
  private final StudioDispatchLedgerRepository ledgerRepository;
  private final CsiRepository csiRepository;
  private final ConfigurationChangeClassifier changeClassifier;
  private final CsiOwnershipEvaluator csiOwnershipEvaluator;
  private final ExecutionSnapshotMapper snapshotMapper;

  public StudioService(
      StudioRepository studioRepository,
      UITestExecutionRepository executionRepository,
      StudioDispatchLedgerRepository ledgerRepository,
      CsiRepository csiRepository,
      ConfigurationChangeClassifier changeClassifier,
      CsiOwnershipEvaluator csiOwnershipEvaluator,
      ExecutionSnapshotMapper snapshotMapper) {
    this.studioRepository = studioRepository;
    this.executionRepository = executionRepository;
    this.ledgerRepository = ledgerRepository;
    this.csiRepository = csiRepository;
    this.changeClassifier = changeClassifier;
    this.csiOwnershipEvaluator = csiOwnershipEvaluator;
    this.snapshotMapper = snapshotMapper;
  }

  /**
   * Lists drafts, always scoped to the CSIs the caller may read — including when no {@code csiId}
   * filter was supplied (AC-14, Architecture §9.1). The scope is part of the query, so it is
   * applied before paging and page counts never describe rows the caller cannot see.
   */
  public Page<UITestDto> listTests(String csiId, int page, int size, Authentication auth) {
    Pageable pageable =
        PageRequest.of(page, Math.min(size, 100), Sort.by("createdAt").descending());
    Optional<Set<String>> readable = csiOwnershipEvaluator.readableCsiIds(auth);
    if (readable.isEmpty()) {
      return studioRepository.findAllFiltered(csiId, pageable).map(UITestDto::from);
    }
    Set<String> csiIds = readable.get();
    if (csiIds.isEmpty()) {
      return Page.empty(pageable);
    }
    return studioRepository.findAllFilteredScoped(csiId, csiIds, pageable).map(UITestDto::from);
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
            LegacyStudioAdapter.stepsToJson(request.steps()),
            LegacyStudioAdapter.variablesToJson(request.variables()),
            request.configuration().browser(),
            request.configuration().viewport().width(),
            request.configuration().viewport().height(),
            request.environment(),
            identity.email());
    test.setTimeoutSeconds(request.configuration().timeoutSeconds());
    test.setWaitStrategy(request.configuration().waitStrategy());
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
   * and is rejected with {@code 409 STALE_REVISION} without changing a single field.
   *
   * <p>A step-text change advances {@code sourceRevision}; an execution-affecting configuration
   * change advances {@code configurationRevision}; name/description advance neither. Any increment
   * invalidates the current candidate and returns the draft to {@code STALE}, while the confirmed
   * revision is retained for history.
   *
   * <p>The CSI is never written here: a different value is a {@code 409 CSI_IMMUTABLE}.
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
    test.setSteps(LegacyStudioAdapter.stepsToJson(request.steps()));
    test.setVariables(LegacyStudioAdapter.variablesToJson(request.variables()));
    test.setBrowser(request.configuration().browser());
    test.setViewportWidth(request.configuration().viewport().width());
    test.setViewportHeight(request.configuration().viewport().height());
    test.setTimeoutSeconds(request.configuration().timeoutSeconds());
    test.setWaitStrategy(request.configuration().waitStrategy());
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

  /**
   * Accepts an execution and records its durable dispatch identity in one transaction (Architecture
   * §5.1 step 2).
   *
   * <p>The history row is written {@code PENDING} — accepted, not yet browser-started — which V14
   * made a legal status; before V14 this placeholder wrote a value its own CHECK constraint
   * rejected. The ledger row commits with it and carries the principal-scoped idempotency mapping,
   * so a retry that reaches a different API replica resolves to the same execution instead of
   * starting a second one.
   *
   * <p>No live dispatch happens here: story 10.7 replaces this with the full acceptance
   * transaction, quotas, readiness checks and the dispatcher.
   */
  @Transactional
  public ExecutionSnapshotDto executeTest(UUID testId, Authentication auth, String idempotencyKey) {
    UITest test =
        studioRepository
            .findById(testId)
            .orElseThrow(() -> new IllegalArgumentException("UI Test not found: " + testId));
    String principal = principalOf(auth);
    String digest = requestDigest(testId, principal);

    if (idempotencyKey != null && !idempotencyKey.isBlank()) {
      Optional<StudioDispatchLedger> existing =
          ledgerRepository.findByPrincipalAndIdempotencyKey(principal, idempotencyKey);
      if (existing.isPresent()) {
        StudioDispatchLedger ledger = existing.get();
        if (!digest.equals(ledger.getRequestDigest())) {
          throw new StudioConflictException(
              "IDEMPOTENCY_KEY_REUSED",
              "Idempotency key '"
                  + idempotencyKey
                  + "' was already used with a different request body");
        }
        return findExecutionById(ledger.getExecutionId());
      }
    }

    Instant acceptedAt = Instant.now();
    UITestExecution execution =
        new UITestExecution(testId, ExecutionStatus.PENDING, acceptedAt, test.getCsiId());
    execution.setPrincipal(principal);
    execution.setEnvironment(test.getEnvironment());
    execution = executionRepository.save(execution);

    ledgerRepository.save(
        new StudioDispatchLedger(
            execution.getId(),
            acceptedAt,
            testId,
            test.getCsiId(),
            principal,
            emptyToNull(idempotencyKey),
            emptyToNull(idempotencyKey) == null ? null : digest));

    return snapshotMapper.toSnapshot(execution);
  }

  /**
   * Reads one execution snapshot. The partition locator is resolved through the ledger first, so no
   * query addresses the partitioned history table by id alone (AC-13).
   */
  public ExecutionSnapshotDto findExecutionById(UUID executionId) {
    UITestExecution execution =
        executionRepository
            .findByExecutionId(executionId)
            .orElseThrow(() -> new IllegalArgumentException("Execution not found: " + executionId));
    return snapshotMapper.toSnapshot(execution);
  }

  /**
   * Paged history. {@code testId} is optional, and results are always filtered by the execution's
   * own immutable CSI before paging — never by the parent test's current value, which would move
   * historical evidence if a test were ever reassigned (AC-14, Architecture §9.1).
   *
   * <p>Rows whose CSI could not be resolved by the V14 backfill stay quarantined: they match no
   * scope and are excluded even for administrators (AC-9).
   */
  public Page<ExecutionSnapshotDto> listExecutions(
      UUID testId, int page, int size, Authentication auth) {
    Pageable pageable =
        PageRequest.of(page, Math.min(size, 100), Sort.by("createdAt").descending());
    Optional<Set<String>> readable = csiOwnershipEvaluator.readableCsiIds(auth);

    if (readable.isEmpty()) {
      Page<UITestExecution> all =
          testId == null
              ? executionRepository.findByCsiIdIsNotNull(pageable)
              : executionRepository.findByTestIdAndCsiIdIsNotNull(testId, pageable);
      return all.map(snapshotMapper::toSnapshot);
    }

    Set<String> csiIds = readable.get();
    if (csiIds.isEmpty()) {
      return Page.empty(pageable);
    }
    Page<UITestExecution> scoped =
        testId == null
            ? executionRepository.findByCsiIdIn(csiIds, pageable)
            : executionRepository.findByTestIdAndCsiIdIn(testId, csiIds, pageable);
    return scoped.map(snapshotMapper::toSnapshot);
  }

  /**
   * Moves the last-run projection forward, and only forward (AC-8, Architecture §8.2).
   *
   * <p>Executions finish out of order: a slow run accepted earlier can commit its outcome after a
   * faster, newer one. The projection is therefore written only when the finishing execution is the
   * newest terminal execution of that test by {@code (acceptedAt, executionId)}. Anything older is
   * a late completion and leaves the projection alone.
   *
   * @return true when the projection was advanced
   */
  @Transactional
  public boolean applyLastRunProjection(UUID executionId) {
    UITestExecution execution =
        executionRepository
            .findByExecutionId(executionId)
            .orElseThrow(() -> new IllegalArgumentException("Execution not found: " + executionId));
    String status = LegacyStudioAdapter.normalizeStatus(execution.getStatus());
    if (!ExecutionStatus.isTerminal(status)) {
      return false;
    }
    List<UITestExecution> newest =
        executionRepository.findTerminalNewestFirst(execution.getTestId(), PageRequest.of(0, 1));
    if (newest.isEmpty() || !isSameExecution(newest.get(0), execution)) {
      return false;
    }
    UITest test =
        studioRepository
            .findByIdForUpdate(execution.getTestId())
            .orElseThrow(
                () -> new IllegalArgumentException("UI Test not found: " + execution.getTestId()));
    test.setLastRunAt(execution.getStartedAt());
    test.setLastRunStatus(status);
    return true;
  }

  private static boolean isSameExecution(UITestExecution left, UITestExecution right) {
    return left.getId().equals(right.getId()) && left.getStartedAt().equals(right.getStartedAt());
  }

  private String principalOf(Authentication auth) {
    return extractIdentity(auth).email();
  }

  /**
   * Digest of what was actually requested. Reusing an idempotency key for a different request is a
   * client bug, not a retry, and must not silently return someone else's execution (§5.1).
   */
  private static String requestDigest(UUID testId, String principal) {
    try {
      MessageDigest sha256 = MessageDigest.getInstance("SHA-256");
      byte[] hash =
          sha256.digest(
              ("POST:/tests/" + testId + "/execute:" + principal).getBytes(StandardCharsets.UTF_8));
      return HexFormat.of().formatHex(hash);
    } catch (NoSuchAlgorithmException e) {
      throw new IllegalStateException("SHA-256 is required to compute a request digest", e);
    }
  }

  private static String emptyToNull(String value) {
    return value == null || value.isBlank() ? null : value;
  }

  private UserIdentity extractIdentity(Authentication auth) {
    if (auth instanceof BffAuthenticationToken bff) {
      return bff.getPrincipal();
    }
    throw new AccessDeniedException("Not authenticated");
  }
}
