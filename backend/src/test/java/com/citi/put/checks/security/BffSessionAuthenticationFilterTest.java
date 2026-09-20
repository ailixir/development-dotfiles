package com.citi.put.checks.security;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verifyNoInteractions;

import com.citi.put.checks.config.IdentityBypassProperties;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.github.benmanes.caffeine.cache.Caffeine;
import java.util.List;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.mock.web.MockFilterChain;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.security.authentication.AnonymousAuthenticationToken;
import org.springframework.security.core.authority.AuthorityUtils;
import org.springframework.security.core.context.SecurityContextHolder;

/**
 * The filter's routing behaviour, under the DEPLOYED default: all three ED-02 bypasses closed.
 *
 * <p>Story 10.18b AC-19a turned {@code isCoreServiceBypassed()} from a hardcoded {@code return
 * true} into a property whose default is {@code false}. Two of the tests below used to assert that
 * a request with no session was authenticated as {@code CORE_SERVICE_BYPASS_IDENTITY} — an identity
 * carrying {@code checks-admin} and {@code platform-admin} — and they now assert the 401 that
 * architecture §9.1 requires ("absent identity fails closed"). The change of expectation is the
 * fix, not a regression, and it is recorded in the story's AC-22 failing-class diff.
 *
 * <p>The bypasses themselves — all three of them, each with a permit companion and a watch pinned
 * to the production symbol — are covered in {@link BffSessionBypassClosureTest}. This file keeps
 * only the routing cases: what the filter does when someone else has already authenticated.
 */
class BffSessionAuthenticationFilterTest {

  private final CoreServiceClient coreServiceClient = mock(CoreServiceClient.class);
  private final BffSessionAuthenticationFilter filter =
      new BffSessionAuthenticationFilter(
          coreServiceClient,
          Caffeine.newBuilder().build(),
          mock(ApplicationEventPublisher.class),
          new ObjectMapper(),
          IdentityBypassProperties.closed());

  @AfterEach
  void clearSecurityContext() {
    SecurityContextHolder.clearContext();
  }

  @Test
  void anonymousAuthenticationIsRefusedWhenTheBypassIsClosed() throws Exception {
    SecurityContextHolder.getContext()
        .setAuthentication(
            new AnonymousAuthenticationToken(
                "key", "anonymousUser", AuthorityUtils.createAuthorityList("ROLE_ANONYMOUS")));

    MockHttpServletResponse response = new MockHttpServletResponse();

    filter.doFilter(
        new MockHttpServletRequest("GET", "/api/v1/test"), response, new MockFilterChain());

    // An anonymous token is not a BffAuthenticationToken, so the filter resolves identity itself —
    // and with every bypass closed and no session cookie there is nothing to resolve.
    assertThat(response.getStatus()).isEqualTo(401);
    verifyNoInteractions(coreServiceClient);
  }

  @Test
  void missingSessionIsRefusedWhenTheBypassIsClosed() throws Exception {
    MockHttpServletResponse response = new MockHttpServletResponse();

    filter.doFilter(
        new MockHttpServletRequest("GET", "/api/v1/test"), response, new MockFilterChain());

    assertThat(response.getStatus()).isEqualTo(401);
    // Still no Core call: there is no cookie to exchange, so the refusal is local.
    verifyNoInteractions(coreServiceClient);
  }

  @Test
  void bffAuthenticationTokenBypassesSessionResolution() throws Exception {
    SecurityContextHolder.getContext()
        .setAuthentication(
            new BffAuthenticationToken(
                new UserIdentity(
                    "user@citi.com",
                    "user@citi.com",
                    "User",
                    null,
                    List.of("checks-admin"),
                    List.of())));

    MockHttpServletResponse response = new MockHttpServletResponse();

    filter.doFilter(
        new MockHttpServletRequest("GET", "/api/v1/test"), response, new MockFilterChain());

    assertThat(response.getStatus()).isEqualTo(200);
    verifyNoInteractions(coreServiceClient);
  }
}
