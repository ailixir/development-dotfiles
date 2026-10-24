#!/usr/bin/env python3
"""Generate the three-file GS-T off-tree draft. Does not write the real backend."""
from pathlib import Path
import difflib
import hashlib
import json
import re

ROOT = Path('/Users/brunobuger/orca/workspaces/put-checks/ui-studio')
HERE = Path(__file__).parent
BASE = Path('backend/src/test/java/com/citi/put/checks/studio/guided/session')


def masked(source):
    pattern = re.compile(r'"""[\s\S]*?"""|"(?:\\.|[^"\\])*"|\'(?:\\.|[^\'\\])*\'|//[^\n]*|/\*[\s\S]*?\*/')
    return pattern.sub(lambda m: ''.join('\n' if x == '\n' else ' ' for x in m.group()), source)


def method_span(source, name):
    mask = masked(source)
    matches = list(re.finditer(r'\b' + re.escape(name) + r'\s*\([^;{}]*\)(?:\s*throws\s+[\w., ]+)?\s*\{', mask))
    matches = [m for m in matches if re.search(r'\b(?:void|JsonNode|ObjectNode|String|GuidedSessionService|Sources|Snapshot|boolean|HeldRowFixture|GuidedControllerCutFixture)\s*$', mask[max(0, m.start()-50):m.start()])]
    if name == 'prepareGuidedControllerCut' and len(matches) == 2:
        matches = [matches[-1]]
    if len(matches) != 1:
        raise ValueError((name, len(matches)))
    match = matches[0]
    start = source.rfind('\n', 0, match.start()) + 1
    depth = 0
    for pos in range(mask.index('{', match.start()), len(mask)):
        if mask[pos] == '{': depth += 1
        elif mask[pos] == '}':
            depth -= 1
            if depth == 0: return start, pos + 1
    raise ValueError(name)


def replace(source, old, new, expected=1):
    actual = source.count(old)
    if actual != expected:
        raise ValueError((old[:90], actual, expected))
    return source.replace(old, new)


def replace_method(source, name, new):
    a, b = method_span(source, name)
    return source[:a] + new.rstrip() + source[b:]


