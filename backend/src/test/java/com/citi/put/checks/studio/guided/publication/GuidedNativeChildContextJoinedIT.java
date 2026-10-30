package com.citi.put.checks.studio.guided.publication;

import static org.assertj.core.api.Assertions.assertThat;

import com.citi.put.checks.ChecksApplication;
import com.citi.put.checks.studio.authoring.AuthoringRevisionIdentity;
import com.citi.put.checks.studio.dto.AuthoringStep;
import com.citi.put.checks.studio.dto.AuthoringV2Request;
import com.citi.put.checks.studio.dto.GlobalAuthoringContext;
import com.citi.put.checks.studio.guided.session.GuidedContracts;
import com.citi.put.checks.studio.guided.session.GuidedSessionRepository;
import com.citi.put.checks.studio.support.JoinedRefs;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.sun.net.httpserver.HttpExchange;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.concurrent.atomic.AtomicInteger;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.TestInstance;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.context.ConfigurableApplicationContext;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.annotation.DirtiesContext;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;

/** Production observation, generator, authenticated worker and frozen ordinary replays. */
class GuidedNativeChildContextJoinedIT extends GuidedJoinedSupport {
  private static final String DESCRIPTION = "Private capture description 63927";
  private static final String RELEASE = "Distinct release sample 82316";

  @Test
  void standardGeneratorReadsSameNativeParagraphAndStrongWithPublicLocalScopes() throws Exception {
    NativeRun run = nativeRun();
    assertNativeProofs(run.evidence());
    complete(run.testId(), run.session());
    assertThat(events.stream().filter("description"::equals).count()).isEqualTo(4);
    assertThat(events.stream().filter("release"::equals).count()).isEqualTo(4);
  }

  @Test
  void childPrefixMutationBeforeFenceRefusesEvenWhenFinalTargetCountStaysOne() throws Exception {
    NativeRun run = nativeRun();
    assertNativeProofs(run.evidence());
    Published published = publishAndProof(run.testId(), run.session());
    assertThat(childLocators(published.artifact())).isNotEmpty();
    int consumed = events.size();
    // The second About container has no paragraph. The frozen final paragraph remains unique;
    // only the child-bearing public scope prefix becomes ambiguous on the next real page load.
    html = nativeHtml(true);
    JsonNode replay = runtime.replay(run.testId(), "ERROR");
    assertThat(replay.path("replayFailure").path("code").asText()).isEqualTo("TARGET_DRIFT");
    assertThat(events).hasSize(consumed);
    assertThat(pageFacts)
        .anySatisfy(
            fact -> {
              assertThat(fact.path("aboutPrefixes").asInt()).isEqualTo(2);
              assertThat(fact.path("aboutParagraphs").asInt()).isEqualTo(1);
            });
  }

  @Test
  void canonicalProofAndFrozenPublicationRetainExactNativeIdentityWithoutCaptureSelector()
      throws Exception {
    NativeRun run = nativeRun();
    assertNativeProofs(run.evidence());
    Published published = complete(run.testId(), run.session());
    String frozen = published.artifact().toString();
    assertThat(frozen).doesNotContain(DESCRIPTION, RELEASE, "backendNodeId", "captureSelector");
    assertThat(childLocators(published.artifact())).isNotEmpty();
    for (JsonNode locator : childLocators(published.artifact())) {
      assertThat(locator.toString())
          .doesNotContain(DESCRIPTION, RELEASE, "nth", "\"tag\":\"strong\"");
    }
    // Root f9205ab: labelled destination hasValue proves reuse; a separate public child assertion
    // proves purpose.
    assertThat(run.evidence().path("actions")).hasSize(9);
    assertThat(published.artifact().toString()).contains("hasValue", "paragraph", "strong");
    repeatReadRefusesAfterNativeCapture();
  }

