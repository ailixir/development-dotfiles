package com.citi.put.checks.studio.guided.publication;

import static org.assertj.core.api.Assertions.assertThat;

import com.citi.put.checks.studio.StudioExecutionProperties;
import com.citi.put.checks.studio.dispatch.ReferenceDeclarations;
import com.citi.put.checks.studio.dispatch.StudioDispatchLedgerStatements;
import com.citi.put.checks.studio.guided.session.GuidedContracts;
import com.citi.put.checks.studio.recovery.PendingReaper;
import com.citi.put.checks.studio.secrets.SecretAuditLifecycle;
import com.citi.put.checks.studio.secrets.SecretUseAuditRecorder;
import com.citi.put.checks.studio.secrets.StudioVaultProvider;
import com.citi.put.checks.studio.secrets.VaultScope;
import com.citi.put.checks.studio.secrets.VaultStudioReferenceResolver;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.sun.net.httpserver.HttpServer;
import java.io.File;
import java.net.InetSocketAddress;
import java.net.URI;
import java.net.URLClassLoader;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.attribute.PosixFilePermissions;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.Arrays;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.EnumSource;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.transaction.support.TransactionTemplate;

/** Actual resolver JVM death and counted fixture reads; no full Core/browser/Vault claim. */
public class ObservedResolverProcessCrashIT {
  public enum Cut {
    BEFORE_MARKER,
    COMMITTED_BEFORE_READ,
    READ_BEFORE_DECISION
  }

  private static final ObjectMapper JSON = new ObjectMapper();

