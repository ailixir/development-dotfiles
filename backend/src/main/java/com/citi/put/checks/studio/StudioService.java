package com.citi.put.checks.studio;

import com.citi.put.checks.csi.CsiRepository;
import com.citi.put.checks.security.BffAuthenticationToken;
import com.citi.put.checks.security.CsiOwnershipEvaluator;
import com.citi.put.checks.security.UserIdentity;
import com.citi.put.checks.studio.compile.CompilePipeline;
import com.citi.put.checks.studio.compile.CompileRequest;
import com.citi.put.checks.studio.compile.CompileState;
import com.citi.put.checks.studio.compile.CompileStateService;
import com.citi.put.checks.studio.compile.ConfigurationChangeClassifier;
import com.citi.put.checks.studio.dispatch.StudioAcceptanceService;
import com.citi.put.checks.studio.dto.CompileAcceptedDto;
import com.citi.put.checks.studio.dto.ConfirmCompileRequestDto;
import com.citi.put.checks.studio.dto.ExecutionSnapshotDto;
import com.citi.put.checks.studio.dto.ExecutionStatus;
import com.citi.put.checks.studio.dto.LegacyStudioAdapter;
import com.citi.put.checks.studio.dto.UITestDto;
import com.citi.put.checks.studio.dto.UITestRequest;
import com.citi.put.checks.studio.entity.UITest;
import com.citi.put.checks.studio.entity.UITestExecution;
import com.citi.put.checks.users.UserProvisioningService;
import java.time.Instant;
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
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

@Service
@Transactional(readOnly = true)
public class StudioService {

  private final StudioRepository studioRepository;
  private final UITestExecutionRepository executionRepository;
  private final CsiRepository csiRepository;
  private final ConfigurationChangeClassifier changeClassifier;
  private final CsiOwnershipEvaluator csiOwnershipEvaluator;
  private final ExecutionSnapshotMapper snapshotMapper;
  private final StudioAcceptanceService acceptanceService;
  private final CompilePipeline compilePipeline;
  private final CompileStateService compileStateService;
  private final UserProvisioningService userProvisioningService;

  @SuppressWarnings("checkstyle:ParameterNumber")
  public StudioService(
      StudioRepository studioRepository,
      UITestExecutionRepository executionRepository,
      CsiRepository csiRepository,
      ConfigurationChangeClassifier changeClassifier,
      CsiOwnershipEvaluator csiOwnershipEvaluator,
      ExecutionSnapshotMapper snapshotMapper,
      StudioAcceptanceService acceptanceService,
      CompilePipeline compilePipeline,
      CompileStateService compileStateService,
      UserProvisioningService userProvisioningService) {
    this.studioRepository = studioRepository;
    this.executionRepository = executionRepository;
    this.csiRepository = csiRepository;
    this.changeClassifier = changeClassifier;
    this.csiOwnershipEvaluator = csiOwnershipEvaluator;
    this.snapshotMapper = snapshotMapper;
    this.acceptanceService = acceptanceService;
    this.compilePipeline = compilePipeline;
    this.compileStateService = compileStateService;
    this.userProvisioningService = userProvisioningService;
  }

  // ── server-side authorization (AC-4a, §9.1) ──────────────────────────────

  /**
   * Readers may read; the check happens on the server, before any work, on every route.
   *
   * <p>The CSI it keys on is the caller-supplied resource's own, resolved before anything else is
   * done with it. A caller who may not read it gets {@link StudioAccessDeniedException} — the same
   * answer an absent id gets, so neither status can be used as an existence oracle.
   */
  private void requireRead(Authentication auth, String csiId) {
    if (csiId == null || !csiOwnershipEvaluator.canRead(auth, csiId)) {
      throw new StudioAccessDeniedException();
    }
  }

  /** Owners and explicitly authorized administrators may execute (§9.1). */
  private void requireExecute(Authentication auth, String csiId) {
    if (csiId == null || !csiOwnershipEvaluator.canExecute(auth, csiId)) {
      throw new StudioAccessDeniedException();
    }
  }