  private NativeRun nativeRun() throws Exception {
    reset();
    html = nativeHtml(false);
    var texts =
        List.of(
            "Open " + url() + ". Copy the About description.",
            "Fill First receiver with that description. Check First recei"
                + "ver has that description.",
            "Copy the Release stable value.",
            "Fill Second receiver with that stable value. Check Second re"
                + "ceiver has that stable"
                + " value.",
            "Check First receiver is visible. Check proof in Inspection is visible.");
    script =
        List.of(
            Op.navigate(0, url()),
            Op.node(0, "read", "description", "About", "paragraph", null, "description", null),
            Op.node(
                1,
                "fill",
                "First receiver",
                null,
                "textbox",
                "First receiver",
                "description",
                null),
            Op.node(
                1,
                "assert",
                "First receiver",
                null,
                "textbox",
                "First receiver",
                "description",
                "hasValue"),
            Op.node(2, "read", "stable value", "Release", "strong", null, "release", null),
            Op.node(
                3, "fill", "Second receiver", null, "textbox", "Second receiver", "release", null),
            Op.node(
                3,
                "assert",
                "Second receiver",
                null,
                "textbox",
                "Second receiver",
                "release",
                "hasValue"),
            Op.node(
                4, "assert", "First receiver", null, "textbox", "First receiver", null, "visible"),
            Op.node(
                4, "assert", "proof", "Inspection", "paragraph", "Proof token", null, "visible"));
    UUID test = source(texts, Map.of());
    String session = learn(test);
    runtime.awaitFinalizing(session);
    JsonNode evidence = runtime.evidence(session);
    assertThat(evidence.path("actions")).hasSize(script.size());
    assertThat(modelRequests.stream().map(JsonNode::toString).toList())
        .noneMatch(value -> value.contains("backendNodeId") || value.contains("captureSelector"));
    return new NativeRun(test, session, evidence);
  }

  private String nativeHtml(boolean duplicate) {
    return "<main><div><h2>About</h2><p>"
        + DESCRIPTION
        + "</p></div>"
        + (duplicate ? "<div><h2>About</h2></div>" : "")
        + "<div><h2>Release</h2><strong>"
        + RELEASE
        + "</strong></div><div><section><h2>About</h2></section><h2>Spa"
        + "re alpha</h2><p>Auxiliary"
        + " notice alpha</p></div><div><section><h2>Release</h2></section><h2>Spare"
        + " beta</h2><strong>Auxiliary notice beta</strong></div><label"
        + ">First receiver<textarea"
        + " oninput=\"eventOf('description')\"></textarea></label><labe"
        + "l>Second receiver<textarea"
        + " oninput=\"eventOf('release');document.getElementById('proof"
        + "-region').hidden=false;document.getElementById('proof-decoy'"
        + ").hidden=false\"></textarea></label><section"
        + " id='proof-region' hidden><h2>Inspection</h2><p>Proof token<"
        + "/p></section><section hidden"
        + " id='proof-decoy'><div><h2>Inspection</h2></div><h2>Spare ga"
        + "mma</h2><p>Auxiliary notice"
        + " gamma</p></section></main><script>window.addEventListener('load',()=>fetch('"
        + route
        + "/facts',{method:'POST',body:JSON.stringify({aboutPrefixes:[."
        + "..document.querySelectorAll('div')]"
        + ".filter(d=>[...d.children].some(c=>c.tagName==='H2'&&c.textC"
        + "ontent==='About')).length,"
        + "aboutParagraphs:[...document.querySelectorAll('div')].filter"
        + "(d=>[...d.children].some(c=>c.tagName==='H2'&&c.textContent="
        + "=='About')).flatMap(d=>[...d.querySelectorAll('p')]).length}"
        + ")}));</script>";
  }

  private void assertNativeProofs(JsonNode evidence) {
    int reads = 0;
    for (JsonNode preparation : evidence.path("preparations")) {
      JsonNode proposal = preparation.path("proposal");
      if (!proposal.path("operation").path("kind").asText().equals("read")) {
        continue;
      }
      reads++;
      JsonNode proof = preparation.path("proof"), target = proof.path("target");
      String role =
          proposal.path("coordinate").path("stepId").asText().equals(stepIds.get(0))
              ? "paragraph"
              : "strong";
      assertThat(target.path("identity").path("role").asText()).isEqualTo(role);
      JsonNode observation = observationFor(evidence, preparation.path("observationHash").asText());
      JsonNode fact = observation.path("facts").path(proposal.path("target").path("ref").asText());
      assertThat(fact.path("role").asText()).isEqualTo(role);
      assertThat(target.path("locator").toString()).contains("\"relation\":\"child\"");
      assertThat(target.path("locator").toString()).doesNotContain(DESCRIPTION, RELEASE, "nth");
    }
    assertThat(reads).isEqualTo(2);
  }

