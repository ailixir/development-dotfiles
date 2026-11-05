package com.citi.put.checks.studio.guided.session;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.citi.put.checks.security.BffAuthenticationToken;
import com.citi.put.checks.security.CsiOwnershipEntry;
import com.citi.put.checks.security.UserIdentity;
import com.citi.put.checks.studio.dispatch.HttpRunnerDispatchClient;
import com.citi.put.checks.studio.guided.bridge.GuidedBindingStore;
import com.citi.put.checks.studio.guided.bridge.GuidedDispatchService;
import com.citi.put.checks.studio.guided.bridge.GuidedMaterializationService;
import com.citi.put.checks.studio.guided.bridge.GuidedPreparationStore;
import com.citi.put.checks.studio.guided.bridge.GuidedSourceReferenceValidator;
import com.citi.put.checks.studio.support.RunnerProcessHarness;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.net.InetSocketAddress;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.security.Signature;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.Base64;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicReference;
import javax.sql.DataSource;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.autoconfigure.EnableAutoConfiguration;
import org.springframework.boot.autoconfigure.flyway.FlywayAutoConfiguration;
import org.springframework.boot.autoconfigure.jdbc.DataSourceAutoConfiguration;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.springframework.security.core.Authentication;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.transaction.support.TransactionTemplate;

/** Real PostgreSQL + real mutually authenticated HTTPS in both directions + actual Chromium. */
@SpringBootTest(
    classes = GuidedBridgeIntegrationTest.Application.class,
    webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT,
    properties = {
      "spring.main.banner-mode=off",
      "logging.level.root=WARN",
      "spring.jmx.enabled=false"
    })
class GuidedBridgeIntegrationTest {
  static final GuidedBridgeFixture ENV;

  static {
    try {
      ENV =
          new GuidedBridgeFixture(
              "guided-bridge-",
              Path.of(System.getProperty("java.io.tmpdir"), "studio-obs004-tested-worker.json"));
      ENV.start();
    } catch (Exception failure) {
      throw new ExceptionInInitializerError(failure);
    }
  }

  @DynamicPropertySource
  static void properties(DynamicPropertyRegistry registry) {
    ENV.properties(registry);
  }

  @Configuration(proxyBeanMethods = false)
  @EnableAutoConfiguration(
      exclude = {DataSourceAutoConfiguration.class, FlywayAutoConfiguration.class})
  @Import({
    GuidedInternalController.class,
    GuidedInternalSecurity.class,
    GuidedWireBodyAdvice.class
  })
  static class Application {
    @Bean
    org.springframework.boot.web.servlet.FilterRegistrationBean<jakarta.servlet.Filter>
        completionFault() {
      return ENV.completionFault();
    }

    @Bean
    DataSource dataSource() {
      return new DriverManagerDataSource(
          ENV.database.getJdbcUrl(), ENV.database.getUsername(), ENV.database.getPassword());
    }

    @Bean
    JdbcTemplate jdbc(DataSource source) {
      return new JdbcTemplate(source);
    }

    @Bean
    GuidedContracts contracts() {
      return ENV.contracts;
    }

    @Bean
    GuidedSessionRepository repository(JdbcTemplate jdbc) {
      return new GuidedSessionRepository(
          jdbc,
          new TransactionTemplate(new DataSourceTransactionManager(jdbc.getDataSource())),
          ENV.contracts);
    }

    @Bean
    FixtureAccess access(JdbcTemplate jdbc) {
      return new FixtureAccess(jdbc);
    }

    @Bean
    GuidedMaterializationService materialization(JdbcTemplate jdbc) {
      return new GuidedMaterializationService(
          jdbc, ENV.contracts, com.citi.put.checks.studio.support.TestDomains.FIXTURES);
    }

    @Bean
    GuidedSessionService service(
        GuidedSessionRepository repository,
        FixtureAccess access,
        JdbcTemplate jdbc,
        GuidedMaterializationService materialization) {
      var service =
          new GuidedSessionService(
              repository,
              ENV.contracts,
              access,
              new GuidedSessionProperties(true, Map.of()),
              com.citi.put.checks.studio.support.TestDomains.FIXTURES,
              Clock.systemUTC());
      service.installBridge(
          materialization,
          new GuidedPreparationStore(jdbc, ENV.contracts),
          new GuidedBindingStore(jdbc, ENV.contracts, materialization),
          new com.citi.put.checks.studio.guided.bridge.GuidedAssignmentStore(jdbc, ENV.contracts));
      // Single path: production always installs translation (GuidedSessionConfiguration).
      service.installTranslation(
          new com.citi.put.checks.studio.guided.translation.GuidedTranslationStore(
              jdbc, ENV.contracts),
          new com.citi.put.checks.studio.guided.translation.GuidedClarificationContextStore(
              jdbc, ENV.contracts));
      // STUDIO-OBS-014 S3: one uniform governed policy for the class (ar-mounted-rules B14).
      com.citi.put.checks.studio.support.ObservedPublicationFixture.installCsiBudget(service, jdbc);
      return service;
    }

    @Bean
    HttpRunnerDispatchClient runner() {
      return new HttpRunnerDispatchClient(
          URI.create("https://127.0.0.1:" + ENV.runnerPort),
          ENV.tls,
          () -> token("backend-controller", "controller-1", "studio-guided-runner"),
          ENV.contracts);
    }

    @Bean
    GuidedDispatchService dispatch(
        GuidedSessionService sessions,
        GuidedMaterializationService materialization,
        HttpRunnerDispatchClient runner) {
      var dispatch = new GuidedDispatchService(sessions, materialization, runner);
      sessions.installStopSender(dispatch::stop);
      return dispatch;
    }
  }

  static class FixtureAccess implements GuidedSessionAccess, GuidedSessionService.StepVerifier {
    final JdbcTemplate jdbc;

    FixtureAccess(JdbcTemplate jdbc) {
      this.jdbc = jdbc;
    }

    @Override
    public Snapshot resolve(Authentication principal, JsonNode start) {
      assertThat(ENV.connections.get()).isGreaterThan(0);
      ObjectNode scope =
          ENV.contracts
              .object()
              .put("principalId", "user-1")
              .put("csiId", "CSI-123")
              .put("environmentId", "fixture")
              .put("sourceRevision", "source-1")
              .put("configurationRevision", "config-1")
              .put("modelDataPolicyId", "labels-only-1")
              .putNull("valueTransferPolicyId");
      scope.putArray("capabilities").add("observe").add("step");
      var steps = ENV.contracts.object().putArray("steps");
      steps.add(ENV.contracts.object().put("stepId", "step-1").put("requiresAssertion", false));
      if (ENV.wideSession) {
        for (int n = 1; n < 100; n++) {
          steps.add(
              ENV.contracts
                  .object()
                  .put("stepId", n + "😀".repeat(250))
                  .put("requiresAssertion", false));
        }
      }
      if (ENV.multiStep) {
        steps.add(ENV.contracts.object().put("stepId", "step-2").put("requiresAssertion", false));
      }
      return new Snapshot(scope, steps);
    }

