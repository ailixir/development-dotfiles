package com.citi.put.checks.corun;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpServer;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.io.UncheckedIOException;
import java.net.InetAddress;
import java.net.InetSocketAddress;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * The runner's callback address during a co-run: a transparent loopback proxy in front of the API's
 * internal routes (Studio v1 WP12).
 *
 * <p><b>Why a proxy and not a hook in the API.</b> Two things the cancel legs need cannot be read
 * off either process after the fact:
 *
 * <ul>
 *   <li><b>Which signal ended the run, and when.</b> The runner's control read, its progress
 *       acknowledgements and its {@code FINAL} all cross this seam; recording the instant each one
 *       was answered, and what it said, is what lets a leg time the cancel path hop by hop and say
 *       which signal it exercised (the plan's R2).
 *   <li><b>The admission-window race.</b> A real runner answers {@code POST /v1/runs} only after
 *       its admission CAS, so by the time the dispatcher's send returns the row is already admitted
 *       and a cancel "between send and admission" cannot be produced black-box. Holding the
 *       runner's {@code POST …/admission} here until the leg has recorded its cancel is the one
 *       deterministic way to put the cancel inside that window without touching either process.
 * </ul>
 *
 * <p><b>It changes nothing it forwards.</b> Method, path, body and the three headers the internal
 * routes read are passed through verbatim, and the API's status and body come back verbatim. It
 * records statuses, timings and a handful of named fields; <b>it never records or prints a body</b>
 * — a progress report carries the run's redacted logs, and nothing here needs them.
 */
final class CallbackProxy implements AutoCloseable {

  private static final ObjectMapper MAPPER = new ObjectMapper();

  private static final Pattern ROUTE =
      Pattern.compile(
          "^/internal/studio/executions/([0-9a-fA-F-]{36})/(admission|progress|control)$");

  /** The only request headers the internal routes read. Everything else is the transport's. */
  private static final Set<String> FORWARDED_HEADERS =
      Set.of("authorization", "content-type", "accept", "x-runner-delivery-attempt");

  /** One request the runner made, as answered. Never carries a body. */
  record Call(
      UUID executionId,
      String route,
      String method,
      int status,
      long receivedAtNanos,
      long answeredAtNanos,
      String reportKind,
      Boolean cancelRequested,
      FinalReport finalReport) {}

  /** The named fields of a {@code FINAL} report the cancel legs assert on, and nothing else. */
  record FinalReport(
      String result,
      String errorCode,
      String errorMessage,
      String evidenceState,
      Boolean evidencePartial,
      String videoKey,
      boolean browserStarted) {}

  /** An admission the proxy is holding until the leg releases it. */
  static final class Hold {
    private final CountDownLatch arrived = new CountDownLatch(1);
    private final CountDownLatch released = new CountDownLatch(1);

    boolean awaitArrival(Duration timeout) throws InterruptedException {
      return arrived.await(timeout.toMillis(), TimeUnit.MILLISECONDS);
    }

    void release() {
      released.countDown();
    }
  }

  private final HttpServer server;
  private final ExecutorService handlers;
  private final String target;
  private final HttpClient http =
      HttpClient.newBuilder()
          .version(HttpClient.Version.HTTP_1_1)
          .connectTimeout(Duration.ofSeconds(2))
          .build();
  private final List<Call> calls = new ArrayList<>();
  private final Map<UUID, Hold> holds = new ConcurrentHashMap<>();

  private CallbackProxy(HttpServer server, ExecutorService handlers, String target) {
    this.server = server;
    this.handlers = handlers;
    this.target = target;
  }

  /**
   * Starts the proxy on an ephemeral loopback port.
   *
   * @param target the API's base URL, which every request is forwarded to
   */
  static CallbackProxy start(String target) {
    HttpServer server;
    try {
      server =
          HttpServer.create(
              new InetSocketAddress(InetAddress.getByName(CoRunEnvironment.HOST), 0), 0);
    } catch (IOException e) {
      throw new UncheckedIOException("The co-run could not start its callback proxy", e);
    }
    ExecutorService handlers =
        Executors.newCachedThreadPool(
            runnable -> {
              Thread thread = new Thread(runnable, "corun-callback-proxy");
              thread.setDaemon(true);
              return thread;
            });
    CallbackProxy proxy = new CallbackProxy(server, handlers, target);
    server.setExecutor(handlers);
    server.createContext("/", proxy::handle);
    server.start();
    return proxy;
  }

  String url() {
    return "http://" + CoRunEnvironment.HOST + ":" + server.getAddress().getPort();
  }

  /** Holds the next {@code POST …/admission} for {@code executionId} until released. */
  Hold holdAdmission(UUID executionId) {
    Hold hold = new Hold();
    holds.put(executionId, hold);
    return hold;
  }

  /** Every call the runner made for {@code executionId}, oldest first. */
  synchronized List<Call> callsFor(UUID executionId) {
    return calls.stream().filter(call -> executionId.equals(call.executionId())).toList();
  }

  /** The first control read for {@code executionId} answered at or after {@code sinceNanos}. */
  Optional<Call> controlReadSince(UUID executionId, long sinceNanos) {
    return callsFor(executionId).stream()
        .filter(call -> "control".equals(call.route()) && call.answeredAtNanos() >= sinceNanos)
        .findFirst();
  }

  /** The first control read for {@code executionId} that told the runner to stop. */
  Optional<Call> controlReadThatSaidCancel(UUID executionId) {
    return callsFor(executionId).stream()
        .filter(
            call -> "control".equals(call.route()) && Boolean.TRUE.equals(call.cancelRequested()))
        .findFirst();
  }

  /** The runner's {@code FINAL} for {@code executionId}, as the API answered it, if it was sent. */
  Optional<Call> finalReport(UUID executionId) {
    return callsFor(executionId).stream().filter(call -> call.finalReport() != null).findFirst();
  }

  @Override
  public void close() {
    holds.values().forEach(Hold::release);
    server.stop(0);
    handlers.shutdownNow();
  }

  // ── internals ──────────────────────────────────────────────────────────

  private void handle(HttpExchange exchange) throws IOException {
    long received = System.nanoTime();
    String method = exchange.getRequestMethod();
    String path = exchange.getRequestURI().getRawPath();
    String query = exchange.getRequestURI().getRawQuery();
    byte[] body;
    try (InputStream in = exchange.getRequestBody()) {
      body = in.readAllBytes();
    }

    Matcher route = ROUTE.matcher(path);
    UUID executionId = route.matches() ? UUID.fromString(route.group(1)) : null;
    String routeName = route.matches() ? route.group(2) : "other";

    if ("admission".equals(routeName) && executionId != null) {
      Hold hold = holds.remove(executionId);
      if (hold != null) {
        hold.arrived.countDown();
        try {
          // Bounded: a leg that forgets to release must not wedge the runner's admission forever.
          hold.released.await(30, TimeUnit.SECONDS);
        } catch (InterruptedException e) {
          Thread.currentThread().interrupt();
        }
      }
    }

    HttpRequest.Builder forward =
        HttpRequest.newBuilder(URI.create(target + path + (query == null ? "" : "?" + query)))
            .timeout(Duration.ofSeconds(30))
            .method(
                method,
                body.length == 0
                    ? HttpRequest.BodyPublishers.noBody()
                    : HttpRequest.BodyPublishers.ofByteArray(body));
    exchange
        .getRequestHeaders()
        .forEach(
            (name, values) -> {
              if (FORWARDED_HEADERS.contains(name.toLowerCase(java.util.Locale.ROOT))) {
                values.forEach(value -> forward.header(name, value));
              }
            });

    int status;
    byte[] answer;
    String contentType = null;
    try {
      HttpResponse<byte[]> response =
          http.send(forward.build(), HttpResponse.BodyHandlers.ofByteArray());
      status = response.statusCode();
      answer = response.body();
      contentType = response.headers().firstValue("Content-Type").orElse(null);
    } catch (IOException e) {
      status = 502;
      answer = new byte[0];
    } catch (InterruptedException e) {
      Thread.currentThread().interrupt();
      status = 502;
      answer = new byte[0];
    }

    if (contentType != null) {
      exchange.getResponseHeaders().set("Content-Type", contentType);
    }
    exchange.sendResponseHeaders(status, answer.length == 0 ? -1 : answer.length);
    try (OutputStream out = exchange.getResponseBody()) {
      out.write(answer);
    }
    long answered = System.nanoTime();

    if (executionId != null) {
      record(executionId, routeName, method, status, received, answered, body, answer);
    }
  }

  private void record(
      UUID executionId,
      String route,
      String method,
      int status,
      long received,
      long answered,
      byte[] requestBody,
      byte[] responseBody) {
    String reportKind = null;
    Boolean cancelRequested = null;
    FinalReport finalReport = null;
    if ("progress".equals(route)) {
      JsonNode report = parse(requestBody);
      reportKind = text(report.path("kind"));
      JsonNode ack = parse(responseBody);
      if (ack.has("cancelRequested")) {
        cancelRequested = ack.path("cancelRequested").asBoolean();
      }
      if ("FINAL".equals(reportKind)) {
        JsonNode outcome = report.path("outcome");
        JsonNode evidence = report.path("evidence");
        finalReport =
            new FinalReport(
                text(outcome.path("result")),
                text(outcome.path("errorCode")),
                text(outcome.path("errorMessage")),
                text(evidence.path("state")),
                evidence.has("partial") ? evidence.path("partial").asBoolean() : null,
                text(evidence.path("videoKey")),
                !report.path("browserStartedAt").isNull()
                    && !report.path("browserStartedAt").isMissingNode());
      }
    } else if ("control".equals(route)) {
      JsonNode control = parse(responseBody);
      if (control.has("cancelRequested")) {
        cancelRequested = control.path("cancelRequested").asBoolean();
      }
    }
    synchronized (this) {
      calls.add(
          new Call(
              executionId,
              route,
              method,
              status,
              received,
              answered,
              reportKind,
              cancelRequested,
              finalReport));
    }
  }

  private static JsonNode parse(byte[] bytes) {
    if (bytes.length == 0) {
      return MAPPER.missingNode();
    }
    try {
      return MAPPER.readTree(bytes);
    } catch (IOException e) {
      return MAPPER.missingNode();
    }
  }

  private static String text(JsonNode node) {
    return node.isMissingNode() || node.isNull() ? null : node.asText();
  }
}
