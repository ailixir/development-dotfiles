package com.citi.put.checks.config;

import static org.assertj.core.api.Assertions.assertThat;

import com.citi.put.checks.security.BffAuthenticationToken;
import com.citi.put.checks.security.UserIdentity;
import java.util.List;
import java.util.concurrent.CompletableFuture;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.core.task.AsyncTaskExecutor;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.test.context.ActiveProfiles;

@SpringBootTest
@ActiveProfiles("local")
class SecurityContextPropagationIT {

  @Autowired
  @Qualifier("applicationTaskExecutor")
  AsyncTaskExecutor executor;

  @Test
  void securityContextPropagatesAcrossAsyncBoundary() throws Exception {
    UserIdentity identity =
        new UserIdentity(
            "sec-test", "sec@citi.com", "Sec User", "Ops", List.of("operator"), List.of());
    SecurityContextHolder.getContext().setAuthentication(new BffAuthenticationToken(identity));

    CompletableFuture<Authentication> result = new CompletableFuture<>();
    executor.execute(() -> result.complete(SecurityContextHolder.getContext().getAuthentication()));

    Authentication auth = result.get();
    assertThat(auth).isNotNull();
    assertThat(auth).isInstanceOf(BffAuthenticationToken.class);
    assertThat(((BffAuthenticationToken) auth).getPrincipal().userId()).isEqualTo("sec-test");

    SecurityContextHolder.clearContext();
  }
}
