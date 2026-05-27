package com.citi.put.checks.config;

import com.citi.put.checks.security.BffAuthenticationToken;
import com.citi.put.checks.security.UserIdentity;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import io.micrometer.core.instrument.Counter;
import io.micrometer.core.instrument.MeterRegistry;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ReadListener;
import jakarta.servlet.ServletException;
import jakarta.servlet.ServletInputStream;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletRequestWrapper;
import jakarta.servlet.http.HttpServletResponse;
import java.io.BufferedReader;
import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Instant;
import java.util.HexFormat;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.TimeUnit;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.filter.OncePerRequestFilter;

public class RateLimitFilter extends OncePerRequestFilter {

  private static final Set<String> ADMIN_ROLES = Set.of("checks-admin", "platform-admin");

  private final BucketStore bucketStore;
  private final RateLimitClassifier classifier;
  private final ObjectMapper objectMapper;
  private final MeterRegistry registry;

  public RateLimitFilter(
      BucketStore bucketStore,
      RateLimitClassifier classifier,
      ObjectMapper objectMapper,
      MeterRegistry registry) {
    this.bucketStore = bucketStore;
    this.classifier = classifier;
    this.objectMapper = objectMapper;
    this.registry = registry;
  }

  @Override
  protected boolean shouldNotFilter(HttpServletRequest request) {
    return "OPTIONS".equalsIgnoreCase(request.getMethod());
  }

  @Override
  protected void doFilterInternal(
      HttpServletRequest request, HttpServletResponse response, FilterChain chain)
      throws ServletException, IOException {

    Authentication auth = SecurityContextHolder.getContext().getAuthentication();
    if (!(auth instanceof BffAuthenticationToken bff)) {
      chain.doFilter(request, response);
      return;
    }

    UserIdentity identity = bff.getPrincipal();
    String userId = identity.userId();
    boolean isAdmin = identity.roles().stream().anyMatch(ADMIN_ROLES::contains);
    String userHash = hashUserId(userId);

    RateLimitClassifier.BucketClass bucketClass = classifier.classify(request);

    if (bucketClass == RateLimitClassifier.BucketClass.BULK) {
      handleBulk(request, response, chain, userId, isAdmin, userHash);
      return;
    }

    int capacity = bucketStore.capacityFor(bucketClass, isAdmin);
    BucketStore.TokenBucket.ConsumeResult result =
        bucketStore.tryConsume(userId, bucketClass, isAdmin, 1);

    if (result.consumed()) {
      recordConsumed(userHash, bucketClass);
      chain.doFilter(request, response);
    } else {
      recordRejected(userHash, bucketClass);
      write429(response, result, capacity);
    }
  }

  private void handleBulk(
      HttpServletRequest request,
      HttpServletResponse response,
      FilterChain chain,
      String userId,
      boolean isAdmin,
      String userHash)
      throws ServletException, IOException {

    CachedBodyRequestWrapper wrapper = new CachedBodyRequestWrapper(request);

    int bulkCapacity = bucketStore.capacityFor(RateLimitClassifier.BucketClass.BULK, isAdmin);
    BucketStore.TokenBucket.ConsumeResult bulkResult =
        bucketStore.tryConsume(userId, RateLimitClassifier.BucketClass.BULK, isAdmin, 1);
    if (!bulkResult.consumed()) {
      recordRejected(userHash, RateLimitClassifier.BucketClass.BULK);
      write429(response, bulkResult, bulkCapacity);
      return;
    }
    recordConsumed(userHash, RateLimitClassifier.BucketClass.BULK);

    int opCount = countBulkOperations(wrapper.getCachedBody());
    if (opCount > 0) {
      int writeCapacity = bucketStore.capacityFor(RateLimitClassifier.BucketClass.WRITE, isAdmin);
      BucketStore.TokenBucket.ConsumeResult writeResult =
          bucketStore.tryConsume(userId, RateLimitClassifier.BucketClass.WRITE, isAdmin, opCount);
      if (!writeResult.consumed()) {
        recordRejected(userHash, RateLimitClassifier.BucketClass.WRITE);
        write429(response, writeResult, writeCapacity);
        return;
      }
      recordConsumed(userHash, RateLimitClassifier.BucketClass.WRITE);
    }

    chain.doFilter(wrapper, response);
  }

  private int countBulkOperations(byte[] body) {
    try {
      JsonNode node = objectMapper.readTree(body);
      if (node.has("operations") && node.get("operations").isArray()) {
        return node.get("operations").size();
      }
    } catch (Exception ignored) {
    }
    return 1;
  }

  private void write429(
      HttpServletResponse response, BucketStore.TokenBucket.ConsumeResult result, int capacity)
      throws IOException {
    long retryAfterSeconds = Math.max(1, TimeUnit.NANOSECONDS.toSeconds(result.waitNanos()));
    response.setStatus(429);
    response.setHeader("Retry-After", String.valueOf(retryAfterSeconds));
    response.setHeader("X-RateLimit-Limit", String.valueOf(capacity));
    response.setHeader("X-RateLimit-Remaining", "0");
    response.setHeader(
        "X-RateLimit-Reset", String.valueOf(Instant.now().getEpochSecond() + retryAfterSeconds));
    response.setContentType("application/json");
    objectMapper.writeValue(
        response.getWriter(),
        Map.of("error", Map.of("code", "RATE_LIMITED", "message", "Rate limit exceeded")));
  }

  private String hashUserId(String userId) {
    try {
      MessageDigest digest = MessageDigest.getInstance("SHA-256");
      byte[] hash = digest.digest(userId.getBytes(StandardCharsets.UTF_8));
      return HexFormat.of().formatHex(hash).substring(0, 8);
    } catch (NoSuchAlgorithmException e) {
      return userId.substring(0, Math.min(userId.length(), 8));
    }
  }

  private void recordConsumed(String userHash, RateLimitClassifier.BucketClass bucketClass) {
    Counter.builder("checks_rate_limit_consumed_total")
        .tag("user_hash", userHash)
        .tag("class", bucketClass.name().toLowerCase())
        .register(registry)
        .increment();
  }

  private void recordRejected(String userHash, RateLimitClassifier.BucketClass bucketClass) {
    Counter.builder("checks_rate_limit_rejected_total")
        .tag("user_hash", userHash)
        .tag("class", bucketClass.name().toLowerCase())
        .register(registry)
        .increment();
  }

  static class CachedBodyRequestWrapper extends HttpServletRequestWrapper {
    private final byte[] body;

    CachedBodyRequestWrapper(HttpServletRequest request) throws IOException {
      super(request);
      this.body = request.getInputStream().readAllBytes();
    }

    @Override
    public ServletInputStream getInputStream() {
      ByteArrayInputStream bais = new ByteArrayInputStream(body);
      return new ServletInputStream() {
        @Override
        public int read() {
          return bais.read();
        }

        @Override
        public boolean isFinished() {
          return bais.available() == 0;
        }

        @Override
        public boolean isReady() {
          return true;
        }

        @Override
        public void setReadListener(ReadListener readListener) {}
      };
    }

    @Override
    public BufferedReader getReader() {
      return new BufferedReader(
          new InputStreamReader(new ByteArrayInputStream(body), StandardCharsets.UTF_8));
    }

    byte[] getCachedBody() {
      return body;
    }
  }
}
