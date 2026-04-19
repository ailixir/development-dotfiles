package com.citi.put.checks.security;

import static com.github.tomakehurst.wiremock.client.WireMock.get;
import static com.github.tomakehurst.wiremock.client.WireMock.getRequestedFor;
import static com.github.tomakehurst.wiremock.client.WireMock.okJson;
import static com.github.tomakehurst.wiremock.client.WireMock.urlEqualTo;

import com.github.tomakehurst.wiremock.WireMockServer;
import com.github.tomakehurst.wiremock.core.WireMockConfiguration;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.client.TestRestTemplate;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@ActiveProfiles("local")
class IdentityCacheIT {

  private static final String IDENTITY_JSON =
      """
            {
              "user_id": "alice@citi.com",
              "email": "alice@citi.com",
              "name": "Alice",
              "roles": ["checks-operator"],
              "csi_ownership": [{ "csi_id": "174523", "role": "owner" }]
            }
            """;

  static WireMockServer wireMock =
      new WireMockServer(WireMockConfiguration.options().dynamicPort());

  @Autowired TestRestTemplate restTemplate;

  @AfterAll
  static void stopWireMock() {
    wireMock.stop();
  }

  @DynamicPropertySource
  static void configureProperties(DynamicPropertyRegistry registry) {
    wireMock.start();
    registry.add("checks.core-service.base-url", wireMock::baseUrl);
  }

  @BeforeEach
  void resetWireMock() {
    wireMock.resetAll();
  }

  @Test
  void secondRequestWithSameCookieHitsCache() {
    wireMock.stubFor(get(urlEqualTo("/api/v1/users/me")).willReturn(okJson(IDENTITY_JSON)));

    HttpHeaders headers = new HttpHeaders();
    headers.add("Cookie", "put_session=cached-token");

    restTemplate.exchange(
        "/api/v1/checks", HttpMethod.GET, new HttpEntity<>(headers), String.class);
    restTemplate.exchange(
        "/api/v1/checks", HttpMethod.GET, new HttpEntity<>(headers), String.class);

    wireMock.verify(1, getRequestedFor(urlEqualTo("/api/v1/users/me")));
  }
}
