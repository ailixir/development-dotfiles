package com.citi.put.checks.studio.guided.bridge;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.citi.put.checks.studio.guided.session.GuidedContracts;
import com.citi.put.checks.studio.secrets.SecretValue;
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
import java.util.concurrent.atomic.AtomicReference;
import javax.net.ssl.KeyManagerFactory;
import javax.net.ssl.SSLContext;
import javax.net.ssl.TrustManagerFactory;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

/**
 * Actual HTTPS producer seam; this alone does not claim a joined browser or G1 deployment proof.
 */
class GuidedSecretByteBodyTest {
  @TempDir Path temporary;

  @Test
  void guidedPublisherUsesOwnedBytesAndErasesBothBuffersAfterAckAndLostAck() throws Exception {
    var contracts = new GuidedContracts();
    var fixture =
        contracts
            .parse(
                Files.readString(
                    Path.of("../docs/specs/studio-observed-authoring/contracts/v3/fixtures.json")))
            .path("documents");
    ObjectNode dispatch = (ObjectNode) fixture.path("secretDispatch").deepCopy();
    ObjectNode metadata = (ObjectNode) dispatch.remove("secret");
    metadata.remove("value");
    String canary = "GUIDED-BYTE-CANARY-" + java.util.UUID.randomUUID();
    SSLContext tls = certificate();
    var server = HttpsServer.create(new InetSocketAddress("localhost", 0), 0);
    server.setHttpsConfigurator(new HttpsConfigurator(tls));
    var received = new AtomicReference<byte[]>();
    var status = new java.util.concurrent.atomic.AtomicInteger(200);
    byte[] outcome = fixture.path("outcome").toString().getBytes(StandardCharsets.UTF_8);
    server.createContext(
        "/",
        exchange -> {
          byte[] body = exchange.getRequestBody().readAllBytes();
          received.set(body);
          exchange.sendResponseHeaders(status.get(), status.get() == 200 ? outcome.length : -1);
          if (status.get() == 200) {
            exchange.getResponseBody().write(outcome);
          }
          exchange.close();
        });
    server.start();
    try {
      var client =
          new GuidedRunnerClient(
              URI.create("https://localhost:" + server.getAddress().getPort()),
              tls,
              () -> "synthetic-controller-token",
              contracts);
      for (int reply : new int[] {200, 503}) {
        status.set(reply);
        var bytes = new AtomicReference<byte[]>();
        client.observeRequestBytes(bytes::set);
        char[] chars = canary.toCharArray();
        var secret = new SecretValue(chars);
        if (reply == 200) {
          client.sendSecret(dispatch, metadata, secret);
        } else {
          assertThatThrownBy(() -> client.sendSecret(dispatch, metadata, secret))
              .hasMessage("UNKNOWN_OUTCOME");
        }
        assertThat(new String(received.get(), StandardCharsets.UTF_8)).contains(canary);
        assertThat(bytes.get()).containsOnly((byte) 0);
        assertThat(chars).containsOnly('\0');
        assertThat(dispatch.toString()).doesNotContain(canary);
        assertThat(secret.toString()).isEqualTo("<secret>");
        java.util.Arrays.fill(received.get(), (byte) 0);
      }
    } finally {
      server.stop(0);
      java.util.Arrays.fill(outcome, (byte) 0);
    }
  }

  @org.junit.jupiter.params.ParameterizedTest
  @org.junit.jupiter.params.provider.ValueSource(ints = {200, 503})
  void actualProductionHttpsPartialBodyCannotOutliveCallerDeadlineAndBuffersAreErased(int status)
      throws Exception {
    stalledResponse(status, false, false);
  }

  @Test
  void actualProductionHttpsInterruptionClosesPartialResponseAndErasesOwnedBuffers()
      throws Exception {
    stalledResponse(200, true, false);
  }

  @Test
  void actualProductionHttpsDefaultFifteenSecondBoundIncludesTheResponseBody() throws Exception {
    stalledResponse(200, false, true);
  }

