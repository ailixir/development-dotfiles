package com.citi.put.checks.studio.gateway;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.google.auth.oauth2.GoogleCredentials;
import com.google.auth.oauth2.UserCredentials;
import com.google.genai.types.GenerateContentConfig;
import com.sun.net.httpserver.HttpServer;
import java.net.InetSocketAddress;
import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicReference;
import org.junit.jupiter.api.Test;

/**
 * The credential refresh is bounded by the caller's deadline and its cancellation, holds the shared
 * transport permit only while it runs, and is never refreshed again while the cached token is
 * fresh.
 */
class CredentialBudgetTest {
  @org.junit.jupiter.params.ParameterizedTest
  @org.junit.jupiter.params.provider.ValueSource(strings = {"adc-user", "service-account"})
  void stalledRealGoogleTokenRefreshExpiresAndReleasesCompileAndGatewayCapacity(String mode)
      throws Exception {
    HttpServer server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
    var httpWorkers = Executors.newFixedThreadPool(3);
    server.setExecutor(httpWorkers);
    AtomicBoolean stall = new AtomicBoolean(true);
    AtomicInteger tokens = new AtomicInteger();
    AtomicInteger models = new AtomicInteger();
    CountDownLatch entered = new CountDownLatch(1);
    CountDownLatch release = new CountDownLatch(1);
    AtomicReference<String> authorization = new AtomicReference<>();
    AtomicReference<String> quotaProject = new AtomicReference<>();
    server.createContext(
        "/token",
        exchange -> {
          tokens.incrementAndGet();
          entered.countDown();
          if (stall.get()) {
            try {
              release.await(10, TimeUnit.SECONDS);
            } catch (InterruptedException error) {
              Thread.currentThread().interrupt();
            }
          }
          byte[] body =
              "{\"access_token\":\"local-fixture-access-token\",\"expires_in\":3600,\"token_type\":\"Bearer\"}"
                  .getBytes(StandardCharsets.UTF_8);
          try (exchange) {
            exchange.getResponseHeaders().set("Content-Type", "application/json");
            exchange.sendResponseHeaders(200, body.length);
            exchange.getResponseBody().write(body);
          } catch (java.io.IOException cancelledConnection) {
            // The expired client's actual socket has already been cancelled.
          }
        });
    server.createContext(
        "/",
        exchange -> {
          models.incrementAndGet();
          authorization.set(exchange.getRequestHeaders().getFirst("Authorization"));
          quotaProject.set(exchange.getRequestHeaders().getFirst("x-goog-user-project"));
          byte[] body =
              GatewayTestSupport.generateContentBody("{}").getBytes(StandardCharsets.UTF_8);
          try (exchange) {
            exchange.getResponseHeaders().set("Content-Type", "application/json");
            exchange.sendResponseHeaders(200, body.length);
            exchange.getResponseBody().write(body);
          }
        });
    server.start();
    String base = "http://127.0.0.1:" + server.getAddress().getPort();
    GoogleCredentials source;
    if (mode.equals("service-account")) {
      var generator = java.security.KeyPairGenerator.getInstance("RSA");
      generator.initialize(2048);
      source =
          com.google.auth.oauth2.ServiceAccountCredentials.newBuilder()
              .setClientEmail("fixture@example.invalid")
              .setQuotaProjectId("fixture-quota")
              .setPrivateKey(generator.generateKeyPair().getPrivate())
              .setTokenServerUri(URI.create(base + "/token"))
              .build();
    } else {
      source =
          UserCredentials.newBuilder()
              .setClientId("fixture-client")
              .setQuotaProjectId("fixture-quota")
              .setClientSecret("fixture-not-a-secret")
              .setRefreshToken("fixture-refresh-token")
              .setTokenServerUri(URI.create(base + "/token"))
              .build();
    }
    var caller = Executors.newSingleThreadExecutor();
    try (GenAiGatewayTransport transport =
        new GenAiGatewayTransport(
            GatewayTestSupport.properties(base, Duration.ofSeconds(10), 1, 262144, 262144),
            new BoundedCredentialProvider(source))) {
      // A 500 ms caller deadline: the stalled token endpoint must not outlive it.
      var first =
          caller.submit(
              () -> {
                try (GenAiGatewayTransport.Lease lease =
                    transport.tryAcquire(
                        GatewayTestSupport.budget(new CredentialBudget(Duration.ofMillis(500))))) {
                  assertThat(lease).isNotNull();
                  lease.authenticate();
                  return false;
                } catch (java.io.IOException
                    | java.util.concurrent.CancellationException expected) {
                  return true;
                }
              });
      assertThat(entered.await(2, TimeUnit.SECONDS)).isTrue();
      assertThat(first.get(2, TimeUnit.SECONDS)).as("expired before any model call").isTrue();
      assertThat(tokens).hasValue(1);
      assertThat(models).hasValue(0);
      stall.set(false);
      release.countDown();

      // The single permit was released by the expired attempt, so the next one is admitted.
      assertThat(generate(transport, Duration.ofSeconds(10))).isTrue();
      assertThat(authorization).hasValue("Bearer local-fixture-access-token");
      assertThat(quotaProject).hasValue("fixture-quota");
      assertThat(tokens).hasValue(2);
      assertThat(models).hasValue(1);
      assertThat(generate(transport, Duration.ofSeconds(2))).isTrue();
      assertThat(tokens).as("fresh token is reused without another credential request").hasValue(2);
      assertThat(models).hasValue(2);
      CredentialBudget cancelled = new CredentialBudget(Duration.ofSeconds(5));
      cancelled.cancel();
      try (GenAiGatewayTransport.Lease lease =
          transport.tryAcquire(GatewayTestSupport.budget(cancelled))) {
        assertThatThrownBy(lease::authenticate)
            .isInstanceOf(java.util.concurrent.CancellationException.class);
      }
      assertThat(tokens).hasValue(2);
      assertThat(models).hasValue(2);
    } finally {
      release.countDown();
      caller.shutdownNow();
      server.stop(0);
      httpWorkers.shutdownNow();
    }
  }

