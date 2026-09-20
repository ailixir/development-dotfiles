package com.citi.put.checks.studio.authoring;

import com.citi.put.checks.security.BffAuthenticationToken;
import com.citi.put.checks.security.CsiOwnershipEvaluator;
import com.citi.put.checks.studio.StudioAccessDeniedException;
import com.citi.put.checks.studio.StudioConflictException;
import com.citi.put.checks.studio.StudioRepository;
import com.citi.put.checks.studio.StudioService;
import com.citi.put.checks.studio.StudioValidationException;
import com.citi.put.checks.studio.compile.ArtifactCanonicalizer;
import com.citi.put.checks.studio.compile.AuthoringLimits;
import com.citi.put.checks.studio.compile.CompilePipeline;
import com.citi.put.checks.studio.compile.CompileState;
import com.citi.put.checks.studio.compile.CompileStateService;
import com.citi.put.checks.studio.compile.CredentialPatternScreen;
import com.citi.put.checks.studio.dto.LegacyStudioAdapter;
import com.citi.put.checks.studio.entity.UITest;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.time.Instant;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.core.Authentication;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

/** Reuses legacy draft persistence, compile and confirmation; all snapshots share a draft lock. */
@Service
public class StudioAuthoringService {
  private final StudioService studio;
  private final StudioRepository tests;
  private final JdbcTemplate jdbc;
  private final ObjectMapper mapper;
  private final CsiOwnershipEvaluator access;
  private final CompilePipeline pipeline;
  private final CompileStateService state;
  private final AuthoringLimits limits;
  private final CredentialPatternScreen credentials;

  @SuppressWarnings("checkstyle:ParameterNumber")
  public StudioAuthoringService(
      StudioService studio,
      StudioRepository tests,
      JdbcTemplate jdbc,
      ObjectMapper mapper,
      CsiOwnershipEvaluator access,
      CompilePipeline pipeline,
      CompileStateService state,
      AuthoringLimits limits,
      CredentialPatternScreen credentials) {
    this.studio = studio;
    this.tests = tests;
    this.jdbc = jdbc;
    this.mapper = mapper;
    this.access = access;
    this.pipeline = pipeline;
    this.state = state;
    this.limits = limits;
    this.credentials = credentials;
  }

  @Transactional
  public AuthoringDtos.View create(AuthoringDtos.Write body, Authentication auth) {
    String principal = principal(auth);
    if (body.csiId() == null || body.csiId().isBlank()) {
      throw new StudioValidationException("CSI_REQUIRED", "csiId is required");
    }
    requirePermission(auth, body.csiId(), true);
    requireCutover();
    validate(body);
    ObjectNode snapshot = mapper.createObjectNode();
    snapshot.put("version", 2);
    var steps = snapshot.putArray("steps");
    List<UUID> allocated = new java.util.ArrayList<>();
    for (AuthoringDtos.Step step : body.steps()) {
      if (step.id() != null) {
        throw new StudioValidationException(
            "INVALID_STEP_ID", "New drafts require server-allocated identities");
      }
      UUID stepId = UUID.randomUUID();
      allocated.add(stepId);
      steps.addObject().put("id", stepId.toString()).put("text", step.text());
    }
    snapshot.set("scope", mapper.valueToTree(body.scope()));
    UUID id =
        studio
            .createTest(
                body.legacy(),
                auth,
                false,
                test -> {
                  test.setAuthoringSnapshot(snapshot.toString());
                  test.setAuthoringHash(ArtifactCanonicalizer.hash(snapshot.toString()));
                  boolean reviewed = "STEP_SCOPED".equals(body.scope().declaration());
                  test.setScopeReviewedBy(reviewed ? principal : null);
                  test.setScopeReviewedAt(
                      reviewed
                          ? Instant.now().truncatedTo(java.time.temporal.ChronoUnit.MICROS)
                          : null);
                })
            .id();
    UITest test = tests.getReferenceById(id);
    tests.flush();
    for (UUID stepId : allocated) {
      jdbc.update(
          "INSERT INTO ui_test_step_identities(step_id,test_id,created_by) VALUES (?,?,?)",
          stepId,
          id,
          principal);
    }
    return view(test);
  }