  private void repeatReadRefusesAfterNativeCapture() throws Exception {
    reset();
    html = nativeHtml(false);
    script =
        List.of(
            Op.navigate(0, url()),
            Op.node(0, "read", "description", "About", "paragraph", null, "description", null),
            Op.node(
                1,
                "fill",
                "First receiver",
                null,
                "textbox",
                "First receiver",
                "description",
                null),
            Op.node(2, "read", "description", "About", "paragraph", null, "repeated", null),
            Op.node(
                3, "fill", "First receiver", null, "textbox", "First receiver", "repeated", null));
    UUID test =
        source(
            List.of(
                "Open " + url() + ". Copy the About description.",
                "Fill First receiver with that description.",
                "Copy the About description again.",
                "Fill First receiver with that repeated description."),
            Map.of());
    String session = learn(test);
    assertThat(awaitTerminal(session).path("state").asText()).isEqualTo("FAILED");
    assertThat(events.stream().filter("description"::equals).count()).isEqualTo(1);
    assertThat(
            jdbc.queryForObject(
                "SELECT count(*) FROM studio_guided_publications WHERE session_id=?",
                Integer.class,
                session))
        .isZero();
    List<JsonNode> next =
        modelRequests.stream()
            .filter(request -> request.path("kind").asText().equals("NEXT_ACTION"))
            .toList();
    assertThat(next).hasSizeGreaterThanOrEqualTo(3);
    assertThat(next.subList(2, next.size()).stream().map(JsonNode::toString).toList())
        .noneMatch(value -> value.contains(DESCRIPTION));
  }

  private record NativeRun(UUID testId, String session, JsonNode evidence) {}
}

/** Composition keeps the existing original40/incremental50 cohort out of these seven tests. */
@SpringBootTest(
    classes = {ChecksApplication.class, GuidedPublicationReplayIT.RuntimeHooks.class},
    webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT,
    properties = {
      "spring.main.banner-mode=off",
      "logging.level.root=WARN",
      "spring.jmx.enabled=false",
      "spring.jpa.hibernate.ddl-auto=none",
      "studio.execution.dispatcher.enabled=false"
    })
@ActiveProfiles("test")
@DirtiesContext(classMode = DirtiesContext.ClassMode.AFTER_CLASS)
@org.springframework.test.context.TestExecutionListeners(
    listeners = GuidedJoinedSupport.JoinedContextCapture.class,
    mergeMode =
        org.springframework.test.context.TestExecutionListeners.MergeMode.MERGE_WITH_DEFAULTS)
@TestInstance(TestInstance.Lifecycle.PER_CLASS)
@org.junit.jupiter.api.parallel.Execution(org.junit.jupiter.api.parallel.ExecutionMode.SAME_THREAD)
abstract class GuidedJoinedSupport {
  public static final class JoinedContextCapture
      extends org.springframework.test.context.support.AbstractTestExecutionListener {
    @Override
    public int getOrder() {
      return 3500;
    }

    @Override
    public void prepareTestInstance(org.springframework.test.context.TestContext context) {
      GuidedPublicationReplayIT.JoinedHarness.bindFramework(context);
    }

    @Override
    public void beforeTestMethod(org.springframework.test.context.TestContext context) {
      GuidedPublicationReplayIT.JoinedHarness.beginInvocation(context);
    }
  }

  static final GuidedContracts CONTRACTS = new GuidedContracts();
  static final ObjectMapper MAPPER = new ObjectMapper().findAndRegisterModules();
  @LocalServerPort int backendPort;
  @Autowired ConfigurableApplicationContext application;
  @Autowired JdbcTemplate jdbc;
  @Autowired GuidedSessionRepository sessions;
  GuidedPublicationReplayIT.JoinedHarness runtime;
  final String route = "/wi6-" + UUID.randomUUID();
  final List<String> events = new CopyOnWriteArrayList<>();
  final List<JsonNode> pageFacts = new CopyOnWriteArrayList<>();
  final List<JsonNode> modelRequests = new CopyOnWriteArrayList<>();
  final List<String> mutationTimeline = new CopyOnWriteArrayList<>();
  final List<String> activeSessions = new CopyOnWriteArrayList<>();
  volatile String html = "", command = "";
  final AtomicInteger mutationAcks = new AtomicInteger();
  volatile List<Op> script = List.of();
  volatile List<String> stepIds = List.of();
  volatile List<String> stepTexts = List.of();
  volatile String mutationAfterFill;