    /** Controlled two-step semantics only; never a production English/question verifier. */
    @Override
    public boolean complete(JsonNode session, JsonNode completion, List<ObjectNode> actions) {
      if (!ENV.multiStep
          || !completion.path("stepId").asText().equals("step-1")
          || actions.size() != 2) {
        return false;
      }
      var kinds =
          actions.stream()
              .map(
                  action ->
                      ENV.contracts
                          .parse(
                              jdbc.queryForObject(
                                  "SELECT proposal::text FROM studio_guided_actions WHERE"
                                      + " admission_id=?",
                                  String.class,
                                  action.path("admission").path("admissionId").asText()))
                          .path("operation")
                          .path("kind")
                          .asText())
              .toList();
      return kinds.equals(List.of("navigate", "read"))
          && ENV.navigations.get() == 1
          && jdbc.queryForObject(
                  "SELECT count(*) FROM studio_guided_producers WHERE session_id=?",
                  Integer.class,
                  session.path("sessionId").asText())
              == 1;
    }

    @Override
    public void checkUser(Authentication principal, JsonNode session) {
      GuidedSessionException.require(
          principal instanceof BffAuthenticationToken
              && ((BffAuthenticationToken) principal).getPrincipal().userId().equals("user-1"),
          "FORBIDDEN_SCOPE",
          403);
    }

    @Override
    public void checkSourceCurrent(JsonNode session) {
      String revision =
          jdbc.queryForObject(
              "SELECT revision FROM bridge_fixture_sources WHERE id=1 FOR SHARE", String.class);
      GuidedSessionException.require(
          revision.equals(session.path("scope").path("sourceRevision").asText()),
          "REVISION_CONFLICT",
          409);
      String configurationRevision =
          jdbc.queryForObject(
              "SELECT revision FROM bridge_fixture_configuration WHERE id=1 FOR SHARE",
              String.class);
      GuidedSessionException.require(
          configurationRevision.equals(
              session.path("scope").path("configurationRevision").asText()),
          "REVISION_CONFLICT",
          409);
    }

    @Override
    public GuidedSourceReferenceValidator.Sources sources(JsonNode session) {
      String text =
          jdbc.queryForObject("SELECT source FROM bridge_fixture_sources WHERE id=1", String.class);
      return new GuidedSourceReferenceValidator.Sources(
          "source-1",
          "config-1",
          Map.of(
              "step-1",
              new GuidedSourceReferenceValidator.Source(
                  text,
                  List.of(new GuidedSourceReferenceValidator.ClassifiedRegion(0, text.length())))),
          Map.of(
              "config-value",
              new GuidedSourceReferenceValidator.ConfigurationValue(
                  jdbc.queryForObject(
                      "SELECT input_value FROM bridge_fixture_configuration WHERE id=1",
                      String.class),
                  "step-1",
                  "nonsecretText",
                  session.path("scopeHash").asText(),
                  true)));
    }
  }

  @LocalServerPort int backendPort;
  @Autowired GuidedSessionService sessions;
  @Autowired GuidedSessionRepository repository;
  @Autowired GuidedMaterializationService materialization;
  @Autowired GuidedDispatchService dispatch;
  @Autowired HttpRunnerDispatchClient runner;
  @Autowired JdbcTemplate jdbc;
  @Autowired DataSource fixtureDataSource;
  final Authentication controller =
      new GuidedInternalSecurity.Identity("controller-1", "backend-controller");
  final Authentication user =
      new BffAuthenticationToken(
          new UserIdentity(
              "user-1",
              "fixture@example.test",
              "Fixture",
              "Test",
              List.of(),
              List.of(new CsiOwnershipEntry("CSI-123", "owner"))));
  RunnerProcessHarness workerHarness;

  @BeforeEach
  void startWorker(org.junit.jupiter.api.TestInfo testInfo) throws Exception {
    ENV.prepareScenario(testInfo);
    ENV.isolateDatabase(fixtureDataSource);
    jdbc.execute(
        "CREATE TABLE IF NOT EXISTS bridge_fixture_sources(id integer PRIMARY "
            + "KEY,revision text NOT NULL,source text NOT NULL)");
    jdbc.update(
        "INSERT INTO bridge_fixture_sources VALUES (1,'source-1',?) ON CONFLICT(id) DO "
            + "UPDATE SET revision='source-1',source=excluded.source",
        "Visit "
            + ENV.origin
            + "/start then copy the displayed order into Destination and type fixture-input."
            + (ENV.privacyEcho ? " Then visit " + ENV.origin + "/echo." : ""));
    jdbc.execute(
        "CREATE TABLE IF NOT EXISTS bridge_fixture_configuration(id integer PRIMARY KEY,"
            + "revision text NOT NULL,input_value text NOT NULL)");
    jdbc.update(
        "INSERT INTO bridge_fixture_configuration VALUES (1,'config-1',?)"
            + " ON CONFLICT(id) DO UPDATE SET revision='config-1',input_value=excluded.input_value",
        ENV.configInput);
    // STUDIO-OBS-014 S3b: each test runs on a freshly migrated isolated database, so the class's
    // approved governed policy is seeded here; the bean-time seed only reached the base database.
    ENV.resetWorkerState();
    Path journal = ENV.prepareWorkerJournal();
    // STUDIO-OBS-009 AC-3 / AC-12 h: the one folded entry point over TLS, spawned and reaped by the
    // harness. STUDIO-OBS-013/014 S3: a per-class object store, never a shared default directory.
    workerHarness = ENV.startWorker(journal, backendPort);
    workerHarness.awaitReady(Duration.ofSeconds(60));
  }

  @AfterEach
  void closeWorker() throws Exception {
    ENV.releaseClaimResponse.countDown();
    ENV.releaseRefreshCallback.countDown();
    var harness = workerHarness;
    workerHarness = null;
    ENV.closeWorker(harness);
  }

  @AfterAll
  static void close() {
    ENV.application.stop(0);
    ENV.database.stop();
  }

