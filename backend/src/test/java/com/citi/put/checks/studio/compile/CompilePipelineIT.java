package com.citi.put.checks.studio.compile;

import static com.github.tomakehurst.wiremock.client.WireMock.aResponse;
import static com.github.tomakehurst.wiremock.client.WireMock.post;
import static com.github.tomakehurst.wiremock.client.WireMock.postRequestedFor;
import static com.github.tomakehurst.wiremock.client.WireMock.urlEqualTo;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.citi.put.checks.studio.StudioConflictException;
import com.citi.put.checks.studio.StudioExecutionFixtures;
import com.citi.put.checks.studio.StudioService;
import com.citi.put.checks.studio.StudioValidationException;
import com.citi.put.checks.studio.compile.gateway.CompileResponse;
import com.citi.put.checks.studio.compile.gateway.GatewayErrorCode;
import com.citi.put.checks.studio.compile.gateway.GatewayOutcome;
import com.citi.put.checks.studio.compile.gateway.GatewayProvenance;
import com.citi.put.checks.studio.compile.gateway.LlmGatewayClient;
import com.citi.put.checks.studio.dto.AuthoringStep;
import com.citi.put.checks.studio.dto.AuthoringV2Request;
import com.citi.put.checks.studio.dto.GlobalAuthoringContext;
import com.citi.put.checks.studio.dto.StepAuthoringContext;
import com.citi.put.checks.studio.dto.UITestDto;
import com.citi.put.checks.studio.dto.UITestRequest;
import com.citi.put.checks.studio.readiness.ExecutionReadinessService;
import com.citi.put.checks.studio.readiness.ReadinessVerdict;
import com.citi.put.checks.studio.secrets.FakeStudioVaultProvider;
import com.citi.put.checks.studio.secrets.StudioVaultProvider;
import com.citi.put.checks.studio.secrets.VaultScope;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.github.tomakehurst.wiremock.WireMockServer;
import com.github.tomakehurst.wiremock.core.WireMockConfiguration;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.sql.Timestamp;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.stream.Stream;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Primary;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;
import org.testcontainers.junit.jupiter.Testcontainers;

/**
 * Story 10.8 AC-2, AC-3, AC-4, AC-11a, AC-14, AC-17, AC-21, AC-27 — the pipeline against a real
 * PostgreSQL in a container, with a gateway that can be held open.
 *
 * <p>The concurrency cases here are proved by <b>holding state open and interleaving</b>, not by
 * sequential happy-path calls: a gateway stub blocks until the test releases it, so two attempts
 * are genuinely in flight at the same time and the ordering under test is the one asserted rather
 * than whichever the scheduler happened to produce.
 */
@SpringBootTest
@ActiveProfiles("test")
@Testcontainers(disabledWithoutDocker = true)
class CompilePipelineIT {

  private static final ObjectMapper MAPPER = new ObjectMapper();
  private static final String OWNER = "pipeline-it-owner@citi.com";
  private static final String CSI_ID = "60404";
  private static final List<String> STEPS =
      List.of("Go to \"https://example.com/login\"", "Click the \"Sign in\" button");

  private static WireMockServer runner;

  static {
    runner = new WireMockServer(WireMockConfiguration.options().dynamicPort());
    runner.start();
  }

  /** A gateway that can be held open per compile request, and whose answer the test chooses. */
  static final class BlockingGateway implements LlmGatewayClient {

    private final ConcurrentHashMap<String, CountDownLatch> gates = new ConcurrentHashMap<>();
    private final ConcurrentHashMap<String, String> answers = new ConcurrentHashMap<>();
    private final List<String> order = new java.util.concurrent.CopyOnWriteArrayList<>();
    private final AtomicInteger calls = new AtomicInteger();
    private volatile boolean failing;
    private volatile CountDownLatch blockAll;
    private volatile CountDownLatch entered;
    private volatile String defaultAnswer;

    @Override
    public CompileResponse propose(
        com.citi.put.checks.studio.compile.gateway.CompileRequest request) {
      calls.incrementAndGet();
      order.add(request.compileRequestId());
      CountDownLatch all = blockAll;
      if (all != null) {
        if (entered != null) {
          entered.countDown();
        }
        awaitQuietly(all);
      }
      CountDownLatch gate = gates.get(request.compileRequestId());
      if (gate != null) {
        awaitQuietly(gate);
      }
      if (failing) {
        return CompileResponse.failure(
            GatewayOutcome.TRANSPORT,
            GatewayErrorCode.GATEWAY_TRANSPORT,
            "stub outage",
            null,
            2,
            3L,
            0,
            0);
      }
      String fallback = defaultAnswer == null ? artifactFor(STEPS, "a") : defaultAnswer;
      String artifact = answers.getOrDefault(request.compileRequestId(), fallback);
      return CompileResponse.ok(
          ProposalFixtures.envelope(request, artifact),
          new GatewayProvenance(
              "stub-model@1", "001", CompilePins.PROMPT_VERSION, "1.52.0", true, 0),
          0,
          9L,
          10,
          20);
    }

    void reset() {
      gates.clear();
      answers.clear();
      order.clear();
      calls.set(0);
      failing = false;
      blockAll = null;
      entered = null;
      defaultAnswer = null;
    }
  }

