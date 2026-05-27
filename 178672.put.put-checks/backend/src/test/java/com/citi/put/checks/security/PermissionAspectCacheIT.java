package com.citi.put.checks.security;

import static com.github.tomakehurst.wiremock.client.WireMock.get;
import static com.github.tomakehurst.wiremock.client.WireMock.okJson;
import static com.github.tomakehurst.wiremock.client.WireMock.post;
import static com.github.tomakehurst.wiremock.client.WireMock.postRequestedFor;
import static com.github.tomakehurst.wiremock.client.WireMock.urlEqualTo;

import com.github.tomakehurst.wiremock.WireMockServer;
import com.github.tomakehurst.wiremock.core.WireMockConfiguration;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.client.TestRestTemplate;
import org.springframework.context.annotation.Import;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@Import(PermissionAspectCacheIT.TestPermissionController.class)
@ActiveProfiles("local")
class PermissionAspectCacheIT {

  private static final String IDENTITY_JSON =
      """
            {
              "user_id": "bruno.buger@citi.com",
              "email": "bruno.buger@citi.com",
              "name": "Bruno Buger",
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
    wireMock.stubFor(get(urlEqualTo("/api/v1/users/me")).willReturn(okJson(IDENTITY_JSON)));
    wireMock.stubFor(
        post(urlEqualTo("/api/v1/authz/check")).willReturn(okJson("{\"allowed\": true}")));
  }

  @Test
  void permissionCheckCalledOnceForRepeatedRequests() {
    HttpHeaders headers = new HttpHeaders();
    headers.add("Cookie", "put_session=perm-cache-token");

    restTemplate.exchange(
        "/api/v1/permission-test", HttpMethod.GET, new HttpEntity<>(headers), String.class);
    restTemplate.exchange(
        "/api/v1/permission-test", HttpMethod.GET, new HttpEntity<>(headers), String.class);

    wireMock.verify(1, postRequestedFor(urlEqualTo("/api/v1/authz/check")));
  }

  @RestController
  static class TestPermissionController {
    @GetMapping("/api/v1/permission-test")
    @RequiresPermission("checks.test.read")
    public String testEndpoint() {
      return "ok";
    }
  }
}