  @DynamicPropertySource
  static void properties(DynamicPropertyRegistry registry) {
    GuidedPublicationReplayIT.properties(registry);
  }

  @BeforeAll
  void startJoinedRuntime() throws Exception {
    GuidedPublicationReplayIT.APP.createContext(route, this::serve);
    GuidedPublicationReplayIT.joinedModel = this::model;
    runtime = new GuidedPublicationReplayIT.JoinedHarness(application, backendPort);
    runtime.start();
    jdbc.update(
        "INSERT INTO users(id,sso_id,name,email,created_at) VALUES "
            + "(?,'user-1','Fixture','fixture@example.invalid',now()) ON CONFLICT DO NOTHING",
        UUID.randomUUID());
    jdbc.update(
        "INSERT INTO csi_systems(id,name,business_unit,criticality,ow"
            + "ner_email,environment) VALUES"
            + " ('CSI-123','Joined fixture','Ops','HIGH','fixture@example.i"
            + "nvalid','Production') ON"
            + " CONFLICT DO NOTHING");
  }

  @AfterAll
  void stopJoinedRuntime() throws Exception {
    try {
      for (String session : activeSessions) {
        String state = state(session).path("state").asText();
        if (!List.of(
                "SUCCEEDED",
                "PUBLICATION_CONFLICT",
                "FAILED",
                "EXPIRED",
                "UNKNOWN_OUTCOME",
                "CANCELLED")
            .contains(state)) {
          runtime.call(
              "/api/v1/studio/guided-sessions/" + session + "/cancel",
              CONTRACTS.object().put("schemaVersion", 3).put("reason", "userRequested"),
              202);
        }
      }
    } finally {
      try {
        if (runtime != null) {
          runtime.close();
        }
      } finally {
        GuidedPublicationReplayIT.joinedAfterOutcome = null;
        GuidedPublicationReplayIT.joinedModel = null;
        GuidedPublicationReplayIT.APP.removeContext(route);
      }
    }
  }

  void reset() {
    events.clear();
    pageFacts.clear();
    modelRequests.clear();
    mutationAcks.set(0);
    mutationAfterFill = null;
    mutationTimeline.clear();
    assertThat(GuidedPublicationReplayIT.joinedAfterOutcome)
        .as("prior one-shot outcome mutation was consumed and cleared")
        .isNull();
    command = "";
  }

  String url() {
    return GuidedPublicationReplayIT.ORIGIN + route + "/page";
  }

  void serve(HttpExchange exchange) throws IOException {
    String suffix = exchange.getRequestURI().getPath().substring(route.length());
    byte[] body;
    if (suffix.equals("/event")) {
      String event = new String(exchange.getRequestBody().readAllBytes(), StandardCharsets.UTF_8);
      if (List.of("description", "release", "fill", "enter", "replace", "navigate")
          .contains(event)) {
        events.add(event);
      }
      body = new byte[0];
    } else if (suffix.equals("/facts")) {
      pageFacts.add(MAPPER.readTree(exchange.getRequestBody()));
      body = new byte[0];
    } else if (suffix.equals("/command")) {
      body = command.getBytes(StandardCharsets.UTF_8);
    } else if (suffix.equals("/ack")) {
      mutationAcks.incrementAndGet();
      body = new byte[0];
    } else {
      // Command polling is an explicit adversarial-fixture producer, absent from positive/replay
      // pages.
      boolean mutationPage = mutationAfterFill != null && !suffix.equals("/navigated");
      String polling =
          mutationPage
              ? "const commandTimer=setInterval(async()=>{const c=await(await fetch('"
                  + route
                  + "/command')).text();"
                  + "if(!c||window.doneCommand===c)return;window.doneCommand=c;if"
                  + "(c==='replace'){const"
                  + " e=document.querySelector('input[aria-label]'),n=e.cloneNode"
                  + "(true);e.replaceWith(n);await"
                  + " fetch('"
                  + route
                  + "/facts',{method:'POST',body:JSON.stringify({"
                  + "replacement:e!==n,sameLabel:e.getAttribute('aria-label')===n"
                  + ".getAttribute('aria-label'),"
                  + "oldDisconnected:!e.isConnected,newConnected:n.isConnected})});}"
                  + "if(c==='navigate'){clearInterval(commandTimer);location.href='"
                  + route
                  + "/navigated';return;}"
                  + "await fetch('"
                  + route
                  + "/ack',{method:'POST'});clearInterval(commandTimer);},10);"
              : "";
      String support =
          "<script>function eventOf(e){fetch('"
              + route
              + "/event',{method:'POST',body:e})}"
              + polling
              + (suffix.equals("/navigated")
                  ? "window.doneCommand='navigate';fetch('" + route + "/ack',{method:'POST'});"
                  : "")
              + "</script>";
      body =
          ("<!doctype html><html><head><title>Joined fixture</title></head><body>"
                  + html
                  + support
                  + "</body></html>")
              .getBytes(StandardCharsets.UTF_8);
    }
    exchange
        .getResponseHeaders()
        .add("Content-Type", suffix.equals("/command") ? "text/plain" : "text/html; charset=utf-8");
    exchange.sendResponseHeaders(200, body.length);
    exchange.getResponseBody().write(body);
    exchange.close();
  }