  @Test
  void actualServiceTransportRejectsWrongAudienceSubjectFenceAndTuple() throws Exception {
    String id = prepareSession();
    ObjectNode context = sessions.runnerContext(controller, id, 1);
    ObjectNode claim =
        ENV.contracts
            .object()
            .put("schemaVersion", 3)
            .put("sessionId", id)
            .put("workerId", "worker-1")
            .put("expectedFence", 1);
    claim.set("versions", versions());
    post(
        id,
        "claim",
        claim,
        "audience",
        token("owning-worker", "worker-1", "studio-guided-runner"),
        401);
    post(
        id,
        "claim",
        claim,
        "subject",
        token("owning-worker", "wrong-worker", "studio-guided-controller"),
        403);
    ObjectNode incompatible = context.deepCopy();
    incompatible.withObject("/versions").put("executor", "observed-1");
    // ar-2-r14-stops ruling 2: the runner's closed 409 refusal of an incompatible context is
    // definite, so it surfaces as terminal RUNTIME_INCOMPATIBLE (not the uncertain
    // UNKNOWN_OUTCOME).
    assertThatThrownBy(() -> runner.send("context", incompatible))
        .isInstanceOfSatisfying(
            com.citi.put.checks.studio.guided.session.GuidedSessionException.class,
            refused -> {
              assertThat(refused).hasMessage("RUNTIME_INCOMPATIBLE");
              assertThat(refused.messageCode()).isEqualTo(HttpRunnerDispatchClient.CONTEXT_REFUSED);
              assertThat(refused.retryable()).isFalse();
            });
    ObjectNode wrong = context.deepCopy();
    wrong.put("ownerFence", 2);
    final ObjectNode changed = wrong;
    // Backend callback fence/header disagreement fails even with a valid worker token.
    ObjectNode callback = materialization.identity(changed);
    callback.put("reason", "CONTEXT_LOST");
    post(
        id,
        "lifecycle",
        callback,
        "fence",
        token("owning-worker", "worker-1", "studio-guided-controller"),
        409);
    assertThat(ENV.navigations.get()).isZero();
    assertThat(actionCount(id)).isZero();
  }

  int actionCount(String id) {
    return jdbc.queryForObject(
        "SELECT count(*) FROM studio_guided_actions WHERE session_id=?", Integer.class, id);
  }

  @Test
  void callbackAcceptsValidUnicodeSessionLargerThan64KiB() throws Exception {
    ENV.wideSession = true;
    String id = prepareSession();
    JsonNode session = repository.transaction(() -> repository.lock(id).document());
    ENV.contracts.validate("v3/session", session);
    assertThat(session.toString().getBytes(StandardCharsets.UTF_8).length)
        .isGreaterThan(65536)
        .isLessThan(1048576);
    dispatch.pushContext(controller, id, 1);
    assertThat(progress(id).path("executionEvidence").path("kind").asText())
        .isEqualTo("initialBlank");
    assertThat(ENV.navigations.get()).isZero();
  }

  /**
   * STUDIO-OBS-015 H8: the real worker closes on the first stop, but every acknowledgement of the
   * original send and of both immediate re-sends is lost; the reaper's re-drive then confirms. All
   * four sends carry one canonical body, so one deterministic {@code teardown-<hash>} key: the
   * runner replays its original stop rather than adding a replay entry per attempt.
   */
  @Test
  void stopRetryAfterCloseCompletesConfirmsWithSameKey() throws Exception {
    String id = prepareSession();
    dispatch.pushContext(controller, id, 1);
    var digests = new java.util.concurrent.CopyOnWriteArrayList<String>();
    var observer =
        HttpRunnerDispatchClient.class.getDeclaredMethod(
            "observeRequestBytes", java.util.function.Consumer.class);
    observer.setAccessible(true);
    observer.invoke(
        runner,
        (java.util.function.Consumer<byte[]>)
            bytes -> {
              JsonNode body = ENV.contracts.parse(new String(bytes, StandardCharsets.UTF_8));
              if (body.has("reason") && body.path("sessionId").asText().equals(id)) {
                digests.add(GuidedContracts.hash(body));
              }
            });
    var lost = new AtomicInteger();
    sessions.installStopSender(
        (target, reason) -> {
          if (!target.path("sessionId").asText().equals(id)) {
            throw new IllegalStateException("FOREIGN_SESSION");
          }
          dispatch.stop(target, reason);
          if (lost.incrementAndGet() <= 3) {
            throw new GuidedSessionException("UNKNOWN_OUTCOME", 409);
          }
        });
    try {
      sessions.cancel(
          user,
          id,
          "cancel",
          ENV.contracts.object().put("schemaVersion", 3).put("reason", "userRequested"));

      long styleScope001BridgeDeadline = System.nanoTime() + TimeUnit.MILLISECONDS.toNanos(60000);
      class BridgePoll1 {
        Throwable failure;
        boolean terminal;
        boolean slept;
        boolean initialAwaitTick = true;

        boolean step() {
          if (terminal) {
            return true;
          }
          try {
            if (slept && Thread.interrupted()) {
              throw new InterruptedException();
            }
            if (!(!(lost.get() == 3 && !sessions.teardownInFlight(id))
                && System.nanoTime() < styleScope001BridgeDeadline)) {
              terminal = true;
              return true;
            }
            if (Thread.interrupted()) {
              throw new InterruptedException();
            }
            slept = true;
            return false;
          } catch (Throwable caught) {
            failure = caught;
            terminal = true;
            return true;
          }
        }
      }
      var styleScope001BridgePoll = new BridgePoll1();
      if (!styleScope001BridgePoll.step()) {
        try {
          org.awaitility.Awaitility.await()
              .alias("GuidedBridgeIntegrationTest: three refused stops finish")
              .pollInSameThread()
              .dontCatchUncaughtExceptions()
              .pollDelay(Duration.ZERO)
              .pollInterval(Duration.ofMillis(25))
              .atMost(
                  Duration.ofNanos(Math.max(1L, styleScope001BridgeDeadline - System.nanoTime())))
              .until(
                  () -> {
                    if (styleScope001BridgePoll.initialAwaitTick) {
                      styleScope001BridgePoll.initialAwaitTick = false;
                      return false;
                    }
                    return styleScope001BridgePoll.step();
                  });
        } catch (org.awaitility.core.ConditionTimeoutException bridgeTimeout) {
          if (!styleScope001BridgePoll.terminal) {
            styleScope001BridgePoll.step();
          }
        }
      }
      if (styleScope001BridgePoll.failure instanceof Exception exception) {
        throw exception;
      }
      if (styleScope001BridgePoll.failure instanceof Error error) {
        throw error;
      }
      assertThat(lost.get() == 3 && !sessions.teardownInFlight(id)).isTrue();

      assertThat(progress(id).path("teardownStatus").asText()).isEqualTo("PENDING");
      assertThat(progress(id).path("teardownRequest").path("reason").asText())
          .isEqualTo("CANCELLED");
      assertThat(progress(id).path("teardownRequest").path("target").has("authoredInputs"))
          .isFalse();

      sessions.redriveTeardowns(Duration.ofMinutes(15), 32);

      long styleScope002BridgeDeadline = System.nanoTime() + TimeUnit.MILLISECONDS.toNanos(30000);
      class BridgePoll2 {
        Throwable failure;
        boolean terminal;
        boolean slept;
        boolean initialAwaitTick = true;

        boolean step() {
          if (terminal) {
            return true;
          }
          try {
            if (slept && Thread.interrupted()) {
              throw new InterruptedException();
            }
            if (!(!(progress(id).path("teardownStatus").asText().equals("CONFIRMED"))
                && System.nanoTime() < styleScope002BridgeDeadline)) {
              terminal = true;
              return true;
            }
            if (Thread.interrupted()) {
              throw new InterruptedException();
            }
            slept = true;
            return false;
          } catch (Throwable caught) {
            failure = caught;
            terminal = true;
            return true;
          }
        }
      }
      var styleScope002BridgePoll = new BridgePoll2();
      if (!styleScope002BridgePoll.step()) {
        try {
          org.awaitility.Awaitility.await()
              .alias("GuidedBridgeIntegrationTest: teardown confirmed")
              .pollInSameThread()
              .dontCatchUncaughtExceptions()
              .pollDelay(Duration.ZERO)
              .pollInterval(Duration.ofMillis(25))
              .atMost(
                  Duration.ofNanos(Math.max(1L, styleScope002BridgeDeadline - System.nanoTime())))
              .until(
                  () -> {
                    if (styleScope002BridgePoll.initialAwaitTick) {
                      styleScope002BridgePoll.initialAwaitTick = false;
                      return false;
                    }
                    return styleScope002BridgePoll.step();
                  });
        } catch (org.awaitility.core.ConditionTimeoutException bridgeTimeout) {
          if (!styleScope002BridgePoll.terminal) {
            styleScope002BridgePoll.step();
          }
        }
      }
      if (styleScope002BridgePoll.failure instanceof Exception exception) {
        throw exception;
      }
      if (styleScope002BridgePoll.failure instanceof Error error) {
        throw error;
      }
      assertThat(progress(id).path("teardownStatus").asText().equals("CONFIRMED")).isTrue();

      assertThat(lost.get()).isEqualTo(4);
      assertThat(progress(id).has("teardownRequest")).isFalse();
      assertThat(digests).hasSize(4).containsOnly(digests.getFirst());
    } finally {
      sessions.installStopSender(dispatch::stop);
      observer.invoke(runner, (Object) null);
    }
  }

