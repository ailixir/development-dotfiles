package com.citi.put.checks.studio.guided.translation;

import static org.assertj.core.api.Assertions.assertThat;

import com.citi.put.checks.security.BffAuthenticationToken;
import com.citi.put.checks.security.CsiOwnershipEntry;
import com.citi.put.checks.security.CsiOwnershipEvaluator;
import com.citi.put.checks.security.UserIdentity;
import com.citi.put.checks.studio.authoring.AuthoringRevisionIdentity;
import com.citi.put.checks.studio.dispatch.HttpRunnerDispatchClient;
import com.citi.put.checks.studio.dispatch.StudioReferenceResolver;
import com.citi.put.checks.studio.dto.AuthoringStep;
import com.citi.put.checks.studio.dto.AuthoringV2Request;
import com.citi.put.checks.studio.guided.bridge.GuidedAssignmentStore;
import com.citi.put.checks.studio.guided.bridge.GuidedBindingStore;
import com.citi.put.checks.studio.guided.bridge.GuidedDispatchService;
import com.citi.put.checks.studio.guided.bridge.GuidedMaterializationService;
import com.citi.put.checks.studio.guided.bridge.GuidedPreparationStore;
import com.citi.put.checks.studio.guided.bridge.GuidedSourceReferenceValidator;
import com.citi.put.checks.studio.guided.session.GuidedContracts;
import com.citi.put.checks.studio.guided.session.GuidedSessionAccess;
import com.citi.put.checks.studio.guided.session.GuidedSessionException;
import com.citi.put.checks.studio.guided.session.GuidedSessionProperties;
import com.citi.put.checks.studio.guided.session.GuidedSessionRepository;
import com.citi.put.checks.studio.guided.session.GuidedSessionService;
import com.citi.put.checks.studio.guided.session.GuidedTestIdentities;
import com.citi.put.checks.studio.support.ObservedPublicationFixture;
import com.citi.put.checks.studio.support.TestDomains;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneId;
import java.time.ZoneOffset;
import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Deque;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import java.util.function.Function;
import org.flywaydb.core.Flyway;
import org.mockito.Mockito;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.springframework.security.core.Authentication;
import org.springframework.transaction.support.TransactionTemplate;
import org.testcontainers.containers.PostgreSQLContainer;

/**
 * A real PostgreSQL, real session service, real translation service and real stores, with a
 * scripted model and a stand-in for the runner (no browser, no network). The integration tests of
 * the ADR-SC-008 step loop drives {@code GuidedTranslationService.advance} through it and read the
 * persisted gate audit back with SQL.
 *
 * <p>What is scripted: the model (a queue of reply builders per kind), the runner's context
 * bootstrap, and the dispatch edge ({@link #dispatch} is a spy whose {@code prepareAndAdmit} stops
 * the run or refuses as the test says, the way the runner's closed prepare refusals arrive from
 * {@code HttpRunnerDispatchClient}). What is not: every gate, store, migration and transaction. The
 * wiring follows {@code GuidedLifecycleReasonIT}, which adapts {@code GuidedSessionIT}.
 */
final class GroundingItHarness {
  /** One planned obligation: the step it describes, what it asks of the page, what it passes on. */
  record Spec(int step, String intent, String needId, List<String> uses) {
    static Spec of(int step, String intent) {
      return new Spec(step, intent, null, List.of());
    }

    /** The step produces the value {@code needId} (a capture). */
    static Spec produces(int step, String intent, String needId) {
      return new Spec(step, intent, needId, List.of());
    }

    /** The step reads the values {@code needIds} an earlier step produced. */
    static Spec uses(int step, String intent, String... needIds) {
      return new Spec(step, intent, null, List.of(needIds));
    }
  }

  /** The sentinel the default dispatch stand-in throws: the run reached the runner. */
  static final class ReachedRunner extends AssertionError {
    ReachedRunner() {
      super("reached-prepare-and-admit");
    }
  }

  private static final GuidedContracts CONTRACTS = new GuidedContracts();
  private static JsonNode documents;

  final GuidedContracts contracts = CONTRACTS;
  final MutableClock clock = new MutableClock();
  final Authentication user = user();
  final Authentication worker = GuidedTestIdentities.owningWorker();
  final Authentication controller = GuidedTestIdentities.backendController();
  final List<GuidedModelRequest> requests = new ArrayList<>();
  final Map<GuidedModelRequest.Kind, Deque<Function<GuidedModelRequest, ObjectNode>>> script =
      new LinkedHashMap<>();
  final List<String> steps;

