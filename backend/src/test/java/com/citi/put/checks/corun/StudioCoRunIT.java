package com.citi.put.checks.corun;

import static org.assertj.core.api.Assertions.assertThat;

import com.citi.put.checks.studio.StudioExecutionFixtures;
import com.citi.put.checks.studio.StudioService;
import com.citi.put.checks.studio.compile.CompilePins;
import com.citi.put.checks.studio.compile.CompilePipeline;
import com.citi.put.checks.studio.compile.CompileStateService;
import com.citi.put.checks.studio.compile.gateway.CompileResponse;
import com.citi.put.checks.studio.compile.gateway.GatewayErrorCode;
import com.citi.put.checks.studio.compile.gateway.GatewayOutcome;
import com.citi.put.checks.studio.compile.gateway.GatewayProvenance;
import com.citi.put.checks.studio.compile.gateway.LlmGatewayClient;
import com.citi.put.checks.studio.compile.validator.RunnerValidationClient;
import com.citi.put.checks.studio.dispatch.StudioDispatcher;
import com.citi.put.checks.studio.dto.ExecutionSnapshotDto;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicInteger;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.MethodOrderer;
import org.junit.jupiter.api.Order;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.TestInstance;
import org.junit.jupiter.api.TestMethodOrder;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Primary;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.core.Authentication;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;