  /**
   * A vault that records every call and can be made to throw (story 10.17 AC-11).
   *
   * <p>§4.3 is explicit — <em>"Never supply resolved values or dump request bodies into gateway
   * audit logs"</em> — and story 10.8 AC-5 asserted it against a stub whose "value" came from the
   * platform {@code secrets} table. Story 10.17 changes where values come from, so the assertion is
   * re-made against the new source, and made structural rather than incidental: put into {@link
   * #throwing} mode, every method fails, and the compile pipeline completes anyway. A pipeline that
   * had acquired a dependency on the vault could not do that.
   */
  static final class RecordingVault implements StudioVaultProvider {

    private final FakeStudioVaultProvider delegate =
        new FakeStudioVaultProvider(java.util.Map.of());
    private final List<String> calls = new java.util.concurrent.CopyOnWriteArrayList<>();
    private volatile boolean throwing;

    @Override
    public String name() {
      if (throwing) {
        throw new IllegalStateException("the compile path reached the vault");
      }
      return delegate.name();
    }

    @Override
    public java.util.Optional<VaultEntry> read(
        ReferenceKind kind, VaultScope scope, String referenceName) {
      calls.add(kind + ":" + scope + ":" + referenceName);
      if (throwing) {
        throw new IllegalStateException("the compile path reached the vault");
      }
      return delegate.read(kind, scope, referenceName);
    }

    @Override
    public String create(VaultScope scope, String name, char[] value, List<String> origins) {
      calls.add("create:" + scope + ":" + name);
      if (throwing) {
        throw new IllegalStateException("the compile path reached the vault");
      }
      return delegate.create(scope, name, value, origins);
    }

    @Override
    public List<String> listSecretNames(VaultScope scope) {
      calls.add("list:" + scope);
      if (throwing) {
        throw new IllegalStateException("the compile path reached the vault");
      }
      return delegate.listSecretNames(scope);
    }

    void seed(VaultScope scope, String referenceName, String value) {
      delegate.rotate(ReferenceKind.SECRET, scope, referenceName, value);
    }

    void reset() {
      delegate.clear();
      calls.clear();
      throwing = false;
    }
  }

  @TestConfiguration
  static class Stubs {
    @Bean
    @Primary
    BlockingGateway blockingGateway() {
      return new BlockingGateway();
    }

    @Bean
    @Primary
    RecordingVault recordingVault() {
      return new RecordingVault();
    }
  }

  @DynamicPropertySource
  static void runnerUrl(DynamicPropertyRegistry registry) {
    registry.add("studio.runner.base-url", () -> "http://localhost:" + runner.port());
    registry.add("studio.runner.service-identity-token", () -> "it-service-identity");
  }

  @AfterAll
  static void stopRunner() {
    runner.stop();
  }

  @Autowired private CompilePipeline pipeline;
  @Autowired private StudioService studioService;
  @Autowired private CompileStateService states;
  @Autowired private ExecutionReadinessService readiness;
  @Autowired private BlockingGateway gateway;
  @Autowired private RecordingVault vault;
  @Autowired private JdbcTemplate jdbc;
  @Autowired private PlatformTransactionManager transactionManager;
  @Autowired private StudioCompileProperties compileProperties;

  private TransactionTemplate transactions;
  private UUID testId;

  @BeforeEach
  void setUp() {
    transactions = new TransactionTemplate(transactionManager);
    runner.resetAll();
    stubValidatorAccepting();
    gateway.reset();
    vault.reset();
    seedUser();
    seedCsi();
    testId = seedTest(STEPS);
  }

  // ── AC-2: the draft is committed before any compile work begins ───────────

  @Test
  void theDraftIsCommittedAndReadableFromASecondConnectionWhileTheCompileIsStillInFlight()
      throws Exception {
    CountDownLatch release = new CountDownLatch(1);
    CountDownLatch inGateway = new CountDownLatch(1);
    gateway.blockAll = release;
    gateway.entered = inGateway;

    UUID id = UUID.randomUUID();
    long before = System.nanoTime();
    transactions.executeWithoutResult(
        status -> {
          insertDraft(id, STEPS);
          assertThat(gateway.calls.get())
              .as("saving reaches no gateway at all: the compile is a separate, later request")
              .isZero();
        });
    long saveMs = (System.nanoTime() - before) / 1_000_000L;
    // Run asks for the preparation after the draft's transaction has committed. That ordering is
    // the property; it used to be produced by an after-commit hook on save, and is now produced by
    // the compile route being a second request.
    pipeline.compile(id, OWNER);

    assertThat(inGateway.await(20, TimeUnit.SECONDS))
        .as("the compile must have started after the commit")
        .isTrue();
    assertThat(saveMs)
        .as("the save must return without reaching the gateway at all (§8.3)")
        .isLessThan(5_000L);

    // A second connection, outside the saving transaction, can see the committed row while the
    // compile is still blocked in the gateway.
    try (var connection = jdbc.getDataSource().getConnection();
        var statement = connection.prepareStatement("SELECT name FROM ui_tests WHERE id = ?")) {
      statement.setObject(1, id);
      try (var rows = statement.executeQuery()) {
        assertThat(rows.next()).as("the draft is committed and visible elsewhere").isTrue();
      }
    }
    assertThat(compileStatus(id)).isEqualTo("COMPILING");

    release.countDown();
    awaitCompileStatus(id, "READY");
  }

