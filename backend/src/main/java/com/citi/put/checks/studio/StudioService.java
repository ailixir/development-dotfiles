package com.citi.put.checks.studio;

import com.citi.put.checks.csi.CsiRepository;
import com.citi.put.checks.security.BffAuthenticationToken;
import com.citi.put.checks.security.CsiOwnershipEvaluator;
import com.citi.put.checks.security.UserIdentity;
import com.citi.put.checks.studio.authoring.AuthoringRevisionIdentity;
import com.citi.put.checks.studio.authoring.LegacyAuthoringPersistenceAdapter;
import com.citi.put.checks.studio.compile.CompilePipeline;
import com.citi.put.checks.studio.compile.CompileRequest;
import com.citi.put.checks.studio.compile.CompileState;
import com.citi.put.checks.studio.compile.CompileStateService;
import com.citi.put.checks.studio.compile.ConfigurationChangeClassifier;
import com.citi.put.checks.studio.dispatch.StudioAcceptanceService;
import com.citi.put.checks.studio.dispatch.StudioDispatchLedgerStatements;
import com.citi.put.checks.studio.dto.AuthoringEvidenceReference;
import com.citi.put.checks.studio.dto.AuthoringRevisionInputs;
import com.citi.put.checks.studio.dto.AuthoringStep;
import com.citi.put.checks.studio.dto.AuthoringV2Request;
import com.citi.put.checks.studio.dto.AuthoringV2Response;
import com.citi.put.checks.studio.dto.CompileAcceptedDto;
import com.citi.put.checks.studio.dto.ConfirmCompileRequestDto;
import com.citi.put.checks.studio.dto.ExecutionSnapshotDto;
import com.citi.put.checks.studio.dto.ExecutionStatus;
import com.citi.put.checks.studio.dto.LegacyAuthoringRequest;
import com.citi.put.checks.studio.dto.LegacyStudioAdapter;
import com.citi.put.checks.studio.dto.StepAuthoringContext;
import com.citi.put.checks.studio.dto.StudioAuthoring;
import com.citi.put.checks.studio.dto.StudioVariable;
import com.citi.put.checks.studio.dto.UITestDto;
import com.citi.put.checks.studio.dto.UITestRequest;
import com.citi.put.checks.studio.entity.UITest;
import com.citi.put.checks.studio.entity.UITestExecution;
import com.citi.put.checks.studio.entity.UITestRevision;
import com.citi.put.checks.users.UserProvisioningService;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.persistence.EntityManager;
import jakarta.persistence.PersistenceContext;
import java.time.Instant;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
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

  private static final ObjectMapper AUTHORING_MAPPER = new ObjectMapper().findAndRegisterModules();

  private final StudioRepository studioRepository;
  private final UITestExecutionRepository executionRepository;
  private final UITestRevisionRepository revisionRepository;
  private final CsiRepository csiRepository;
  private final ConfigurationChangeClassifier changeClassifier;
  private final CsiOwnershipEvaluator csiOwnershipEvaluator;
  private final ExecutionSnapshotMapper snapshotMapper;
  private final StudioAcceptanceService acceptanceService;
  private final CompilePipeline compilePipeline;
  private final CompileStateService compileStateService;
  private final UserProvisioningService userProvisioningService;
  private final StudioDispatchLedgerStatements ledgerStatements;

  /**
   * Used for one thing: to refresh the draft the authorized save has just locked (ADR-002 §27.2,
   * steps 2 and 4). Hibernate hands an entity it already holds back to a later query unchanged,
   * even a locking one, so without this the locked read would compare the request's revisions
   * against the copy the visibility read loaded before the lock, and two concurrent saves could
   * both win. It refreshes rather than detaching that copy, because a detach would also unmanage an
   * instance the caller's own transaction holds (story 10.30 QA finding DETACH-1), and it flushes
   * before refreshing, because a refresh discards whatever that caller has left pending (QA finding
   * REFRESH-FLUSH-1).
   */
  @PersistenceContext private EntityManager entityManager;

  @SuppressWarnings("checkstyle:ParameterNumber")
  public StudioService(
      StudioRepository studioRepository,
      UITestExecutionRepository executionRepository,
      UITestRevisionRepository revisionRepository,
      CsiRepository csiRepository,
      ConfigurationChangeClassifier changeClassifier,
      CsiOwnershipEvaluator csiOwnershipEvaluator,
      ExecutionSnapshotMapper snapshotMapper,
      StudioAcceptanceService acceptanceService,
      CompilePipeline compilePipeline,
      CompileStateService compileStateService,
      UserProvisioningService userProvisioningService,
      StudioDispatchLedgerStatements ledgerStatements) {
    this.studioRepository = studioRepository;
    this.executionRepository = executionRepository;
    this.revisionRepository = revisionRepository;
    this.csiRepository = csiRepository;
    this.changeClassifier = changeClassifier;
    this.csiOwnershipEvaluator = csiOwnershipEvaluator;
    this.snapshotMapper = snapshotMapper;
    this.acceptanceService = acceptanceService;
    this.compilePipeline = compilePipeline;
    this.compileStateService = compileStateService;
    this.userProvisioningService = userProvisioningService;
    this.ledgerStatements = ledgerStatements;
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
   * Owners and explicitly authorized administrators may create, save, delete, compile and confirm
   * (§9.1; ADR-002 §27.2). Architecture §9.1 draws no line between those five, so this is the one
   * place {@code canWrite} is asked for any of them.
   *
   * <p>A {@code null} CSI is refused rather than treated as unrestricted. That is the answer for a
   * quarantined row whose {@code csi_id} is {@code NULL} — the other half of V12's CHECK — because
   * no principal can be authorized against a CSI that is not there. ADR-002 §14.4 states the
   * consequence: such a row is recoverable by administrator action, not by a status code.
   *
   * <p>Which CSI is passed in is the caller's decision, and it differs on purpose. Compile and
   * confirm read it <em>through</em> a withheld draft ({@link
   * StudioRepository#findCsiIdIncludingWithheld}), because they must answer {@code 409} for one.
   * Save and delete read it through the visibility restriction, because a withheld draft is hidden
   * from them, not in conflict (ADR-002 §14.5, §27.2).
   */
  private void requireWrite(Authentication auth, String csiId) {
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
   *
   * <p>Only an owner or an explicitly authorized administrator of that CSI may create on it
   * (ADR-002 §27.2). The registered-CSI check runs first: its {@code 400} is the same whoever asks,
   * so it discloses nothing, and the write check follows before any side effect.
   */
  @Transactional
  public UITestDto createTest(UITestRequest request, Authentication auth) {
    return createTest(request, null, auth);
  }

  /** Creates a draft with its v2 authoring identity present before any compile can be enqueued. */
  @Transactional
  public UITestDto createTest(
      UITestRequest request, AuthoringV2Request authoring, Authentication auth) {
    return createTest(request, authoring, auth, true, StudioService::noInitializer);
  }

  /** Saves versioned drafts without implicitly issuing a model call. */
  @Transactional
  public UITestDto createTest(UITestRequest request, Authentication auth, boolean enqueueCompile) {
    return createTest(request, null, auth, enqueueCompile, StudioService::noInitializer);
  }

  /** No-op initializer for drafts without versioned metadata. */
  private static void noInitializer(UITest test) {}

  /** Initializes versioned metadata before the entity's first INSERT. */
  @Transactional
  public UITestDto createTest(
      UITestRequest request,
      Authentication auth,
      boolean enqueueCompile,
      java.util.function.Consumer<UITest> initialize) {
    return createTest(request, null, auth, enqueueCompile, initialize);
  }

  /**
   * The one implementation behind every {@code createTest} overload above. The authorization order
   * is ADR-002 §27.2's and is not affected by which overload was called.
   */
  private UITestDto createTest(
      UITestRequest request,
      AuthoringV2Request authoring,
      Authentication auth,
      boolean enqueueCompile,
      java.util.function.Consumer<UITest> initialize) {
    UserIdentity identity = extractIdentity(auth);
    if (request.csiId() == null || request.csiId().isBlank()) {
      throw new IllegalArgumentException("csiId is required");
    }
    requireRegisteredCsi(request.csiId());
    requireWrite(auth, request.csiId());
    if (authoring != null) {
      validateAuthoring(authoring, request.csiId());
    }
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
            LegacyStudioAdapter.stepsToJson(
                authoring == null ? request.steps() : stepTexts(authoring)),
            LegacyStudioAdapter.variablesToJson(request.variables()),
            request.configuration().browser(),
            request.configuration().viewport().width(),
            request.configuration().viewport().height(),
            request.environment(),
            identity.email());
    test.setTimeoutSeconds(request.configuration().timeoutSeconds());
    test.setWaitStrategy(request.configuration().waitStrategy());
    if (authoring != null) {
      storeAuthoring(test, authoring);
    }
    initialize.accept(test);
    test = studioRepository.save(test);
    // §8.3 — "persist draft and enqueue compile without waiting for gateway" (AC-2). The enqueue
    // is registered as an after-commit synchronisation, so the row is committed and readable from
    // another connection before the compile reads it, and no gateway or runner call is ever made
    // inside this transaction or on this thread.
    //
    // A draft created with no steps has no source to compile; enqueueing one would spend a gateway
    // call to be told so. It is left for the author's first save, which is a source change.
    if (enqueueCompile && !(authoring == null ? request.steps() : authoring.steps()).isEmpty()) {
      compilePipeline.enqueueAfterCommit(test.getId(), identity.email());
    }
    return project(test);
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
    return project(test);
  }

  /** Internal read with no authorization; callers that already authorized use this. */
  public UITestDto findTestById(UUID id) {
    UITest test =
        studioRepository
            .findById(id)
            .orElseThrow(() -> new IllegalArgumentException("UI Test not found: " + id));
    return project(test);
  }

  /** Metadata and authoring projected under one transaction/row lock, never two HTTP reads. */
  public record AuthoringDraft(UITestDto test, AuthoringV2Response authoring) {}

  @Transactional
  public AuthoringDraft createAuthoringDraft(
      UITestRequest metadata, AuthoringV2Request authoring, Authentication auth) {
    requireWrite(auth, metadata.csiId());
    UITestDto created = createTest(metadata, authoring, auth);
    return readAuthoringDraft(created.id(), auth);
  }

  /** GET does not adapt legacy rows or mint IDs; the first explicit v2 save promotes them. */
  @Transactional
  public AuthoringDraft readAuthoringDraft(UUID id, Authentication auth) {
    UITest test =
        studioRepository.findByIdForUpdate(id).orElseThrow(StudioAccessDeniedException::new);
    requireRead(auth, test.getCsiId());
    if (test.getAuthoring() == null) {
      throw new StudioConflictException(
          "LEGACY_AUTHORING", "Load the v1 draft and save v2 before reading v2");
    }
    return new AuthoringDraft(project(test), authoringResponse(test));
  }

  /** One CAS, one transaction, and at most one increment per revision dimension per save. */
  @Transactional
  public AuthoringDraft updateAuthoringDraft(
      UUID id, UITestRequest metadata, AuthoringV2Request authoring, Authentication auth) {
    UITest test =
        lockForAuthoringWrite(
            id, metadata.sourceRevision(), metadata.configurationRevision(), auth);
    long sourceRevision = test.getSourceRevision();
    long configurationRevision = test.getConfigurationRevision();
    if (metadata.csiId() != null && !metadata.csiId().equals(test.getCsiId())) {
      throw new StudioConflictException("CSI_IMMUTABLE", "A draft cannot move to another CSI");
    }
    validateAuthoring(authoring, test.getCsiId());
    // Reuse metadata classification without replacing v2 identities or enqueueing an intermediate
    // compile.
    UITestRequest metadataOnly =
        new UITestRequest(
            metadata.name(),
            metadata.description(),
            metadata.csiId(),
            metadata.environment(),
            LegacyStudioAdapter.parseSteps(test.getSteps()),
            metadata.variables(),
            metadata.configuration(),
            sourceRevision,
            configurationRevision);
    updateTest(id, metadataOnly, null);
    persistAuthoring(test, authoring, test.getAuthoring() == null);
    test.setSourceRevision(Math.min(test.getSourceRevision(), sourceRevision + 1));
    test.setConfigurationRevision(
        Math.min(test.getConfigurationRevision(), configurationRevision + 1));
    return new AuthoringDraft(project(test), authoringResponse(test));
  }

  /**
   * Reads persisted authoring without adapting it. A legacy row remains a list of exact strings and
   * acquires no step IDs merely because it was read.
   */
  public StudioAuthoring findAuthoringById(UUID id, Authentication auth) {
    UITest test = studioRepository.findById(id).orElseThrow(StudioAccessDeniedException::new);
    requireRead(auth, test.getCsiId());
    if (test.getAuthoring() == null) {
      return new LegacyAuthoringRequest(LegacyStudioAdapter.parseSteps(test.getSteps()));
    }
    return readAuthoring(test.getAuthoring());
  }

  /** Returns the v2 response including the persisted execution-affecting identity. */
  public AuthoringV2Response findAuthoringV2ById(UUID id, Authentication auth) {
    UITest test = studioRepository.findById(id).orElseThrow(StudioAccessDeniedException::new);
    requireRead(auth, test.getCsiId());
    if (test.getAuthoring() == null) {
      throw new StudioConflictException(
          "LEGACY_AUTHORING", "UI Test " + id + " has not been promoted to authoring v2");
    }
    return authoringResponse(test);
  }

  /**
   * Performs the explicit first v2 write for a legacy row. IDs are deterministic, but become part
   * of the public identity only if this transaction commits.
   */
  @Transactional
  public AuthoringV2Response adaptLegacyAuthoring(
      UUID id, long sourceRevision, long configurationRevision, Authentication auth) {
    UITest test = lockForAuthoringWrite(id, sourceRevision, configurationRevision, auth);
    AuthoringV2Request authoring =
        test.getAuthoring() == null
            ? LegacyAuthoringPersistenceAdapter.adapt(test.getId(), test.getSteps())
            : readAuthoring(test.getAuthoring());
    return persistAuthoring(test, authoring, test.getAuthoring() == null);
  }

  /** Atomically saves v2 authoring under the same two-token CAS as ordinary Studio updates. */
  @Transactional
  public AuthoringV2Response saveAuthoring(
      UUID id,
      AuthoringV2Request authoring,
      long sourceRevision,
      long configurationRevision,
      Authentication auth) {
    UITest test = lockForAuthoringWrite(id, sourceRevision, configurationRevision, auth);
    validateAuthoring(authoring, test.getCsiId());
    return persistAuthoring(test, authoring, test.getAuthoring() == null);
  }

  /** Alias matching the existing update naming used by repository/service callers. */
  @Transactional
  public AuthoringV2Response updateAuthoring(
      UUID id,
      AuthoringV2Request authoring,
      long sourceRevision,
      long configurationRevision,
      Authentication auth) {
    return saveAuthoring(id, authoring, sourceRevision, configurationRevision, auth);
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
   * <p><b>With a caller, the order of refusal is ADR-002 §27.2's</b>: (1) the required revisions,
   * which do not depend on the stored row; (2) the draft read through the visibility restriction —
   * absent, soft-deleted and quarantined are all {@code 403}; (3) {@code canWrite} on that draft's
   * CSI; (4) the locked read, where a draft that disappeared since step 2 is also {@code 403}; (5)
   * only then {@code 409 STALE_REVISION} and {@code 409 CSI_IMMUTABLE}. The read is never {@link
   * StudioRepository#findCsiIdIncludingWithheld}: an owner of a withheld draft who passed
   * authorization would otherwise see it through the status code (ADR-002 §14.5).
   *
   * <p>Without a caller — the internal overload above — steps 2 and 3 do not run and an absent
   * draft is still {@code IllegalArgumentException("UI Test not found: …")}, exactly as before.
   *
   * @param id the draft to save
   * @param request the new draft state
   * @param auth the caller, or {@code null} on the internal path
   * @return the saved draft
   * @throws StudioAccessDeniedException the caller may not write this draft, or it is not visible
   */
  @Transactional
  public UITestDto updateTest(UUID id, UITestRequest request, Authentication auth) {
    return updateTest(id, request, auth, true, false);
  }

  /** Versioned authoring holds the same row lock and supplies structured metadata atomically. */
  @Transactional
  public UITestDto updateTest(
      UUID id,
      UITestRequest request,
      Authentication auth,
      boolean enqueueCompile,
      boolean preserveAuthoring) {
    if (request.sourceRevision() == null || request.configurationRevision() == null) {
      throw new IllegalArgumentException(
          "sourceRevision and configurationRevision are required on update");
    }
    if (auth != null) {
      UITest visible = studioRepository.findById(id).orElseThrow(StudioAccessDeniedException::new);
      requireWrite(auth, visible.getCsiId());
    }
    UITest test =
        studioRepository
            .findByIdForUpdate(id)
            .orElseThrow(
                () ->
                    auth != null
                        ? new StudioAccessDeniedException()
                        : new IllegalArgumentException("UI Test not found: " + id));
    if (auth != null) {
      // The visible read above put this draft in the persistence context, and Hibernate hands a
      // managed entity back to the locking query unrefreshed: without this, a save that committed
      // between the two reads is invisible to the revision check and gets overwritten. The row lock
      // is held, so the refresh reads its latest committed state. It keeps the instance managed:
      // a caller that already holds this draft in its own transaction keeps writing through it
      // (story 10.30 QA finding DETACH-1). The flush is what keeps that caller's writes made
      // *before* this call: a refresh reads the row and discards whatever is still pending against
      // it. Under Hibernate's default AUTO flush mode the locking query above happens to have
      // flushed them already, but under FlushModeType.COMMIT or Hibernate's MANUAL nothing has, and
      // they would be dropped with no error and a successful save (QA finding REFRESH-FLUSH-1).
      // Flushing here, after the locking read, writes them while this transaction holds the row.
      entityManager.flush();
      entityManager.refresh(test);
    }

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

    AuthoringV2Request persistedAuthoring =
        test.getAuthoring() == null ? null : readAuthoring(test.getAuthoring());
    if (persistedAuthoring != null && !stepTexts(persistedAuthoring).equals(request.steps())) {
      throw new StudioValidationException(
          "AUTHORING_V2_REQUIRED",
          "This draft uses stable v2 step identities; edit steps through the v2 authoring save"
              + " operation and reload both revision tokens before retrying");
    }

    ConfigurationChangeClassifier.Classification change = changeClassifier.classify(test, request);

    test.setName(request.name());
    test.setDescription(request.description());
    test.setSteps(
        LegacyStudioAdapter.stepsToJson(
            persistedAuthoring == null ? request.steps() : stepTexts(persistedAuthoring)));
    test.setVariables(LegacyStudioAdapter.variablesToJson(request.variables()));
    test.setBrowser(request.configuration().browser());
    test.setViewportWidth(request.configuration().viewport().width());
    test.setViewportHeight(request.configuration().viewport().height());
    test.setTimeoutSeconds(request.configuration().timeoutSeconds());
    test.setWaitStrategy(request.configuration().waitStrategy());
    test.setEnvironment(request.environment());
    if (persistedAuthoring != null) {
      // Plain variable values are revision inputs when referenced from v2 context.
      storeAuthoring(test, persistedAuthoring);
    }

    boolean invalidateAuthoring =
        !preserveAuthoring && change.anyChanged() && test.getAuthoringSnapshot() != null;
    if (invalidateAuthoring) {
      test.setAuthoringSnapshot(null);
      test.setAuthoringHash(null);
      test.setScopeReviewedBy(null);
      test.setScopeReviewedAt(null);
    }
    if (change.sourceChanged() || invalidateAuthoring) {
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
    if (enqueueCompile && change.anyChanged() && auth != null) {
      compilePipeline.enqueueAfterCommit(id, principalOf(auth));
    }
    return project(test);
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
    requireWrite(auth, studioRepository.findCsiIdIncludingWithheld(testId).orElse(null));
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
    requireWrite(auth, studioRepository.findCsiIdIncludingWithheld(testId).orElse(null));
    compileStateService.confirm(
        testId,
        request.revisionId(),
        request.artifactHash(),
        request.sourceRevision(),
        request.configurationRevision(),
        principalOf(auth));
    return findTestById(testId);
  }

  /**
   * The single-draft projection, with the candidate revision ADR-002 §21 put on the body.
   *
   * <p>The revision is looked up by the id the draft row itself carries, scoped to that draft, and
   * read beside it rather than on a second request from the client. That is §21.3's ruling: {@code
   * ConfirmCompileRequest} is a conditional transaction over four fields, and a client assembling
   * them from two reads could pair a hash from the second with a revision id from the first while a
   * recompile landed in between — an internally inconsistent body that {@code STALE_CANDIDATE} was
   * never designed to name.
   *
   * <p>The pair is stable for a second reason that is worth stating because it is what makes this
   * safe on the one path that has no surrounding transaction ({@code confirmCompile}): revisions
   * are <b>immutable</b>. {@code trg_ui_test_revisions_write_once} rejects any UPDATE other than
   * confirmation bookkeeping, so once the draft names a candidate, that candidate's artifact and
   * hash cannot change underneath the read. What can change is <em>which</em> revision the draft
   * names, and that is read first.
   *
   * <p>A draft with no candidate costs no query at all — the absence is read from the draft row.
   *
   * @param test the draft row
   * @return the full representation, with the candidate's artifact and hash or nulls
   */
  private UITestDto project(UITest test) {
    UUID candidateId = test.getCurrentCandidateRevisionId();
    UITestRevision candidate =
        candidateId == null
            ? null
            : revisionRepository.findByIdAndTestId(candidateId, test.getId()).orElse(null);
    UUID confirmedId = test.getConfirmedRevisionId();
    UITestRevision confirmed =
        confirmedId == null
            ? null
            : revisionRepository
                .findByIdAndTestId(confirmedId, test.getId())
                .filter(revision -> java.util.Objects.equals(revision.getCsiId(), test.getCsiId()))
                .filter(
                    revision ->
                        revision.getConfirmedAt() != null && revision.getConfirmedBy() != null)
                .orElse(null);
    return UITestDto.from(test, candidate, confirmed);
  }

  private UITest lockForAuthoringWrite(
      UUID id, long sourceRevision, long configurationRevision, Authentication auth) {
    UITest test =
        studioRepository.findByIdForUpdate(id).orElseThrow(StudioAccessDeniedException::new);
    requireWrite(auth, test.getCsiId());
    if (sourceRevision != test.getSourceRevision()
        || configurationRevision != test.getConfigurationRevision()) {
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
    return test;
  }

  private AuthoringV2Response persistAuthoring(
      UITest test, AuthoringV2Request requested, boolean legacyPromotion) {
    validateAuthoring(requested, test.getCsiId());
    AuthoringV2Request previous = legacyPromotion ? null : readAuthoring(test.getAuthoring());

    boolean sourceChanged =
        previous == null
            ? !LegacyStudioAdapter.parseSteps(test.getSteps()).equals(stepTexts(requested))
            : !stepIdentity(previous).equals(stepIdentity(requested));
    boolean configurationChanged =
        legacyPromotion || !contextIdentity(previous).equals(contextIdentity(requested));

    test.setSteps(LegacyStudioAdapter.stepsToJson(stepTexts(requested)));
    storeAuthoring(test, requested);
    if (sourceChanged) {
      test.setSourceRevision(test.getSourceRevision() + 1);
    }
    if (configurationChanged) {
      test.setConfigurationRevision(test.getConfigurationRevision() + 1);
    }
    if (sourceChanged || configurationChanged) {
      test.setCompileStatus(CompileState.STALE);
      test.setCurrentCandidateRevisionId(null);
      test.setCompileDiagnostics(null);
      test.setCompileError(null);
    }
    test.setUpdatedAt(Instant.now());
    return authoringResponse(test);
  }

  private static List<String> stepTexts(AuthoringV2Request authoring) {
    return authoring.steps().stream().map(AuthoringStep::text).toList();
  }

  private static List<List<Object>> stepIdentity(AuthoringV2Request authoring) {
    return authoring.steps().stream().map(step -> List.<Object>of(step.id(), step.text())).toList();
  }

  private static Map<String, Object> contextIdentity(AuthoringV2Request authoring) {
    if (authoring == null) {
      return Map.of();
    }
    Map<UUID, StepAuthoringContext> nonemptyStepContexts = new LinkedHashMap<>();
    for (AuthoringStep step : authoring.steps()) {
      if (!step.context().entries().isEmpty() || !step.context().evidenceReferences().isEmpty()) {
        nonemptyStepContexts.put(step.id(), step.context());
      }
    }
    Map<String, Object> identity = new LinkedHashMap<>();
    identity.put("globalContext", authoring.globalContext());
    identity.put("stepContexts", nonemptyStepContexts);
    return identity;
  }

  private static void validateAuthoring(AuthoringV2Request authoring, String csiId) {
    if (authoring == null || authoring.authoringSchemaVersion() != 2 || authoring.steps() == null) {
      throw new StudioValidationException("INVALID_AUTHORING", "authoring v2 is required");
    }
    Set<UUID> stepIds = new HashSet<>();
    for (AuthoringStep step : authoring.steps()) {
      if (step == null || step.id() == null) {
        throw new StudioValidationException("MISSING_STEP_ID", "every step requires an id");
      }
      if (!stepIds.add(step.id())) {
        throw new StudioValidationException(
            "DUPLICATE_STEP_ID", "step id " + step.id() + " occurs more than once");
      }
      if (step.text() == null || step.text().length() > 500) {
        throw new StudioValidationException(
            "INVALID_AUTHORING", "step text is required and limited to 500 characters");
      }
    }
    Map<UUID, AuthoringEvidenceReference> evidenceById = new HashMap<>();
    validateEvidence(
        authoring.globalContext().evidenceReferences(), stepIds, evidenceById, null, csiId);
    for (AuthoringStep step : authoring.steps()) {
      validateEvidence(
          step.context().evidenceReferences(), stepIds, evidenceById, step.id(), csiId);
    }
  }

  private static void validateEvidence(
      List<AuthoringEvidenceReference> references,
      Set<UUID> stepIds,
      Map<UUID, AuthoringEvidenceReference> evidenceById,
      UUID owner,
      String csiId) {
    for (AuthoringEvidenceReference reference : references) {
      if (reference == null || reference.source() != AuthoringEvidenceReference.Source.SUPPLIED) {
        throw new StudioValidationException(
            "FALSE_OBSERVED_PROVENANCE", "authoring accepts supplied evidence only");
      }
      AuthoringEvidenceReference existing = evidenceById.putIfAbsent(reference.id(), reference);
      if (existing != null && !existing.equals(reference)) {
        throw new StudioValidationException(
            "DUPLICATE_EVIDENCE_REFERENCE",
            "one evidence identity cannot describe different evidence");
      }
      if (!stepIds.contains(reference.stepId())
          || owner != null && !owner.equals(reference.stepId())) {
        throw new StudioValidationException(
            "ORPHAN_STEP_ID", "evidence references a step outside its context scope");
      }
      if (!csiId.equals(reference.csiId())) {
        throw new StudioAccessDeniedException();
      }
    }
  }

  private static void storeAuthoring(UITest test, AuthoringV2Request authoring) {
    AuthoringRevisionInputs inputs = revisionInputs(test, authoring);
    test.setAuthoring(writeJson(authoring));
    test.setAuthoringRevisionInputs(writeJson(inputs));
  }

  private static AuthoringV2Response authoringResponse(UITest test) {
    AuthoringV2Request authoring = readAuthoring(test.getAuthoring());
    AuthoringRevisionInputs inputs =
        readJson(test.getAuthoringRevisionInputs(), AuthoringRevisionInputs.class);
    return new AuthoringV2Response(
        authoring.authoringSchemaVersion(),
        authoring.globalContext(),
        authoring.steps(),
        inputs,
        null);
  }

  private static AuthoringRevisionInputs revisionInputs(UITest test, AuthoringV2Request authoring) {
    Map<String, String> plainValues = new HashMap<>();
    for (StudioVariable variable : LegacyStudioAdapter.parseVariables(test.getVariables())) {
      if (StudioVariable.KIND_PLAIN.equals(variable.kind())) {
        plainValues.put(variable.name(), variable.value());
      }
    }
    return AuthoringRevisionIdentity.create(authoring, plainValues);
  }

  private static AuthoringV2Request readAuthoring(String json) {
    return readJson(json, AuthoringV2Request.class);
  }

  private static <T> T readJson(String json, Class<T> type) {
    try {
      return AUTHORING_MAPPER.readValue(json, type);
    } catch (JsonProcessingException exception) {
      throw new StudioValidationException(
          "INVALID_AUTHORING",
          "persisted authoring cannot be read: " + exception.getOriginalMessage());
    }
  }

  private static String writeJson(Object value) {
    try {
      return AUTHORING_MAPPER.writeValueAsString(value);
    } catch (JsonProcessingException exception) {
      throw new StudioValidationException(
          "INVALID_AUTHORING", "authoring cannot be serialized: " + exception.getOriginalMessage());
    }
  }

  private void requireRegisteredCsi(String csiId) {
    if (csiId == null || csiId.isBlank()) {
      throw new IllegalArgumentException("csiId is required");
    }
    if (!csiRepository.existsById(csiId)) {
      throw new IllegalArgumentException("csiId is not a registered CSI: " + csiId);
    }
  }

  /** Internal soft delete with no authorization; callers that already authorized use this. */
  @Transactional
  public void softDeleteTest(UUID id) {
    UITest test =
        studioRepository
            .findById(id)
            .orElseThrow(() -> new IllegalArgumentException("UI Test not found: " + id));
    test.setDeletedAt(Instant.now());
  }

  /**
   * Soft-deletes a draft for a caller who may write its CSI (ADR-002 §27.2).
   *
   * <p>The draft is read through the visibility restriction, so an unknown id, an already
   * soft-deleted draft and a quarantined draft are all {@code 403} with nothing written — the same
   * answer as a draft on a CSI the caller may not write. The row that was authorized is the managed
   * row that is changed; there is no revision to compare, so no second read is needed.
   *
   * @param id the draft to delete
   * @param auth the caller
   * @throws StudioAccessDeniedException the caller may not write this draft, or it is not visible
   */
  @Transactional
  public void softDeleteTest(UUID id, Authentication auth) {
    UITest test = studioRepository.findById(id).orElseThrow(StudioAccessDeniedException::new);
    requireWrite(auth, test.getCsiId());
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

  /** {@code 409} code: the execution already has its outcome, so there is nothing to cancel. */
  public static final String EXECUTION_TERMINAL = "EXECUTION_TERMINAL";

  /** {@code 409} code: a cancel was already recorded for this execution. */
  public static final String CANCEL_ALREADY_REQUESTED = "CANCEL_ALREADY_REQUESTED";

  /**
   * Cancels an execution (Studio v1 WP4, ADR-002 §29) and returns its snapshot as committed.
   *
   * <p>Authorization comes first and is the write check on the <b>execution's own immutable
   * CSI</b>, exactly as reads are keyed (AC-4a): an unknown id and a CSI the caller may not write
   * answer the same {@code 403}. Then one compare-and-set on the ledger decides everything: queued
   * work is closed {@code ERROR / CANCELLED} at once and never reaches a runner; dispatched work
   * has the request recorded and ends when the runner or the running reaper ends it. A statement
   * that matched nothing is a {@code 409} — the outcome is already known, or a cancel was already
   * asked for.
   *
   * <p>{@code NOT_SUPPORTED} because this class is {@code readOnly = true} by default and the
   * snapshot returned must be read after the statement commits, not from a persistence context that
   * loaded the row before it.
   */
  @Transactional(propagation = Propagation.NOT_SUPPORTED)
  public ExecutionSnapshotDto cancelExecution(UUID executionId, Authentication auth) {
    UITestExecution execution =
        executionRepository
            .findByExecutionId(executionId)
            .orElseThrow(StudioAccessDeniedException::new);
    requireWrite(auth, execution.getCsiId());
    String principal = principalOf(auth);

    if (ledgerStatements.requestCancel(executionId, principal, Instant.now()).isEmpty()) {
      // Zero rows is the verdict; this only names it. A row whose outcome is known — terminal, or
      // FINALIZING its evidence — is EXECUTION_TERMINAL even when a cancel is what ended it.
      String status = LegacyStudioAdapter.normalizeStatus(execution.getStatus());
      boolean outcomeKnown =
          ExecutionStatus.isTerminal(status)
              || ledgerStatements
                  .find(executionId)
                  .map(
                      row ->
                          Set.of("FINALIZING", "DONE").contains(String.valueOf(row.get("state"))))
                  .orElse(true);
      throw outcomeKnown
          ? new StudioConflictException(
              EXECUTION_TERMINAL, "This execution has already reached its outcome")
          : new StudioConflictException(
              CANCEL_ALREADY_REQUESTED, "A cancel was already requested for this execution");
    }
    // The statement wrote through JDBC; the persistence context bound to this method still holds
    // the row as it was read for authorization. Clear it so the snapshot is the committed one.
    entityManager.clear();
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
