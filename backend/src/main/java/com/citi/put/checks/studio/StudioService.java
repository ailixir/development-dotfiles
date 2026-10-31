package com.citi.put.checks.studio;

import com.citi.put.checks.csi.CsiRepository;
import com.citi.put.checks.security.BffAuthenticationToken;
import com.citi.put.checks.security.CsiOwnershipEvaluator;
import com.citi.put.checks.security.UserIdentity;
import com.citi.put.checks.studio.authoring.AuthoringRevisionIdentity;
import com.citi.put.checks.studio.authoring.ConfigurationChangeClassifier;
import com.citi.put.checks.studio.dispatch.StudioAcceptanceService;
import com.citi.put.checks.studio.dispatch.StudioDispatchLedgerStatements;
import com.citi.put.checks.studio.dto.AuthoringEvidenceReference;
import com.citi.put.checks.studio.dto.AuthoringRevisionInputs;
import com.citi.put.checks.studio.dto.AuthoringStep;
import com.citi.put.checks.studio.dto.AuthoringV2Request;
import com.citi.put.checks.studio.dto.AuthoringV2Response;
import com.citi.put.checks.studio.dto.CanonicalStudioCodec;
import com.citi.put.checks.studio.dto.ExecutionSnapshotDto;
import com.citi.put.checks.studio.dto.ExecutionStatus;
import com.citi.put.checks.studio.dto.StepAuthoringContext;
import com.citi.put.checks.studio.dto.StudioVariable;
import com.citi.put.checks.studio.dto.UITestDto;
import com.citi.put.checks.studio.dto.UITestRequest;
import com.citi.put.checks.studio.entity.UITest;
import com.citi.put.checks.studio.entity.UITestExecution;
import com.citi.put.checks.studio.entity.UITestRevision;
import com.citi.put.checks.studio.readiness.ExecutionReadinessService;
import com.citi.put.checks.studio.readiness.StudioReadiness;
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
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.core.Authentication;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

@Service
@Transactional(readOnly = true)
public class StudioService {

  private static final ObjectMapper AUTHORING_MAPPER =
      new ObjectMapper()
          .findAndRegisterModules()
          .disable(com.fasterxml.jackson.databind.SerializationFeature.WRITE_DATES_AS_TIMESTAMPS);

  private final StudioRepository studioRepository;
  private final UITestExecutionRepository executionRepository;
  private final UITestRevisionRepository revisionRepository;
  private final CsiRepository csiRepository;
  private final ConfigurationChangeClassifier changeClassifier;
  private final CsiOwnershipEvaluator csiOwnershipEvaluator;
  private final ExecutionSnapshotMapper snapshotMapper;
  private final StudioAcceptanceService acceptanceService;
  private final ExecutionReadinessService readiness;
  private final UserProvisioningService userProvisioningService;
  private final StudioDispatchLedgerStatements ledgerStatements;

  @org.springframework.beans.factory.annotation.Autowired(required = false)
  private com.citi.put.checks.studio.dispatch.StudioProofPromotionService proofs;

  @org.springframework.beans.factory.annotation.Autowired(required = false)
  private com.citi.put.checks.studio.guided.publication.ObservedReplayAuthorizer observedReplay;

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

  /**
   * A soft-deleted test is never run again, and the soft delete does not fire the schedule's {@code
   * ON DELETE CASCADE}, so its shared schedule is removed in the same transaction.
   */
  private void deleteSchedule(UUID testId) {
    entityManager
        .createNativeQuery("DELETE FROM schedules WHERE ui_test_id = :id")
        .setParameter("id", testId)
        .executeUpdate();
  }

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
      ExecutionReadinessService readiness,
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
    this.readiness = readiness;
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

  /** Owners and explicitly authorized administrators may execute (§9.1; Story 10.48, O-22). */
  private void requireExecute(Authentication auth, String csiId) {
    if (csiId == null || !csiOwnershipEvaluator.canExecute(auth, csiId)) {
      throw new StudioAccessDeniedException();
    }
  }

