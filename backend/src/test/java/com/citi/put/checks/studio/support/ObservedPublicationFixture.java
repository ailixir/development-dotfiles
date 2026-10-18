package com.citi.put.checks.studio.support;

import com.citi.put.checks.config.CoreServiceProperties;
import com.citi.put.checks.security.BffAuthenticationToken;
import com.citi.put.checks.security.CoreServiceClient;
import com.citi.put.checks.security.CoreServiceUnauthorizedException;
import com.citi.put.checks.security.UserIdentity;
import com.citi.put.checks.studio.authoring.AuthoringRevisionIdentity;
import com.citi.put.checks.studio.dto.AuthoringStep;
import com.citi.put.checks.studio.dto.AuthoringV2Request;
import com.citi.put.checks.studio.guided.publication.GuidedPublicationBaseRepository;
import com.citi.put.checks.studio.guided.publication.GuidedPublicationRepository;
import com.citi.put.checks.studio.guided.publication.ObservedArtifactLowerer;
import com.citi.put.checks.studio.guided.publication.ObservedReplayPins;
import com.citi.put.checks.studio.guided.publication.ObservedReplayProperties;
import com.citi.put.checks.studio.guided.publication.PublicationContracts;
import com.citi.put.checks.studio.guided.session.GuidedContracts;
import com.citi.put.checks.studio.guided.session.GuidedSessionRepository;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import jakarta.servlet.http.Cookie;
import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Primary;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.security.core.Authentication;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * Seeds a <b>published observed revision</b> ({@code publication_kind = GUIDED_RUN}) through the
 * production publication writers, for execution-infrastructure tests that need an accepted run
 * (STUDIO-OBS-012A, ADR-SC-005 D-A: only an observed revision may execute).
 *
 * <h2>What is real</h2>
 *
 * <p>The guided session row ({@link GuidedSessionRepository#insert}), the original-start base
 * ({@link GuidedPublicationBaseRepository#capture}), the fenced reserve/claim/finish attempt and
 * the atomic adoption ({@link GuidedPublicationRepository#commit}) are the production writers, with
 * every database guard of the publication tables. The candidate is lowered by the production {@link
 * ObservedArtifactLowerer} under the profile the deployment catalog selects ({@link
 * ObservedReplayPins#selected()}). The resulting revision is therefore accepted by the real {@code
 * ObservedRevisionVerifier}, readiness gate, Run authorizer, acceptance binding and dispatcher —
 * nothing downstream is stubbed or bypassed.
 *
 * <h2>What is synthetic, and why</h2>
 *
 * <p>No browser exists in these tests. The observed evidence the lowerer reads (one exercised
 * action per authored step: a navigate from the initial blank page for the first step, then a
 * page-level {@code press Enter}) and the runner validator's verdict are synthetic relational input
 * — exactly as in {@code GuidedPublicationRaceTest}, which documents the same boundary. The
 * browser-backed learning proof belongs to {@code GuidedPublicationReplayIT}.
 *
 * <h2>Deployment configuration</h2>
 *
 * <p>Observed replay is configured by a trusted catalog and trusted policies ({@code
 * studio.observed-replay.*}). A Spring test class that executes calls {@link
 * #register(DynamicPropertyRegistry)} from its {@code @DynamicPropertySource}; the same values are
 * used here to select the profile the candidate is lowered under.
 *
 * <h2>Fresh Run authority</h2>
 *
 * <p>An observed Run requires a fresh Core identity read through the caller's {@code put_session}
 * cookie. {@link FreshAuthority} replaces the Core client with a registry of identities this
 * fixture issued cookies for; {@link #request(Authentication)} issues one for a caller.
 */
public final class ObservedPublicationFixture {

  /** The single origin the synthetic observed evidence was exercised on. */
  public static final String ORIGIN = "https://studio-fixture.example.test";

  /** The trusted application the fixture's replay requirements and policies name. */
  public static final String APPLICATION = "studio-fixture";

  /** Environments a trusted policy is configured for (one policy per environment, max 16). */
  public static final List<String> ENVIRONMENTS =
      List.of("Production", "Development", "Staging", "UAT", "QA", "Test", "DR", "fixture");

  private static final GuidedContracts C = new GuidedContracts();
  private static final ObjectMapper MAPPER =
      new ObjectMapper()
          .findAndRegisterModules()
          .disable(com.fasterxml.jackson.databind.SerializationFeature.WRITE_DATES_AS_TIMESTAMPS)
          .disable(
              com.fasterxml.jackson.databind.DeserializationFeature
                  .ADJUST_DATES_TO_CONTEXT_TIME_ZONE);

  private static final String CATALOG_JSON = catalog();
  private static final String POLICIES_JSON = policies();

  private final JdbcTemplate jdbc;
  private final TransactionTemplate tx;
  private final GuidedSessionRepository sessions;
  private final GuidedPublicationBaseRepository bases;
  private final GuidedPublicationRepository publications;
  private final ObservedReplayPins pins;

  public ObservedPublicationFixture(JdbcTemplate jdbc) {
    this.jdbc = jdbc;
    this.tx = new TransactionTemplate(new DataSourceTransactionManager(jdbc.getDataSource()));
    this.sessions = new GuidedSessionRepository(jdbc, tx, C);
    this.bases = new GuidedPublicationBaseRepository(jdbc, C);
    this.publications = new GuidedPublicationRepository(jdbc, C);
    this.pins = new ObservedReplayPins(C, properties());
  }

  // ── deployment configuration ───────────────────────────────────────────────

  /** Registers the trusted observed-replay catalog and policies for a Spring test context. */
  public static void register(DynamicPropertyRegistry registry) {
    registry.add("studio.observed-replay.enabled", () -> "true");
    registry.add("studio.observed-replay.catalog-json", () -> CATALOG_JSON);
    registry.add("studio.observed-replay.policies-json", () -> POLICIES_JSON);
  }

  /**
   * The trusted catalog as JSON, followed by {@code extra} entries, for a test class that also
   * trusts another (for example the canonical contract fixture's) profile and build.
   */
  public static String catalogJsonWith(JsonNode... extra) {
    ArrayNode all = (ArrayNode) C.parse(CATALOG_JSON);
    for (JsonNode entry : extra) {
      all.add(entry.deepCopy());
    }
    return all.toString();
  }

  /** The trusted policies as JSON, followed by {@code extra} policies. */
  public static String policiesJsonWith(JsonNode... extra) {
    ArrayNode all = (ArrayNode) C.parse(POLICIES_JSON);
    for (JsonNode policy : extra) {
      all.add(policy.deepCopy());
    }
    return all.toString();
  }

  /** The same configuration as command-line arguments, for a second application context. */
  public static List<String> commandLineProperties() {
    return List.of(
        "--studio.observed-replay.enabled=true",
        "--studio.observed-replay.catalog-json=" + CATALOG_JSON,
        "--studio.observed-replay.policies-json=" + POLICIES_JSON);
  }

  /** The same configuration as a properties record, for code that builds its own pins. */
  public static ObservedReplayProperties properties() {
    return new ObservedReplayProperties(
        true, 30000, 1048576, 4194304, 2097152, CATALOG_JSON, POLICIES_JSON, 1280, 720);
  }

  // ── draft authoring ────────────────────────────────────────────────────────

  /**
   * Gives a draft that has none its v2 authoring identity, one step per current {@code steps} line.
   * A draft that already carries authoring is left as it is.
   */
  public void seedCanonicalAuthoring(UUID testId) {
    String existing =
        jdbc.queryForObject(
            "SELECT authoring::text FROM ui_tests WHERE id = ?", String.class, testId);
    if (existing != null) {
      return;
    }
    String stepsJson =
        jdbc.queryForObject("SELECT steps::text FROM ui_tests WHERE id = ?", String.class, testId);
    List<AuthoringStep> steps = new ArrayList<>();
    for (JsonNode line : C.parse(stepsJson)) {
      steps.add(new AuthoringStep(UUID.randomUUID(), line.asText(), null));
    }
    AuthoringV2Request authoring = new AuthoringV2Request(2, null, steps);
    try {
      jdbc.update(
          "UPDATE ui_tests SET authoring = CAST(? AS jsonb),"
              + " authoring_revision_inputs = CAST(? AS jsonb) WHERE id = ?",
          MAPPER.writeValueAsString(authoring),
          MAPPER.writeValueAsString(AuthoringRevisionIdentity.create(authoring, Map.of())),
          testId);
    } catch (com.fasterxml.jackson.core.JsonProcessingException e) {
      throw new IllegalStateException(e);
    }
  }

  // ── publication ────────────────────────────────────────────────────────────

  /**
   * Publishes the draft's current source and configuration as an observed revision and makes it the
   * draft's confirmed revision.
   *
   * @param testId the draft; its authoring is promoted first if it has none
   * @param variables the plain variable names the revision declares
   * @param secrets the secret names the revision declares
   * @return the published revision id
   */
  public UUID publish(UUID testId, List<String> variables, List<String> secrets) {
    Learning learning = learn(testId, variables, secrets);
    String sessionId = learning.sessionId();
    ObjectNode session = learning.session();
    ObjectNode requirements = learning.requirements();
    PublicationContracts.Base base = learning.base();
    String csiId = learning.csiId();
    String principal = learning.principal();

    tx.executeWithoutResult(
        status -> {
          var current = sessions.lock(sessionId);
          current.document().put("state", "OBSERVING");
          current
              .document()
              .putObject("owner")
              .put("workerId", "fixture-worker")
              .put("fence", 1)
              .put("leaseExpiresAt", Instant.now().plusSeconds(120).toString());
          sessions.save(current);
        });
    ObjectNode basis =
        GuidedPublicationEvidenceFixture.completeExistingSession(jdbc, tx, sessionId, base);
    String translationHash = basis.path("translationHash").asText();
    tx.executeWithoutResult(
        status -> {
          var current = sessions.lock(sessionId);
          current.progress().put("stepIndex", current.document().path("sourceSteps").size());
          current.document().put("state", "FINALIZING");
          sessions.save(current);
          jdbc.update(
              "UPDATE studio_guided_translation_state SET continuation='FINALIZING' WHERE session_id=?",
              sessionId);
        });
    ObjectNode supported = pins.selected();
    PublicationContracts.Candidate candidate =
        new ObservedArtifactLowerer(C).lower(basis, supported.path("profile"));

    ObjectNode identity = C.object();
    identity.set("base", base.document());
    identity
        .put("ownerWorkerId", "fixture-worker")
        .put("ownerFence", 1)
        .put("translationHash", translationHash)
        .put("basisHash", GuidedContracts.hash(basis));
    for (String key :
        List.of(
            "learnedPlanHash",
            "artifactHash",
            "referencePolicyHash",
            "operationEquivalenceHash",
            "publicationEvidenceHash",
            "profileHash")) {
      identity.set(key, candidate.hashes().path(key));
    }
    identity.put("validationBuildHash", GuidedContracts.hash(supported.path("build")));
    identity.put("validationDeadline", PublicationContracts.time(Instant.now().plusSeconds(12)));
    PublicationContracts.Snapshot snapshot = new PublicationContracts.Snapshot(identity, basis);
    String finalizeKey = "fixture-finalize";
    String finalizeDigest = GuidedContracts.hash(C.object().put("sessionId", sessionId));

    PublicationContracts.Attempt attempt =
        tx.execute(
            status -> {
              sessions.lock(sessionId);
              return publications.reserve(
                  new PublicationContracts.Claim(sessionId, finalizeKey, finalizeDigest, snapshot),
                  Instant.now());
            });
    tx.executeWithoutResult(
        status -> {
          sessions.lock(sessionId);
          publications.claim(
              sessionId, attempt.attemptId(), attempt.claimId(), snapshot.hash(), Instant.now());
        });

    // The runner validator's verdict over the claimed snapshot (no browser in these tests).
    ObjectNode verdict =
        C.object()
            .put("schemaVersion", 3)
            .put("ok", true)
            .putNull("errorCode")
            .put("attemptId", attempt.attemptId().toString())
            .put("claimId", attempt.claimId().toString())
            .put("snapshotHash", snapshot.hash())
            .put("basisHash", identity.path("basisHash").asText());
    for (String key :
        List.of(
            "artifactHash",
            "learnedPlanHash",
            "referencePolicyHash",
            "operationEquivalenceHash",
            "admissionProvenanceHash",
            "publicationEvidenceHash")) {
      verdict.set(key, candidate.hashes().path(key));
    }
    verdict.set("profile", supported.path("profile"));
    verdict.set("build", supported.path("build"));
    tx.executeWithoutResult(
        status -> {
          sessions.lock(sessionId);
          publications.finish(
              sessionId,
              attempt.attemptId(),
              attempt.claimId(),
              snapshot.hash(),
              PublicationContracts.AttemptStatus.VALIDATED,
              verdict,
              null,
              Instant.now());
        });

    UUID revisionId = UUID.randomUUID();
    PublicationContracts.Commit commit =
        new PublicationContracts.Commit(
            sessionId,
            revisionId,
            attempt.attemptId(),
            attempt.claimId(),
            finalizeKey,
            finalizeDigest,
            snapshot,
            candidate,
            new PublicationContracts.Grant(
                sessionId, principal, csiId, snapshot.hash(), attempt.validationDeadline()));
    tx.executeWithoutResult(
        status -> {
          sessions.lock(sessionId);
          publications.commit(commit, Instant.now());
        });
    return revisionId;
  }

  /**
   * A learning session for the draft's current source that captured its publication base and then
   * stopped without publishing: the session is still {@code PREPARING}, has its source manifest,
   * translation state and base row, and has no publication row. Tests move it to the terminal state
   * they need (STUDIO-OBS-014 retention: a never-published session).
   *
   * @return the session id
   */
  public String learnWithoutPublishing(UUID testId) {
    return learn(testId, List.of(), List.of()).sessionId();
  }

  private record Learning(
      String sessionId,
      ObjectNode session,
      ObjectNode requirements,
      PublicationContracts.Base base,
      String csiId,
      String principal) {}

  private Learning learn(UUID testId, List<String> variables, List<String> secrets) {
    seedCanonicalAuthoring(testId);
    prepareDeclaredSource(testId, variables, secrets);
    JsonNode current = tx.execute(status -> bases.lockCurrent(testId).document());
    String csiId = current.path("csiId").asText();
    String environment = current.path("configuration").path("environment").asText();
    String principal =
        jdbc.queryForObject("SELECT created_by FROM ui_tests WHERE id = ?", String.class, testId);
    String sessionId = "fixture-" + UUID.randomUUID();
    Instant now = Instant.now();

    List<JsonNode> steps = new ArrayList<>();
    current.path("authoring").path("steps").forEach(steps::add);
    if (steps.isEmpty()) {
      throw new IllegalArgumentException("An observed revision needs at least one step");
    }

    // The guided session that learned it: original scope and explicit Run authorization.
    ObjectNode session =
        C.object()
            .put("schemaVersion", 3)
            .put("createdAt", now.toString())
            .put("sessionId", sessionId)
            .put("testId", testId.toString())
            .put("state", "PREPARING")
            .put("expiresAt", now.plusSeconds(600).toString());
    ObjectNode scope =
        session
            .putObject("scope")
            .put("principalId", principal)
            .put("csiId", csiId)
            .put("environmentId", environment)
            .put("applicationId", APPLICATION)
            .put("sourceRevision", current.path("sourceRevision").asText())
            .put("configurationRevision", current.path("configurationRevision").asText())
            .put("modelDataPolicyId", "labels-only-1")
            .putNull("valueTransferPolicyId");
    scope.putArray("approvedOrigins").add(ORIGIN);
    scope
        .putArray("capabilities")
        .add("observe")
        .add("navigate")
        .add("press")
        .add("fill")
        .add("assert");
    session.putObject("versions").put("contract", 3);
    session.set(
        "limits",
        new com.citi.put.checks.studio.guided.session.GuidedSessionProperties(true, Map.of())
            .snapshot(C));
    ObjectNode counters = session.putObject("counters");
    for (String field :
        List.of(
            "actions",
            "observations",
            "modelProposals",
            "modelInputTokens",
            "modelOutputTokens",
            "sanitizedEvidenceBytes")) {
      counters.put(field, 0);
    }
    session.put("scopeHash", GuidedContracts.hash(scope));
    session
        .putObject("owner")
        .put("workerId", "unclaimed")
        .put("fence", 0)
        .put("leaseExpiresAt", now.toString());
    session
        .putObject("runAuthorization")
        .put("authorizationId", UUID.randomUUID().toString())
        .put("kind", "scopedRun")
        .put("principalId", principal)
        .put("scopeHash", session.path("scopeHash").asText())
        .put("authorizedAt", now.toString());
    ArrayNode sessionSteps = session.putArray("sourceSteps");
    steps.forEach(
        step ->
            sessionSteps
                .addObject()
                .put("stepId", step.path("id").asText())
                .put("requiresAssertion", false));

    ObjectNode requirements = pins.requirements(session);
    tx.executeWithoutResult(
        status -> {
          sessions.insert(session);
          GuidedPublicationEvidenceFixture.freezeSource(jdbc, tx, session);
        });

    PublicationContracts.Base base =
        tx.execute(
            status -> {
              sessions.lock(sessionId);
              return bases.capture(session, requirements, Instant.now());
            });

    return new Learning(sessionId, session, requirements, base, csiId, principal);
  }

  /** Explicit test source setup, before any immutable session/base capture. */
  private void prepareDeclaredSource(
      UUID testId, List<String> referencedVariables, List<String> referencedSecrets) {
    ObjectNode authoring =
        (ObjectNode)
            C.parse(
                jdbc.queryForObject(
                    "SELECT authoring::text FROM ui_tests WHERE id=?", String.class, testId));
    if (authoring.path("steps").isEmpty()) {
      throw new IllegalArgumentException("An observed revision needs at least one step");
    }
    var declared =
        new ArrayList<>(
            com.citi.put.checks.studio.dto.CanonicalStudioCodec.parseVariables(
                jdbc.queryForObject(
                    "SELECT variables::text FROM ui_tests WHERE id=?", String.class, testId)));
    java.util.Map<String, com.citi.put.checks.studio.dto.StudioVariable> names =
        new java.util.LinkedHashMap<>();
    declared.forEach(variable -> names.put(variable.name(), variable));
    ObjectNode first = (ObjectNode) authoring.path("steps").get(0);
    if (!first.path("context").isObject()) {
      first.putObject("context").putArray("entries");
    }
    ObjectNode context = (ObjectNode) first.path("context");
    if (!context.has("evidenceReferences")) {
      context.putArray("evidenceReferences");
    }
    var entries = (ArrayNode) context.path("entries");
    java.util.List<String> plain = new ArrayList<>(referencedVariables);
    if (!java.util.regex.Pattern.compile("https?://[^\\s<>]+[\\s]?")
        .matcher(first.path("text").asText())
        .find()) {
      String destination = "STUDIO_FIXTURE_URL";
      var previous =
          names.putIfAbsent(
              destination,
              com.citi.put.checks.studio.dto.StudioVariable.plain(destination, ORIGIN + "/start"));
      if (previous != null && !java.util.Objects.equals(previous.value(), ORIGIN + "/start")) {
        throw new IllegalArgumentException("Fixture destination declaration collides");
      }
      plain.add(destination);
    }
    for (String variable : plain) {
      var value = names.get(variable);
      if (value == null || !value.kind().equals("plain") || value.value() == null) {
        throw new IllegalArgumentException(
            "Fixture must seed its declared plain value before publication");
      }
      addContextReference(entries, "variableRef", variable);
    }
    for (String secret : referencedSecrets) {
      var value =
          names.values().stream()
              .filter(
                  variable ->
                      variable.kind().equals("secretRef") && secret.equals(variable.secretId()))
              .findFirst()
              .orElse(null);
      if (value == null) {
        value = com.citi.put.checks.studio.dto.StudioVariable.secretRef(secret, secret);
        names.put(secret, value);
      }
      addContextReference(entries, "secretRef", value.name());
    }
    try {
      var source = MAPPER.treeToValue(authoring, AuthoringV2Request.class);
      java.util.Map<String, String> values = new java.util.HashMap<>();
      names
          .values()
          .forEach(
              variable -> {
                if (variable.kind().equals("plain") && variable.value() != null) {
                  values.put(variable.name(), variable.value());
                }
              });
      jdbc.update(
          "UPDATE ui_tests SET authoring=?::jsonb,authoring_revision_inputs=?::jsonb,variables=?::jsonb WHERE id=?",
          MAPPER.writeValueAsString(source),
          MAPPER.writeValueAsString(AuthoringRevisionIdentity.create(source, values)),
          com.citi.put.checks.studio.dto.CanonicalStudioCodec.variablesToJson(
              new ArrayList<>(names.values())),
          testId);
    } catch (com.fasterxml.jackson.core.JsonProcessingException failure) {
      throw new IllegalStateException(failure);
    }
  }

  private static void addContextReference(ArrayNode entries, String kind, String referenceId) {
    for (JsonNode entry : entries) {
      if (entry.path("kind").asText().equals(kind)
          && entry.path("referenceId").asText().equals(referenceId)) {
        return;
      }
    }
    entries.addObject().put("kind", kind).put("referenceId", referenceId);
  }

  // ── governed observation policy (STUDIO-OBS-014 AC-1, RK-2) ─────────────────

  /** The synthetic author of every seeded governed policy version. */
  public static final String POLICY_AUTHOR = "fixture-policy-author";

  /** The synthetic approver; a different principal from the author, as V19 requires. */
  public static final String POLICY_APPROVER = "fixture-policy-approver";

  /**
   * Seeds an approved, active governed observation policy for the fixture application in every
   * fixture environment of each CSI, mirroring the trusted policy's origins and application policy
   * and stating the side-effect stance explicitly ({@code ALLOW}, as the OBS-007 end-to-end
   * regression requires; AR-2 f). The approval record is synthetic: the external Security approval
   * is never marked obtained. Idempotent per (CSI, application, environment).
   *
   * <p>Guided learning sessions refuse to start without an approved policy once the S3 cutover
   * lands, so every guided IT seeds its CSIs here.
   */
  public static void seedApprovedPolicies(JdbcTemplate jdbc, String... csiIds) {
    seedPolicies(jdbc, "ALLOW", csiIds);
  }

  /** As {@link #seedApprovedPolicies}, with an explicit side-effect stance. */
  public static void seedPolicies(JdbcTemplate jdbc, String stance, String... csiIds) {
    // The same observation application policy the fixture's trusted (replay) policy names, so
    // learning and replay see one policy for the fixture application.
    ObjectNode application =
        C.object().put("policyRuleId", "app").put("allowStructuralDiscovery", true);
    application.putArray("readGrants");
    for (String csiId : csiIds) {
      for (String environment : ENVIRONMENTS) {
        ensurePolicy(jdbc, csiId, APPLICATION, environment, List.of(ORIGIN), application, stance);
      }
    }
  }

  /**
   * Seeds one approved, active governed policy for an arbitrary scope (idempotent). For ITs whose
   * learning scope is not the fixture application, for example the bridge and planning ITs' {@code
   * orders}/{@code fixture} scope.
   *
   * @param applicationPolicy the closed observation application policy, or null for a structural
   *     policy with no read grants
   */
  public static void seedPolicy(
      JdbcTemplate jdbc,
      String csiId,
      String applicationId,
      String environmentId,
      List<String> origins,
      JsonNode applicationPolicy,
      String stance) {
    ensurePolicy(jdbc, csiId, applicationId, environmentId, origins, applicationPolicy, stance);
  }

  /**
   * Makes the given document the approved, active governed policy for the scope: creates version 1
   * when no policy exists, does nothing when the active version already stores this document, and
   * otherwise appends the next version and approves it (synthetic approval; approver is not the
   * author). Sessions freeze the version active at their start, so a class can change the policy
   * between tests. This replaces the mounted worker {@code applicationPolicy} that S3 refuses
   * (RK-2).
   */
  public static void ensurePolicy(
      JdbcTemplate jdbc,
      String csiId,
      String applicationId,
      String environmentId,
      List<String> origins,
      JsonNode applicationPolicy,
      String stance) {
    var repository =
        new com.citi.put.checks.studio.guided.policy.ObservationPolicyRepository(jdbc, C);
    var tx = new TransactionTemplate(new DataSourceTransactionManager(jdbc.getDataSource()));
    ObjectNode submitted = C.object().put("schemaVersion", 3);
    // A null fixture argument exercises the actual governed default by omitting the submitted
    // optional field, rather than inserting an invalid JSON null or preselecting the default.
    if (stance != null) {
      submitted.put("sideEffectStance", stance);
    }
    var stored = submitted.putArray("allowedOrigins");
    origins.forEach(stored::add);
    if (applicationPolicy == null) {
      submitted
          .putObject("applicationPolicy")
          .put("policyRuleId", "structural-policy")
          .put("allowStructuralDiscovery", true)
          .putArray("readGrants");
    } else {
      submitted.set("applicationPolicy", applicationPolicy.deepCopy());
    }
    ObjectNode document =
        com.citi.put.checks.studio.guided.policy.ObservationPolicyDocuments.materialize(
            C, submitted, DEFAULT_DESTRUCTIVE_VOCABULARY);
    String documentHash =
        com.citi.put.checks.studio.guided.policy.ObservationPolicyDocuments.documentHash(document);
    String observationHash =
        com.citi.put.checks.studio.guided.policy.ObservationPolicyDocuments.observationPolicyHash(
            document);
    tx.executeWithoutResult(
        status -> {
          var state = repository.state(csiId, applicationId, environmentId);
          UUID policyId;
          int next;
          if (state.isEmpty()) {
            policyId = UUID.randomUUID();
            repository.insertPolicy(policyId, csiId, applicationId, environmentId, POLICY_AUTHOR);
            next = 1;
          } else {
            policyId = state.get().policyId();
            repository.lock(policyId);
            var active = repository.active(csiId, applicationId, environmentId);
            if (active.isPresent()
                && active.get().version() == state.get().latestVersion()
                && GuidedContracts.hash(active.get().document()).equals(documentHash)) {
              return;
            }
            next = repository.latestVersion(policyId) + 1;
          }
          repository.insertVersion(
              policyId, next, document, documentHash, observationHash, POLICY_AUTHOR);
          repository.insertApproval(policyId, next, POLICY_APPROVER, "fixture-approval-" + next);
        });
  }

  /**
   * Installs the S3 start-time governance on a hand-built {@code GuidedSessionService} (one that a
   * test constructs instead of taking the Spring bean): a trusted policy for {@code (application,
   * environment)} naming {@code origins}, an approved governed policy for {@code csiId}, and a
   * per-CSI budget. The concurrency limit here is deliberately high (1000) because these classes
   * test other properties and start several live sessions on one CSI; the per-CSI limits themselves
   * are proven by {@code GuidedCsiBudgetIT} at the production defaults. The daily token limits are
   * the production defaults.
   */
  public static void installGovernance(
      com.citi.put.checks.studio.guided.session.GuidedSessionService service,
      JdbcTemplate jdbc,
      String csiId,
      String applicationId,
      String environmentId,
      List<String> origins,
      JsonNode applicationPolicy) {
    installGovernance(
        service, jdbc, csiId, applicationId, List.of(environmentId), origins, applicationPolicy);
  }

  /**
   * {@link #installGovernance(com.citi.put.checks.studio.guided.session.GuidedSessionService,
   * JdbcTemplate, String, String, String, List, JsonNode)} for several environments of one
   * application: each gets a trusted policy and an approved governed policy.
   */
  public static void installGovernance(
      com.citi.put.checks.studio.guided.session.GuidedSessionService service,
      JdbcTemplate jdbc,
      String csiId,
      String applicationId,
      List<String> environmentIds,
      List<String> origins,
      JsonNode applicationPolicy) {
    installGovernance(
        service,
        jdbc,
        csiId,
        applicationId,
        environmentIds,
        origins,
        applicationPolicy,
        new com.citi.put.checks.studio.guided.session.GuidedCsiBudgetProperties(
            1000, 5242880, 640000));
  }

  /**
   * {@link #installGovernance(com.citi.put.checks.studio.guided.session.GuidedSessionService,
   * JdbcTemplate, String, String, List, List, JsonNode)} with explicit per-CSI limits, for a class
   * that shares one CSI across many full-ceiling model reservations and tests nothing about the
   * daily budget (which {@code GuidedCsiBudgetIT} proves at the production defaults).
   */
  public static void installGovernance(
      com.citi.put.checks.studio.guided.session.GuidedSessionService service,
      JdbcTemplate jdbc,
      String csiId,
      String applicationId,
      List<String> environmentIds,
      List<String> origins,
      JsonNode applicationPolicy,
      com.citi.put.checks.studio.guided.session.GuidedCsiBudgetProperties budgetLimits) {
    var trustedPolicies = new java.util.ArrayList<JsonNode>();
    for (String environmentId : environmentIds) {
      seedPolicy(jdbc, csiId, applicationId, environmentId, origins, applicationPolicy, "ALLOW");
      ObjectNode trusted =
          C.object()
              .put("version", 1)
              .put(
                  "policyId",
                  environmentIds.size() == 1
                      ? "policy-" + applicationId
                      : "policy-" + applicationId + "-" + environmentId)
              .put("policyVersion", "1")
              .put("applicationId", applicationId)
              .put("environment", environmentId)
              .put("entryPolicyId", "entry-" + applicationId);
      var allowed = trusted.putArray("allowedOrigins");
      origins.forEach(allowed::add);
      trusted
          .putObject("applicationPolicy")
          .put("policyRuleId", "app")
          .put("allowStructuralDiscovery", true)
          .putArray("readGrants");
      trusted.putArray("rules");
      trustedPolicies.add(trusted);
    }
    var pins =
        new ObservedReplayPins(
            C,
            new ObservedReplayProperties(
                true,
                30000,
                1048576,
                4194304,
                2097152,
                CATALOG_JSON,
                policiesJsonWith(trustedPolicies.toArray(JsonNode[]::new)),
                1280,
                720));
    var tx = new TransactionTemplate(new DataSourceTransactionManager(jdbc.getDataSource()));
    service.installGovernance(
        new com.citi.put.checks.studio.guided.policy.ObservationPolicyService(
            new com.citi.put.checks.studio.guided.policy.ObservationPolicyRepository(jdbc, C),
            C,
            new com.citi.put.checks.security.CsiOwnershipEvaluator(),
            pins,
            new com.citi.put.checks.studio.guided.policy.GuidedPolicyProperties(
                List.of(), DEFAULT_DESTRUCTIVE_VOCABULARY),
            tx),
        new com.citi.put.checks.studio.guided.session.GuidedCsiBudget(jdbc, budgetLimits));
  }

  /**
   * A startable guided draft for the fixture application: v2 authoring with one step that opens the
   * fixture origin, revisions "1"/"1", in {@code environment} of {@code csiId}.
   */
  public static UUID guidedDraft(
      JdbcTemplate jdbc, String csiId, String environment, String owner) {
    UUID testId = UUID.randomUUID();
    var authoring =
        new com.citi.put.checks.studio.dto.AuthoringV2Request(
            2,
            null,
            List.of(
                new com.citi.put.checks.studio.dto.AuthoringStep(
                    UUID.randomUUID(), "Open " + ORIGIN, null)));
    try {
      jdbc.update(
          "INSERT INTO ui_tests(id,name,csi_id,environment,browser,steps,variables,created_by,"
              + "authoring,authoring_revision_inputs) VALUES (?,'Guided draft',?,?,'chromium',"
              + "'[\"Open\"]','[]',?,?::jsonb,?::jsonb)",
          testId,
          csiId,
          environment,
          owner,
          MAPPER.writeValueAsString(authoring),
          MAPPER.writeValueAsString(
              com.citi.put.checks.studio.authoring.AuthoringRevisionIdentity.create(
                  authoring, Map.of())));
    } catch (com.fasterxml.jackson.core.JsonProcessingException failure) {
      throw new IllegalStateException(failure);
    }
    return testId;
  }

  /** The v3 start body for {@link #guidedDraft}. */
  public static ObjectNode guidedStart(UUID testId, String environment) {
    ObjectNode request =
        C.object()
            .put("schemaVersion", 3)
            .put("testId", testId.toString())
            .put("sourceRevision", "1")
            .put("configurationRevision", "1")
            .put("environmentId", environment)
            .put("applicationId", APPLICATION);
    request.putObject("versions").put("contract", 3);
    return request;
  }

  /** The application.yml baseline destructive vocabulary (AR-2 f), for fixture documents. */
  public static final List<String> DEFAULT_DESTRUCTIVE_VOCABULARY =
      List.of(
          "delete",
          "remove",
          "erase",
          "destroy",
          "purge",
          "pay",
          "transfer",
          "send money",
          "submit order",
          "place order",
          "confirm payment",
          "cancel subscription",
          "close account",
          "deactivate",
          "revoke");

  // ── ledger housekeeping between tests ──────────────────────────────────────

  /**
   * Deletes the dispatch-ledger rows of the given CSIs (every CSI when none is given), except the
   * rows an immutable secret-use audit fact references.
   *
   * <p>An observed run that declares a secret writes {@code studio_secret_use_audit} facts keyed by
   * its ledger row (V34); the audit table refuses {@code UPDATE}/{@code DELETE}, so those ledger
   * rows can never be removed. Test classes that share a CSI with a secret-declaring class (or that
   * clear the whole ledger) keep their quota headroom by removing everything else.
   */
  public static int clearLedger(JdbcTemplate jdbc, String... csiIds) {
    String unaudited =
        " NOT EXISTS (SELECT 1 FROM studio_secret_use_audit a"
            + " WHERE a.execution_id = l.execution_id)";
    if (csiIds.length == 0) {
      return jdbc.update("DELETE FROM studio_dispatch_ledger l WHERE" + unaudited);
    }
    String placeholders = String.join(",", java.util.Collections.nCopies(csiIds.length, "?"));
    return jdbc.update(
        "DELETE FROM studio_dispatch_ledger l WHERE l.csi_id IN ("
            + placeholders
            + ") AND"
            + unaudited,
        (Object[]) csiIds);
  }

  // ── observed admission (what the runner sends for an observed run) ─────────

  /**
   * Admits an accepted observed execution the way the runner does: a v3 {@code AdmissionRequest}
   * echoing the execution's stored binding, prepared by {@code ObservedReplayAuthorization} and
   * claimed by the same admission CAS, which records the immutable observed admission receipt.
   *
   * @return the admission receipt
   */
  public static JsonNode admitObserved(
      com.citi.put.checks.studio.guided.publication.ObservedReplayAuthorization observed,
      com.citi.put.checks.studio.internal.AdmissionCasService admission,
      UUID executionId,
      String runnerInstanceId,
      UUID admissionId) {
    JsonNode binding =
        observed
            .binding(executionId)
            .orElseThrow(() -> new IllegalStateException("No observed binding for execution"));
    ObjectNode request = observedAdmissionRequest(binding, runnerInstanceId, admissionId);
    return admission.claimObserved(executionId, observed.prepareAdmission(executionId, request));
  }

  /**
   * The v3 {@code AdmissionRequest} the runner sends for an observed run: every identity field
   * echoed from the execution's stored binding, plus the runner's own instance and admission ids.
   * Shared by {@link #admitObserved} and by tests that send the same body over HTTP to {@code POST
   * /internal/studio/executions/{id}/observed-admission}.
   */
  public static ObjectNode observedAdmissionRequest(
      JsonNode binding, String runnerInstanceId, UUID admissionId) {
    ObjectNode request =
        C.object()
            .put("schemaVersion", 3)
            .put("kind", "observed")
            .put("runnerInstanceId", runnerInstanceId)
            .put("admissionId", admissionId.toString());
    for (String field :
        List.of(
            "executionId",
            "startedAt",
            "attemptId",
            "revisionId",
            "revisionDigest",
            "artifactHash",
            "configurationHash",
            "learnedPlanHash",
            "referencePolicyHash",
            "publicationEvidenceHash",
            "scopeHash",
            "currentPolicyHash")) {
      request.set(field, binding.path(field));
    }
    request.set("grantId", binding.path("replayGrant").path("grantId"));
    request.set("profile", binding.path("requiredProfile"));
    request.set("build", binding.path("requiredBuild"));
    return request;
  }

  /** The attempt id the observed Run authority issued for this execution (its stored binding). */
  public static UUID bindingAttempt(
      com.citi.put.checks.studio.guided.publication.ObservedReplayAuthorization observed,
      UUID executionId) {
    return UUID.fromString(
        observed
            .binding(executionId)
            .orElseThrow(() -> new IllegalStateException("No observed binding for execution"))
            .path("attemptId")
            .asText());
  }

  // ── trusted catalog and policies ───────────────────────────────────────────

  private static String catalog() {
    ObjectNode profile = C.object();
    try (InputStream in =
        ObservedPublicationFixture.class.getResourceAsStream(
            "/studio/observed-contracts/v3/replay-profile.schema.json")) {
      if (in == null) {
        throw new IllegalStateException("replay-profile schema is not on the test classpath");
      }
      JsonNode schema = C.parse(new String(in.readAllBytes(), StandardCharsets.UTF_8));
      schema
          .path("properties")
          .fields()
          .forEachRemaining(field -> profile.set(field.getKey(), field.getValue().path("const")));
    } catch (IOException e) {
      throw new IllegalStateException(e);
    }
    ObjectNode build =
        C.object()
            .put("profileHash", GuidedContracts.hash(profile))
            .put("schemaBundleHash", "b".repeat(64))
            .put("referenceBundleHash", "c".repeat(64))
            .put("executableImageDigest", "d".repeat(64))
            .put("chromiumBuild", "studio-fixture");
    ObjectNode entry = C.object();
    entry.set("profile", profile);
    entry.set("build", build);
    return C.object().arrayNode().add(entry).toString();
  }

  private static String policies() {
    ArrayNode all = C.object().arrayNode();
    for (String environment : ENVIRONMENTS) {
      ObjectNode policy =
          all.addObject()
              .put("version", 1)
              .put("policyId", "policy-" + APPLICATION)
              .put("policyVersion", "1")
              .put("applicationId", APPLICATION)
              .put("environment", environment)
              .put("entryPolicyId", "entry-" + APPLICATION);
      policy.putArray("allowedOrigins").add(ORIGIN);
      policy
          .putObject("applicationPolicy")
          .put("policyRuleId", "app")
          .put("allowStructuralDiscovery", true)
          .putArray("readGrants");
      policy.putArray("rules");
    }
    return all.toString();
  }

  // ── fresh Run authority (Core identity) ────────────────────────────────────

  private static final Map<String, UserIdentity> SESSIONS = new ConcurrentHashMap<>();

  /**
   * A {@code put_session} cookie value Core will answer with the caller's identity.
   *
   * @param caller a BFF-authenticated caller
   * @return the cookie value
   */
  public static String sessionCookie(Authentication caller) {
    if (!(caller instanceof BffAuthenticationToken bff)) {
      throw new IllegalArgumentException("An observed Run needs a BFF identity");
    }
    String cookie = "fixture-session-" + UUID.randomUUID();
    SESSIONS.put(cookie, bff.getPrincipal());
    return cookie;
  }

  /** As {@link #sessionCookie(Authentication)}, for an identity a test sends as headers. */
  public static String sessionCookie(UserIdentity identity) {
    String cookie = "fixture-session-" + UUID.randomUUID();
    SESSIONS.put(cookie, identity);
    return cookie;
  }

  /**
   * Adds the caller's session cookie to headers that carry the test profile's {@code X-User-*}
   * identity, so Core's fresh read answers with the same identity the headers assert. The identity
   * is derived exactly as {@code BffSessionAuthenticationFilter} derives it from those headers.
   *
   * @param headers request headers with at least {@code X-User-Id}
   * @return the same headers, with {@code Cookie: put_session=...}
   */
  public static org.springframework.http.HttpHeaders withSession(
      org.springframework.http.HttpHeaders headers) {
    String userId = headers.getFirst("X-User-Id");
    if (userId == null || userId.isBlank()) {
      return headers;
    }
    String email = headers.getFirst("X-User-Email");
    String roles = headers.getFirst("X-User-Roles");
    String csis = headers.getFirst("X-User-Csi-Ownership");
    List<com.citi.put.checks.security.CsiOwnershipEntry> ownership = new ArrayList<>();
    if (csis != null && !csis.isBlank()) {
      for (String entry : csis.split(",")) {
        String[] parts = entry.split(":");
        ownership.add(
            new com.citi.put.checks.security.CsiOwnershipEntry(
                parts[0].trim(), parts.length > 1 ? parts[1].trim() : "viewer"));
      }
    }
    UserIdentity identity =
        new UserIdentity(
            userId.trim(),
            email != null ? email.trim() : userId.trim(),
            userId.trim(),
            null,
            roles != null && !roles.isBlank() ? List.of(roles.split(",")) : List.of(),
            ownership);
    headers.add(
        org.springframework.http.HttpHeaders.COOKIE, "put_session=" + sessionCookie(identity));
    return headers;
  }

  /** The servlet request an explicit Run arrives on: it carries the caller's session cookie. */
  public static MockHttpServletRequest request(Authentication caller) {
    MockHttpServletRequest request = new MockHttpServletRequest("POST", "/api/v1/studio/tests");
    request.setCookies(new Cookie("put_session", sessionCookie(caller)));
    return request;
  }

  /** Replaces the Core client with the registry of identities this fixture issued cookies for. */
  @TestConfiguration(proxyBeanMethods = false)
  public static class FreshAuthority {

    @Bean
    @Primary
    CoreServiceClient fixtureCoreServiceClient(ObjectMapper objectMapper) {
      return new CoreServiceClient(
          new CoreServiceProperties(
              "http://core.invalid", new CoreServiceProperties.Timeout(100, 100)),
          objectMapper) {
        @Override
        public UserIdentity getUserMe(String cookieValue) {
          UserIdentity identity = cookieValue == null ? null : SESSIONS.get(cookieValue);
          if (identity == null) {
            throw new CoreServiceUnauthorizedException("Unknown fixture session");
          }
          return identity;
        }
      };
    }
  }
}
