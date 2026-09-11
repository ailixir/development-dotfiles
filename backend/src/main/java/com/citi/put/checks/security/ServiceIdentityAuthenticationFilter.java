package com.citi.put.checks.security;

import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.List;
import java.util.Map;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.filter.OncePerRequestFilter;

/**
 * The restricted service identity every {@code /internal/**} route requires (AC-6a, §8.4, §9.1).
 *
 * <p>Four properties are load-bearing and each is asserted by a test:
 *
 * <ul>
 *   <li>The credential is compared in <b>constant time</b>, through {@link MessageDigest#isEqual},
 *       so a wrong token cannot be discovered one byte at a time.
 *   <li>A missing, blank, malformed or wrong credential is rejected <b>before any handler work and
 *       before the request body is read</b>. This filter runs ahead of the {@code
 *       DispatcherServlet}, so nothing has parsed the body when it answers.
 *   <li>The rejection body carries a code and <b>no execution detail</b>: a caller with no identity
 *       learns nothing about whether the execution exists.
 *   <li>The credential is <b>never</b> read from a URL or a query parameter, and never logged. This
 *       filter reads exactly one place — the {@code Authorization} header — and writes it nowhere.
 * </ul>
 *
 * <p>This is not a platform user session: it establishes no CSI permission, publishes no {@code
 * UserIdentity}, and the chain it runs in performs no CSI evaluation. The runner holds no DB,
 * vault, CSI or LLM credential (§9.2), and this identity grants it none.
 */
public class ServiceIdentityAuthenticationFilter extends OncePerRequestFilter {

  /** The authority the internal chain authorizes on. It is not a platform role. */
  public static final String SERVICE_AUTHORITY = "ROLE_STUDIO_RUNNER_CALLBACK";

  private static final String BEARER = "Bearer ";

  private final byte[] expected;
  private final ObjectMapper objectMapper;

  public ServiceIdentityAuthenticationFilter(String expectedToken, ObjectMapper objectMapper) {
    this.expected =
        expectedToken == null ? new byte[0] : expectedToken.getBytes(StandardCharsets.UTF_8);
    this.objectMapper = objectMapper;
  }

  @Override
  protected void doFilterInternal(
      HttpServletRequest request, HttpServletResponse response, FilterChain chain)
      throws ServletException, IOException {

    if (expected.length == 0) {
      // No service identity is configured, so no caller can present one. Failing closed is the
      // only honest answer: the alternative is a route that is open on any deployment that
      // forgot to set the token, which is the hole this filter exists to close.
      reject(response, HttpServletResponse.SC_UNAUTHORIZED, "SERVICE_IDENTITY_REQUIRED");
      return;
    }

    String header = request.getHeader(HttpHeaders.AUTHORIZATION);
    if (header == null || !header.startsWith(BEARER)) {
      reject(response, HttpServletResponse.SC_UNAUTHORIZED, "SERVICE_IDENTITY_REQUIRED");
      return;
    }
    byte[] presented = header.substring(BEARER.length()).trim().getBytes(StandardCharsets.UTF_8);
    if (presented.length == 0 || !MessageDigest.isEqual(expected, presented)) {
      reject(response, HttpServletResponse.SC_FORBIDDEN, "SERVICE_IDENTITY_REJECTED");
      return;
    }

    SecurityContextHolder.getContext()
        .setAuthentication(
            new UsernamePasswordAuthenticationToken(
                "studio-runner-callback",
                null,
                List.of(new SimpleGrantedAuthority(SERVICE_AUTHORITY))));
    try {
      chain.doFilter(request, response);
    } finally {
      SecurityContextHolder.clearContext();
    }
  }

  /** A code and nothing else. No execution id, no state, no hint that either exists. */
  private void reject(HttpServletResponse response, int status, String code) throws IOException {
    response.setStatus(status);
    response.setContentType(MediaType.APPLICATION_JSON_VALUE);
    objectMapper.writeValue(
        response.getOutputStream(),
        Map.of("error", code, "message", "A valid service identity is required"));
  }
}
