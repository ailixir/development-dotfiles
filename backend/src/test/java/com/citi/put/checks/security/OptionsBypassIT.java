package com.citi.put.checks.security;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.client.TestRestTemplate;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.ResponseEntity;
import org.springframework.test.context.ActiveProfiles;

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@ActiveProfiles("local")
class OptionsBypassIT {

    @Autowired TestRestTemplate restTemplate;

    @Test
    void optionsRequestPassesThroughWithoutAuth() {
        HttpHeaders headers = new HttpHeaders();
        headers.add("Origin", "http://localhost:3000");
        headers.add("Access-Control-Request-Method", "GET");

        ResponseEntity<String> response = restTemplate.exchange(
            "/api/v1/test", HttpMethod.OPTIONS, new HttpEntity<>(headers), String.class);

        assertThat(response.getStatusCode().value()).isNotEqualTo(401);
        assertThat(response.getStatusCode().value()).isNotEqualTo(503);
    }
}
