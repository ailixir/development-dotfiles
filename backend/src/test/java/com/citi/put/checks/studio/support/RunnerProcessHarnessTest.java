package com.citi.put.checks.studio.support;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.citi.put.checks.studio.support.RunnerProcessHarness.ExitKind;
import com.citi.put.checks.studio.support.RunnerProcessHarness.Guided;
import com.citi.put.checks.studio.support.RunnerProcessHarness.HarnessView;
import com.citi.put.checks.studio.support.RunnerProcessHarness.RunnerStartException;
import com.citi.put.checks.studio.support.RunnerTestTls.Identity;
import com.sun.net.httpserver.HttpsConfigurator;
import com.sun.net.httpserver.HttpsExchange;
import com.sun.net.httpserver.HttpsParameters;
import com.sun.net.httpserver.HttpsServer;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.InetAddress;
import java.net.InetSocketAddress;
import java.net.StandardSocketOptions;
import java.net.URI;
import java.nio.channels.ServerSocketChannel;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.stream.Stream;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

/**
 * The runner process harness (STUDIO-OBS-009 lane I.0), proven against fake processes: no node, no
 * dist build and no browser is involved. The fake models what the real thing does that matters
 * here: killing a parent re-parents its children, so they vanish from {@code descendants()} but
 * stay alive.
 *
 * <p>What is proven: the environment the child gets (D1.0 keys, stray keys and debug variables
 * removed), readiness (event plus check, exit classification, no log content in messages), teardown
 * order (capture before any signal, term before kill, survivors reported), the safety rules
 * (zombies, re-used pids, pid 1 and the test JVM are never signalled), the collectors' dist digest,
 * and the TLS readiness check against real listeners.
 */
class RunnerProcessHarnessTest {

  private static RunnerTestTls ca;

  @TempDir Path temp;

  private final List<RunnerProcessHarness> started = new ArrayList<>();
  private final AtomicInteger workDirs = new AtomicInteger();
  private HttpsServer server;

  @BeforeAll
  static void generateCa() {
    ca = RunnerTestTls.shared();
  }

  @AfterEach
  void cleanUp() {
    started.forEach(RunnerProcessHarness::close);
    if (server != null) {
      server.stop(0);
      server = null;
    }
  }

  // ---- the environment the child gets ----

  @Test
  void theChildEnvironmentCarriesTheContractKeysAndNoStrayOnes() throws Exception {
    var env = new Capture();
    Map<String, String> inherited =
        Map.of(
            "PATH", "/usr/bin",
            "HOME", "/home/test",
            "STUDIO_RUNNER_STRAY", "1",
            "STUDIO_RUNNER_GUIDED_ENABLED", "true",
            "NODE_OPTIONS", "--max-old-space-size=1",
            "DEBUG", "*",
            "PWDEBUG", "1",
            "NODE_DEBUG", "net",
            "TMPDIR", "/elsewhere");

    RunnerProcessHarness harness = start(builder().inheritedEnvironment(() -> inherited), env);

    Map<String, String> child = env.environment;
    assertThat(child)
        .doesNotContainKeys(
            "STUDIO_RUNNER_STRAY",
            "STUDIO_RUNNER_GUIDED_ENABLED",
            "NODE_OPTIONS",
            "DEBUG",
            "PWDEBUG",
            "NODE_DEBUG");
    assertThat(child).containsEntry("PATH", "/usr/bin").containsEntry("HOME", "/home/test");
    assertThat(child.get("TMPDIR"))
        .isEqualTo(harness.tmpDirectory().toString())
        .isNotEqualTo("/elsewhere");
    assertThat(child)
        .containsEntry(RunnerProcessHarness.KEY_HOST, "127.0.0.1")
        .containsEntry(RunnerProcessHarness.KEY_PORT, Integer.toString(harness.port()))
        .containsEntry(
            RunnerProcessHarness.KEY_TLS_KEY_FILE,
            ca.privateKey(Identity.RUNNER).toAbsolutePath().toString())
        .containsEntry(
            RunnerProcessHarness.KEY_TLS_CERT_FILE,
            ca.certificate(Identity.RUNNER).toAbsolutePath().toString())
        .containsEntry(
            RunnerProcessHarness.KEY_TLS_CA_FILE, ca.caCertificate().toAbsolutePath().toString())
        .containsEntry(
            RunnerProcessHarness.KEY_CONTROLLER_FINGERPRINT, ca.fingerprint256(Identity.BACKEND))
        .containsEntry(RunnerProcessHarness.KEY_CALLBACK_BASE_URL, "https://127.0.0.1:1");
    assertThat(child.get(RunnerProcessHarness.KEY_CONTROLLER_FINGERPRINT))
        .matches("([0-9A-F]{2}:){31}[0-9A-F]{2}");
    assertThat(child.get(RunnerProcessHarness.KEY_SERVICE_IDENTITY)).isNotBlank();
    assertThat(child.get(RunnerProcessHarness.KEY_CALLBACK_IDENTITY)).isNotBlank();
    assertThat(child.keySet())
        .as("guided keys appear only when guided is configured")
        .noneMatch(name -> name.startsWith("STUDIO_RUNNER_GUIDED_"));
  }

  @Test
  void theCommandLineIsNodeAndTheEntrypointAndHoldsNoSecret() throws Exception {
    var env = new Capture();
    RunnerProcessHarness harness = start(builder(), env);

    assertThat(env.command).hasSize(2);
    assertThat(env.command.get(0)).isEqualTo("node");
    assertThat(env.command.get(1)).isEqualTo(dist().resolve("main.js").toAbsolutePath().toString());
    assertThat(env.command).doesNotContain(harness.serviceIdentity());
    assertThat(env.workingDirectory).isEqualTo(dist().toAbsolutePath().getParent());
    assertThat(harness.toString()).doesNotContain(harness.serviceIdentity());
    assertThat(harness.origin().getHost()).isEqualTo("127.0.0.1");
    assertThat(harness.origin().getPort()).isEqualTo(harness.port());
  }

