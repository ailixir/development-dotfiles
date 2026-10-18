package com.citi.put.checks.studio.guided.bridge;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.catchThrowableOfType;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.citi.put.checks.studio.guided.session.GuidedContracts;
import com.citi.put.checks.studio.guided.session.GuidedSessionException;
import com.citi.put.checks.studio.guided.session.GuidedSessionService;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.sun.net.httpserver.HttpsConfigurator;
import com.sun.net.httpserver.HttpsServer;
import java.net.InetSocketAddress;
import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.security.KeyStore;
import java.security.SecureRandom;
import java.util.List;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.concurrent.atomic.AtomicReference;
import javax.net.ssl.KeyManagerFactory;
import javax.net.ssl.SSLContext;
import javax.net.ssl.TrustManagerFactory;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.security.core.Authentication;

/**
 * STUDIO-OBS-014, ar-2-r14-stops ruling 2, prepare/admit: a definite runner refusal of the context
 * re-push ends the session {@code FAILED RUNTIME_INCOMPATIBLE} before {@code prepare} is sent, so
 * no preparation, admission or ledger row can exist. An uncertain reply keeps today's {@code
 * UNKNOWN_OUTCOME} and fails nothing. Real {@link GuidedRunnerClient} over HTTPS against a stub
 * runner; the session service and materialization are test doubles.
 */
class GuidedDispatchContextRefusalTest {

  @TempDir Path temporary;

  private final GuidedContracts contracts = new GuidedContracts();
  private final List<String> operations = new CopyOnWriteArrayList<>();
  private final AtomicReference<String> contextReply = new AtomicReference<>();
  private HttpsServer server;
  private GuidedSessionService sessions;
  private GuidedDispatchService dispatch;
  private final Authentication controller = mock(Authentication.class);

  @BeforeEach
  void start() throws Exception {
    SSLContext tls = certificate();
    server = HttpsServer.create(new InetSocketAddress("localhost", 0), 0);
    server.setHttpsConfigurator(new HttpsConfigurator(tls));
    server.createContext(
        "/",
        exchange -> {
          exchange.getRequestBody().readAllBytes();
          String path = exchange.getRequestURI().getPath();
          String operation = path.substring(path.lastIndexOf('/') + 1);
          operations.add(operation);
          byte[] body = contextReply.get().getBytes(StandardCharsets.UTF_8);
          exchange.sendResponseHeaders(409, body.length);
          exchange.getResponseBody().write(body);
          exchange.close();
        });
    server.start();
    var runner =
        new GuidedRunnerClient(
            URI.create("https://localhost:" + server.getAddress().getPort()),
            tls,
            () -> "synthetic-controller-token",
            contracts);
    sessions = mock(GuidedSessionService.class);
    var materialization = mock(GuidedMaterializationService.class);
    ObjectNode context = contracts.object().put("sessionId", "session-1").put("ownerFence", 1);
    when(sessions.existingAdmission(any(), anyString(), anyLong(), anyString(), any()))
        .thenReturn(null);
    when(sessions.runnerContext(any(), eq("session-1"), eq(1L))).thenReturn(context);
    when(materialization.identity(any())).thenReturn(context.deepCopy());
    dispatch = new GuidedDispatchService(sessions, materialization, runner);
  }

  @AfterEach
  void stop() {
    server.stop(0);
  }

  @Test
  void aDefiniteContextRefusalFailsTheSessionBeforePrepare() {
    for (String code : new String[] {"IDENTITY_MISMATCH", "SCHEMA"}) {
      operations.clear();
      contextReply.set("{\"code\":\"" + code + "\"}");

      var failure = admit();

      assertThat(failure.getMessage()).isEqualTo("RUNTIME_INCOMPATIBLE");
      assertThat(failure.retryable()).isFalse();
      assertThat(operations).as("no prepare after a definite refusal").containsExactly("context");
    }
    verify(sessions, org.mockito.Mockito.times(2))
        .failTranslation(controller, "session-1", 1L, "RUNTIME_INCOMPATIBLE");
    verify(sessions, never()).admit(any(), anyString(), anyLong(), anyString(), any());
  }

  @Test
  void anUncertainContextReplyKeepsUnknownOutcomeAndFailsNothing() {
    for (String reply : new String[] {"{\"code\":\"BUSY\"}", "not json"}) {
      operations.clear();
      contextReply.set(reply);

      assertThat(admit().getMessage()).isEqualTo("UNKNOWN_OUTCOME");
      assertThat(operations).containsExactly("context");
    }
    verify(sessions, never()).failTranslation(any(), anyString(), anyLong(), anyString());
  }

  private GuidedSessionException admit() {
    var proposal = contracts.object();
    proposal.putObject("operation").put("kind", "click");
    return catchThrowableOfType(
        () -> dispatch.prepareAndAdmit(controller, "session-1", 1, "admit-key", proposal),
        GuidedSessionException.class);
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
