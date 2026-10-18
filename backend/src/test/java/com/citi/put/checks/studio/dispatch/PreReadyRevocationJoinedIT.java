package com.citi.put.checks.studio.dispatch;

import static org.assertj.core.api.Assertions.assertThat;

import com.citi.put.checks.ChecksApplication;
import com.citi.put.checks.studio.StudioExecutionFixtures;
import com.citi.put.checks.studio.StudioService;
import com.citi.put.checks.studio.dto.ExecutionErrorCode;
import com.citi.put.checks.studio.guided.session.GuidedContracts;
import com.citi.put.checks.studio.recovery.RunningReaper;
import com.citi.put.checks.studio.secrets.FakeStudioVaultProvider;
import com.citi.put.checks.studio.secrets.SecretRevocationSweep;
import com.citi.put.checks.studio.secrets.StudioSecretFixtures;
import com.citi.put.checks.studio.secrets.StudioVaultProvider;
import com.citi.put.checks.studio.secrets.VaultScope;
import com.citi.put.checks.studio.support.ObservedPublicationFixture;
import com.citi.put.checks.studio.support.RunnerProcessHarness;
import com.citi.put.checks.studio.support.RunnerTestTls;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Duration;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.TimeUnit;
import org.assertj.core.api.SoftAssertions;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.context.annotation.Primary;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.core.Authentication;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.testcontainers.junit.jupiter.Testcontainers;

/**
 * STUDIO-OBS-009 AC-11 ADJ-1 c, the real-runner leg (W1.5 ruling part 2 §2.3, B-W3): a secret
 * revoked while the run is {@code ADMITTED} and has not started, with the real {@code dist/main.js}
 * runner held before Ready.
 *
 * <p>{@link PreReadyRevocationProbeIT} simulates the runner at the report boundary and proves the
 * ledger predicate (A1-A5). This class proves the same outcome with the runner itself: the real
 * dispatch client posts the job over TLS, the real runner validates and admits it and calls back
 * through the real internal routes, the real {@code SecretRevocationSweep} writes {@code
 * revoked_at}, and the runner's own recorded-revocation {@code FINAL} is accepted by the ledger.
 *
 * <p><b>The pause seam (R8's {@code initial-context-state.json}).</b> The runner's browser child
 * does not start a browser until the run is admitted, and Ready is reported only after the child's
 * initial-context check. The seam holds the child inside that check until the test says go:
 *
 * <ol>
 *   <li>A prelude, given to the harness as a {@code preload}, wraps {@code child_process.fork} in
 *       the runner's own process so the browser child is started from a small wrapper module that
 *       calls the same {@code startChild} the child's own entry point calls.
 *   <li>The wrapper wraps the child's initial-context check. While {@code
 *       initial-context-state.json} says {@code {"pause":true}} the check waits, and it writes
 *       {@code initial-context-entered} when it first runs, so the test knows the run is held
 *       before Ready (and has a live browser child, not a run that is still being admitted).
 * </ol>
 *
 * The runner's code, the build, the child's code and the pause-free path are all unchanged: only
 * the one check is delayed.
 *
 * <p><b>The build.</b> The synthetic observed revision of {@link ObservedPublicationFixture} names
 * a fixture build. The runner admits only the build it is, so the deployment catalog of this class
 * lists the real runner's build first (it is what the binding takes) and the fixture's second (it
 * is what the fixture published under). The runner is given the real build's catalog entry, the
 * policy of the run's scope, and the test CA for its callbacks.
 *
 * <p>Credit this class only on the F-merge {@code dist} digest (AC-12 i): the digest of the spawned
 * {@code dist} is written to {@code /tmp/studio-obs009-adj1-joined-worker.json}.
 */
@SpringBootTest(
    classes = ChecksApplication.class,
    webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT,
    properties = {
      "spring.main.banner-mode=off",
      "spring.jmx.enabled=false",
      "studio.execution.enabled=true",
      "studio.execution.video-store.provider=local"
    })
@ActiveProfiles("test")
@Testcontainers(disabledWithoutDocker = true)
@Import({ObservedPublicationFixture.FreshAuthority.class, PreReadyRevocationJoinedIT.Doubles.class})
class PreReadyRevocationJoinedIT {