  /**
   * AC-2, T-10.8.1 — <b>the save routes compile nothing</b>, and the Run action's compile does.
   *
   * <p>This test used to assert the opposite, because saving registered an after-commit compile.
   * That charged the author a gateway call for every save they made, hid the cost behind a status
   * they had not asked to change, and — when the attempt failed — left the draft {@code STALE} with
   * no way to ask again, since re-saving identical content is not a change and enqueued nothing. It
   * drives the service methods and asserts no attempt started for the draft they saved.
   */
  @Test
  void savingADraftThroughTheServiceStartsNoCompile() {
    UITestDto created =
        studioService.createTest(draftRequest("No compile on create", null, null), owner());
    assertThat(compileStatus(created.id())).isEqualTo("STALE");
    assertThat(gateway.calls.get()).as("create reaches no gateway at all").isZero();
    assertThat(readiness.evaluate(created.id()).ready())
        .as("a saved draft with no artifact is not runnable")
        .isFalse();

    UITestDto reloaded = studioService.findTestById(created.id());
    UITestRequest edit =
        new UITestRequest(
            "Enqueue on create",
            null,
            CSI_ID,
            "Production",
            List.of(
                "Go to \"https://example.com/login\"",
                "Click the \"Sign in\" button",
                "Click \"Next\""),
            List.of(),
            com.citi.put.checks.studio.dto.TestConfiguration.defaults(),
            reloaded.sourceRevision(),
            reloaded.configurationRevision());
    gateway.defaultAnswer = artifactFor(edit.steps(), "edit");
    stubValidatorAcceptingSteps(edit.steps().size());
    studioService.updateTest(created.id(), edit, owner());

    assertThat(compileStatus(created.id())).isEqualTo("STALE");
    assertThat(gateway.calls.get()).as("the edit reaches no gateway either").isZero();

    // What the author pressing Run does, and the only thing that compiles.
    pipeline.compile(created.id(), OWNER);
    awaitCompileStatus(created.id(), "READY");
    assertThat(readiness.evaluate(created.id()).ready()).isTrue();
    assertThat(gateway.calls.get())
        .as("exactly one attempt, the one that was asked for")
        .isEqualTo(1);
  }

  @Test
  void savingV2AuthoringPreparesNothingUntilTheCompileIsAskedFor() {
    AuthoringV2Request initial =
        new AuthoringV2Request(
            2,
            GlobalAuthoringContext.empty(),
            List.of(
                new AuthoringStep(UUID.randomUUID(), STEPS.get(0), StepAuthoringContext.empty()),
                new AuthoringStep(UUID.randomUUID(), STEPS.get(1), StepAuthoringContext.empty())));
    StudioService.AuthoringDraft created =
        studioService.createAuthoringDraft(draftRequest("V2 save", null, null), initial, owner());
    assertThat(compileStatus(created.test().id())).isEqualTo("STALE");

    AuthoringV2Request edited =
        new AuthoringV2Request(
            2,
            GlobalAuthoringContext.empty(),
            List.of(
                initial.steps().get(0),
                initial.steps().get(1),
                new AuthoringStep(
                    UUID.randomUUID(), "Click the \"Next\" button", StepAuthoringContext.empty())));
    UITestDto current = studioService.findTestById(created.test().id());
    studioService.updateAuthoringDraft(
        created.test().id(),
        draftRequest("V2 save", current.sourceRevision(), current.configurationRevision()),
        edited,
        owner());

    assertThat(compileStatus(created.test().id()))
        .as("a v2 save persists the draft and prepares nothing")
        .isEqualTo("STALE");
    assertThat(gateway.calls.get()).as("neither v2 save reached the gateway").isZero();

    // The validator verdict must cover exactly the steps it was sent.
    stubValidatorAcceptingSteps(edited.steps().size());
    pipeline.compile(created.test().id(), OWNER);
    awaitCompileStatus(created.test().id(), "READY");
    ReadinessVerdict verdict = readiness.evaluate(created.test().id());
    assertThat(verdict.ready()).isTrue();
    assertThat(verdict.revisionId()).isNotNull();
    assertThat(gateway.calls.get()).as("one attempt, the one that was asked for").isEqualTo(1);
  }

  /**
   * A name-only edit moves no revision, leaves the confirmation valid (§4.2) and therefore has
   * nothing to compile. Enqueueing one would drive a confirmed draft to {@code COMPILING} and spend
   * a gateway call to rediscover the artifact it already holds.
   */
  @Test
  void aNameOnlyEditEnqueuesNothing() {
    UITestDto created = studioService.createTest(draftRequest("Named draft", null, null), owner());
    pipeline.compile(created.id(), OWNER);
    awaitCompileStatus(created.id(), "READY");
    int afterCreate = gateway.calls.get();

    UITestDto reloaded = studioService.findTestById(created.id());
    studioService.updateTest(
        created.id(),
        draftRequest("Renamed draft", reloaded.sourceRevision(), reloaded.configurationRevision()),
        owner());

    assertThat(gateway.calls.get())
        .as("name/description changes invalidate no confirmation and compile nothing")
        .isEqualTo(afterCreate);
    assertThat(compileStatus(created.id())).isEqualTo("READY");
  }

