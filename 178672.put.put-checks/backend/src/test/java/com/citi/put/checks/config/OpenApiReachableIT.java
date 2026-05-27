package com.citi.put.checks.config;

import static com.github.tomakehurst.wiremock.client.WireMock.get;
import static com.github.tomakehurst.wiremock.client.WireMock.okJson;
import static com.github.tomakehurst.wiremock.client.WireMock.urlEqualTo;
import static org.assertj.core.api.Assertions.assertThat;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.github.tomakehurst.wiremock.WireMockServer;
import com.github.tomakehurst.wiremock.core.WireMockConfiguration;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.client.TestRestTemplate;
import org.springframework.http.ResponseEntity;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@ActiveProfiles("local")
class OpenApiReachableIT {

  static WireMockServer wireMock =
      new WireMockServer(WireMockConfiguration.options().dynamicPort());

  @Autowired TestRestTemplate restTemplate;
  @Autowired ObjectMapper objectMapper;

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
        {"user_id":"openapi-user","email":"oa@citi.com","name":"OA","roles":[],"csi_ownership":[]}
        """)));
  }

  @Test
  void apiDocsEndpointReturnsValidOpenApi() throws Exception {
    ResponseEntity<String> resp = restTemplate.getForEntity("/v3/api-docs", String.class);

    assertThat(resp.getStatusCode().value()).isEqualTo(200);
    JsonNode doc = objectMapper.readTree(resp.getBody());
    assertThat(doc.has("openapi")).isTrue();
    assertThat(doc.get("openapi").asText()).startsWith("3.");
    assertThat(doc.has("paths")).isTrue();
    assertThat(doc.get("paths").size()).isGreaterThan(0);
  }

  @Test
  void apiDocsContainsCookieAuthSecurityScheme() throws Exception {
    ResponseEntity<String> resp = restTemplate.getForEntity("/v3/api-docs", String.class);

    JsonNode doc = objectMapper.readTree(resp.getBody());
    JsonNode schemes = doc.path("components").path("securitySchemes");
    assertThat(schemes.has("CookieAuth")).isTrue();
    assertThat(schemes.get("CookieAuth").get("type").asText()).isEqualTo("apiKey");
    assertThat(schemes.get("CookieAuth").get("in").asText()).isEqualTo("cookie");
    assertThat(schemes.get("CookieAuth").get("name").asText()).isEqualTo("put_session");
  }

  @Test
  void apiDocsIncludesAllEndpoints() throws Exception {
    ResponseEntity<String> resp = restTemplate.getForEntity("/v3/api-docs", String.class);

    JsonNode paths = objectMapper.readTree(resp.getBody()).get("paths");
    assertThat(paths.has("/api/v1/checks")).isTrue();
    assertThat(paths.has("/api/v1/checks/{id}")).isTrue();
    assertThat(paths.has("/api/v1/checks/{checkId}/execute")).isTrue();
    assertThat(paths.has("/api/v1/checks/_bulk")).isTrue();
    assertThat(paths.has("/api/v1/csi")).isTrue();
    assertThat(paths.has("/api/v1/users/me")).isTrue();
  }
}
