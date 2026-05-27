package com.citi.put.checks.security;

import com.github.benmanes.caffeine.cache.Cache;
import jakarta.servlet.http.Cookie;
import jakarta.servlet.http.HttpServletRequest;
import java.util.Arrays;
import org.aspectj.lang.ProceedingJoinPoint;
import org.aspectj.lang.annotation.Around;
import org.aspectj.lang.annotation.Aspect;
import org.springframework.context.annotation.Profile;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Component;
import org.springframework.web.context.request.RequestContextHolder;
import org.springframework.web.context.request.ServletRequestAttributes;

@Aspect
@Component
@Profile("!worker")
public class PermissionAspect {

  private final CoreServiceClient coreServiceClient;
  private final Cache<String, Boolean> permissionCache;

  public PermissionAspect(
      CoreServiceClient coreServiceClient, Cache<String, Boolean> permissionCache) {
    this.coreServiceClient = coreServiceClient;
    this.permissionCache = permissionCache;
  }

  @Around("@annotation(requiresPermission)")
  public Object checkPermission(
      ProceedingJoinPoint joinPoint, RequiresPermission requiresPermission) throws Throwable {
    Authentication auth = SecurityContextHolder.getContext().getAuthentication();
    if (!(auth instanceof BffAuthenticationToken bff)) {
      throw new AccessDeniedException("Not authenticated");
    }

    String userId = bff.getPrincipal().userId();
    String permission = requiresPermission.value();
    String cacheKey = userId + ":" + permission;

    Boolean allowed = permissionCache.getIfPresent(cacheKey);
    if (allowed == null) {
      String cookieValue = extractSessionCookie();
      allowed = coreServiceClient.checkPermission(cookieValue, permission);
      permissionCache.put(cacheKey, allowed);
    }

    if (!allowed) {
      throw new AccessDeniedException("Permission denied: " + permission);
    }

    return joinPoint.proceed();
  }

  private String extractSessionCookie() {
    ServletRequestAttributes attrs =
        (ServletRequestAttributes) RequestContextHolder.getRequestAttributes();
    if (attrs == null) {
      return "";
    }
    HttpServletRequest request = attrs.getRequest();
    if (request.getCookies() == null) {
      return "";
    }
    return Arrays.stream(request.getCookies())
        .filter(c -> "put_session".equals(c.getName()))
        .map(Cookie::getValue)
        .findFirst()
        .orElse("");
  }
}