  UUID source(List<String> texts, Map<String, String> saved) throws Exception {
    return source(texts, saved, null);
  }

  UUID source(List<String> texts, Map<String, String> saved, GlobalAuthoringContext global)
      throws Exception {
    stepTexts = List.copyOf(texts);
    stepIds = texts.stream().map(text -> UUID.randomUUID().toString()).toList();
    var steps = new ArrayList<AuthoringStep>();
    for (int at = 0; at < texts.size(); at++) {
      steps.add(new AuthoringStep(UUID.fromString(stepIds.get(at)), texts.get(at), null));
    }
    var authoring = new AuthoringV2Request(2, global, steps);
    var variables = CONTRACTS.object().putArray("variables");
    saved.forEach(
        (name, value) ->
            variables.addObject().put("name", name).put("kind", "plain").put("value", value));
    UUID test = UUID.randomUUID();
    jdbc.update(
        "INSERT INTO ui_tests(id,name,csi_id,environment,browser,step"
            + "s,variables,authoring,"
            + "authoring_revision_inputs,created_by,created_at,updated_at) VALUES "
            + "(?,'WI6 joined','CSI-123','fixture','chromium',?::jsonb,?::j"
            + "sonb,?::jsonb,?::jsonb,"
            + "'fixture@example.invalid',now(),now())",
        test,
        MAPPER.writeValueAsString(texts),
        variables.toString(),
        MAPPER.writeValueAsString(authoring),
        MAPPER.writeValueAsString(AuthoringRevisionIdentity.create(authoring, saved)));
    return test;
  }

  String learn(UUID test) throws Exception {
    String session = runtime.learn(test);
    activeSessions.add(session);
    return session;
  }

  JsonNode state(String session) {
    return sessions.transaction(() -> sessions.lock(session).document().deepCopy());
  }

  JsonNode awaitTerminal(String session) {
    org.awaitility.Awaitility.await("joined terminal state")
        .atMost(Duration.ofSeconds(90))
        .pollInterval(Duration.ofMillis(50))
        .until(
            () ->
                List.of("FAILED", "EXPIRED", "UNKNOWN_OUTCOME", "CANCELLED", "FINALIZING")
                    .contains(state(session).path("state").asText()));
    JsonNode terminal = state(session);
    if (!terminal.path("state").asText().equals("FINALIZING")) {
      org.awaitility.Awaitility.await("joined failed browser teardown confirmation")
          .atMost(Duration.ofSeconds(20))
          .pollInterval(Duration.ofMillis(30))
          .until(
              () ->
                  sessions
                      .transaction(
                          () -> sessions.lock(session).progress().path("teardownStatus").asText())
                      .equals("CONFIRMED"));
    }
    return terminal;
  }