COMMON = r'''
  /** A JDBC-backed adapter for the existing JPA source seam, with the real source row locked. */
  private static com.citi.put.checks.studio.StudioRepository sourceRepository(
      JdbcTemplate jdbc, GuidedContracts contracts) {
    var sources = org.mockito.Mockito.mock(com.citi.put.checks.studio.StudioRepository.class);
    org.mockito.Mockito.when(sources.findByIdForUpdate(org.mockito.ArgumentMatchers.any(UUID.class)))
        .thenAnswer(call -> {
          UUID id = call.getArgument(0);
          var rows = jdbc.queryForList(
              "SELECT csi_id,environment,steps::text,variables::text,authoring::text,"
                  + "authoring_revision_inputs::text,source_revision,configuration_revision"
                  + " FROM ui_tests WHERE id=? AND deleted_at IS NULL AND quarantined_at IS NULL FOR UPDATE",
              id);
          if (rows.isEmpty()) return java.util.Optional.empty();
          var row = rows.getFirst();
          var test = new com.citi.put.checks.studio.entity.UITest(
              "GS-T source", null, (String) row.get("csi_id"), (String) row.get("steps"),
              (String) row.get("variables"), "chromium", 1280, 720,
              (String) row.get("environment"), "user-1");
          test.setCsiId((String) row.get("csi_id"));
          test.setEnvironment((String) row.get("environment"));
          test.setSteps((String) row.get("steps"));
          test.setVariables((String) row.get("variables"));
          test.setAuthoring((String) row.get("authoring"));
          test.setAuthoringRevisionInputs((String) row.get("authoring_revision_inputs"));
          test.setSourceRevision(((Number) row.get("source_revision")).longValue());
          test.setConfigurationRevision(((Number) row.get("configuration_revision")).longValue());
          return java.util.Optional.of(test);
        });
    return sources;
  }

  private static com.citi.put.checks.studio.guided.translation.GuidedTranslationProperties planningProperties() {
    return new com.citi.put.checks.studio.guided.translation.GuidedTranslationProperties(
        true, true, List.of("orders", "other"), List.of("fixture", "other"), 131072, 2048, 60, "worker-1");
  }

  /** The controls can only narrow real current/source/user checks; initialize is never stubbed. */
  private static com.citi.put.checks.studio.guided.translation.GuidedProductionSessionAccess productionAccess(
      JdbcTemplate jdbc, GuidedContracts contracts, GuidedSessionAccess controls, String origin) {
    var store = new com.citi.put.checks.studio.guided.translation.GuidedTranslationStore(jdbc, contracts);
    var policy = contracts.object().put("version", 1).put("policyId", "gs-t-source-policy")
        .put("policyVersion", "1").put("applicationId", "orders").put("environment", "fixture")
        .put("entryPolicyId", "blank");
    policy.putArray("allowedOrigins").add(origin);
    policy.putArray("rules");
    policy.putNull("applicationPolicy");
    var policies = contracts.object().putArray("policies");
    for (String application : List.of("orders", "other")) {
      for (String environment : List.of("fixture", "other")) {
        var configured = policy.deepCopy();
        configured.put("policyId", "gs-t-" + application + "-" + environment)
            .put("applicationId", application).put("environment", environment);
        policies.add(configured);
      }
    }
    var pins = new com.citi.put.checks.studio.guided.publication.ObservedReplayPins(
        contracts, new com.citi.put.checks.studio.guided.publication.ObservedReplayProperties(
            true, 30000, 1048576, 4194304, 2097152, "[]", policies.toString(), 1280, 720));
    var access = org.mockito.Mockito.spy(
        new com.citi.put.checks.studio.guided.translation.GuidedProductionSessionAccess(
            new com.citi.put.checks.studio.guided.translation.GuidedSourceSnapshotRepository(
                sourceRepository(jdbc, contracts), contracts),
            new com.citi.put.checks.studio.guided.translation.GuidedSourceClassifier(
                contracts, planningProperties(),
                new com.citi.put.checks.studio.guided.translation.CredentialPatternScreen()),
            new com.citi.put.checks.studio.guided.translation.GuidedSourceInputResolver(contracts),
            store, new com.citi.put.checks.studio.guided.translation.GuidedStepVerifier(store),
            new CsiOwnershipEvaluator(), pins,
            org.mockito.Mockito.mock(com.citi.put.checks.studio.dispatch.StudioReferenceResolver.class),
            (principal, csi, environment, secret) -> true));
    org.mockito.Mockito.doAnswer(call -> {
      controls.checkCurrent(call.getArgument(0));
      return call.callRealMethod();
    }).when(access).checkCurrent(org.mockito.ArgumentMatchers.any());
    org.mockito.Mockito.doAnswer(call -> {
      controls.checkSourceCurrent(call.getArgument(0));
      return call.callRealMethod();
    }).when(access).checkSourceCurrent(org.mockito.ArgumentMatchers.any());
    org.mockito.Mockito.doAnswer(call -> {
      controls.checkUser(call.getArgument(0), call.getArgument(1));
      return call.callRealMethod();
    }).when(access).checkUser(org.mockito.ArgumentMatchers.any(), org.mockito.ArgumentMatchers.any());
    org.mockito.Mockito.doAnswer(call -> controls.recoverableContext(call.getArgument(0), call.getArgument(1)))
        .when(access).recoverableContext(org.mockito.ArgumentMatchers.anyString(), org.mockito.ArgumentMatchers.anyString());
    return access;
  }

  /** Mirrors production installation; initialization remains inside real production access.start. */
  private static void installTranslation(
      GuidedSessionService sessions, JdbcTemplate jdbc, GuidedContracts contracts) {
    sessions.installTranslation(
        new com.citi.put.checks.studio.guided.translation.GuidedTranslationStore(jdbc, contracts),
        new com.citi.put.checks.studio.guided.translation.GuidedClarificationContextStore(jdbc, contracts));
  }

  /** The exact bounded document-state-only R-5 seam, architect GS-T-S1. */
  private static void firstObservationWindow(
      GuidedSessionRepository repository, String id) {
    repository.transaction(() -> {
      var current = repository.lock(id);
      assertThat(current.document().path("state").asText()).isEqualTo("PROPOSING");
      assertThat(current.progress().path("translationBootstrap").path("phase").asText()).isEqualTo("READY");
      assertThat(current.progress().path("translationBootstrap").path("metadataAcknowledgement").path("version").asInt()).isEqualTo(2);
      assertThat(current.progress().path("executionEvidence").path("kind").asText()).isEqualTo("initialBlank");
      assertThat(current.progress().path("executionEvidence").path("generation").asInt()).isZero();
      assertThat(repository.actions(id)).isEmpty();
      assertThat(current.document().path("counters").path("actions").asInt()).isZero();
      JsonNode beforeProgress = current.progress().deepCopy();
      current.document().put("state", "OBSERVING");
      repository.save(current);
      assertThat(repository.lock(id).progress()).isEqualTo(beforeProgress);
      return null;
    });
  }

  private static void firstObservationCommitted(GuidedSessionRepository repository, String id) {
    repository.transaction(() -> {
      var current = repository.lock(id);
      assertThat(current.document().path("state").asText()).isEqualTo("PROPOSING");
      assertThat(current.progress().path("executionEvidence").path("kind").asText()).isEqualTo("observedDocument");
      assertThat(repository.actions(id)).isEmpty();
      assertThat(current.document().path("counters").path("actions").asInt()).isZero();
      return null;
    });
  }

  /** Authenticated worker protocol at the existing trusted transport seam, not browser proof. */
  private static ObjectNode blankBootstrap(GuidedContracts contracts, JsonNode context) {
    var request = new com.citi.put.checks.studio.guided.bridge.GuidedMaterializationService(null, contracts).identity(context);
    var evidence = contracts.object().put("kind", "initialBlank")
        .put("sessionId", context.path("sessionId").asText()).put("contextId", context.path("contextId").asText())
        .put("creationId", UUID.randomUUID().toString()).put("documentId", "gs-t-blank-" + UUID.randomUUID())
        .put("bootstrapId", UUID.randomUUID().toString()).put("url", "about:blank").putNull("origin")
        .put("generation", 0);
    request.set("executionEvidence", evidence);
    request.put("evidenceHash", GuidedContracts.hash(evidence));
    return request;
  }

  /** Per-composition planner; controlled model replies never construct bridge authority. */
  private static final class PlanningPath {
    private final JdbcTemplate jdbc;
    private final GuidedContracts contracts;
    private final GuidedSessionRepository repository;
    private final GuidedSessionService sessions;
    private final com.citi.put.checks.studio.guided.translation.GuidedTranslationStore store;
    private final com.citi.put.checks.studio.guided.translation.GuidedTranslationService translation;
    private final Authentication controller;
    private final Map<String, JsonNode> selected = new java.util.HashMap<>();
    private final Map<String, JsonNode> associations = new java.util.HashMap<>();
    private final Map<String, JsonNode> probes = new java.util.HashMap<>();

    PlanningPath(JdbcTemplate jdbc, GuidedContracts contracts, GuidedSessionRepository repository,
        GuidedSessionService sessions, com.citi.put.checks.studio.guided.bridge.GuidedDispatchService dispatch,
        Clock clock, Authentication controller) {
      this.jdbc = jdbc;
      this.contracts = contracts;
      this.repository = repository;
      this.sessions = sessions;
      this.controller = controller;
      store = new com.citi.put.checks.studio.guided.translation.GuidedTranslationStore(jdbc, contracts);
      var stopped = org.mockito.Mockito.spy(dispatch);
      org.mockito.Mockito.doThrow(new AssertionError("gs-t-planner-reservation-stop"))
          .when(stopped).prepareAndAdmit(org.mockito.ArgumentMatchers.any(), org.mockito.ArgumentMatchers.anyString(),
              org.mockito.ArgumentMatchers.anyLong(), org.mockito.ArgumentMatchers.anyString(), org.mockito.ArgumentMatchers.any());
      com.citi.put.checks.studio.guided.translation.GuidedLlmGatewayClient gateway = (request, budget) -> {
        var context = request.projection().document();
        var response = contracts.object().put("schemaVersion", 3).put("requestId", request.requestId())
            .put("kind", request.kind().name());
        if (request.kind() == com.citi.put.checks.studio.guided.translation.GuidedModelRequest.Kind.SOURCE_PLAN) {
          var references = response.putArray("sourceReferences");
          var obligations = response.putArray("obligations");
          response.putArray("needs");
          for (JsonNode step : context.path("sourceSteps")) {
            String stepId = step.path("stepId").asText();
            JsonNode secret = null;
            for (JsonNode reference : context.path("configurationReferences")) {
              if (reference.path("stepId").asText().equals(stepId)
                  && reference.path("kind").asText().equals("secretRef")) secret = reference;
            }
            String kind = secret != null ? "fill" : stepId.endsWith("a2") ? "assert" : "click";
            var obligation = obligations.addObject().put("stepId", stepId).put("occurrence", 0)
                .put("operationKind", kind).put("targetIntent", secret == null ? "order-reference" : "Password")
                .putNull("needId");
            if (secret == null) obligation.putNull("referenceIndex");
            else {
              obligation.put("referenceIndex", references.size());
              var reference = (ObjectNode) secret.deepCopy();
              reference.put("referenceKind", "configuration")
                  .put("configurationRevision", context.path("configurationRevision").asText());
              references.add(reference);
            }
            if (kind.equals("assert")) obligation.put("predicate", "visible");
            else obligation.putNull("predicate");
          }
        } else if (request.kind() == com.citi.put.checks.studio.guided.translation.GuidedModelRequest.Kind.NEXT_ACTION) {
          JsonNode probe = selected.get(context.path("sessionId").asText());
          assertThat(probe).as("selected controlled-provider action").isNotNull();
          JsonNode chosen = null;
          for (JsonNode obligation : context.path("obligations")) {
            if (obligation.path("stepId").equals(probe.path("coordinate").path("stepId"))
                && obligation.path("occurrence").equals(probe.path("coordinate").path("ordinal"))) chosen = obligation;
          }
          assertThat(chosen).as("remaining planner obligation").isNotNull();
          var action = contracts.object();
          ObjectNode target = probe.path("target").deepCopy();
          target.remove(List.of("documentId", "generation"));
          action.set("target", target);
          action.set("operation", probe.path("operation").deepCopy());
          response.put("status", "ACTION").put("obligationId", chosen.path("obligationId").asText()).putNull("question");
          response.set("action", action);
        } else throw new AssertionError("Unexpected GS-T model request: " + request.kind());
        contracts.validate("v3/guided-model-response", response);
        return new com.citi.put.checks.studio.guided.translation.GuidedModelResponse(
            com.citi.put.checks.studio.guided.translation.GuidedModelResponse.Code.OK, response, 1, 1, "gs-t-controlled");
      };
      translation = new com.citi.put.checks.studio.guided.translation.GuidedTranslationService(
          sessions, repository, store,
          new com.citi.put.checks.studio.guided.translation.GuidedClarificationContextStore(jdbc, contracts),
          stopped, gateway, contracts, new com.citi.put.checks.studio.guided.translation.GuidedPromptAssembler(contracts),
          new com.citi.put.checks.studio.guided.translation.GuidedSourceInputResolver(contracts),
          new com.citi.put.checks.studio.guided.translation.GuidedProposalValidator(contracts),
          new com.citi.put.checks.studio.guided.translation.GuidedDependencyPlanner(sessions),
          planningProperties(), clock);
      translation.installDatabase(jdbc);
    }

    private ObjectNode command(String id) {
      return repository.transaction(() -> {
        var current = repository.lock(id).document();
        return contracts.object().put("schemaVersion", 3).put("sessionId", id)
            .put("expectedSourceRevision", current.path("scope").path("sourceRevision").asText())
            .put("expectedConfigurationRevision", current.path("scope").path("configurationRevision").asText())
            .put("expectedPlanRevision", store.state(id).path("planRevision").asInt());
      });
    }

    synchronized void bootstrap(String id) {
      translation.plan(controller, id, 1, "gs-t-plan-" + id, command(id));
      firstObservationWindow(repository, id);
    }

    /** Call before opening a rollback transaction; only read the committed association afterward. */
    synchronized JsonNode reserve(String id, String key, JsonNode probe) {
      String cache = id + ":" + key;
      if (!associations.containsKey(cache)) {
        assertThat(org.springframework.transaction.support.TransactionSynchronizationManager.isActualTransactionActive())
            .as("planner reservation precedes the test's admission rollback transaction").isFalse();
        if (associations.keySet().stream().noneMatch(saved -> saved.startsWith(id + ":"))) {
          firstObservationCommitted(repository, id);
        }
        selected.put(id, probe.deepCopy());
        boolean stopped = false;
        for (int attempt = 0; attempt < 3 && !stopped; attempt++) {
          try { translation.advance(controller, id, 1, "gs-t-reserve-" + UUID.randomUUID(), command(id)); }
          catch (AssertionError expected) {
            assertThat(expected).hasMessage("gs-t-planner-reservation-stop");
            stopped = true;
          }
        }
        assertThat(stopped).as("real planner reached committed prepareAndAdmit crash window").isTrue();
        JsonNode association = sessions.translationTransaction(controller, id, 1, current -> {
          for (JsonNode obligation : store.state(id).path("plan").path("obligations")) {
            if (obligation.path("stepId").equals(probe.path("coordinate").path("stepId"))
                && obligation.path("occurrence").equals(probe.path("coordinate").path("ordinal")))
              return store.obligation(id, obligation.path("obligationId").asText());
          }
          return null;
        });
        assertThat(association).as("committed planner-issued authority").isNotNull();
        assertThat(association.path("admissionId").isNull()).isTrue();
        assertThat(association.path("admissionKey").asText()).startsWith("obligation-");
        associations.put(cache, association.deepCopy());
        probes.put(cache, probe.deepCopy());
      }
      JsonNode association = associations.get(cache).deepCopy();
      if (!probes.get(cache).equals(probe)) {
        // Preserve the hostile changed-payload idempotency probe under its original issued key.
        ((ObjectNode) association.path("proposal")).set("operation", probe.path("operation").deepCopy());
      }
      return association;
    }
  }
'''