  private static final GuidedContracts C = new GuidedContracts();
  private static final RunnerTestTls CA = RunnerTestTls.shared();
  private static final String SERVICE = "obs009-adj1-service-" + UUID.randomUUID();
  private static final String CALLBACK = "obs009-adj1-callback-" + UUID.randomUUID();
  private static final Path TEMP;
  private static final Path OBJECTS;
  private static final Path DIST;
  private static final int RUNNER_PORT;
  private static final String CATALOG_ENTRY;
  private static final String IMAGE_DIGEST = "c".repeat(64);

  private static final String CSI_ID = "60484";
  private static final String OWNER = "pre-ready-joined-owner@citi.com";
  private static final String ENVIRONMENT = "Production";
  private static final String SECRET = "LOGIN_PW";

  static {
    try {
      TEMP = Files.createTempDirectory("pre-ready-revocation-joined-");
      OBJECTS = Files.createDirectories(TEMP.resolve("objects"));
      DIST = RunnerProcessHarness.defaultDistDirectory().toAbsolutePath().normalize();
      RUNNER_PORT = RunnerProcessHarness.exclusivelyFreePort();
      CATALOG_ENTRY = realCatalogEntry();
      Files.writeString(TEMP.resolve("catalog.json"), CATALOG_ENTRY);
      // The runner selects its trusted policy by id and version and validates it against the run's
      // scope; the fixture lists one policy per environment under one id, so the runner is given
      // the one of this run's environment.
      ArrayNode policies = (ArrayNode) C.parse(ObservedPublicationFixture.policiesJsonWith());
      ArrayNode mine = C.object().arrayNode();
      for (JsonNode policy : policies) {
        if (policy.path("environment").asText().equals(ENVIRONMENT)) {
          mine.add(policy);
        }
      }
      assertThat(mine).hasSize(1);
      Files.writeString(TEMP.resolve("policies.json"), mine.toString());
      ObjectNode workerEvidence = C.object().put("snapshot", DIST.toString());
      workerEvidence.put("distDigest", RunnerProcessHarness.distDigestOf(DIST));
      Files.writeString(
          Path.of("/tmp/studio-obs009-adj1-joined-worker.json"), workerEvidence.toString());
    } catch (Exception failure) {
      throw new ExceptionInInitializerError(failure);
    }
  }

  /**
   * The real runner's own catalog entry ({@code {profile, build}}), computed from its {@code dist}
   * the way the guided replay IT does: the profile and the schema and reference bundle hashes come
   * from the validator module, the Chromium build from the recorded runtime versions, and the image
   * digest is the one this class passes the runner.
   */
  private static String realCatalogEntry() throws IOException, InterruptedException {
    String root = DIST.toUri().toString();
    String script =
        "import {readFileSync} from 'node:fs';"
            + "import {OBSERVED_PROFILE,hashObserved,OBSERVED_SCHEMA_BUNDLE_HASH} from '"
            + root
            + "validator/observedReferencePolicy.js';"
            + "const r=JSON.parse(readFileSync(new URL('"
            + root
            + "runtime-versions.json'),'utf8'));"
            + "console.log(JSON.stringify({profile:OBSERVED_PROFILE,build:{profileHash:"
            + "hashObserved(OBSERVED_PROFILE),schemaBundleHash:OBSERVED_SCHEMA_BUNDLE_HASH,"
            + "referenceBundleHash:r.observedReferenceBundleHash,chromiumBuild:"
            + "r.observedChromiumBuild,executableImageDigest:'"
            + IMAGE_DIGEST
            + "'}}));";
    Process process =
        new ProcessBuilder("node", "--input-type=module", "-e", script)
            .redirectErrorStream(true)
            .start();
    String output = new String(process.getInputStream().readAllBytes(), StandardCharsets.UTF_8);
    assertThat(process.waitFor(30, TimeUnit.SECONDS)).isTrue();
    assertThat(process.exitValue()).as("the catalog entry of the real runner").isZero();
    return output.strip();
  }