  Published publishAndProof(UUID test, String session) throws Exception {
    int models = modelRequests.size();
    int wire = GuidedPublicationReplayIT.MODEL_WIRE.size();
    int legacy = GuidedPublicationReplayIT.LEGACY_MODEL_CALLS.get();
    JsonNode receipt =
        runtime.call(
            "/api/v1/studio/guided-sessions/" + session + "/finalize",
            CONTRACTS
                .object()
                .put("schemaVersion", 3)
                .put("expectedSourceRevision", "1")
                .put("expectedConfigurationRevision", "1"),
            200);
    runtime.proof(session, receipt);
    assertThat(modelRequests).hasSize(models);
    assertThat(GuidedPublicationReplayIT.MODEL_WIRE).hasSize(wire);
    assertThat(GuidedPublicationReplayIT.LEGACY_MODEL_CALLS.get()).isEqualTo(legacy);
    JsonNode artifact =
        CONTRACTS.parse(
            jdbc.queryForObject(
                "SELECT artifact::text FROM ui_test_revisions WHERE id=?::uuid",
                String.class,
                receipt.path("revisionId").asText()));
    assertThat(
            jdbc.queryForObject(
                "SELECT count(*) FROM studio_guided_session_recordings WHERE session_id=?",
                Integer.class,
                session))
        .isZero();
    return new Published(test, session, receipt, artifact);
  }

  Published complete(UUID test, String session) throws Exception {
    Published publication = publishAndProof(test, session);
    int models = modelRequests.size();
    int wire = GuidedPublicationReplayIT.MODEL_WIRE.size();
    int legacy = GuidedPublicationReplayIT.LEGACY_MODEL_CALLS.get();
    for (int run = 0; run < 2; run++) {
      JsonNode result = runtime.replay(test, "PASSED");
      assertThat(result.path("revisionId").asText())
          .isEqualTo(publication.receipt().path("revisionId").asText());
    }
    assertThat(modelRequests).hasSize(models);
    assertThat(GuidedPublicationReplayIT.MODEL_WIRE).hasSize(wire);
    assertThat(GuidedPublicationReplayIT.LEGACY_MODEL_CALLS.get()).isEqualTo(legacy);
    return publication;
  }