  JdbcTemplate jdbc;
  GuidedSessionRepository repository;
  GuidedSessionService service;
  GuidedMaterializationService materialization;
  GuidedTranslationStore store;
  GuidedClarificationContextStore questions;
  GuidedTranslationService translation;
  GuidedDispatchService dispatch;
  HttpRunnerDispatchClient runner;

  /** The input tokens the scripted gateway reports for every reply (tests raise it to overrun). */
  volatile int reportedInputTokens = 1;

  private final Map<String, Integer> limits;
  private List<Spec> plan = List.of();

  GroundingItHarness(PostgreSQLContainer<?> postgres, String... steps) throws Exception {
    this(postgres, Map.of(), steps);
  }

  GroundingItHarness(PostgreSQLContainer<?> postgres, Map<String, Integer> limits, String... steps)
      throws Exception {
    this.limits = limits;
    this.steps = List.of(steps);
    for (GuidedModelRequest.Kind kind : GuidedModelRequest.Kind.values()) {
      script.put(kind, new ArrayDeque<>());
    }
    synchronized (GroundingItHarness.class) {
      if (documents == null) {
        try (var in =
            GroundingItHarness.class.getResourceAsStream(
                "/studio/guided/session-it-documents.json")) {
          documents = new ObjectMapper().readTree(in).path("documents");
        }
      }
    }
    String database = "grounding_" + UUID.randomUUID().toString().replace("-", "");
    new JdbcTemplate(
            new DriverManagerDataSource(
                postgres.getJdbcUrl(), postgres.getUsername(), postgres.getPassword()))
        .execute("CREATE DATABASE " + database);
    var source =
        new DriverManagerDataSource(
            postgres.getJdbcUrl().replace(postgres.getDatabaseName(), database),
            postgres.getUsername(),
            postgres.getPassword());
    jdbc = new JdbcTemplate(source);
    Flyway.configure().dataSource(source).load().migrate();
    repository =
        new GuidedSessionRepository(
            jdbc, new TransactionTemplate(new DataSourceTransactionManager(source)), contracts);
    sourceFixture();
    service = newService();
    store = new GuidedTranslationStore(jdbc, contracts);
    questions = new GuidedClarificationContextStore(jdbc, contracts);
    runner = Mockito.mock(HttpRunnerDispatchClient.class);
    org.mockito.stubbing.Answer<JsonNode> contextReply =
        call -> {
          JsonNode context = call.getArgument(1);
          String id = context.path("sessionId").asText();
          if (repository.transaction(
              () -> !repository.lock(id).progress().has("executionEvidence"))) {
            service.bootstrap(worker, id, 1, "bootstrap-" + id, blankBootstrap(contracts, context));
          }
          return materialization.identity(context);
        };
    Mockito.doAnswer(contextReply)
        .when(runner)
        .send(org.mockito.ArgumentMatchers.eq("context"), org.mockito.ArgumentMatchers.any());
    Mockito.doAnswer(contextReply)
        .when(runner)
        .send(
            org.mockito.ArgumentMatchers.eq("context"),
            org.mockito.ArgumentMatchers.any(),
            org.mockito.ArgumentMatchers.anyString(),
            org.mockito.ArgumentMatchers.any(Instant.class));
    dispatch = Mockito.spy(new GuidedDispatchService(service, materialization, runner));
    stopAtRunner();
    GuidedLlmGatewayClient gateway = this::answer;
    translation =
        new GuidedTranslationService(
            service,
            repository,
            store,
            questions,
            dispatch,
            gateway,
            contracts,
            new GuidedPromptAssembler(contracts, TestDomains.FIXTURES),
            new GuidedSourceInputResolver(contracts, TestDomains.FIXTURES),
            new GuidedProposalValidator(contracts),
            new GuidedDependencyPlanner(service),
            new GuidedTranslationProperties(true, 131072, 2048, 60, "worker-1"),
            clock);
    translation.installDatabase(jdbc);
  }

  /** A translation service over the same stores and scripted model but other collaborators. */
  GuidedTranslationService translationWith(
      GuidedSessionService sessions, GuidedDispatchService bridge, GuidedPromptAssembler prompts) {
    var other =
        new GuidedTranslationService(
            sessions,
            repository,
            store,
            questions,
            bridge,
            this::answer,
            contracts,
            prompts,
            new GuidedSourceInputResolver(contracts, TestDomains.FIXTURES),
            new GuidedProposalValidator(contracts),
            new GuidedDependencyPlanner(sessions),
            new GuidedTranslationProperties(true, 131072, 2048, 60, "worker-1"),
            clock);
    other.installDatabase(jdbc);
    return other;
  }

  // ---- scripting ----

  /** The next model reply of this kind; replies are consumed in order, one per request. */
  void reply(GuidedModelRequest.Kind kind, Function<GuidedModelRequest, ObjectNode> build) {
    script.get(kind).add(build);
  }