  @Test
  void guidedModeAddsExactlyTheNineGuidedKeys() throws Exception {
    var env = new Capture();
    Guided guided =
        new Guided(
            "worker-1",
            temp.resolve("journal"),
            "fixture-issuer",
            "controller-1",
            temp.resolve("issuer.pub"),
            "https://127.0.0.1:9",
            temp.resolve("worker.jwt"));

    start(builder().guided(guided), env);

    var guidedKeys =
        env.environment.keySet().stream()
            .filter(k -> k.startsWith("STUDIO_RUNNER_GUIDED_"))
            .toList();
    assertThat(guidedKeys)
        .containsExactlyInAnyOrder(
            RunnerProcessHarness.KEY_GUIDED_ENABLED,
            RunnerProcessHarness.KEY_GUIDED_WORKER_ID,
            RunnerProcessHarness.KEY_GUIDED_CAPACITY,
            RunnerProcessHarness.KEY_GUIDED_JOURNAL_DIR,
            RunnerProcessHarness.KEY_GUIDED_CONTROLLER_ISSUER,
            RunnerProcessHarness.KEY_GUIDED_CONTROLLER_SUBJECT,
            RunnerProcessHarness.KEY_GUIDED_CONTROLLER_PUBLIC_KEY_FILE,
            RunnerProcessHarness.KEY_GUIDED_CALLBACK_BASE_URL,
            RunnerProcessHarness.KEY_GUIDED_CALLBACK_TOKEN_FILE);
    assertThat(env.environment)
        .containsEntry(RunnerProcessHarness.KEY_GUIDED_ENABLED, "true")
        .containsEntry(RunnerProcessHarness.KEY_GUIDED_WORKER_ID, "worker-1")
        .containsEntry(RunnerProcessHarness.KEY_GUIDED_CAPACITY, "1")
        .containsEntry(
            RunnerProcessHarness.KEY_ALLOWED_DOMAINS, String.join(",", TestDomains.ENTRIES))
        .containsEntry(RunnerProcessHarness.KEY_ALLOW_ALL_DOMAINS, "false")
        .containsEntry(
            RunnerProcessHarness.KEY_GUIDED_JOURNAL_DIR,
            temp.resolve("journal").toAbsolutePath().toString())
        .containsEntry(RunnerProcessHarness.KEY_GUIDED_CALLBACK_BASE_URL, "https://127.0.0.1:9");
  }

  @Test
  void anExplicitOverrideWinsSoANegativeTestCanBreakAValue() throws Exception {
    var env = new Capture();

    start(
        builder()
            .controllerFingerprint(ca.fingerprint256(Identity.ROGUE))
            .env(RunnerProcessHarness.KEY_SERVICE_IDENTITY, "overridden")
            .env("STUDIO_RUNNER_NOT_A_KEY", "x"),
        env);

    assertThat(env.environment)
        .containsEntry(
            RunnerProcessHarness.KEY_CONTROLLER_FINGERPRINT, ca.fingerprint256(Identity.ROGUE))
        .containsEntry(RunnerProcessHarness.KEY_SERVICE_IDENTITY, "overridden")
        .containsEntry("STUDIO_RUNNER_NOT_A_KEY", "x");
  }

  @Test
  void aMissingEntrypointIsRefusedByNameAndNothingIsLaunchedOrBuilt() {
    var env = new Capture();

    assertThatThrownBy(() -> builder().distDirectory(temp.resolve("absent")).launcher(env).start())
        .isInstanceOf(IllegalStateException.class)
        .hasMessageContaining("main.js")
        .hasMessageContaining("never builds");
    assertThat(env.launches).isZero();
  }

  @Test
  void aMissingCallbackUrlIsRefused() {
    var env = new Capture();

    assertThatThrownBy(
            () -> RunnerProcessHarness.builder(ca).distDirectory(dist()).launcher(env).start())
        .isInstanceOf(IllegalStateException.class)
        .hasMessageContaining("callbackBaseUrl");
    assertThat(env.launches).isZero();
  }

  // ---- readiness ----

  @Test
  void readyNeedsTheStartedEventAndThenTheCheck() throws Exception {
    var env = new Capture();
    FakeHandle parent = new FakeHandle(5001, Dying.ON_TERM, new Events());
    env.process = new FakeProcess(parent);
    AtomicInteger checks = new AtomicInteger();
    RunnerProcessHarness harness =
        start(
            builder()
                .readyCheck(
                    view -> {
                      checks.incrementAndGet();
                      return checks.get() >= 3;
                    }),
            env);

    CompletableFuture.runAsync(
        () -> {
          sleep(150);
          append(harness.logFile(), "{\"event\":\"runner.started\"}\n");
        });
    harness.awaitReady(Duration.ofSeconds(5));

    assertThat(checks.get())
        .as("the check is not asked before the runner logged runner.started; then until true")
        .isEqualTo(3);
  }

  @Test
  void anEarlyExitIsClassifiedAndTheMessageCarriesNoLogContent() throws Exception {
    for (int code : new int[] {78, 69, 1, 3}) {
      var env = new Capture();
      FakeHandle parent = new FakeHandle(5100 + code, Dying.ON_TERM, new Events());
      parent.die(code);
      env.process = new FakeProcess(parent);
      RunnerProcessHarness harness = start(builder(), env);
      append(harness.logFile(), "configuration rejected: CANARY-LOG-CONTENT\n");

      assertThatThrownBy(() -> harness.awaitReady(Duration.ofSeconds(2)))
          .isInstanceOfSatisfying(
              RunnerStartException.class,
              failure -> {
                assertThat(failure.exitCode()).isEqualTo(code);
                assertThat(failure.exitKind()).isEqualTo(ExitKind.of(code));
                assertThat(failure.getMessage())
                    .contains("exit " + code)
                    .contains(harness.logFile().toString())
                    .doesNotContain("CANARY-LOG-CONTENT")
                    .doesNotContain(harness.serviceIdentity());
              });
    }
    assertThat(ExitKind.of(0)).isEqualTo(ExitKind.CLEAN);
    assertThat(ExitKind.of(1)).isEqualTo(ExitKind.STARTUP_FAILURE);
    assertThat(ExitKind.of(69)).isEqualTo(ExitKind.PROCESS_TABLE_UNREADABLE);
    assertThat(ExitKind.of(78)).isEqualTo(ExitKind.CONFIGURATION_REJECTED);
    assertThat(ExitKind.of(2)).isEqualTo(ExitKind.OTHER);
  }