  private void stalledResponse(int status, boolean interrupt, boolean defaultBound)
      throws Exception {
    var contracts = new GuidedContracts();
    var documents =
        contracts
            .parse(
                Files.readString(
                    Path.of("../docs/specs/studio-observed-authoring/contracts/v3/fixtures.json")))
            .path("documents");
    ObjectNode dispatch = (ObjectNode) documents.path("secretDispatch").deepCopy();
    ObjectNode metadata = (ObjectNode) dispatch.remove("secret");
    metadata.remove("value");
    String canary = "STALLED-BYTE-" + java.util.UUID.randomUUID();
    char[] chars = canary.toCharArray();
    var secret = new SecretValue(chars);
    var owned = new AtomicReference<byte[]>();
    var received = new AtomicReference<byte[]>();
    var requests = new java.util.concurrent.atomic.AtomicInteger();
    var headers = new java.util.concurrent.CountDownLatch(1);
    var disconnected = new java.util.concurrent.CountDownLatch(1);
    var certified = new java.util.concurrent.atomic.AtomicBoolean();
    SSLContext tls = certificate();
    var server = HttpsServer.create(new InetSocketAddress("localhost", 0), 0);
    server.setHttpsConfigurator(
        new HttpsConfigurator(tls) {
          @Override
          public void configure(com.sun.net.httpserver.HttpsParameters parameters) {
            var configuration = tls.getDefaultSSLParameters();
            configuration.setNeedClientAuth(true);
            parameters.setSSLParameters(configuration);
          }
        });
    var workers = java.util.concurrent.Executors.newVirtualThreadPerTaskExecutor();
    server.setExecutor(workers);
    server.createContext(
        "/",
        exchange -> {
          requests.incrementAndGet();
          received.set(exchange.getRequestBody().readAllBytes());
          certified.set(
              ((com.sun.net.httpserver.HttpsExchange) exchange)
                      .getSSLSession()
                      .getPeerCertificates()
                      .length
                  > 0);
          exchange.sendResponseHeaders(status, 0);
          try {
            exchange.getResponseBody().write('{');
            exchange.getResponseBody().flush();
            headers.countDown();
            while (true) {
              exchange.getResponseBody().write(' ');
              exchange.getResponseBody().flush();
              Thread.sleep(20);
            }
          } catch (java.io.IOException closed) {
            disconnected.countDown();
          } catch (InterruptedException stopped) {
            Thread.currentThread().interrupt();
          } finally {
            exchange.close();
          }
        });
    server.start();
    var failed = new AtomicReference<Throwable>();
    var interrupted = new java.util.concurrent.atomic.AtomicBoolean();
    var client =
        new GuidedRunnerClient(
            URI.create("https://localhost:" + server.getAddress().getPort()),
            tls,
            () -> "synthetic-controller-token",
            contracts);
    client.observeRequestBytes(owned::set);
    long started = System.nanoTime();
    Thread caller =
        Thread.ofVirtual()
            .start(
                () -> {
                  try {
                    client.sendSecret(
                        dispatch,
                        metadata,
                        secret,
                        defaultBound || interrupt
                            ? null
                            : java.time.Instant.now().plusMillis(1000));
                  } catch (Throwable refusal) {
                    failed.set(refusal);
                    interrupted.set(Thread.currentThread().isInterrupted());
                  }
                });
    try {
      assertThat(headers.await(3, java.util.concurrent.TimeUnit.SECONDS)).isTrue();
      if (interrupt) {
        caller.interrupt();
      }
      caller.join(defaultBound ? 16500 : 3000);
      assertThat(caller.isAlive())
          .as("actual production sender must finish without peer EOF")
          .isFalse();
      assertThat(failed.get())
          .isInstanceOf(com.citi.put.checks.studio.guided.session.GuidedSessionException.class)
          .hasMessage("UNKNOWN_OUTCOME");
      assertThat(java.time.Duration.ofNanos(System.nanoTime() - started).toMillis())
          .isLessThan(defaultBound ? 16000 : 3000);
      assertThat(requests.get()).isEqualTo(1);
      assertThat(certified.get()).isTrue();
      assertThat(new String(received.get(), StandardCharsets.UTF_8).contains(canary)).isTrue();
      assertThat(owned.get()).containsOnly((byte) 0);
      assertThat(chars).containsOnly('\0');
      assertThat(secret.toString()).isEqualTo("<secret>");
      assertThat(dispatch.toString().contains(canary)).isFalse();
      if (interrupt) {
        assertThat(interrupted.get()).isTrue();
      }
      assertThat(disconnected.await(2, java.util.concurrent.TimeUnit.SECONDS))
          .as("peer observes response-stream cancellation")
          .isTrue();
    } finally {
      caller.interrupt();
      server.stop(0);
      workers.shutdownNow();
      caller.join(3000);
      if (received.get() != null) {
        java.util.Arrays.fill(received.get(), (byte) 0);
      }
    }
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