  @Transactional
  public AuthoringDtos.View update(UUID id, AuthoringDtos.Write body, Authentication auth) {
    UITest test = lock(id, auth, true);
    requireCutover();
    validate(body);
    long source = test.getSourceRevision();
    studio.updateTest(id, body.legacy(), auth, false, true);
    setAuthoring(test, body, principal(auth), source, false);
    if (test.getSourceRevision() > source) {
      test.setCompileStatus(CompileState.STALE);
      test.setCurrentCandidateRevisionId(null);
      test.setCompileDiagnostics(null);
      test.setCompileError(null);
    }
    tests.flush();
    return view(test);
  }

  @Transactional
  public AuthoringDtos.View get(UUID id, Authentication auth) {
    return view(lock(id, auth, false));
  }

  public AuthoringDtos.Accepted compile(UUID id, AuthoringDtos.Compile body, Authentication auth) {
    principal(auth);
    requirePermission(auth, tests.findCsiIdIncludingWithheld(id).orElse(null), true);
    CompileStateService.Capture capture =
        pipeline.compileVersioned(
            id,
            principal(auth),
            body.sourceRevision(),
            body.configurationRevision(),
            body.authoringHash(),
            body.mode());
    JsonNode attempt = readAttempt(id, capture.request().requestId());
    return new AuthoringDtos.Accepted(
        capture.request().requestId(),
        "COMPILING",
        capture.request().sourceRevision(),
        capture.request().configurationRevision(),
        capture.authoringHash(),
        attempt.path("plan"));
  }

  @Transactional
  public AuthoringDtos.View confirm(UUID id, AuthoringDtos.Confirm body, Authentication auth) {
    UITest test = lock(id, auth, true);
    requireCutover();
    state.confirmVersioned(
        id,
        body.compileRequestId(),
        body.revisionId(),
        body.artifactHash(),
        body.sourceRevision(),
        body.configurationRevision(),
        body.authoringHash(),
        principal(auth));
    // Confirmation uses JDBC; refresh the managed draft so projection cannot show pre-confirm
    // state.
    test.setCompileStatus(CompileState.READY);
    test.setConfirmedRevisionId(body.revisionId());
    return view(test);
  }

  @Transactional
  public JsonNode attempt(UUID id, UUID requestId, Authentication auth) {
    lock(id, auth, false);
    return readAttempt(id, requestId);
  }

  private UITest lock(UUID id, Authentication auth, boolean write) {
    principal(auth);
    requirePermission(auth, tests.findCsiIdIncludingWithheld(id).orElse(null), write);
    String lifecycle = tests.findLifecycleState(id).orElse("DELETED");
    if (!"ACTIVE".equals(lifecycle)) {
      throw new StudioConflictException("TEST_" + lifecycle, "Draft is unavailable for authoring");
    }
    return tests
        .findByIdForUpdate(id)
        .orElseThrow(
            () ->
                new StudioConflictException("TEST_DELETED", "Draft is unavailable for authoring"));
  }

  private void requirePermission(Authentication auth, String csiId, boolean write) {
    if (csiId == null || !(write ? access.canWrite(auth, csiId) : access.canRead(auth, csiId))) {
      throw new StudioAccessDeniedException();
    }
  }

  private String principal(Authentication auth) {
    if (auth instanceof BffAuthenticationToken token && token.isAuthenticated()) {
      return token.getPrincipal().email();
    }
    throw new StudioAccessDeniedException();
  }

  private void validate(AuthoringDtos.Write body) {
    LegacyStudioAdapter.validateForWrite(body.legacy());
    var configuration = body.configuration();
    var viewport = configuration.viewport();
    if (viewport == null
        || viewport.width() == null
        || viewport.height() == null
        || viewport.width() < 320
        || viewport.width() > 3840
        || viewport.height() < 240
        || viewport.height() > 2160
        || configuration.timeoutSeconds() == null
        || configuration.timeoutSeconds() < 1
        || configuration.timeoutSeconds() > 120
        || configuration.waitStrategy() == null
        || !List.of("none", "networkidle", "domcontentloaded", "load")
            .contains(configuration.waitStrategy())) {
      throw new StudioValidationException(
          "INVALID_CONFIGURATION", "Configuration exceeds supported bounds");
    }
    for (var variable : body.variables()) {
      if (variable == null
          || variable.name() == null
          || variable.name().length() > 64
          || !("plain".equals(variable.kind()) || "secretRef".equals(variable.kind()))
          || ("secretRef".equals(variable.kind()) && variable.value() != null)) {
        throw new StudioValidationException("INVALID_VARIABLES", "Invalid variable declaration");
      }
    }
    List<String> source = body.steps().stream().map(AuthoringDtos.Step::text).toList();
    limits.requireWithinLimits(source);
    credentials.requireNoInlineCredentials(source);
  }

