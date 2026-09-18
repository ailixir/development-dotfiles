package com.citi.put.checks.corun;

import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStreamReader;
import java.io.UncheckedIOException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Duration;
import java.util.ArrayDeque;
import java.util.Deque;
import java.util.List;
import java.util.Map;
import java.util.concurrent.TimeUnit;

/**
 * The real {@code studio-runner} Node process, started beside the API for one co-run.
 *
 * <p><b>The environment is enumerated, not inherited.</b> {@code ProcessBuilder}'s environment is
 * cleared and repopulated with {@code PATH}, {@code HOME}, {@code TMPDIR} and the runner's own
 * {@code STUDIO_RUNNER_*} keys, and nothing else. That is not tidiness: the runner's configuration
 * loader is fail-closed by enumeration precisely so that a database URL, a vault address or a
 * gateway key cannot be "configured but unused", and a harness that handed it the test JVM's whole
 * environment would be proving that property against a process the deployment never runs. It also
 * means an unrecognised key added here is a startup failure with a message, not a silent extra.
 *
 * <p><b>Failures are attributed, not reported.</b> Every failure this class raises names the
 * component, the address and the observation: a process that exited names its exit code and the
 * tail of its own log; a health probe that never answered names the URL and how long it waited.
 * "The co-run did not work" is the failure mode this harness exists to eliminate, so it is not an
 * acceptable message from the harness itself.
 *
 * <p><b>Teardown removes descendants, not just the child.</b> A Playwright browser and its {@code
 * ffmpeg} recorder lead process groups of their own, so signalling the Node process alone can leave
 * them running. {@link #close()} destroys the descendants it can see first, then the process, and
 * escalates to a forcible kill only after the drain grace has elapsed — and says so when it has to.
 */
final class RunnerProcess implements AutoCloseable {

  /** How long the runner is given to answer {@code /health} before startup is called a failure. */
  private static final Duration HEALTH_DEADLINE = Duration.ofSeconds(30);

  /** How long a stopping runner is given to exit on its own before it is killed. */
  private static final Duration STOP_GRACE = Duration.ofSeconds(10);

  /** Lines of the runner's own output kept in memory for failure messages. */
  private static final int LOG_TAIL = 60;