  /**
   * The deployment configuration of the backend: the real runner's build first (the binding takes
   * the first entry that matches the profile), the fixture's build second (the fixture published
   * its revision under it), and the runner reached over TLS with the one backend identity.
   */
  @DynamicPropertySource
  static void configuration(DynamicPropertyRegistry registry) {
    ObservedPublicationFixture.register(registry);
    ArrayNode catalog = C.object().arrayNode();
    catalog.add(C.parse(CATALOG_ENTRY));
    ((ArrayNode) C.parse(ObservedPublicationFixture.catalogJsonWith())).forEach(catalog::add);
    registry.add("studio.observed-replay.catalog-json", catalog::toString);
    // Client certificates are wanted, not required: the replay runner's callback client is Node's
    // fetch and presents none (the guided chain demands one itself).
    RunnerProcessHarness.backendServerSslProperties(CA)
        .forEach((name, value) -> registry.add(name, () -> value));
    registry.add("server.ssl.client-auth", () -> "want");
    RunnerProcessHarness.runnerTlsProperties(CA)
        .forEach((name, value) -> registry.add(name, () -> value));
    registry.add("studio.runner.base-url", () -> "https://127.0.0.1:" + RUNNER_PORT);
    registry.add("studio.runner.service-identity-token", () -> SERVICE);
    registry.add("studio.execution.callback.service-token", () -> CALLBACK);
    registry.add("studio.execution.video-store.directory", OBJECTS::toString);
  }

  /** A vault and an entitlement set this test can change. The dispatch client is the real one. */
  @TestConfiguration(proxyBeanMethods = false)
  static class Doubles {
    @Bean
    @Primary
    FakeStudioVaultProvider fakeStudioVaultProvider() {
      return new FakeStudioVaultProvider(Map.of());
    }

    @Bean
    @Primary
    StudioSecretFixtures.MutableSecretUseAuthorization mutableSecretUseAuthorization() {
      return new StudioSecretFixtures.MutableSecretUseAuthorization();
    }
  }

  @LocalServerPort private int backendPort;
  @Autowired private StudioService studioService;
  @Autowired private StudioDispatcher dispatcher;
  @Autowired private StudioDispatchLedgerStatements statements;
  @Autowired private SecretRevocationSweep sweep;
  @Autowired private RunningReaper reaper;
  @Autowired private FakeStudioVaultProvider vault;
  @Autowired private StudioSecretFixtures.MutableSecretUseAuthorization entitlements;
  @Autowired private JdbcTemplate jdbc;

  private StudioExecutionFixtures fixtures;
  private Authentication owner;
  private RunnerProcessHarness runner;
  private Path seam;
  private String secretValue;

  @BeforeEach
  void setUp() throws Exception {
    vault.clear();
    entitlements.clear();
    fixtures = new StudioExecutionFixtures(jdbc);
    fixtures.seedUser(OWNER);
    fixtures.seedCsi(CSI_ID, OWNER);
    ObservedPublicationFixture.clearLedger(jdbc, CSI_ID);
    owner = StudioExecutionFixtures.identity(OWNER, CSI_ID, "owner");

    // The pause seam: held from the first time the child reaches its initial-context check.
    seam = Files.createDirectories(TEMP.resolve("seam-" + UUID.randomUUID()));
    Files.writeString(seam.resolve("initial-context-state.json"), "{\"pause\":true}");
    Path wrapper = seam.resolve("child-wrapper.mjs");
    Files.writeString(wrapper, childWrapper(seam));
    runner =
        RunnerProcessHarness.builder(CA)
            .port(RUNNER_PORT)
            .serviceIdentity(SERVICE)
            .callbackIdentity(CALLBACK)
            .workDirectory(Files.createTempDirectory(TEMP, "runner-"))
            .callbackBaseUrl("https://localhost:" + backendPort)
            .preload(forkPrelude(wrapper, seam.resolve("http-trace.log")))
            .env("STUDIO_RUNNER_OBJECT_STORE_DIR", OBJECTS.toString())
            .env("STUDIO_RUNNER_OBSERVED_REPLAY_ENABLED", "true")
            .env("STUDIO_RUNNER_OBSERVED_CATALOG_FILE", TEMP.resolve("catalog.json").toString())
            .env("STUDIO_RUNNER_OBSERVED_IMAGE_DIGEST", IMAGE_DIGEST)
            .env("STUDIO_RUNNER_OBSERVED_POLICY_FILE", TEMP.resolve("policies.json").toString())
            .env("NODE_EXTRA_CA_CERTS", CA.caCertificate().toAbsolutePath().toString())
            .start();
    runner.awaitReady(Duration.ofSeconds(60));
  }