  /**
   * Owners and explicitly authorized administrators may create, save and delete (§9.1; ADR-002
   * §27.2). Architecture §9.1 draws no line between those, so this is the one place {@code
   * canWrite} is asked for any of them.
   *
   * <p>A {@code null} CSI is refused rather than treated as unrestricted. That is the answer for a
   * quarantined row whose {@code csi_id} is {@code NULL} — the other half of V12's CHECK — because
   * no principal can be authorized against a CSI that is not there. ADR-002 §14.4 states the
   * consequence: such a row is recoverable by administrator action, not by a status code.
   *
   * <p>Save and delete read the CSI through the visibility restriction, because a withheld draft is
   * hidden from them, not in conflict (ADR-002 §14.5, §27.2).
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
   * <p>{@code readiness} is derived per draft from its learned revision and its guided sessions, so
   * it is read from {@code GET /tests/{id}} and is {@code null} on this projection.
   *
   * <p>Search, filters and sort (Story 10.46) are validated by {@link StudioListQuery} and applied
   * in the same statement as the scope; the draft id always breaks ties, so equal keys page
   * deterministically.
   */
  public Page<UITestDto> listTests(
      StudioListQuery.Tests query, int page, int size, Authentication auth) {
    Pageable pageable = PageRequest.of(page, Math.min(size, 100));
    Optional<Set<String>> readable = csiOwnershipEvaluator.readableCsiIds(auth);
    if (readable.isPresent() && readable.get().isEmpty()) {
      return Page.empty(pageable);
    }
    return studioRepository
        .findPage(query, readable.orElse(null), pageable)
        .map(
            test -> {
              StudioReadiness state = readiness == null ? null : readiness.readiness(test.getId());
              return UITestDto.forList(test, state, verificationOf(test, state));
            });
  }

  /**
   * Creates a draft. The CSI is required, must be registered, and can never be changed afterwards
   * (Architecture §9.1; V12 CHECK {@code ck_ui_tests_csi_registered}).
   *
   * <p>Only an owner or an explicitly authorized administrator of that CSI may create on it
   * (ADR-002 §27.2). The registered-CSI check runs first: its {@code 400} is the same whoever asks,
   * so it discloses nothing, and the write check follows before any side effect.
   */
  /** Creates a draft with its v2 authoring identity present from the first write. */
  @Transactional
  public UITestDto createTest(
      UITestRequest request, AuthoringV2Request authoring, Authentication auth) {
    return createTest(request, authoring, auth, StudioService::noInitializer);
  }

  /** No-op initializer for drafts without versioned metadata. */
  private static void noInitializer(UITest test) {}

  /**
   * The one implementation behind every {@code createTest} overload above. The authorization order
   * is ADR-002 §27.2's and is not affected by which overload was called.
   */
  private UITestDto createTest(
      UITestRequest request,
      AuthoringV2Request authoring,
      Authentication auth,
      java.util.function.Consumer<UITest> initialize) {
    UserIdentity identity = extractIdentity(auth);
    if (request.csiId() == null || request.csiId().isBlank()) {
      throw new IllegalArgumentException("csiId is required");
    }
    requireRegisteredCsi(request.csiId());
    requireWrite(auth, request.csiId());
    validateAuthoring(authoring, request.csiId());
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
            CanonicalStudioCodec.stepsToJson(stepTexts(authoring)),
            CanonicalStudioCodec.variablesToJson(request.variables()),
            request.configuration().browser(),
            request.configuration().viewport().width(),
            request.configuration().viewport().height(),
            request.environment(),
            identity.email());
    test.setTimeoutSeconds(request.configuration().timeoutSeconds());
    test.setWaitStrategy(request.configuration().waitStrategy());
    storeAuthoring(test, authoring);
    initialize.accept(test);
    test = studioRepository.save(test);
    // Saving never issues a model call. A new draft is UNLEARNED until the author presses Run.
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
  public record AuthoringDraft(
      UITestDto test, AuthoringV2Response authoring, String readinessReason) {
    public AuthoringDraft(UITestDto test, AuthoringV2Response authoring) {
      this(test, authoring, null);
    }
  }

  @Transactional
  public AuthoringDraft createAuthoringDraft(
      UITestRequest metadata, AuthoringV2Request authoring, Authentication auth) {
    CanonicalStudioCodec.validateForWrite(metadata);
    CanonicalStudioCodec.variablesToJson(metadata.variables());
    // The registered-CSI check and then the write check run inside createTest, in that order
    // (ADR-002 s27.2): an unregistered CSI is a 400 whoever asks, so it is not preceded by a 403.
    UITestDto created = createTest(metadata, authoring, auth);
    return readAuthoringDraft(created.id(), auth);
  }