  /**
   * STUDIO-OBS-009 I-T2 (ruling W1.5 part 1, D5): the guided browser is wedged (SIGSTOP) when the
   * session ends through the backend's normal path. The runner bounds its own close, so the first
   * stop send is answered 200 inside the backend's 15 s deadline (never {@code UNKNOWN_OUTCOME}),
   * the teardown is confirmed, the one capacity slot is free for a second session, and no browser
   * of this runner survives. It needs a {@code dist} that carries the D5 close bound, so it is
   * credited only on the F-merge {@code dist} digest.
   */
  @Test
  void aWedgedGuidedBrowserIsTerminatedInsideTheBackendDeadlineAndTheSlotIsReleased()
      throws Exception {
    String id = prepareSession();
    dispatch.pushContext(controller, id, 1);
    List<RunnerProcessHarness.ProcessFact> browsers = workerHarness.survivingGuidedBrowsers();
    assertThat(browsers).as("the guided launch left its browser under this runner").isNotEmpty();
    assertThat(workerHarness.freeze(browsers)).hasSameSizeAs(browsers);
    var sends = new java.util.concurrent.CopyOnWriteArrayList<String>();
    var millis = new java.util.concurrent.CopyOnWriteArrayList<Long>();
    sessions.installStopSender(
        (target, reason) -> {
          long started = System.nanoTime();
          try {
            dispatch.stop(target, reason);
            sends.add("OK");
          } catch (RuntimeException failure) {
            sends.add(String.valueOf(failure.getMessage()));
            throw failure;
          } finally {
            millis.add(TimeUnit.NANOSECONDS.toMillis(System.nanoTime() - started));
          }
        });
    try {
      sessions.cancel(
          user,
          id,
          "cancel",
          ENV.contracts.object().put("schemaVersion", 3).put("reason", "userRequested"));

      long styleScope003BridgeDeadline = System.nanoTime() + TimeUnit.MILLISECONDS.toNanos(60000);
      class BridgePoll3 {
        Throwable failure;
        boolean terminal;
        boolean slept;
        boolean initialAwaitTick = true;

        boolean step() {
          if (terminal) {
            return true;
          }
          try {
            if (slept && Thread.interrupted()) {
              throw new InterruptedException();
            }
            if (!(!(progress(id).path("teardownStatus").asText().equals("CONFIRMED"))
                && System.nanoTime() < styleScope003BridgeDeadline)) {
              terminal = true;
              return true;
            }
            if (Thread.interrupted()) {
              throw new InterruptedException();
            }
            slept = true;
            return false;
          } catch (Throwable caught) {
            failure = caught;
            terminal = true;
            return true;
          }
        }
      }
      var styleScope003BridgePoll = new BridgePoll3();
      if (!styleScope003BridgePoll.step()) {
        try {
          org.awaitility.Awaitility.await()
              .alias("GuidedBridgeIntegrationTest: teardown confirmed")
              .pollInSameThread()
              .dontCatchUncaughtExceptions()
              .pollDelay(Duration.ZERO)
              .pollInterval(Duration.ofMillis(25))
              .atMost(
                  Duration.ofNanos(Math.max(1L, styleScope003BridgeDeadline - System.nanoTime())))
              .until(
                  () -> {
                    if (styleScope003BridgePoll.initialAwaitTick) {
                      styleScope003BridgePoll.initialAwaitTick = false;
                      return false;
                    }
                    return styleScope003BridgePoll.step();
                  });
        } catch (org.awaitility.core.ConditionTimeoutException bridgeTimeout) {
          if (!styleScope003BridgePoll.terminal) {
            styleScope003BridgePoll.step();
          }
        }
      }
      if (styleScope003BridgePoll.failure instanceof Exception exception) {
        throw exception;
      }
      if (styleScope003BridgePoll.failure instanceof Error error) {
        throw error;
      }
      assertThat(progress(id).path("teardownStatus").asText().equals("CONFIRMED")).isTrue();

    } finally {
      sessions.installStopSender(dispatch::stop);
    }
    assertThat(sends).as("the first stop send was answered 200").first().isEqualTo("OK");
    assertThat(millis.get(0)).as("inside the 15 s backend deadline").isLessThanOrEqualTo(15000L);
    String next = createSession();
    assertThat(dispatch.assign(controller, next, "assignment", "worker-1").path("status").asText())
        .isEqualTo("OWNED");
    // The runner spares the recorder after a graceful stage so the webm can be finalized
    // (STUDIO-OBS-009 round 065). It waits at most GUIDED_RECORDING_FINALIZE_MS (15 s) after
    // the stop reply, then kills it, so "no browser survives" holds once that bound has passed.
    // The wait is the bound plus a margin; a survivor still fails.
    org.awaitility.Awaitility.await()
        .alias("GuidedBridgeIntegrationTest: no guided browser or recorder survives")
        .atMost(Duration.ofSeconds(25))
        .pollInterval(Duration.ofMillis(100))
        .untilAsserted(() -> assertThat(workerHarness.survivingGuidedBrowsers()).isEmpty());
    workerHarness.teardown().assertNoSurvivors();
  }

