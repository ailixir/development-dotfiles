package com.citi.put.checks.config;

import static org.assertj.core.api.Assertions.assertThat;

import com.citi.put.checks.security.BffAuthenticationToken;
import com.citi.put.checks.security.UserIdentity;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.github.benmanes.caffeine.cache.Caffeine;
import io.micrometer.core.instrument.simple.SimpleMeterRegistry;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.concurrent.atomic.AtomicInteger;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.security.core.context.SecurityContextHolder;

/**
 * The platform response cache on the Studio replay execute route (STUDIO-OBS-014 AC-9 and the
 * inherited dead-matcher obligation).
 *
 * <p>Replaces {@code StudioV2IdempotencyFilterTest} (1 parameterized method, 2 invocations over the
 * deleted {@code /api/v2/studio} compile routes) with 2 methods of 1 invocation each: the same
 * replay guarantee re-pointed to {@code POST /api/v1/studio/tests/{id}/execute}, and the proof that
 * the deleted {@code /api/v2/studio/**} matcher no longer covers anything. {@code
 * IdempotencyFilterIT} does not exercise {@code /api/v1/studio}, so this is the unit guard for the
 * AC-9 route's replay.
 *
 * <p>Not decided here: whether a cached 2xx may be replayed without re-authorization (GA plan D-2b)
 * stays open for @qa (security).
 */
class StudioExecuteIdempotencyFilterTest {

  private static final String KEY = "00000000-0000-0000-0000-000000000001";

  private IdempotencyFilter filter;

  @BeforeEach
  void authenticate() {
    filter =
        new IdempotencyFilter(
            Caffeine.newBuilder().maximumSize(10).build(),
            new ObjectMapper(),
            new SimpleMeterRegistry());
    SecurityContextHolder.getContext()
        .setAuthentication(
            new BffAuthenticationToken(
                new UserIdentity(
                    "test-user", "test@example.invalid", "Test", "Testing", List.of(), List.of())));
  }

  @AfterEach
  void clearAuthentication() {
    SecurityContextHolder.clearContext();
  }

  @Test
  void retriedExecuteReplaysResponseWithoutASecondMutation() throws Exception {
    String path = "/api/v1/studio/tests/00000000-0000-0000-0000-0000000000aa/execute";
    AtomicInteger mutations = new AtomicInteger();

    MockHttpServletResponse first = send(path, mutations);
    MockHttpServletResponse second = send(path, mutations);

    assertThat(mutations.get()).as("the execute handler ran once").isEqualTo(1);
    assertThat(first.getStatus()).isEqualTo(202);
    assertThat(first.getContentAsString()).contains("one-execution");
    assertThat(first.getHeader("Idempotent-Replayed")).isNull();
    assertThat(second.getStatus()).isEqualTo(202);
    assertThat(second.getContentAsString()).isEqualTo(first.getContentAsString());
    assertThat(second.getHeader("Idempotent-Replayed")).isEqualTo("true");
  }

  @Test
  void theRemovedV2PrefixIsNoLongerCovered() throws Exception {
    String path = "/api/v2/studio/tests";
    AtomicInteger mutations = new AtomicInteger();

    assertThat(filter.shouldNotFilter(request(path))).isTrue();
    MockHttpServletResponse first = send(path, mutations);
    MockHttpServletResponse second = send(path, mutations);

    assertThat(mutations.get())
        .as("no response cache: the chain ran for each request")
        .isEqualTo(2);
    assertThat(first.getHeader("Idempotent-Replayed")).isNull();
    assertThat(second.getHeader("Idempotent-Replayed")).isNull();
  }

  private MockHttpServletResponse send(String path, AtomicInteger mutations) throws Exception {
    MockHttpServletResponse response = new MockHttpServletResponse();
    filter.doFilter(
        request(path),
        response,
        (incoming, outgoing) -> {
          mutations.incrementAndGet();
          ((jakarta.servlet.http.HttpServletResponse) outgoing).setStatus(202);
          outgoing.setContentType("application/json");
          outgoing.getWriter().write("{\"executionId\":\"one-execution\"}");
        });
    return response;
  }

  private static MockHttpServletRequest request(String path) {
    MockHttpServletRequest request = new MockHttpServletRequest("POST", path);
    request.setServletPath(path);
    request.addHeader("Idempotency-Key", KEY);
    request.setContentType("application/json");
    request.setContent("{}".getBytes(StandardCharsets.UTF_8));
    return request;
  }
}
