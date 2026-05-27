package com.citi.put.checks.users;

import com.citi.put.checks.security.UserIdentity;
import com.citi.put.checks.security.event.UserAuthenticatedEvent;
import com.github.benmanes.caffeine.cache.Cache;
import com.github.benmanes.caffeine.cache.Caffeine;
import java.util.concurrent.TimeUnit;
import org.springframework.context.event.EventListener;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Component;

@Component
public class RateLimitedProvisioningWrapper {

  private final UserProvisioningService provisioningService;
  private final Cache<String, Boolean> recentlyProvisioned;

  public RateLimitedProvisioningWrapper(UserProvisioningService provisioningService) {
    this.provisioningService = provisioningService;
    this.recentlyProvisioned =
        Caffeine.newBuilder().expireAfterWrite(30, TimeUnit.SECONDS).maximumSize(10_000).build();
  }

  @Async
  @EventListener
  public void onUserAuthenticated(UserAuthenticatedEvent event) {
    UserIdentity identity = event.identity();
    if (recentlyProvisioned.getIfPresent(identity.userId()) != null) {
      return;
    }
    provisioningService.provisionOrTouch(identity);
    recentlyProvisioned.put(identity.userId(), Boolean.TRUE);
  }
}
