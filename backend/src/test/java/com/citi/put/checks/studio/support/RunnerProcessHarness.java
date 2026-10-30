package com.citi.put.checks.studio.support;

import com.citi.put.checks.studio.support.RunnerTestTls.Identity;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.io.IOException;
import java.net.InetAddress;
import java.net.InetSocketAddress;
import java.net.ProtocolFamily;
import java.net.StandardProtocolFamily;
import java.net.StandardSocketOptions;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.channels.ServerSocketChannel;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.attribute.PosixFilePermissions;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.security.SecureRandom;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Base64;
import java.util.Comparator;
import java.util.HexFormat;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;
import java.util.Set;
import java.util.concurrent.ThreadLocalRandom;
import java.util.concurrent.TimeUnit;
import java.util.function.Supplier;
import java.util.stream.Stream;

/**
 * Spawns the one {@code studio-runner} process (STUDIO-OBS-009 AC-3 over TLS, AC-12 h and i, AC-11
 * k) for backend integration tests, waits for it to be ready, and reaps it, and every process it
 * left behind, when the test ends.
 *
 * <p>It builds against drop D1.0, {@code launch-contract.md}: one entrypoint, {@code node
 * dist/main.js}; one HTTPS listener with client-certificate authentication; guided mode as
 * configuration of that process ({@code STUDIO_RUNNER_GUIDED_ENABLED}); readiness as the {@code
 * runner.started} log event plus a {@code GET /ready} answered with 200 over mutual TLS; exit codes
 * 0, 1, 69 and 78. D1.0 is a draft until the architect and DevOps sign it; every name here that is
 * a proposal in D1.0 ([P]) is in one place below, the {@code KEY_*} constants, so a rename is a
 * one-file change.
 *
 * <h2>Why it exists</h2>
 *
 * <ul>
 *   <li><b>One test CA</b> ({@link RunnerTestTls}). The runner is started with its certificate, key
 *       and the CA bundle, and the backend side of the test presents the backend certificate whose
 *       fingerprint the runner pins as "the controller".
 *   <li><b>A collision cannot fake readiness</b> (AC-12 h). The old tests picked a port with {@code
 *       new ServerSocket(0)} and probed {@code 127.0.0.1} only, so a loopback-only listener on that
 *       port could redirect or satisfy the probe. The port here is chosen by an exclusive bind on
 *       both loopback families, and readiness needs three things together: the spawned process is
 *       still alive, its own log carries {@code runner.started}, and a TLS handshake whose server
 *       certificate chains to this CA (and covers the address) answered {@code GET /ready} with
 *       {@code 200}. A stray listener cannot present a certificate the per-instance CA issued.
 *   <li><b>The digest of the dist actually spawned</b> (AC-12 i). {@link #distDigest()} is computed
 *       before the spawn with the collector's own algorithm (see {@link #distDigestOf(Path)}), so
 *       QA can compare it with the {@code distDigest} the collectors record.
 *   <li><b>Descendants are captured before the kill</b> (AC-11 k). After a parent dies its children
 *       are re-parented and no longer appear in {@link ProcessHandle#descendants()}. {@link
 *       #captureTree()} and {@link #kill9()} take the snapshot first; {@link #teardown()} signals
 *       the captured processes after the parent is gone and reports any that survived.
 * </ul>
 *
 * <h2>Lifecycle</h2>
 *
 * <pre>{@code
 * try (var runner = RunnerProcessHarness.builder(RunnerTestTls.shared())
 *         .callbackBaseUrl("https://localhost:" + backendPort)
 *         .guided(guided)
 *         .start()
 *         .awaitReady(Duration.ofSeconds(30))) {
 *   // call runner.origin() with runner.backendTls()
 * } // close() = teardown(); the report is runner.teardownReport()
 * }</pre>
 *
 * <h2>Safety</h2>
 *
 * <ul>
 *   <li>It signals only the process it spawned and processes captured from that process's own tree,
 *       each re-checked (same pid, same start instant) immediately before a signal so a re-used pid
 *       is never signalled. It never signals pid 1 or below or this JVM.
 *   <li>A zombie (alive, no command, as macOS reports a child that exited but is not yet reaped) is
 *       neither signalled nor counted as a survivor.
 *   <li>No secret is placed on a command line. The service identity and callback identity are
 *       environment values, are not part of {@link #toString()}, and are never in an exception
 *       message. Failure messages carry the exit code and kind and the log file's path, never the
 *       log's content.
 *   <li>It never builds or installs the runner. A missing {@code dist/main.js} is a refusal that
 *       names the file; the build is the lane's, not the harness's.
 * </ul>
 */
public final class RunnerProcessHarness implements AutoCloseable {

  // ---- the names of D1.0 (all one place) ----

  /** Prefix of every runner configuration key. An unknown key under it refuses startup. */
  public static final String KEY_PREFIX = "STUDIO_RUNNER_";

  public static final String KEY_HOST = "STUDIO_RUNNER_HOST";
  public static final String KEY_PORT = "STUDIO_RUNNER_PORT";
  public static final String KEY_TLS_KEY_FILE = "STUDIO_RUNNER_TLS_KEY_FILE";
  public static final String KEY_TLS_CERT_FILE = "STUDIO_RUNNER_TLS_CERT_FILE";
  public static final String KEY_TLS_CA_FILE = "STUDIO_RUNNER_TLS_CA_FILE";
  public static final String KEY_CONTROLLER_FINGERPRINT =
      "STUDIO_RUNNER_CONTROLLER_CERTIFICATE_FINGERPRINT256";

  /** The navigation allow-list (STUDIO-FLEX-001); the harness sets the fixtures' domains. */
  public static final String KEY_ALLOWED_DOMAINS = "STUDIO_RUNNER_ALLOWED_DOMAINS";

  public static final String KEY_ALLOW_ALL_DOMAINS = "STUDIO_RUNNER_ALLOW_ALL_DOMAINS";

  public static final String KEY_SERVICE_IDENTITY = "STUDIO_RUNNER_SERVICE_IDENTITY";
  public static final String KEY_CALLBACK_IDENTITY = "STUDIO_RUNNER_CALLBACK_IDENTITY";
  public static final String KEY_CALLBACK_BASE_URL = "STUDIO_RUNNER_CALLBACK_BASE_URL";
  public static final String KEY_SCRATCH_DIR = "STUDIO_RUNNER_SCRATCH_DIR";
  public static final String KEY_OBJECT_STORE_DIR = "STUDIO_RUNNER_OBJECT_STORE_DIR";