  @Test
  void assignmentRenewsBeforeContextAndCancellationReleasesItsOnlyCapacitySlot() throws Exception {
    String id = createSession();
    JsonNode owned = dispatch.assign(controller, id, "assignment", "worker-1");
    Instant originalLease = Instant.parse(owned.path("leaseExpiresAt").asText());

    long styleScope004BridgeDeadline = System.nanoTime() + TimeUnit.MILLISECONDS.toNanos(15000);
    class BridgePoll4 {
      Throwable failure;
      boolean terminal;
      boolean slept;
      boolean initialAwaitTick = true;

      boolean step() {
        if (terminal) {
          return true;
        }
        try {
          if (slept && Thread.interrupted()) {
            throw new InterruptedException();
          }
          if (!(!(claimCount(id) >= 2) && System.nanoTime() < styleScope004BridgeDeadline)) {
            terminal = true;
            return true;
          }
          if (Thread.interrupted()) {
            throw new InterruptedException();
          }
          slept = true;
          return false;
        } catch (Throwable caught) {
          failure = caught;
          terminal = true;
          return true;
        }
      }
    }
    var styleScope004BridgePoll = new BridgePoll4();
    if (!styleScope004BridgePoll.step()) {
      try {
        org.awaitility.Awaitility.await()
            .alias("GuidedBridgeIntegrationTest: owner renewal recorded")
            .pollInSameThread()
            .dontCatchUncaughtExceptions()
            .pollDelay(Duration.ZERO)
            .pollInterval(Duration.ofMillis(25))
            .atMost(Duration.ofNanos(Math.max(1L, styleScope004BridgeDeadline - System.nanoTime())))
            .until(
                () -> {
                  if (styleScope004BridgePoll.initialAwaitTick) {
                    styleScope004BridgePoll.initialAwaitTick = false;
                    return false;
                  }
                  return styleScope004BridgePoll.step();
                });
      } catch (org.awaitility.core.ConditionTimeoutException bridgeTimeout) {
        if (!styleScope004BridgePoll.terminal) {
          styleScope004BridgePoll.step();
        }
      }
    }
    if (styleScope004BridgePoll.failure instanceof Exception exception) {
      throw exception;
    }
    if (styleScope004BridgePoll.failure instanceof Error error) {
      throw error;
    }
    assertThat(claimCount(id) >= 2).isTrue();

    assertThat(Instant.parse(session(id).path("owner").path("leaseExpiresAt").asText()))
        .isAfter(originalLease);
    assertThat(
            jdbc.queryForObject(
                "SELECT count(*) FROM studio_guided_materializations WHERE session_id=?",
                Integer.class,
                id))
        .isZero();
    assertThat(progress(id).has("executionEvidence")).isFalse();
    assertThat(ENV.navigations.get()).isZero();
    JsonNode current = dispatch.assign(controller, id, "assignment", "worker-1");
    assertThat(Instant.parse(current.path("leaseExpiresAt").asText())).isAfter(originalLease);
    sessions.cancel(
        user,
        id,
        "cancel-before-context",
        ENV.contracts.object().put("schemaVersion", 3).put("reason", "userRequested"));

    long styleScope005BridgeDeadline = System.nanoTime() + TimeUnit.MILLISECONDS.toNanos(5000);
    class BridgePoll5 {
      Throwable failure;
      boolean terminal;
      boolean slept;
      boolean initialAwaitTick = true;

      boolean step() {
        if (terminal) {
          return true;
        }
        try {
          if (slept && Thread.interrupted()) {
            throw new InterruptedException();
          }
          if (!(!(progress(id).path("teardownStatus").asText().equals("CONFIRMED"))
              && System.nanoTime() < styleScope005BridgeDeadline)) {
            terminal = true;
            return true;
          }
          if (Thread.interrupted()) {
            throw new InterruptedException();
          }
          slept = true;
          return false;
        } catch (Throwable caught) {
          failure = caught;
          terminal = true;
          return true;
        }
      }
    }
    var styleScope005BridgePoll = new BridgePoll5();
    if (!styleScope005BridgePoll.step()) {
      try {
        org.awaitility.Awaitility.await()
            .alias("GuidedBridgeIntegrationTest: teardown confirmed")
            .pollInSameThread()
            .dontCatchUncaughtExceptions()
            .pollDelay(Duration.ZERO)
            .pollInterval(Duration.ofMillis(25))
            .atMost(Duration.ofNanos(Math.max(1L, styleScope005BridgeDeadline - System.nanoTime())))
            .until(
                () -> {
                  if (styleScope005BridgePoll.initialAwaitTick) {
                    styleScope005BridgePoll.initialAwaitTick = false;
                    return false;
                  }
                  return styleScope005BridgePoll.step();
                });
      } catch (org.awaitility.core.ConditionTimeoutException bridgeTimeout) {
        if (!styleScope005BridgePoll.terminal) {
          styleScope005BridgePoll.step();
        }
      }
    }
    if (styleScope005BridgePoll.failure instanceof Exception exception) {
      throw exception;
    }
    if (styleScope005BridgePoll.failure instanceof Error error) {
      throw error;
    }
    assertThat(progress(id).path("teardownStatus").asText().equals("CONFIRMED")).isTrue();

    assertThatThrownBy(() -> runner.send("assign", assignment(id), "assignment"))
        .hasMessage("UNKNOWN_OUTCOME");
    assertThat(
            jdbc.queryForObject(
                "SELECT receipt->>'status' FROM studio_guided_assignments WHERE session_id=?",
                String.class,
                id))
        .isEqualTo("OWNED");
    String next = createSession();
    assertThat(dispatch.assign(controller, next, "assignment", "worker-1").path("status").asText())
        .isEqualTo("OWNED");
    assertThat(ENV.navigations.get()).isZero();
  }