SERVICE_HELPERS = r'''
  private static final UUID SOURCE_TEST = UUID.fromString("00000000-0000-4000-8000-0000000000b1");
  private final Map<String, PlanningPath> planningPaths = new java.util.concurrent.ConcurrentHashMap<>();
  private boolean admissionSubject;

  private void sourceFixture() {
    try {
      var mapper = new ObjectMapper().findAndRegisterModules();
      var authoring = new com.citi.put.checks.studio.dto.AuthoringV2Request(2, null, List.of(
          new com.citi.put.checks.studio.dto.AuthoringStep(
              UUID.fromString("00000000-0000-4000-8000-0000000000a1"), "Click Order reference.", null),
          new com.citi.put.checks.studio.dto.AuthoringStep(
              UUID.fromString("00000000-0000-4000-8000-0000000000a2"), "Assert Order reference is visible.", null)));
      jdbc.update("INSERT INTO ui_tests(id,name,csi_id,environment,browser,steps,variables,authoring,"
              + "authoring_revision_inputs,created_by) VALUES (?,'GS-T source','CSI-123','fixture',"
              + "'chromium',?::jsonb,'[]'::jsonb,?::jsonb,?::jsonb,'user-1')",
          SOURCE_TEST, mapper.writeValueAsString(List.of("Click Order reference.", "Assert Order reference is visible.")),
          mapper.writeValueAsString(authoring), mapper.writeValueAsString(
              com.citi.put.checks.studio.authoring.AuthoringRevisionIdentity.create(authoring, Map.of())));
    } catch (com.fasterxml.jackson.core.JsonProcessingException failure) {
      throw new IllegalStateException("GS-T source fixture serialization", failure);
    }
  }

  private com.citi.put.checks.studio.guided.translation.GuidedProductionSessionAccess sourceAccess() {
    return productionAccess(jdbc, contracts, access, "https://orders.example.test");
  }

  private PlanningPath planner(String id) {
    return planningPaths.computeIfAbsent(id, ignored -> {
      var runner = org.mockito.Mockito.mock(com.citi.put.checks.studio.guided.bridge.GuidedRunnerClient.class);
      org.mockito.stubbing.Answer<JsonNode> contextReply = call -> {
        JsonNode context = call.getArgument(1);
        if (repository.transaction(() -> !repository.lock(id).progress().has("executionEvidence"))) {
          service.bootstrap(worker, id, 1, "gs-t-bootstrap-" + id, blankBootstrap(contracts, context));
        }
        return materialization.identity(context);
      };
      org.mockito.Mockito.doAnswer(contextReply).when(runner).send(
          org.mockito.ArgumentMatchers.eq("context"), org.mockito.ArgumentMatchers.any());
      org.mockito.Mockito.doAnswer(contextReply).when(runner).send(
          org.mockito.ArgumentMatchers.eq("context"), org.mockito.ArgumentMatchers.any(), org.mockito.ArgumentMatchers.anyString(), org.mockito.ArgumentMatchers.any(Instant.class));
      return new PlanningPath(jdbc, contracts, repository, service,
          new com.citi.put.checks.studio.guided.bridge.GuidedDispatchService(service, materialization, runner), clock, controller);
    });
  }
'''


