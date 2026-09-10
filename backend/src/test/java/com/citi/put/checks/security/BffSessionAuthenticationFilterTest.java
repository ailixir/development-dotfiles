package com.citi.put.checks.security;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verifyNoInteractions;

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

class BffSessionAuthenticationFilterTest {

  private final CoreServiceClient coreServiceClient = mock(CoreServiceClient.class);
  private final BffSessionAuthenticationFilter filter =
      new BffSessionAuthenticationFilter(
          coreServiceClient,
          Caffeine.newBuilder().build(),
          mock(ApplicationEventPublisher.class),
          new ObjectMapper());

  @AfterEach
  void clearSecurityContext() {
    SecurityContextHolder.clearContext();
  }

  @Test
  void anonymousAuthenticationUsesCoreServiceBypassIdentity() throws Exception {
    SecurityContextHolder.getContext()
        .setAuthentication(
            new AnonymousAuthenticationToken(
                "key", "anonymousUser", AuthorityUtils.createAuthorityList("ROLE_ANONYMOUS")));

    MockHttpServletResponse response = new MockHttpServletResponse();

    filter.doFilter(
        new MockHttpServletRequest("GET", "/api/v1/test"), response, new MockFilterChain());

    assertThat(response.getStatus()).isEqualTo(200);
    verifyNoInteractions(coreServiceClient);
  }

  @Test
  void missingSessionUsesCoreServiceBypassIdentity() throws Exception {
    MockHttpServletResponse response = new MockHttpServletResponse();

    filter.doFilter(
        new MockHttpServletRequest("GET", "/api/v1/test"), response, new MockFilterChain());

    assertThat(response.getStatus()).isEqualTo(200);
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