  @Test
  void invalidAcknowledgedClaimNeverLaunchesAndUnassignedOrWrongWorkersCannotClaim()
      throws Exception {
    String id = createSession();
    ObjectNode claim =
        ENV.contracts
            .object()
            .put("schemaVersion", 3)
            .put("sessionId", id)
            .put("workerId", "worker-1")
            .put("expectedFence", 0);
    claim.set("versions", versions());
    // Adversarial credentials are used only for negative probes, never the positive ownership path.
    post(
        id,
        "claim",
        claim,
        "unassigned",
        token("owning-worker", "worker-1", "studio-guided-controller"),
        403);
    sessions.prepareAssignment(controller, id, "assignment", "worker-1");
    post(
        id,
        "claim",
        claim.deepCopy().put("workerId", "other-worker"),
        "wrong-assignee",
        token("owning-worker", "other-worker", "studio-guided-controller"),
        403);
    ENV.corruptClaimResponse = true;
    assertThatThrownBy(() -> dispatch.assign(controller, id, "assignment", "worker-1"))
        .isInstanceOf(GuidedSessionException.class);

    long styleScope006BridgeDeadline = System.nanoTime() + TimeUnit.MILLISECONDS.toNanos(5000);
    class BridgePoll6 {
      Throwable failure;
      boolean terminal;
      boolean slept;
      boolean initialAwaitTick = true;

      boolean step() {
        if (terminal) {
          return true;
        }
        try {
          if (slept && Thread.interrupted()) {
            throw new InterruptedException();
          }
          if (!(!(session(id).path("state").asText().equals("FAILED"))
              && System.nanoTime() < styleScope006BridgeDeadline)) {
            terminal = true;
            return true;
          }
          if (Thread.interrupted()) {
            throw new InterruptedException();
          }
          slept = true;
          return false;
        } catch (Throwable caught) {
          failure = caught;
          terminal = true;
          return true;
        }
      }
    }
    var styleScope006BridgePoll = new BridgePoll6();
    if (!styleScope006BridgePoll.step()) {
      try {
        org.awaitility.Awaitility.await()
            .alias("GuidedBridgeIntegrationTest: terminal failure recorded")
            .pollInSameThread()
            .dontCatchUncaughtExceptions()
            .pollDelay(Duration.ZERO)
            .pollInterval(Duration.ofMillis(25))
            .atMost(Duration.ofNanos(Math.max(1L, styleScope006BridgeDeadline - System.nanoTime())))
            .until(
                () -> {
                  if (styleScope006BridgePoll.initialAwaitTick) {
                    styleScope006BridgePoll.initialAwaitTick = false;
                    return false;
                  }
                  return styleScope006BridgePoll.step();
                });
      } catch (org.awaitility.core.ConditionTimeoutException bridgeTimeout) {
        if (!styleScope006BridgePoll.terminal) {
          styleScope006BridgePoll.step();
        }
      }
    }
    if (styleScope006BridgePoll.failure instanceof Exception exception) {
      throw exception;
    }
    if (styleScope006BridgePoll.failure instanceof Error error) {
      throw error;
    }
    assertThat(session(id).path("state").asText().equals("FAILED")).isTrue();

    assertThat(ENV.navigations.get()).isZero();
    assertThat(
            jdbc.queryForObject(
                "SELECT count(*) FROM studio_guided_materializations WHERE session_id=?",
                Integer.class,
                id))
        .isZero();
  }

  @Test
  void maximumFenceCanBeRenewedBySameOwnerWithoutAnotherAcquisition() throws Exception {
    String id = createSession();
    repository.transaction(
        () -> {
          var current = repository.lock(id);
          current.document().withObject("/owner").put("fence", Integer.MAX_VALUE - 1);
          repository.save(current);
          return null;
        });
    JsonNode receipt = dispatch.assign(controller, id, "max-fence", "worker-1");
    assertThat(receipt.path("ownerFence").asInt()).isEqualTo(Integer.MAX_VALUE);

    long styleScope007BridgeDeadline = System.nanoTime() + TimeUnit.MILLISECONDS.toNanos(15000);
    class BridgePoll7 {
      Throwable failure;
      boolean terminal;
      boolean slept;
      boolean initialAwaitTick = true;

      boolean step() {
        if (terminal) {
          return true;
        }
        try {
          if (slept && Thread.interrupted()) {
            throw new InterruptedException();
          }
          if (!(!(claimCount(id) >= 2) && System.nanoTime() < styleScope007BridgeDeadline)) {
            terminal = true;
            return true;
          }
          if (Thread.interrupted()) {
            throw new InterruptedException();
          }
          slept = true;
          return false;
        } catch (Throwable caught) {
          failure = caught;
          terminal = true;
          return true;
        }
      }
    }
    var styleScope007BridgePoll = new BridgePoll7();
    if (!styleScope007BridgePoll.step()) {
      try {
        org.awaitility.Awaitility.await()
            .alias("GuidedBridgeIntegrationTest: owner renewal recorded")
            .pollInSameThread()
            .dontCatchUncaughtExceptions()
            .pollDelay(Duration.ZERO)
            .pollInterval(Duration.ofMillis(25))
            .atMost(Duration.ofNanos(Math.max(1L, styleScope007BridgeDeadline - System.nanoTime())))
            .until(
                () -> {
                  if (styleScope007BridgePoll.initialAwaitTick) {
                    styleScope007BridgePoll.initialAwaitTick = false;
                    return false;
                  }
                  return styleScope007BridgePoll.step();
                });
      } catch (org.awaitility.core.ConditionTimeoutException bridgeTimeout) {
        if (!styleScope007BridgePoll.terminal) {
          styleScope007BridgePoll.step();
        }
      }
    }
    if (styleScope007BridgePoll.failure instanceof Exception exception) {
      throw exception;
    }
    if (styleScope007BridgePoll.failure instanceof Error error) {
      throw error;
    }
    assertThat(claimCount(id) >= 2).isTrue();

    assertThat(session(id).path("owner").path("fence").asInt()).isEqualTo(Integer.MAX_VALUE);
    assertThat(ENV.navigations.get()).isZero();
  }

  JsonNode session(String id) {
    return ENV.contracts.parse(
        jdbc.queryForObject(
            "SELECT document::text FROM studio_guided_sessions WHERE session_id=?",
            String.class,
            id));
  }

  JsonNode assignment(String id) {
    return ENV.contracts.parse(
        jdbc.queryForObject(
            "SELECT intent::text FROM studio_guided_assignments WHERE session_id=?",
            String.class,
            id));
  }

  int claimCount(String id) {
    return jdbc.queryForObject(
        "SELECT count(*) FROM studio_guided_commands WHERE namespace=? AND route='claim'",
        Integer.class,
        id);
  }

