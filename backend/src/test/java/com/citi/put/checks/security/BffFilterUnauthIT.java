package com.citi.put.checks.security;

import static org.assertj.core.api.Assertions.assertThat;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.client.TestRestTemplate;
import org.springframework.http.ResponseEntity;
import org.springframework.test.context.ActiveProfiles;

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@ActiveProfiles("local")
class BffFilterUnauthIT {

  @Autowired TestRestTemplate restTemplate;
  @Autowired ObjectMapper objectMapper;

  @Test
  void missingCookieReturns401WithJsonBody() throws Exception {
    ResponseEntity<String> response = restTemplate.getForEntity("/api/v1/test", String.class);

    assertThat(response.getStatusCode().value()).isEqualTo(401);
    assertThat(response.getHeaders().getContentType().toString()).contains("application/json");

    JsonNode body = objectMapper.readTree(response.getBody());
    assertThat(body.path("error").path("code").asText()).isEqualTo("UNAUTHENTICATED");
    assertThat(body.path("error").path("message").asText()).isEqualTo("Session required");
    assertThat(body.path("error").has("traceId")).isTrue();
  }
}