  /**
   * Owners and explicitly authorized administrators may compile and confirm (§9.1).
   *
   * <p>A {@code null} CSI is refused rather than treated as unrestricted. That is the answer for a
   * quarantined row whose {@code csi_id} is {@code NULL} — the other half of V12's CHECK — because
   * no principal can be authorized against a CSI that is not there. ADR-002 §14.4 states the
   * consequence: such a row is recoverable by administrator action, not by a status code.
   */
  private void requireCompile(Authentication auth, String csiId) {
    if (csiId == null || !csiOwnershipEvaluator.canWrite(auth, csiId)) {
      throw new StudioAccessDeniedException();
    }
  }

  /**
   * Lists drafts, always scoped to the CSIs the caller may read — including when no {@code csiId}
   * filter was supplied (AC-14, Architecture §9.1). The scope is part of the query, so it is
   * applied before paging and page counts never describe rows the caller cannot see.
   *
   * <p>The one field this projection omits is {@code compileDiagnostics}, which is always {@code
   * null} here and is read from {@code GET /tests/{id}} (ADR-002 §16.5). The document is capped per
   * draft, so a page of drafts in {@code NEEDS_REVISION} would be a multi-megabyte response
   * carrying per-step reasons no list renders. {@code compileStatus} and the bounded {@code
   * compileError} stay, so nothing a caller needs in order to know that reasons exist is hidden.
   */
  public Page<UITestDto> listTests(String csiId, int page, int size, Authentication auth) {
    Pageable pageable =
        PageRequest.of(page, Math.min(size, 100), Sort.by("createdAt").descending());
    Optional<Set<String>> readable = csiOwnershipEvaluator.readableCsiIds(auth);
    if (readable.isEmpty()) {
      return studioRepository.findAllFiltered(csiId, pageable).map(UITestDto::forList);
    }
    Set<String> csiIds = readable.get();
    if (csiIds.isEmpty()) {
      return Page.empty(pageable);
    }
    return studioRepository.findAllFilteredScoped(csiId, csiIds, pageable).map(UITestDto::forList);
  }

  /**
   * Creates a draft. The CSI is required, must be registered, and can never be changed afterwards
   * (Architecture §9.1; V12 CHECK {@code ck_ui_tests_csi_registered}).
   */
  @Transactional
  public UITestDto createTest(UITestRequest request, Authentication auth) {
    UserIdentity identity = extractIdentity(auth);
    requireRegisteredCsi(request.csiId());
    // The draft records its author, and `created_by` REFERENCES users(email) (V1). The mirror row
    // that satisfies it is written by story 1.6's asynchronous listener, which is racing this very
    // request: an author whose mirror has not landed yet is a foreign key violation and a 500 on
    // the first draft they create. The author is a precondition of the write, so it is established
    // here, in this transaction, rather than hoped for.
    userProvisioningService.ensureMirrored(identity);
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
    // §8.3 — "persist draft and enqueue compile without waiting for gateway" (AC-2). The enqueue
    // is registered as an after-commit synchronisation, so the row is committed and readable from
    // another connection before the compile reads it, and no gateway or runner call is ever made
    // inside this transaction or on this thread.
    //
    // A draft created with no steps has no source to compile; enqueueing one would spend a gateway
    // call to be told so. It is left for the author's first save, which is a source change.
    if (!request.steps().isEmpty()) {
      compilePipeline.enqueueAfterCommit(test.getId(), identity.email());
    }
    return UITestDto.from(test);
  }

  /**
   * Reads one draft, authorized against its CSI before anything is returned (AC-4a).
   *
   * <p>An unreadable CSI and an unknown id give the same answer on purpose: see {@link
   * StudioAccessDeniedException}.
   */
  public UITestDto findTestById(UUID id, Authentication auth) {
    UITest test = studioRepository.findById(id).orElseThrow(StudioAccessDeniedException::new);
    requireRead(auth, test.getCsiId());
    return UITestDto.from(test);
  }