  @Test
  void aRefusedCompileLeavesTheDraftSaved() {
    UUID id = UUID.randomUUID();

    transactions.executeWithoutResult(status -> insertDraft(id, List.of("x".repeat(2_000))));

    // Over the line-length bound: the compile is refused on the request thread, before any
    // compile state moves. Saving already happened and is not undone by it.
    assertThatThrownBy(() -> pipeline.compile(id, OWNER))
        .as("a bound is refused before the draft is moved to COMPILING")
        .isInstanceOf(StudioValidationException.class);

    assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM ui_tests WHERE id = ?", Integer.class, id))
        .as("a draft must persist even when the compile it is asked for cannot start")
        .isEqualTo(1);
    assertThat(compileStatus(id))
        .as("a refused compile changes no compile state")
        .isEqualTo("STALE");
  }

  // ── AC-4: out-of-order completion, including two compiles of the same text ─

  @Test
  void anOlderCompileOfIdenticalUneditedSourceIsDiscardedRatherThanPublished() {
    CompileRequest a = states.beginCompile(testId);
    CompileRequest b = states.beginCompile(testId);
    CandidateRevision candidateA = candidate(a, "artifact-a");
    CandidateRevision candidateB = candidate(b, "artifact-b");

    assertThat(states.publishCandidate(testId, b, candidateB)).isEqualTo(PublishResult.PUBLISHED);
    assertThat(states.publishCandidate(testId, a, candidateA))
        .as(
            "nothing but the compile request identity distinguishes A from B here — the source and"
                + " configuration revisions are identical and unedited")
        .isEqualTo(PublishResult.DISCARDED_OUT_OF_ORDER);

    assertThat(revisionHashes(testId))
        .as("no ui_test_revisions row may be written for the discarded attempt")
        .containsExactly(candidateB.artifactHash());
  }

  @Test
  void twoInFlightCompilesCompletingInReverseOrderLeaveTheNewerCandidateCurrent() throws Exception {
    CountDownLatch releaseA = new CountDownLatch(1);
    CountDownLatch releaseB = new CountDownLatch(1);
    CountDownLatch bothEntered = new CountDownLatch(2);
    CountDownLatch holdAtEntry = new CountDownLatch(1);
    gateway.entered = bothEntered;
    // Every attempt parks at the entry first, so the per-request gates can be registered while both
    // are demonstrably inside the gateway rather than in a race with it.
    gateway.blockAll = holdAtEntry;

    UUID a = startBlockedCompile(releaseA, "a");
    UUID b = startBlockedCompile(releaseB, "b");
    assertThat(bothEntered.await(20, TimeUnit.SECONDS))
        .as("both attempts must be genuinely in flight before either is released")
        .isTrue();
    holdAtEntry.countDown();

    releaseB.countDown();
    awaitCompileStatus(testId, "READY");
    UUID currentAfterB = candidateRevisionId(testId);

    releaseA.countDown();
    // Give the older attempt every chance to publish before asserting that it did not.
    Thread.sleep(500L);

    assertThat(candidateRevisionId(testId))
        .as("the older attempt must not replace the newer candidate")
        .isEqualTo(currentAfterB);
    assertThat(revisionHashes(testId)).as("and must write no revision row of its own").hasSize(1);
    assertThat(a).as("the two attempts must have distinct request identities").isNotEqualTo(b);
  }

  // ── AC-11a: the reference corpus compiles end to end ─────────────────────

  @Test
  void everyReferenceCorpusExampleCompilesEndToEndAgainstTheStubGateway() throws IOException {
    List<Path> examples = referenceCorpus();
    assertThat(examples)
        .as("the 28-example reference corpus must be readable")
        .hasSizeGreaterThan(20);

    for (Path example : examples.subList(0, 6)) {
      JsonNode fixture = MAPPER.readTree(Files.readString(example, StandardCharsets.UTF_8));
      List<String> source = new ArrayList<>();
      fixture.path("source").forEach(line -> source.add(line.asText()));
      UUID id = seedTest(source);
      gateway.reset();

      // The stub returns the fixture's own artifact, so the compiled document is one the validator
      // is already proven to accept — the point of drawing fixtures from the reference corpus.
      gateway.defaultAnswer = fixture.path("artifact").toString();
      stubValidatorAcceptingSteps(source.size());

      pipeline.compile(id, OWNER);
      awaitAnyOf(id, List.of("READY", "NEEDS_REVISION", "STALE"));

      assertThat(compileStatus(id))
          .as("%s must compile to a confirmable candidate", example.getFileName())
          .isEqualTo("READY");
      assertThat(candidateRevisionId(id)).isNotNull();
    }
  }

  // ── AC-14: an invalid artifact can never become confirmable ───────────────