  @ParameterizedTest
  @EnumSource(Cut.class)
  void realResolverJvmCrashSettlesActualCommittedCutWithoutAnotherRead(Cut cut) throws Exception {
    Path scratch =
        Files.createTempDirectory(
            "observed-resolver-crash-",
            PosixFilePermissions.asFileAttribute(PosixFilePermissions.fromString("rwx------")));
    Process child = null;
    HttpServer server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
    AtomicInteger reads = new AtomicInteger();
    AtomicInteger committedMarkersAtRead = new AtomicInteger(-1);
    String canary = "PROCESS-CRASH-" + UUID.randomUUID();
    try (var fixture = GuidedSecretLoginMigrationTest.publishedRetry()) {
      String providerPath = "/fixture/" + UUID.randomUUID();
      server.createContext(
          providerPath,
          exchange -> {
            try (exchange) {
              reads.incrementAndGet();
              committedMarkersAtRead.set(markers(fixture));
              byte[] body =
                  JSON.writeValueAsBytes(
                      JSON.createObjectNode()
                          .put("value", canary)
                          .put("version", "fixture-version-1"));
              try {
                exchange.sendResponseHeaders(200, body.length);
                exchange.getResponseBody().write(body);
              } finally {
                Arrays.fill(body, (byte) 0);
              }
            }
          });
      server.start();
      var ledger = new StudioDispatchLedgerStatements(fixture.jdbc());
      ledger.installSecretAudit(
          new SecretAuditLifecycle(fixture.jdbc(), new SecretUseAuditRecorder(fixture.jdbc())));
      assertThat(
              ledger.claim(
                  fixture.id(), "crash-worker", Instant.now().plusSeconds(60), Instant.now()))
          .isEqualTo(1);
      var source = (DriverManagerDataSource) fixture.jdbc().getDataSource();
      ObjectNode config =
          JSON.createObjectNode()
              .put("url", source.getUrl())
              .put("username", source.getUsername())
              .put("password", source.getPassword())
              .put("cut", cut.name())
              .put("provider", "http://127.0.0.1:" + server.getAddress().getPort() + providerPath)
              .put("stage", scratch.resolve("stage").toString());
      config.set("binding", fixture.original());
      Path configuration =
          Files.createFile(
              scratch.resolve("configuration.json"),
              PosixFilePermissions.asFileAttribute(PosixFilePermissions.fromString("rw-------")));
      Files.write(configuration, JSON.writeValueAsBytes(config));
      child =
          new ProcessBuilder(
                  Path.of(System.getProperty("java.home"), "bin", "java").toString(),
                  "-cp",
                  childClasspath(),
                  Child.class.getName(),
                  configuration.toString())
              .redirectErrorStream(true)
              .redirectOutput(scratch.resolve("child.log").toFile())
              .start();
      awaitStage(child, scratch.resolve("stage"), cut);
      long killedPid = child.pid();
      child.destroyForcibly();
      assertThat(child.waitFor(10, TimeUnit.SECONDS)).as("actual JVM terminated").isTrue();
      assertThat(child.exitValue()).isNotZero();
      assertThat(ProcessHandle.of(killedPid).map(ProcessHandle::isAlive).orElse(false)).isFalse();
      assertThat(markers(fixture)).isEqualTo(cut == Cut.BEFORE_MARKER ? 0 : 1);
      assertThat(reads.get()).isEqualTo(cut == Cut.READ_BEFORE_DECISION ? 1 : 0);
      if (cut == Cut.READ_BEFORE_DECISION) {
        assertThat(committedMarkersAtRead.get()).isEqualTo(1);
      }
      var properties =
          new StudioExecutionProperties(
              true, null, null, null, null, null, null, null, null, null, null, null);
      var reaper = new PendingReaper(ledger, null, properties);
      Instant deadline =
          fixture
              .jdbc()
              .queryForObject(
                  "SELECT pending_deadline_at FROM studio_dispatch_ledger WHERE execution_id=?",
                  java.sql.Timestamp.class,
                  fixture.id())
              .toInstant()
              .plusSeconds(1);
      ReflectionTestUtils.setField(reaper, "clock", Clock.fixed(deadline, ZoneOffset.UTC));
      assertThat(reaper.reapOnce()).isGreaterThanOrEqualTo(1);
      assertThat(
              fixture
                  .jdbc()
                  .queryForObject(
                      "SELECT usage_outcome FROM studio_secret_use_audit WHERE execution_id=?",
                      String.class,
                      fixture.id()))
          .isEqualTo(cut == Cut.BEFORE_MARKER ? "NOT_USED" : "UNKNOWN_OUTCOME");
      assertThat(
              fixture
                  .jdbc()
                  .queryForObject(
                      "SELECT count(*) FROM studio_observed_terminal_secret_settlements WHERE"
                          + " execution_id=?",
                      Integer.class,
                      fixture.id()))
          .isEqualTo(1);
      assertThat(
              fixture
                  .jdbc()
                  .queryForObject(
                      "SELECT count(*) FROM studio_secret_use_audit WHERE execution_id=? AND"
                          + " (row_kind='RELEASE' OR outcome IS NOT NULL OR release_id IS NOT NULL"
                          + " OR release_seq IS NOT NULL OR admission_id IS NOT NULL OR"
                          + " vault_version IS NOT NULL OR coordinate_step_id IS NOT NULL OR"
                          + " coordinate_ordinal IS NOT NULL OR source_reference_id IS NOT NULL)",
                      Integer.class,
                      fixture.id()))
          .isZero();
      assertThat(
              fixture
                  .jdbc()
                  .queryForObject(
                      "SELECT state='DONE' AND attempt_id IS NULL AND admission_id IS NULL "
                          + "FROM studio_dispatch_ledger WHERE execution_id=?",
                      Boolean.class,
                      fixture.id()))
          .isTrue();
      assertThat(
              fixture
                  .jdbc()
                  .queryForObject(
                      "SELECT observed_admission_receipt IS NULL AND error_code='DISPATCH_FAILED' "
                          + "FROM ui_test_executions WHERE id=?",
                      Boolean.class,
                      fixture.id()))
          .isTrue();
      assertThat(reaper.reapOnce()).isZero();
      assertThat(ledger.closeWithError(fixture.id(), "DISPATCH_UNKNOWN", Instant.now())).isZero();
      assertThat(reads.get()).isEqualTo(cut == Cut.READ_BEFORE_DECISION ? 1 : 0);
      assertThat(Files.readString(scratch.resolve("child.log"))).doesNotContain(canary);
    } finally {
      if (child != null && child.isAlive()) {
        child.destroyForcibly();
        if (!child.waitFor(10, TimeUnit.SECONDS)) {
          throw new IllegalStateException("Owned resolver child failed to terminate");
        }
      }
      server.stop(0);
      try (var paths = Files.walk(scratch)) {
        for (Path path : paths.sorted(java.util.Comparator.reverseOrder()).toList()) {
          Files.deleteIfExists(path);
        }
      }
    }
  }

  private static int markers(GuidedSecretLoginMigrationTest.RetryFixture fixture) {
    return fixture
        .jdbc()
        .queryForObject(
            "SELECT count(*) FROM studio_observed_secret_read_entries WHERE execution_id=?",
            Integer.class,
            fixture.id());
  }

  private static void awaitStage(Process child, Path stage, Cut cut) throws Exception {
    long deadline = System.nanoTime() + Duration.ofSeconds(30).toNanos();
    while (System.nanoTime() < deadline && child.isAlive()) {
      if (Files.exists(stage) && Files.readString(stage).equals(cut.name())) {
        return;
      }
      Thread.sleep(10);
    }
    throw new AssertionError("Child did not reach requested real process cut: " + cut);
  }