  /** Internal read with no authorization; callers that already authorized use this. */
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
    return updateTest(id, request, null);
  }

  /**
   * The same save, with the identity to attribute an enqueued compile to (AC-2).
   *
   * <p>The two-argument form above is the internal one and enqueues nothing: there is no principal
   * to attribute a gateway call and an audit line to, and inventing one would put a compile in
   * another user's name. It is not a gap — the save itself has already returned the draft to {@code
   * STALE} and cleared its candidate, which is exactly the state the author's next explicit
   * recompile clears.
   *
   * <p>A compile is enqueued only when the save actually moved a revision. A name- or
   * description-only edit moves neither, leaves the confirmed revision confirmable (§4.2) and
   * therefore has nothing to compile; enqueueing there would drive a confirmed draft to {@code
   * COMPILING} and spend a gateway call to rediscover the artifact it already holds.
   *
   * @param id the draft to save
   * @param request the new draft state
   * @param auth the caller, or {@code null} on the internal path
   * @return the saved draft
   */
  @Transactional
  public UITestDto updateTest(UUID id, UITestRequest request, Authentication auth) {
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
    if (change.anyChanged() && auth != null) {
      compilePipeline.enqueueAfterCommit(id, principalOf(auth));
    }
    return UITestDto.from(test);
  }

  /**
   * Enqueues a compile of the current source and returns its persisted identity (AC-1, §8.3).
   *
   * <p>The order of refusal is the contract's, and ADR-002 §14.4 fixes it: <b>authorization, then
   * the lifecycle guard, then authoring bounds and the credential screen, then {@code
   * beginCompile}</b>. Authorization runs first so that a caller who may not act on the draft's CSI
   * never learns from a status code whether the draft exists — which is possible here only because
   * the CSI is read through the visibility restriction, the same read that makes a {@code 409}
   * possible at all.
   *
   * <p>Everything after authorization belongs to {@code CompilePipeline}: a withheld draft is
   * refused {@code 409} with its own code ({@code TEST_DELETED} or {@code TEST_QUARANTINED}) by
   * 10.4's guard, an over-bound or credential-carrying draft is refused {@code 400} with no compile
   * state moved, and only then is a request identity persisted.
   *
   * <p>{@code NOT_SUPPORTED} because this class is {@code readOnly = true} by default: {@code
   * beginCompile} writes, and without it that write would join a read-only transaction and fail.
   *
   * @param testId the draft to compile
   * @param auth the caller
   * @return the persisted compile request identity and the revisions it was begun for
   * @throws StudioAccessDeniedException the caller may not compile this draft, or it does not exist
   * @throws StudioConflictException the draft is deleted or quarantined ({@code 409})
   * @throws StudioValidationException over an authoring bound, or an inline credential ({@code
   *     400}), with no compile state moved
   */
  @Transactional(propagation = Propagation.NOT_SUPPORTED)
  public CompileAcceptedDto compileTest(UUID testId, Authentication auth) {
    requireCompile(auth, studioRepository.findCsiIdIncludingWithheld(testId).orElse(null));
    CompileRequest request = compilePipeline.compile(testId, principalOf(auth));
    return new CompileAcceptedDto(
        request.requestId(),
        CompileState.COMPILING.name(),
        request.sourceRevision(),
        request.configurationRevision());
  }

  /**
   * Confirms exactly the candidate the author reviewed (AC-1, §4.2, §8.3).
   *
   * <p>The order of refusal is ADR-002 §14.4's: <b>identity, then CSI authorization, then the
   * lifecycle guard, then the confirmation transaction</b>. Authorization runs before the lifecycle
   * read so that a caller who may not act on the draft's CSI never learns from a status code
   * whether the draft exists — possible here only because the CSI is read through the visibility
   * restriction, the same read that makes a {@code 409} possible at all.
   *
   * <p>The one documented exception is bean validation: a malformed body is rejected {@code 400}
   * during argument resolution, before this method runs. That discloses nothing — a malformed body
   * answers identically for an id that never existed.
   *
   * <p><b>This method holds no comparison.</b> All four exactness terms travel into {@link
   * CompileStateService#confirm}'s two conditional statements and are decided by the database
   * against the committed row. There is no second confirmation path, no read-then-write, and
   * nothing here loosens the guard 10.4 wrote: a mismatch on any term is {@code 409
   * STALE_CANDIDATE} and the whole transaction rolls back.
   *
   * <p>{@code NOT_SUPPORTED} because this class is {@code readOnly = true} by default: {@code
   * confirm} writes, and without it that write would join a read-only transaction and fail. The
   * draft is re-read afterwards, so the {@code 200} body is the committed state rather than the
   * state the caller hoped for.
   *
   * @param testId the draft whose candidate is being confirmed
   * @param request the frozen four-field body
   * @param auth the caller
   * @return the committed draft, now {@code READY}
   * @throws StudioAccessDeniedException the caller may not confirm this draft, or it does not exist
   * @throws StudioConflictException the draft is deleted or quarantined, or the body does not match
   *     the current unconfirmed candidate exactly ({@code 409})
   */
  @Transactional(propagation = Propagation.NOT_SUPPORTED)
  public UITestDto confirmCompile(
      UUID testId, ConfirmCompileRequestDto request, Authentication auth) {
    requireCompile(auth, studioRepository.findCsiIdIncludingWithheld(testId).orElse(null));
    compileStateService.confirm(
        testId,
        request.revisionId(),
        request.artifactHash(),
        request.sourceRevision(),
        request.configurationRevision(),
        principalOf(auth));
    return findTestById(testId);
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
   * Accepts an execution (AC-7 – AC-11).
   *
   * <p>Authorization happens here, on the server, before any work: only an owner or an explicitly
   * authorized administrator of the draft's CSI may execute it (§9.1).
   *
   * <p>The transaction itself belongs to {@link StudioAcceptanceService}. This method is
   * deliberately <em>not</em> transactional: when the durable idempotency index refuses a second
   * row, the losing transaction is finished and cannot read anything, so the winner is resolved in
   * a new one. That is what makes "two concurrent executes yield exactly one execution" true across
   * replicas rather than merely likely.
   *
   * <p>{@code NOT_SUPPORTED} because this class is {@code readOnly = true} by default: without it
   * the acceptance transaction would join a read-only one and every insert would fail.
   */
  @Transactional(propagation = Propagation.NOT_SUPPORTED)
  public ExecutionSnapshotDto executeTest(UUID testId, Authentication auth, String idempotencyKey) {
    UITest test = studioRepository.findById(testId).orElseThrow(StudioAccessDeniedException::new);
    requireExecute(auth, test.getCsiId());
    String principal = principalOf(auth);

    UUID executionId;
    try {
      executionId = acceptanceService.accept(testId, principal, idempotencyKey);
    } catch (StudioAcceptanceService.IdempotencyRaceException race) {
      executionId =
          acceptanceService.resolveIdempotencyRace(
              testId, race.getPrincipal(), race.getIdempotencyKey());
    }
    return findExecutionById(executionId);
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
   * Reads one execution snapshot, authorized against the <b>execution's own immutable CSI</b> —
   * never the parent test's current value and never a mutable parent lookup, and equally for a
   * soft-deleted test, whose history must stay readable to the people who could always read it
   * (AC-4a, §9.1).
   *
   * <p>A quarantined row (no CSI at all) is unreadable by everyone, including administrators.
   */
  public ExecutionSnapshotDto findExecutionById(UUID executionId, Authentication auth) {
    UITestExecution execution =
        executionRepository
            .findByExecutionId(executionId)
            .orElseThrow(StudioAccessDeniedException::new);
    requireRead(auth, execution.getCsiId());
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

  private UserIdentity extractIdentity(Authentication auth) {
    if (auth instanceof BffAuthenticationToken bff) {
      return bff.getPrincipal();
    }
    throw new AccessDeniedException("Not authenticated");
  }
}