  @Test
  void legacyClarificationAnswerCannotResumeObservedV2Session() throws Exception {
    String id = prepareSession();
    repository.transaction(
        () -> {
          var current = repository.lock(id);
          current.document().put("state", "AWAITING_CLARIFICATION");
          repository.save(current);
          return null;
        });
    JsonNode before = progress(id).deepCopy();
    // STUDIO-OBS-012A: the v1 contract generation is deleted, so a schemaVersion-1 question is a
    // closed-contract refusal against contracts/v3 (it was RUNTIME_INCOMPATIBLE while the v1
    // schemas still loaded). The literal is the former v1 fixture document, kept as the legacy
    // body.
    ObjectNode legacyQuestion =
        (ObjectNode)
            ENV.contracts.parse(
                "{\"schemaVersion\":1,\"clarificationId\":\"question-1\",\"sessionId\":\"session-1\","
                    + "\"scopeHash\":\"2fec131b52b0144e082e963564fc3d114f068e5ef4d795a82c8f3b5653186861\","
                    + "\"coordinate\":{\"stepId\":\"step-2\",\"ordinal\":0},\"documentId\":\"document-1\","
                    + "\"generation\":1,\"reason\":\"AMBIGUOUS_TARGET\",\"promptCode\":\"CHOOSE_FIELD\","
                    + "\"choices\":[{\"choiceId\":\"choice-1\",\"safeLabel\":\"Order"
                    + " reference\",\"bindingId\":null}],\"expiresAt\":\"2026-10-08T03:10:00Z\"}");
    legacyQuestion.put("sessionId", id);
    assertThatThrownBy(
            () -> sessions.clarification(controller, id, 1, "legacy-question", legacyQuestion))
        .hasMessage("INVALID_CONTRACT");

    ObjectNode answer =
        ENV.contracts
            .object()
            .put("schemaVersion", 1)
            .put("clarificationId", "old-question")
            .put("choiceId", "old-choice")
            .put("generation", 0);
    assertThatThrownBy(() -> sessions.clarify(user, id, "legacy-answer", answer))
        .hasMessage("INVALID_CONTRACT");
    assertThat(session(id).path("state").asText()).isEqualTo("AWAITING_CLARIFICATION");
    assertThat(progress(id)).isEqualTo(before);
    assertThat(
            jdbc.queryForObject(
                "SELECT count(*) FROM studio_guided_commands WHERE namespace=? AND route='clarify'",
                Integer.class,
                id))
        .isZero();
  }

  @Test
  void actualAuthenticatedRawBytesRejectAmbiguityAndUnknownSignedClaims() throws Exception {
    String id = prepareSession();
    ObjectNode claim =
        ENV.contracts
            .object()
            .put("schemaVersion", 3)
            .put("sessionId", id)
            .put("workerId", "worker-1")
            .put("expectedFence", 1);
    claim.set("versions", versions());
    String valid = claim.toString();
    var payloads = new java.util.ArrayList<byte[]>();
    for (String raw :
        List.of(
            valid + " {}",
            valid.replace("\"schemaVersion\":3", "\"schemaVersion\":3,\"schemaVersion\":3"),
            valid.replace("\"workerId\":", "\"workerId\":\"worker-1\",\"\\u0077orkerId\":"),
            valid.replace("\"contract\":3", "\"contract\":3,\"contract\":3"),
            valid.replace("\"expectedFence\":1", "\"expectedFence\":1.0"),
            valid.replace("\"expectedFence\":1", "\"expectedFence\":1e0"),
            valid.replace("\"expectedFence\":1", "\"expectedFence\":-0"))) {
      payloads.add(raw.getBytes(StandardCharsets.UTF_8));
    }
    byte[] invalid = valid.getBytes(StandardCharsets.UTF_8);
    int position = valid.indexOf("worker-1");
    invalid[position] = (byte) 0xc3;
    invalid[position + 1] = (byte) 0x28;
    payloads.add(invalid);
    int index = 0;
    for (byte[] payload : payloads) {
      var response =
          rawBackendPost(
              id,
              payload,
              "malformed-" + index++,
              token("owning-worker", "worker-1", "studio-guided-controller"));
      assertThat(response.statusCode()).isEqualTo(422);
      assertThat(ENV.contracts.parseWire(response.body()).path("code").asText())
          .isEqualTo("INVALID_CONTRACT");
    }
    long now = Instant.now().getEpochSecond();
    String claims =
        ENV.contracts
            .object()
            .put("iss", "fixture-issuer")
            .put("sub", "worker-1")
            .put("role", "owning-worker")
            .put("aud", "studio-guided-controller")
            .put("iat", now)
            .put("exp", now + 60)
            .put("unknownSignedClaim", "must-reject")
            .toString();
    String header =
        Base64.getUrlEncoder()
            .withoutPadding()
            .encodeToString("{\"alg\":\"RS256\",\"typ\":\"JWT\"}".getBytes(StandardCharsets.UTF_8));
    String signed =
        header
            + "."
            + Base64.getUrlEncoder()
                .withoutPadding()
                .encodeToString(claims.getBytes(StandardCharsets.UTF_8));
    Signature signature = Signature.getInstance("SHA256withRSA");
    signature.initSign(ENV.issuer.getPrivate());
    signature.update(signed.getBytes(StandardCharsets.US_ASCII));
    String jwt =
        signed + "." + Base64.getUrlEncoder().withoutPadding().encodeToString(signature.sign());
    assertThat(
            rawBackendPost(id, valid.getBytes(StandardCharsets.UTF_8), "malformed-jwt", jwt)
                .statusCode())
        .isEqualTo(401);
    assertThat(
            jdbc.queryForObject(
                ("SELECT count(*) FROM studio_guided_commands WHERE namespace=? AND idempotency_key"
                    + " LIKE 'malformed-%'"),
                Integer.class,
                id))
        .isZero();
    assertThat(ENV.navigations.get()).isZero();
    assertThat(session(id).path("state").asText()).isEqualTo("PREPARING");
  }

  HttpResponse<byte[]> rawBackendPost(String id, byte[] body, String key, String bearer)
      throws Exception {
    return HttpClient.newBuilder()
        .sslContext(ENV.runnerSide)
        .build()
        .send(
            HttpRequest.newBuilder(
                    URI.create(
                        "https://localhost:"
                            + backendPort
                            + "/internal/v2/studio/guided-sessions/"
                            + id
                            + "/claim"))
                .header("Authorization", "Bearer " + bearer)
                .header("Content-Type", "application/json")
                .header("Idempotency-Key", key)
                .POST(HttpRequest.BodyPublishers.ofByteArray(body))
                .timeout(Duration.ofSeconds(10))
                .build(),
            HttpResponse.BodyHandlers.ofByteArray());
  }

