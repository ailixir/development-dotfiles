package com.citi.put.checks.config;

import com.citi.put.checks.security.BffAuthenticationToken;
import com.citi.put.checks.security.UserIdentity;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.util.List;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.annotation.Profile;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

/**
 * Development-only filter that injects a default authenticated identity when no authentication is
 * present. This bypasses BffSessionAuthenticationFilter for the {@code local} profile, removing the
 * need for a running Core service to issue session cookies during local development.
 */
@Component
@Profile("local")
public class LocalDevAuthFilter extends OncePerRequestFilter {

  private static final Logger LOGGER = LoggerFactory.getLogger(LocalDevAuthFilter.class);

  private static final UserIdentity DEV_IDENTITY =
      new UserIdentity(
          "dev-user", "dev@citi.com", "Local Developer", null, List.of("checks-admin"), List.of());

  @Override
  protected void doFilterInternal(
      HttpServletRequest request, HttpServletResponse response, FilterChain chain)
      throws ServletException, IOException {

    if (SecurityContextHolder.getContext().getAuthentication() == null) {
      LOGGER.debug(
          "Local dev auth bypass — injecting default identity for {} {}",
          request.getMethod(),
          request.getRequestURI());
      SecurityContextHolder.getContext()
          .setAuthentication(new BffAuthenticationToken(DEV_IDENTITY));
    }

    chain.doFilter(request, response);
  }
}