  public static final String KEY_GUIDED_ENABLED = "STUDIO_RUNNER_GUIDED_ENABLED";
  public static final String KEY_GUIDED_WORKER_ID = "STUDIO_RUNNER_GUIDED_WORKER_ID";

  /** Learning sessions the guided process owns at once (1 to 8, required with guided mode). */
  public static final String KEY_GUIDED_CAPACITY = "STUDIO_RUNNER_GUIDED_CAPACITY";

  public static final String KEY_GUIDED_JOURNAL_DIR = "STUDIO_RUNNER_GUIDED_JOURNAL_DIR";
  public static final String KEY_GUIDED_CONTROLLER_ISSUER =
      "STUDIO_RUNNER_GUIDED_CONTROLLER_ISSUER";
  public static final String KEY_GUIDED_CONTROLLER_SUBJECT =
      "STUDIO_RUNNER_GUIDED_CONTROLLER_SUBJECT";
  public static final String KEY_GUIDED_CONTROLLER_PUBLIC_KEY_FILE =
      "STUDIO_RUNNER_GUIDED_CONTROLLER_PUBLIC_KEY_FILE";
  public static final String KEY_GUIDED_CALLBACK_BASE_URL =
      "STUDIO_RUNNER_GUIDED_CALLBACK_BASE_URL";
  public static final String KEY_GUIDED_CALLBACK_TOKEN_FILE =
      "STUDIO_RUNNER_GUIDED_CALLBACK_TOKEN_FILE";

  /** The log event D1.0 section 7 names as "listening". */
  public static final String STARTED_EVENT = "runner.started";

  /**
   * Variables that make a guided-enabled runner refuse to start (D1.0 section 2.5), removed from
   * the child's environment whatever the developer's shell holds.
   */
  private static final Set<String> DEBUG_VARIABLES =
      Set.of("DEBUG", "PWDEBUG", "NODE_DEBUG", "NODE_OPTIONS");

  /**
   * The SIGTERM grace of a guided-enabled runner (ruling W1.5 part 1, I-T1): the Q5 guided drain
   * arithmetic is about 63 s, rounded up. A smaller configured grace is raised to this.
   */
  public static final Duration GUIDED_MINIMUM_GRACE = Duration.ofSeconds(65);

  /**
   * Environment variable that points the harness at another {@code dist} directory than {@code
   * ../studio-runner/dist}. It exists so a scratch emit of the runner source can stand in before
   * the one rebuild of {@code dist} (never for credited evidence: the spawned dist's digest is what
   * counts, {@link #distDigest()}).
   */
  public static final String DIST_OVERRIDE_VARIABLE = "OBS009_RUNNER_DIST";

  private static final int FIRST_PORT = 33000;
  private static final int LAST_PORT = 39999;
  private static final int MAX_PORT_ATTEMPTS = 200;
  private static final Duration POLL = Duration.ofMillis(25);
  private static final ObjectMapper JSON = new ObjectMapper();

  // ---- value types ----

  /** The exit-code classes of D1.0 section 6. */
  public enum ExitKind {
    /** 0: a clean end after a drain. */
    CLEAN,
    /** 1: any failure after configuration was accepted (bind error, build mismatch, sweep). */
    STARTUP_FAILURE,
    /** 69: the process table cannot list this process. */
    PROCESS_TABLE_UNREADABLE,
    /** 78: configuration or a guided guard refused. */
    CONFIGURATION_REJECTED,
    /** Any other code, or a signal. */
    OTHER;

    /** Classifies an exit code. */
    public static ExitKind of(int code) {
      return switch (code) {
        case 0 -> CLEAN;
        case 1 -> STARTUP_FAILURE;
        case 69 -> PROCESS_TABLE_UNREADABLE;
        case 78 -> CONFIGURATION_REJECTED;
        default -> OTHER;
      };
    }
  }

  /** The runner never reached ready: it exited, or it did not become ready in time. */
  public static final class RunnerStartException extends IllegalStateException {
    private static final long serialVersionUID = 1L;

    private final Integer exitCode;
    private final ExitKind exitKind;

    RunnerStartException(String message, Integer exitCode) {
      super(message);
      this.exitCode = exitCode;
      this.exitKind = exitCode == null ? null : ExitKind.of(exitCode);
    }

    /** The exit code, or null when the process was still running at the deadline. */
    public Integer exitCode() {
      return exitCode;
    }

    /** The class of the exit code, or null when the process was still running. */
    public ExitKind exitKind() {
      return exitKind;
    }
  }

  /** Guided mode configuration (D1.0 section 2.4). The files are the caller's to create. */
  public record Guided(
      String workerId,
      Path journalDirectory,
      String controllerIssuer,
      String controllerSubject,
      Path controllerPublicKeyFile,
      String callbackBaseUrl,
      Path callbackTokenFile) {}

  /** One process, as a fact that survives the process: no handle, no command-line arguments. */
  public record ProcessFact(long pid, String command, Instant startedAt) {}

  /** What a teardown did. All lists are facts; none holds a live handle. */
  public record TeardownReport(
      Integer exitCode,
      boolean escalatedToForce,
      List<ProcessFact> capturedBeforeKill,
      List<ProcessFact> signalled,
      List<ProcessFact> survivors,
      int zombiesIgnored) {

    /**
     * Fails unless the runner left by itself, with exit code 0, inside the grace (ruling W1.5 part
     * 1, I-T1). A forced kill is recorded in this report and is never silently accepted.
     */
    public void assertCleanExit() {
      if (exitCode == null || exitCode != 0 || escalatedToForce) {
        throw new AssertionError(
            "the runner did not leave cleanly: exit code "
                + exitCode
                + (escalatedToForce ? ", force-killed after the grace" : ""));
      }
    }

    /** Fails if anything the process left behind is still running. */
    public void assertNoSurvivors() {
      if (!survivors.isEmpty()) {
        throw new AssertionError(
            "processes survived the runner teardown: "
                + survivors.stream().map(fact -> fact.pid() + " " + fact.command()).toList());
      }
    }
  }

  /** How to start a process: a seam so that a fake process can stand in for node. */
  @FunctionalInterface
  public interface Launcher {
    Process launch(
        List<String> command, Map<String, String> environment, Path workingDirectory, Path log)
        throws IOException;
  }

  /**
   * Sends a stop or continue signal to a process: a seam so the unit test needs no real process.
   * The signal is {@code STOP} or {@code CONT}; the JDK cannot send either.
   */
  @FunctionalInterface
  public interface Signaller {
    void signal(String signal, long pid) throws IOException;
  }

  /** Whether the spawned runner answers {@code GET /ready}: a seam for the same reason. */
  @FunctionalInterface
  public interface ReadyCheck {
    boolean ready(HarnessView harness);
  }

