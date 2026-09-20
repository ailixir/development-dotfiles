package com.citi.put.checks.studio.compile.gateway;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.citi.put.checks.studio.compile.CompileBudget;
import com.citi.put.checks.studio.compile.CompileExecutor;
import com.citi.put.checks.studio.compile.StudioCompileProperties;
import com.google.auth.oauth2.GoogleCredentials;
import com.google.auth.oauth2.UserCredentials;
import com.sun.net.httpserver.HttpServer;
import java.net.InetSocketAddress;
import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.List;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicReference;
import org.junit.jupiter.api.Test;

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
    CompileRequest request = GatewayTestSupport.request(List.of("Go to example"));
    String proposal =
        "{\"version\":1,\"kind\":\"FULL\",\"steps\":[{\"stepId\":\""
            + request.writableStepIds().getFirst()
            + "\",\"status\":\"GENERATED\",\"code\":\"await"
            + " page.goto('https://example.invalid');\"}]}";
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
              GatewayTestSupport.generateContentBody(proposal).getBytes(StandardCharsets.UTF_8);
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
    CompileExecutor executor =
        new CompileExecutor(
            new StudioCompileProperties(
                new StudioCompileProperties.Pipeline(1, Duration.ofMillis(500)),
                null,
                null,
                null,
                null));
    try (GenAiLlmGatewayClient client =
        new GenAiLlmGatewayClient(
            GatewayTestSupport.properties(base, Duration.ofSeconds(10), 1, 262144, 262144, 2),
            GatewayTestSupport.parser(),
            new GatewayAuditLogger(),
            new BoundedCredentialProvider(source))) {
      CountDownLatch finished = new CountDownLatch(1);
      AtomicReference<CompileResponse> first = new AtomicReference<>();
      assertThat(
              executor.submit(
                  settlement -> {
                    first.set(client.propose(request, settlement.budget()));
                    finished.countDown();
                  },
                  () -> {
                    /* This test observes cancellation directly. */
                  }))
          .isTrue();
      assertThat(entered.await(2, TimeUnit.SECONDS)).isTrue();
      assertThat(finished.await(2, TimeUnit.SECONDS)).isTrue();
      assertThat(first.get().outcome()).isEqualTo(GatewayOutcome.TIMEOUT);
      assertThat(tokens).hasValue(1);
      assertThat(models).hasValue(0);
      long until = System.nanoTime() + TimeUnit.SECONDS.toNanos(1);
      while (executor.activeCount() > 0 && System.nanoTime() < until) {
        Thread.sleep(5);
      }
      assertThat(executor.activeCount()).isZero();
      stall.set(false);
      release.countDown();
      CountDownLatch secondDone = new CountDownLatch(1);
      AtomicReference<CompileResponse> second = new AtomicReference<>();
      assertThat(
              executor.submit(
                  settlement -> {
                    second.set(client.propose(request, settlement.budget()));
                    secondDone.countDown();
                  },
                  () -> {
                    /* This test observes cancellation directly. */
                  }))
          .isTrue();
      assertThat(secondDone.await(2, TimeUnit.SECONDS)).isTrue();
      assertThat(second.get().isOk()).isTrue();
      assertThat(authorization).hasValue("Bearer local-fixture-access-token");
      assertThat(quotaProject).hasValue("fixture-quota");
      assertThat(tokens).hasValue(2);
      assertThat(models).hasValue(1);
      assertThat(client.propose(request, new CompileBudget(Duration.ofSeconds(2))).isOk()).isTrue();
      assertThat(tokens).as("fresh token is reused without another credential request").hasValue(2);
      assertThat(models).hasValue(2);
      CompileBudget cancelled = new CompileBudget(Duration.ofSeconds(5));
      cancelled.cancel();
      assertThat(client.propose(request, cancelled).outcome()).isEqualTo(GatewayOutcome.TIMEOUT);
      assertThat(tokens).hasValue(2);
      assertThat(models).hasValue(2);
    } finally {
      release.countDown();
      executor.shutdown();
      server.stop(0);
      httpWorkers.shutdownNow();
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
      CompileBudget budget = new CompileBudget(Duration.ofSeconds(20));
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