  /**
   * The runner accepts the code at prepare and the run ends with a sentinel at admission: the step
   * was prepared, its obligation was reserved, and nothing was dispatched.
   */
  void stopAtRunner() {
    prepareAccepts();
    Mockito.doThrow(new ReachedRunner())
        .when(dispatch)
        .admitPrepared(
            org.mockito.ArgumentMatchers.any(),
            org.mockito.ArgumentMatchers.anyString(),
            org.mockito.ArgumentMatchers.anyLong(),
            org.mockito.ArgumentMatchers.anyString(),
            org.mockito.ArgumentMatchers.any(),
            org.mockito.ArgumentMatchers.any());
    Mockito.doThrow(new ReachedRunner())
        .when(dispatch)
        .prepareAndAdmit(
            org.mockito.ArgumentMatchers.any(),
            org.mockito.ArgumentMatchers.anyString(),
            org.mockito.ArgumentMatchers.anyLong(),
            org.mockito.ArgumentMatchers.anyString(),
            org.mockito.ArgumentMatchers.any());
  }

  /** The runner's prepare accepts every proposal (a stand-in proof; nothing is stored). */
  void prepareAccepts() {
    Mockito.doReturn(contracts.object().put("preparationId", "stand-in"))
        .when(dispatch)
        .prepareStep(
            org.mockito.ArgumentMatchers.any(),
            org.mockito.ArgumentMatchers.anyString(),
            org.mockito.ArgumentMatchers.anyLong(),
            org.mockito.ArgumentMatchers.any());
  }

  /**
   * The runner's answers to the next prepare calls, one per call, the last repeating: a {@link
   * GuidedSessionException} is a refusal, anything else is accepted.
   */
  void prepareSequence(GuidedSessionException... outcomes) {
    org.mockito.stubbing.Stubber stubber = null;
    for (GuidedSessionException outcome : outcomes) {
      stubber =
          stubber == null
              ? outcome == null
                  ? Mockito.doReturn(contracts.object().put("preparationId", "stand-in"))
                  : Mockito.doThrow(outcome)
              : outcome == null
                  ? stubber.doReturn(contracts.object().put("preparationId", "stand-in"))
                  : stubber.doThrow(outcome);
    }
    stubber
        .when(dispatch)
        .prepareStep(
            org.mockito.ArgumentMatchers.any(),
            org.mockito.ArgumentMatchers.anyString(),
            org.mockito.ArgumentMatchers.anyLong(),
            org.mockito.ArgumentMatchers.any());
  }

  /**
   * The runner could not parse the code: STEP_SYNTAX with a position, as the HTTP client maps it.
   */
  static GuidedSessionException syntax(int line, int column) {
    return new GuidedSessionException("INVALID_CONTRACT", 422, "STEP_SYNTAX", line, column);
  }

  /** The code failed before its first action: STEP_PRE_FENCE with the match count. */
  static GuidedSessionException preFence(int matches) {
    return new GuidedSessionException(
        "INVALID_CONTRACT", 422, "STEP_PRE_FENCE", null, null, matches);
  }

  /**
   * The runner's answer to an observation refresh: the owning worker commits the next page through
   * the same callback the backend waits on (the backend sends the request, the worker commits).
   *
   * @param pages the observation for the generation the refresh produces
   */
  void refreshWith(Function<Long, ObjectNode> pages) {
    Mockito.doAnswer(
            call -> {
              String id = call.getArgument(1);
              long fence = call.getArgument(2);
              String key = call.getArgument(3);
              JsonNode request = call.getArgument(4);
              JsonNode committed =
                  service.beginObservationRefresh(controller, id, fence, key, request);
              if (committed != null) {
                return committed;
              }
              String callbackKey =
                  progress(id).path("observationRefresh").path("callbackKey").asText();
              long generation = request.path("expectedGeneration").asLong() + 1;
              ObjectNode stamped = pages.apply(generation).deepCopy();
              stamped
                  .put("sessionId", id)
                  .put("scopeHash", scopeHash(id))
                  .put("generation", generation);
              // The worker's callback body: the refresh request's frozen identity plus the page.
              ObjectNode envelope = ((ObjectNode) request).deepCopy();
              envelope.remove(List.of("expectedGeneration", "focus"));
              envelope.set("observation", stamped);
              return service.observeV2(worker, id, 1, callbackKey, envelope);
            })
        .when(dispatch)
        .observe(
            org.mockito.ArgumentMatchers.any(),
            org.mockito.ArgumentMatchers.anyString(),
            org.mockito.ArgumentMatchers.anyLong(),
            org.mockito.ArgumentMatchers.anyString(),
            org.mockito.ArgumentMatchers.any());
  }

