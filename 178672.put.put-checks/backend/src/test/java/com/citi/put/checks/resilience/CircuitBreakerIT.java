package com.citi.put.checks.resilience;

import static com.github.tomakehurst.wiremock.client.WireMock.aResponse;
import static com.github.tomakehurst.wiremock.client.WireMock.get;
import static com.github.tomakehurst.wiremock.client.WireMock.getRequestedFor;
import static com.github.tomakehurst.wiremock.client.WireMock.okJson;
import static com.github.tomakehurst.wiremock.client.WireMock.urlEqualTo;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.citi.put.checks.security.CoreServiceClient;
import com.github.tomakehurst.wiremock.WireMockServer;
import com.github.tomakehurst.wiremock.core.WireMockConfiguration;
import io.github.resilience4j.circuitbreaker.CircuitBreaker;
import io.github.resilience4j.circuitbreaker.CircuitBreakerRegistry;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.context.TestPropertySource;

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@ActiveProfiles("local")
@TestPropertySource(
    properties = {
      "resilience4j.circuitbreaker.instances.core-service.sliding-window-size=5",
      "resilience4j.circuitbreaker.instances.core-service.minimum-number-of-calls=3",
      "resilience4j.circuitbreaker.instances.core-service.wait-duration-in-open-state=2s",
      "resilience4j.retry.instances.core-service.max-attempts=1"
    })
class CircuitBreakerIT {

  static WireMockServer wireMock =
      new WireMockServer(WireMockConfiguration.options().dynamicPort());

  @Autowired CoreServiceClient coreServiceClient;
  @Autowired CircuitBreakerRegistry circuitBreakerRegistry;

  @DynamicPropertySource
  static void configureProperties(DynamicPropertyRegistry registry) {
    wireMock.start();
    registry.add("checks.core-service.base-url", wireMock::baseUrl);
    registry.add("checks.scheduling.initial-delay-ms", () -> "300000");
    registry.add("checks.reports.initial-delay-ms", () -> "300000");
    registry.add("checks.scheduling.retry-initial-delay-ms", () -> "300000");
  }

  @AfterAll
  static void stopWireMock() {
    wireMock.stop();
  }

  @BeforeEach
  void setUp() {
    wireMock.resetAll();
    CircuitBreaker cb = circuitBreakerRegistry.circuitBreaker("core-service");
    cb.reset();
  }

  @Test
  void circuitBreakerOpensAfterFailureThreshold() {
    wireMock.stubFor(
        get(urlEqualTo("/api/v1/users/me"))
            .willReturn(aResponse().withStatus(500).withBody("Internal Server Error")));

    for (int i = 0; i < 5; i++) {
      try {
        coreServiceClient.getUserMe("test-session");
      } catch (Exception ignored) {
      }
    }

    CircuitBreaker cb = circuitBreakerRegistry.circuitBreaker("core-service");
    assertThat(cb.getState())
        .as("Circuit breaker should be OPEN after repeated failures")
        .isEqualTo(CircuitBreaker.State.OPEN);

    wireMock.resetRequests();

    assertThatThrownBy(() -> coreServiceClient.getUserMe("test-session"))
        .as("Calls should fail-fast when breaker is open");

    int requestsAfterOpen =
        wireMock
            .countRequestsMatching(getRequestedFor(urlEqualTo("/api/v1/users/me")).build())
            .getCount();
    assertThat(requestsAfterOpen)
        .as("No requests should reach WireMock when breaker is OPEN")
        .isZero();
  }

  @Test
  void circuitBreakerRecoversToClosed() throws InterruptedException {
    wireMock.stubFor(get(urlEqualTo("/api/v1/users/me")).willReturn(aResponse().withStatus(500)));

    for (int i = 0; i < 5; i++) {
      try {
        coreServiceClient.getUserMe("test-session");
      } catch (Exception ignored) {
      }
    }

    CircuitBreaker cb = circuitBreakerRegistry.circuitBreaker("core-service");
    assertThat(cb.getState()).isEqualTo(CircuitBreaker.State.OPEN);

    Thread.sleep(2500);

    wireMock.stubFor(
        get(urlEqualTo("/api/v1/users/me"))
            .willReturn(
                okJson(
                    "{\"user_id\":\"u\",\"email\":\"cb@citi.com\",\"name\":\"CB\","
                        + "\"roles\":[\"checks-admin\"],\"csi_ownership\":[]}")));

    try {
      coreServiceClient.getUserMe("test-session");
    } catch (Exception ignored) {
    }

    assertThat(cb.getState())
        .as("After wait + successful call, breaker should be HALF_OPEN or CLOSED")
        .isIn(CircuitBreaker.State.HALF_OPEN, CircuitBreaker.State.CLOSED);
  }
}