  /** What a {@link ReadyCheck} may read. It carries no secret except the bearer it must send. */
  public interface HarnessView {
    URI origin();

    String serviceIdentity();

    RunnerTestTls tls();
  }

  // ---- builder ----

  /**
   * Starts a builder for a runner that trusts {@code tls}'s CA and pins its backend certificate.
   */
  public static Builder builder(RunnerTestTls tls) {
    return new Builder(tls);
  }

  /** Configuration of one runner process. Every value has a test-safe default. */
  public static final class Builder {
    private final RunnerTestTls tls;
    private Path distDirectory = defaultDistDirectory();
    private String node = "node";
    private String host = "127.0.0.1";
    private int port;
    private String serviceIdentity = randomToken();
    private String callbackIdentity = randomToken();
    private String callbackBaseUrl;
    private String controllerFingerprint;
    private Guided guided;
    private final Map<String, String> extra = new LinkedHashMap<>();
    private Path workDirectory;
    private Launcher launcher = RunnerProcessHarness::launchWithProcessBuilder;
    private ReadyCheck readyCheck = RunnerProcessHarness::readyOverTls;
    private Supplier<Stream<ProcessHandle>> processes = ProcessHandle::allProcesses;
    private Supplier<Map<String, String>> inherited = System::getenv;
    private Duration graceTimeout = Duration.ofSeconds(20);
    private Duration guidedMinimumGrace = GUIDED_MINIMUM_GRACE;
    private Duration reapTimeout = Duration.ofSeconds(5);
    private Signaller signaller = RunnerProcessHarness::signalWithShell;
    private String preload;

    private Builder(RunnerTestTls tls) {
      this.tls = Objects.requireNonNull(tls, "tls");
    }

    /** The {@code dist} directory to spawn; its {@code main.js} is the entrypoint. */
    public Builder distDirectory(Path distDirectory) {
      this.distDirectory = distDirectory;
      return this;
    }

    /** The node executable; default {@code node} from {@code PATH}. */
    public Builder node(String node) {
      this.node = node;
      return this;
    }

    /** The listener host; default {@code 127.0.0.1} (the certificate covers it). */
    public Builder host(String host) {
      this.host = host;
      return this;
    }

    /** A fixed port, or 0 (default) to choose an exclusively free one at start. */
    public Builder port(int port) {
      this.port = port;
      return this;
    }

    /** The {@code /v2/runs} and probe bearer; default a fresh random token. */
    public Builder serviceIdentity(String token) {
      this.serviceIdentity = token;
      return this;
    }

    /** The replay callback bearer; default a fresh random token. */
    public Builder callbackIdentity(String token) {
      this.callbackIdentity = token;
      return this;
    }

    /** The replay callback destination (an https URL of the backend); required. */
    public Builder callbackBaseUrl(String url) {
      this.callbackBaseUrl = url;
      return this;
    }

    /**
     * The controller fingerprint the runner pins; default the test backend certificate's. Override
     * it to test a wrong pin.
     */
    public Builder controllerFingerprint(String fingerprint256) {
      this.controllerFingerprint = fingerprint256;
      return this;
    }

    /** Enables guided mode with these settings; default off, with no guided key set. */
    public Builder guided(Guided guided) {
      this.guided = guided;
      return this;
    }

    /**
     * Sets or overrides one environment variable of the child, after all the harness's own, so a
     * test can break a value on purpose. A {@code STUDIO_RUNNER_*} name the runner does not accept
     * refuses startup; that is the point of a negative test.
     */
    public Builder env(String name, String value) {
      this.extra.put(name, value);
      return this;
    }

    /**
     * The harness's private directory (log, scratch {@code TMPDIR}). Default: a fresh directory
     * under the system temp directory, which the harness never deletes (a failure message points at
     * the log inside it). Pass a directory under {@code @TempDir} to have it removed with the test.
     */
    public Builder workDirectory(Path workDirectory) {
      this.workDirectory = workDirectory;
      return this;
    }

    /** Replaces how the process is started (tests of the harness itself). */
    public Builder launcher(Launcher launcher) {
      this.launcher = launcher;
      return this;
    }

    /** Replaces the {@code GET /ready} check (tests of the harness itself). */
    public Builder readyCheck(ReadyCheck readyCheck) {
      this.readyCheck = readyCheck;
      return this;
    }

    /** Replaces the process table the guided-browser scan reads (tests of the harness itself). */
    public Builder processes(Supplier<Stream<ProcessHandle>> processes) {
      this.processes = processes;
      return this;
    }

    /** Replaces the environment the child inherits from (tests of the harness itself). */
    public Builder inheritedEnvironment(Supplier<Map<String, String>> inherited) {
      this.inherited = inherited;
      return this;
    }

    /** How long a graceful stop may take before the runner is force-killed; default 20 s. */
    public Builder graceTimeout(Duration graceTimeout) {
      this.graceTimeout = graceTimeout;
      return this;
    }

    /** Replaces how a stop or continue signal is sent (tests of the harness itself). */
    public Builder signaller(Signaller signaller) {
      this.signaller = signaller;
      return this;
    }

    /**
     * JavaScript that runs inside the runner's Node process before {@code dist/main.js}'s {@code
     * main()} is called, for a measurement wrapper (a counter around the browser launch, a request
     * counter on the HTTPS server). When set, the harness writes the prelude and the standard
     * {@code main()} invocation into one module of its own directory and spawns that instead of
     * {@code dist/main.js}; {@code main.js} only starts itself when it is the entry point, so a
     * wrapper has to call it. The prelude is an ES module body: static {@code import}s are fine,
     * and {@code main()} is called after it, so it may patch built-ins first.
     */
    public Builder preload(String javascript) {
      this.preload = javascript;
      return this;
    }

    /** Test seam: the floor for a guided runner's grace; production code keeps 65 s. */
    Builder guidedMinimumGrace(Duration floor) {
      this.guidedMinimumGrace = floor;
      return this;
    }

    /** How long each reap step waits for processes to leave; default 5 s. */
    public Builder reapTimeout(Duration reapTimeout) {
      this.reapTimeout = reapTimeout;
      return this;
    }

    /**
     * Spawns the process and returns at once; call {@link #awaitReady} next.
     *
     * @throws IllegalStateException when {@code dist/main.js} or a required value is missing
     */
    public RunnerProcessHarness start() {
      return new RunnerProcessHarness(this).spawn();
    }
  }

  // ---- state ----