  /**
   * The runner runs every step and succeeds: prepare returns a proof of the proposal it was given,
   * and dispatch commits the owner callback (receipt with no closed code, no effects named) the way
   * the owning worker does before the dispatch call returns. The real prepare/admit/consume and
   * outcome paths of the backend run; only the browser is absent.
   */
  void runnerSucceeds() {
    // Back to the real bridge: the constructor stopped it at the runner. Call before refreshWith.
    Mockito.reset(dispatch);
    Mockito.doAnswer(
            call -> {
              JsonNode request = call.getArgument(1);
              JsonNode proposal = request.path("proposal");
              ObjectNode proof = contracts.object();
              for (String field :
                  List.of(
                      "schemaVersion",
                      "sessionId",
                      "workerId",
                      "ownerFence",
                      "scopeHash",
                      "contextId",
                      "contextRevision",
                      "sourceRevision",
                      "configurationRevision",
                      "versions")) {
                proof.set(field, request.path(field));
              }
              proof
                  .put("preparationId", UUID.randomUUID().toString())
                  .put("requestDigest", GuidedContracts.hash(proposal))
                  .put("evidenceHash", proposal.path("evidenceHash").asText())
                  .put("authoredInputsHash", proposal.path("authoredInputsHash").asText());
              proof.set("expiresAt", request.path("expiresAt"));
              return proof;
            })
        .when(runner)
        .send(org.mockito.ArgumentMatchers.eq("prepare"), org.mockito.ArgumentMatchers.any());
    Mockito.doAnswer(
            call -> {
              JsonNode payload = call.getArgument(1);
              String id = payload.path("sessionId").asText();
              ObjectNode body = contracts.object();
              for (String field :
                  List.of(
                      "schemaVersion",
                      "sessionId",
                      "workerId",
                      "ownerFence",
                      "scopeHash",
                      "contextId",
                      "contextRevision",
                      "sourceRevision",
                      "configurationRevision",
                      "versions")) {
                body.set(field, payload.path(field));
              }
              ObjectNode ledger = payload.path("ledger").deepCopy();
              ledger.put("state", "SUCCEEDED").put("outcomeCode", "OK");
              body.set("ledger", ledger);
              var availability = body.putArray("availability");
              for (JsonNode capture : payload.path("proposal").path("operation").path("captures")) {
                availability
                    .addObject()
                    .put("bindingId", capture.asText())
                    .put(
                        "producerAdmissionId",
                        ledger.path("admission").path("admissionId").asText())
                    .put("contextId", payload.path("contextId").asText())
                    .put("workerId", payload.path("workerId").asText())
                    .put("ownerFence", payload.path("ownerFence").asInt());
              }
              ObjectNode receipt =
                  contracts
                      .object()
                      .put(
                          "stepHash",
                          payload.path("proposal").path("operation").path("sourceHash").asText())
                      .put("fenceCrossed", true)
                      .put("effectsTruncated", false)
                      .put("offscreen", false);
              receipt.putNull("closedCode");
              receipt.putArray("effects").addObject().put("method", "click").put("completed", true);
              body.set("receipt", receipt);
              body.putObject("secretUse");
              receipts.add(receipt);
              service.outcomeV2(worker, id, 1, "outcome-" + UUID.randomUUID(), body);
              return contracts.object().put("accepted", true);
            })
        .when(runner)
        .send(
            org.mockito.ArgumentMatchers.eq("dispatch"),
            org.mockito.ArgumentMatchers.any(),
            org.mockito.ArgumentMatchers.anyString(),
            org.mockito.ArgumentMatchers.any(Instant.class));
  }

  /** The receipts {@link #runnerSucceeds()} committed, in order. */
  final List<ObjectNode> receipts = new ArrayList<>();

  /** The actions of the session in order of admission, read back. */
  List<ObjectNode> actionRows(String id) {
    return repository.actions(id);
  }

  /** The stored receipt column of each action of the session, by step id. */
  Map<String, String> storedReceipts(String id) {
    Map<String, String> rows = new LinkedHashMap<>();
    jdbc.query(
        "SELECT step_id, receipt::text FROM studio_guided_actions WHERE session_id=? ORDER BY step_id",
        rs -> {
          rows.put(rs.getString(1), rs.getString(2));
        },
        id);
    return rows;
  }

  int requests(GuidedModelRequest.Kind kind) {
    return (int) requests.stream().filter(request -> request.kind() == kind).count();
  }

