package com.citi.put.checks.studio.guided.bridge;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.catchThrowableOfType;

import ch.qos.logback.classic.Logger;
import ch.qos.logback.classic.spi.ILoggingEvent;
import ch.qos.logback.core.read.ListAppender;
import com.citi.put.checks.studio.dispatch.HttpRunnerDispatchClient;
import com.citi.put.checks.studio.guided.session.GuidedContracts;
import com.citi.put.checks.studio.guided.session.GuidedSessionException;
import com.sun.net.httpserver.HttpsConfigurator;
import com.sun.net.httpserver.HttpsServer;
import java.net.InetSocketAddress;
import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.security.KeyStore;
import java.security.SecureRandom;
import java.util.concurrent.atomic.AtomicReference;
import javax.net.ssl.KeyManagerFactory;
import javax.net.ssl.SSLContext;
import javax.net.ssl.TrustManagerFactory;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.slf4j.LoggerFactory;

/**
 * STUDIO-OBS-014, ar-2-r14-stops ruling 2: only a runner's 409 to a {@code context} push whose body
 * validates against the closed {@code bridge#/definitions/refusal} and names {@code
 * IDENTITY_MISMATCH} or {@code SCHEMA} is a definite refusal ({@code RUNTIME_INCOMPATIBLE}, not
 * retryable). Every other reply keeps {@code UNKNOWN_OUTCOME} and its bounded retry. The reply body
 * never reaches an exception message or a log line.
 */
class GuidedRunnerContextRefusalTest {

  private static final String CANARY = "refusal-body-canary-5521";

  @TempDir Path temporary;

  private final GuidedContracts contracts = new GuidedContracts();
  private final AtomicReference<byte[]> reply = new AtomicReference<>();
  private final AtomicReference<Integer> status = new AtomicReference<>(409);
  private final ListAppender<ILoggingEvent> logs = new ListAppender<>();
  private HttpsServer server;
  private HttpRunnerDispatchClient client;

  @BeforeEach
  void start() throws Exception {
    SSLContext tls = certificate();
    server = HttpsServer.create(new InetSocketAddress("localhost", 0), 0);
    server.setHttpsConfigurator(new HttpsConfigurator(tls));
    server.createContext(
        "/",
        exchange -> {
          exchange.getRequestBody().readAllBytes();
          byte[] body = reply.get();
          exchange.sendResponseHeaders(status.get(), body.length == 0 ? -1 : body.length);
          if (body.length > 0) {
            exchange.getResponseBody().write(body);
          }
          exchange.close();
        });
    server.start();
    client =
        new HttpRunnerDispatchClient(
            URI.create("https://localhost:" + server.getAddress().getPort()),
            tls,
            () -> "synthetic-controller-token",
            contracts);
    logs.start();
    ((Logger) LoggerFactory.getLogger(HttpRunnerDispatchClient.class)).addAppender(logs);
  }

  @AfterEach
  void stop() {
    ((Logger) LoggerFactory.getLogger(HttpRunnerDispatchClient.class)).detachAppender(logs);
    server.stop(0);
  }

  @Test
  void identityMismatchAndSchemaRefusalsOfAContextAreDefinite() {
    for (String code : new String[] {"IDENTITY_MISMATCH", "SCHEMA"}) {
      var refusal = refused("context", "{\"code\":\"" + code + "\"}");
      assertThat(refusal.getMessage()).isEqualTo("RUNTIME_INCOMPATIBLE");
      assertThat(refusal.status()).isEqualTo(409);
      assertThat(refusal.retryable()).isFalse();
      assertThat(HttpRunnerDispatchClient.definiteContextRefusal(refusal)).isTrue();
    }
    assertThat(logs.list).hasSize(2);
    assertThat(logs.list.getFirst().getFormattedMessage()).contains("IDENTITY_MISMATCH");
  }