  private void requireCutover() {
    Boolean enabled =
        jdbc.queryForObject(
            """
        SELECT NOT EXISTS (SELECT 1 FROM pg_constraint
          WHERE conrelid = 'ui_test_revisions'::regclass
            AND conname = 'uq_ui_test_revisions_identity')
          AND EXISTS (SELECT 1 FROM pg_trigger
          WHERE tgrelid = 'ui_test_revisions'::regclass
            AND tgname = 'trg_ui_test_revision_require_request' AND NOT tgisinternal)
        """,
            Boolean.class);
    if (!Boolean.TRUE.equals(enabled)) {
      throw new ResponseStatusException(
          HttpStatus.SERVICE_UNAVAILABLE,
          "Versioned authoring requires the request-identity schema cutover");
    }
  }

  private void setAuthoring(
      UITest test,
      AuthoringDtos.Write body,
      String principal,
      long previousSource,
      boolean creating) {
    java.util.List<UUID> allocated = new java.util.ArrayList<>();
    Set<UUID> seen = new HashSet<>();
    ObjectNode snapshot = mapper.createObjectNode();
    snapshot.put("version", 2);
    var steps = snapshot.putArray("steps");
    for (AuthoringDtos.Step step : body.steps()) {
      UUID id = step.id();
      if (id == null) {
        id = UUID.randomUUID();
        allocated.add(id);
      } else {
        if (creating) {
          throw new StudioValidationException(
              "INVALID_STEP_ID", "New drafts require server-allocated identities");
        }
        Integer owned =
            jdbc.queryForObject(
                "SELECT count(*) FROM ui_test_step_identities WHERE step_id = ? AND test_id = ?",
                Integer.class,
                id,
                test.getId());
        if (!Integer.valueOf(1).equals(owned)) {
          throw new StudioValidationException(
              "INVALID_STEP_ID", "Step identity is not owned by this draft");
        }
      }
      if (!seen.add(id)) {
        throw new StudioValidationException("INVALID_STEP_ID", "Duplicate step identity");
      }
      steps.addObject().put("id", id.toString()).put("text", step.text());
    }
    snapshot.set("scope", mapper.valueToTree(body.scope()));
    String hash = ArtifactCanonicalizer.hash(snapshot.toString());
    if (Objects.equals(hash, test.getAuthoringHash())) {
      return;
    }
    // Metadata changes, including scope-only changes, are always revision-bearing. Incrementing
    // here also binds the per-edit reviewer/time to the same database update as source and scope.
    test.setSourceRevision(creating ? 1 : Math.max(test.getSourceRevision(), previousSource + 1));
    test.setAuthoringSnapshot(snapshot.toString());
    test.setAuthoringHash(hash);
    boolean reviewed = "STEP_SCOPED".equals(body.scope().declaration());
    test.setScopeReviewedBy(reviewed ? principal : null);
    test.setScopeReviewedAt(
        reviewed ? Instant.now().truncatedTo(java.time.temporal.ChronoUnit.MICROS) : null);
    tests.flush();
    for (UUID allocatedId : allocated) {
      jdbc.update(
          "INSERT INTO ui_test_step_identities(step_id,test_id,created_by) VALUES (?,?,?)",
          allocatedId,
          test.getId(),
          principal);
    }
  }

  private AuthoringDtos.View view(UITest test) {
    JsonNode attempt = null;
    if (test.getCompileRequestId() != null) {
      List<UUID> captured =
          jdbc.queryForList(
              "SELECT request_id FROM ui_test_compile_requests WHERE request_id = ? AND test_id = ?",
              UUID.class,
              test.getCompileRequestId(),
              test.getId());
      if (!captured.isEmpty()) {
        attempt = readAttempt(test.getId(), test.getCompileRequestId());
      }
    }
    return new AuthoringDtos.View(
        studio.findTestById(test.getId()),
        parse(test.getAuthoringSnapshot()),
        test.getAuthoringHash(),
        test.getScopeReviewedBy(),
        test.getScopeReviewedAt(),
        attempt);
  }