  private GuidedModelResponse answer(GuidedModelRequest request, GuidedCallBudget budget) {
    requests.add(request);
    ObjectNode reply;
    if (request.kind() == GuidedModelRequest.Kind.SOURCE_PLAN) {
      reply = planReply(request);
    } else {
      var next = script.get(request.kind()).poll();
      if (next == null) {
        throw new AssertionError("no scripted " + request.kind() + " reply left");
      }
      reply = next.apply(request);
    }
    contracts.validate("v3/guided-model-response", reply);
    return new GuidedModelResponse(
        GuidedModelResponse.Code.OK, reply, reportedInputTokens, 1, "scripted");
  }

  /** The SOURCE_PLAN reply: the planned obligations of {@link #session(List)}. */
  private ObjectNode planReply(GuidedModelRequest request) {
    JsonNode context = request.projection().document();
    ObjectNode response =
        contracts
            .object()
            .put("schemaVersion", 3)
            .put("requestId", request.requestId())
            .put("kind", "SOURCE_PLAN");
    response.putArray("sourceReferences");
    var obligations = response.putArray("obligations");
    Map<Integer, Integer> occurrences = new LinkedHashMap<>();
    for (Spec spec : plan) {
      int occurrence = occurrences.merge(spec.step(), 1, Integer::sum) - 1;
      var obligation =
          obligations
              .addObject()
              .put("stepId", context.path("sourceSteps").get(spec.step()).path("stepId").asText())
              .put("occurrence", occurrence)
              .put("targetIntent", spec.intent())
              .putNull("scopeIntent")
              .putNull("referenceIndex");
      if (spec.needId() == null) {
        obligation.putNull("needId");
      } else {
        obligation.put("needId", spec.needId());
      }
      var used = obligation.putArray("uses");
      spec.uses().forEach(used::add);
    }
    response.putArray("stepSections");
    return response;
  }

  // ---- reply builders ----

  /** The obligation id of the {@code index}th obligation the request lists. */
  static String obligationId(GuidedModelRequest request, int index) {
    return request
        .projection()
        .document()
        .path("obligations")
        .get(index)
        .path("obligationId")
        .asText();
  }

  /** A STEP_CODE CODE reply: the step's code and the bindings it captures. */
  ObjectNode code(GuidedModelRequest request, String code, String... captures) {
    ObjectNode reply = envelope(request, "CODE").put("code", code);
    var list = reply.putArray("captures");
    for (String capture : captures) {
      list.add(capture);
    }
    return reply;
  }

  /** A STEP_CODE CLARIFICATION reply offering the given refs. */
  ObjectNode clarification(GuidedModelRequest request, String reason, String... refs) {
    ObjectNode reply = envelope(request, "CLARIFICATION");
    ObjectNode question = reply.putObject("question").put("reason", reason);
    var choices = question.putArray("choices");
    int index = 0;
    for (String ref : refs) {
      choices.addObject().put("ref", ref).put("safeLabel", "Option " + ++index);
    }
    return reply;
  }

  private ObjectNode envelope(GuidedModelRequest request, String status) {
    return contracts
        .object()
        .put("schemaVersion", 3)
        .put("kind", "STEP_CODE")
        .put("requestId", request.requestId())
        .put("status", status);
  }

  // ---- session lifecycle ----

  /**
   * A claimed, acknowledged, planned session at fence 1, left waiting for its first observation.
   */
  String session(List<Spec> specs) {
    return session(specs, true);
  }

  /** A claimed, acknowledged session at fence 1 whose plan and bootstrap have not run yet. */
  String unplannedSession(List<Spec> specs) {
    this.plan = specs;
    String id =
        service.start(user, UUID.randomUUID().toString(), start()).path("sessionId").asText();
    ObjectNode intent = service.prepareAssignment(controller, id, "assignment", "worker-1");
    JsonNode claimed = service.claim(worker, id, "claim", claim(id));
    ObjectNode receipt =
        contracts
            .object()
            .put("schemaVersion", 3)
            .put("status", "OWNED")
            .put("ownerFence", 1)
            .put("leaseExpiresAt", claimed.path("owner").path("leaseExpiresAt").asText());
    receipt.set("assignment", intent);
    service.acknowledgeAssignment(controller, id, receipt);
    return id;
  }

  private String session(List<Spec> specs, boolean observing) {
    String id = unplannedSession(specs);
    translation.plan(controller, id, 1, "plan-" + id, command(id));
    repository.transaction(
        () -> {
          var current = repository.lock(id);
          assertThat(current.document().path("state").asText()).isEqualTo("PROPOSING");
          if (observing) {
            current.document().put("state", "OBSERVING");
            repository.save(current);
          }
          return null;
        });
    return id;
  }

  /** Commits an observation as the owning worker, stamped with this session and generation. */
  void observe(String id, long generation, ObjectNode observation) {
    ObjectNode stamped = observation.deepCopy();
    stamped.put("sessionId", id).put("scopeHash", scopeHash(id)).put("generation", generation);
    service.observe(worker, id, 1, "observe-" + generation, stamped);
  }

