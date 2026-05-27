package com.citi.put.checks.security;

import com.citi.put.checks.security.event.UserAuthenticatedEvent;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.github.benmanes.caffeine.cache.Cache;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.Cookie;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.util.Arrays;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.slf4j.MDC;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.http.MediaType;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.filter.OncePerRequestFilter;

public class BffSessionAuthenticationFilter extends OncePerRequestFilter {

  private static final String COOKIE_NAME = "put_session";

  private final CoreServiceClient coreServiceClient;
  private final Cache<String, UserIdentity> identityCache;
  private final ApplicationEventPublisher eventPublisher;
  private final ObjectMapper objectMapper;

  public BffSessionAuthenticationFilter(
      CoreServiceClient coreServiceClient,
      Cache<String, UserIdentity> identityCache,
      ApplicationEventPublisher eventPublisher,
      ObjectMapper objectMapper) {
    this.coreServiceClient = coreServiceClient;
    this.identityCache = identityCache;
    this.eventPublisher = eventPublisher;
    this.objectMapper = objectMapper;
  }

  @Override
  protected void doFilterInternal(
      HttpServletRequest request, HttpServletResponse response, FilterChain chain)
      throws ServletException, IOException {

    if ("OPTIONS".equalsIgnoreCase(request.getMethod())) {
      chain.doFilter(request, response);
      return;
    }

    if (!request.getRequestURI().startsWith("/api/")) {
      chain.doFilter(request, response);
      return;
    }

    // If a prior filter (e.g. LocalDevAuthFilter) already set an identity, skip resolution.
    if (SecurityContextHolder.getContext().getAuthentication() != null
        && SecurityContextHolder.getContext().getAuthentication().isAuthenticated()) {
      chain.doFilter(request, response);
      return;
    }

    String traceId = resolveTraceId(request);
    MDC.put("traceId", traceId);

    try {
      UserIdentity identity = resolveIdentity(request);

      MDC.put("userId", identity.userId());
      SecurityContextHolder.getContext().setAuthentication(new BffAuthenticationToken(identity));
      eventPublisher.publishEvent(new UserAuthenticatedEvent(identity));

      chain.doFilter(request, response);
    } catch (CoreServiceUnauthorizedException e) {
      writeError(response, 401, "UNAUTHENTICATED", "Session required", traceId);
    } catch (CoreServiceUnavailableException e) {
      write503(response, traceId);
    } finally {
      SecurityContextHolder.clearContext();
      MDC.clear();
    }
  }

  private UserIdentity resolveIdentity(HttpServletRequest request) {
    String xUserId = request.getHeader("X-User-Id");
    if (xUserId != null && !xUserId.isBlank()) {
      return parseHeaderIdentity(request, xUserId);
    }

    String cookieValue = extractSessionCookie(request);
    if (cookieValue == null || cookieValue.isBlank()) {
      throw new CoreServiceUnauthorizedException("No session cookie");
    }

    UserIdentity cached = identityCache.getIfPresent(cookieValue);
    if (cached != null) {
      return cached;
    }

    UserIdentity identity = coreServiceClient.getUserMe(cookieValue);
    identityCache.put(cookieValue, identity);
    return identity;
  }

  private UserIdentity parseHeaderIdentity(HttpServletRequest request, String userId) {
    String email = request.getHeader("X-User-Email");
    String rolesHeader = request.getHeader("X-User-Roles");
    String csiHeader = request.getHeader("X-User-Csi-Ownership");

    List<String> roles =
        rolesHeader != null && !rolesHeader.isBlank()
            ? Arrays.asList(rolesHeader.split(","))
            : List.of();

    List<CsiOwnershipEntry> csiOwnership = List.of();
    if (csiHeader != null && !csiHeader.isBlank()) {
      csiOwnership =
          Arrays.stream(csiHeader.split(","))
              .map(
                  entry -> {
                    String[] parts = entry.split(":");
                    return new CsiOwnershipEntry(
                        parts[0].trim(), parts.length > 1 ? parts[1].trim() : "viewer");
                  })
              .toList();
    }

    return new UserIdentity(
        userId.trim(),
        email != null ? email.trim() : userId.trim(),
        userId.trim(),
        null,
        roles,
        csiOwnership);
  }

  private String extractSessionCookie(HttpServletRequest request) {
    if (request.getCookies() == null) {
      return null;
    }
    return Arrays.stream(request.getCookies())
        .filter(c -> COOKIE_NAME.equals(c.getName()))
        .map(Cookie::getValue)
        .findFirst()
        .orElse(null);
  }

  private String resolveTraceId(HttpServletRequest request) {
    String traceId = request.getHeader("X-B3-TraceId");
    if (traceId != null && !traceId.isBlank()) {
      return traceId;
    }
    traceId = request.getHeader("traceparent");
    if (traceId != null && !traceId.isBlank()) {
      return traceId;
    }
    return UUID.randomUUID().toString().replace("-", "");
  }

  private void writeError(
      HttpServletResponse response, int status, String code, String message, String traceId)
      throws IOException {
    response.setStatus(status);
    response.setContentType(MediaType.APPLICATION_JSON_VALUE);
    objectMapper.writeValue(
        response.getWriter(),
        Map.of("error", Map.of("code", code, "message", message, "traceId", traceId)));
  }

  private void write503(HttpServletResponse response, String traceId) throws IOException {
    response.setStatus(503);
    response.setHeader("Retry-After", "5");
    response.setContentType(MediaType.APPLICATION_JSON_VALUE);
    objectMapper.writeValue(
        response.getWriter(),
        Map.of(
            "error",
            Map.of(
                "code", "AUTH_TEMPORARILY_UNAVAILABLE",
                "message", "Authentication service temporarily unavailable",
                "traceId", traceId)));
  }
}