  ObjectNode model(JsonNode request) {
    modelRequests.add(request.deepCopy());
    String kind = request.path("kind").asText();
    JsonNode context = request.path("context");
    ObjectNode result =
        CONTRACTS
            .object()
            .put("schemaVersion", 3)
            .put("kind", kind)
            .put("requestId", request.path("requestId").asText());
    if (kind.equals("SOURCE_PLAN")) {
      var references = result.putArray("sourceReferences");
      var obligations = result.putArray("obligations");
      var occurrences = new java.util.HashMap<Integer, Integer>();
      for (Op op : script) {
        Integer reference = null;
        if (op.literal() != null) {
          reference = references.size();
          String source = stepTexts.get(op.step());
          int offset = source.indexOf(op.literal());
          if (offset < 0) {
            throw new IllegalStateException("JOINED_SOURCE_REFERENCE_MISSING");
          }
          references
              .addObject()
              .put("referenceKind", "sourceSpan")
              .put("sourceRevision", context.path("sourceRevision").asText())
              .put("stepId", stepIds.get(op.step()))
              .put("startUtf16", offset)
              .put("endUtf16", offset + op.literal().length())
              .put("kind", op.kind().equals("navigate") ? "destination" : "nonsecretText")
              .put(
                  "intendedSlot",
                  op.kind().equals("navigate") ? "navigate.destination" : "fill.value");
        } else if (op.saved()) {
          reference = references.size();
          JsonNode original = null;
          for (JsonNode candidate : context.path("configurationReferences")) {
            if (candidate.path("stepId").asText().equals(stepIds.get(op.step()))
                && candidate.path("intendedSlot").asText().equals("fill.value")
                && stepTexts
                    .get(op.step())
                    .contains("<var " + candidate.path("referenceName").asText() + ">")) {
              original = candidate;
            }
          }
          if (original == null) {
            throw new IllegalStateException("JOINED_CONFIGURATION_REFERENCE_MISSING");
          }
          ObjectNode configured = original.deepCopy();
          configured
              .put("referenceKind", "configuration")
              .put("configurationRevision", context.path("configurationRevision").asText());
          configured.remove("referenceName");
          references.add(configured);
        }
        ObjectNode obligation =
            obligations
                .addObject()
                .put("stepId", stepIds.get(op.step()))
                .put("occurrence", occurrences.merge(op.step(), 1, Integer::sum) - 1)
                .put("operationKind", op.kind())
                .put("targetIntent", op.intent())
                .put("scopeIntent", op.scope())
                .put("needId", op.need())
                .put("predicate", op.predicate());
        if (reference == null) {
          obligation.putNull("referenceIndex");
        } else {
          obligation.put("referenceIndex", reference);
        }
      }
      return result;
    }
    if (!kind.equals("NEXT_ACTION")) {
      throw new IllegalStateException("JOINED_UNEXPECTED_MODEL_KIND");
    }
    JsonNode obligation = context.path("obligations").get(0);
    Op op = operationFor(obligation);
    if (op.kind().equals("fill") && mutationAfterFill != null) {
      armMutationAfterCommittedFill(op);
    }
    if (op.kind().equals("press") && !mutationTimeline.isEmpty()) {
      assertThat(mutationTimeline)
          .startsWith("FILL_CALLBACK_COMMITTED", "BROWSER_MUTATION_ACKNOWLEDGED");
      mutationTimeline.add("FRESH_PRESS_PLAN");
    }
    result
        .put("status", "ACTION")
        .put("obligationId", obligation.path("obligationId").asText())
        .putNull("question");
    ObjectNode action = result.putObject("action"),
        target = action.putObject("target"),
        operation = action.putObject("operation").put("kind", op.kind());
    if (op.kind().equals("navigate")) {
      target.put("kind", "page");
      operation.put("destinationInputId", input(context, obligation, "navigate.destination"));
      return result;
    }
    var matches =
        JoinedRefs.shown(context.path("observation").asText()).stream()
            .filter(
                line ->
                    line.role().equals(op.role())
                        && (op.name() == null || displayedTextMatches(line, op.name()))
                        && (!op.kind().equals("read")
                            || op.scope() == null
                            || precedingHeadingMatches(
                                context.path("observation").asText(), line.ref(), op.scope())))
            .toList();
    if (matches.size() != 1) {
      throw new IllegalStateException("JOINED_PUBLIC_TARGET_NOT_UNIQUE");
    }
    target.put("kind", "node").put("ref", matches.getFirst().ref());
    if (op.kind().equals("read")) {
      operation.put("bindingId", binding(context, op.need()));
    }
    if (op.kind().equals("fill")) {
      ObjectNode value = operation.putObject("value");
      if (op.need() != null) {
        value.put("kind", "binding").put("bindingId", binding(context, op.need()));
      } else {
        value
            .put("kind", "authoredLiteral")
            .put("sourceInputId", input(context, obligation, "fill.value"));
      }
    }
    if (op.kind().equals("assert")) {
      operation.put("predicate", op.predicate());
      if (op.need() == null) {
        operation.putNull("expected");
      } else {
        operation
            .putObject("expected")
            .put("kind", "binding")
            .put("bindingId", binding(context, op.need()));
      }
    }
    if (op.kind().equals("press")) {
      operation.put("key", "Enter");
    }
    return result;
  }

  private boolean precedingHeadingMatches(String outline, String ref, String expected) {
    String heading = null;
    for (var line : com.citi.put.checks.studio.guided.translation.GuidedOutline.parse(outline)) {
      if (line.role().equals("heading")) {
        heading = line.name();
      }
      if (ref.equals(line.ref())) {
        return expected.equals(heading);
      }
    }
    return false;
  }

  private boolean displayedTextMatches(
      com.citi.put.checks.studio.guided.translation.GuidedOutline.Line line, String expected) {
    if (expected.equals(line.name())) {
      return true;
    }
    var text =
        java.util.regex.Pattern.compile("\\{text=(\"(?:[^\"\\\\]|\\\\.)*\")\\}")
            .matcher(line.rest());
    return text.find() && expected.equals(CONTRACTS.parse(text.group(1)).asText());
  }