  @Test
  void anyOtherContextReplyStaysAnUnknownOutcome() {
    // STUDIO-OBS-015 B2B-01 P2: a closed non-definite code stays a public UNKNOWN_OUTCOME but is
    // marked as a closed refusal and logged (value-free) exactly once.
    var busy = refused("context", "{\"code\":\"BUSY\"}");
    assertThat(busy.getMessage()).isEqualTo("UNKNOWN_OUTCOME");
    assertThat(busy.status()).isEqualTo(409);
    assertThat(busy.retryable()).isFalse();
    assertThat(busy.messageCode()).isEqualTo(HttpRunnerDispatchClient.CONTEXT_CLOSED_REFUSAL);
    assertThat(HttpRunnerDispatchClient.definiteContextRefusal(busy)).isFalse();
    assertThat(HttpRunnerDispatchClient.closedContextRefusal(busy)).isTrue();
    assertThat(logs.list).hasSize(1);
    assertThat(logs.list.getFirst().getFormattedMessage()).contains("BUSY");
    for (String body :
        new String[] {
          "{\"code\":\"IDENTITY_MISMATCH\",\"extra\":\"" + CANARY + "\"}",
          "not json " + CANARY,
          "{\"code\":\"IDENTITY_MISMATCH\",\"reason\":\"" + "x".repeat(5000) + "\"}",
          ""
        }) {
      var refusal = refused("context", body);
      assertThat(refusal.getMessage())
          .as(body.length() > 60 ? "oversize" : body)
          .isEqualTo("UNKNOWN_OUTCOME");
      assertThat(HttpRunnerDispatchClient.definiteContextRefusal(refusal)).isFalse();
      assertThat(HttpRunnerDispatchClient.closedContextRefusal(refusal)).isFalse();
    }
    status.set(503);
    var unavailable = refused("context", "{\"code\":\"IDENTITY_MISMATCH\"}");
    assertThat(unavailable.getMessage())
        .as("only a 409 can be a definite refusal")
        .isEqualTo("UNKNOWN_OUTCOME");
    assertThat(HttpRunnerDispatchClient.closedContextRefusal(unavailable)).isFalse();
    assertThat(logs.list).as("only the closed BUSY refusal is logged").hasSize(1);
    assertThat(rendered()).doesNotContain(CANARY);
  }

  @Test
  void aPrepareRefusalIsNeverWidenedIntoADefiniteOne() {
    var refusal = refused("prepare", "{\"code\":\"IDENTITY_MISMATCH\"}");
    assertThat(refusal.getMessage()).isEqualTo("UNKNOWN_OUTCOME");
    assertThat(HttpRunnerDispatchClient.definiteContextRefusal(refusal)).isFalse();
  }

  private GuidedSessionException refused(String operation, String body) {
    reply.set(body.getBytes(StandardCharsets.UTF_8));
    var request = contracts.object().put("sessionId", "session-1").put("ownerFence", 1);
    var failure =
        catchThrowableOfType(() -> client.send(operation, request), GuidedSessionException.class);
    assertThat(failure).isNotNull();
    assertThat(failure.getMessage()).doesNotContain(CANARY);
    return failure;
  }

  private String rendered() {
    StringBuilder out = new StringBuilder();
    logs.list.forEach(event -> out.append(event.getFormattedMessage()).append('\n'));
    return out.toString();
  }

  private SSLContext certificate() throws Exception {
    run(
        "openssl",
        "req",
        "-x509",
        "-newkey",
        "rsa:2048",
        "-nodes",
        "-keyout",
        temporary.resolve("key.pem").toString(),
        "-out",
        temporary.resolve("cert.pem").toString(),
        "-days",
        "1",
        "-subj",
        "/CN=localhost",
        "-addext",
        "subjectAltName=DNS:localhost");
    run(
        "openssl",
        "pkcs12",
        "-export",
        "-inkey",
        temporary.resolve("key.pem").toString(),
        "-in",
        temporary.resolve("cert.pem").toString(),
        "-out",
        temporary.resolve("fixture.p12").toString(),
        "-passout",
        "pass:fixture");
    var store = KeyStore.getInstance("PKCS12");
    try (var in = Files.newInputStream(temporary.resolve("fixture.p12"))) {
      store.load(in, "fixture".toCharArray());
    }
    var keys = KeyManagerFactory.getInstance(KeyManagerFactory.getDefaultAlgorithm());
    keys.init(store, "fixture".toCharArray());
    var trust = TrustManagerFactory.getInstance(TrustManagerFactory.getDefaultAlgorithm());
    trust.init(store);
    var tls = SSLContext.getInstance("TLS");
    tls.init(keys.getKeyManagers(), trust.getTrustManagers(), new SecureRandom());
    return tls;
  }

  private void run(String... command) throws Exception {
    var process = new ProcessBuilder(command).redirectErrorStream(true).start();
    try (var in = process.getInputStream()) {
      in.transferTo(java.io.OutputStream.nullOutputStream());
    }
    assertThat(process.waitFor()).isZero();
  }
}