  @Test
  void nothingCanBeConfirmedOnceTheDraftIsNeedsRevision() {
    // A genuine confirmed revision first, so case (b) has a real previously-confirmed id to use.
    pipeline.compile(testId, OWNER);
    // The compile route accepts a valid candidate for its caller, so this is
    // already a confirmed, runnable revision — there is nothing left to confirm.
    awaitCompileStatus(testId, "READY");
    UUID firstCandidate = candidateRevisionId(testId);

    // A second compile supersedes it with a different artifact, and is then superseded itself.
    CompileRequest superseded = states.beginCompile(testId);
    CandidateRevision supersededCandidate = candidate(superseded, "artifact-superseded");
    states.publishCandidate(testId, superseded, supersededCandidate);
    UUID supersededId = candidateRevisionId(testId);

    CompileRequest failing = states.beginCompile(testId);
    states.publishInvalid(testId, failing, "{\"steps\":[]}");
    assertThat(compileStatus(testId)).isEqualTo("NEEDS_REVISION");
    assertThat(candidateRevisionId(testId))
        .as("publishInvalid leaves the current candidate cleared")
        .isNull();

    UUID fabricated = UUID.randomUUID();
    for (UUID attempted : List.of(fabricated, firstCandidate, supersededId)) {
      assertThatThrownBy(
              () ->
                  states.confirm(
                      testId,
                      attempted,
                      artifactHashOrAny(attempted),
                      sourceRevision(testId),
                      configurationRevision(testId),
                      OWNER))
          .as("confirming %s", attempted)
          .isInstanceOf(StudioConflictException.class)
          .extracting(e -> ((StudioConflictException) e).getCode())
          .isEqualTo("STALE_CANDIDATE");
    }

    assertThat(confirmedRevisionId(testId))
        .as("no failed confirmation may move the confirmed revision")
        .isEqualTo(firstCandidate);
    assertThat(confirmedBy(supersededId)).as("nor write a confirmation identity").isNull();
  }

  // ── AC-17: saturation refuses rather than queues, and reads stay responsive ─

  @Test
  void aSaturatedPoolRefusesTheNextCompileWhileOrdinaryReadsStayResponsive() throws Exception {
    int concurrency = 4;
    CountDownLatch release = new CountDownLatch(1);
    CountDownLatch saturated = new CountDownLatch(concurrency);
    gateway.blockAll = release;
    gateway.entered = saturated;

    List<UUID> blocked = new ArrayList<>();
    try {
      for (int i = 0; i < concurrency; i++) {
        UUID id = seedTest(STEPS);
        blocked.add(id);
        pipeline.compile(id, OWNER);
      }
      assertThat(saturated.await(20, TimeUnit.SECONDS))
          .as("the pool must actually be saturated before the refusal is asserted")
          .isTrue();

      UUID refused = seedTest(STEPS);
      long before = System.nanoTime();
      pipeline.compile(refused, OWNER);
      long acceptMs = (System.nanoTime() - before) / 1_000_000L;

      assertThat(acceptMs)
          .as("the request thread must never block waiting for a compile slot")
          .isLessThan(2_000L);
      awaitCompileStatus(refused, "STALE");
      assertThat(MAPPER.readTree(compileError(refused)).path("code").asText())
          .isEqualTo(CompileErrorCode.COMPILE_POOL_SATURATED.name());

      // Ordinary reads are served by request threads, not compile threads.
      long readBefore = System.nanoTime();
      jdbc.queryForObject("SELECT COUNT(*) FROM ui_tests", Integer.class);
      assertThat((System.nanoTime() - readBefore) / 1_000_000L)
          .as("a saturated compile pool must not starve ordinary traffic")
          .isLessThan(2_000L);
    } finally {
      release.countDown();
    }
    for (UUID id : blocked) {
      awaitCompileStatus(id, "READY");
    }
  }

  // ── AC-21: a gateway outage, both halves in one test ──────────────────────

  @Test
  void aGatewayOutageLeavesTheDraftRetryableAndAnUnchangedConfirmedTestRunnable() {
    // A separate test, confirmed and unedited before the outage starts.
    UUID confirmed = seedTest(STEPS);
    pipeline.compile(confirmed, OWNER);
    // The compile route accepts a valid candidate for its caller, so this is
    // already a confirmed, runnable revision — there is nothing left to confirm.
    awaitCompileStatus(confirmed, "READY");
    UUID revisionId = candidateRevisionId(confirmed);
    assertThat(readiness.evaluate(confirmed).ready()).isTrue();

    gateway.failing = true;

    // Half one: the saved draft stays saved and its compile is retryable.
    UUID edited = seedTest(STEPS);
    pipeline.compile(edited, OWNER);
    awaitCompileStatus(edited, "STALE");
    assertThat(
            jdbc.queryForObject(
                "SELECT steps::text FROM ui_tests WHERE id = ?", String.class, edited))
        .contains("https://example.com/login");
    assertThat(compileError(edited)).contains("GATEWAY_TRANSPORT");

    // Half two: throughout the outage, the unchanged confirmed test is still runnable — including
    // after its own optional recompile fails.
    assertThat(readiness.evaluate(confirmed).ready()).isTrue();
    pipeline.compile(confirmed, OWNER);
    awaitCompileStatus(confirmed, "STALE");

    ReadinessVerdict verdict = readiness.evaluate(confirmed);
    assertThat(verdict.ready())
        .as("a gateway outage must not revoke an approval nobody withdrew")
        .isTrue();
    assertThat(verdict.revisionId()).isEqualTo(revisionId);
  }

  // ── AC-27: a refused execution issues no runner call at all ───────────────

