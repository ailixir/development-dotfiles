package com.citi.put.checks.csi;

import com.citi.put.checks.csi.dto.CsiDto;
import com.citi.put.checks.csi.dto.CsiSearchResult;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import io.github.resilience4j.circuitbreaker.annotation.CircuitBreaker;
import io.github.resilience4j.retry.annotation.Retry;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.boot.web.client.ClientHttpRequestFactories;
import org.springframework.boot.web.client.ClientHttpRequestFactorySettings;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.PageRequest;
import org.springframework.http.client.ClientHttpRequestFactory;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;

@Component
@ConditionalOnProperty(name = "checks.csi.provider", havingValue = "remote")
public class RemoteCsiApiClient implements CsiApiClient {

  private static final Logger LOG = LoggerFactory.getLogger(RemoteCsiApiClient.class);

  private final RestClient restClient;
  private final ObjectMapper objectMapper;

  public RemoteCsiApiClient(CsiApiProperties props, ObjectMapper objectMapper) {
    this.objectMapper = objectMapper;

    ClientHttpRequestFactorySettings settings =
        ClientHttpRequestFactorySettings.DEFAULTS
            .withConnectTimeout(Duration.ofMillis(props.timeout().connectMs()))
            .withReadTimeout(Duration.ofMillis(props.timeout().readMs()));
    ClientHttpRequestFactory factory = ClientHttpRequestFactories.get(settings);

    this.restClient = RestClient.builder().baseUrl(props.baseUrl()).requestFactory(factory).build();
  }

  @Override
  @CircuitBreaker(name = "csi-api", fallbackMethod = "listFilteredFallback")
  @Retry(name = "csi-api")
  public Page<CsiDto> listFiltered(
      List<String> ownedCsiIds,
      boolean isAdmin,
      String businessUnit,
      String criticality,
      String environment,
      String status,
      String search,
      int page,
      int size) {

    JsonNode response =
        restClient
            .get()
            .uri(
                uriBuilder ->
                    uriBuilder
                        .path("/api/v1/csi")
                        .queryParamIfPresent("businessUnit", Optional.ofNullable(businessUnit))
                        .queryParamIfPresent("criticality", Optional.ofNullable(criticality))
                        .queryParamIfPresent("environment", Optional.ofNullable(environment))
                        .queryParamIfPresent("status", Optional.ofNullable(status))
                        .queryParamIfPresent("search", Optional.ofNullable(search))
                        .queryParam("page", page)
                        .queryParam("size", size)
                        .build())
            .retrieve()
            .body(JsonNode.class);

    return parsePageResponse(response, page, size);
  }

  @Override
  @CircuitBreaker(name = "csi-api", fallbackMethod = "findByIdFallback")
  @Retry(name = "csi-api")
  public Optional<CsiDto> findById(String id) {
    JsonNode response =
        restClient.get().uri("/api/v1/csi/{id}", id).retrieve().body(JsonNode.class);

    if (response == null || response.isNull()) {
      return Optional.empty();
    }
    return Optional.of(parseDto(response));
  }

  @Override
  @CircuitBreaker(name = "csi-api", fallbackMethod = "searchFallback")
  @Retry(name = "csi-api")
  public List<CsiSearchResult> search(String query, int limit) {
    JsonNode response =
        restClient
            .get()
            .uri(
                uriBuilder ->
                    uriBuilder
                        .path("/api/v1/csi/search")
                        .queryParam("q", query)
                        .queryParam("limit", limit)
                        .build())
            .retrieve()
            .body(JsonNode.class);

    if (response == null || !response.isArray()) {
      return List.of();
    }

    List<CsiSearchResult> results = new ArrayList<>();
    for (JsonNode node : response) {
      results.add(new CsiSearchResult(node.path("id").asText(), node.path("name").asText()));
    }
    return results;
  }

  @SuppressWarnings("unused")
  private Page<CsiDto> listFilteredFallback(
      List<String> ownedCsiIds,
      boolean isAdmin,
      String businessUnit,
      String criticality,
      String environment,
      String status,
      String search,
      int page,
      int size,
      Throwable t) {
    LOG.warn("CSI API unavailable, returning empty page: {}", t.getMessage());
    return Page.empty(PageRequest.of(page, size));
  }

  @SuppressWarnings("unused")
  private Optional<CsiDto> findByIdFallback(String id, Throwable t) {
    LOG.warn("CSI API unavailable for id={}: {}", id, t.getMessage());
    return Optional.empty();
  }

  @SuppressWarnings("unused")
  private List<CsiSearchResult> searchFallback(String query, int limit, Throwable t) {
    LOG.warn("CSI API search unavailable: {}", t.getMessage());
    return List.of();
  }

  private Page<CsiDto> parsePageResponse(JsonNode response, int page, int size) {
    if (response == null) {
      return Page.empty(PageRequest.of(page, size));
    }

    JsonNode dataNode = response.path("data");
    long totalElements = response.path("totalElements").asLong(0);
    List<CsiDto> items = new ArrayList<>();

    if (dataNode.isArray()) {
      for (JsonNode node : dataNode) {
        items.add(parseDto(node));
      }
    }

    return new PageImpl<>(items, PageRequest.of(page, size), totalElements);
  }

  private CsiDto parseDto(JsonNode node) {
    return new CsiDto(
        node.path("id").asText(),
        node.path("name").asText(),
        node.path("description").asText(null),
        node.path("businessUnit").asText(),
        node.path("criticality").asText(),
        node.path("ownerEmail").asText(),
        node.path("environment").asText(),
        node.path("status").asText(),
        parseMetadata(node.path("metadata")),
        parseInstant(node.path("createdAt")),
        parseInstant(node.path("updatedAt")));
  }

  @SuppressWarnings("unchecked")
  private Map<String, Object> parseMetadata(JsonNode node) {
    if (node == null || node.isNull() || node.isMissingNode()) {
      return Map.of();
    }
    return objectMapper.convertValue(node, Map.class);
  }

  private Instant parseInstant(JsonNode node) {
    if (node == null || node.isNull() || node.isMissingNode()) {
      return Instant.now();
    }
    try {
      return Instant.parse(node.asText());
    } catch (Exception e) {
      return Instant.now();
    }
  }
}