  /**
   * Reads the sole canonical authoring generation without modifying identity.
   *
   * <p>The order is ADR-002 §27.2's (STUDIO-OBS-009 AC-9 TF-3, T0 ruling A8 option (ii)), the one
   * {@link #lockForAuthoringWrite} uses with {@code requireRead} in place of {@code requireWrite}:
   * a visible read, {@code requireRead}, only then the locked read, a flush and refresh of the
   * locked copy, and {@code requireRead} again. A caller who may not read the draft is refused
   * {@code 403} before it can lock the row; unknown, withheld and unreadable ids all answer the
   * same way. The lock itself stays: the projection reads the draft and its readiness together, and
   * a concurrent save must not interleave.
   */
  @Transactional
  public AuthoringDraft readAuthoringDraft(UUID id, Authentication auth) {
    UITest visible = studioRepository.findById(id).orElseThrow(StudioAccessDeniedException::new);
    requireRead(auth, visible.getCsiId());
    UITest test =
        studioRepository.findByIdForUpdate(id).orElseThrow(StudioAccessDeniedException::new);
    if (entityManager != null) {
      // The locking query returns the instance this transaction already manages, unrefreshed.
      // Flush first so the refresh cannot discard the caller's own pending writes.
      entityManager.flush();
      entityManager.refresh(test);
    }
    requireRead(auth, test.getCsiId());
    if (test.getAuthoring() == null) {
      throw new IllegalStateException("Missing canonical authoring for test " + id);
    }
    return authoringDraft(test);
  }

  /** One CAS, one transaction, and at most one increment per revision dimension per save. */
  @Transactional
  public AuthoringDraft updateAuthoringDraft(
      UUID id, UITestRequest metadata, AuthoringV2Request authoring, Authentication auth) {
    CanonicalStudioCodec.validateForWrite(metadata);
    CanonicalStudioCodec.variablesToJson(metadata.variables());
    if (metadata.sourceRevision() == null || metadata.configurationRevision() == null) {
      throw new IllegalArgumentException(
          "sourceRevision and configurationRevision are required on update");
    }
    UITest test =
        lockForAuthoringWrite(
            id, metadata.sourceRevision(), metadata.configurationRevision(), auth);
    long sourceRevision = test.getSourceRevision();
    long configurationRevision = test.getConfigurationRevision();
    if (metadata.csiId() != null && !metadata.csiId().equals(test.getCsiId())) {
      throw new StudioConflictException("CSI_IMMUTABLE", "A draft cannot move to another CSI");
    }
    validateAuthoring(authoring, test.getCsiId());
    // Reuse metadata classification without replacing v2 identities.
    UITestRequest metadataOnly =
        new UITestRequest(
            metadata.name(),
            metadata.description(),
            metadata.csiId(),
            metadata.environment(),
            CanonicalStudioCodec.parseSteps(test.getSteps()),
            metadata.variables(),
            metadata.configuration(),
            sourceRevision,
            configurationRevision);
    updateMetadata(test, metadataOnly);
    persistAuthoring(test, authoring);
    test.setSourceRevision(Math.min(test.getSourceRevision(), sourceRevision + 1));
    test.setConfigurationRevision(
        Math.min(test.getConfigurationRevision(), configurationRevision + 1));
    return authoringDraft(test);
  }

  /**
   * Returns the sole persisted authoring representation after CSI authorization. A plain read: the
   * draft is read without a lock and {@code requireRead} runs before anything else, so a caller who
   * may not read it never takes a row lock (ADR-002 s27.2).
   */
  public AuthoringV2Response findAuthoringV2ById(UUID id, Authentication auth) {
    UITest test = studioRepository.findById(id).orElseThrow(StudioAccessDeniedException::new);
    requireRead(auth, test.getCsiId());
    if (test.getAuthoring() == null) {
      throw new IllegalStateException("Missing canonical authoring for test " + id);
    }
    return authoringResponse(test);
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
    AuthoringV2Response response = persistAuthoring(test, authoring);
    return response;
  }

  /** Private metadata engine; the enclosing authoring transaction already owns the row. */
  private void updateMetadata(UITest test, UITestRequest request) {
    UUID id = test.getId();
    AuthoringV2Request persistedAuthoring = readAuthoring(test.getAuthoring());
    ConfigurationChangeClassifier.Classification change = changeClassifier.classify(test, request);

    test.setName(request.name());
    test.setDescription(request.description());
    test.setSteps(
        CanonicalStudioCodec.stepsToJson(
            persistedAuthoring == null ? request.steps() : stepTexts(persistedAuthoring)));
    test.setVariables(CanonicalStudioCodec.variablesToJson(request.variables()));
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

    if (change.sourceChanged()) {
      test.setSourceRevision(Math.addExact(test.getSourceRevision(), 1));
    }
    if (change.configurationChanged()) {
      test.setConfigurationRevision(Math.addExact(test.getConfigurationRevision(), 1));
    }
    test.setUpdatedAt(Instant.now());
  }