  private final RunnerTestTls tls;
  private final Path distDirectory;
  private final String node;
  private final String host;
  private int port;
  private final String serviceIdentity;
  private final String callbackIdentity;
  private final String callbackBaseUrl;
  private final String controllerFingerprint;
  private final Guided guided;
  private final Map<String, String> extra;
  private final Path workDirectory;
  private final Launcher launcher;
  private final ReadyCheck readyCheck;
  private final Supplier<Stream<ProcessHandle>> processes;
  private final Supplier<Map<String, String>> inherited;
  private final Duration graceTimeout;
  private final Duration reapTimeout;
  private final Signaller signaller;
  private final String preload;

  private Path workDir;
  private Path tmpDirectory;
  private Path log;
  private String distDigest;
  private Process process;
  private final List<Held> captured = new ArrayList<>();
  private final List<Held> frozen = new ArrayList<>();
  private TeardownReport report;

  private RunnerProcessHarness(Builder builder) {
    this.tls = builder.tls;
    this.distDirectory = builder.distDirectory;
    this.node = builder.node;
    this.host = builder.host;
    this.port = builder.port;
    this.serviceIdentity = builder.serviceIdentity;
    this.callbackIdentity = builder.callbackIdentity;
    this.callbackBaseUrl = builder.callbackBaseUrl;
    this.controllerFingerprint =
        builder.controllerFingerprint != null
            ? builder.controllerFingerprint
            : builder.tls.fingerprint256(Identity.BACKEND);
    this.guided = builder.guided;
    this.extra = Map.copyOf(builder.extra);
    this.workDirectory = builder.workDirectory;
    this.launcher = builder.launcher;
    this.readyCheck = builder.readyCheck;
    this.processes = builder.processes;
    this.inherited = builder.inherited;
    this.graceTimeout =
        builder.guided != null && builder.graceTimeout.compareTo(builder.guidedMinimumGrace) < 0
            ? builder.guidedMinimumGrace
            : builder.graceTimeout;
    this.reapTimeout = builder.reapTimeout;
    this.signaller = builder.signaller;
    this.preload = builder.preload;
  }

  /** A process held for a later signal, with the facts that prove it is still the same process. */
  private record Held(ProcessHandle handle, ProcessFact fact) {}

  private RunnerProcessHarness spawn() {
    Path main = distDirectory.resolve("main.js").toAbsolutePath().normalize();
    if (!Files.isRegularFile(main)) {
      throw new IllegalStateException(
          "the runner entrypoint does not exist: "
              + main
              + " (build the runner first; the harness never builds it)");
    }
    if (callbackBaseUrl == null || callbackBaseUrl.isBlank()) {
      throw new IllegalStateException("callbackBaseUrl is required");
    }
    try {
      Path dir =
          workDirectory != null
              ? Files.createDirectories(workDirectory)
              : Files.createTempDirectory("o9r-");
      this.workDir = dir;
      this.tmpDirectory = Files.createDirectories(dir.resolve("t"));
      this.log = dir.resolve("runner.log");
      Files.createFile(
          log, PosixFilePermissions.asFileAttribute(PosixFilePermissions.fromString("rw-------")));
      if (port == 0) {
        port = exclusivelyFreePort();
      }
      this.distDigest = distDigestOf(main.getParent());
      List<String> command =
          List.of(node, preload == null ? main.toString() : writeEntry(dir, main));
      this.process =
          launcher.launch(
              command, childEnvironment(inherited.get()), main.getParent().getParent(), log);
    } catch (IOException failure) {
      throw new IllegalStateException(
          "cannot start the runner: " + failure.getClass().getSimpleName());
    }
    return this;
  }

  // ---- what the child sees ----

  /**
   * The exact environment the child receives. {@code inherited} is the parent's environment; stray
   * {@code STUDIO_RUNNER_*} names and the guided-refusing debug variables are dropped from it, then
   * the contract's keys are set, then the caller's overrides. {@code TMPDIR} points into the
   * harness's own directory so guided scratch, and any browser profile in it, belongs to this
   * instance alone.
   */
  Map<String, String> childEnvironment(Map<String, String> inherited) {
    Map<String, String> env = new LinkedHashMap<>();
    inherited.forEach(
        (name, value) -> {
          if (!name.startsWith(KEY_PREFIX) && !DEBUG_VARIABLES.contains(name)) {
            env.put(name, value);
          }
        });
    env.put("TMPDIR", tmpDirectory.toString());
    env.put(KEY_HOST, host);
    env.put(KEY_PORT, Integer.toString(port));
    env.put(KEY_TLS_KEY_FILE, tls.privateKey(Identity.RUNNER).toAbsolutePath().toString());
    env.put(KEY_TLS_CERT_FILE, tls.certificate(Identity.RUNNER).toAbsolutePath().toString());
    env.put(KEY_TLS_CA_FILE, tls.caCertificate().toAbsolutePath().toString());
    env.put(KEY_CONTROLLER_FINGERPRINT, controllerFingerprint);
    env.put(KEY_SERVICE_IDENTITY, serviceIdentity);
    env.put(KEY_CALLBACK_IDENTITY, callbackIdentity);
    env.put(KEY_CALLBACK_BASE_URL, callbackBaseUrl);
    // The runner wipes its scratch directory at every start, and both defaults are fixed paths
    // under
    // /tmp that another process would share: give the instance its own.
    env.put(KEY_SCRATCH_DIR, workDir.resolve("scratch").toAbsolutePath().toString());
    env.put(KEY_OBJECT_STORE_DIR, workDir.resolve("objects").toAbsolutePath().toString());
    // The fixtures' pages live on these domains, the same list the backend's test profile uses.
    env.put(KEY_ALLOWED_DOMAINS, String.join(",", TestDomains.ENTRIES));
    // Allow-all is ON when unset (the default for now); the suites using this runner are about the
    // list.
    env.put(KEY_ALLOW_ALL_DOMAINS, "false");
    if (guided != null) {
      env.put(KEY_GUIDED_ENABLED, "true");
      env.put(KEY_GUIDED_WORKER_ID, guided.workerId());
      env.put(KEY_GUIDED_CAPACITY, "1");
      env.put(KEY_GUIDED_JOURNAL_DIR, guided.journalDirectory().toAbsolutePath().toString());
      env.put(KEY_GUIDED_CONTROLLER_ISSUER, guided.controllerIssuer());
      env.put(KEY_GUIDED_CONTROLLER_SUBJECT, guided.controllerSubject());
      env.put(
          KEY_GUIDED_CONTROLLER_PUBLIC_KEY_FILE,
          guided.controllerPublicKeyFile().toAbsolutePath().toString());
      env.put(KEY_GUIDED_CALLBACK_BASE_URL, guided.callbackBaseUrl());
      env.put(
          KEY_GUIDED_CALLBACK_TOKEN_FILE, guided.callbackTokenFile().toAbsolutePath().toString());
    }
    env.putAll(extra);
    return env;
  }