def service_file(name, source):
    source = re.sub(r'new GuidedSessionService\([\s\S]*?\);',
        lambda m: re.sub(r'\baccess\b', 'sourceAccess()', m.group()), source)
    source = replace(source, '.put("testId", "test-1")', '.put("testId", SOURCE_TEST.toString())')
    source = replace(source, '  void setup() {', '  void setup(org.junit.jupiter.api.TestInfo testInfo) {\n'
        '    admissionSubject = ADMISSION_SUBJECTS.contains(testInfo.getTestMethod().orElseThrow().getName());')
    # Create ordinary source before composing production access; no translation state is seeded.
    a,b=method_span(source,'setup')
    block=source[a:b]
    block=replace(block, '    service = newService(', '    sourceFixture();\n    service = newService(')
    source=source[:a]+block+source[b:]
    # Every service composition gets the same stateless translation wrappers.
    source = re.sub(r'(new GuidedSessionService\([\s\S]*?\);)', lambda m:m.group(0), source)
    # Insert after each constructor assignment, using the variable named in the surrounding code.
    for variable in (['localService', 'selected', 'selectedService', 'result'] if name == 'GuidedSessionIT' else ['result']):
        marker = re.compile(r'(\b(?:var|GuidedSessionService)\s+'+variable+r'\s*=\s*new GuidedSessionService\([\s\S]*?\);)')
        source, count = marker.subn(lambda m: m.group(1)+'\n    installTranslation('+variable+', jdbc, contracts);',source)
        assert count == 1, (name, variable, count)
    a,b=method_span(source,'observing')
    block=source[a:b]
    old='    service.materialize(controller, id, 1, "materialize", new ObjectMapper().createArrayNode());'
    new='''    if (admissionSubject) planner(id).bootstrap(id);
    else service.materialize(controller, id, 1, "materialize", new ObjectMapper().createArrayNode());'''
    block=replace(block,old,new)
    source=source[:a]+block+source[b:]
    if name == 'GuidedSessionIT':
        subjects=['duplicateAdmissionAndConcurrentConsumptionNeverRedispatch','conflictingAdmissionAndUniqueCoordinatesFail',
            'rollbackBeforeDispatchLeavesNoAdmissionAndNoBudgetCharge','takeoverAfterEffectsOrLostAcknowledgmentStopsUnknown',
            'lostAckNeverRetriesAndDelayedCallbackCannotRevive','cancelRevokesUnconsumedAndRetainsUncertainConsumedEvidence',
            'observationBudgetAndGenerationAreSharedAcrossActions','outcomeCannotRewriteAdmissionAndIdenticalDeliveryIsIdempotent',
            'successfulLedgerStillCannotPublishWithoutExactPlanVerifier','actionBudgetAndFalseAssertionReportsFailClosed',
            'liveOwnerRenewalPreservesAdmittedAndDispatchedActions','takeoverCannotReopenFinalizingAfterExecutedEffects',
            'outcomeSaveProofPreservesRealRollbackFreshFenceAndIdempotentWrite']
        source=replace(source,'changed.put("environmentId", "other");','changed.put("applicationId", "other");')
        a,b=method_span(source,'concurrentConflictingStartsHaveOneWinner')
        block=source[a:b]
        block=replace(block, '    var results =', '''    // GS-T-S2: both requests are valid starts before they compete for one idempotency key.
    assertThat(service.start(user, "control-orders", start()).path("state").asText()).isEqualTo("PREPARING");
    assertThat(service.start(user, "control-other", changed).path("state").asText()).isEqualTo("PREPARING");
    var results =''')
        source=source[:a]+block+source[b:]
        # The alternate request is independently valid, per architect GS-T-S2.
        marker='''    // STUDIO-OBS-013/014 S3b: the production recording projection'''
        source=replace(source,marker,'''    com.citi.put.checks.studio.support.ObservedPublicationFixture.ensurePolicy(
        jdbc, "CSI-123", "other", "fixture", List.of("https://orders.example.test"), null, "ALLOW");
'''+marker)
        # Reserve before the rollback transaction opens; the original assertion remains intact.
        a,b=method_span(source,'rollbackBeforeDispatchLeavesNoAdmissionAndNoBudgetCharge')
        block=source[a:b]
        block=replace(block,'    assertThatThrownBy(', '    planner(id).reserve(id, "admit", proposal(id));\n    assertThatThrownBy(')
        source=source[:a]+block+source[b:]
        a,b=method_span(source,'admit');old=source[a:b]
        # The old low-level helper remains solely for the intentional over-budget negative probe.
        negative=old.replace('private JsonNode admit(', 'private JsonNode refusedAdmission(')
        new=r'''  private JsonNode admit(Authentication actor, String id, long fence, String key, JsonNode probe) {
    JsonNode session = repository.transaction(() -> repository.lock(id).document().deepCopy());
    if (session.path("counters").path("actions").asInt() >= session.path("limits").path("maxActions").asInt()) {
      return refusedAdmission(actor, id, fence, key, probe);
    }
    JsonNode association = planner(id).reserve(id, key, probe);
    JsonNode proposal = association.path("proposal");
    String issuedKey = association.path("admissionKey").asText();
    JsonNode existing = service.existingAdmission(actor, id, fence, issuedKey, proposal);
    if (existing != null) return existing;
    ObjectNode proof = materialization.identity(context(id));
    proof.put("preparationId", UUID.randomUUID().toString()).put("requestDigest", GuidedContracts.hash(proposal))
        .put("evidenceHash", proposal.path("evidenceHash").asText())
        .put("authoredInputsHash", proposal.path("authoredInputsHash").asText())
        .put("expiresAt", clock.now.plusSeconds(20).toString());
    service.storePreparation(actor, id, fence, proposal, proof);
    return service.admit(actor, id, fence, issuedKey, proposal);
  }

'''+negative
        source=source[:a]+new+source[b:]
    else:
        subjects=['aDispatchingActionStillEndsUnknownOutcomeWhateverTheReason']
        a,b=method_span(source,'dispatch');block=source[a:b]
        block=replace(block,'    ObjectNode proposal = proposal(id);','''    firstObservationCommitted(repository, id);
    JsonNode association = planner(id).reserve(id, "admit", proposal(id));
    JsonNode proposal = association.path("proposal");
    String issuedKey = association.path("admissionKey").asText();''')
        block=block.replace('service.existingAdmission(controller, id, 1, "admit", proposal)', 'service.existingAdmission(controller, id, 1, issuedKey, proposal)')
        block=block.replace('service.admit(controller, id, 1, "admit", proposal)', 'service.admit(controller, id, 1, issuedKey, proposal)')
        source=source[:a]+block+source[b:]
    added='  private static final java.util.Set<String> ADMISSION_SUBJECTS = java.util.Set.of(\n      '+',\n      '.join(json.dumps(x) for x in subjects)+');\n'
    source=source.rstrip()[:-1]+ '\n'+added+SERVICE_HELPERS+COMMON+'\n}\n'
    return source