  /**
   * The single-draft projection: the draft row, its learned revision and its readiness.
   *
   * <p>Revisions are <b>immutable</b>, so once the draft names one, that revision's artifact and
   * hash cannot change underneath the read. Readiness is derived by the same predicate the execute
   * path consults, after pending writes of this transaction are flushed, so a save's own response
   * already reports the readiness of the state it wrote. {@code NEEDS_RELEARN} is not produced yet
   * (STUDIO-OBS-015), so {@code firstChangedStepId} is always {@code null}.
   *
   * @param test the draft row
   * @return the full representation
   */
  private UITestDto project(UITest test) {
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
    StudioReadiness state = readinessOf(test);
    UUID boundary = null;
    if (state == StudioReadiness.NEEDS_RELEARN) {
      String id = readiness.change(test.getId()).firstChangedStepId();
      boundary = id == null ? null : UUID.fromString(id);
    }
    return UITestDto.from(test, confirmed, state, boundary, verificationOf(test, state));
  }

  /** The proof state of a recorded revision; non-null exactly when the draft is RECORDED. */
  private UITestDto.Verification verificationOf(UITest test, StudioReadiness state) {
    if (state != StudioReadiness.RECORDED || proofs == null) {
      return null;
    }
    UUID candidate = readiness.pointers(test.getId()).candidate();
    var verification = proofs.verification(test.getId(), candidate);
    return new UITestDto.Verification(verification.state(), verification.firstUnverifiedStepId());
  }

  private AuthoringDraft authoringDraft(UITest test) {
    UITestDto projected = project(test);
    String reason = null;
    if (readiness != null && projected.readiness() == StudioReadiness.NEEDS_RELEARN) {
      reason = readiness.change(test.getId()).reason();
    }
    return new AuthoringDraft(projected, authoringResponse(test), reason);
  }

  private StudioReadiness readinessOf(UITest test) {
    if (readiness == null) {
      return null;
    }
    if (entityManager != null) {
      // Readiness reads through JDBC; the save this projection reports must be visible to it.
      entityManager.flush();
    }
    return readiness.readiness(test.getId());
  }