  @Test
  void notReadyInTimeLeavesTheProcessRunningForTheTeardownToReap() throws Exception {
    var env = new Capture();
    FakeHandle parent = new FakeHandle(5200, Dying.ON_TERM, new Events());
    env.process = new FakeProcess(parent);
    RunnerProcessHarness harness = start(builder().readyCheck(view -> false), env);
    append(harness.logFile(), "{\"event\":\"runner.started\"}\n");

    assertThatThrownBy(() -> harness.awaitReady(Duration.ofMillis(200)))
        .isInstanceOfSatisfying(
            RunnerStartException.class,
            failure -> {
              assertThat(failure.exitCode()).isNull();
              assertThat(failure.exitKind()).isNull();
              assertThat(failure.getMessage()).contains("not ready");
            });
    assertThat(parent.isAlive()).isTrue();

    harness.teardown();
    assertThat(parent.isAlive()).isFalse();
  }

  // ---- teardown ----

  @Test
  void descendantsAreCapturedBeforeTheParentIsSignalledAndAllAreReaped() throws Exception {
    Events events = new Events();
    FakeHandle parent = new FakeHandle(6000, Dying.ON_TERM, events);
    FakeHandle first = parent.child(6001, Dying.ON_TERM);
    FakeHandle second = parent.child(6002, Dying.ON_TERM);
    RunnerProcessHarness harness = start(builder(), capture(parent));

    RunnerProcessHarness.TeardownReport report = harness.teardown();

    assertThat(events.log.indexOf("descendants:6000"))
        .as("the tree is read before any signal")
        .isGreaterThanOrEqualTo(0)
        .isLessThan(events.log.indexOf("term:6000"));
    assertThat(parent.isAlive()).isFalse();
    assertThat(first.isAlive()).isFalse();
    assertThat(second.isAlive()).isFalse();
    assertThat(report.capturedBeforeKill()).extracting(f -> f.pid()).containsExactly(6001L, 6002L);
    assertThat(report.signalled()).extracting(f -> f.pid()).containsExactly(6001L, 6002L);
    assertThat(report.survivors()).isEmpty();
    assertThat(report.escalatedToForce()).isFalse();
    assertThat(report.exitCode()).isEqualTo(143);
    report.assertNoSurvivors();
    assertThat(parent.descendants().count())
        .as("the model: once the parent is gone nothing is left to find through it")
        .isZero();
  }

  @Test
  void aParentThatIgnoresTermIsForceKilledAfterTheGrace() throws Exception {
    Events events = new Events();
    FakeHandle parent = new FakeHandle(6100, Dying.ON_KILL, events);
    RunnerProcessHarness harness = start(builder(), capture(parent));

    RunnerProcessHarness.TeardownReport report = harness.teardown();

    assertThat(report.escalatedToForce()).isTrue();
    assertThat(events.log).containsSubsequence("term:6100", "kill:6100");
    assertThat(report.exitCode()).isEqualTo(137);
  }

  @Test
  void aDescendantThatIgnoresTermIsKilledAndOneThatCannotBeKilledIsReported() throws Exception {
    Events events = new Events();
    FakeHandle parent = new FakeHandle(6200, Dying.ON_TERM, events);
    FakeHandle stubborn = parent.child(6201, Dying.ON_KILL);
    FakeHandle immortal = parent.child(6202, Dying.NEVER);
    RunnerProcessHarness harness = start(builder(), capture(parent));

    RunnerProcessHarness.TeardownReport report = harness.teardown();

    assertThat(events.log).containsSubsequence("term:6201", "kill:6201");
    assertThat(stubborn.isAlive()).isFalse();
    assertThat(immortal.isAlive()).isTrue();
    assertThat(report.survivors()).extracting(f -> f.pid()).containsExactly(6202L);
    assertThatThrownBy(report::assertNoSurvivors)
        .isInstanceOf(AssertionError.class)
        .hasMessageContaining("6202");
  }

  @Test
  void zombiesAreNeitherSignalledNorCountedAsSurvivors() throws Exception {
    Events events = new Events();
    FakeHandle parent = new FakeHandle(6300, Dying.ON_TERM, events);
    FakeHandle zombie = parent.child(6301, Dying.ON_TERM);
    zombie.zombie = true;
    RunnerProcessHarness harness = start(builder(), capture(parent));

    RunnerProcessHarness.TeardownReport report = harness.teardown();

    assertThat(events.log).doesNotContain("term:6301", "kill:6301");
    assertThat(report.zombiesIgnored()).isEqualTo(1);
    assertThat(report.survivors()).isEmpty();
  }

  @Test
  void aReusedPidIsNeverSignalled() throws Exception {
    Events events = new Events();
    FakeHandle parent = new FakeHandle(6400, Dying.ON_TERM, events);
    FakeHandle child = parent.child(6401, Dying.NEVER);
    RunnerProcessHarness harness = start(builder(), capture(parent));
    harness.captureTree();
    // The child exits and another process takes its pid before the teardown.
    child.start = child.start.plusSeconds(60);

    RunnerProcessHarness.TeardownReport report = harness.teardown();

    assertThat(events.log).doesNotContain("term:6401", "kill:6401");
    assertThat(report.survivors()).isEmpty();
  }

  @Test
  void pidOneAndTheTestJvmAreNeverCapturedOrSignalled() throws Exception {
    Events events = new Events();
    FakeHandle parent = new FakeHandle(6500, Dying.ON_TERM, events);
    parent.child(1, Dying.ON_TERM);
    parent.child(ProcessHandle.current().pid(), Dying.ON_TERM);
    RunnerProcessHarness harness = start(builder(), capture(parent));

    RunnerProcessHarness.TeardownReport report = harness.teardown();

    assertThat(report.capturedBeforeKill()).isEmpty();
    assertThat(events.log)
        .doesNotContain("term:1", "kill:1", "term:" + ProcessHandle.current().pid());
  }