TRANSPORT_HELPERS = r'''
  private static final Map<GuidedSessionService, PlanningPath> PLANNING =
      java.util.Collections.synchronizedMap(new java.util.WeakHashMap<>());

  /** Ordinary source fixture only; the production classifier creates the session manifest. */
  private static void saveSource(JdbcTemplate jdbc, Scenario scenario) {
    try {
      var mapper = new com.fasterxml.jackson.databind.ObjectMapper().findAndRegisterModules();
      var steps = new java.util.ArrayList<com.citi.put.checks.studio.dto.AuthoringStep>();
      for (JsonNode step : scenario.source) {
        steps.add(new com.citi.put.checks.studio.dto.AuthoringStep(
            UUID.fromString(step.path("stepId").asText()), step.path("text").asText(),
            new com.citi.put.checks.studio.dto.StepAuthoringContext(
                List.of(new com.citi.put.checks.studio.dto.SecretReference("PASS")), List.of())));
      }
      var authoring = new com.citi.put.checks.studio.dto.AuthoringV2Request(2, null, steps);
      jdbc.update("UPDATE ui_tests SET authoring=?::jsonb,authoring_revision_inputs=?::jsonb WHERE id=?",
          mapper.writeValueAsString(authoring), mapper.writeValueAsString(
              com.citi.put.checks.studio.authoring.AuthoringRevisionIdentity.create(authoring, Map.of())),
          scenario.testId);
    } catch (com.fasterxml.jackson.core.JsonProcessingException failure) {
      throw new IllegalStateException("GS-T source fixture serialization", failure);
    }
  }

  private static ObjectNode sourceSecretReference(GuidedSessionService sessions, String id) {
    // Read the manifest genuinely initialized by production start; do not construct ref-PASS.
    JsonNode manifest = C.parse(actualJdbc.queryForObject(
        "SELECT manifest::text FROM studio_guided_source_manifests WHERE session_id=?", String.class, id));
    for (JsonNode saved : manifest.path("configurationReferences")) {
      if (saved.path("kind").asText().equals("secretRef") && saved.path("intendedSlot").asText().equals("fill.value")) {
        ObjectNode reference = saved.deepCopy();
        reference.put("referenceKind", "configuration").put("configurationRevision", "1");
        return reference;
      }
    }
    throw new AssertionError("Production source has no declared PASS reference");
  }

  private static PlanningPath planner(GuidedSessionService sessions, GuidedSessionRepository repository,
      GuidedMaterializationService materializer, GuidedDispatchService dispatch, JdbcTemplate jdbc) {
    synchronized (PLANNING) {
      return PLANNING.computeIfAbsent(sessions, ignored -> new PlanningPath(
          jdbc, C, repository, sessions, dispatch, Clock.systemUTC(),
          new GuidedInternalSecurity.Identity("controller-1", "backend-controller")));
    }
  }
'''