  @Test
  void actualRunnerResponseBoundaryRejectsMalformedUtf8DuplicatesTrailingAndTimestampProfiles()
      throws Exception {
    String id = prepareSession();
    ObjectNode identity = materialization.identity(sessions.runnerContext(controller, id, 1));
    var proxy = com.sun.net.httpserver.HttpsServer.create(new InetSocketAddress("localhost", 0), 0);
    proxy.setHttpsConfigurator(
        new com.sun.net.httpserver.HttpsConfigurator(ENV.runnerSide) {
          @Override
          public void configure(com.sun.net.httpserver.HttpsParameters parameters) {
            var ssl = ENV.runnerSide.getDefaultSSLParameters();
            ssl.setNeedClientAuth(true);
            parameters.setSSLParameters(ssl);
          }
        });
    AtomicReference<byte[]> responseBytes = new AtomicReference<>();
    proxy.createContext(
        "/",
        exchange -> {
          exchange.getRequestBody().readAllBytes();
          byte[] bytes = responseBytes.get();
          exchange.getResponseHeaders().add("Content-Type", "application/json");
          exchange.sendResponseHeaders(200, bytes.length);
          exchange.getResponseBody().write(bytes);
          exchange.close();
        });
    proxy.start();
    try {
      var client =
          new HttpRunnerDispatchClient(
              URI.create("https://localhost:" + proxy.getAddress().getPort()),
              ENV.tls,
              () -> token("backend-controller", "controller-1", "studio-guided-runner"),
              ENV.contracts);
      String valid = identity.toString();
      var payloads = new java.util.ArrayList<byte[]>();
      for (String raw :
          List.of(
              valid + " {}",
              valid.replace("\"schemaVersion\":3", "\"schemaVersion\":3,\"schemaVersion\":3"))) {
        payloads.add(raw.getBytes(StandardCharsets.UTF_8));
      }
      byte[] invalid = valid.getBytes(StandardCharsets.UTF_8);
      int position = valid.indexOf("worker-1");
      invalid[position] = (byte) 0xc3;
      invalid[position + 1] = (byte) 0x28;
      payloads.add(invalid);
      for (byte[] bytes : payloads) {
        responseBytes.set(bytes);
        assertThatThrownBy(() -> client.send("context", identity)).hasMessage("INVALID_CONTRACT");
      }
      responseBytes.set(valid.getBytes(StandardCharsets.UTF_8));
      assertThat(client.send("context", identity)).isEqualTo(identity);
      JsonNode intent = assignment(id);
      ObjectNode receipt =
          ENV.contracts
              .object()
              .put("schemaVersion", 3)
              .put("status", "OWNED")
              .put("ownerFence", 1);
      receipt.set("assignment", intent);
      var vectors =
          ENV.contracts.parse(
              Files.readString(
                  Path.of(
                      "../docs/specs/studio-observed-authoring/contracts/v3/wire-parity.fixtures.json")));
      for (JsonNode vector : vectors.path("dateTimes")) {
        if (vector.path("accepted").asBoolean()) {
          continue;
        }
        receipt.put("leaseExpiresAt", vector.path("value").asText());
        responseBytes.set(receipt.toString().getBytes(StandardCharsets.UTF_8));
        assertThatThrownBy(() -> client.send("assign", intent)).hasMessage("INVALID_CONTRACT");
      }
    } finally {
      proxy.stop(0);
    }
  }

  String createSession() throws Exception {
    var connection =
        HttpClient.newHttpClient()
            .send(
                HttpRequest.newBuilder(URI.create(ENV.origin + "/connect")).GET().build(),
                HttpResponse.BodyHandlers.ofString());
    assertThat(connection.statusCode()).isEqualTo(200);
    assertThat(connection.body()).isEqualTo("controlled-public-fixture-account");
    ObjectNode start =
        ENV.contracts
            .object()
            .put("schemaVersion", 3)
            .put("testId", "test-1")
            .put("sourceRevision", "source-1")
            .put("configurationRevision", "config-1")
            .put("environmentId", "fixture");
    start.set("versions", versions());
    String id =
        sessions.start(user, UUID.randomUUID().toString(), start).path("sessionId").asText();
    // Fixture stand-in for GuidedProductionSessionAccess.initialize: same rows, hand manifest, no
    // acquisition marker; no case here plans or admits.
    repository.transaction(
        () -> {
          JsonNode session = repository.lock(id).document();
          ObjectNode manifest =
              ENV.contracts
                  .object()
                  .put("testId", session.path("testId").asText())
                  .put("sourceRevision", "source-1")
                  .put("configurationRevision", "config-1")
                  .put("policy", "INPUT-POLICY-01-A");
          manifest.set("sourceSteps", session.path("sourceSteps").deepCopy());
          new com.citi.put.checks.studio.guided.translation.GuidedTranslationStore(
                  jdbc, ENV.contracts)
              .initialize(session, manifest);
          return null;
        });
    return id;
  }

  String prepareSession() throws Exception {
    String id = createSession();
    dispatch.assign(controller, id, "assignment", "worker-1");
    materializeSession(id);
    return id;
  }

  void materializeSession(String id) {
    var refs = ENV.contracts.object().putArray("references");
    refs.add(
        ENV.contracts
            .object()
            .put("referenceKind", "sourceSpan")
            .put("sourceRevision", "source-1")
            .put("stepId", "step-1")
            .put("startUtf16", 6)
            .put("endUtf16", 6 + (ENV.origin + "/start").length())
            .put("kind", "destination"));
    String source =
        jdbc.queryForObject("SELECT source FROM bridge_fixture_sources WHERE id=1", String.class);
    refs.add(
        ENV.contracts
            .object()
            .put("referenceKind", "sourceSpan")
            .put("sourceRevision", "source-1")
            .put("stepId", "step-1")
            .put("startUtf16", source.lastIndexOf("fixture-input"))
            .put("endUtf16", source.lastIndexOf("fixture-input") + "fixture-input".length())
            .put("kind", "nonsecretText"));
    refs.add(
        ENV.contracts
            .object()
            .put("referenceKind", "configuration")
            .put("configurationRevision", "config-1")
            .put("stepId", "step-1")
            .put("referenceId", "config-value")
            .put("kind", "nonsecretText"));
    if (ENV.privacyEcho) {
      int start = source.indexOf(ENV.origin + "/echo");
      refs.add(
          ENV.contracts
              .object()
              .put("referenceKind", "sourceSpan")
              .put("sourceRevision", "source-1")
              .put("stepId", "step-1")
              .put("startUtf16", start)
              .put("endUtf16", start + (ENV.origin + "/echo").length())
              .put("kind", "destination"));
    }
    sessions.materialize(controller, id, 1, "materialize", refs);
  }

  JsonNode post(String id, String route, JsonNode body, String key, String token, int expected)
      throws Exception {
    var response =
        HttpClient.newBuilder()
            .sslContext(ENV.runnerSide)
            .build()
            .send(
                HttpRequest.newBuilder(
                        URI.create(
                            "https://localhost:"
                                + backendPort
                                + "/internal/v2/studio/guided-sessions/"
                                + id
                                + "/"
                                + route))
                    .header("Authorization", "Bearer " + token)
                    .header("Content-Type", "application/json")
                    .header("Idempotency-Key", key)
                    .header("X-Owner-Fence", "1")
                    .POST(HttpRequest.BodyPublishers.ofString(body.toString()))
                    .timeout(Duration.ofSeconds(25))
                    .build(),
                HttpResponse.BodyHandlers.ofString());
    assertThat(response.statusCode()).as("%s: %s", route, response.body()).isEqualTo(expected);
    return ENV.contracts.parse(response.body());
  }

  JsonNode progress(String id) {
    return ENV.contracts.parse(
        jdbc.queryForObject(
            "SELECT progress::text FROM studio_guided_sessions WHERE session_id=?",
            String.class,
            id));
  }

  static ObjectNode versions() {
    return (ObjectNode) ENV.contracts.parse("{\"contract\":3}");
  }

  static String token(String role, String subject, String audience) {
    return ENV.token(role, subject, audience);
  }
}