  /**
   * Writes the wrapper module for {@link Builder#preload}: the prelude, then the standard {@code
   * main()} call that {@code main.ts}'s own entry block makes. Contains no secret.
   */
  private String writeEntry(Path dir, Path main) throws IOException {
    Path entry = dir.resolve("entry.mjs");
    Files.writeString(entry, preload + "\n" + mainInvocation(main) + "\n", StandardCharsets.UTF_8);
    return entry.toAbsolutePath().toString();
  }

  /**
   * The JavaScript that imports {@code main.js} and calls {@code main()} the way its own entry
   * block does (its own environment and streams, the same closed failure line). For a wrapper
   * module that builds its own process (the ordinary-runner fixtures) and still has to run the
   * folded entry.
   *
   * @param mainJs the {@code dist/main.js} file
   * @return a statement sequence for an ES module (top-level {@code await})
   */
  public static String mainInvocation(Path mainJs) {
    try {
      return "const {main}=await import("
          + JSON.writeValueAsString(mainJs.toAbsolutePath().toUri().toString())
          + ");await main({env:process.env,onSignal:(signal,handler)=>{process.on(signal,handler);},"
          + "write:(line)=>process.stderr.write(line+'\\n'),setExitCode:(code)=>{process.exitCode=code;}"
          + "}).catch(()=>{process.stderr.write('RUNNER_START_FAILED\\n');process.exitCode=1;});";
    } catch (IOException impossible) {
      throw new IllegalStateException("cannot encode a path");
    }
  }

  /**
   * Removes from a {@link ProcessBuilder#environment()} what must not reach a runner started by
   * hand: every {@code STUDIO_RUNNER_*} name and the debug variables a guided runner refuses.
   */
  public static void scrubInheritedEnvironment(Map<String, String> environment) {
    environment
        .keySet()
        .removeIf(name -> name.startsWith(KEY_PREFIX) || DEBUG_VARIABLES.contains(name));
  }

  // ---- readiness ----

  /**
   * Waits until the spawned process is ready.
   *
   * @param timeout how long to wait
   * @return this
   * @throws RunnerStartException when the process exited (its exit code and kind are on the
   *     exception) or was not ready in time
   */
  public RunnerProcessHarness awaitReady(Duration timeout) {
    long deadline = System.nanoTime() + timeout.toNanos();
    HarnessView view = view();
    while (true) {
      if (!process.isAlive()) {
        int code = exitCodeOf(process);
        throw new RunnerStartException(
            "the runner exited before it was ready: exit "
                + code
                + " ("
                + ExitKind.of(code)
                + "); log "
                + log,
            code);
      }
      if (startedLogged() && readyCheck.ready(view)) {
        return this;
      }
      if (System.nanoTime() >= deadline) {
        throw new RunnerStartException(
            "the runner was not ready within " + timeout + "; log " + log, null);
      }
      sleep(POLL);
    }
  }

  private boolean startedLogged() {
    try {
      return Files.readString(log, StandardCharsets.UTF_8).contains(STARTED_EVENT);
    } catch (IOException unreadable) {
      return false;
    }
  }

  private HarnessView view() {
    return new HarnessView() {
      @Override
      public URI origin() {
        return RunnerProcessHarness.this.origin();
      }

      @Override
      public String serviceIdentity() {
        return serviceIdentity;
      }

      @Override
      public RunnerTestTls tls() {
        return tls;
      }
    };
  }

