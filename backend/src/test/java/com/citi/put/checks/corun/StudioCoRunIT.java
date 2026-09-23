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
import com.citi.put.checks.studio.dto.VideoEvidence;
import com.citi.put.checks.studio.evidence.ExecutionVideoService;
import com.citi.put.checks.studio.evidence.VideoEvidenceFixtures;
import com.citi.put.checks.studio.recovery.RunnerCancelBudget;
import com.citi.put.checks.studio.recovery.RunningReaper;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Duration;
import java.util.ArrayList;
import java.util.Collection;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
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
import org.springframework.boot.test.web.client.TestRestTemplate;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Primary;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpMethod;
import org.springframework.http.ResponseEntity;
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
 * <p><b>Legs 5 – 10 — Stop, with a real browser (Studio v1 WP12).</b> Each one starts from the
 * public {@code POST /api/v1/studio/executions/{id}/cancel} over HTTP and ends with the runner idle
 * and a later run still able to pass:
 *
 * <ol start="5">
 *   <li><b>Leg 5 — the control read alone.</b> A run stalled inside Chromium is cancelled and the
 *       dispatcher's relay is <em>not</em> driven, so the only way the runner can learn of it is
 *       its own poll. It must stop, deliver {@code ERROR / CANCELLED}, leave no browser process and
 *       settle an honest row.
 *   <li><b>Leg 6 — the DELETE relay.</b> The same, with {@code dispatchOnce()} driven right after
 *       the cancel so {@code DELETE /v1/runs/{id}} is what reaches the runner first.
 *   <li><b>Leg 7 — a queued cancel.</b> Closed by the API at once; the dispatcher never sends it
 *       and no browser is launched.
 *   <li><b>Leg 8 — cancel between the send and the admission.</b> The runner's admission is held at
 *       {@link CallbackProxy} while the cancel is recorded; the API must refuse the admission, the
 *       runner must answer {@code 409} and launch nothing.
 *   <li><b>Leg 9 — cancel right after the admission.</b> Before or while the browser starts; the
 *       branch the runner took is recorded, and the invariants hold on every branch.
 *   <li><b>Leg 10 — the next run.</b> After all of the above, a trivial run still ends {@code
 *       PASSED}.
 * </ol>
 *
 * <p>In this harness neither the dispatcher nor the reapers are scheduled. Each cancel leg names
 * the signal it exercises and asserts it from the runner's own {@code run.cancel_requested} line,
 * and the legs that wait for a live runner drive the running reaper on every poll, so a reaper
 * margin that could fire before a healthy runner's {@code FINAL} would show up here as a refused
 * {@code FINAL} rather than being masked by the reaper never running.
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

  /** The runner's callback address: the API's internal routes, observed (Studio v1 WP12). */
  private static CallbackProxy proxy;

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
    registry.add("studio.execution.video-store.provider", () -> "local");
    registry.add(
        "studio.execution.video-store.directory", () -> ENVIRONMENT.objectStoreDir().toString());
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
  @Autowired private RunningReaper runningReaper;
  @Autowired private RunnerCancelBudget cancelBudget;
  @Autowired private TestRestTemplate restTemplate;
  @Autowired private ExecutionVideoService executionVideoService;

  @LocalServerPort private int apiPort;

  /**
   * The two pages the cancel legs' stalled test navigates to: one that loads, one that never does.
   */
  private FixturePage cancelFixture;

  private BlackHolePage blackHole;

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

    cancelFixture = FixturePage.start();
    blackHole = BlackHolePage.start();
    proxy = CallbackProxy.start("http://" + CoRunEnvironment.HOST + ":" + apiPort);
    runner = RunnerProcess.start(ENVIRONMENT, proxy.url());
  }

  @AfterAll
  void stopTheRunner() {
    if (runner != null) {
      runner.close();
    }
    if (proxy != null) {
      proxy.close();
    }
    if (blackHole != null) {
      blackHole.close();
    }
    if (cancelFixture != null) {
      cancelFixture.close();
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
    // The runner admits one run at a time (pool size 1), and leg 3's run may still hold the
    // slot: its click has no page to act on and waits out the step timeout. Dispatching now
    // would be a 429 that the driven dispatcher never retries, so wait for that run to settle.
    if (dispatchedExecutionId != null) {
      awaitSettled(dispatchedExecutionId);
    }
    runATrivialPassingTestToPassed("Co-run passing test");
  }

  /**
   * Compiles, confirms, dispatches and runs a two-step test against a page served here, and fails
   * with an attribution unless it ends {@code PASSED} with its ledger {@code DONE}. Leg 4 is this
   * alone; leg 10 is this after every cancel leg has run.
   */
  private void runATrivialPassingTestToPassed(String name) throws IOException {
    try (FixturePage page = FixturePage.start()) {
      String gotoLine = "Go to " + page.url();
      String clickLine = source.get(0);
      List<String> passingSource = List.of(gotoLine, clickLine);
      UUID passingTest = fixtures.seedTest(name, CSI_ID, OWNER, passingSource);
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

      awaitRunnerIdle();
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
      assertThat(snapshot.video().status()).isEqualTo(VideoEvidence.AVAILABLE);
      ResponseEntity<byte[]> firstRange =
          executionVideoService.read(executionId, false, "bytes=0-31", owner);
      assertThat(firstRange.getStatusCode().value()).isEqualTo(206);
      assertThat(firstRange.getBody()).hasSize(32);
      assertThat(firstRange.getHeaders().getFirst("Content-Range")).startsWith("bytes 0-31/");
    }
  }

  // ── Legs 5 – 10: Stop, with a real browser (Studio v1 WP12) ─────────────────

  /** The plan's co-run bound on API cancel → ledger {@code DONE} for a live runner (§2.7). */
  private static final Duration CANCEL_PATH_BOUND = Duration.ofSeconds(25);

  /**
   * The stalling test's runtime and step budget. Must stay at or below the runner's {@code
   * STUDIO_RUNNER_MAX_STEP_TIMEOUT_MS} ({@link RunnerProcess}) and its default total-runtime
   * ceiling (120 s), or the runner clamps it back down.
   */
  private static final int STALL_BUDGET_SECONDS = 120;

  /** How long a pid observed before the kill is given to disappear once the run is settled. */
  private static final Duration PIDS_GONE_WITHIN = Duration.ofSeconds(30);

  /**
   * Leg 5: a run stalled inside Chromium is stopped by the runner's <b>control read</b> alone.
   *
   * <p>The dispatcher's relay is deliberately not driven, so no {@code DELETE} is ever sent;
   * nothing reports progress while step 1's navigation hangs, so no acknowledgement can carry the
   * flag either. If this leg is green the poll is what stopped the run, and the runner's own {@code
   * run.cancel_requested} line is asserted to say {@code source: control} rather than assumed to.
   */
  @Test
  @Order(5)
  void aLiveMidStepRunIsStoppedByTheControlReadAloneAfterAnHttpCancel() throws IOException {
    StalledRun run = startStalledRun("Co-run cancel: control read");
    try {
      long cancelAt = System.nanoTime();
      ResponseEntity<String> answer = cancelOverHttp(run.executionId());
      assertCancelAccepted(answer, "RUNNING");
      // No dispatchOnce() here: the relay is not driven, so only the runner's own reads carry it.

      Timings timings = awaitCancelSettled(run, cancelAt, "control");

      assertThat(ledgerColumn(run.executionId(), "cancel_relayed_at"))
          .as("no DELETE was relayed — the relay was never driven in this leg")
          .isNull();
      Optional<CallbackProxy.Call> read = proxy.controlReadThatSaidCancel(run.executionId());
      assertThat(read)
          .as("the runner's control read must have been answered cancelRequested: true")
          .isPresent();
      assertHonestCancel(run, timings, "5 (control read)");
    } finally {
      settleOrForce(run.executionId(), run.pids());
    }
  }

  /**
   * Leg 6: the same stalled run, stopped by the <b>DELETE relay</b>.
   *
   * <p>{@link #startStalledRun} returns just after one of the runner's control reads has been
   * answered, and the relay is driven straight after the cancel, so the {@code DELETE} reaches the
   * owning pod most of a poll interval before the next read could. The runner's line must then say
   * {@code source: delete}, and the relay must be recorded on the ledger.
   */
  @Test
  @Order(6)
  void aLiveMidStepRunIsStoppedByTheDeleteRelayTheDispatcherSends() throws IOException {
    StalledRun run = startStalledRun("Co-run cancel: DELETE relay");
    try {
      long cancelAt = System.nanoTime();
      ResponseEntity<String> answer = cancelOverHttp(run.executionId());
      dispatcher.dispatchOnce();
      long relayedAt = System.nanoTime();
      assertCancelAccepted(answer, "RUNNING");
      assertThat(ledgerColumn(run.executionId(), "cancel_relayed_at"))
          .as("the dispatcher's relay must have reached the runner and been acknowledged 202")
          .isNotNull();

      Timings timings = awaitCancelSettled(run, cancelAt, "delete");
      System.out.println(
          "[co-run] leg 6: cancel -> DELETE acknowledged " + millis(relayedAt - cancelAt) + " ms");
      assertHonestCancel(run, timings, "6 (DELETE relay)");
    } finally {
      settleOrForce(run.executionId(), run.pids());
    }
  }

  /**
   * Leg 7: a cancel of a run nobody has dispatched yet is closed by the API alone, and no browser
   * is ever launched for it.
   *
   * <p>"No POST /v1/runs" is read off the ledger rather than the runner: {@code attempt_id} is
   * written by the statement that begins a send and by nothing else, so a row that is {@code DONE}
   * with no attempt was never sent. The runner's side is corroborated by its silence — no callback
   * and no log line for this execution — and by no browser process appearing while the dispatcher
   * is driven twice.
   */
  @Test
  @Order(7)
  void aQueuedCancelIsClosedByTheApiAndNoBrowserIsEverLaunched() throws IOException {
    UUID testId = confirmedStallTest("Co-run cancel: queued");
    awaitRunnerIdle();
    int blackHoleBefore = blackHole.requests();
    long mark = runner.logMark();
    UUID executionId = studioService.executeTest(testId, owner, null).executionId();

    try (PidSampler sampler = PidSampler.start()) {
      ResponseEntity<String> answer = cancelOverHttp(executionId);
      assertCancelAccepted(answer, "ERROR");
      assertThat(readTree(answer.getBody()).path("errorCode").asText()).isEqualTo("CANCELLED");

      assertThat(dispatcher.dispatchOnce()).as("nothing is left to dispatch").isZero();
      assertThat(dispatcher.dispatchOnce()).isZero();
      // A bounded observation window: long enough for a wrongly-sent job to launch a browser.
      pauseFor(Duration.ofSeconds(3));

      assertThat(ledgerState(executionId)).isEqualTo("DONE");
      assertThat(ledgerColumn(executionId, "attempt_id"))
          .as("no send ever began, so no POST /v1/runs was made for it")
          .isNull();
      assertThat(proxy.callsFor(executionId)).as("the runner never called back for it").isEmpty();
      assertThat(linesAbout(runner.logSince(mark), executionId))
          .as("the runner never heard of it")
          .isEmpty();
      assertThat(sampler.browsers()).as("no browser process appeared").isEmpty();
      assertThat(blackHole.requests()).isEqualTo(blackHoleBefore);
      assertThat(historyColumn(executionId, "error_code")).isEqualTo("CANCELLED");
      assertThat(historyColumn(executionId, "ended_at")).isNotNull();
    }
  }

  /**
   * Leg 8: a cancel recorded <b>between the dispatcher's send and the runner's admission</b>.
   *
   * <p>A real runner answers {@code 202} only after its admission CAS, so this window cannot be hit
   * black-box. The runner's {@code POST …/admission} is held at the callback proxy until the cancel
   * has been recorded over HTTP, then released: the API must refuse it {@code 409}, the runner must
   * release its slot and launch nothing, and the row must close {@code ERROR / CANCELLED} with no
   * admission ever written. The signal here is the admission CAS itself, not any of the three stop
   * signals, so the runner must log no {@code run.cancel_requested} at all.
   */
  @Test
  @Order(8)
  void aCancelBetweenTheSendAndTheAdmissionIsRefusedAdmissionAndNoBrowserStarts() throws Exception {
    UUID testId = confirmedStallTest("Co-run cancel: before admission");
    awaitRunnerIdle();
    int blackHoleBefore = blackHole.requests();
    long mark = runner.logMark();
    UUID executionId = studioService.executeTest(testId, owner, null).executionId();
    CallbackProxy.Hold hold = proxy.holdAdmission(executionId);

    try (PidSampler sampler = PidSampler.start()) {
      CompletableFuture<Integer> send = CompletableFuture.supplyAsync(dispatcher::dispatchOnce);
      try {
        if (!hold.awaitArrival(Duration.ofSeconds(15))) {
          throw new CoRunFailure(
              "studio-runner (POST /v1/runs) or the API's dispatcher",
              "the runner never asked for its admission",
              "ledger " + ledgerState(executionId) + "; runner:\n" + quoted(runner.logSince(mark)));
        }
        assertThat(ledgerState(executionId))
            .as("the send is in flight and the runner is waiting on its admission")
            .isEqualTo("DISPATCHING");
        ResponseEntity<String> answer = cancelOverHttp(executionId);
        assertThat(answer.getStatusCode().value()).isEqualTo(202);
      } finally {
        hold.release();
      }
      send.get(30, TimeUnit.SECONDS);
      pauseFor(Duration.ofSeconds(2));

      CallbackProxy.Call admission =
          proxy.callsFor(executionId).stream()
              .filter(call -> "admission".equals(call.route()))
              .findFirst()
              .orElseThrow(() -> new AssertionError("the held admission was never forwarded"));
      assertThat(admission.status())
          .as("the API must refuse an admission for a row whose cancel is recorded")
          .isEqualTo(409);
      List<String> lines = linesAbout(runner.logSince(mark), executionId);
      assertThat(lines)
          .as("the runner must have recorded the refusal")
          .anyMatch(line -> line.contains("\"event\":\"admission.refused\""));
      assertThat(lines)
          .as("nothing was admitted, so nothing was there to cancel on the runner")
          .noneMatch(line -> line.contains("\"event\":\"admission.admitted\""))
          .noneMatch(line -> line.contains("\"event\":\"run.cancel_requested\""));
      assertThat(ledgerState(executionId)).isEqualTo("DONE");
      assertThat(ledgerColumn(executionId, "admission_id")).as("no admission written").isNull();
      assertThat(historyColumn(executionId, "status")).isEqualTo("ERROR");
      assertThat(historyColumn(executionId, "error_code")).isEqualTo("CANCELLED");
      assertThat(sampler.browsers()).as("no browser was ever launched").isEmpty();
      assertThat(blackHole.requests()).isEqualTo(blackHoleBefore);
      assertThat(scratchEntries()).as("no scratch directory was created").isEmpty();
      awaitRunnerIdle();
    } finally {
      settleOrForce(executionId, List.of());
    }
  }

  /**
   * Leg 9: a cancel recorded <b>right after the admission</b>, relayed at once.
   *
   * <p>Where the runner is when it learns of it is a race — before the launch, while the browser is
   * starting, or already stepping — and all three are correct. The leg records which branch ran
   * (from the {@code FINAL}'s message and whether it carried a browser start) and which signal
   * delivered it, and asserts the invariants that hold on every branch: {@code ERROR / CANCELLED},
   * the {@code FINAL} accepted, the ledger {@code DONE}, every browser pid ever seen gone, and — on
   * the before-launch branch — no browser pid at all and no browser start on the row.
   */
  @Test
  @Order(9)
  void aCancelRightAfterTheAdmissionEndsCancelledOnWhicheverBranchTheRunnerTook()
      throws IOException {
    UUID testId = confirmedStallTest("Co-run cancel: right after admission");
    awaitRunnerIdle();
    long mark = runner.logMark();
    UUID executionId = studioService.executeTest(testId, owner, null).executionId();

    PidSampler sampler = PidSampler.start();
    try {
      dispatcher.dispatchOnce();
      long cancelAt = System.nanoTime();
      ResponseEntity<String> answer = cancelOverHttp(executionId);
      dispatcher.dispatchOnce();
      assertThat(answer.getStatusCode().value()).isEqualTo(202);
      assertThat(ledgerColumn(executionId, "admission_id"))
          .as("the dispatcher's send returns only after the runner's admission CAS")
          .isNotNull();

      StalledRun run = new StalledRun(executionId, mark, List.of());
      Timings timings = awaitCancelSettled(run, cancelAt, null);
      sampler.close();

      CallbackProxy.FinalReport fin = finalOf(executionId);
      String branch =
          fin.errorMessage() != null && fin.errorMessage().contains("before its browser")
              ? "before launch"
              : fin.errorMessage() != null && fin.errorMessage().contains("while its browser")
                  ? "while launching"
                  : "mid-run";
      String source = cancelSource(runner.logSince(mark), executionId);
      System.out.println(
          "[co-run] leg 9: branch=" + branch + ", signal=" + source + ", " + timings.describe());
      assertThat(source)
          .as("within milliseconds of the admission, only the DELETE or a progress ack can win")
          .isIn("delete", "progress-ack");
      if ("before launch".equals(branch)) {
        assertThat(sampler.browsers()).as("before launch: no browser pid, ever").isEmpty();
        assertThat(historyColumn(executionId, "browser_started_at")).isNull();
        assertThat(fin.browserStarted()).isFalse();
      }
      assertOutcomeAndLedger(executionId, timings, "9 (" + branch + ")");
      assertPidsGone(sampler.allPids(), "9 (" + branch + ")");
      awaitRunnerIdle();
    } finally {
      sampler.close();
      settleOrForce(executionId, sampler.allPids());
    }
  }

  /** Leg 10: after every cancel above, the pod is still a working pod. */
  @Test
  @Order(10)
  void aTrivialPassingTestStillRunsToPassedAfterEveryCancel() throws IOException {
    runATrivialPassingTestToPassed("Co-run passing test after the cancels");
  }

  // ── cancel-leg machinery ──────────────────────────────────────────────────

  /** A dispatched run that is alive inside step 1's navigation, and what was observed of it. */
  private record StalledRun(UUID executionId, long logMark, List<Long> pids) {}

  /** The cancel path, hop by hop, on this JVM's monotonic clock. {@code -1} = not observed. */
  private record Timings(long cancelAt, long observedAt, long finalAt, long doneAt) {

    long cancelToDoneMillis() {
      return millis(doneAt - cancelAt);
    }

    String describe() {
      return "cancel -> control read said cancel "
          + (observedAt < 0 ? "n/a" : millis(observedAt - cancelAt) + " ms")
          + ", cancel -> FINAL at the API "
          + (finalAt < 0 ? "n/a" : millis(finalAt - cancelAt) + " ms")
          + ", cancel -> ledger DONE "
          + cancelToDoneMillis()
          + " ms";
    }
  }

  /**
   * Compiles, confirms and dispatches the stalling test, and returns once its browser is inside
   * step 1's navigation with its pids snapshotted.
   */
  private StalledRun startStalledRun(String name) throws IOException {
    UUID testId = confirmedStallTest(name);
    awaitRunnerIdle();
    int blackHoleBefore = blackHole.requests();
    long mark = runner.logMark();
    UUID executionId = studioService.executeTest(testId, owner, null).executionId();
    int dispatched = dispatcher.dispatchOnce();
    if (dispatched != 1 || awaitAdmission(executionId) == null) {
      throw new CoRunFailure(
          "studio-runner (POST /v1/runs), as reached by the API's HttpRunnerDispatchClient",
          "the stalling run was never admitted — ledger " + ledgerState(executionId),
          whatTheRunnerSaidAboutTheDispatch(runner.logSince(mark)));
    }

    long deadline = System.nanoTime() + Duration.ofSeconds(30).toNanos();
    List<RunnerProcess.Descendant> seen = List.of();
    while (System.nanoTime() < deadline) {
      seen = runner.descendants();
      boolean inStep1 = blackHole.requests() > blackHoleBefore;
      boolean browser = seen.stream().anyMatch(RunnerProcess.Descendant::isBrowser);
      ExecutionSnapshotDto snapshot = studioService.findExecutionById(executionId, owner);
      boolean step1Applied =
          snapshot.stepResults() != null
              && snapshot.stepResults().stream()
                  .anyMatch(step -> step.stepIndex() == 1 && "RUNNING".equals(step.status()));
      if (inStep1 && browser && "RUNNING".equals(snapshot.status()) && step1Applied) {
        // Quiet from here: the API has applied the report that step 1 began, and a stalled
        // navigation sends nothing more until the kill, so no progress acknowledgement is in
        // flight to carry the cancel. Measured, not assumed: without this wait the step reports
        // were still being delivered when the cancel landed, and an ack won the race. Placing the
        // cancel just after a control read also puts the next read a full interval away.
        awaitAControlReadAfter(executionId, System.nanoTime());
        List<Long> pids = seen.stream().map(RunnerProcess.Descendant::pid).toList();
        System.out.println("[co-run] " + name + ": pids before the kill " + seen);
        return new StalledRun(executionId, mark, pids);
      }
      pause();
    }
    StalledRun partial =
        new StalledRun(
            executionId, mark, seen.stream().map(RunnerProcess.Descendant::pid).toList());
    settleOrForce(executionId, partial.pids());
    throw new CoRunFailure(
        "studio-runner (the run under test)",
        "the stalling run never reached its stalled step with a live browser",
        "black-hole requests="
            + (blackHole.requests() - blackHoleBefore)
            + ", descendants="
            + seen
            + ", execution "
            + studioService.findExecutionById(executionId, owner).status()
            + "; runner:\n"
            + quoted(runner.logSince(mark)));
  }

  /** A confirmed test whose step 1 navigates to the black hole and waits two minutes for it. */
  private UUID confirmedStallTest(String name) throws IOException {
    String loadLine = "Go to " + cancelFixture.url();
    String stallLine = "Go to " + blackHole.url();
    UUID testId = fixtures.seedTest(name, CSI_ID, OWNER, List.of(loadLine, stallLine));
    // The test's timeoutSeconds is both the job's browser runtime budget and its step timeout. At
    // the seeded 30 s the run would end on its own half a minute in, and a leg whose signal never
    // arrived would go red as a timeout verdict rather than as "the cancel never landed". 120 s is
    // twice the longest wait in any leg; the runner's step-timeout ceiling is raised to match.
    jdbc.update(
        "UPDATE ui_tests SET timeout_seconds = ? WHERE id = ?", STALL_BUDGET_SECONDS, testId);
    com.fasterxml.jackson.databind.node.ObjectNode root = MAPPER.createObjectNode();
    root.put("version", 1);
    com.fasterxml.jackson.databind.node.ArrayNode steps = root.putArray("steps");
    steps
        .addObject()
        .put("stepIndex", 0)
        .put("originalText", loadLine)
        .put("code", "await page.goto('" + cancelFixture.url() + "');");
    // Far above every bound in the leg, so nothing but the cancel can end the run.
    steps
        .addObject()
        .put("stepIndex", 1)
        .put("originalText", stallLine)
        .put("code", "await page.goto('" + blackHole.url() + "', { timeout: 120000 });");
    gateway.answerWith(root.toString());

    pipeline.compile(testId, OWNER);
    awaitCompileStatusIn(testId, Set.of("AWAITING_CONFIRMATION", "NEEDS_REVISION", "STALE"));
    if (!"AWAITING_CONFIRMATION".equals(compileStatus(testId))) {
      throw new CoRunFailure(
          "co-run harness or studio-runner (POST /v1/validate)",
          "the stalling test did not become confirmable — compile_status is "
              + compileStatus(testId),
          "compile_error=" + compileError(testId));
    }
    UUID candidate = candidateRevisionId(testId);
    states.confirm(
        testId,
        candidate,
        artifactHash(candidate),
        sourceRevision(testId),
        configurationRevision(testId),
        OWNER);
    return testId;
  }

  /** The public route, over HTTP, as the Studio page's Stop button calls it. */
  private ResponseEntity<String> cancelOverHttp(UUID executionId) {
    return restTemplate.exchange(
        "/api/v1/studio/executions/" + executionId + "/cancel",
        HttpMethod.POST,
        new HttpEntity<>(VideoEvidenceFixtures.identity(OWNER, "", CSI_ID + ":owner")),
        String.class);
  }

  private void assertCancelAccepted(ResponseEntity<String> answer, String status)
      throws IOException {
    assertThat(answer.getStatusCode().value())
        .as("POST …/cancel answered %s", answer.getBody())
        .isEqualTo(202);
    assertThat(readTree(answer.getBody()).path("status").asText())
        .as("the 202 carries the snapshot as committed")
        .isEqualTo(status);
  }

  /**
   * Waits for the cancel to settle, driving the running reaper on every poll exactly as a worker's
   * schedule would, and times it.
   *
   * <p>Driving the reaper is the point, not a convenience: it is a backstop, and a backstop that
   * closed the row before a healthy runner's {@code FINAL} landed would show up below as a {@code
   * FINAL} refused {@code 409 EXECUTION_SETTLED}. The margin itself is pinned by {@code
   * RunnerCancelBudgetTest}; this is where it meets a real runner.
   *
   * @param expectedSource the {@code run.cancel_requested} source this leg exercises, or {@code
   *     null} when the leg records it instead
   */
  private Timings awaitCancelSettled(StalledRun run, long cancelAt, String expectedSource) {
    UUID executionId = run.executionId();
    long deadline = System.nanoTime() + Duration.ofSeconds(60).toNanos();
    long doneAt = -1;
    while (System.nanoTime() < deadline) {
      runningReaper.reapOnce();
      if ("DONE".equals(ledgerState(executionId))) {
        doneAt = System.nanoTime();
        break;
      }
      pause();
    }
    List<String> lines = runner.logSince(run.logMark());
    if (doneAt < 0) {
      throw new CoRunFailure(
          "studio-runner (the cancelled run) or the API's terminal report handling",
          "the cancelled run did not settle within 60 s — ledger "
              + ledgerState(executionId)
              + ", execution "
              + historyColumn(executionId, "status"),
          "calls the runner made: "
              + describeCalls(executionId)
              + "; runner:\n"
              + quoted(linesAbout(lines, executionId)));
    }
    // DONE is committed inside the API's handling of the FINAL, and the proxy records the call
    // once it has relayed the answer, so give the record a moment before reading its absence.
    long finalDeadline = System.nanoTime() + Duration.ofSeconds(2).toNanos();
    while (proxy.finalReport(executionId).isEmpty() && System.nanoTime() < finalDeadline) {
      pauseFor(Duration.ofMillis(20));
    }
    if (proxy.finalReport(executionId).isEmpty()) {
      throw new CoRunFailure(
          "put-checks API (the running reaper, driven on every poll of this wait)",
          "the ledger reached DONE without the runner's FINAL — something other than the runner"
              + " closed a cancel a live runner was still finishing; execution "
              + historyColumn(executionId, "status")
              + "/"
              + historyColumn(executionId, "error_code")
              + ", reaper cancel margin "
              + runningReaper.cancelMargin(),
          "calls the runner made: "
              + describeCalls(executionId)
              + "; runner:\n"
              + quoted(linesAbout(lines, executionId)));
    }
    long observedAt =
        proxy
            .controlReadThatSaidCancel(executionId)
            .map(CallbackProxy.Call::answeredAtNanos)
            .orElse(-1L);
    long finalAt =
        proxy.finalReport(executionId).map(CallbackProxy.Call::receivedAtNanos).orElse(-1L);
    Timings timings = new Timings(cancelAt, observedAt, finalAt, doneAt);
    if (expectedSource != null) {
      String source = cancelSource(lines, executionId);
      assertThat(source)
          .as(
              "the runner's run.cancel_requested line names the signal this leg exercises; calls: %s",
              describeCalls(executionId))
          .isEqualTo(expectedSource);
    }
    return timings;
  }

  /** Outcome, ledger, delivery and timing: what every cancel of an admitted run must end with. */
  private void assertOutcomeAndLedger(UUID executionId, Timings timings, String leg) {
    System.out.println(
        "[co-run] leg "
            + leg
            + ": "
            + timings.describe()
            + "; reaper cancel margin "
            + runningReaper.cancelMargin().toSeconds()
            + " s, healthy-runner worst case "
            + cancelBudget.worstCase().toSeconds()
            + " s");
    CallbackProxy.Call fin =
        proxy
            .finalReport(executionId)
            .orElseThrow(
                () ->
                    new CoRunFailure(
                        "studio-runner",
                        "the cancelled run settled but its FINAL never reached the API",
                        "calls: " + describeCalls(executionId)));
    assertThat(fin.status())
        .as("the runner's FINAL must be ACCEPTED — a 409 means the reaper closed the row under it")
        .isBetween(200, 299);
    assertThat(fin.finalReport().result()).isEqualTo("ERROR");
    assertThat(fin.finalReport().errorCode()).isEqualTo("CANCELLED");
    assertThat(historyColumn(executionId, "status")).isEqualTo("ERROR");
    assertThat(historyColumn(executionId, "error_code")).isEqualTo("CANCELLED");
    assertThat(historyColumn(executionId, "ended_at")).as("a settled run has an end").isNotNull();
    assertThat(ledgerState(executionId)).isEqualTo("DONE");
    assertThat(linesAbout(runner.logSince(0), executionId))
        .as("the runner recorded its terminal delivery")
        .anyMatch(line -> line.contains("\"event\":\"report.terminal_delivered\""));
    assertThat(Duration.ofMillis(timings.cancelToDoneMillis()))
        .as("API cancel -> ledger DONE, against the plan's co-run bound")
        .isLessThanOrEqualTo(CANCEL_PATH_BOUND)
        .as("and it must finish well inside the reaper's margin, or the reaper races it")
        .isLessThan(runningReaper.cancelMargin());
  }

  /**
   * Everything a mid-step cancel must leave behind: the outcome, the ledger, no browser process, an
   * evidence disposition on the row that is the one the runner reported, and an idle pod.
   *
   * <p>The persisted row and the runner's own object directory decide honesty here. The passing leg
   * separately proves the API's local provider reads that same directory through the media route; a
   * cancelled recording may legitimately be partial or unavailable.
   */
  private void assertHonestCancel(StalledRun run, Timings timings, String leg) throws IOException {
    UUID executionId = run.executionId();
    assertOutcomeAndLedger(executionId, timings, leg);
    assertPidsGone(run.pids(), leg);

    CallbackProxy.FinalReport fin = finalOf(executionId);
    assertThat(historyColumn(executionId, "video_status"))
        .as("the row's video status is the projection of what the runner reported (%s)", fin)
        .isEqualTo(videoStatusFor(fin.evidenceState()));
    assertThat(historyColumn(executionId, "video_partial"))
        .as("partial is carried from the runner, never recomputed")
        .isEqualTo(String.valueOf(Boolean.TRUE.equals(fin.evidencePartial())));
    assertThat(historyColumn(executionId, "video_key")).isEqualTo(fin.videoKey());
    if ("STORED".equals(fin.evidenceState())) {
      Path object = ENVIRONMENT.objectStoreDir().resolve(fin.videoKey());
      assertThat(object).as("STORED must mean an object exists in the runner's store").exists();
      assertThat(Files.size(object)).as("and it is not empty").isPositive();
    }
    System.out.println(
        "[co-run] leg "
            + leg
            + ": evidence "
            + fin.evidenceState()
            + " partial="
            + fin.evidencePartial());
    awaitRunnerIdle();
  }

  private CallbackProxy.FinalReport finalOf(UUID executionId) {
    return proxy
        .finalReport(executionId)
        .orElseThrow(
            () ->
                new CoRunFailure(
                    "studio-runner",
                    "no FINAL reached the API for " + executionId,
                    "calls: " + describeCalls(executionId)))
        .finalReport();
  }

  /**
   * Each pid observed while the run was alive must be gone; survivors are killed, then reported.
   */
  private static void assertPidsGone(Collection<Long> pids, String leg) {
    long deadline = System.nanoTime() + PIDS_GONE_WITHIN.toNanos();
    List<Long> alive = pids.stream().filter(RunnerProcess::isAlive).toList();
    while (!alive.isEmpty() && System.nanoTime() < deadline) {
      pause();
      alive = alive.stream().filter(RunnerProcess::isAlive).toList();
    }
    if (!alive.isEmpty()) {
      List<Long> killed = RunnerProcess.destroyForcibly(alive);
      throw new CoRunFailure(
          "studio-runner (process-tree cleanup)",
          "leg "
              + leg
              + ": processes observed before the kill were still alive "
              + PIDS_GONE_WITHIN
              + " after the run settled",
          "surviving pids " + killed + " (now killed by the harness)");
    }
  }

  /**
   * Leaves the runner free for the next leg whatever happened: cancels an unsettled row, waits a
   * bounded time for it, and kills any snapshotted pid still alive.
   */
  private void settleOrForce(UUID executionId, Collection<Long> pids) {
    if (!"DONE".equals(ledgerState(executionId))) {
      try {
        studioService.cancelExecution(executionId, owner);
      } catch (RuntimeException alreadyAsked) {
        // 409: already cancelled or already settled — either way nothing more to ask for.
      }
      dispatcher.dispatchOnce();
      long deadline = System.nanoTime() + Duration.ofSeconds(30).toNanos();
      while (System.nanoTime() < deadline && !"DONE".equals(ledgerState(executionId))) {
        pause();
      }
    }
    List<Long> killed = RunnerProcess.destroyForcibly(pids);
    if (!killed.isEmpty()) {
      System.err.println("[co-run] teardown killed surviving pids " + killed);
    }
  }

  /** Waits until a control read for {@code executionId} is answered at or after {@code since}. */
  private void awaitAControlReadAfter(UUID executionId, long since) {
    long deadline = System.nanoTime() + Duration.ofSeconds(10).toNanos();
    while (System.nanoTime() < deadline) {
      if (proxy.controlReadSince(executionId, since).isPresent()) {
        return;
      }
      pauseFor(Duration.ofMillis(20));
    }
    throw new CoRunFailure(
        "studio-runner (control poll)",
        "no control read for a live run within 10 s",
        "calls: " + describeCalls(executionId));
  }

  /** Blocks until the runner reports no slot in use, so the next dispatch cannot be a 429. */
  private void awaitRunnerIdle() {
    long deadline = System.nanoTime() + Duration.ofSeconds(60).toNanos();
    RunnerProcess.Probe last = new RunnerProcess.Probe(-1, "never attempted");
    while (System.nanoTime() < deadline) {
      last = runner.probe("GET", "/ready", ENVIRONMENT.runnerServiceToken(), null);
      if (last.status() == 200 && last.body().contains("\"inUse\":0")) {
        return;
      }
      pause();
    }
    throw new CoRunFailure(
        "studio-runner", "never became idle within 60 s", "GET /ready answered " + last);
  }

  /**
   * The runner's {@code run.cancel_requested} source for this execution; exactly one is required.
   */
  private static String cancelSource(List<String> lines, UUID executionId) {
    Pattern source = Pattern.compile("\"source\":\"([a-z-]+)\"");
    List<String> sources = new ArrayList<>();
    for (String line : linesAbout(lines, executionId)) {
      if (line.contains("\"event\":\"run.cancel_requested\"")) {
        Matcher matcher = source.matcher(line);
        sources.add(matcher.find() ? matcher.group(1) : "?");
      }
    }
    assertThat(sources)
        .as("the runner must record exactly one cancel request for the run, whatever the signal")
        .hasSize(1);
    return sources.get(0);
  }

  private static List<String> linesAbout(List<String> lines, UUID executionId) {
    String id = "\"executionId\":\"" + executionId + "\"";
    return lines.stream().filter(line -> line.contains(id)).toList();
  }

  private String describeCalls(UUID executionId) {
    Map<String, Integer> counts = new LinkedHashMap<>();
    for (CallbackProxy.Call call : proxy.callsFor(executionId)) {
      String key =
          call.route()
              + (call.reportKind() == null ? "" : ":" + call.reportKind())
              + "→"
              + call.status()
              + (Boolean.TRUE.equals(call.cancelRequested()) ? "(cancel)" : "");
      counts.merge(key, 1, Integer::sum);
    }
    return counts.toString();
  }

  private static String videoStatusFor(String evidenceState) {
    return switch (String.valueOf(evidenceState)) {
      case "PENDING" -> "PROCESSING";
      case "STORED" -> "AVAILABLE";
      case "FAILED" -> "FAILED";
      case "UNAVAILABLE" -> "UNAVAILABLE";
      default -> "(runner reported " + evidenceState + ")";
    };
  }

  private List<Path> scratchEntries() throws IOException {
    if (!Files.isDirectory(ENVIRONMENT.scratchDir())) {
      return List.of();
    }
    try (var entries = Files.list(ENVIRONMENT.scratchDir())) {
      return entries.toList();
    }
  }

  private static JsonNode readTree(String body) throws IOException {
    return MAPPER.readTree(body == null ? "{}" : body);
  }

  private static long millis(long nanos) {
    return TimeUnit.NANOSECONDS.toMillis(nanos);
  }

  private String ledgerColumn(UUID executionId, String column) {
    List<String> values =
        jdbc.queryForList(
            "SELECT " + column + "::text FROM studio_dispatch_ledger WHERE execution_id = ?",
            String.class,
            executionId);
    return values.isEmpty() ? null : values.get(0);
  }

  private String historyColumn(UUID executionId, String column) {
    List<String> values =
        jdbc.queryForList(
            "SELECT " + column + "::text FROM ui_test_executions WHERE id = ?",
            String.class,
            executionId);
    return values.isEmpty() ? null : values.get(0);
  }

  /**
   * Samples the runner's descendants every 50 ms until closed, so a browser that lived for less
   * than a leg's own checks still counts as having existed.
   */
  private static final class PidSampler implements AutoCloseable {

    private final Map<Long, RunnerProcess.Descendant> seen = new ConcurrentHashMap<>();
    private final Thread thread;
    private volatile boolean running = true;

    private PidSampler() {
      this.thread =
          new Thread(
              () -> {
                while (running) {
                  runner.descendants().forEach(d -> seen.putIfAbsent(d.pid(), d));
                  try {
                    Thread.sleep(50L);
                  } catch (InterruptedException e) {
                    return;
                  }
                }
              },
              "corun-pid-sampler");
      this.thread.setDaemon(true);
    }

    static PidSampler start() {
      PidSampler sampler = new PidSampler();
      sampler.thread.start();
      return sampler;
    }

    List<RunnerProcess.Descendant> browsers() {
      return seen.values().stream().filter(RunnerProcess.Descendant::isBrowser).toList();
    }

    List<Long> allPids() {
      return List.copyOf(seen.keySet());
    }

    @Override
    public void close() {
      running = false;
      try {
        thread.join(1_000L);
      } catch (InterruptedException e) {
        Thread.currentThread().interrupt();
      }
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
    List<String> shown = lines.size() > 80 ? lines.subList(lines.size() - 80, lines.size()) : lines;
    return String.join("\n", shown.stream().map(line -> "    " + line).toList());
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
    pauseFor(Duration.ofMillis(100));
  }

  /**
   * A bounded wait. Every caller either polls a condition under a deadline or observes a window.
   */
  private static void pauseFor(Duration duration) {
    try {
      Thread.sleep(duration.toMillis());
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