  @Test
  void teardownIsIdempotentAndCloseUsesIt() throws Exception {
    Events events = new Events();
    FakeHandle parent = new FakeHandle(6600, Dying.ON_TERM, events);
    parent.child(6601, Dying.ON_TERM);
    RunnerProcessHarness harness = start(builder(), capture(parent));

    var first = harness.teardown();
    int signals = events.log.size();
    var second = harness.teardown();
    harness.close();

    assertThat(second).isSameAs(first);
    assertThat(harness.teardownReport()).isSameAs(first);
    assertThat(events.log).hasSize(signals);
  }

  @Test
  void aParentThatAlreadyExitedStillHasItsCapturedChildrenReaped() throws Exception {
    Events events = new Events();
    FakeHandle parent = new FakeHandle(6700, Dying.ON_TERM, events);
    FakeHandle child = parent.child(6701, Dying.ON_TERM);
    RunnerProcessHarness harness = start(builder(), capture(parent));
    harness.captureTree();
    parent.die(0);

    RunnerProcessHarness.TeardownReport report = harness.teardown();

    assertThat(events.log).doesNotContain("term:6700");
    assertThat(child.isAlive()).isFalse();
    assertThat(report.signalled()).extracting(f -> f.pid()).containsExactly(6701L);
    assertThat(report.exitCode()).isZero();
  }

  @Test
  void kill9CapturesFirstAndLeavesTheReapingToTheTeardown() throws Exception {
    Events events = new Events();
    FakeHandle parent = new FakeHandle(6800, Dying.NEVER, events);
    parent.dyingOnKill = true;
    FakeHandle child = parent.child(6801, Dying.ON_TERM);
    RunnerProcessHarness harness = start(builder(), capture(parent));

    List<RunnerProcessHarness.ProcessFact> before = harness.kill9();

    assertThat(events.log.indexOf("descendants:6800")).isLessThan(events.log.indexOf("kill:6800"));
    assertThat(before).extracting(f -> f.pid()).containsExactly(6801L);
    assertThat(parent.isAlive()).isFalse();
    assertThat(child.isAlive()).as("an orphan: nobody reaped it yet").isTrue();
    assertThat(harness.survivorsOf(before)).extracting(f -> f.pid()).containsExactly(6801L);

    RunnerProcessHarness.TeardownReport report = harness.teardown();

    assertThat(child.isAlive()).isFalse();
    assertThat(harness.survivorsOf(before)).isEmpty();
    assertThat(report.capturedBeforeKill()).extracting(f -> f.pid()).containsExactly(6801L);
    assertThat(report.survivors()).isEmpty();
  }

  @Test
  void theGuidedBrowserListingMatchesOnlyThisHarnessDirectory() throws Exception {
    Events events = new Events();
    FakeHandle parent = new FakeHandle(6900, Dying.ON_TERM, events);
    var env = capture(parent);
    List<ProcessHandle> table = new CopyOnWriteArrayList<>();
    RunnerProcessHarness harness = start(builder().processes(table::stream), env);
    String dir = harness.tmpDirectory().getParent().getFileName().toString();
    FakeHandle mine = new FakeHandle(7001, Dying.ON_TERM, events);
    mine.commandLine = "chrome --user-data-dir=/x/" + dir + "/t/checks-guided-AbC";
    FakeHandle other = new FakeHandle(7002, Dying.ON_TERM, events);
    other.commandLine = "chrome --user-data-dir=/x/someone-else/t/checks-guided-XyZ";
    FakeHandle notGuided = new FakeHandle(7003, Dying.ON_TERM, events);
    notGuided.commandLine = "tail -f /x/" + dir + "/runner.log";
    table.addAll(List.of(mine, other, notGuided));

    assertThat(harness.survivingGuidedBrowsers()).extracting(f -> f.pid()).containsExactly(7001L);
  }

  // ---- lane I (W2): grace, private directories, wrapper, freeze ----

  @Test
  void aGuidedRunnerNeverGetsLessThanTheGuidedDrainGrace() throws Exception {
    Guided guided =
        new Guided(
            "worker-1",
            temp.resolve("journal"),
            "fixture-issuer",
            "controller-1",
            temp.resolve("issuer.pub"),
            "https://127.0.0.1:9",
            temp.resolve("worker.jwt"));

    RunnerProcessHarness plain = start(builder(), new Capture());
    RunnerProcessHarness guidedRunner = start(builder().guided(guided), new Capture());
    RunnerProcessHarness generous =
        start(builder().guided(guided).graceTimeout(Duration.ofSeconds(90)), new Capture());

    assertThat(RunnerProcessHarness.GUIDED_MINIMUM_GRACE)
        .isGreaterThanOrEqualTo(Duration.ofSeconds(65));
    assertThat(plain.graceTimeout())
        .as("not guided: as configured")
        .isEqualTo(Duration.ofMillis(300));
    assertThat(guidedRunner.graceTimeout())
        .as("guided: a short configured grace is raised")
        .isEqualTo(RunnerProcessHarness.GUIDED_MINIMUM_GRACE);
    assertThat(generous.graceTimeout())
        .as("guided: a longer one is kept")
        .isEqualTo(Duration.ofSeconds(90));
  }