  @AfterEach
  void tearDown() throws Exception {
    // Release the seam first so a held child can leave, then stop the runner and what it left.
    if (seam != null) {
      Files.writeString(seam.resolve("initial-context-state.json"), "{\"pause\":false}");
    }
    var harness = runner;
    runner = null;
    if (harness != null) {
      var report = harness.teardown();
      report.assertNoSurvivors();
      report.assertCleanExit();
    }
  }

  /**
   * The prelude: the browser child is forked from {@code wrapper} instead of {@code
   * dist/run/child.js}. Everything else about the fork (arguments, environment, stdio, the IPC
   * channel) is the launcher's own. It also appends one line per HTTP response the runner's server
   * sends (method, path, status and the answer's body, which is only ever a closed {@code {code}}
   * or empty) to {@code trace}, so a refused submission names its reason in the test's failure.
   */
  private static String forkPrelude(Path wrapper, Path trace) {
    return "import childProcess from 'node:child_process';"
        + "import http from 'node:http';"
        + "import {appendFileSync} from 'node:fs';"
        + "import {syncBuiltinESMExports} from 'node:module';"
        + "const realFork=childProcess.fork;"
        + "childProcess.fork=(modulePath,...rest)=>realFork(String(modulePath).endsWith("
        + "'/run/child.js')?"
        + quoted(wrapper.toAbsolutePath().toString())
        + ":modulePath,...rest);"
        + "syncBuiltinESMExports();"
        + "const realEnd=http.ServerResponse.prototype.end;"
        + "http.ServerResponse.prototype.end=function(chunk,...rest){try{appendFileSync("
        + quoted(trace.toAbsolutePath().toString())
        + ",[this.req&&this.req.method,this.req&&this.req.url,this.statusCode,"
        + "typeof chunk==='string'?chunk.slice(0,200):''].join(' ')+'\\n');}catch{}"
        + "return realEnd.call(this,chunk,...rest);};";
  }

  /**
   * The child, with the one check delayed. It is the child's own entry point ({@code run/child.js},
   * {@code startChild} over the real build) apart from the wrapped {@code
   * observedInitialContextMatches}, which waits while the seam says pause.
   */
  private static String childWrapper(Path seamDirectory) {
    String root = DIST.toUri().toString();
    String directory = quoted(seamDirectory.toAbsolutePath().toString());
    return "import {readFileSync,writeFileSync} from 'node:fs';"
        + "import {startChild} from '"
        + root
        + "run/child.js';"
        + "import {loadObservedBuild} from '"
        + root
        + "compat/runtime-versions.js';"
        + "import {playwrightBrowserFactory} from '"
        + root
        + "run/browser.js';"
        + "const directory="
        + directory
        + ";"
        + "const state=()=>JSON.parse(readFileSync(directory+'/initial-context-state.json','utf8'));"
        + "const held=async(matches)=>{writeFileSync(directory+'/initial-context-entered','entered');"
        + "while(state().pause)await new Promise(r=>setTimeout(r,20));return matches();};"
        + "const launch=playwrightBrowserFactory.launch.bind(playwrightBrowserFactory);"
        + "playwrightBrowserFactory.launch=async request=>{const handle=await launch(request);"
        + "if(request.observedScope){const matches=handle.observedInitialContextMatches.bind(handle);"
        + "handle.observedInitialContextMatches=()=>held(matches);}return handle;};"
        + "const build=loadObservedBuild();"
        + "startChild(process,{...(build?{observedBuild:build}:{})});";
  }

  private static String quoted(String text) {
    return "\"" + text.replace("\\", "\\\\").replace("\"", "\\\"") + "\"";
  }