  private void armMutationAfterCommittedFill(Op op) {
    String mutation = mutationAfterFill;
    String fillStep = stepIds.get(op.step());
    mutationAfterFill = null;
    assertThat(GuidedPublicationReplayIT.joinedAfterOutcome).isNull();
    GuidedPublicationReplayIT.joinedAfterOutcome =
        () -> {
          try {
            List<JsonNode> ledgers =
                jdbc.query(
                    "SELECT document::text FROM studio_guided_actions WHERE step_id=?",
                    (row, index) -> CONTRACTS.parse(row.getString(1)),
                    fillStep);
            assertThat(ledgers).hasSize(1);
            JsonNode committed = ledgers.getFirst();
            assertThat(committed.path("coordinate").path("stepId").asText()).isEqualTo(fillStep);
            assertThat(committed.path("state").asText()).isEqualTo("SUCCEEDED");
            assertThat(committed.path("outcomeCode").asText()).isEqualTo("OK");
            assertThat(committed.path("dispatchCount").asInt()).isEqualTo(1);
            assertThat(committed.path("admission").path("admissionId").asText()).isNotBlank();
            mutationTimeline.add("FILL_CALLBACK_COMMITTED");
            int before = mutationAcks.get();
            command = mutation;
            org.awaitility.Awaitility.await("real browser mutation after committed fill")
                .atMost(Duration.ofSeconds(10))
                .pollInterval(Duration.ofMillis(10))
                .until(() -> mutationAcks.get() > before);
            mutationTimeline.add("BROWSER_MUTATION_ACKNOWLEDGED");
          } finally {
            command = "";
            GuidedPublicationReplayIT.joinedAfterOutcome = null;
          }
        };
  }

  Op operationFor(JsonNode obligation) {
    String id = obligation.path("stepId").asText(),
        kind = obligation.path("operationKind").asText();
    return script.stream()
        .filter(
            op ->
                stepIds.get(op.step()).equals(id)
                    && op.kind().equals(kind)
                    && op.intent().equals(obligation.path("targetIntent").asText()))
        .findFirst()
        .orElseThrow(() -> new IllegalStateException("JOINED_OBLIGATION_NOT_AUTHORED"));
  }

  String input(JsonNode context, JsonNode obligation, String slot) {
    List<JsonNode> matches = new ArrayList<>();
    for (JsonNode item : context.path("inputs")) {
      if (item.path("sourceStepId").equals(obligation.path("stepId"))
          && item.path("intendedSlot").asText().equals(slot)) {
        matches.add(item);
      }
    }
    if (matches.size() != 1) {
      throw new IllegalStateException("JOINED_INPUT_NOT_UNIQUE");
    }
    return matches.getFirst().path("inputId").asText();
  }

  String binding(JsonNode context, String needId) {
    for (JsonNode need : context.path("needs")) {
      if (need.path("needId").asText().equals(needId)) {
        return need.path("bindingId").asText();
      }
    }
    throw new IllegalStateException("JOINED_BINDING_NOT_FOUND");
  }

  static JsonNode observationFor(JsonNode evidence, String hash) {
    for (JsonNode row : evidence.path("observations")) {
      if (row.path("observationHash").asText().equals(hash)) {
        return row.path("observation");
      }
    }
    throw new AssertionError("JOINED_ORIGINAL_OBSERVATION_MISSING");
  }

  static List<JsonNode> childLocators(JsonNode tree) {
    List<JsonNode> found = new ArrayList<>();
    if (tree.isObject()) {
      tree.fields()
          .forEachRemaining(
              entry -> {
                if (entry.getKey().equals("locator")
                    && entry.getValue().isArray()
                    && entry.getValue().toString().contains("\"relation\":\"child\"")) {
                  found.add(entry.getValue());
                } else {
                  found.addAll(childLocators(entry.getValue()));
                }
              });
    } else if (tree.isArray()) {
      tree.forEach(value -> found.addAll(childLocators(value)));
    }
    return found;
  }

  record Published(UUID testId, String session, JsonNode receipt, JsonNode artifact) {}

  record Op(
      int step,
      String kind,
      String intent,
      String scope,
      String role,
      String name,
      String need,
      String predicate,
      String literal,
      boolean saved) {
    static Op navigate(int step, String url) {
      return new Op(step, "navigate", "page", null, null, null, null, null, url, false);
    }

    static Op node(
        int step,
        String kind,
        String intent,
        String scope,
        String role,
        String name,
        String need,
        String predicate) {
      return new Op(step, kind, intent, scope, role, name, need, predicate, null, false);
    }

    static Op savedFill(int step, String intent, String name) {
      return new Op(step, "fill", intent, null, "textbox", name, null, null, null, true);
    }
  }
}