def transport_file(source):
    source=replace(source, '  void backendReady() {', '  void backendReady() {\n    PLANNING.clear();')
    source=replace(source, 'variables.addObject().put("name", "PASS").put("kind", "secretRef");',
        'variables.addObject().put("name", "PASS").put("kind", "secretRef").put("secretId", "PASS");', expected=6)
    # Keep real native/private-route checks as additional controls around production access.
    source=replace(source,'            access,\n            new GuidedSessionProperties',
        '            productionAccess(jdbc, C, access, ORIGIN),\n            new GuidedSessionProperties')
    a,b=method_span(source,'service') if False else (0,0)
    # Only the clock-taking overload constructs a service.
    marker='''            new GuidedSessionProperties(true, Map.of("maxSessionSeconds", seconds)),
            clock);'''
    source=replace(source,marker,marker+'\n    installTranslation(service, jdbc, C);')
    # Canonical source revisions are the ordinary ui_tests numeric revisions.
    source=source.replace('"source-1"','"1"').replace('"config-1"','"1"')
    # Save canonical v2 source alongside each existing ordinary draft insert, before start.
    pattern=re.compile(r'("INSERT INTO ui_tests[\s\S]*?\bEMAIL\);)')
    source,count=pattern.subn(lambda m:m.group(0)+'\n    saveSource(actualJdbc, scenario);',source)
    assert count==6,count
    # Retire the five direct historical source-manifest/translation-state initialization blocks.
    seed_count=0
    while True:
        match=re.search(r'new GuidedTranslationStore\([^;\n]+\)(?:\s*\n\s*)?\.initialize\(',source)
        if not match:break
        candidates=list(re.finditer(r'(?m)^\s*(?:repository|routedRepository)\.transaction\(',source[:match.start()]))
        assert candidates,'no seed block start'
        start=candidates[-1].start()
        end=source.index('});',match.end())+3
        block=source[start:end]
        assert 'manifest' in block and 'return null;' in block
        source=source[:start]+'\n    // Translation state and manifest were initialized by genuine production access.start.\n'+source[end:]
        seed_count+=1
    assert seed_count==5,seed_count
    source=replace(source,'references.add(DOCUMENTS.path("secretReference"));',
        'references.add(sourceSecretReference(sessions, scenario.sessionId));',expected=5)
    # Bootstrap through the same real relay and original assignment, using the class's own JDBC path.
    replacements=[
        ('actualServicesJoinOneConsumedSecretReadAndPostWithAuthenticatedRecovery','repository','materialization','actualJdbc'),
        ('genuinePrivatePgRouteFailureRetainsInterruptedUnknownWithoutInventingTerminalCommit','routedRepository','routedMaterialization','routedJdbc'),
        ('heldRowFixture','routedRepository','routedMaterialization','routedJdbc'),
        ('prepareGuidedControllerCut','repository','materialization','actualJdbc')]
    for name,repository,materializer,jdbc in replacements:
        a,b=method_span(source,name);block=source[a:b]
        block=replace(block,'sessions.materialize(controller, id, 1, "materialize", references);',
            f'planner(sessions, {repository}, {materializer}, dispatch, {jdbc}).bootstrap(id);')
        block=replace(block,'JsonNode admission = dispatch.prepareAndAdmit(controller, id, 1, "admit", proposal);',
            f'''firstObservationCommitted({repository}, id);
    JsonNode association = planner(sessions, {repository}, {materializer}, dispatch, {jdbc}).reserve(id, "admit", proposal);
    JsonNode admission = dispatch.prepareAndAdmit(controller, id, 1,
        association.path("admissionKey").asText(), association.path("proposal"));''')
        source=source[:a]+block+source[b:]
    # The genuine controlled worker now reports initialBlank before returning its context ACK.
    marker='''      } else if (path.endsWith("/prepare")) {'''
    source=replace(source,marker,'''      } else if (path.endsWith("/context")) {
        boolean blank = actualJdbc.queryForObject(
            "SELECT NOT (progress ? 'executionEvidence') FROM studio_guided_sessions WHERE session_id=?",
            Boolean.class, id);
        if (blank) callback(id, "bootstrap-evidence", blankBootstrap(C, body));
        respond(exchange, 200, identity(body));
'''+marker)
    # Child consumes parent-issued authority; source/observer checks remain, source resolution is real.
    child=source.index('public static final class GuidedControllerChild')
    pos=source.index('return new GuidedSourceReferenceValidator.Sources(',child)
    # Last source expression ends immediately before the anonymous method closes.
    end=source.index('\n            }\n          };',pos)
    source=source[:pos]+'''return new com.citi.put.checks.studio.guided.translation.GuidedSourceInputResolver(contracts)
                  .sources(session, new GuidedTranslationStore(jdbc, contracts)
                      .currentManifest(session.path("sessionId").asText()));'''+source[end:]
    marker='''      service.installSecretAudit(new SecretAuditLifecycle(jdbc, new SecretUseAuditRecorder(jdbc)));'''
    source=replace(source,marker,'''      service.installTranslation(new GuidedTranslationStore(jdbc, contracts),
          new com.citi.put.checks.studio.guided.translation.GuidedClarificationContextStore(jdbc, contracts));
'''+marker)
    source=source.rstrip()[:-1]+'\n'+TRANSPORT_HELPERS+COMMON+'\n}\n'
    return source