  JsonNode advance(String id) {
    return translation.advance(controller, id, 1, "advance-" + UUID.randomUUID(), command(id));
  }

  /** The user answers the pending clarification with the choice at {@code index}. */
  JsonNode answer(String id, int index) {
    JsonNode question = progress(id).path("clarification");
    assertThat(question.isObject()).as("a pending clarification").isTrue();
    ObjectNode request =
        contracts
            .object()
            .put("schemaVersion", 3)
            .put("clarificationId", question.path("clarificationId").asText())
            .put("choiceId", question.path("choices").get(index).path("choiceId").asText())
            .put("generation", question.path("generation").asInt());
    return service.clarify(user, id, "answer-" + UUID.randomUUID(), request);
  }

  ObjectNode command(String id) {
    return repository.transaction(
        () -> {
          var current = repository.lock(id).document();
          return contracts
              .object()
              .put("schemaVersion", 3)
              .put("sessionId", id)
              .put("expectedSourceRevision", current.path("scope").path("sourceRevision").asText())
              .put(
                  "expectedConfigurationRevision",
                  current.path("scope").path("configurationRevision").asText())
              .put("expectedPlanRevision", store.state(id).path("planRevision").asInt());
        });
  }

  // ---- read-backs (SQL, after the session has ended) ----

  String scopeHash(String id) {
    return repository.transaction(() -> repository.lock(id).document().path("scopeHash").asText());
  }

  JsonNode progress(String id) {
    return repository.transaction(() -> repository.lock(id).progress().deepCopy());
  }

  String state(String id) {
    return jdbc.queryForObject(
        "SELECT document->>'state' FROM studio_guided_sessions WHERE session_id=?",
        String.class,
        id);
  }

  String errorCode(String id) {
    return jdbc.queryForObject(
        "SELECT coalesce(progress->>'errorCode','') FROM studio_guided_sessions WHERE session_id=?",
        String.class,
        id);
  }

  String refusalGate(String id) {
    return jdbc.queryForObject(
        "SELECT coalesce(progress->>'refusalGate','') FROM studio_guided_sessions"
            + " WHERE session_id=?",
        String.class,
        id);
  }

  /** {@code rejection_gate -> count} of the REJECTED attempts of the session. */
  Map<String, Integer> rejectionGates(String id) {
    Map<String, Integer> counts = new LinkedHashMap<>();
    jdbc.query(
        "SELECT rejection_gate, count(*) FROM studio_guided_model_attempts WHERE session_id = ?"
            + " AND status = 'REJECTED' AND rejection_gate IS NOT NULL GROUP BY rejection_gate"
            + " ORDER BY rejection_gate",
        rs -> {
          counts.put(rs.getString(1), rs.getInt(2));
        },
        id);
    return counts;
  }

  /** The STEP_CODE attempts of the session by status, e.g. {@code {APPLIED=1, REJECTED=2}}. */
  Map<String, Integer> stepCodeAttempts(String id) {
    Map<String, Integer> counts = new LinkedHashMap<>();
    jdbc.query(
        "SELECT status, count(*) FROM studio_guided_model_attempts WHERE session_id = ? AND"
            + " kind = 'STEP_CODE' GROUP BY status ORDER BY status",
        rs -> {
          counts.put(rs.getString(1), rs.getInt(2));
        },
        id);
    return counts;
  }

  /** The reserved obligations of the session (a reservation survives a prepare that passed). */
  int reservations(String id) {
    return repository.transaction(() -> store.obligations(id).size());
  }

  int actions(String id) {
    return repository.actions(id).size();
  }

  // ---- fixtures ----

  private ObjectNode fixture(String name) {
    ObjectNode value = documents.path(name).deepCopy();
    value.put("schemaVersion", 3);
    if (name.equals("session")) {
      value.withObject("/scope").remove("accountRef");
      value.remove("authConnection");
      value.set("versions", versions());
    }
    return value;
  }

  private ObjectNode versions() {
    return (ObjectNode) contracts.parse("{\"contract\":3}");
  }

  private ObjectNode start() {
    return contracts
        .object()
        .put("schemaVersion", 3)
        .put("testId", SOURCE_TEST.toString())
        .put("sourceRevision", "1")
        .put("configurationRevision", "1")
        .put("environmentId", "fixture")
        .set("versions", versions());
  }

  private ObjectNode claim(String id) {
    return contracts
        .object()
        .put("schemaVersion", 3)
        .put("sessionId", id)
        .put("workerId", "worker-1")
        .put("expectedFence", 0)
        .set("versions", versions());
  }