  private JsonNode readAttempt(UUID id, UUID requestId) {
    List<Map<String, Object>> rows =
        jdbc.queryForList(
            """
        SELECT r.source_revision, r.configuration_revision, r.authoring_hash,
               r.compilation_plan::text, o.outcome::text,
               r.deadline_at <= clock_timestamp() AS expired,
               t.compile_request_id AS current_request_id, t.compile_status,
               t.compile_error::text, t.deleted_at IS NOT NULL OR t.quarantined_at IS NOT NULL AS withheld,
               v.id AS recovered_revision_id, v.artifact_hash AS recovered_artifact_hash
          FROM ui_test_compile_requests r LEFT JOIN ui_test_compile_outcomes o USING (request_id)
          JOIN ui_tests t ON t.id = r.test_id
          LEFT JOIN ui_test_revisions v ON v.compile_request_id = r.request_id AND v.test_id = r.test_id
         WHERE r.request_id = ? AND r.test_id = ?
        """,
            requestId,
            id);
    if (rows.isEmpty()) {
      throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Compile attempt not found");
    }
    Map<String, Object> row = rows.getFirst();
    ObjectNode result = mapper.createObjectNode();
    result.put("compileRequestId", requestId.toString());
    result.put("sourceRevision", ((Number) row.get("source_revision")).longValue());
    result.put("configurationRevision", ((Number) row.get("configuration_revision")).longValue());
    result.put("authoringHash", (String) row.get("authoring_hash"));
    result.set("plan", parse((String) row.get("compilation_plan")));
    result.put("state", "RUNNING");
    result.put("stage", "CAPTURE");
    for (String field : List.of("revisionId", "artifactHash", "errorCode", "diagnostics")) {
      result.putNull(field);
    }
    ObjectNode usage = result.putObject("usage");
    for (String field :
        List.of("proposalCount", "repairCount", "transportAttemptCount", "elapsedMs")) {
      usage.putNull(field);
    }
    for (String field :
        List.of(
            "inputTokens",
            "outputTokens",
            "thinkingTokens",
            "finishReason",
            "cancellationOutcome")) {
      usage.putNull(field);
    }
    usage.put("usageAvailable", false);
    JsonNode outcome = parse((String) row.get("outcome"));
    if (outcome == null) {
      // Recovery derives state from durable facts without winning the append-only telemetry race
      // against a still-running worker. A committed candidate takes precedence over expiry.
      if (row.get("recovered_revision_id") != null) {
        result.put("state", "CANDIDATE");
        result.put("stage", "COMPLETE");
        result.put("revisionId", row.get("recovered_revision_id").toString());
        result.put("artifactHash", (String) row.get("recovered_artifact_hash"));
      } else if (Boolean.TRUE.equals(row.get("expired"))) {
        result.put("state", "FAILED");
        result.put("stage", "COMPLETE");
        result.put("errorCode", "COMPILE_BUDGET_EXCEEDED");
      } else if (requestId.equals(row.get("current_request_id"))
          && "STALE".equals(row.get("compile_status"))
          && row.get("compile_error") != null) {
        result.put("state", "FAILED");
        result.put("stage", "COMPLETE");
        result.put("errorCode", parse((String) row.get("compile_error")).path("code").asText());
      } else if (!requestId.equals(row.get("current_request_id"))
          || Boolean.TRUE.equals(row.get("withheld"))) {
        result.put("state", "DISCARDED");
        result.put("stage", "COMPLETE");
      }
    }
    if (outcome != null) {
      for (String field :
          List.of(
              "state",
              "stage",
              "revisionId",
              "artifactHash",
              "errorCode",
              "diagnostics",
              "usage")) {
        if (outcome.hasNonNull(field)) {
          result.set(field, outcome.get(field));
        }
      }
    }
    return result;
  }

  private JsonNode parse(String value) {
    if (value == null) {
      return null;
    }
    try {
      return mapper.readTree(value);
    } catch (java.io.IOException e) {
      throw new IllegalStateException("Invalid persisted authoring metadata", e);
    }
  }
}