  private UITest lockForAuthoringWrite(
      UUID id, long sourceRevision, long configurationRevision, Authentication auth) {
    UITest visible = studioRepository.findById(id).orElseThrow(StudioAccessDeniedException::new);
    requireWrite(auth, visible.getCsiId());
    UITest test =
        studioRepository.findByIdForUpdate(id).orElseThrow(StudioAccessDeniedException::new);
    if (entityManager != null) {
      entityManager.flush();
      entityManager.refresh(test);
    }
    requireWrite(auth, test.getCsiId());
    if (test.getAuthoring() == null) {
      throw new IllegalStateException("Missing canonical authoring for test " + id);
    }
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

  private AuthoringV2Response persistAuthoring(UITest test, AuthoringV2Request requested) {
    validateAuthoring(requested, test.getCsiId());
    if (test.getAuthoring() == null) {
      throw new IllegalStateException("Missing canonical authoring for test " + test.getId());
    }
    AuthoringV2Request previous = readAuthoring(test.getAuthoring());
    boolean sourceChanged = !stepIdentity(previous).equals(stepIdentity(requested));
    boolean configurationChanged = !contextIdentity(previous).equals(contextIdentity(requested));

    test.setSteps(CanonicalStudioCodec.stepsToJson(stepTexts(requested)));
    storeAuthoring(test, requested);
    if (sourceChanged) {
      test.setSourceRevision(Math.addExact(test.getSourceRevision(), 1));
    }
    if (configurationChanged) {
      test.setConfigurationRevision(Math.addExact(test.getConfigurationRevision(), 1));
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
      if (step.text() == null || step.text().length() > AuthoringStep.MAX_TEXT_CHARS) {
        throw new StudioValidationException(
            "INVALID_AUTHORING",
            "step text is required and limited to " + AuthoringStep.MAX_TEXT_CHARS + " characters");
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
        authoring.authoringSchemaVersion(), authoring.globalContext(), authoring.steps(), inputs);
  }

  private static AuthoringRevisionInputs revisionInputs(UITest test, AuthoringV2Request authoring) {
    Map<String, String> plainValues = new HashMap<>();
    for (StudioVariable variable : CanonicalStudioCodec.parseVariables(test.getVariables())) {
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
            .findByIdForUpdate(id)
            .orElseThrow(() -> new IllegalArgumentException("UI Test not found: " + id));
    deleteSchedule(id);
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
    test = studioRepository.findByIdForUpdate(id).orElseThrow(StudioAccessDeniedException::new);
    entityManager.flush();
    entityManager.refresh(test);
    deleteSchedule(id);
    test.setDeletedAt(Instant.now());
  }

  /**
   * Accepts an execution (AC-7 – AC-11).
   *
   * <p>Authorization happens here, on the server, before any work: only an owner or an explicitly
   * authorized administrator of the draft's CSI may execute it (§9.1), decided by {@link
   * CsiOwnershipEvaluator#canExecute} as everywhere else. Every other caller gets the same {@code
   * 403} as an unknown id, before readiness, quota, idempotency or the race resolution below are
   * reached (Story 10.48, ADR-002 O-22). The check lives here and not in {@link
   * StudioAcceptanceService}: its {@code acceptCore} is shared with scheduled runs, which have no
   * request {@link Authentication} and run as the constant scheduler principal instead.
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
    return executeTest(testId, auth, idempotencyKey, null);
  }

  @Transactional(propagation = Propagation.NOT_SUPPORTED)
  public ExecutionSnapshotDto executeTest(
      UUID testId,
      Authentication auth,
      String idempotencyKey,
      jakarta.servlet.http.HttpServletRequest request) {
    UITest test = studioRepository.findById(testId).orElseThrow(StudioAccessDeniedException::new);
    requireExecute(auth, test.getCsiId());
    String principal = principalOf(auth);

    UUID executionId;
    try {
      UUID runnable = readiness.runnableRevisionId(testId);
      UITestRevision current =
          runnable == null ? null : revisionRepository.findById(runnable).orElse(null);
      if (current != null && current.getArtifactSchemaVersion() >= 2) {
        if (observedReplay == null) {
          throw new StudioConflictException(
              "RUNTIME_INCOMPATIBLE", "Observed replay is unavailable");
        }
        var grant = observedReplay.authorize(testId, runnable, auth, request);
        executionId =
            acceptanceService.acceptObserved(
                testId, grant.binding().path("principalId").asText(), idempotencyKey, grant);
      } else {
        executionId = acceptanceService.accept(testId, principal, idempotencyKey);
      }
    } catch (StudioAcceptanceService.IdempotencyRaceException race) {
      executionId =
          acceptanceService.resolveIdempotencyRace(
              testId, race.getPrincipal(), race.getIdempotencyKey());
    }
    return findExecutionById(executionId);
  }

  /**
   * "Verify again": re-runs the model-free proof of the recorded revision (ADR-SC-008 D5, FR-12).
   * Offered only while the test is RECORDED and its verification is INCOMPLETE (a proof that was
   * refused, cancelled, timed out or never started); a running proof and a FAILED proof are 409
   * {@code VERIFY_NOT_AVAILABLE} (D-4). Authorization, idempotency and the race resolution are
   * those of {@link #executeTest}.
   */
  @Transactional(propagation = Propagation.NOT_SUPPORTED)
  public ExecutionSnapshotDto verifyRecorded(
      UUID testId,
      Authentication auth,
      String idempotencyKey,
      jakarta.servlet.http.HttpServletRequest request) {
    UITest test = studioRepository.findById(testId).orElseThrow(StudioAccessDeniedException::new);
    requireExecute(auth, test.getCsiId());
    if (observedReplay == null || proofs == null) {
      throw new StudioConflictException("RUNTIME_INCOMPATIBLE", "Observed replay is unavailable");
    }
    // A retry of an accepted request is answered with that execution, whatever the state is now.
    // The ledger stores the Core user id the grant carries, not the e-mail.
    Optional<UUID> earlier =
        acceptanceService.acceptedUnderKey(extractIdentity(auth).userId(), idempotencyKey);
    if (earlier.isPresent()) {
      return findExecutionById(earlier.get());
    }
    if (readiness.readiness(testId) != StudioReadiness.RECORDED) {
      throw new StudioConflictException(
          "NOT_RECORDED", "The draft has no recorded revision to verify");
    }
    UUID candidate = readiness.pointers(testId).candidate();
    if (!com.citi.put.checks.studio.dispatch.StudioProofPromotionService.Verification.INCOMPLETE
        .equals(proofs.verification(testId, candidate).state())) {
      throw new StudioConflictException(
          "VERIFY_NOT_AVAILABLE", "The proof of the recorded revision is running or has failed");
    }
    UUID executionId;
    try {
      var grant = observedReplay.authorize(testId, candidate, auth, request);
      executionId =
          acceptanceService.acceptVerify(
              testId,
              grant.binding().path("principalId").asText(),
              idempotencyKey,
              grant,
              candidate);
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
    String principal = principalOf(auth);
    if (execution.getCsiId() == null) {
      throw new StudioAccessDeniedException();
    }
    if (!principal.equals(execution.getPrincipal())) {
      requireWrite(auth, execution.getCsiId());
    }

    if (ledgerStatements.requestCancel(executionId, principal, Instant.now()).isEmpty()) {
      // Zero rows is the verdict; this only names it. A row whose outcome is known — terminal, or
      // FINALIZING its evidence — is EXECUTION_TERMINAL even when a cancel is what ended it.
      String status = execution.getStatus();
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
   * Reads one execution snapshot. The initiating principal may always follow the run the API
   * accepted for them; other callers are authorized against the execution's immutable CSI — never
   * the parent test's current value or a mutable parent lookup.
   *
   * <p>A quarantined row (no CSI at all) is unreadable by everyone, including administrators.
   */
  public ExecutionSnapshotDto findExecutionById(UUID executionId, Authentication auth) {
    UITestExecution execution =
        executionRepository
            .findByExecutionId(executionId)
            .orElseThrow(StudioAccessDeniedException::new);
    if (execution.getCsiId() == null) {
      throw new StudioAccessDeniedException();
    }
    String principal = principalOf(auth);
    if (!principal.equals(execution.getPrincipal())) {
      requireRead(auth, execution.getCsiId());
    }
    return snapshotMapper.toSnapshot(execution);
  }

  /**
   * Paged history. {@code testId} is optional, and results are always filtered by the execution's
   * own immutable CSI before paging — never by the parent test's current value, which would move
   * historical evidence if a test were ever reassigned (AC-14, Architecture §9.1).
   *
   * <p>Rows whose CSI could not be resolved by the V14 backfill stay quarantined: they match no
   * scope and are excluded even for administrators (AC-9).
   *
   * <p>Story 10.46 adds {@code csiId}, {@code status}, {@code q} and {@code sort}. {@code csiId} is
   * one more equality on the execution's own CSI, so it intersects with the scope and can never
   * widen it. Each item is labelled with its draft's name, resolved for the whole page at once.
   */
  public Page<ExecutionSnapshotDto> listExecutions(
      StudioListQuery.Executions query, int page, int size, Authentication auth) {
    Pageable pageable = PageRequest.of(page, Math.min(size, 100));
    Optional<Set<String>> readable = csiOwnershipEvaluator.readableCsiIds(auth);
    if (readable.isPresent() && readable.get().isEmpty()) {
      return Page.empty(pageable);
    }
    Page<UITestExecution> executions =
        executionRepository.findPage(query, readable.orElse(null), pageable);
    Map<UUID, String> names =
        testNames(executions.getContent().stream().map(UITestExecution::getTestId).toList());
    return executions.map(
        execution ->
            snapshotMapper.toSnapshot(execution).withTestName(names.get(execution.getTestId())));
  }

  /**
   * {@link #findExecutionById(UUID, Authentication)}, labelled with the draft's current name for
   * {@code GET /executions/{id}} and the SSE frames, which must carry the same payload (Story
   * 10.46, §5.5). Kept apart from the authorization read so the video route and the stream's
   * authorization refresh, which call that read, do not pay for a name they never render.
   */
  public ExecutionSnapshotDto readExecution(UUID executionId, Authentication auth) {
    ExecutionSnapshotDto snapshot = findExecutionById(executionId, auth);
    return snapshot.withTestName(studioRepository.findVisibleName(snapshot.testId()));
  }

  /**
   * Names of the visible drafts among {@code testIds}, in one statement. A deleted or quarantined
   * draft has no entry, so its runs carry {@code testName: null}.
   */
  private Map<UUID, String> testNames(List<UUID> testIds) {
    if (testIds.isEmpty()) {
      return Map.of();
    }
    Map<UUID, String> names = new HashMap<>();
    studioRepository
        .findNamesByIdIn(new HashSet<>(testIds))
        .forEach(name -> names.put(name.getId(), name.getName()));
    return names;
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
    String status = execution.getStatus();
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