  private static final UUID SOURCE_TEST = UUID.fromString("00000000-0000-4000-8000-0000000000b1");

  private static Authentication user() {
    return new BffAuthenticationToken(
        new UserIdentity(
            "user-1",
            "fixture@example.test",
            "Fixture",
            "Test",
            List.of(),
            List.of(new CsiOwnershipEntry("CSI-123", "owner"))));
  }

  private void sourceFixture() throws Exception {
    var mapper = new ObjectMapper().findAndRegisterModules();
    List<AuthoringStep> authoring = new ArrayList<>();
    for (int index = 0; index < steps.size(); index++) {
      authoring.add(
          new AuthoringStep(
              UUID.fromString(String.format("00000000-0000-4000-8000-0000000000a%d", index + 1)),
              steps.get(index),
              null));
    }
    var request = new AuthoringV2Request(2, null, authoring);
    var principal = ((BffAuthenticationToken) user).getPrincipal();
    jdbc.update(
        "INSERT INTO users(sso_id,name,email) VALUES (?,'GS-T fixture',?)",
        principal.userId(),
        principal.email());
    jdbc.update(
        "INSERT INTO csi_systems(id,name,business_unit,criticality,owner_email,environment) "
            + "VALUES ('CSI-123','GS-T fixture','Test','LOW',?,'Development')",
        principal.email());
    jdbc.update(
        "INSERT INTO ui_tests(id,name,csi_id,environment,browser,steps,variables,authoring,"
            + "authoring_revision_inputs,created_by) VALUES (?,'GS-T source','CSI-123','fixture',"
            + "'chromium',?::jsonb,?::jsonb,?::jsonb,?::jsonb,?)",
        SOURCE_TEST,
        mapper.writeValueAsString(steps),
        // A test may only be learned on the origins it names.
        "[{\"name\":\"appUrl\",\"kind\":\"plain\",\"value\":\"https://orders.example.test\"}]",
        mapper.writeValueAsString(request),
        mapper.writeValueAsString(AuthoringRevisionIdentity.create(request, Map.of())),
        principal.email());
  }

  private GuidedSessionService newService() {
    var access = new TestAccess();
    var result =
        new GuidedSessionService(
            repository,
            contracts,
            productionAccess(access),
            new GuidedSessionProperties(true, limits),
            TestDomains.FIXTURES,
            clock);
    var translationStore = new GuidedTranslationStore(jdbc, contracts);
    result.installTranslation(
        translationStore, new GuidedClarificationContextStore(jdbc, contracts));
    materialization = new GuidedMaterializationService(jdbc, contracts, TestDomains.FIXTURES);
    result.installBridge(
        materialization,
        new GuidedPreparationStore(jdbc, contracts),
        new GuidedBindingStore(jdbc, contracts, materialization),
        new GuidedAssignmentStore(jdbc, contracts));
    result.installSecretAudit(
        Mockito.mock(com.citi.put.checks.studio.secrets.SecretAuditLifecycle.class));
    ObservedPublicationFixture.installCsiBudget(result, jdbc);
    result.installEvidence(
        new com.citi.put.checks.studio.guided.evidence.RecordedGuidedEvidenceProjection(
            new com.citi.put.checks.studio.guided.evidence.GuidedSessionEvidenceRepository(jdbc),
            new com.citi.put.checks.studio.guided.evidence.GuidedRecordingProperties(null),
            false,
            contracts));
    return result;
  }

  private GuidedProductionSessionAccess productionAccess(GuidedSessionAccess controls) {
    var translationStore = new GuidedTranslationStore(jdbc, contracts);
    var access =
        Mockito.spy(
            new GuidedProductionSessionAccess(
                new GuidedSourceSnapshotRepository(sourceRepository(), contracts),
                new GuidedSourceClassifier(
                    contracts, new CredentialPatternScreen(), TestDomains.FIXTURES),
                new GuidedSourceInputResolver(contracts, TestDomains.FIXTURES),
                translationStore,
                new CsiOwnershipEvaluator(),
                TestDomains.FIXTURES,
                Mockito.mock(StudioReferenceResolver.class)));
    Mockito.doAnswer(
            call -> {
              controls.checkSourceCurrent(call.getArgument(0));
              return call.callRealMethod();
            })
        .when(access)
        .checkSourceCurrent(org.mockito.ArgumentMatchers.any());
    Mockito.doAnswer(
            call -> {
              controls.checkUser(call.getArgument(0), call.getArgument(1));
              return call.callRealMethod();
            })
        .when(access)
        .checkUser(org.mockito.ArgumentMatchers.any(), org.mockito.ArgumentMatchers.any());
    Mockito.doAnswer(call -> controls.recoverableContext(call.getArgument(0), call.getArgument(1)))
        .when(access)
        .recoverableContext(
            org.mockito.ArgumentMatchers.anyString(), org.mockito.ArgumentMatchers.anyString());
    return access;
  }