  public static String childClasspath() throws Exception {
    var entries = new LinkedHashSet<String>();
    for (ClassLoader loader = Child.class.getClassLoader();
        loader != null;
        loader = loader.getParent()) {
      if (loader instanceof URLClassLoader urls) {
        for (var url : urls.getURLs()) {
          if (url.getProtocol().equals("file")) {
            entries.add(Path.of(url.toURI()).toString());
          }
        }
      }
    }
    entries.addAll(List.of(System.getProperty("java.class.path").split(File.pathSeparator)));
    return String.join(File.pathSeparator, entries);
  }

  /** A real isolated JVM; stage blocks are test control, never simulated process death. */
  public static final class Child {
    private Child() {}

    public static void main(String[] args) throws Exception {
      var config = (ObjectNode) JSON.readTree(Files.readAllBytes(Path.of(args[0])));
      var source =
          new DriverManagerDataSource(
              config.path("url").asText(),
              config.path("username").asText(),
              config.path("password").asText());
      var jdbc = new JdbcTemplate(source);
      var tx = new TransactionTemplate(new DataSourceTransactionManager(source));
      var binding = config.path("binding");
      Cut cut = Cut.valueOf(config.path("cut").asText());
      var recorder = new SecretUseAuditRecorder(jdbc);
      var authorization =
          new ObservedReplayAuthorization(
              jdbc, new GuidedContracts(), null, null, null, null, null, Clock.systemUTC());
      var provider =
          new FixtureProvider(
              URI.create(config.path("provider").asText()),
              Path.of(config.path("stage").asText()),
              cut);
      var resolver =
          new VaultStudioReferenceResolver(provider, (principal, csi, environment, id) -> true);
      try (var resolved =
          resolver.resolve(
              "CSI",
              "Development",
              UUID.fromString(binding.path("testId").asText()),
              "owner@example.test",
              new ReferenceDeclarations(List.of(), List.of("PASS")),
              authorization.trackedReadEntry(
                  binding,
                  secret -> {
                    if (cut == Cut.BEFORE_MARKER) {
                      pause(Path.of(config.path("stage").asText()), cut);
                    }
                    tx.executeWithoutResult(
                        t -> recorder.recordObservedReadEntry(binding, "crash-worker", secret));
                    if (cut == Cut.COMMITTED_BEFORE_READ) {
                      pause(Path.of(config.path("stage").asText()), cut);
                    }
                  }))) {
        throw new AssertionError("Controlled cut unexpectedly returned from resolution");
      }
    }

    private static void pause(Path stage, Cut cut) {
      pause(stage, cut.name());
    }

    private static void pause(Path stage, String fixedLabel) {
      try {
        Files.createFile(
            stage,
            PosixFilePermissions.asFileAttribute(PosixFilePermissions.fromString("rw-------")));
        Files.writeString(stage, fixedLabel, StandardCharsets.UTF_8);
        if (new CountDownLatch(1).await(40, TimeUnit.SECONDS)) {
          throw new IllegalStateException("Unreachable child release");
        }
        throw new IllegalStateException("Parent failed to kill the controlled child");
      } catch (Exception failure) {
        throw new IllegalStateException("Child cut control failed", failure);
      }
    }
  }

  /** Test-only fixed guided stage; no ordinary replay read-entry/marker is created. */
  public static void pauseGuidedBeforeResolution(Path stage) {
    Child.pause(stage, "GUIDED_CONSUMED_BEFORE_RESOLVE");
  }

  public record FixtureProvider(URI uri, Path stage, Cut cut) implements StudioVaultProvider {
    @Override
    public String name() {
      return "parent-counted-process-crash-fixture";
    }

    @Override
    public Optional<VaultEntry> read(ReferenceKind kind, VaultScope scope, String name) {
      try (var client = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(5)).build()) {
        var response =
            client.send(
                HttpRequest.newBuilder(uri).timeout(Duration.ofSeconds(5)).GET().build(),
                HttpResponse.BodyHandlers.ofByteArray());
        byte[] bytes = response.body();
        char[] value;
        try {
          if (response.statusCode() != 200
              || kind != ReferenceKind.SECRET
              || !name.equals("PASS")) {
            throw new IllegalStateException("Unexpected fixture provider request");
          }
          value = JSON.readTree(bytes).path("value").asText().toCharArray();
        } finally {
          Arrays.fill(bytes, (byte) 0);
        }
        try {
          Child.pause(stage, cut);
          return Optional.of(
              new VaultEntry(value, "fixture-version-1", List.of("https://fixture.test")));
        } finally {
          Arrays.fill(value, '\0');
        }
      } catch (Exception failure) {
        throw new IllegalStateException("Controlled fixture provider failed");
      }
    }

    @Override
    public String create(VaultScope scope, String name, char[] value, List<String> origins) {
      throw new AssertionError("Unexpected fixture write");
    }

    @Override
    public List<String> listSecretNames(VaultScope scope) {
      throw new AssertionError("Unexpected fixture name query");
    }
  }
}
