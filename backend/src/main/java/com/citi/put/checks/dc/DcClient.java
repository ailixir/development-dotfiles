package com.citi.put.checks.dc;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import io.github.resilience4j.circuitbreaker.annotation.CircuitBreaker;
import io.github.resilience4j.retry.annotation.Retry;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.Base64;
import java.util.Locale;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.web.client.ClientHttpRequestFactories;
import org.springframework.boot.web.client.ClientHttpRequestFactorySettings;
import org.springframework.http.MediaType;
import org.springframework.http.client.ClientHttpRequestFactory;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientResponseException;

/**
 * Low-level HTTP client for DailyChecks. Auth/timeouts from {@link DcProperties}. Resilience via
 * Resilience4j instance {@code dailychecks}.
 */
@Component
public class DcClient {

  private static final Logger LOG = LoggerFactory.getLogger(DcClient.class);

  private final DcProperties props;
  private final ObjectMapper objectMapper;
  private final RestClient restClient;

  public DcClient(DcProperties props, ObjectMapper objectMapper) {
    this.props = props;
    this.objectMapper = objectMapper;

    ClientHttpRequestFactorySettings settings =
        ClientHttpRequestFactorySettings.DEFAULTS
            .withConnectTimeout(Duration.ofMillis(props.timeout().connectMs()))
            .withReadTimeout(Duration.ofMillis(props.timeout().readMs()));
    ClientHttpRequestFactory factory = ClientHttpRequestFactories.get(settings);
    this.restClient = RestClient.builder().baseUrl(props.baseUrl()).requestFactory(factory).build();
  }

  @CircuitBreaker(name = "dailychecks")
  @Retry(name = "dailychecks")
  public DcResponse exchange(DcRequest request) {
    try {
      String bodyJson =
          restClient
              .method(org.springframework.http.HttpMethod.valueOf(request.method()))
              .uri(request.path())
              .headers(
                  h -> {
                    h.setContentType(MediaType.APPLICATION_JSON);
                    applyAuth(h);
                    if (request.headers() != null) {
                      request.headers().forEach(h::set);
                    }
                  })
              .body(request.body())
              .retrieve()
              .body(String.class);

      return parseBody(200, bodyJson);
    } catch (RestClientResponseException ex) {
      String body = ex.getResponseBodyAsString();
      int status = ex.getStatusCode().value();
      if (status == 401 || status == 403 || status >= 500) {
        throw ex;
      }
      // 4xx (other): return parsed envelope when possible so adapter can map business/contract
      // fails
      try {
        return parseBody(status, body);
      } catch (Exception parseEx) {
        LOG.warn("DC non-success HTTP {} with unparseable body", status);
        throw ex;
      }
    }
  }

  private void applyAuth(org.springframework.http.HttpHeaders headers) {
    DcProperties.Auth auth = props.auth();
    if (auth == null || auth.mode() == null) {
      return;
    }
    switch (auth.mode().toLowerCase(Locale.ROOT)) {
      case "basic" -> {
        if (auth.username() != null && auth.password() != null) {
          String token =
              Base64.getEncoder()
                  .encodeToString(
                      (auth.username() + ":" + auth.password()).getBytes(StandardCharsets.UTF_8));
          headers.set("Authorization", "Basic " + token);
        }
      }
      case "bearer" -> {
        if (auth.token() != null && !auth.token().isBlank()) {
          headers.setBearerAuth(auth.token());
        }
      }
      case "header" -> {
        if (auth.headerName() != null
            && !auth.headerName().isBlank()
            && auth.headerValue() != null) {
          headers.set(auth.headerName(), auth.headerValue());
        }
      }
      default -> {
        // none
      }
    }
  }

  private DcResponse parseBody(int httpStatus, String bodyJson) {
    if (bodyJson == null || bodyJson.isBlank()) {
      return new DcResponse(httpStatus, null, null, null, null);
    }
    try {
      JsonNode root = objectMapper.readTree(bodyJson);
      String status = textOrNull(root, "status");
      String comment = textOrNull(root, "comment");
      String deepLink = textOrNull(root, "deepLink");
      if (deepLink == null) {
        deepLink = textOrNull(root, "deepLinkUrl");
      }
      return new DcResponse(httpStatus, status, comment, deepLink, root);
    } catch (Exception e) {
      LOG.warn("Unexpected DC response body (not JSON): {}", e.getMessage());
      return new DcResponse(httpStatus, null, bodyJson, null, null);
    }
  }

  private static String textOrNull(JsonNode root, String field) {
    JsonNode n = root.get(field);
    if (n == null || n.isNull() || !n.isValueNode()) {
      return null;
    }
    String v = n.asText();
    return v == null || v.isBlank() ? null : v;
  }
}