  @Test
  void everyNegativeReadinessCaseIssuesNoRunnerCallOnTheWire() {
    runner.resetAll();
    stubValidatorAccepting();

    List<UUID> refusable = new ArrayList<>();
    refusable.add(seedTest(STEPS)); // never confirmed

    UUID edited = seedTest(STEPS);
    pipeline.compile(edited, OWNER);
    // The compile route accepts a valid candidate for its caller, so this is
    // already a confirmed, runnable revision — there is nothing left to confirm.
    awaitCompileStatus(edited, "READY");
    UUID editedRevision = candidateRevisionId(edited);
    jdbc.update("UPDATE ui_tests SET source_revision = source_revision + 1 WHERE id = ?", edited);
    refusable.add(edited);

    UUID deleted = seedTest(STEPS);
    jdbc.update("UPDATE ui_tests SET deleted_at = NOW() WHERE id = ?", deleted);
    refusable.add(deleted);

    int callsBeforeRefusals = runner.getAllServeEvents().size();

    for (UUID id : refusable) {
      assertThatThrownBy(() -> readiness.requireReady(id))
          .as("test %s", id)
          .isInstanceOf(StudioConflictException.class);
    }

    assertThat(runner.getAllServeEvents())
        .as(
            "a refused execution must issue no runner HTTP call of any kind; the assertion is on"
                + " the wire, not on the return value")
        .hasSize(callsBeforeRefusals);
    runner.verify(callsBeforeRefusals, postRequestedFor(urlEqualTo("/v1/validate")));
  }

  // ── helpers ───────────────────────────────────────────────────────────────

  // ── Studio v1 WP9: the compile clock, and a compile abandoned mid-flight ────

  /**
   * The pipeline itself — not a direct {@code beginCompile} call — records {@code
   * compile_started_at}, and a compile whose work never returns is recovered by the configured
   * sweep: {@code STALE}, retryable, no candidate. Decision D11 accepts exactly this for v1.
   *
   * <p>"The replica died" is modelled by parking the work inside the gateway: the row is then in
   * the state a dead replica leaves behind, with nothing in this process able to settle it. The
   * clock is aged past the configured threshold rather than waited out, and the pass is the
   * sweeper's own, reading the bound {@code studio.compile.abandonment.*}. Releasing the parked
   * work afterwards stands in for a replica that was only slow: its late result must not resurrect
   * the swept row.
   */
  @Test
  void aCompileAbandonedMidFlightIsSweptToStaleWithNoCandidateAndItsLateResultIsDropped()
      throws Exception {
    CountDownLatch release = new CountDownLatch(1);
    CountDownLatch inGateway = new CountDownLatch(1);
    gateway.blockAll = release;
    gateway.entered = inGateway;
    int revisionsBefore = revisionHashes(testId).size();
    try {
      Timestamp before = jdbc.queryForObject("SELECT NOW()", Timestamp.class);
      pipeline.compile(testId, OWNER);
      assertThat(inGateway.await(30, TimeUnit.SECONDS))
          .as("the compile work must really be in flight")
          .isTrue();

      assertThat(compileStatus(testId)).isEqualTo("COMPILING");
      Timestamp started =
          jdbc.queryForObject(
              "SELECT compile_started_at FROM ui_tests WHERE id = ?", Timestamp.class, testId);
      assertThat(started)
          .as("the compile pipeline recorded compile_started_at when it began the compile")
          .isNotNull();
      assertThat(started.toInstant()).isAfterOrEqualTo(before.toInstant());

      Duration threshold = compileProperties.abandonment().threshold();
      jdbc.update(
          "UPDATE ui_tests SET compile_started_at = NOW() - make_interval(secs => ?)"
              + " WHERE id = ? AND compile_status = 'COMPILING'",
          (double) threshold.plusSeconds(1).toSeconds(),
          testId);
      new CompileAbandonmentSweeper(states, compileProperties).sweepOnce();

      assertThat(compileStatus(testId)).isEqualTo("STALE");
      assertThat(compileError(testId)).contains(CompileErrorCode.COMPILE_BUDGET_EXCEEDED.name());
      assertThat(candidateRevisionId(testId)).as("no candidate is fabricated").isNull();
    } finally {
      release.countDown();
    }

    // The parked work now completes and reaches the validator; its publish must find no request.
    long deadline = System.nanoTime() + Duration.ofSeconds(30).toNanos();
    while (runner.findAll(postRequestedFor(urlEqualTo("/v1/validate"))).isEmpty()
        && System.nanoTime() < deadline) {
      Thread.sleep(25L);
    }
    assertThat(runner.findAll(postRequestedFor(urlEqualTo("/v1/validate"))))
        .as("the released work really ran on, so the drop below is observed, not assumed")
        .isNotEmpty();
    Thread.sleep(500L);

    assertThat(compileStatus(testId))
        .as("the late result did not resurrect the row")
        .isEqualTo("STALE");
    assertThat(candidateRevisionId(testId)).isNull();
    assertThat(revisionHashes(testId)).hasSize(revisionsBefore);
  }

  /**
   * Starts one compile and registers its release gate.
   *
   * <p>The compile request id is only known once {@code beginCompile} has run inside the pipeline,
   * so it is read back from the row. The attempt is parked at {@code blockAll} meanwhile, which is
   * why registering the gate afterwards is safe rather than racy.
   *
   * @return the compile request identity this attempt was started for
   */
  private UUID startBlockedCompile(CountDownLatch release, String marker) {
    UUID requestBefore =
        jdbc.queryForObject(
            "SELECT compile_request_id FROM ui_tests WHERE id = ?", UUID.class, testId);
    pipeline.compile(testId, OWNER);
    UUID requestAfter =
        jdbc.queryForObject(
            "SELECT compile_request_id FROM ui_tests WHERE id = ?", UUID.class, testId);
    assertThat(requestAfter).isNotEqualTo(requestBefore);
    gateway.gates.put(requestAfter.toString(), release);
    gateway.answers.put(requestAfter.toString(), artifactFor(STEPS, marker));
    return requestAfter;
  }