  private static boolean generate(GenAiGatewayTransport transport, Duration deadline)
      throws Exception {
    try (GenAiGatewayTransport.Lease lease =
        transport.tryAcquire(GatewayTestSupport.budget(new CredentialBudget(deadline)))) {
      assertThat(lease).as("the transport permit is free").isNotNull();
      lease.authenticate();
      return lease.generate("{}", GenerateContentConfig.builder().build(), true) != null;
    }
  }

  @Test
  void explicitCancellationClosesCredentialSocketBeforeItsLongDeadline() throws Exception {
    HttpServer server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
    var httpWorkers = Executors.newSingleThreadExecutor();
    server.setExecutor(httpWorkers);
    CountDownLatch entered = new CountDownLatch(1);
    CountDownLatch release = new CountDownLatch(1);
    server.createContext(
        "/token",
        exchange -> {
          entered.countDown();
          try {
            release.await(10, TimeUnit.SECONDS);
          } catch (InterruptedException error) {
            Thread.currentThread().interrupt();
          }
          exchange.close();
        });
    server.start();
    UserCredentials source =
        UserCredentials.newBuilder()
            .setClientId("fixture-client")
            .setClientSecret("fixture-not-a-secret")
            .setRefreshToken("fixture-refresh-token")
            .setTokenServerUri(
                URI.create("http://127.0.0.1:" + server.getAddress().getPort() + "/token"))
            .build();
    var caller = Executors.newSingleThreadExecutor();
    try (BoundedCredentialProvider provider = new BoundedCredentialProvider(source)) {
      CredentialBudget budget = new CredentialBudget(Duration.ofSeconds(20));
      var result =
          caller.submit(
              () -> {
                try {
                  provider.token(budget);
                  return false;
                } catch (java.io.IOException
                    | java.util.concurrent.CancellationException expected) {
                  return true;
                }
              });
      assertThat(entered.await(2, TimeUnit.SECONDS)).isTrue();
      budget.cancel();
      assertThat(result.get(1, TimeUnit.SECONDS)).isTrue();
      assertThat(caller.submit(() -> true).get(1, TimeUnit.SECONDS)).isTrue();
    } finally {
      release.countDown();
      server.stop(0);
      caller.shutdownNow();
      httpWorkers.shutdownNow();
    }
  }

  @Test
  void unknownCredentialProvidersFailClosedBeforeAnUnboundedRefreshCanRun() {
    assertThatThrownBy(() -> new BoundedCredentialProvider(GoogleCredentials.create(null)))
        .isInstanceOf(IllegalStateException.class)
        .hasMessageContaining("unsupported credential provider");
  }
}
