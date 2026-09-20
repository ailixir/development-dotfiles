package com.citi.put.checks.config;

import static org.assertj.core.api.Assertions.assertThat;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.github.benmanes.caffeine.cache.Caffeine;
import io.micrometer.core.instrument.simple.SimpleMeterRegistry;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.atomic.AtomicInteger;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;

class StudioV2IdempotencyFilterTest {
  @org.junit.jupiter.api.AfterEach
  void clearAuthentication() {
    org.springframework.security.core.context.SecurityContextHolder.clearContext();
  }

  @ParameterizedTest
  @ValueSource(strings = {"/api/v2/studio/tests", "/api/v2/studio/tests/test/compile"})
  void retriedMutationReplaysResponseWithoutCreatingAnotherDraftOrCompile(String path)
      throws Exception {
    IdempotencyFilter filter =
        new IdempotencyFilter(
            Caffeine.newBuilder().maximumSize(10).build(),
            new ObjectMapper(),
            new SimpleMeterRegistry());
    org.springframework.security.core.context.SecurityContextHolder.getContext()
        .setAuthentication(
            new com.citi.put.checks.security.BffAuthenticationToken(
                new com.citi.put.checks.security.UserIdentity(
                    "test-user",
                    "test@example.invalid",
                    "Test",
                    "Testing",
                    java.util.List.of(),
                    java.util.List.of())));
    AtomicInteger mutations = new AtomicInteger();
    for (int attempt = 0; attempt < 2; attempt++) {
      MockHttpServletRequest request = new MockHttpServletRequest("POST", path);
      request.setServletPath(path);
      request.addHeader("Idempotency-Key", "00000000-0000-0000-0000-000000000001");
      request.setContentType("application/json");
      request.setContent("{\"mode\":\"FULL\"}".getBytes(StandardCharsets.UTF_8));
      MockHttpServletResponse response = new MockHttpServletResponse();
      filter.doFilter(
          request,
          response,
          (incoming, outgoing) -> {
            mutations.incrementAndGet();
            outgoing.setContentType("application/json");
            outgoing.getWriter().write("{\"compileRequestId\":\"one-capture\"}");
          });
      assertThat(response.getContentAsString()).contains("one-capture");
    }
    assertThat(mutations.get()).isEqualTo(1);
    org.springframework.security.core.context.SecurityContextHolder.clearContext();
  }
}