  @Test
  void aCleanTeardownAssertsExitZeroWithoutForceAndAForcedKillIsNeverAccepted() throws Exception {
    Guided guided =
        new Guided(
            "worker-1",
            temp.resolve("journal"),
            "fixture-issuer",
            "controller-1",
            temp.resolve("issuer.pub"),
            "https://127.0.0.1:9",
            temp.resolve("worker.jwt"));
    FakeHandle clean = new FakeHandle(7100, Dying.ON_TERM, new Events());
    RunnerProcessHarness left =
        start(builder().guided(guided).guidedMinimumGrace(Duration.ofMillis(300)), capture(clean));
    clean.die(0);
    left.teardown().assertCleanExit();

    FakeHandle terminated = new FakeHandle(7101, Dying.ON_TERM, new Events());
    RunnerProcessHarness killedByTerm = start(builder(), capture(terminated));
    assertThatThrownBy(killedByTerm.teardown()::assertCleanExit)
        .isInstanceOf(AssertionError.class)
        .hasMessageContaining("exit code 143");

    FakeHandle stubborn = new FakeHandle(7102, Dying.ON_KILL, new Events());
    RunnerProcessHarness forced =
        start(
            builder().guided(guided).guidedMinimumGrace(Duration.ofMillis(300)), capture(stubborn));
    var report = forced.teardown();
    assertThat(report.escalatedToForce()).isTrue();
    assertThatThrownBy(report::assertCleanExit)
        .isInstanceOf(AssertionError.class)
        .hasMessageContaining("force-killed");

    // A forced kill is refused even when the exit code the report carries is 0.
    var forcedYetZero =
        new RunnerProcessHarness.TeardownReport(0, true, List.of(), List.of(), List.of(), 0);
    assertThatThrownBy(forcedYetZero::assertCleanExit).isInstanceOf(AssertionError.class);
    assertThatThrownBy(
            new RunnerProcessHarness.TeardownReport(null, false, List.of(), List.of(), List.of(), 0)
                ::assertCleanExit)
        .isInstanceOf(AssertionError.class);
  }

  @Test
  void aProcessThatIsAZombieWhenTheHandlePollsStillYieldsItsExitCode() throws Exception {
    FakeHandle late = new FakeHandle(7150, Dying.ON_TERM, new Events());
    late.reapedLate = true;
    RunnerProcessHarness harness = start(builder(), capture(late));

    var report = harness.teardown();

    assertThat(report.exitCode())
        .as("the exit status the reaper collects after the handle already said gone")
        .isEqualTo(143);
    assertThat(report.escalatedToForce()).isFalse();
  }

  @Test
  void aHandStartedRunnerEnvironmentIsScrubbedOfStrayKeysAndDebugVariables() {
    var environment =
        new java.util.HashMap<>(
            Map.of(
                "PATH",
                "/usr/bin",
                "STUDIO_RUNNER_STRAY",
                "1",
                "STUDIO_RUNNER_GUIDED_ENABLED",
                "true",
                "NODE_OPTIONS",
                "--inspect",
                "DEBUG",
                "*",
                "PWDEBUG",
                "1",
                "NODE_DEBUG",
                "net"));

    RunnerProcessHarness.scrubInheritedEnvironment(environment);

    assertThat(environment).containsOnlyKeys("PATH");
  }

  @Test
  void theMainInvocationImportsMainJsAndCallsItWithTheProcessStreams() {
    String call = RunnerProcessHarness.mainInvocation(Path.of("/x/dist/main.js"));

    assertThat(call)
        .contains("await import(\"file:///x/dist/main.js\")")
        .contains("await main({env:process.env")
        .contains("onSignal:(signal,handler)=>{process.on(signal,handler);}")
        .contains("RUNNER_START_FAILED");
  }

  @Test
  void theRunnerGetsItsOwnScratchAndObjectStoreAndACallerMayOverrideThem() throws Exception {
    var env = new Capture();
    RunnerProcessHarness harness = start(builder(), env);

    assertThat(env.environment)
        .containsEntry(
            RunnerProcessHarness.KEY_SCRATCH_DIR,
            harness.workDirectory().resolve("scratch").toAbsolutePath().toString())
        .containsEntry(
            RunnerProcessHarness.KEY_OBJECT_STORE_DIR,
            harness.workDirectory().resolve("objects").toAbsolutePath().toString());
    assertThat(env.environment.get(RunnerProcessHarness.KEY_SCRATCH_DIR))
        .as("the shared default is a wiped fixed path under /tmp")
        .doesNotStartWith("/tmp/studio-runner");

    var shared = new Capture();
    start(builder().env(RunnerProcessHarness.KEY_OBJECT_STORE_DIR, "/elsewhere/objects"), shared);
    assertThat(shared.environment)
        .containsEntry(RunnerProcessHarness.KEY_OBJECT_STORE_DIR, "/elsewhere/objects");
  }

  @Test
  void aPreloadIsWrittenAsOneModuleThatThenCallsMainAndNodeAcceptsIt() throws Exception {
    var env = new Capture();
    RunnerProcessHarness harness =
        start(builder().preload("import fs from 'node:fs';const marker=1;"), env);

    Path entry = Path.of(env.command.get(1));
    assertThat(entry.getFileName().toString()).isEqualTo("entry.mjs");
    assertThat(entry.getParent()).isEqualTo(harness.workDirectory());
    String source = Files.readString(entry);
    assertThat(source).startsWith("import fs from 'node:fs';const marker=1;\n");
    assertThat(source.indexOf("const marker=1"))
        .as("the prelude runs before main() is imported and called")
        .isLessThan(source.indexOf("await import("));
    assertThat(source)
        .contains(dist().resolve("main.js").toUri().toString())
        .contains("await main({env:process.env")
        .contains("RUNNER_START_FAILED")
        .doesNotContain(harness.serviceIdentity());
    assertThat(env.command.get(0)).isEqualTo("node");

    Process check;
    try {
      check =
          new ProcessBuilder("node", "--check", entry.toString()).redirectErrorStream(true).start();
    } catch (IOException noNode) {
      org.junit.jupiter.api.Assumptions.abort("node is not on PATH");
      return;
    }
    String output = new String(check.getInputStream().readAllBytes(), StandardCharsets.UTF_8);
    assertThat(check.waitFor(30, TimeUnit.SECONDS)).isTrue();
    assertThat(check.exitValue()).as(output).isZero();
  }