  // ---- the joined proof ----

  @Test
  void aPreReadyRevocationOfARealHeldRunIsSettledAsAuthorizationRevoked() throws Exception {
    UUID execution = dispatchedHeldRun();
    var admitted = ledger(execution);
    assertThat(admitted.get("state")).isEqualTo("ADMITTED");
    assertThat(admitted.get("revoked_at")).isNull();
    assertThat(browserStartedAt(execution)).as("pre-Ready: no browser start").isNull();
    assertThat(status(execution)).isEqualTo("PENDING");

    // The entitlement goes; the real sweep writes revoked_at on the ledger row.
    entitlements.revoke(OWNER, CSI_ID, ENVIRONMENT, SECRET);
    assertThat(sweep.executionRevoked(execution)).as("the sweep found the revocation").isTrue();
    assertThat(ledger(execution).get("revoked_at")).isNotNull();
    assertThat(ledger(execution).get("cancel_requested_at"))
        .as("a revocation is not a cancel request")
        .isNull();

    // The runner's next control read sees the recorded revocation and ends the held run.
    await(() -> !"ADMITTED".equals(ledger(execution).get("state")), 60_000);

    SoftAssertions soft = new SoftAssertions();
    soft.assertThat(status(execution)).isEqualTo("ERROR");
    soft.assertThat(errorCode(execution))
        .as("ADJ-1: the run ends AUTHORIZATION_REVOKED, not by the reaper's deadline")
        .isEqualTo(ExecutionErrorCode.AUTHORIZATION_REVOKED);
    soft.assertThat(browserStartedAt(execution)).as("no browser was ever started").isNull();
    // The terminal audit replays as on the cancel path: exactly one USAGE row for the secret. The
    // real runner's pre-Ready FINAL carries no secretUse, so the backend records what it cannot
    // infer, UNKNOWN_OUTCOME (a report that said NOT_USED would be recorded as NOT_USED).
    var usage =
        jdbc.queryForList(
            "SELECT usage_outcome FROM studio_secret_use_audit"
                + " WHERE execution_id = ? AND secret_id = ? AND row_kind = 'USAGE'",
            String.class,
            execution,
            SECRET);
    System.out.println("ADJ1-USAGE " + usage);
    soft.assertThat(usage)
        .as("the secret-use terminal audit replays as on the cancel path")
        .hasSize(1)
        .allSatisfy(outcome -> assertThat(outcome).isIn("NOT_USED", "UNKNOWN_OUTCOME"));
    soft.assertAll();

    // The evidence settles (the runner's own evidence callback closes the finalized row).
    awaitDescribed(
        () -> "DONE".equals(ledger(execution).get("state")),
        () ->
            "the finalized row was not closed by the runner's evidence: ledger state="
                + ledger(execution).get("state")
                + ", runner answers="
                + trace(),
        60_000);

    // The reaper finds nothing to settle, even once the start deadline has passed.
    jdbc.update(
        "UPDATE studio_dispatch_ledger SET start_deadline_at = now() - interval '1 minute'"
            + " WHERE execution_id = ?",
        execution);
    assertThat(reaper.reapOnce()).as("the reaper changes no row").isZero();
    assertThat(errorCode(execution)).isEqualTo(ExecutionErrorCode.AUTHORIZATION_REVOKED);

    // The runner's own account (value-free events): it stopped on a recorded control read, and its
    // terminal report was delivered at the first attempt (the ledger accepted it; a refused one is
    // report.ownership_lost). Nothing was typed and the value it was handed never reached its log.
    awaitDescribed(
        () -> logOf(runner).contains("\"event\":\"report.terminal_delivered\""),
        () -> "the runner never logged its terminal delivery: " + logOf(runner),
        10_000);
    String log = logOf(runner);
    assertThat(log)
        .contains("\"event\":\"run.cancel_requested\"", "\"source\":\"control\"")
        .contains("\"recorded\":true", "\"runnerSequence\":1,\"attempts\":1")
        .doesNotContain("report.ownership_lost", "report.terminal_rejected")
        .doesNotContain(secretValue);
  }