  private final Process process;
  private final CoRunEnvironment environment;
  private final Deque<String> tail = new ArrayDeque<>();
  private long recorded;
  private final Thread drain;
  private final HttpClient http =
      HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(2)).build();

  private RunnerProcess(Process process, CoRunEnvironment environment) {
    this.process = process;
    this.environment = environment;
    this.drain = new Thread(this::drainOutput, "corun-runner-log");
    this.drain.setDaemon(true);
    this.drain.start();
  }

  /**
   * Starts the runner and waits for it to report healthy.
   *
   * @param environment the addresses, credentials and directories for this co-run
   * @param apiBaseUrl the API's own base URL, which is the runner's single permitted callback
   *     destination; a job may never supply one
   * @throws CoRunFailure when the build output is missing, the process dies during startup, or the
   *     health route never answers
   */
  static RunnerProcess start(CoRunEnvironment environment, String apiBaseUrl) {
    preflight(environment);

    ProcessBuilder builder =
        new ProcessBuilder("node", "dist/main.js")
            .directory(environment.runnerDir().toFile())
            .redirectErrorStream(true);
    Map<String, String> env = builder.environment();
    env.clear();
    env.put("PATH", System.getenv("PATH"));
    env.put("HOME", System.getenv("HOME"));
    env.put("TMPDIR", environment.workDir().toString());
    env.put("STUDIO_RUNNER_HOST", CoRunEnvironment.HOST);
    env.put("STUDIO_RUNNER_PORT", Integer.toString(environment.runnerPort()));
    env.put("STUDIO_RUNNER_POOL_SIZE", "1");
    env.put("STUDIO_RUNNER_SERVICE_IDENTITY", environment.runnerServiceToken());
    env.put("STUDIO_RUNNER_CALLBACK_IDENTITY", environment.callbackServiceToken());
    env.put("STUDIO_RUNNER_CALLBACK_BASE_URL", apiBaseUrl);
    env.put("STUDIO_RUNNER_SCRATCH_DIR", environment.scratchDir().toString());
    env.put("STUDIO_RUNNER_OBJECT_STORE_DIR", environment.objectStoreDir().toString());

    Process started;
    try {
      started = builder.start();
    } catch (IOException e) {
      throw new CoRunFailure(
          "studio-runner",
          "could not be started at all",
          "`node dist/main.js` in " + environment.runnerDir() + " — " + e.getMessage());
    }

    RunnerProcess runner = new RunnerProcess(started, environment);
    Runtime.getRuntime().addShutdownHook(new Thread(runner::destroyTree, "corun-runner-reaper"));
    runner.awaitHealthy();
    return runner;
  }

  /** The base URL the API is configured to reach. */
  String baseUrl() {
    return environment.runnerBaseUrl();
  }

  boolean alive() {
    return process.isAlive();
  }

  /** The tail of the runner's own output, newest last, for failure messages. */
  synchronized List<String> logTail() {
    return List.copyOf(tail);
  }

  /**
   * A marker for "everything the runner has said so far".
   *
   * <p>Paired with {@link #logSince(long)} this is what lets a failing leg quote only the lines the
   * runner emitted <em>while handling that leg's request</em>. Dumping the whole tail would mix the
   * harness's own probes into the evidence for a product refusal, and an attribution that includes
   * the harness's own traffic is not an attribution.
   */
  synchronized long logMark() {
    return recorded;
  }

  /** Every line the runner emitted after {@code mark}, oldest first. */
  synchronized List<String> logSince(long mark) {
    long skip = Math.max(0L, mark - (recorded - tail.size()));
    return tail.stream().skip(skip).toList();
  }

  /**
   * One authenticated probe of a runner route, issued by the harness itself rather than through the
   * API.
   *
   * <p>These probes are the harness's attribution baseline. When a dispatch is refused, the
   * difference between "the runner is down", "the runner is up and rejecting this credential" and
   * "the runner is up, accepts this credential, and refused this request" is the whole answer, and
   * it cannot be read off a single failed call through the API.
   *
   * @param method the HTTP method
   * @param path the route, beginning with a slash
   * @param bearer the credential to present, or {@code null} to present none
   * @param body the request body, or {@code null} for a bodyless request
   * @return the status and the response body, verbatim
   */
  Probe probe(String method, String path, String bearer, String body) {
    HttpRequest.Builder request =
        HttpRequest.newBuilder(URI.create(environment.runnerBaseUrl() + path))
            .timeout(Duration.ofSeconds(10));
    if (bearer != null) {
      request.header("Authorization", "Bearer " + bearer);
    }
    if (body == null) {
      request.method(method, HttpRequest.BodyPublishers.noBody());
    } else {
      request.header("Content-Type", "application/json");
      request.method(method, HttpRequest.BodyPublishers.ofString(body));
    }
    try {
      HttpResponse<String> response =
          http.send(request.build(), HttpResponse.BodyHandlers.ofString());
      return new Probe(response.statusCode(), response.body());
    } catch (IOException e) {
      return new Probe(-1, e.getClass().getSimpleName() + ": " + e.getMessage());
    } catch (InterruptedException e) {
      Thread.currentThread().interrupt();
      return new Probe(-1, "interrupted");
    }
  }

  /** One observation of a runner route: the status it answered and the body it returned. */
  record Probe(int status, String body) {

    @Override
    public String toString() {
      return status < 0 ? "no answer (" + body + ")" : status + " " + body;
    }
  }

  @Override
  public void close() {
    if (!process.isAlive()) {
      return;
    }
    destroyTree();
    boolean exited;
    try {
      exited = process.waitFor(STOP_GRACE.toMillis(), TimeUnit.MILLISECONDS);
    } catch (InterruptedException e) {
      Thread.currentThread().interrupt();
      exited = false;
    }
    if (!exited) {
      process.descendants().forEach(ProcessHandle::destroyForcibly);
      process.destroyForcibly();
      System.err.println(
          "[co-run] the studio-runner did not exit within "
              + STOP_GRACE
              + " and was killed; a later run may see leftover state in "
              + environment.workDir());
    }
    drain.interrupt();
  }

  // ── internals ──────────────────────────────────────────────────────────

  /**
   * Refuses to start when the runner has not been built or installed.
   *
   * <p>This is deliberately a failure and never a skip. A harness whose only job is to be the first
   * thing that runs the two components together must not report success by declining to run; the
   * message names the exact command that fixes it.
   */
  private static void preflight(CoRunEnvironment environment) {
    Path dir = environment.runnerDir();
    if (!Files.isDirectory(dir)) {
      throw new CoRunFailure(
          "co-run harness",
          "cannot find the studio-runner source tree",
          "expected a directory at " + dir);
    }
    if (!Files.isDirectory(dir.resolve("node_modules"))) {
      throw new CoRunFailure(
          "co-run harness",
          "the studio-runner has no installed dependencies",
          "run `npm ci` in " + dir + " (tools/corun.sh does this for you)");
    }
    if (!Files.isRegularFile(dir.resolve("dist").resolve("main.js"))) {
      throw new CoRunFailure(
          "co-run harness",
          "the studio-runner has not been built",
          "run `npm run build` in " + dir + " (tools/corun.sh does this for you)");
    }
    try {
      Files.createDirectories(environment.scratchDir());
      Files.createDirectories(environment.objectStoreDir());
    } catch (IOException e) {
      throw new UncheckedIOException("The co-run could not create its directories", e);
    }
  }

  private void awaitHealthy() {
    long deadline = System.nanoTime() + HEALTH_DEADLINE.toNanos();
    Probe last = new Probe(-1, "never attempted");
    while (System.nanoTime() < deadline) {
      if (!process.isAlive()) {
        throw new CoRunFailure(
            "studio-runner",
            "exited during startup with code " + process.exitValue(),
            "its own output follows:\n" + indentedLogTail());
      }
      last = probe("GET", "/health", environment.runnerServiceToken(), null);
      if (last.status() == 200) {
        return;
      }
      sleep();
    }
    throw new CoRunFailure(
        "studio-runner",
        "never became healthy within " + HEALTH_DEADLINE,
        "GET "
            + environment.runnerBaseUrl()
            + "/health answered "
            + last
            + "; its own output follows:\n"
            + indentedLogTail());
  }

  private String indentedLogTail() {
    List<String> lines = logTail();
    if (lines.isEmpty()) {
      return "    (the runner produced no output)";
    }
    return String.join("\n", lines.stream().map(line -> "    " + line).toList());
  }

  private void destroyTree() {
    process.descendants().forEach(ProcessHandle::destroy);
    process.destroy();
  }

  private void drainOutput() {
    try (BufferedReader reader =
        new BufferedReader(
            new InputStreamReader(process.getInputStream(), StandardCharsets.UTF_8))) {
      String line;
      while ((line = reader.readLine()) != null) {
        record(line);
      }
    } catch (IOException e) {
      record("[harness] stopped reading the runner's output: " + e.getMessage());
    }
  }

  private synchronized void record(String line) {
    tail.addLast(line);
    recorded++;
    while (tail.size() > LOG_TAIL) {
      tail.removeFirst();
    }
    try {
      Files.writeString(
          environment.runnerLog(),
          line + System.lineSeparator(),
          StandardCharsets.UTF_8,
          java.nio.file.StandardOpenOption.CREATE,
          java.nio.file.StandardOpenOption.APPEND);
    } catch (IOException e) {
      // The in-memory tail is the one failure messages read; a log file that cannot be written
      // must not take the co-run down with it.
    }
  }

  private static void sleep() {
    try {
      Thread.sleep(200L);
    } catch (InterruptedException e) {
      Thread.currentThread().interrupt();
      throw new IllegalStateException("interrupted while waiting for the runner", e);
    }
  }
}