  @Test
  void freezeStopsOnlyThisHarnessBrowsersAndTheTeardownContinuesThemFirst() throws Exception {
    Events events = new Events();
    FakeHandle parent = new FakeHandle(7200, Dying.ON_TERM, events);
    List<ProcessHandle> table = new CopyOnWriteArrayList<>();
    RunnerProcessHarness harness =
        start(
            builder()
                .processes(table::stream)
                .signaller((signal, pid) -> events.log.add("signal:" + signal + ":" + pid)),
            capture(parent));
    String dir = harness.tmpDirectory().getParent().getFileName().toString();
    FakeHandle mine = new FakeHandle(7201, Dying.ON_TERM, events);
    mine.commandLine = "chrome --user-data-dir=/x/" + dir + "/t/checks-guided-AbC";
    FakeHandle foreign = new FakeHandle(7202, Dying.ON_TERM, events);
    foreign.commandLine = "chrome --user-data-dir=/x/someone-else/t/checks-guided-XyZ";
    table.addAll(List.of(mine, foreign));

    var listed = harness.survivingGuidedBrowsers();
    assertThat(harness.freeze(listed)).extracting(f -> f.pid()).containsExactly(7201L);
    assertThat(events.log).contains("signal:STOP:7201").doesNotContain("signal:STOP:7202");

    // The foreign browser, or a pid nobody listed, is refused and nothing is signalled.
    int before = events.log.size();
    assertThatThrownBy(
            () ->
                harness.freeze(
                    List.of(
                        new RunnerProcessHarness.ProcessFact(
                            7202, "/fake/bin/p7202", foreign.start))))
        .isInstanceOf(IllegalArgumentException.class);
    assertThatThrownBy(
            () ->
                harness.freeze(
                    List.of(new RunnerProcessHarness.ProcessFact(1, "/sbin/launchd", null))))
        .isInstanceOf(IllegalArgumentException.class);
    assertThat(events.log).hasSize(before);

    harness.teardown();

    assertThat(events.log)
        .as("continued before anything is terminated, so a frozen process can act on the term")
        .containsSubsequence("signal:STOP:7201", "signal:CONT:7201", "term:7200");
  }

  @Test
  void freezeNeverSignalsAReusedPidOrTheTestJvm() throws Exception {
    Events events = new Events();
    FakeHandle parent = new FakeHandle(7300, Dying.ON_TERM, events);
    List<ProcessHandle> table = new CopyOnWriteArrayList<>();
    RunnerProcessHarness harness =
        start(
            builder()
                .processes(table::stream)
                .signaller((signal, pid) -> events.log.add("signal:" + signal + ":" + pid)),
            capture(parent));
    String dir = harness.tmpDirectory().getParent().getFileName().toString();
    String line = "chrome --user-data-dir=/x/" + dir + "/t/checks-guided-AbC";
    FakeHandle reused = new FakeHandle(7301, Dying.ON_TERM, events);
    reused.commandLine = line;
    FakeHandle jvm = new FakeHandle(ProcessHandle.current().pid(), Dying.ON_TERM, events);
    jvm.commandLine = line;
    table.addAll(List.of(reused, jvm));
    var listed = harness.survivingGuidedBrowsers();
    reused.start = reused.start.plusSeconds(60);

    assertThatThrownBy(() -> harness.freeze(listed)).isInstanceOf(IllegalArgumentException.class);
    var onlyJvm = listed.stream().filter(f -> f.pid() == ProcessHandle.current().pid()).toList();
    assertThat(onlyJvm).hasSize(1);
    assertThatThrownBy(() -> harness.freeze(onlyJvm)).isInstanceOf(IllegalArgumentException.class);
    assertThat(events.log).noneMatch(entry -> entry.startsWith("signal:"));
  }

  @Test
  void theSpringPropertyHelpersPointAtTheRealCaFiles() throws Exception {
    var server = RunnerProcessHarness.backendServerSslProperties(ca);
    var client = RunnerProcessHarness.runnerTlsProperties(ca);

    assertThat(server)
        .containsEntry("server.ssl.client-auth", "need")
        .containsEntry("server.ssl.enabled", "true");
    assertThat(Path.of(server.get("server.ssl.key-store")))
        .isEqualTo(ca.keyStore(Identity.BACKEND))
        .exists();
    assertThat(Path.of(server.get("server.ssl.trust-store"))).isEqualTo(ca.trustStore()).exists();
    assertThat(server.get("server.ssl.key-store-password")).isNotBlank();
    assertThat(client.keySet())
        .containsExactlyInAnyOrder(
            "studio.runner.tls.key-store",
            "studio.runner.tls.key-store-password-file",
            "studio.runner.tls.trust-store",
            "studio.runner.tls.trust-store-password-file");
    client.values().forEach(value -> assertThat(Path.of(value)).exists());
    // The properties really open the stores with the passwords they carry.
    java.security.KeyStore keys = java.security.KeyStore.getInstance("PKCS12");
    try (var in = Files.newInputStream(Path.of(server.get("server.ssl.key-store")))) {
      keys.load(in, server.get("server.ssl.key-store-password").toCharArray());
    }
    assertThat(keys.size()).isEqualTo(1);
  }

  // ---- the dist digest ----

  @Test
  void theDistDigestIsTheCollectorsDigest() throws Exception {
    Path tree = Files.createDirectories(temp.resolve("digest"));
    Files.createDirectories(tree.resolve("a"));
    Files.createDirectories(tree.resolve("a-b"));
    Files.createDirectories(tree.resolve("z/deep"));
    Files.writeString(tree.resolve("a/x.js"), "1");
    Files.writeString(tree.resolve("a-b/x.js"), "2");
    Files.writeString(tree.resolve("main.js"), "3");
    Files.writeString(tree.resolve("z/deep/y.js"), "4\n");
    Files.writeString(tree.resolve("q\"uote.js"), "5");

    // Computed with the collector's code (capture-manifest.py: sorted(Path.rglob), compact
    // json.dumps, sha256) on the same five files: a/x.js sorts before a-b/x.js.
    assertThat(RunnerProcessHarness.distDigestOf(tree))
        .isEqualTo("10b6811a1a7e44566b0b5bfa334f821e478264a7b269ed07ebb1a2d80fed1ccf");
  }

  @Test
  void theManifestJsonEscapesLikePythonDoes() {
    assertThat(
            RunnerProcessHarness.distManifestJson(
                List.of(Map.entry("café\\\".js", "ab"), Map.entry("t\tab\n.js", "cd"))))
        .isEqualTo(
            "[{\"path\":\"caf\\u00e9\\\\\\\".js\",\"sha256\":\"ab\"},"
                + "{\"path\":\"t\\tab\\n.js\",\"sha256\":\"cd\"}]");
  }