  /**
   * A secret-bearing observed run, dispatched to the real runner over TLS and held before Ready:
   * the ledger row is {@code ADMITTED} (the runner's own admission) and the child is inside the
   * initial-context check.
   */
  private UUID dispatchedHeldRun() throws Exception {
    UUID testId =
        fixtures.seedTest(
            "Pre-ready revocation joined draft", CSI_ID, OWNER, List.of("Go to the home page"));
    fixtures.confirmRevision(
        testId,
        CSI_ID,
        List.of("Go to the home page"),
        StudioExecutionFixtures.references(List.of(), List.of(SECRET)));
    entitlements.grant(OWNER, CSI_ID, ENVIRONMENT, SECRET);
    secretValue = "joined-value-" + UUID.randomUUID();
    vault.rotate(
        StudioVaultProvider.ReferenceKind.SECRET,
        VaultScope.of(CSI_ID, ENVIRONMENT, testId),
        SECRET,
        secretValue);
    // The vault entry names the origin the secret may be filled on; the runner's job schema
    // requires at least one for every secret it is handed.
    vault.bindOrigins(
        StudioVaultProvider.ReferenceKind.SECRET,
        VaultScope.of(CSI_ID, ENVIRONMENT, testId),
        SECRET,
        ObservedPublicationFixture.ORIGIN);
    UUID execution =
        studioService
            .executeTest(testId, owner, null, ObservedPublicationFixture.request(owner))
            .executionId();

    boolean sent = dispatcher.dispatch(execution);

    awaitDescribed(
        () -> "ADMITTED".equals(ledger(execution).get("state")),
        () ->
            "the real runner did not admit the run: send left the process="
                + sent
                + ", execution="
                + jdbc.queryForMap(
                    "SELECT status,error_code FROM ui_test_executions WHERE id=?", execution)
                + ", ledger state="
                + ledger(execution).get("state")
                + ", runner answers="
                + trace(),
        60_000);
    awaitDescribed(
        () -> Files.exists(seam.resolve("initial-context-entered")),
        () ->
            "the run was admitted but the child never reached the check; runner answers=" + trace(),
        60_000);
    return execution;
  }

  private static String logOf(RunnerProcessHarness harness) {
    try {
      return Files.readString(harness.logFile());
    } catch (IOException unreadable) {
      return "(unreadable)";
    }
  }

  /** The runner's HTTP answers so far (closed codes only), for a failure message. */
  private String trace() {
    try {
      Path file = seam.resolve("http-trace.log");
      return Files.exists(file) ? Files.readString(file).strip().replace('\n', '|') : "(none)";
    } catch (IOException unreadable) {
      return "(unreadable)";
    }
  }

  // ---- reads ----

  private Map<String, Object> ledger(UUID execution) {
    return statements.find(execution).orElseThrow();
  }

  private String status(UUID execution) {
    return jdbc.queryForObject(
        "SELECT status FROM ui_test_executions WHERE id = ?", String.class, execution);
  }

  private String errorCode(UUID execution) {
    return jdbc.queryForObject(
        "SELECT error_code FROM ui_test_executions WHERE id = ?", String.class, execution);
  }

  private Object browserStartedAt(UUID execution) {
    return jdbc.queryForObject(
        "SELECT browser_started_at FROM ui_test_executions WHERE id = ?", Object.class, execution);
  }

  private static void awaitDescribed(
      java.util.function.BooleanSupplier condition,
      java.util.function.Supplier<String> description,
      long timeout)
      throws InterruptedException {
    long end = System.nanoTime() + TimeUnit.MILLISECONDS.toNanos(timeout);
    while (!condition.getAsBoolean() && System.nanoTime() < end) {
      Thread.sleep(50);
    }
    assertThat(condition.getAsBoolean()).as(description.get()).isTrue();
  }

  private static void await(java.util.function.BooleanSupplier condition, long timeout)
      throws InterruptedException {
    long end = System.nanoTime() + TimeUnit.MILLISECONDS.toNanos(timeout);
    while (!condition.getAsBoolean() && System.nanoTime() < end) {
      Thread.sleep(50);
    }
    assertThat(condition.getAsBoolean()).isTrue();
  }
}