  private CandidateRevision candidate(CompileRequest request, String marker) {
    String source = ArtifactCanonicalizer.canonicalSource(STEPS);
    String artifact = ArtifactCanonicalizer.canonicalize(artifactFor(STEPS, marker));
    return new CandidateRevision(
        request.configurationRevision(),
        source,
        ArtifactCanonicalizer.hash(source),
        artifact,
        ArtifactCanonicalizer.hash(artifact),
        CompilePins.SUPPORTED_ARTIFACT_VERSION,
        "{\"browser\":\"chromium\"}",
        "{\"variables\":[],\"secrets\":[]}",
        "{\"model\":\"stub-model@1\"}",
        OWNER);
  }

  static String artifactFor(List<String> steps, String marker) {
    ArrayNode stepNodes = MAPPER.createArrayNode();
    for (int index = 0; index < steps.size(); index++) {
      var step = stepNodes.addObject();
      step.put("stepIndex", index);
      step.put("originalText", steps.get(index));
      step.put("code", "await page.goto('https://example.com/" + marker + "');");
    }
    var artifact = MAPPER.createObjectNode();
    artifact.put("version", CompilePins.SUPPORTED_ARTIFACT_VERSION);
    artifact.set("steps", stepNodes);
    return artifact.toString();
  }

  private static List<Path> referenceCorpus() throws IOException {
    Path corpus = Path.of("..", "studio-runner", "fixtures", "reference");
    try (Stream<Path> files = Files.list(corpus)) {
      return files
          .filter(path -> path.getFileName().toString().endsWith(".json"))
          .filter(path -> !path.getFileName().toString().equals("manifest.json"))
          .sorted()
          .toList();
    }
  }

  private static void stubValidatorAccepting() {
    stubValidatorAcceptingSteps(STEPS.size());
  }

  private static void stubValidatorAcceptingSteps(int stepCount) {
    StringBuilder steps = new StringBuilder();
    for (int index = 0; index < stepCount; index++) {
      if (index > 0) {
        steps.append(',');
      }
      steps.append("{\"stepIndex\":").append(index).append(",\"ok\":true,\"diagnostics\":[]}");
    }
    runner.stubFor(
        post(urlEqualTo("/v1/validate"))
            .willReturn(
                aResponse()
                    .withStatus(200)
                    .withHeader("content-type", "application/json")
                    .withBody(
                        "{\"ok\":true,\"validatorSchemaVersion\":\"2.0.0\",\"diagnostics\":[],"
                            + "\"steps\":["
                            + steps
                            + "]}")));
  }

  private void awaitCompileStatus(UUID id, String expected) {
    awaitAnyOf(id, List.of(expected));
    assertThat(compileStatus(id))
        .as("compile never reached %s for %s", expected, id)
        .isEqualTo(expected);
  }

  private void awaitAnyOf(UUID id, List<String> expected) {
    long deadline = System.nanoTime() + Duration.ofSeconds(30).toNanos();
    while (System.nanoTime() < deadline) {
      if (expected.contains(compileStatus(id))) {
        return;
      }
      try {
        Thread.sleep(25L);
      } catch (InterruptedException e) {
        Thread.currentThread().interrupt();
        throw new IllegalStateException(e);
      }
    }
  }

