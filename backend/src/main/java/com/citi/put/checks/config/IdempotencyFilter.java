package com.citi.put.checks.config;

import com.citi.put.checks.security.BffAuthenticationToken;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.github.benmanes.caffeine.cache.Cache;
import io.micrometer.core.instrument.Counter;
import io.micrometer.core.instrument.MeterRegistry;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.TimeoutException;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.web.util.matcher.AntPathRequestMatcher;
import org.springframework.web.filter.OncePerRequestFilter;
import org.springframework.web.util.ContentCachingResponseWrapper;

public class IdempotencyFilter extends OncePerRequestFilter {

  private static final Set<String> IDEMPOTENT_METHODS = Set.of("POST", "PUT", "PATCH", "DELETE");
  private static final Set<String> STRIPPED_HEADERS =
      Set.of("cookie", "authorization", "set-cookie");
  private static final List<AntPathRequestMatcher> COVERED_PATHS =
      List.of(
          new AntPathRequestMatcher("/api/v1/checks/**"),
          new AntPathRequestMatcher("/api/v1/checks"),
          new AntPathRequestMatcher("/api/v1/reports/**"),
          new AntPathRequestMatcher("/api/v1/studio/**"),
          new AntPathRequestMatcher("/api/v2/studio/**"),
          new AntPathRequestMatcher("/api/v1/schedules/**"));

  private final Cache<String, CachedResponse> cache;
  private final ConcurrentHashMap<String, CompletableFuture<CachedResponse>> inFlight =
      new ConcurrentHashMap<>();
  private final ObjectMapper objectMapper;
  private final Counter hitsCounter;
  private final Counter missesCounter;
  private final Counter conflictsCounter;

  public IdempotencyFilter(
      Cache<String, CachedResponse> cache, ObjectMapper objectMapper, MeterRegistry registry) {
    this.cache = cache;
    this.objectMapper = objectMapper;
    this.hitsCounter = Counter.builder("checks_idempotency_hits_total").register(registry);
    this.missesCounter = Counter.builder("checks_idempotency_misses_total").register(registry);
    this.conflictsCounter =
        Counter.builder("checks_idempotency_in_flight_conflicts_total").register(registry);
  }

  @Override
  protected boolean shouldNotFilter(HttpServletRequest request) {
    if (!IDEMPOTENT_METHODS.contains(request.getMethod().toUpperCase())) {
      return true;
    }
    for (AntPathRequestMatcher matcher : COVERED_PATHS) {
      if (matcher.matches(request)) {
        return false;
      }
    }
    return true;
  }

  @Override
  protected void doFilterInternal(
      HttpServletRequest request, HttpServletResponse response, FilterChain chain)
      throws ServletException, IOException {

    String idempotencyKey = request.getHeader("Idempotency-Key");
    if (idempotencyKey == null) {
      chain.doFilter(request, response);
      return;
    }

    try {
      UUID.fromString(idempotencyKey);
    } catch (IllegalArgumentException e) {
      writeError(response, 400, "INVALID_IDEMPOTENCY_KEY", "Idempotency-Key must be a valid UUID");
      return;
    }

    String userId = extractUserId();
    if (userId == null) {
      chain.doFilter(request, response);
      return;
    }

    String cacheKey = userId + ":" + idempotencyKey;

    CachedResponse cached = cache.getIfPresent(cacheKey);
    if (cached != null) {
      hitsCounter.increment();
      replayResponse(response, cached);
      return;
    }

    CompletableFuture<CachedResponse> future = new CompletableFuture<>();
    CompletableFuture<CachedResponse> existing = inFlight.putIfAbsent(cacheKey, future);

    if (existing != null) {
      handleInFlightWait(response, existing);
      return;
    }

    missesCounter.increment();
    try {
      ContentCachingResponseWrapper wrapper = new ContentCachingResponseWrapper(response);
      chain.doFilter(request, wrapper);

      int status = wrapper.getStatus();
      if (status < 400 || status >= 500) {
        CachedResponse result = captureResponse(wrapper);
        cache.put(cacheKey, result);
        future.complete(result);
      } else {
        future.complete(null);
      }

      wrapper.copyBodyToResponse();
    } catch (Exception e) {
      future.completeExceptionally(e);
      throw e;
    } finally {
      inFlight.remove(cacheKey);
    }
  }

  private String extractUserId() {
    Authentication auth = SecurityContextHolder.getContext().getAuthentication();
    if (auth instanceof BffAuthenticationToken bff) {
      return bff.getPrincipal().userId();
    }
    return null;
  }

  private void handleInFlightWait(
      HttpServletResponse response, CompletableFuture<CachedResponse> existing) throws IOException {
    try {
      CachedResponse result = existing.get(30, TimeUnit.SECONDS);
      if (result != null) {
        hitsCounter.increment();
        replayResponse(response, result);
      } else {
        conflictsCounter.increment();
        writeError(
            response,
            409,
            "IDEMPOTENT_REQUEST_IN_PROGRESS",
            "Idempotent request in progress; try again later");
      }
    } catch (TimeoutException e) {
      conflictsCounter.increment();
      writeError(
          response,
          409,
          "IDEMPOTENT_REQUEST_IN_PROGRESS",
          "Idempotent request in progress; try again later");
    } catch (Exception e) {
      writeError(response, 500, "INTERNAL_ERROR", "Error processing idempotent request");
    }
  }

  private CachedResponse captureResponse(ContentCachingResponseWrapper wrapper) {
    Map<String, List<String>> headers = new LinkedHashMap<>();
    for (String name : wrapper.getHeaderNames()) {
      if (!STRIPPED_HEADERS.contains(name.toLowerCase())) {
        headers.put(name, new ArrayList<>(wrapper.getHeaders(name)));
      }
    }
    return new CachedResponse(wrapper.getStatus(), headers, wrapper.getContentAsByteArray());
  }

  private void replayResponse(HttpServletResponse response, CachedResponse cached)
      throws IOException {
    response.setStatus(cached.status());
    cached
        .headers()
        .forEach((name, values) -> values.forEach(value -> response.addHeader(name, value)));
    response.addHeader("Idempotent-Replayed", "true");
    response.getOutputStream().write(cached.body());
    response.getOutputStream().flush();
  }

  private void writeError(HttpServletResponse response, int status, String code, String message)
      throws IOException {
    response.setStatus(status);
    response.setContentType("application/json");
    objectMapper.writeValue(
        response.getWriter(), Map.of("error", Map.of("code", code, "message", message)));
  }
}
