package com.citi.put.checks.security;

import com.citi.put.checks.config.CoreServiceProperties;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import io.github.resilience4j.circuitbreaker.annotation.CircuitBreaker;
import io.github.resilience4j.retry.annotation.Retry;
import java.time.Duration;
import org.springframework.boot.web.client.ClientHttpRequestFactories;
import org.springframework.boot.web.client.ClientHttpRequestFactorySettings;
import org.springframework.http.HttpStatusCode;
import org.springframework.http.client.ClientHttpRequestFactory;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;

@Component
public class CoreServiceClient {

    private final RestClient restClient;
    private final ObjectMapper objectMapper;

    public CoreServiceClient(CoreServiceProperties props, ObjectMapper objectMapper) {
        this.objectMapper = objectMapper;

        ClientHttpRequestFactorySettings settings = ClientHttpRequestFactorySettings.DEFAULTS
            .withConnectTimeout(Duration.ofMillis(props.timeout().connectMs()))
            .withReadTimeout(Duration.ofMillis(props.timeout().readMs()));
        ClientHttpRequestFactory factory = ClientHttpRequestFactories.get(settings);

        this.restClient = RestClient.builder()
            .baseUrl(props.baseUrl())
            .requestFactory(factory)
            .build();
    }

    @CircuitBreaker(name = "core-service")
    @Retry(name = "core-service")
    public UserIdentity getUserMe(String cookieValue) {
        return restClient.get()
            .uri("/api/v1/users/me")
            .header("Cookie", "put_session=" + cookieValue)
            .exchange((request, response) -> {
                if (response.getStatusCode().is2xxSuccessful()) {
                    return objectMapper.readValue(response.getBody(), UserIdentity.class);
                }
                if (response.getStatusCode().value() == 401) {
                    throw new CoreServiceUnauthorizedException("Core returned 401 for /users/me");
                }
                throw new CoreServiceUnavailableException(
                    "Core returned " + response.getStatusCode().value() + " for /users/me");
            });
    }

    @CircuitBreaker(name = "core-service")
    @Retry(name = "core-service")
    public JsonNode getUserPermissions(String cookieValue) {
        return restClient.get()
            .uri("/api/v1/users/me/permissions")
            .header("Cookie", "put_session=" + cookieValue)
            .exchange((request, response) -> {
                if (response.getStatusCode().is2xxSuccessful()) {
                    return objectMapper.readTree(response.getBody());
                }
                if (response.getStatusCode().value() == 401) {
                    throw new CoreServiceUnauthorizedException("Core returned 401 for /users/me/permissions");
                }
                throw new CoreServiceUnavailableException(
                    "Core returned " + response.getStatusCode().value() + " for /users/me/permissions");
            });
    }

    @CircuitBreaker(name = "core-service")
    @Retry(name = "core-service")
    public boolean checkPermission(String cookieValue, String permissionName) {
        return restClient.post()
            .uri("/api/v1/authz/check")
            .header("Cookie", "put_session=" + cookieValue)
            .header("Content-Type", "application/json")
            .body("{\"permission\":\"" + permissionName + "\"}")
            .exchange((request, response) -> {
                if (response.getStatusCode().is2xxSuccessful()) {
                    JsonNode body = objectMapper.readTree(response.getBody());
                    return body.path("allowed").asBoolean(false);
                }
                if (response.getStatusCode().value() == 401) {
                    throw new CoreServiceUnauthorizedException("Core returned 401 for /authz/check");
                }
                throw new CoreServiceUnavailableException(
                    "Core returned " + response.getStatusCode().value() + " for /authz/check");
            });
    }
}
