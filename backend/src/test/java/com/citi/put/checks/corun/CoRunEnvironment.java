package com.citi.put.checks.corun;

import java.io.IOException;
import java.io.UncheckedIOException;
import java.net.ServerSocket;
import java.nio.file.Files;
import java.nio.file.Path;
import java.security.SecureRandom;
import java.util.HexFormat;

/**
 * The one place the local co-run's addresses, credentials and directories are decided.
 *
 * <p><b>Why this class exists at all.</b> Until this harness landed, the API and the {@code
 * studio-runner} had never run in the same session: every backend test dispatched to a fake or a
 * WireMock stub, and every runner test answered a fixture. Both of the epic's HIGH integration
 * defects (DEF-01, DEF-02) were therefore found by <em>reading</em> code rather than by running it.
 * A harness is only worth having if it can catch that class of defect by running, which means it
 * has to start the two real processes and let them refuse each other.
 *
 * <p><b>Ports are allocated, never assumed.</b> Each port is taken from the OS ephemeral range and
 * released immediately before use, or read from {@code CORUN_API_PORT} / {@code CORUN_RUNNER_PORT}
 * when an operator needs a fixed one. Nothing here ever defaults to a well-known development port:
 * this machine has unrelated processes on those, and a harness that fights a developer's editor for
 * a socket reports a connection failure that has nothing to do with the system under test.
 *
 * <p><b>Both credentials are fresh per run.</b> The inbound token the runner requires and the
 * callback token the API requires are generated here and handed to exactly one process each, so a
 * token that leaks into a log cannot be replayed against the next run, and a mismatch between the
 * two is a configuration error the harness can name rather than a mystery 401.
 */
final class CoRunEnvironment {

  /** Loopback only. The runner must never be reachable from another host during a co-run. */
  static final String HOST = "127.0.0.1";

  private static final SecureRandom RANDOM = new SecureRandom();

  private final int apiPort;
  private final int runnerPort;
  private final String runnerServiceToken;
  private final String callbackServiceToken;
  private final Path runnerDir;
  private final Path workDir;

  private CoRunEnvironment(int apiPort, int runnerPort, Path runnerDir, Path workDir) {
    this.apiPort = apiPort;
    this.runnerPort = runnerPort;
    this.runnerServiceToken = token();
    this.callbackServiceToken = token();
    this.runnerDir = runnerDir;
    this.workDir = workDir;
  }

  /**
   * Allocates the co-run's addresses and scratch space.
   *
   * <p>Both ports are taken before the Spring context starts, because the API's dispatch and
   * validation clients are constructed with the runner's base URL and the runner process is
   * constructed with the API's. Neither can wait for the other, so both are decided here.
   */
  static CoRunEnvironment allocate() {
    Path runnerDir = Path.of("..", "studio-runner").toAbsolutePath().normalize();
    Path workDir;
    try {
      workDir = Files.createTempDirectory("put-checks-corun-");
    } catch (IOException e) {
      throw new UncheckedIOException("The co-run could not create its working directory", e);
    }
    return new CoRunEnvironment(
        port("CORUN_API_PORT"), port("CORUN_RUNNER_PORT"), runnerDir, workDir);
  }

  int apiPort() {
    return apiPort;
  }

  int runnerPort() {
    return runnerPort;
  }

  String runnerBaseUrl() {
    return "http://" + HOST + ":" + runnerPort;
  }

  String apiBaseUrl() {
    return "http://" + HOST + ":" + apiPort;
  }

  /** What the API must present to the runner, and what the runner requires inbound. */
  String runnerServiceToken() {
    return runnerServiceToken;
  }

  /** What the runner must present to the API's internal routes, and what the API requires. */
  String callbackServiceToken() {
    return callbackServiceToken;
  }

  Path runnerDir() {
    return runnerDir;
  }

  /**
   * The per-run scratch root the runner clears on every exit path.
   *
   * <p>It is a child of the working directory rather than the working directory itself: the
   * runner's {@code clearAll()} removes this directory, and handing it a path something else owns
   * turns a normal cleanup into a failure whose message is about a filesystem rather than about a
   * run.
   */
  Path scratchDir() {
    return workDir.resolve("scratch");
  }

  /**
   * The runner's object store root: a real directory on this machine, not a stub.
   *
   * <p><b>Only the runner writes here; the API never reads it.</b> The API's video store provider
   * is {@code none} under this harness, so the media route's ranged read is not among its legs. The
   * cancel legs (Studio v1 WP12) do read it, from the harness side: a cancelled run whose {@code
   * FINAL} says {@code STORED} must have left a non-empty object at its video key here, which is
   * how "the evidence on the row is honest" is checked without the API's reader.
   */
  Path objectStoreDir() {
    return workDir.resolve("objects");
  }

  /** Where the runner's stdout and stderr are kept for the whole session. */
  Path runnerLog() {
    return workDir.resolve("studio-runner.log");
  }

  Path workDir() {
    return workDir;
  }

  private static String token() {
    byte[] bytes = new byte[32];
    RANDOM.nextBytes(bytes);
    return HexFormat.of().formatHex(bytes);
  }

  /**
   * A free TCP port, or the operator's override.
   *
   * <p>The socket is bound and closed rather than guessed. There is a window between the close and
   * the real bind, and it is accepted deliberately: the failure it produces is an immediate,
   * explicit "address already in use" at startup, which is attributable, whereas a hardcoded port
   * produces a collision with whatever else happens to be running and a failure that is not.
   */
  private static int port(String overrideVariable) {
    String override = System.getenv(overrideVariable);
    if (override != null && !override.isBlank()) {
      return Integer.parseInt(override.trim());
    }
    try (ServerSocket socket = new ServerSocket(0)) {
      socket.setReuseAddress(true);
      return socket.getLocalPort();
    } catch (IOException e) {
      throw new UncheckedIOException("The co-run could not allocate a free port", e);
    }
  }
}