  @Test
  void theHarnessRecordsTheDigestOfTheDistItSpawned() throws Exception {
    RunnerProcessHarness harness = start(builder(), new Capture());

    assertThat(harness.distDigest()).isEqualTo(RunnerProcessHarness.distDigestOf(dist()));
    assertThat(harness.distDigest()).matches("[0-9a-f]{64}");
  }

  // ---- ports ----

  @Test
  void aPortSomeoneHoldsIsNotExclusivelyFree() throws Exception {
    InetAddress loopback = InetAddress.getByName("127.0.0.1");
    try (ServerSocketChannel holder = ServerSocketChannel.open()) {
      holder.setOption(StandardSocketOptions.SO_REUSEADDR, false);
      holder.bind(new InetSocketAddress(loopback, 0));
      int held = ((InetSocketAddress) holder.getLocalAddress()).getPort();

      assertThat(RunnerProcessHarness.exclusivelyFree(loopback, held)).isFalse();
    }
    int chosen = RunnerProcessHarness.exclusivelyFreePort();
    assertThat(chosen).isBetween(33000, 39999);
    assertThat(RunnerProcessHarness.exclusivelyFree(loopback, chosen)).isTrue();
  }

  // ---- the default readiness check, against real listeners ----

  @Test
  void theDefaultCheckAcceptsARunnerThatTheCaIssuedAndRefusesEverythingElse() throws Exception {
    int port = RunnerProcessHarness.exclusivelyFreePort();
    HarnessView view = view(port, "service-token");

    startServer(
        port,
        Identity.RUNNER,
        ca.trustStore(),
        ca.trustStorePasswordFile(),
        true,
        200,
        "{\"ready\":true,\"draining\":false}",
        "service-token");
    assertThat(RunnerProcessHarness.readyOverTls(view)).isTrue();
    server.stop(0);

    startServer(
        port,
        Identity.RUNNER,
        ca.trustStore(),
        ca.trustStorePasswordFile(),
        true,
        503,
        "{\"ready\":false,\"draining\":true}",
        "service-token");
    assertThat(RunnerProcessHarness.readyOverTls(view)).as("draining").isFalse();
    server.stop(0);

    startServer(
        port,
        Identity.RUNNER,
        ca.trustStore(),
        ca.trustStorePasswordFile(),
        true,
        200,
        "{\"ready\":true}",
        "another-token");
    assertThat(RunnerProcessHarness.readyOverTls(view)).as("wrong bearer").isFalse();
    server.stop(0);

    // A stray listener on the port: same address, valid-looking answer, but a certificate that the
    // test CA did not issue.
    startServer(
        port,
        Identity.ROGUE,
        ca.rogueTrustStore(),
        ca.rogueTrustStorePasswordFile(),
        false,
        200,
        "{\"ready\":true}",
        "service-token");
    assertThat(RunnerProcessHarness.readyOverTls(view)).as("not issued by the CA").isFalse();
    server.stop(0);
    server = null;

    assertThat(RunnerProcessHarness.readyOverTls(view)).as("nothing listening").isFalse();
  }

  // ---- fixtures ----

  private Path dist() throws IOException {
    Path dist = temp.resolve("runner/dist");
    if (!Files.exists(dist.resolve("main.js"))) {
      Files.createDirectories(dist);
      Files.writeString(dist.resolve("main.js"), "// fake entrypoint\n");
    }
    return dist;
  }

  private RunnerProcessHarness.Builder builder() throws IOException {
    return RunnerProcessHarness.builder(ca)
        .distDirectory(dist())
        .callbackBaseUrl("https://127.0.0.1:1")
        .workDirectory(temp.resolve("work-" + workDirs.incrementAndGet()))
        .graceTimeout(Duration.ofMillis(300))
        .reapTimeout(Duration.ofMillis(300));
  }

  private RunnerProcessHarness start(RunnerProcessHarness.Builder builder, Capture capture) {
    if (capture.process == null) {
      capture.process = new FakeProcess(new FakeHandle(9999, Dying.ON_TERM, new Events()));
    }
    RunnerProcessHarness harness = builder.launcher(capture).start();
    started.add(harness);
    return harness;
  }

  private Capture capture(FakeHandle parent) {
    Capture capture = new Capture();
    capture.process = new FakeProcess(parent);
    return capture;
  }

  /** Records what the harness launched and hands back a prepared fake process. */
  private static final class Capture implements RunnerProcessHarness.Launcher {
    List<String> command;
    Map<String, String> environment;
    Path workingDirectory;
    Process process;
    int launches;

    @Override
    public Process launch(
        List<String> command, Map<String, String> environment, Path workingDirectory, Path log) {
      this.command = command;
      this.environment = environment;
      this.workingDirectory = workingDirectory;
      this.launches++;
      return process;
    }
  }

  private HarnessView view(int port, String token) {
    return new HarnessView() {
      @Override
      public URI origin() {
        return URI.create("https://127.0.0.1:" + port);
      }

      @Override
      public String serviceIdentity() {
        return token;
      }

      @Override
      public RunnerTestTls tls() {
        return ca;
      }
    };
  }

  private void startServer(
      int port,
      Identity identity,
      Path trust,
      Path trustPassword,
      boolean requireClient,
      int status,
      String body,
      String expectedBearer)
      throws Exception {
    var context = ca.serverContext(identity, trust, trustPassword);
    server = HttpsServer.create(new InetSocketAddress(InetAddress.getByName("127.0.0.1"), port), 0);
    server.setHttpsConfigurator(
        new HttpsConfigurator(context) {
          @Override
          public void configure(HttpsParameters parameters) {
            var params = context.getDefaultSSLParameters();
            params.setNeedClientAuth(requireClient);
            parameters.setSSLParameters(params);
          }
        });
    server.createContext(
        "/ready",
        exchange -> {
          boolean authorized =
              ("Bearer " + expectedBearer)
                  .equals(exchange.getRequestHeaders().getFirst("Authorization"));
          if (requireClient) {
            ((HttpsExchange) exchange).getSSLSession().getPeerPrincipal();
          }
          byte[] payload = body.getBytes(StandardCharsets.UTF_8);
          exchange.sendResponseHeaders(authorized ? status : 401, payload.length);
          exchange.getResponseBody().write(payload);
          exchange.close();
        });
    server.start();
  }