/**
 * The local co-run: the real API and the real {@code studio-runner}, in one session, talking to
 * each other over real sockets.
 *
 * <h2>Why this exists</h2>
 *
 * <p>Before this class, the API and the runner had never run together — not in CI, which does not
 * exist in this repository, and not on a laptop. Every backend test dispatched to a fake client or
 * a WireMock stub; every runner test answered a fixture; {@code dev.sh} on this line started the
 * backend and the frontend and never the runner; and {@code npm run test:e2e} names a Playwright
 * configuration that is not in the tree. The consequence is measured, not theoretical: both of the
 * epic's HIGH integration defects were found by a drafter <em>reading</em> code.
 *
 * <ul>
 *   <li><b>DEF-01</b> — the API's dispatch body wrote eight keys against a closed,
 *       fourteen-required schema, so every real dispatch would have been refused {@code 400
 *       JOB_INVALID}.
 *   <li><b>DEF-02</b> — every terminal report the runner sent was refused by the API.
 * </ul>
 *
 * <p>Both are fixed in code. Neither had ever been exercised against the real runner. This class is
 * what makes that class of defect findable by running.
 *
 * <h2>What it is, exactly</h2>
 *
 * <p>Five ordered legs, each of which crosses the seam in a direction that matters:
 *
 * <ol>
 *   <li><b>Leg 0 — the attribution baseline.</b> The harness probes the runner itself, with and
 *       without the credential. Nothing below is interpretable until this is green: a red dispatch
 *       means one thing if the runner is down and a completely different thing if the runner is up
 *       and authenticating. Leg 0 is what tells the two apart, and it is why this class can say
 *       which component refused what instead of "the co-run failed".
 *   <li><b>Leg 1 — API to runner, the compile path.</b> The real {@code CompilePipeline}, with the
 *       LLM stubbed to return an artifact from the runner's own reference corpus, calls the real
 *       {@code POST /v1/validate} on the real runner. The stub replaces the one component a laptop
 *       genuinely cannot have; everything between the pipeline and the runner's validator is
 *       production code on a real socket.
 *   <li><b>Leg 2 — API to runner, the dispatch path.</b> The real {@code HttpRunnerDispatchClient},
 *       reached through the real dispatcher, sends the real job to the real {@code POST /v1/runs}.
 *       This is DEF-01's path, and it is the one nothing in the repository had ever run.
 *   <li><b>Leg 3 — runner back to API.</b> The runner's admission and its terminal report arrive at
 *       the API's internal routes over HTTP, under the callback identity, and the API either
 *       accepts them or refuses them. This is DEF-02's path.
 *   <li><b>Leg 4 — a whole run, to a verdict.</b> A trivial test against a page this JVM serves on
 *       loopback must end {@code PASSED}, with its ledger row {@code DONE}. Leg 3 accepts any state
 *       past {@code PENDING}; this leg is what fails when every run errors.
 * </ol>
 *
 * <h2>Rules this harness obeys</h2>
 *
 * <p><b>It is never allowed to pass by not running.</b> A missing build, a dead runner, an
 * unreachable port — all of them are failures with messages, never skips. The single exception is
 * the {@code STUDIO_CORUN} switch below, which exists so the default backend suite does not spawn a
 * Node process, and the wrapper script asserts the executed count is non-zero precisely so that an
 * accidentally-skipped harness cannot be mistaken for a green one.
 *
 * <p><b>Nothing is weakened to make it pass.</b> If the real dispatch path is broken, this class is
 * red and says why. A red co-run is the first time this class of defect has been caught by running
 * rather than by reading, which is the outcome the harness was built for.
 *
 * <p><b>No dispatch body reaches a message.</b> The job carries resolved variable and secret values
 * since story 10.17, so every diagnostic here is a status, a code, a route or a header name.
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@ActiveProfiles("test")
@TestInstance(TestInstance.Lifecycle.PER_CLASS)
@TestMethodOrder(MethodOrderer.OrderAnnotation.class)
@EnabledIfEnvironmentVariable(
    named = "STUDIO_CORUN",
    matches = "1",
    disabledReason =
        "The co-run starts a real studio-runner process and is driven by tools/corun.sh, which sets"
            + " STUDIO_CORUN=1 and then asserts this class executed. It is out of the default"
            + " backend suite on purpose, not because it is optional.")
class StudioCoRunIT {

  private static final ObjectMapper MAPPER = new ObjectMapper();
  private static final String CSI_ID = "60481";
  private static final String OWNER = "corun-owner@citi.com";

  /**
   * The corpus example this co-run compiles and runs.
   *
   * <p>Drawn from the runner's own reference corpus so the artifact the stubbed LLM returns is one
   * the runner's validator is already proven to accept. A hand-written artifact would make a red
   * leg 1 ambiguous between "the seam is broken" and "the harness wrote a bad artifact".
   */
  private static final String CORPUS_EXAMPLE = "locator-get-by-role-click.json";

  private static final CoRunEnvironment ENVIRONMENT = CoRunEnvironment.allocate();

  private static RunnerProcess runner;

  /**
   * Both directions of the seam, decided before the context starts.
   *
   * <p>The API is told where the runner is and which credential to present; the runner is told the
   * same two facts in reverse when it is started. They come from one object so a mismatch is
   * impossible by construction rather than by review — the failure a mismatch produces is a 401,
   * which is exactly the failure this harness has to be able to attribute to the product.
   */
  @DynamicPropertySource
  static void coRunWiring(DynamicPropertyRegistry registry) {
    registry.add("studio.runner.base-url", ENVIRONMENT::runnerBaseUrl);
    registry.add("studio.runner.service-identity-token", ENVIRONMENT::runnerServiceToken);
    registry.add("studio.execution.callback-base-url", ENVIRONMENT::apiBaseUrl);
    registry.add("studio.execution.callback.service-token", ENVIRONMENT::callbackServiceToken);
    // Driven, never scheduled: the harness calls dispatchOnce() itself so that a red leg names a
    // refusal rather than a timeout, and so that nothing dispatches behind the assertions.
    registry.add("studio.execution.dispatcher.enabled", () -> "false");
    registry.add("studio.execution.enabled", () -> "true");
  }

  /** The LLM is the one component a laptop cannot have; everything else in leg 1 is real. */
  @TestConfiguration
  static class CoRunStubs {

    @Bean
    @Primary
    CorpusGateway corpusGateway() {
      return new CorpusGateway();
    }
  }

  /**
   * The stub gateway: it answers with an artifact the harness chose, or refuses.
   *
   * <p>The refusal branch is not decoration. It is the third of the harness's own falsifications —
   * a gateway that refuses must produce a red that is distinguishable from a runner that refuses
   * and from a runner that cannot be reached. A harness whose failure modes are indistinguishable
   * reproduces the compound-first-failure problem it was built to prevent.
   */
  static final class CorpusGateway implements LlmGatewayClient {

    private final AtomicInteger calls = new AtomicInteger();
    private volatile String answer;
    private volatile boolean refusing;

    @Override
    public CompileResponse propose(
        com.citi.put.checks.studio.compile.gateway.CompileRequest request) {
      calls.incrementAndGet();
      if (refusing) {
        return CompileResponse.failure(
            GatewayOutcome.TRANSPORT,
            GatewayErrorCode.GATEWAY_TRANSPORT,
            "the co-run stub gateway refused",
            null,
            0,
            1L,
            0,
            0);
      }
      return CompileResponse.ok(
          answer,
          new GatewayProvenance(
              "corun-stub@1", "001", CompilePins.PROMPT_VERSION, "1.52.0", true, 0),
          0,
          1L,
          10,
          20);
    }

    void answerWith(String artifactJson) {
      this.answer = artifactJson;
      this.refusing = false;
    }

    void refuse() {
      this.refusing = true;
    }

    int calls() {
      return calls.get();
    }
  }

  @Autowired private StudioService studioService;
  @Autowired private CompilePipeline pipeline;
  @Autowired private CompileStateService states;
  @Autowired private StudioDispatcher dispatcher;
  @Autowired private RunnerValidationClient validationClient;
  @Autowired private CorpusGateway gateway;
  @Autowired private JdbcTemplate jdbc;

  @LocalServerPort private int apiPort;

  private StudioExecutionFixtures fixtures;
  private Authentication owner;
  private List<String> source;
  private String artifact;

  /** Set by leg 2 so leg 3 can say "blocked by leg 2" instead of timing out ambiguously. */
  private UUID dispatchedExecutionId;

  private UUID testId;

  @BeforeAll
  void startTheRunner() throws IOException {
    JsonNode example = readCorpusExample();
    source = new ArrayList<>();
    example.path("source").forEach(line -> source.add(line.asText()));
    artifact = example.path("artifact").toString();

    fixtures = new StudioExecutionFixtures(jdbc);
    fixtures.seedUser(OWNER);
    fixtures.seedCsi(CSI_ID, OWNER);
    owner = StudioExecutionFixtures.identity(OWNER, CSI_ID, "owner");

    runner = RunnerProcess.start(ENVIRONMENT, "http://" + CoRunEnvironment.HOST + ":" + apiPort);
  }

  @AfterAll
  void stopTheRunner() {
    if (runner != null) {
      runner.close();
    }
  }

  // ── Leg 0: the attribution baseline ──────────────────────────────────────

  /**
   * The runner is up, it enforces its identity, and the credential the API was configured with is
   * the one it wants.
   *
   * <p>Everything below is read against these four facts. Without them a 401 on leg 2 is
   * unattributable: it could be a dead runner, a mismatched harness credential, or the API failing
   * to present one. With them it can only be the last.
   */
  @Test
  @Order(0)
  void theRunnerIsUpEnforcesItsIdentityAndAcceptsTheCredentialTheApiWasGiven() {
    assertThat(runner.alive()).as("the studio-runner process must be running").isTrue();

    RunnerProcess.Probe unauthenticatedHealth = runner.probe("GET", "/health", null, null);
    RunnerProcess.Probe authenticatedHealth =
        runner.probe("GET", "/health", ENVIRONMENT.runnerServiceToken(), null);
    RunnerProcess.Probe unauthenticatedRun = runner.probe("POST", "/v1/runs", null, "{}");
    RunnerProcess.Probe authenticatedRun =
        runner.probe("POST", "/v1/runs", ENVIRONMENT.runnerServiceToken(), "{}");

    assertThat(unauthenticatedHealth.status())
        .as("an unauthenticated probe of the runner must be refused, or leg 2 proves nothing")
        .isEqualTo(401);
    assertThat(authenticatedHealth.status())
        .as(
            "the runner must accept the credential the API was configured with (%s); it answered %s",
            ENVIRONMENT.runnerBaseUrl(), authenticatedHealth)
        .isEqualTo(200);
    assertThat(unauthenticatedRun.status())
        .as("POST /v1/runs must check identity before the body; it answered %s", unauthenticatedRun)
        .isEqualTo(401);
    assertThat(unauthenticatedRun.body())
        .as("and must say so with a code rather than a stack trace")
        .contains("IDENTITY_MISSING");
    assertThat(authenticatedRun.status())
        .as(
            "an authenticated but empty job must be refused for its BODY, not its credential; it"
                + " answered %s",
            authenticatedRun)
        .isEqualTo(400);
    assertThat(authenticatedRun.body()).contains("JOB_INVALID");
  }

  // ── Leg 1: API to runner, the compile path ───────────────────────────────

  /**
   * The API's compile pipeline reaches the real runner's validator over a real socket.
   *
   * <p>The call count is asserted because a green compile proves nothing about the seam if the
   * validator was never consulted: a pipeline that skipped the runner would publish a candidate
   * just as happily, and that is precisely the shape of a harness that passes without co-running.
   */
  @Test
  @Order(1)
  void theApiCompilesADraftThroughTheRealRunnerValidateRoute() {
    testId = fixtures.seedTest("Co-run draft", CSI_ID, OWNER, source);
    gateway.answerWith(artifact);
    long callsBefore = validationClient.callCount();
    long mark = runner.logMark();

    pipeline.compile(testId, OWNER);
    awaitCompileStatusIn(testId, Set.of("AWAITING_CONFIRMATION", "NEEDS_REVISION", "STALE"));
    List<String> duringCompile = runner.logSince(mark);

    String status = compileStatus(testId);
    if (!"AWAITING_CONFIRMATION".equals(status)) {
      // The three shapes this leg can fail in, and the two numbers that tell them apart. `validator
      // calls = 0` means the pipeline never reached the runner, so the fault is upstream of the
      // seam — the gateway, or the pipeline's own gate. `validator calls = 1` with the runner
      // recording an identity refusal means the credential is wrong. `validator calls = 1` with the
      // runner recording nothing means the runner was reached and objected to the body: the API's
      // compile_error collapses both of the latter into VALIDATOR_UNAVAILABLE, so the runner's own
      // account of the window is the only thing that separates them.
      throw new CoRunFailure(
          "studio-runner (POST /v1/validate) or the API's compile pipeline",
          "the draft did not become confirmable — compile_status is " + status,
          "gateway calls="
              + gateway.calls()
              + ", validator calls="
              + (validationClient.callCount() - callsBefore)
              + ", compile_error="
              + compileError(testId)
              + "; what the runner recorded while the compile was in flight:\n"
              + quoted(duringCompile));
    }

    assertThat(validationClient.callCount() - callsBefore)
        .as("the compile must have consulted the REAL runner exactly once, not a cached verdict")
        .isEqualTo(1L);
    assertThat(candidateRevisionId(testId)).as("a candidate revision must exist").isNotNull();

    UUID candidate = candidateRevisionId(testId);
    states.confirm(
        testId,
        candidate,
        artifactHash(candidate),
        sourceRevision(testId),
        configurationRevision(testId),
        OWNER);
    assertThat(confirmedRevisionId(testId))
        .as("the confirmed revision is what makes the draft runnable")
        .isEqualTo(candidate);
  }

  // ── Leg 2: API to runner, the dispatch path ──────────────────────────────

  /**
   * The API dispatches a real job to the real runner — DEF-01's path, and the one nothing in this
   * repository had ever run.
   *
   * <p>The assertion is on the ledger and on the execution's own snapshot, which is the product's
   * view rather than the harness's. When it is red, the message names the component that refused,
   * the status it refused with, and the leg-0 facts that rule out the alternatives.
   */
  @Test
  @Order(2)
  void theApiDispatchesAConfirmedRevisionToTheRealRunner() {
    if (confirmedRevisionId(testId) == null) {
      throw new CoRunFailure(
          "co-run harness",
          "leg 2 could not start",
          "leg 1 did not produce a confirmed revision, so this leg is not independently meaningful");
    }

    UUID executionId = studioService.executeTest(testId, owner, null).executionId();
    long mark = runner.logMark();
    int dispatched = dispatcher.dispatchOnce();
    UUID admissionId = awaitAdmission(executionId);
    List<String> duringDispatch = runner.logSince(mark);
    String ledgerState = ledgerState(executionId);
    ExecutionSnapshotDto snapshot = studioService.findExecutionById(executionId, owner);

    if (dispatched != 1 || admissionId == null) {
      throw new CoRunFailure(
          "studio-runner (POST /v1/runs), as reached by the API's HttpRunnerDispatchClient",
          "the job was never admitted — no admission_id on the ledger; state "
              + ledgerState
              + ", execution "
              + snapshot.status()
              + "/"
              + snapshot.errorCode(),
          whatTheRunnerSaidAboutTheDispatch(duringDispatch));
    }

    assertThat(dispatched).as("exactly one execution must have been dispatched").isEqualTo(1);
    assertThat(admissionId)
        .as("the admission CAS is the durable proof that the runner accepted this job")
        .isNotNull();
    dispatchedExecutionId = executionId;
  }

  /**
   * Waits for the runner's admission CAS and returns the {@code admission_id} it committed.
   *
   * <p><b>Why the admission and not the ledger state.</b> The dispatcher writes {@code DISPATCHING}
   * <em>before</em> the send and writes nothing at all on a {@code 202}, because the admission CAS
   * is the next durable step and the runner owns it. A transport failure is classified {@code
   * AMBIGUOUS}, which by design also writes nothing. So immediately after the send, "the runner
   * accepted the job" and "the runner was never reached" are the same row. A leg that accepted
   * {@code DISPATCHING} would have gone green against a runner at a wrong address — one of the
   * three failures this harness must be able to produce — and a leg that accepted {@code DONE}
   * would have gone green against a refusal, because {@code DONE} is the single absorbing terminal
   * state and covers success and failure alike.
   *
   * <p>{@code admission_id} is the one column that can only have been written because the runner
   * committed the CAS, and it stays written whatever the run does afterwards. It is therefore the
   * predicate, and it returns rather than throws so the caller can compose the attribution.
   */
  private UUID awaitAdmission(UUID executionId) {
    long deadline = System.nanoTime() + Duration.ofSeconds(20).toNanos();
    while (System.nanoTime() < deadline) {
      UUID admissionId = admissionId(executionId);
      if (admissionId != null) {
        return admissionId;
      }
      if ("DONE".equals(ledgerState(executionId))) {
        // Absorbing and terminal: nothing will admit this attempt later, so stop waiting and let
        // the caller report the refusal rather than spending the whole window on a settled row.
        return null;
      }
      pause();
    }
    return null;
  }

  // ── Leg 3: runner back to API ────────────────────────────────────────────

  /**
   * The runner's admission and terminal report reach the API and are accepted — DEF-02's path.
   *
   * <p>The terminal state itself is deliberately not constrained to success: a laptop may or may
   * not be able to launch a browser, and a run that ends {@code ERROR} having delivered a report
   * the API accepted still proves the thing this leg exists for. What is asserted is that the
   * execution left {@code PENDING}, which can only happen because the API accepted a report the
   * runner sent.
   */
  @Test
  @Order(3)
  void theRunnerReportsBackAndTheApiAcceptsWhatItSends() {
    if (dispatchedExecutionId == null) {
      throw new CoRunFailure(
          "co-run harness",
          "leg 3 could not start",
          "leg 2 never dispatched, so nothing could report back; this leg is blocked, not failing"
              + " on its own account");
    }

    long mark = runner.logMark();
    ExecutionSnapshotDto snapshot = awaitExecutionPastPending(dispatchedExecutionId);
    if ("PENDING".equals(snapshot.status())) {
      throw new CoRunFailure(
          "put-checks API (POST /internal/studio/executions/{id}/admission or /progress)",
          "no runner report was ever accepted — the execution is still PENDING",
          "the runner was admitted for this job (leg 2 is green), so either it sent nothing or the"
              + " API refused what it sent. What the runner recorded while this leg waited:\n"
              + quoted(runner.logSince(mark)));
    }

    assertThat(snapshot.status())
        .as("the API must have accepted at least one report from the runner")
        .isNotEqualTo("PENDING");
    assertThat(snapshot.revisionId())
        .as("the accepted report must be bound to the revision that was dispatched")
        .isEqualTo(confirmedRevisionId(testId));
  }

  // ── Leg 4: a whole run, to a verdict ──────────────────────────────────────

  /**
   * A trivial test against a page the harness serves reaches {@code PASSED}, and its ledger row
   * reaches {@code DONE} (Studio v1 WP2).
   *
   * <p>Leg 3 deliberately accepts any state past {@code PENDING}: it proves that one report crossed
   * the seam, and a run that ends {@code ERROR} still proves that. It cannot tell a working
   * execution path from one where every run errors, which is the shape a developer would actually
   * notice. This leg closes that gap: the target page is served from this JVM on loopback, so the
   * only way to a verdict other than {@code PASSED} is the product — a browser that did not launch,
   * a step the executor could not run, a terminal report the API refused, or a ledger that never
   * settled.
   *
   * <p>The artifact is assembled from two codes of the runner's own corpus ({@code
   * navigation-goto.json}'s {@code page.goto} with the URL replaced, and {@link #CORPUS_EXAMPLE}'s
   * click) and still goes through the real compile pipeline and the real {@code /v1/validate}, so a
   * harness that wrote an unacceptable artifact is red at the compile step, not at the verdict.
   */
  @Test
  @Order(4)
  void aTrivialPassingTestRunsToPassedAndItsLedgerSettlesDone() throws IOException {
    try (FixturePage page = FixturePage.start()) {
      String gotoLine = "Go to " + page.url();
      String clickLine = source.get(0);
      List<String> passingSource = List.of(gotoLine, clickLine);
      UUID passingTest = fixtures.seedTest("Co-run passing test", CSI_ID, OWNER, passingSource);
      gateway.answerWith(passingArtifact(page.url(), gotoLine, clickLine));

      pipeline.compile(passingTest, OWNER);
      awaitCompileStatusIn(passingTest, Set.of("AWAITING_CONFIRMATION", "NEEDS_REVISION", "STALE"));
      if (!"AWAITING_CONFIRMATION".equals(compileStatus(passingTest))) {
        throw new CoRunFailure(
            "co-run harness or studio-runner (POST /v1/validate)",
            "the passing test did not become confirmable — compile_status is "
                + compileStatus(passingTest),
            "compile_error=" + compileError(passingTest));
      }
      UUID candidate = candidateRevisionId(passingTest);
      states.confirm(
          passingTest,
          candidate,
          artifactHash(candidate),
          sourceRevision(passingTest),
          configurationRevision(passingTest),
          OWNER);

      // The runner admits one run at a time (pool size 1), and leg 3's run may still hold the
      // slot: its click has no page to act on and waits out the step timeout. Dispatching now
      // would be a 429 that the driven dispatcher never retries, so wait for that run to settle.
      if (dispatchedExecutionId != null) {
        awaitSettled(dispatchedExecutionId);
      }

      UUID executionId = studioService.executeTest(passingTest, owner, null).executionId();
      long mark = runner.logMark();
      int dispatched = dispatcher.dispatchOnce();
      ExecutionSnapshotDto snapshot = awaitSettled(executionId);
      String ledgerState = ledgerState(executionId);

      if (dispatched != 1 || !"PASSED".equals(snapshot.status()) || !"DONE".equals(ledgerState)) {
        throw new CoRunFailure(
            "the execution path (dispatch, runner, or the API's terminal report handling)",
            "a trivial test against a reachable page did not settle PASSED/DONE — execution "
                + snapshot.status()
                + "/"
                + snapshot.errorCode()
                + ", ledger "
                + ledgerState
                + ", dispatched "
                + dispatched,
            "fixture page requests="
                + page.requests()
                + ", steps="
                + describeSteps(snapshot)
                + "; what the runner recorded during the run:\n"
                + quoted(runner.logSince(mark)));
      }

      assertThat(page.requests())
          .as("the browser must actually have loaded the fixture page")
          .isPositive();
      assertThat(snapshot.stepResults())
          .as("both steps ran and passed")
          .extracting(com.citi.put.checks.studio.dto.StepResult::status)
          .containsExactly("PASS", "PASS");
      assertThat(snapshot.endedAt()).as("a settled execution has an end").isNotNull();
    }
  }

  private String passingArtifact(String url, String gotoLine, String clickLine) throws IOException {
    JsonNode click = MAPPER.readTree(artifact).path("steps").get(0).path("code");
    com.fasterxml.jackson.databind.node.ObjectNode root = MAPPER.createObjectNode();
    root.put("version", 1);
    com.fasterxml.jackson.databind.node.ArrayNode steps = root.putArray("steps");
    steps
        .addObject()
        .put("stepIndex", 0)
        .put("originalText", gotoLine)
        .put("code", "await page.goto('" + url + "');");
    steps
        .addObject()
        .put("stepIndex", 1)
        .put("originalText", clickLine)
        .put("code", click.asText());
    return root.toString();
  }

  /** Waits until the execution is terminal AND its ledger row is {@code DONE}, or 90 s pass. */
  private ExecutionSnapshotDto awaitSettled(UUID executionId) {
    Set<String> terminal = Set.of("PASSED", "FAILED", "ERROR");
    long deadline = System.nanoTime() + Duration.ofSeconds(90).toNanos();
    ExecutionSnapshotDto snapshot = studioService.findExecutionById(executionId, owner);
    while (System.nanoTime() < deadline) {
      snapshot = studioService.findExecutionById(executionId, owner);
      if (terminal.contains(snapshot.status()) && "DONE".equals(ledgerState(executionId))) {
        return snapshot;
      }
      pause();
    }
    return snapshot;
  }

  private static String describeSteps(ExecutionSnapshotDto snapshot) {
    if (snapshot.stepResults() == null || snapshot.stepResults().isEmpty()) {
      return "(none)";
    }
    return snapshot.stepResults().stream()
        .map(step -> step.stepIndex() + ":" + step.status() + " " + step.message())
        .toList()
        .toString();
  }

  // ── helpers ────────────────────────────────────────────────────────────

  /**
   * The runner's own account of the dispatch it was just sent, and only that.
   *
   * <p>Three shapes, deliberately distinguishable, because the whole value of a co-run is that its
   * failures can be told apart:
   *
   * <ul>
   *   <li><b>It refused the credential.</b> The API reached the runner and was turned away before
   *       the body was read. The job is irrelevant; the transport identity is the fault.
   *   <li><b>It said nothing.</b> The request never arrived — a wrong address, a dead process or a
   *       refused connection — and the job is again irrelevant.
   *   <li><b>It said something else.</b> The API was admitted as a caller and the runner objected
   *       to what it was sent. That is the DEF-01 shape, and its words are quoted verbatim.
   * </ul>
   *
   * <p>Leg 0 and leg 1 are what make the first two readings sound: leg 0 proves the runner is up
   * and accepts the credential the API was configured with, and leg 1 proves the same API presents
   * that credential successfully on another route of the same service.
   */
  private String whatTheRunnerSaidAboutTheDispatch(List<String> duringDispatch) {
    String preamble =
        "the runner is up and accepts the credential the API was configured with (leg 0, against "
            + ENVIRONMENT.runnerBaseUrl()
            + "), and the same API is admitted on POST /v1/validate (leg 1). ";
    if (duringDispatch.isEmpty()) {
      return preamble
          + "The runner recorded NOTHING while the dispatch was in flight, so the request most"
          + " likely never reached it: suspect the address or the connection, not the job.";
    }
    String recorded = quoted(duringDispatch);
    boolean refusedIdentity =
        duringDispatch.stream()
            .anyMatch(
                line -> line.contains("request.unauthenticated") && line.contains("/v1/runs"));
    if (refusedIdentity) {
      return preamble
          + "The runner refused this dispatch on its IDENTITY, before reading the body — so the job"
          + " was never examined and the body's shape is not what is wrong here. What the runner"
          + " recorded while the dispatch was in flight:\n"
          + recorded;
    }
    return preamble
        + "The API was admitted as a caller and the runner objected to WHAT it was sent. What the"
        + " runner recorded while the dispatch was in flight:\n"
        + recorded;
  }

  private JsonNode readCorpusExample() throws IOException {
    Path corpus =
        ENVIRONMENT.runnerDir().resolve("fixtures").resolve("reference").resolve(CORPUS_EXAMPLE);
    if (!Files.isRegularFile(corpus)) {
      throw new CoRunFailure(
          "co-run harness",
          "the reference corpus example is missing",
          "expected " + corpus + "; the harness will not invent an artifact in its place");
    }
    return MAPPER.readTree(Files.readString(corpus, StandardCharsets.UTF_8));
  }

  /**
   * The runner's own lines for one window, indented, or an explicit statement that there were none.
   *
   * <p>"There were none" is evidence, not an absence of it: a route the runner never logged is a
   * route it either never saw or accepted as a caller, and both readings are narrower than the
   * whole session's output would allow. Quoting the whole tail would fold the harness's own leg-0
   * probes into the evidence for a product refusal, and an attribution that includes the harness's
   * own traffic is not an attribution.
   */
  private static String quoted(List<String> lines) {
    if (lines.isEmpty()) {
      return "    (the runner recorded nothing at all in this window)";
    }
    return String.join("\n", lines.stream().map(line -> "    " + line).toList());
  }

  private ExecutionSnapshotDto awaitExecutionPastPending(UUID executionId) {
    long deadline = System.nanoTime() + Duration.ofSeconds(60).toNanos();
    ExecutionSnapshotDto snapshot = studioService.findExecutionById(executionId, owner);
    while (System.nanoTime() < deadline) {
      snapshot = studioService.findExecutionById(executionId, owner);
      if (!"PENDING".equals(snapshot.status())) {
        return snapshot;
      }
      pause();
    }
    return snapshot;
  }

  private void awaitCompileStatusIn(UUID id, Set<String> accepted) {
    long deadline = System.nanoTime() + Duration.ofSeconds(60).toNanos();
    while (System.nanoTime() < deadline) {
      if (accepted.contains(compileStatus(id))) {
        return;
      }
      pause();
    }
  }

  private static void pause() {
    try {
      Thread.sleep(100L);
    } catch (InterruptedException e) {
      Thread.currentThread().interrupt();
      throw new IllegalStateException("interrupted while waiting for the co-run", e);
    }
  }

  private String compileStatus(UUID id) {
    return jdbc.queryForObject(
        "SELECT compile_status FROM ui_tests WHERE id = ?", String.class, id);
  }

  private String compileError(UUID id) {
    return jdbc.queryForObject(
        "SELECT compile_error::text FROM ui_tests WHERE id = ?", String.class, id);
  }

  private UUID candidateRevisionId(UUID id) {
    return jdbc.queryForObject(
        "SELECT current_candidate_revision_id FROM ui_tests WHERE id = ?", UUID.class, id);
  }

  private UUID confirmedRevisionId(UUID id) {
    return jdbc.queryForObject(
        "SELECT confirmed_revision_id FROM ui_tests WHERE id = ?", UUID.class, id);
  }

  private String artifactHash(UUID revisionId) {
    return jdbc.queryForObject(
        "SELECT artifact_hash FROM ui_test_revisions WHERE id = ?", String.class, revisionId);
  }

  private int sourceRevision(UUID id) {
    Integer value =
        jdbc.queryForObject("SELECT source_revision FROM ui_tests WHERE id = ?", Integer.class, id);
    return value == null ? 0 : value;
  }

  private int configurationRevision(UUID id) {
    Integer value =
        jdbc.queryForObject(
            "SELECT configuration_revision FROM ui_tests WHERE id = ?", Integer.class, id);
    return value == null ? 0 : value;
  }

  private UUID admissionId(UUID executionId) {
    List<UUID> ids =
        jdbc.queryForList(
            "SELECT admission_id FROM studio_dispatch_ledger WHERE execution_id = ?",
            UUID.class,
            executionId);
    return ids.isEmpty() ? null : ids.get(0);
  }

  private String ledgerState(UUID executionId) {
    List<String> states =
        jdbc.queryForList(
            "SELECT state FROM studio_dispatch_ledger WHERE execution_id = ?",
            String.class,
            executionId);
    return states.isEmpty() ? "(no ledger row)" : states.get(0);
  }
}