  /**
   * The default readiness check: {@code GET /ready} over mutual TLS as the test backend, verifying
   * the server against the test CA and the certificate's IP SAN for {@link #origin()}. A stray
   * listener cannot answer, because it cannot present a certificate this CA issued.
   */
  static boolean readyOverTls(HarnessView harness) {
    var backend = harness.tls().backendTls();
    try (HttpClient client =
        backend.configure(HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(2))).build()) {
      HttpResponse<String> response =
          client.send(
              HttpRequest.newBuilder(harness.origin().resolve("/ready"))
                  .timeout(Duration.ofSeconds(2))
                  .header("Authorization", "Bearer " + harness.serviceIdentity())
                  .GET()
                  .build(),
              HttpResponse.BodyHandlers.ofString());
      return response.statusCode() == 200
          && JSON.readTree(response.body()).path("ready").asBoolean();
    } catch (IOException | RuntimeException unreachable) {
      return false;
    } catch (InterruptedException interrupted) {
      Thread.currentThread().interrupt();
      return false;
    }
  }

  // ---- reading ----

  /**
   * {@code https://<address>:<port>}, the numeric listener address the test certificates cover
   * through their IP SANs. The name {@code localhost} is deliberately not used: it can resolve to
   * {@code ::1} first, where a runner bound to {@code 127.0.0.1} is not listening, which is the
   * loopback-collision class AC-12 h exists to remove.
   */
  public URI origin() {
    String address = host.equals("0.0.0.0") ? "127.0.0.1" : host.equals("::") ? "::1" : host;
    return URI.create(
        "https://" + (address.contains(":") ? "[" + address + "]" : address) + ":" + port);
  }

  /** The listener port. */
  public int port() {
    return port;
  }

  /**
   * The {@code dist} directory a builder spawns by default: the override variable, else the repo's.
   */
  public static Path defaultDistDirectory() {
    return Path.of(
        Optional.ofNullable(System.getenv(DIST_OVERRIDE_VARIABLE))
            .filter(value -> !value.isBlank())
            .orElse("../studio-runner/dist"));
  }

  /** The SIGTERM grace in force: for a guided runner never below {@link #GUIDED_MINIMUM_GRACE}. */
  public Duration graceTimeout() {
    return graceTimeout;
  }

  /** The harness's private directory: log, scratch, object store and the child's {@code TMPDIR}. */
  public Path workDirectory() {
    return workDir;
  }

  /** The backend's TLS identity for calling the runner, from the same test CA. */
  public com.citi.put.checks.studio.dispatch.StudioRunnerTls backendTls() {
    return tls.backendTls();
  }

  /** The bearer the runner expects on {@code /v2/runs} and the probe. Test material; never log. */
  public String serviceIdentity() {
    return serviceIdentity;
  }

  /** The runner's combined stdout and stderr. */
  public Path logFile() {
    return log;
  }

  /**
   * The harness's private directory used as the child's {@code TMPDIR}. Guided scratch and browser
   * profiles ({@code checks-guided-*}) live under it.
   */
  public Path tmpDirectory() {
    return tmpDirectory;
  }

  /** The spawned process. */
  public Process process() {
    return process;
  }

  /**
   * The digest of the {@code dist} that was spawned, computed before the spawn: SHA-256 of the
   * compact JSON list of {@code {path, sha256}} for every file, in path-component order. It is the
   * collectors' {@code distDigest}.
   */
  public String distDigest() {
    return distDigest;
  }

  /** The exit class of the process, or empty while it runs. */
  public Optional<ExitKind> exitKind() {
    return process.isAlive() ? Optional.empty() : Optional.of(ExitKind.of(exitCodeOf(process)));
  }

  /**
   * Waits for the process to exit by itself.
   *
   * @return the exit class, or empty if it was still running after {@code timeout}
   */
  public Optional<ExitKind> awaitExit(Duration timeout) {
    try {
      return process.waitFor(timeout.toMillis(), TimeUnit.MILLISECONDS)
          ? Optional.of(ExitKind.of(exitCodeOf(process)))
          : Optional.empty();
    } catch (InterruptedException interrupted) {
      Thread.currentThread().interrupt();
      return Optional.empty();
    }
  }

  // ---- fault injection and reaping ----

  /**
   * Captures the runner's descendants now, while they are still attached to it. Everything captured
   * is remembered, and {@link #teardown()} signals what is still alive after the parent is gone.
   *
   * @return the facts about what was captured (not live handles)
   */
  public synchronized List<ProcessFact> captureTree() {
    List<ProcessFact> facts = new ArrayList<>();
    process
        .toHandle()
        .descendants()
        .forEach(
            handle -> {
              Held held = hold(handle);
              if (held != null
                  && captured.stream().noneMatch(c -> c.fact().pid() == held.fact().pid())) {
                captured.add(held);
              }
              if (held != null) {
                facts.add(held.fact());
              }
            });
    return List.copyOf(facts);
  }

  /**
   * Kills the runner with SIGKILL after capturing its tree: the "worker kill" fault. Nothing is
   * reaped here, so the test can look at what the product left behind with {@link
   * #survivorsOf(List)}.
   *
   * @return the descendants captured before the kill
   */
  public synchronized List<ProcessFact> kill9() {
    List<ProcessFact> before = captureTree();
    process.destroyForcibly();
    waitDead(process.toHandle(), reapTimeout);
    return before;
  }

  /**
   * Which of the facts' processes are still running (zombies excluded and, by pid and start
   * instant, a re-used pid is not counted).
   */
  public synchronized List<ProcessFact> survivorsOf(List<ProcessFact> facts) {
    List<ProcessFact> alive = new ArrayList<>();
    for (ProcessFact fact : facts) {
      // A process captured earlier is judged through the handle captured with it.
      ProcessHandle handle =
          captured.stream()
              .filter(held -> held.fact().equals(fact))
              .map(Held::handle)
              .findFirst()
              .orElseGet(() -> ProcessHandle.of(fact.pid()).orElse(null));
      if (handle != null && sameAliveProcess(handle, fact)) {
        alive.add(fact);
      }
    }
    return alive;
  }

  /**
   * Browsers (or anything else) whose command line puts them in this harness's {@code TMPDIR},
   * named {@code checks-guided-*}: the "no guided browser survives a worker kill" listing.
   */
  public List<ProcessFact> survivingGuidedBrowsers() {
    return guidedBrowsers().stream().map(Held::fact).toList();
  }

  private List<Held> guidedBrowsers() {
    String marker = tmpDirectory.getParent().getFileName().toString();
    List<Held> found = new ArrayList<>();
    try (Stream<ProcessHandle> all = processes.get()) {
      all.filter(ProcessHandle::isAlive)
          .forEach(
              handle -> {
                Optional<String> line = handle.info().commandLine();
                if (line.isPresent()
                    && line.get().contains(marker)
                    && line.get().contains("checks-guided-")) {
                  found.add(
                      new Held(
                          handle,
                          new ProcessFact(
                              handle.pid(),
                              handle.info().command().orElse("?"),
                              handle.info().startInstant().orElse(null))));
                }
              });
    }
    return List.copyOf(found);
  }

  /**
   * Freezes guided browsers with SIGSTOP: the "wedged browser" fault of ruling D5 (a frozen browser
   * cannot answer a graceful close). Only a process that is in {@link #survivingGuidedBrowsers()}
   * right now, with the same pid and start instant as the fact, is signalled, and never pid 1 or
   * below, a zombie or this JVM. {@link #teardown()} continues (SIGCONT) whatever is still frozen
   * before it signals anything else.
   *
   * @param browsers facts taken from {@link #survivingGuidedBrowsers()}
   * @return the facts that were frozen
   * @throws IllegalArgumentException when a fact is not a surviving guided browser of this harness
   */
  public synchronized List<ProcessFact> freeze(List<ProcessFact> browsers) {
    List<Held> candidates = guidedBrowsers();
    List<Held> targets = new ArrayList<>();
    for (ProcessFact fact : browsers) {
      Held match =
          candidates.stream()
              .filter(held -> held.fact().pid() == fact.pid())
              .filter(
                  held ->
                      fact.startedAt() == null || fact.startedAt().equals(held.fact().startedAt()))
              .findFirst()
              .orElseThrow(
                  () ->
                      new IllegalArgumentException(
                          "not a surviving guided browser of this harness: " + fact.pid()));
      if (!sameAliveProcess(match.handle(), match.fact())) {
        throw new IllegalArgumentException(
            "not a live guided browser of this harness: " + fact.pid());
      }
      targets.add(match);
    }
    List<ProcessFact> done = new ArrayList<>();
    for (Held target : targets) {
      try {
        signaller.signal("STOP", target.fact().pid());
      } catch (IOException failure) {
        throw new IllegalStateException(
            "cannot freeze " + target.fact().pid() + ": " + failure.getClass().getSimpleName());
      }
      frozen.add(target);
      done.add(target.fact());
    }
    return List.copyOf(done);
  }

  /** Continues (SIGCONT) every process {@link #freeze} stopped and that is still the same one. */
  public synchronized void thaw() {
    for (Held held : frozen) {
      if (stillSame(held)) {
        try {
          signaller.signal("CONT", held.fact().pid());
        } catch (IOException ignored) {
          // The teardown signals it next; a process that cannot be continued is reported there.
        }
      }
    }
    frozen.clear();
  }

  // ---- teardown ----

  /**
   * Stops the runner and everything it left. Idempotent: the first call does the work and every
   * later call returns the same report.
   *
   * <ol>
   *   <li>Capture the descendants (before anything is signalled).
   *   <li>Send SIGTERM, wait for the graceful drain up to the grace timeout, then SIGKILL.
   *   <li>For every process captured now or earlier that is still the same live process: SIGTERM,
   *       wait, SIGKILL, wait.
   *   <li>Report what was captured, signalled and still alive.
   * </ol>
   *
   * @return what was done; call {@link TeardownReport#assertNoSurvivors()} to fail on leftovers
   */
  public synchronized TeardownReport teardown() {
    if (report != null) {
      return report;
    }
    captureTree();
    thaw();
    List<ProcessFact> before = captured.stream().map(Held::fact).toList();
    boolean escalated = false;
    ProcessHandle parent = process.toHandle();
    if (process.isAlive()) {
      process.destroy();
      if (!waitDead(parent, graceTimeout)) {
        escalated = true;
        process.destroyForcibly();
        waitDead(parent, reapTimeout);
      }
    }
    if (process.isAlive()) {
      // The handle can already report the process gone (a zombie, or dead by the time of the poll)
      // while the JDK's reaper thread has not yet collected the exit status: wait for it, so the
      // report carries the exit code instead of "unknown".
      try {
        process.waitFor(reapTimeout.toMillis(), TimeUnit.MILLISECONDS);
      } catch (InterruptedException interrupted) {
        Thread.currentThread().interrupt();
      }
    }
    Integer exit = process.isAlive() ? null : exitCodeOf(process);

    List<ProcessFact> signalled = new ArrayList<>();
    int zombies = 0;
    List<Held> live = new ArrayList<>();
    for (Held held : captured) {
      if (zombie(held.handle())) {
        zombies++;
      } else if (stillSame(held)) {
        live.add(held);
      }
    }
    for (Held held : live) {
      if (stillSame(held)) {
        held.handle().destroy();
        signalled.add(held.fact());
      }
    }
    waitAllDead(live, reapTimeout);
    for (Held held : live) {
      if (stillSame(held)) {
        held.handle().destroyForcibly();
      }
    }
    waitAllDead(live, reapTimeout);
    List<ProcessFact> survivors = new ArrayList<>();
    for (Held held : live) {
      if (stillSame(held)) {
        survivors.add(held.fact());
      }
    }
    report =
        new TeardownReport(
            exit,
            escalated,
            List.copyOf(before),
            List.copyOf(signalled),
            List.copyOf(survivors),
            zombies);
    return report;
  }

  /** The report of the finished teardown, or null before it ran. */
  public synchronized TeardownReport teardownReport() {
    return report;
  }

  /** Same as {@link #teardown()}; the report stays available from {@link #teardownReport()}. */
  @Override
  public void close() {
    teardown();
  }

  @Override
  public String toString() {
    return "RunnerProcessHarness[port=" + port + ", guided=" + (guided != null) + "]";
  }

  // ---- process helpers ----

  private Held hold(ProcessHandle handle) {
    long pid = handle.pid();
    if (pid <= 1 || pid == ProcessHandle.current().pid()) {
      return null;
    }
    ProcessHandle.Info info = handle.info();
    return new Held(
        handle, new ProcessFact(pid, info.command().orElse("?"), info.startInstant().orElse(null)));
  }

  /** Alive, not a zombie, and the same process that was captured (pid and start instant). */
  private static boolean stillSame(Held held) {
    return sameAliveProcess(held.handle(), held.fact());
  }

  private static boolean sameAliveProcess(ProcessHandle handle, ProcessFact fact) {
    if (fact.pid() <= 1 || fact.pid() == ProcessHandle.current().pid()) {
      return false;
    }
    if (!handle.isAlive() || zombie(handle)) {
      return false;
    }
    Optional<Instant> start = handle.info().startInstant();
    return fact.startedAt() == null || start.isEmpty() || start.get().equals(fact.startedAt());
  }

  /** macOS reports a child that exited but is not yet reaped as alive with no command. */
  private static boolean zombie(ProcessHandle handle) {
    return handle.isAlive() && handle.info().command().isEmpty();
  }

  private boolean waitDead(ProcessHandle handle, Duration timeout) {
    long deadline = System.nanoTime() + timeout.toNanos();
    while (handle.isAlive() && !zombie(handle)) {
      if (System.nanoTime() >= deadline) {
        return false;
      }
      sleep(POLL);
    }
    return true;
  }

  private void waitAllDead(List<Held> held, Duration timeout) {
    long deadline = System.nanoTime() + timeout.toNanos();
    while (held.stream().anyMatch(RunnerProcessHarness::stillSame)
        && System.nanoTime() < deadline) {
      sleep(POLL);
    }
  }

  private static int exitCodeOf(Process process) {
    try {
      return process.exitValue();
    } catch (IllegalThreadStateException stillRunning) {
      return -1;
    }
  }

  private static void sleep(Duration duration) {
    try {
      Thread.sleep(duration.toMillis());
    } catch (InterruptedException interrupted) {
      Thread.currentThread().interrupt();
    }
  }

  // ---- launching ----

  private static Process launchWithProcessBuilder(
      List<String> command, Map<String, String> environment, Path workingDirectory, Path log)
      throws IOException {
    ProcessBuilder builder = new ProcessBuilder(command);
    builder.environment().clear();
    builder.environment().putAll(environment);
    builder.directory(workingDirectory.toFile());
    builder.redirectErrorStream(true);
    builder.redirectOutput(ProcessBuilder.Redirect.appendTo(log.toFile()));
    return builder.start();
  }

  private static void signalWithShell(String signal, long pid) throws IOException {
    if (!signal.equals("STOP") && !signal.equals("CONT")) {
      throw new IOException("unsupported signal");
    }
    if (pid <= 1) {
      throw new IOException("refused pid");
    }
    Process process =
        new ProcessBuilder("/bin/sh", "-c", "kill -" + signal + " " + pid)
            .redirectErrorStream(true)
            .redirectOutput(ProcessBuilder.Redirect.DISCARD)
            .start();
    try {
      if (!process.waitFor(5, TimeUnit.SECONDS) || process.exitValue() != 0) {
        process.destroyForcibly();
        throw new IOException("kill failed");
      }
    } catch (InterruptedException interrupted) {
      Thread.currentThread().interrupt();
      throw new IOException("interrupted");
    }
  }

  // ---- Spring properties ----

  /**
   * The {@code server.ssl.*} properties that make a Spring test's embedded server the backend side
   * of the runner's callbacks: the backend certificate, the CA as the only trust anchor, client
   * certificates required. Test material only.
   */
  public static Map<String, String> backendServerSslProperties(RunnerTestTls tls) {
    Map<String, String> properties = new LinkedHashMap<>();
    properties.put("server.ssl.enabled", "true");
    properties.put("server.ssl.key-store", tls.keyStore(Identity.BACKEND).toString());
    properties.put(
        "server.ssl.key-store-password", read(tls.keyStorePasswordFile(Identity.BACKEND)));
    properties.put("server.ssl.key-store-type", "PKCS12");
    properties.put("server.ssl.trust-store", tls.trustStore().toString());
    properties.put("server.ssl.trust-store-password", read(tls.trustStorePasswordFile()));
    properties.put("server.ssl.trust-store-type", "PKCS12");
    properties.put("server.ssl.client-auth", "need");
    return properties;
  }

  /**
   * The {@code studio.runner.tls.*} properties of the backend's one runner identity (D3): the
   * Spring-managed runner clients fail closed without them.
   */
  public static Map<String, String> runnerTlsProperties(RunnerTestTls tls) {
    Map<String, String> properties = new LinkedHashMap<>();
    properties.put("studio.runner.tls.key-store", tls.keyStore(Identity.BACKEND).toString());
    properties.put(
        "studio.runner.tls.key-store-password-file",
        tls.keyStorePasswordFile(Identity.BACKEND).toString());
    properties.put("studio.runner.tls.trust-store", tls.trustStore().toString());
    properties.put(
        "studio.runner.tls.trust-store-password-file", tls.trustStorePasswordFile().toString());
    return properties;
  }

  private static String read(Path file) {
    try {
      return Files.readString(file, StandardCharsets.US_ASCII).strip();
    } catch (IOException failure) {
      throw new IllegalStateException("cannot read a test CA password file");
    }
  }

  // ---- ports ----

  /**
   * A port that is exclusively free on both loopback families, outside the embedded-PostgreSQL
   * range (20000-32767) and the kernel's ephemeral range. "Exclusively" means bound without {@code
   * SO_REUSEADDR}, so a listener on the wildcard or on the same address refuses the probe.
   *
   * @return the port
   */
  public static int exclusivelyFreePort() throws IOException {
    InetAddress ipv4 = InetAddress.getByName("127.0.0.1");
    InetAddress ipv6 = InetAddress.getByName("::1");
    boolean ipv6Loopback = exclusivelyFree(ipv6, 0);
    for (int attempt = 0; attempt < MAX_PORT_ATTEMPTS; attempt++) {
      int candidate = ThreadLocalRandom.current().nextInt(FIRST_PORT, LAST_PORT + 1);
      if (exclusivelyFree(ipv4, candidate) && (!ipv6Loopback || exclusivelyFree(ipv6, candidate))) {
        return candidate;
      }
    }
    throw new IOException("no exclusively free loopback port in " + FIRST_PORT + "-" + LAST_PORT);
  }

  /** Whether {@code address:port} can be bound without {@code SO_REUSEADDR}. */
  public static boolean exclusivelyFree(InetAddress address, int port) {
    ProtocolFamily family =
        address.getAddress().length == 4
            ? StandardProtocolFamily.INET
            : StandardProtocolFamily.INET6;
    try (ServerSocketChannel probe = ServerSocketChannel.open(family)) {
      probe.setOption(StandardSocketOptions.SO_REUSEADDR, false);
      probe.bind(new InetSocketAddress(address, port));
      return true;
    } catch (IOException | UnsupportedOperationException unavailable) {
      return false;
    }
  }

  // ---- dist digest ----

  /**
   * The collectors' {@code distDigest} of a directory: SHA-256 over the compact JSON array of
   * {@code {"path": relative path, "sha256": file hash}}, one per regular file, sorted by path
   * components (so {@code a/x} sorts before {@code a-b/x}, as Python's {@code sorted(Path)} does),
   * with non-ASCII and control characters escaped as {@code \}{@code uXXXX}.
   *
   * @param dist the {@code dist} directory
   * @return 64 lower-case hex characters
   */
  public static String distDigestOf(Path dist) throws IOException {
    List<Path> files;
    try (Stream<Path> walk = Files.walk(dist)) {
      files = walk.filter(Files::isRegularFile).toList();
    }
    List<Map.Entry<String, String>> entries = new ArrayList<>();
    for (Path file : files) {
      entries.add(Map.entry(dist.relativize(file).toString(), sha256(Files.readAllBytes(file))));
    }
    entries.sort(
        Comparator.comparing(Map.Entry::getKey, RunnerProcessHarness::compareByPathComponents));
    return sha256(distManifestJson(entries).getBytes(StandardCharsets.UTF_8));
  }

  /**
   * The compact JSON of the manifest, as Python's {@code json.dumps(..., separators=(',',':'))}.
   */
  static String distManifestJson(List<Map.Entry<String, String>> entries) {
    StringBuilder json = new StringBuilder("[");
    for (int index = 0; index < entries.size(); index++) {
      if (index > 0) {
        json.append(',');
      }
      json.append("{\"path\":");
      appendJsonString(json, entries.get(index).getKey());
      json.append(",\"sha256\":");
      appendJsonString(json, entries.get(index).getValue());
      json.append('}');
    }
    return json.append(']').toString();
  }

  private static int compareByPathComponents(String left, String right) {
    String[] a = left.split("/");
    String[] b = right.split("/");
    for (int index = 0; index < Math.min(a.length, b.length); index++) {
      int order = a[index].compareTo(b[index]);
      if (order != 0) {
        return order;
      }
    }
    return Integer.compare(a.length, b.length);
  }

  private static void appendJsonString(StringBuilder out, String value) {
    out.append('"');
    for (char c : value.toCharArray()) {
      switch (c) {
        case '"' -> out.append("\\\"");
        case '\\' -> out.append("\\\\");
        case '\n' -> out.append("\\n");
        case '\r' -> out.append("\\r");
        case '\t' -> out.append("\\t");
        case '\b' -> out.append("\\b");
        case '\f' -> out.append("\\f");
        default -> {
          if (c < 0x20 || c > 0x7e) {
            out.append(String.format("\\u%04x", (int) c));
          } else {
            out.append(c);
          }
        }
      }
    }
    out.append('"');
  }

  private static String sha256(byte[] bytes) {
    try {
      return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(bytes));
    } catch (NoSuchAlgorithmException impossible) {
      throw new IllegalStateException("SHA-256 is unavailable");
    }
  }

  private static String randomToken() {
    byte[] random = new byte[24];
    new SecureRandom().nextBytes(random);
    return Base64.getUrlEncoder().withoutPadding().encodeToString(random);
  }
}