  private static void append(Path file, String text) {
    try {
      Files.writeString(
          file, text, StandardCharsets.UTF_8, java.nio.file.StandardOpenOption.APPEND);
    } catch (IOException failure) {
      throw new IllegalStateException(failure);
    }
  }

  private static void sleep(long millis) {
    try {
      Thread.sleep(millis);
    } catch (InterruptedException interrupted) {
      Thread.currentThread().interrupt();
    }
  }

  // ---- the fake process ----

  private enum Dying {
    /** Exits on SIGTERM (and on SIGKILL). */
    ON_TERM,
    /** Ignores SIGTERM and exits only on SIGKILL. */
    ON_KILL,
    /** Never exits. */
    NEVER
  }

  private static final class Events {
    final List<String> log = new CopyOnWriteArrayList<>();
  }

  /** A process handle whose children vanish from {@code descendants()} when it dies. */
  private static final class FakeHandle implements ProcessHandle {
    private final long pid;
    private final Dying dying;
    private final Events events;
    private final List<FakeHandle> children = new ArrayList<>();
    volatile boolean alive = true;
    volatile boolean zombie;
    volatile boolean dyingOnKill;

    /** On a signal that kills it: a zombie first, and its exit status is collected 150 ms later. */
    volatile boolean reapedLate;

    volatile Instant start = Instant.parse("2026-10-18T10:00:00Z");
    volatile String commandLine;
    volatile Integer exitCode;

    FakeHandle(long pid, Dying dying, Events events) {
      this.pid = pid;
      this.dying = dying;
      this.events = events;
    }

    FakeHandle child(long pid, Dying dying) {
      FakeHandle child = new FakeHandle(pid, dying, events);
      children.add(child);
      return child;
    }

    void die(int code) {
      alive = false;
      exitCode = code;
    }

    @Override
    public long pid() {
      return pid;
    }

    @Override
    public Optional<ProcessHandle> parent() {
      return Optional.empty();
    }

    @Override
    public Stream<ProcessHandle> children() {
      return alive
          ? children.stream().filter(c -> c.alive).map(c -> (ProcessHandle) c)
          : Stream.empty();
    }

    @Override
    public Stream<ProcessHandle> descendants() {
      events.log.add("descendants:" + pid);
      return all();
    }

    private Stream<ProcessHandle> all() {
      if (!alive) {
        return Stream.empty();
      }
      return children.stream()
          .filter(c -> c.alive)
          .flatMap(c -> Stream.concat(Stream.of((ProcessHandle) c), c.all()));
    }

    @Override
    public Info info() {
      FakeHandle self = this;
      return new Info() {
        @Override
        public Optional<String> command() {
          return self.zombie ? Optional.empty() : Optional.of("/fake/bin/p" + self.pid);
        }

        @Override
        public Optional<String> commandLine() {
          return self.zombie
              ? Optional.empty()
              : Optional.of(self.commandLine != null ? self.commandLine : "/fake/bin/p" + self.pid);
        }

        @Override
        public Optional<String[]> arguments() {
          return Optional.empty();
        }

        @Override
        public Optional<Instant> startInstant() {
          return Optional.ofNullable(self.start);
        }

        @Override
        public Optional<Duration> totalCpuDuration() {
          return Optional.empty();
        }

        @Override
        public Optional<String> user() {
          return Optional.empty();
        }
      };
    }

    @Override
    public CompletableFuture<ProcessHandle> onExit() {
      return new CompletableFuture<>();
    }

    @Override
    public boolean supportsNormalTermination() {
      return true;
    }

    @Override
    public boolean destroy() {
      events.log.add("term:" + pid);
      if (dying == Dying.ON_TERM && alive) {
        if (reapedLate) {
          zombie = true;
          Thread.ofVirtual()
              .start(
                  () -> {
                    sleep(150);
                    die(143);
                  });
        } else {
          die(143);
        }
      }
      return true;
    }

    @Override
    public boolean destroyForcibly() {
      events.log.add("kill:" + pid);
      if ((dying != Dying.NEVER || dyingOnKill) && alive) {
        die(137);
      }
      return true;
    }

    @Override
    public boolean isAlive() {
      return alive;
    }

    @Override
    public int compareTo(ProcessHandle other) {
      return Long.compare(pid, other.pid());
    }

    @Override
    public boolean equals(Object other) {
      return other instanceof FakeHandle handle && handle.pid == pid;
    }

    @Override
    public int hashCode() {
      return Long.hashCode(pid);
    }
  }

  private static final class FakeProcess extends Process {
    private final FakeHandle handle;

    FakeProcess(FakeHandle handle) {
      this.handle = handle;
    }

    @Override
    public OutputStream getOutputStream() {
      return OutputStream.nullOutputStream();
    }

    @Override
    public InputStream getInputStream() {
      return InputStream.nullInputStream();
    }

    @Override
    public InputStream getErrorStream() {
      return InputStream.nullInputStream();
    }

    @Override
    public int waitFor() throws InterruptedException {
      while (handle.alive) {
        Thread.sleep(5);
      }
      return handle.exitCode;
    }

    @Override
    public boolean waitFor(long timeout, TimeUnit unit) throws InterruptedException {
      long deadline = System.nanoTime() + unit.toNanos(timeout);
      while (handle.alive && System.nanoTime() < deadline) {
        Thread.sleep(5);
      }
      return !handle.alive;
    }

    @Override
    public int exitValue() {
      if (handle.alive) {
        throw new IllegalThreadStateException("running");
      }
      return handle.exitCode;
    }

    @Override
    public void destroy() {
      handle.destroy();
    }

    @Override
    public Process destroyForcibly() {
      handle.destroyForcibly();
      return this;
    }

    @Override
    public boolean isAlive() {
      return handle.alive;
    }

    @Override
    public ProcessHandle toHandle() {
      return handle;
    }
  }
}