  private static void awaitQuietly(CountDownLatch latch) {
    try {
      if (!latch.await(60, TimeUnit.SECONDS)) {
        throw new IllegalStateException("Timed out holding a compile attempt open");
      }
    } catch (InterruptedException e) {
      Thread.currentThread().interrupt();
      throw new IllegalStateException(e);
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

  private String confirmedBy(UUID revisionId) {
    return jdbc.queryForObject(
        "SELECT confirmed_by FROM ui_test_revisions WHERE id = ?", String.class, revisionId);
  }

  private String artifactHash(UUID revisionId) {
    return jdbc.queryForObject(
        "SELECT artifact_hash FROM ui_test_revisions WHERE id = ?", String.class, revisionId);
  }

  private String artifactHashOrAny(UUID revisionId) {
    List<String> hashes =
        jdbc.queryForList(
            "SELECT artifact_hash FROM ui_test_revisions WHERE id = ?", String.class, revisionId);
    return hashes.isEmpty() ? "0".repeat(64) : hashes.get(0);
  }

  private List<String> revisionHashes(UUID id) {
    return jdbc.queryForList(
        "SELECT artifact_hash FROM ui_test_revisions WHERE test_id = ? ORDER BY created_at",
        String.class,
        id);
  }

  private long sourceRevision(UUID id) {
    return jdbc.queryForObject("SELECT source_revision FROM ui_tests WHERE id = ?", Long.class, id);
  }

  private long configurationRevision(UUID id) {
    return jdbc.queryForObject(
        "SELECT configuration_revision FROM ui_tests WHERE id = ?", Long.class, id);
  }

  private static org.springframework.security.core.Authentication owner() {
    return StudioExecutionFixtures.identity(OWNER, CSI_ID, "owner");
  }

  private static UITestRequest draftRequest(String name, Long sourceRevision, Long configRevision) {
    return new UITestRequest(
        name,
        null,
        CSI_ID,
        "Production",
        STEPS,
        List.of(),
        com.citi.put.checks.studio.dto.TestConfiguration.defaults(),
        sourceRevision,
        configRevision);
  }

  private UUID seedTest(List<String> steps) {
    UUID id = UUID.randomUUID();
    insertDraft(id, steps);
    return id;
  }

  private void insertDraft(UUID id, List<String> steps) {
    ArrayNode stepsJson = MAPPER.createArrayNode();
    steps.forEach(stepsJson::add);
    jdbc.update(
        "INSERT INTO ui_tests (id, name, csi_id, environment, browser, steps, variables,"
            + " created_by, created_at, updated_at) VALUES (?, 'Pipeline IT draft', ?,"
            + " 'Production', 'chromium', CAST(? AS jsonb), CAST('[]' AS jsonb), ?, ?, ?)",
        id,
        CSI_ID,
        stepsJson.toString(),
        OWNER,
        Timestamp.from(Instant.now()),
        Timestamp.from(Instant.now()));
  }

  private void seedUser() {
    jdbc.update(
        "INSERT INTO users (id, sso_id, name, email, created_at, is_active)"
            + " VALUES (?, ?, 'Pipeline IT Owner', ?, ?, true) ON CONFLICT (email) DO NOTHING",
        UUID.randomUUID(),
        "sso-" + OWNER,
        OWNER,
        Timestamp.from(Instant.now()));
  }

  private void seedCsi() {
    jdbc.update(
        "INSERT INTO csi_systems (id, name, business_unit, criticality, owner_email,"
            + " environment, status, created_at, updated_at)"
            + " VALUES (?, 'Pipeline IT CSI', 'Ops', 'HIGH', ?, 'Production', 'OPERATIONAL', ?, ?)"
            + " ON CONFLICT (id) DO NOTHING",
        CSI_ID,
        OWNER,
        Timestamp.from(Instant.now()),
        Timestamp.from(Instant.now()));
  }

  // ── Story 10.17 AC-11: the compile path still reads no value, re-falsified against the vault ──

  /**
   * AC-11 — the compile path completes with a vault provider whose every method throws.
   *
   * <p>Structural, not incidental. "The vault was not called on this run" is weaker than "the
   * pipeline does not depend on the vault", and the difference is exactly what a later refactor
   * would erase. A pipeline that had acquired that dependency could not finish this test at all.
   */
  @Test
  void theCompilePipelineCompletesWithAVaultProviderWhoseEveryMethodThrows() {
    vault.throwing = true;

    UUID id = seedTest(STEPS);
    pipeline.compile(id, OWNER);

    awaitCompileStatus(id, "READY");
    assertThat(vault.calls).as("the compile path reached the vault").isEmpty();
  }

  /**
   * AC-11 — a canary planted in the vault is absent from the gateway payload, the audit line and
   * the prompt, in all eight encodings of AC-13a.
   *
   * <p>The canary is <b>proven resolvable first</b>: it is read straight out of the provider before
   * the compile, so the absences afterwards are facts about the compile path rather than about an
   * empty vault. Story 10.8's QA fix established that pattern and it is the reason this file's
   * `doesNotContain`s are not decorative.
   */
  @Test
  void aValueInTheVaultReachesNoGatewayPayloadNoAuditLineAndNoPrompt() {
    String canary = "Compile-Path-Vault-Canary-6e02b9";
    UUID id = seedTest(STEPS);
    VaultScope scope = VaultScope.of(CSI_ID, "Production", id);
    vault.seed(scope, "LOGIN_PW", canary);

    // Proven present, in the source this story introduced, under the compiled test's own scope.
    assertThat(
            vault
                .read(StudioVaultProvider.ReferenceKind.SECRET, scope, "LOGIN_PW")
                .map(entry -> new String(entry.value()))
                .orElse(""))
        .isEqualTo(canary);
    // …and the proof read itself is not counted against the compile below.
    vault.calls.clear();

    pipeline.compile(id, OWNER);
    awaitCompileStatus(id, "READY");

    String validatorBodies =
        runner.findAll(postRequestedFor(urlEqualTo("/v1/validate"))).stream()
            .map(request -> request.getBodyAsString())
            .collect(java.util.stream.Collectors.joining("\n"));
    assertThat(validatorBodies).as("the validator was never called at all").isNotBlank();

    for (String variant : encodingsOf(canary)) {
      assertThat(validatorBodies)
          .as("a vault value reached the validator payload as %s", variant)
          .doesNotContain(variant);
    }
    // The compile-path read that would have had to happen for a value to be there never did.
    assertThat(vault.calls)
        .as("the compile path read the vault")
        .noneMatch(call -> call.contains("LOGIN_PW"));
  }

  /** The eight variants story 10.17 AC-14 settles on, so this file and the runner agree. */
  private static List<String> encodingsOf(String value) {
    String base64 =
        java.util.Base64.getEncoder().encodeToString(value.getBytes(StandardCharsets.UTF_8));
    String jsonEscaped = MAPPER.valueToTree(value).toString();
    return List.of(
        value,
        java.net.URLEncoder.encode(value, StandardCharsets.UTF_8),
        base64,
        base64.replace("=", ""),
        base64.replace('+', '-').replace('/', '_'),
        base64.replace('+', '-').replace('/', '_').replace("=", ""),
        jsonEscaped.substring(1, jsonEscaped.length() - 1),
        java.net.URLEncoder.encode(
            java.net.URLEncoder.encode(value, StandardCharsets.UTF_8), StandardCharsets.UTF_8));
  }
}
