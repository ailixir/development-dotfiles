package com.citi.put.checks.config;

import static com.github.tomakehurst.wiremock.client.WireMock.get;
import static com.github.tomakehurst.wiremock.client.WireMock.okJson;
import static com.github.tomakehurst.wiremock.client.WireMock.urlEqualTo;
import static org.assertj.core.api.Assertions.assertThat;

import com.github.tomakehurst.wiremock.WireMockServer;
import com.github.tomakehurst.wiremock.core.WireMockConfiguration;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.boot.test.web.client.TestRestTemplate;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RestController;

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@ActiveProfiles("local")
@Import(IdempotencyInFlightConflictIT.SlowEndpointConfig.class)
class IdempotencyInFlightConflictIT {

  static WireMockServer wireMock =
      new WireMockServer(WireMockConfiguration.options().dynamicPort());

  static volatile CountDownLatch started;
  static volatile CountDownLatch complete;

  @Autowired TestRestTemplate restTemplate;

  @TestConfiguration
  static class SlowEndpointConfig {
    @Bean
    SlowScheduleController slowScheduleController() {
      return new SlowScheduleController();
    }
  }

  @RestController
  static class SlowScheduleController {
    @PostMapping("/api/v1/schedules/_slow-test")
    public ResponseEntity<Map<String, String>> handle() throws InterruptedException {
      if (started != null) {
        started.countDown();
      }
      if (complete != null) {
        complete.await(10, TimeUnit.SECONDS);
      }
      return ResponseEntity.ok(Map.of("result", "done"));
    }
  }

  @DynamicPropertySource
  static void configureProperties(DynamicPropertyRegistry registry) {
    wireMock.start();
    registry.add("checks.core-service.base-url", wireMock::baseUrl);
  }

  @AfterAll
  static void stopWireMock() {
    wireMock.stop();
  }

  @BeforeEach
  void setUp() {
    wireMock.resetAll();
    wireMock.stubFor(
        get(urlEqualTo("/api/v1/users/me"))
            .willReturn(
                okJson(
                    """
        {
          "user_id": "slow-user",
          "email": "slow@citi.com",
          "name": "Slow User",
          "roles": ["checks-admin"],
          "csi_ownership": []
        }
        """)));
  }

  @Test
  void secondRequestWaitsAndGetsReplayedResponse() throws Exception {
    started = new CountDownLatch(1);
    complete = new CountDownLatch(1);

    String key = UUID.randomUUID().toString();
    String cookie = "slow-" + System.nanoTime();

    ExecutorService pool = Executors.newFixedThreadPool(2);
    try {
      Future<ResponseEntity<String>> first =
          pool.submit(
              () -> {
                HttpHeaders h = new HttpHeaders();
                h.add("Cookie", "put_session=" + cookie);
                h.setContentType(MediaType.APPLICATION_JSON);
                h.set("Idempotency-Key", key);
                return restTemplate.exchange(
                    "/api/v1/schedules/_slow-test",
                    HttpMethod.POST,
                    new HttpEntity<>("{}", h),
                    String.class);
              });

      assertThat(started.await(5, TimeUnit.SECONDS)).isTrue();
      Thread.sleep(200);

      Future<ResponseEntity<String>> second =
          pool.submit(
              () -> {
                HttpHeaders h = new HttpHeaders();
                h.add("Cookie", "put_session=" + cookie);
                h.setContentType(MediaType.APPLICATION_JSON);
                h.set("Idempotency-Key", key);
                return restTemplate.exchange(
                    "/api/v1/schedules/_slow-test",
                    HttpMethod.POST,
                    new HttpEntity<>("{}", h),
                    String.class);
              });

      Thread.sleep(500);
      complete.countDown();

      ResponseEntity<String> firstResp = first.get(10, TimeUnit.SECONDS);
      ResponseEntity<String> secondResp = second.get(10, TimeUnit.SECONDS);

      assertThat(firstResp.getStatusCode().value()).isEqualTo(200);
      assertThat(firstResp.getHeaders().getFirst("Idempotent-Replayed")).isNull();

      assertThat(secondResp.getStatusCode().value()).isEqualTo(200);
      assertThat(secondResp.getHeaders().getFirst("Idempotent-Replayed")).isEqualTo("true");
    } finally {
      pool.shutdown();
    }
  }
}