def draft():
    outputs={}
    for name in ['GuidedSessionIT','GuidedLifecycleReasonIT']:
        outputs[name]=service_file(name,(ROOT/BASE/(name+'.java')).read_text())
    outputs['GuidedServiceTransportFaultIT']=transport_file((ROOT/BASE/'GuidedServiceTransportFaultIT.java').read_text())
    return outputs


if __name__ == '__main__':
    outputs=draft()
    records=[];patch=[]
    for name,after in outputs.items():
        rel=BASE/(name+'.java');before=(ROOT/rel).read_text();target=HERE/'repo'/rel
        target.parent.mkdir(parents=True,exist_ok=True);target.write_text(after)
        records.append({'file':str(rel),'beforeSha256':hashlib.sha256(before.encode()).hexdigest(),
            'afterSha256':hashlib.sha256(after.encode()).hexdigest(),'compileVerified':False,'runtimeVerified':False})
        patch.extend(difflib.unified_diff(before.splitlines(True),after.splitlines(True),fromfile='a/'+str(rel),tofile='b/'+str(rel)))
    (HERE/'gs-t-draft.patch').write_text(''.join(patch))
    (HERE/'draft-manifest.json').write_text(json.dumps(records,indent=2)+'\n')
    print(json.dumps({'draftFiles':len(records),'compileOrTestsRun':False}))