  /** A JDBC-backed adapter for the existing JPA source seam, with the real source row locked. */
  private com.citi.put.checks.studio.StudioRepository sourceRepository() {
    var sources = Mockito.mock(com.citi.put.checks.studio.StudioRepository.class);
    Mockito.when(sources.findByIdForUpdate(org.mockito.ArgumentMatchers.any(UUID.class)))
        .thenAnswer(
            call -> {
              UUID id = call.getArgument(0);
              var rows =
                  jdbc.queryForList(
                      "SELECT csi_id,environment,steps::text,variables::text,authoring::text,"
                          + "authoring_revision_inputs::text,source_revision,configuration_revision"
                          + " FROM ui_tests WHERE id=? AND deleted_at IS NULL AND quarantined_at IS NULL FOR UPDATE",
                      id);
              if (rows.isEmpty()) {
                return Optional.empty();
              }
              var row = rows.getFirst();
              var test =
                  new com.citi.put.checks.studio.entity.UITest(
                      "GS-T source",
                      null,
                      (String) row.get("csi_id"),
                      (String) row.get("steps"),
                      (String) row.get("variables"),
                      "chromium",
                      1280,
                      720,
                      (String) row.get("environment"),
                      "user-1");
              test.setCsiId((String) row.get("csi_id"));
              test.setEnvironment((String) row.get("environment"));
              test.setSteps((String) row.get("steps"));
              test.setVariables((String) row.get("variables"));
              test.setAuthoring((String) row.get("authoring"));
              test.setAuthoringRevisionInputs((String) row.get("authoring_revision_inputs"));
              test.setSourceRevision(((Number) row.get("source_revision")).longValue());
              test.setConfigurationRevision(
                  ((Number) row.get("configuration_revision")).longValue());
              return Optional.of(test);
            });
    return sources;
  }

  /** Authenticated worker protocol at the existing trusted transport seam, not browser proof. */
  private static ObjectNode blankBootstrap(GuidedContracts contracts, JsonNode context) {
    var request =
        new GuidedMaterializationService(null, contracts, TestDomains.FIXTURES).identity(context);
    var evidence =
        contracts
            .object()
            .put("kind", "initialBlank")
            .put("sessionId", context.path("sessionId").asText())
            .put("contextId", context.path("contextId").asText())
            .put("creationId", UUID.randomUUID().toString())
            .put("documentId", "gs-t-blank-" + UUID.randomUUID())
            .put("bootstrapId", UUID.randomUUID().toString())
            .put("url", "about:blank")
            .putNull("origin")
            .put("generation", 0);
    request.set("executionEvidence", evidence);
    request.put("evidenceHash", GuidedContracts.hash(evidence));
    return request;
  }

  /** The trusted CSI, source and configuration boundary for the fixture tests. */
  private final class TestAccess implements GuidedSessionAccess {
    @Override
    public Snapshot resolve(Authentication principal, JsonNode start) {
      ObjectNode session = fixture("session"), scope = (ObjectNode) session.path("scope");
      scope.set("environmentId", start.path("environmentId"));
      return new Snapshot(scope, session.path("sourceSteps"));
    }

    @Override
    public GuidedSourceReferenceValidator.Sources sources(JsonNode session) {
      return new GuidedSourceReferenceValidator.Sources("1", "1", Map.of(), Map.of());
    }

    @Override
    public void checkSourceCurrent(JsonNode session) {}

    @Override
    public void checkUser(Authentication principal, JsonNode session) {
      GuidedSessionException.require(
          principal instanceof BffAuthenticationToken
              && ((BffAuthenticationToken) principal)
                  .getPrincipal()
                  .userId()
                  .equals(session.path("scope").path("principalId").asText())
              && new CsiOwnershipEvaluator()
                  .canExecute(principal, session.path("scope").path("csiId").asText()),
          "FORBIDDEN_SCOPE",
          403);
    }

    @Override
    public boolean recoverableContext(String id, String workerId) {
      return false;
    }

    @Override
    public String authorizeAction(JsonNode session, JsonNode proposal) {
      return "a".repeat(64);
    }
  }

  static final class MutableClock extends Clock {
    Instant now = Instant.parse("2026-10-08T03:00:00Z");

    @Override
    public ZoneId getZone() {
      return ZoneOffset.UTC;
    }

    @Override
    public Clock withZone(ZoneId zone) {
      return this;
    }

    @Override
    public Instant instant() {
      return now;
    }
  }
}
