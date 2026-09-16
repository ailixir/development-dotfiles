package com.citi.put.checks.security;

import com.citi.put.checks.config.IdentityBypassProperties;
import com.citi.put.checks.security.event.UserAuthenticatedEvent;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.github.benmanes.caffeine.cache.Cache;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.Cookie;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.slf4j.MDC;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.http.MediaType;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.filter.OncePerRequestFilter;

public class BffSessionAuthenticationFilter extends OncePerRequestFilter {

  private static final String COOKIE_NAME = "put_session";
  private static final UserIdentity CORE_SERVICE_BYPASS_IDENTITY =
      new UserIdentity(
          "platform-bypass",
          "platform-bypass@citi.com",
          "Platform Bypass User",
          "Platform Migration",
          List.of("checks-admin", "platform-admin"),
          List.of());

  private final CoreServiceClient coreServiceClient;
  private final Cache<String, UserIdentity> identityCache;
  private final ApplicationEventPublisher eventPublisher;
  private final ObjectMapper objectMapper;

  /**
   * The three ED-02 bypasses, all default-closed (story 10.18b AC-19a).
   *
   * <p>Injected rather than read from a static: the watch in {@code BffSessionBypassClosureTest}
   * drives <em>this</em> production class under both values of each flag, so a flag that stopped
   * discriminating — a restored {@code return true}, a header path that ignores its property —
   * reddens against the production symbol and not against a test-local stand-in.
   */
  private final IdentityBypassProperties bypass;

  public BffSessionAuthenticationFilter(
      CoreServiceClient coreServiceClient,
      Cache<String, UserIdentity> identityCache,
      ApplicationEventPublisher eventPublisher,
      ObjectMapper objectMapper,
      IdentityBypassProperties bypass) {
    this.coreServiceClient = coreServiceClient;
    this.identityCache = identityCache;
    this.eventPublisher = eventPublisher;
    this.objectMapper = objectMapper;
    this.bypass = bypass;
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

    // If a prior filter (e.g. LocalDevAuthFilter) already set our identity, skip resolution.
    Authentication existingAuthentication = SecurityContextHolder.getContext().getAuthentication();
    if (existingAuthentication instanceof BffAuthenticationToken
        && existingAuthentication.isAuthenticated()) {
      chain.doFilter(request, response);
      return;
    }

    String traceId = resolveTraceId(request);
    MDC.put("traceId", traceId);

    try {
      UserIdentity identity = resolveIdentity(request);
      identity = applyTemporaryCsiReadBypass(request, identity);

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
    // ED-02, path 2 of 3, and the order is the point: this is checked BEFORE the Core-service
    // bypass below, so closing that one alone closes nothing at all for a caller that sends a
    // header. Architecture §9.1 assigns stripping these headers to a trusted gateway, and this
    // repository contains no such gateway — so with `identityHeaders` closed the application
    // refuses a direct caller its own identity rather than trusting it.
    if (areIdentityHeadersTrusted()) {
      String xUserId = request.getHeader("X-User-Id");
      if (xUserId != null && !xUserId.isBlank()) {
        return parseHeaderIdentity(request, xUserId);
      }
    }

    if (isCoreServiceBypassed()) {
      return CORE_SERVICE_BYPASS_IDENTITY;
    }

    return resolveCoreSessionIdentity(request);
  }

  /**
   * ED-02, path 1 of 3 — the bypass the manifest names.
   *
   * <p>This method used to be {@code return true}, unconditionally, which made a 401 unreachable on
   * every route in the product. It is now a property whose default is {@code false}. The code path
   * survives on @po's wave-6 ruling (removal moves identity resolution onto {@code
   * CoreServiceClient}, which the target platform does not provide); its <em>absence from the
   * deployed profile</em> is what story 10.18b delivers, and this method is what the watch is
   * pinned to.
   */
  private boolean isCoreServiceBypassed() {
    return bypass.coreService();
  }

  /** ED-02, path 2 of 3. See {@link #resolveIdentity}. */
  private boolean areIdentityHeadersTrusted() {
    return bypass.identityHeaders();
  }

  private UserIdentity resolveCoreSessionIdentity(HttpServletRequest request) {
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

  private UserIdentity applyTemporaryCsiReadBypass(
      HttpServletRequest request, UserIdentity identity) {
    if (!isTemporaryCsiReadBypass(request) || identity.roles().contains("checks-admin")) {
      return identity;
    }

    // TODO: Remove this read-only CSI bypass after real CSI ownership is wired into Core.
    List<String> roles = new ArrayList<>(identity.roles());
    roles.add("checks-admin");
    return new UserIdentity(
        identity.userId(),
        identity.email(),
        identity.name(),
        identity.department(),
        roles,
        identity.csiOwnership());
  }

  /** ED-02, path 3 of 3: {@code checks-admin} appended to any GET under /api/v1/csi. */
  private boolean isTemporaryCsiReadBypass(HttpServletRequest request) {
    if (!bypass.csiRead()) {
      return false;
    }
    String uri = request.getRequestURI();
    return "GET".equalsIgnoreCase(request.getMethod())
        && ("/api/v1/csi".equals(uri) || uri.startsWith("/api/v1/csi/"));
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
